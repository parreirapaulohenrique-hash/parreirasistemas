/**
 * ==============================================================================
 * CARRIER-SWITCH.JS - Módulo de Análise de Troca de Transportadora (v3.24.2)
 * ==============================================================================
 * Permite à gestão logística comparar o Custo Total Real da operação (TCO),
 * considerando:
 *   - Frete Peso Base (mínimo e percentual sobre NF)
 *   - Custo por Peso Excedente
 *   - Taxas Extras (GRIS, Ad Valorem, TDA, Taxa por Volume, Pedágio)
 *   - Redespacho Obrigatório discriminado separadamente (Anterior e Sugerida)
 *   - Coluna de Transportadora Sugerida SELECIONÁVEL em tempo real por linha
 *   - Prazo de Entrega (Lead Time / Variação de dias)
 * 
 * Funcionalidades:
 *   - Visão Macro: KPIs de Economia Total, Gastos Adicionais, Saldo Líquido e Prazo.
 *   - Visão Meso: Tabela compactada por Cliente, Cidade e Rota com Select de Transportadora.
 *   - Visão Micro (Drill-Down): Auditoria despacho a despacho / NF a NF.
 *   - Exportação em Excel (Resumo e Completo).
 * ==============================================================================
 */

window.CarrierSwitchModule = (function () {
    'use strict';

    const state = {
        dispatches: [],
        freightRules: [],
        carrierConfigs: {},
        carrierList: [],
        clients: [],
        groupedResults: [],
        filteredGroups: [],
        summary: {
            totalEconomia: 0,
            totalGasto: 0,
            saldoFinal: 0,
            rotasAnalisadas: 0,
            rotasEconomia: 0,
            rotasGasto: 0,
            rotasComRedespacho: 0,
            prazoDiffMedio: 0
        },
        currentFilterTag: 'all', // 'all', 'economia', 'gasto', 'redespacho'
        selectedGroup: null,
        initialized: false
    };

    // Helper de normalização de strings para matching de cidades/transportadoras
    function normStr(str) {
        if (!str) return '';
        return String(str)
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toUpperCase()
            .trim()
            .replace(/\s+/g, ' ');
    }

    // Parse numérico seguro
    function parseNum(val, fallback = 0) {
        if (val == null) return fallback;
        if (typeof val === 'number') return isNaN(val) ? fallback : val;
        const str = String(val).replace(/[^\d,.-]/g, '').replace(',', '.');
        const n = parseFloat(str);
        return isNaN(n) ? fallback : n;
    }

    // Formatação monetária BRL
    function formatBRL(val) {
        return (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    // Formatação de data brasileira (DD/MM/AAAA)
    function formatDateBR(dateStr) {
        if (!dateStr) return '-';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return String(dateStr).split('T')[0];
            return d.toLocaleDateString('pt-BR');
        } catch (e) {
            return String(dateStr);
        }
    }

    // Extrai número de dias do lead time (ex: "3 a 5 dias", "D+4", "48h")
    function parseLeadTimeDays(leadTime) {
        if (!leadTime || leadTime === '-') return 0;
        const s = String(leadTime).toLowerCase();
        if (s.includes('h')) {
            const h = parseInt(s.replace(/\D/g, '')) || 24;
            return Math.ceil(h / 24);
        }
        const matches = s.match(/\d+/g);
        if (matches && matches.length > 0) {
            const nums = matches.map(Number);
            return nums.reduce((a, b) => a + b, 0) / nums.length;
        }
        return 0;
    }

    // Retorna todas as transportadoras que atendem a cidade (direto ou com redespacho)
    function getCarriersForCity(city) {
        if (!city || city === '-') return [];
        const targetCityNorm = normStr(city);
        const map = new Map();

        (state.freightRules || []).forEach(r => {
            const cName = String(r.transportadora || '').trim().toUpperCase();
            if (!cName || cName === 'FOB') return;

            const rCity = normStr(r.cidade);
            const rRedespCity = normStr(r.cidadeRedespacho || '');
            const hasRedesp = Boolean(r.redespacho && r.redespacho !== '-' && String(r.redespacho).trim() !== '');

            let matches = false;
            if (rCity && rCity === targetCityNorm) {
                matches = true;
            } else if (rRedespCity && rRedespCity === targetCityNorm) {
                matches = true;
            } else if (targetCityNorm && rCity && (targetCityNorm.includes(rCity) || rCity.includes(targetCityNorm))) {
                matches = true;
            }

            if (matches) {
                const redespName = hasRedesp ? String(r.redespacho).trim().toUpperCase() : null;
                if (!map.has(cName)) {
                    map.set(cName, {
                        name: cName,
                        hasRedespacho: hasRedesp,
                        redespCarrier: redespName
                    });
                } else if (hasRedesp && !map.get(cName).hasRedespacho) {
                    map.get(cName).hasRedespacho = true;
                    map.get(cName).redespCarrier = redespName;
                }
            }
        });

        let list = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
        if (list.length === 0) {
            // Fallback se não houver regra específica cadastrada no momento
            const allCarriers = [...new Set(state.freightRules.map(r => String(r.transportadora || '').trim().toUpperCase()))].filter(c => c && c !== 'FOB').sort();
            list = allCarriers.map(c => ({ name: c, hasRedespacho: false, redespCarrier: null }));
        }
        return list;
    }

    // Inicialização do módulo
    async function init() {
        console.log('🔄 [CarrierSwitch] Inicializando módulo de Análise de Troca...');

        // 1. Carrega dados de apoio
        state.freightRules = Utils.getStorage('freight_tables') || [];
        state.carrierConfigs = Utils.getStorage('carrier_configs') || {};
        state.carrierList = Utils.getStorage('carrier_list') || [];
        state.clients = Utils.getStorage('clients') || [];

        // 2. Carrega histórico de despachos (Nuvem Firestore + Cache Local)
        let rawDispatches = [];
        try {
            if (window.Utils && Utils.Cloud && typeof Utils.Cloud.getFullDispatchesHistory === 'function') {
                rawDispatches = await Utils.Cloud.getFullDispatchesHistory();
            } else {
                rawDispatches = Utils.getStorage('dispatches') || [];
            }
        } catch (e) {
            console.warn('[CarrierSwitch] Erro ao buscar da nuvem, usando cache local:', e);
            rawDispatches = Utils.getStorage('dispatches') || [];
        }

        // Filtra apenas despachos válidos (não cancelados/excluídos)
        state.dispatches = (rawDispatches || []).filter(d => {
            if (!d) return false;
            const st = (d.status || '').toLowerCase();
            return !['cancelado', 'excluido', 'estornado'].includes(st);
        });

        console.log(`📦 [CarrierSwitch] ${state.dispatches.length} despachos elegíveis carregados.`);

        // 3. Popula os seletores de filtro da tela
        populateFilterSelectors();

        // 4. Define datas padrão (últimos 60 dias para dar boa amostra estatística)
        setupDefaultDates();

        // 5. Executa a primeira análise
        runAnalysis();

        state.initialized = true;
    }

    // Define datas padrão nos inputs de filtro
    function setupDefaultDates() {
        const inputInicio = document.getElementById('switchFilterDataInicio');
        const inputFim = document.getElementById('switchFilterDataFim');
        if (!inputInicio || !inputFim) return;

        if (!inputInicio.value || !inputFim.value) {
            const hoje = new Date();
            const sessentaDiasAtras = new Date();
            sessentaDiasAtras.setDate(hoje.getDate() - 60);

            inputFim.value = hoje.toISOString().split('T')[0];
            inputInicio.value = sessentaDiasAtras.toISOString().split('T')[0];
        }
    }

    // Popula seletores de Cliente, Município, Transportadora Atual e Sugerida
    function populateFilterSelectors() {
        const clientSel = document.getElementById('switchFilterCliente');
        const citySel = document.getElementById('switchFilterCidade');
        const currentCarrierSel = document.getElementById('switchFilterCarrierAtual');
        const targetCarrierSel = document.getElementById('switchFilterCarrierNovo');

        // Clientes únicos do histórico
        const uniqueClients = [...new Set(state.dispatches.map(d => (d.client || '').trim()).filter(Boolean))].sort();
        if (clientSel) {
            const currentVal = clientSel.value;
            clientSel.innerHTML = '<option value="">Todos os Clientes</option>' +
                uniqueClients.map(c => `<option value="${c}">${c}</option>`).join('');
            if (currentVal) clientSel.value = currentVal;
        }

        // Cidades únicas do histórico e regras
        const dispatchesCities = state.dispatches.map(d => (d.city || '').trim()).filter(c => c && c !== '-');
        const rulesCities = state.freightRules.map(r => (r.cidade || '').trim()).filter(Boolean);
        const uniqueCities = [...new Set([...dispatchesCities, ...rulesCities])].sort();
        if (citySel) {
            const currentVal = citySel.value;
            citySel.innerHTML = '<option value="">Todos os Municípios</option>' +
                uniqueCities.map(c => `<option value="${c}">${c}</option>`).join('');
            if (currentVal) citySel.value = currentVal;
        }

        // Transportadoras Atuais únicas dos despachos
        const uniqueCurrentCarriers = [...new Set(state.dispatches.map(d => (d.carrier || '').trim().toUpperCase()).filter(Boolean))].sort();
        if (currentCarrierSel) {
            const currentVal = currentCarrierSel.value;
            currentCarrierSel.innerHTML = '<option value="">Todas as Transportadoras</option>' +
                uniqueCurrentCarriers.map(c => `<option value="${c}">${c}</option>`).join('');
            if (currentVal) currentCarrierSel.value = currentVal;
        }

        // Transportadoras Sugeridas (Candidatas à simulação global)
        const carriersFromList = (state.carrierList || []).map(c => String(c).trim().toUpperCase());
        const carriersFromRules = (state.freightRules || []).map(r => String(r.transportadora || '').trim().toUpperCase());
        const allCandidateCarriers = [...new Set([...carriersFromList, ...carriersFromRules])].filter(c => c && c !== 'FOB').sort();

        if (targetCarrierSel) {
            const currentVal = targetCarrierSel.value;
            targetCarrierSel.innerHTML = `
                <option value="__AUTO__">⭐ Melhor Opção Automática (Mais Econômica)</option>
                ${allCandidateCarriers.map(c => `<option value="${c}">${c}</option>`).join('')}
            `;
            if (currentVal) targetCarrierSel.value = currentVal;
        }
    }

    /**
     * Motor de Cálculo de Cotação Reversa (Re-Rating):
     * Simula com exatidão o custo que um despacho histórico teria tido
     * em uma transportadora candidata com base nas regras de tabela e configurações.
     */
    function calculateCostForCarrier(dispatch, candidateCarrierName) {
        const nfValue = parseNum(dispatch.nfValue || dispatch.valorNF || dispatch.value, 0);
        const weight = parseNum(dispatch.weight || dispatch.peso, 0);
        const volume = Math.max(1, parseInt(dispatch.volume || dispatch.volumes) || 1);
        const targetCity = normStr(dispatch.city);
        const targetBairro = normStr(dispatch.neighborhood);
        const targetCarrierNorm = normStr(candidateCarrierName);

        // Busca regras da transportadora candidata para o município/bairro
        const matchingRules = state.freightRules.filter(r => {
            if (normStr(r.transportadora) !== targetCarrierNorm) return false;
            const rCity = normStr(r.cidade);
            if (!rCity) return false;

            if (rCity === targetCity) return true;
            // Checagem parcial de cidades compostas
            if (targetCity && (targetCity.includes(rCity) || rCity.includes(targetCity))) return true;
            return false;
        });

        if (matchingRules.length === 0) {
            return null; // Transportadora não atende esta rota
        }

        // Seleciona a melhor regra para a cidade (prioriza bairro se especificado)
        let rule = matchingRules[0];
        if (targetBairro) {
            const bairroMatch = matchingRules.find(r => normStr(r.bairro) === targetBairro);
            if (bairroMatch) rule = bairroMatch;
        }

        const config = state.carrierConfigs[candidateCarrierName] ||
            state.carrierConfigs[targetCarrierNorm] ||
            { taxaFixa: 0, gris: 0, icms: 0, valorVolume: 0 };

        // 1. Frete Base (% sobre NF respeitando frete mínimo)
        let baseVal = nfValue * ((rule.percentual || 0) / 100);
        const isComplement = dispatch.isComplement === true || String(dispatch.isComplement) === 'sim';
        if (!isComplement && rule.minimo && baseVal < rule.minimo) {
            baseVal = rule.minimo;
        }

        // 2. Taxa TDA + Taxa por Volume (Pedágio)
        const taxaTDA = (rule.taxaTDA != null) ? (rule.taxaTDA || 0)
            : (rule.taxaFixaPorVolume ? 0 : (rule.pedagio || 0));
        const taxaVolume = (rule.taxaVolume != null) ? (rule.taxaVolume || 0)
            : (rule.taxaFixaPorVolume ? (rule.pedagio || 0) : 0);
        let tollVal = taxaTDA + (taxaVolume * volume);

        // 3. Peso Excedente
        let excessCost = 0;
        if (rule.limitePeso > 0 && weight > rule.limitePeso) {
            const excessKg = weight - rule.limitePeso;
            excessCost = excessKg * (rule.valorExcedente || 0);
        }

        // 4. Custo de Volume Global
        let volumeCost = 0;
        if (volume >= 1 && config.valorVolume > 0) {
            volumeCost = volume * config.valorVolume;
        }

        // 5. GRIS / Ad Valorem
        const grisVal = nfValue * ((config.gris || 0) / 100);

        // 6. Redespacho
        let redispatchCost = 0;
        let redespCarrierName = null;

        if (rule.redespacho && rule.redespacho !== '-' && String(rule.redespacho).trim() !== '') {
            redespCarrierName = String(rule.redespacho).trim().toUpperCase();
            let shouldChargeRedesp = true;

            const rRedespCity = normStr(rule.cidadeRedespacho || '');
            if (rRedespCity) {
                shouldChargeRedesp = (rRedespCity === targetCity) || (targetBairro && rRedespCity === targetBairro);
            }

            if (shouldChargeRedesp) {
                // Ad Valorem do Redespacho
                let rValPercent = 0;
                if (rule.percentualRedespacho > 0) {
                    rValPercent = nfValue * (rule.percentualRedespacho / 100);
                }

                // Volume do Redespacho
                let rValVol = 0;
                const redespConfig = state.carrierConfigs[rule.redespacho] || state.carrierConfigs[redespCarrierName] || {};
                if (redespConfig.valorVolume > 0 && volume >= 1) {
                    rValVol = volume * redespConfig.valorVolume;
                }

                let isRedespVolumeCost = false;
                if ((taxaVolume > 0 || taxaTDA > 0) && (!rule.percentualRedespacho || rule.percentualRedespacho === 0)) {
                    rValVol = Math.max(rValVol, tollVal);
                    isRedespVolumeCost = true;
                }

                let rVal = Math.max(rValPercent, rValVol);
                const rMin = rule.minimoRedespacho || 0;
                if (rVal < rMin) rVal = rMin;

                redispatchCost = rVal;
                if (isRedespVolumeCost) tollVal = 0;
            }
        }

        const taxaFixa = config.taxaFixa || 0;
        const subtotal = baseVal + taxaFixa + grisVal + excessCost + tollVal + volumeCost + redispatchCost;

        // 7. ICMS (cálculo por dentro se configurado)
        const factor = 1 - ((config.icms || 0) / 100);
        const total = factor > 0 ? (subtotal / factor) : subtotal;

        return {
            carrier: candidateCarrierName,
            total: total,
            base: baseVal,
            excess: excessCost,
            toll: tollVal,
            gris: grisVal,
            fixed: taxaFixa,
            volumeCost: volumeCost,
            redispatch: redispatchCost,
            redespCarrier: redespCarrierName,
            leadTime: rule.leadTime || '-',
            leadTimeDays: parseLeadTimeDays(rule.leadTime),
            ruleUsed: rule
        };
    }

    /**
     * Simulação Completa de um Despacho para uma Transportadora Sugerida:
     * Separa Frete Principal e Redespacho Obrigatório da Rota com total transparência.
     */
    function simulateDispatchCost(d, candidateCarrierName) {
        const actualCost = parseNum(d.total || ((d.mainTotal || 0) + (d.redespTotal || 0)), 0);
        const actualCarrier = String(d.carrier || '').trim().toUpperCase();

        const redespachoAnterior = parseNum(d.redespTotal, 0);
        const redespCarrierAnterior = d.redespCarrier || (d.redespacho && d.redespacho !== '-' ? d.redespacho : null);
        const mainAnterior = d.mainTotal != null ? parseNum(d.mainTotal, 0) : Math.max(0, actualCost - redespachoAnterior);

        const sim = calculateCostForCarrier(d, candidateCarrierName);
        if (!sim) return null;

        // Frete da transportadora principal sugerida
        const mainNovo = sim.total - (sim.redispatch || 0);

        // Tratamento do Redespacho na Sugerida:
        // Se a transportadora sugerida possui redespacho calculado na regra, usa ele.
        // Se o despacho original já teve redespacho obrigatório na rota (ex: Breves/embarcação marítima),
        // preserva o redespacho da rota, pois apenas a transportadora principal é alterada!
        let redespachoNovo = 0;
        let redespCarrierNovo = null;

        if (sim.redispatch > 0) {
            redespachoNovo = sim.redispatch;
            redespCarrierNovo = sim.redespCarrier || redespCarrierAnterior || 'EMBARQ';
        } else if (redespachoAnterior > 0) {
            redespachoNovo = redespachoAnterior;
            redespCarrierNovo = redespCarrierAnterior || 'EMBARQ';
        }

        const custoNovo = mainNovo + redespachoNovo;
        const diferenca = actualCost - custoNovo; // Positivo = Economia, Negativo = Gasto adicional
        const diferencaPerc = actualCost > 0 ? ((actualCost - custoNovo) / actualCost) * 100 : 0;

        const leadTimeDaysAnterior = parseLeadTimeDays(d.leadTime || '-');
        const diffDiasPrazo = sim.leadTimeDays - leadTimeDaysAnterior;

        const valorNF = parseNum(d.nfValue || d.valorNF || d.value, 0);
        const percentualTabelaNovo = sim.ruleUsed ? parseNum(sim.ruleUsed.percentual, 0) : 0;
        const percentualEfetivoNovo = valorNF > 0 ? (custoNovo / valorNF) * 100 : 0;

        return {
            carrierNovo: candidateCarrierName,
            custoNovo: custoNovo,
            mainNovo: mainNovo,
            redespachoNovo: redespachoNovo,
            redespCarrierNovo: redespCarrierNovo,
            baseNovo: sim.base,
            excessoNovo: sim.excess,
            taxasNovo: sim.toll + sim.gris + sim.fixed,
            leadTimeNovo: sim.leadTime,
            leadTimeDaysNovo: sim.leadTimeDays,
            percentualTabelaNovo: percentualTabelaNovo,
            percentualEfetivoNovo: percentualEfetivoNovo,
            diferenca: diferenca,
            diferencaPerc: diferencaPerc,
            diffDiasPrazo: diffDiasPrazo,
            hasRedespachoNovo: redespachoNovo > 0,
            simRaw: sim
        };
    }

    /**
     * Executa a análise comparativa de troca de transportadora
     */
    function runAnalysis() {
        const inputInicio = document.getElementById('switchFilterDataInicio');
        const inputFim = document.getElementById('switchFilterDataFim');
        const clientSel = document.getElementById('switchFilterCliente');
        const citySel = document.getElementById('switchFilterCidade');
        const currentCarrierSel = document.getElementById('switchFilterCarrierAtual');
        const targetCarrierSel = document.getElementById('switchFilterCarrierNovo');

        const dataInicio = inputInicio ? inputInicio.value : '';
        const dataFim = inputFim ? inputFim.value : '';
        const filterClient = clientSel ? clientSel.value.trim() : '';
        const filterCity = citySel ? normStr(citySel.value) : '';
        const filterCarrierAtual = currentCarrierSel ? normStr(currentCarrierSel.value) : '';
        const filterCarrierNovo = targetCarrierSel ? targetCarrierSel.value.trim() : '__AUTO__';

        console.log('🔍 [CarrierSwitch] Filtrando despachos:', { dataInicio, dataFim, filterClient, filterCity, filterCarrierAtual, filterCarrierNovo });

        // 1. Filtra os despachos históricos elegíveis
        const filteredDispatches = state.dispatches.filter(d => {
            if (!d) return false;

            // Filtro por data
            const dispatchDateStr = (d.date || d.data || '').split('T')[0];
            if (dataInicio && dispatchDateStr && dispatchDateStr < dataInicio) return false;
            if (dataFim && dispatchDateStr && dispatchDateStr > dataFim) return false;

            // Filtro por Cliente
            if (filterClient && (d.client || '').trim() !== filterClient) return false;

            // Filtro por Cidade
            if (filterCity && normStr(d.city) !== filterCity) return false;

            // Filtro por Transportadora Atual
            if (filterCarrierAtual && normStr(d.carrier) !== filterCarrierAtual) return false;

            // Deve ter custo e transportadora informados
            const cost = parseNum(d.total || d.mainTotal || d.freightCost || d.valor, 0);
            if (cost <= 0) return false;

            return true;
        });

        console.log(`📊 [CarrierSwitch] ${filteredDispatches.length} despachos passaram pelos filtros.`);

        // 2. Simula o custo de cada despacho na transportadora candidata
        const allCandidateCarriers = [...new Set(state.freightRules.map(r => String(r.transportadora || '').trim().toUpperCase()))].filter(c => c && c !== 'FOB');

        const simulatedDispatches = [];

        filteredDispatches.forEach(d => {
            const actualCost = parseNum(d.total || ((d.mainTotal || 0) + (d.redespTotal || 0)), 0);
            const actualCarrier = String(d.carrier || '').trim().toUpperCase();

            // Decomposição dos custos do despacho anterior
            const redespachoAnterior = parseNum(d.redespTotal, 0);
            const redespCarrierAnterior = d.redespCarrier || (d.redespacho && d.redespacho !== '-' ? d.redespacho : null);
            const mainAnterior = d.mainTotal != null ? parseNum(d.mainTotal, 0) : Math.max(0, actualCost - redespachoAnterior);

            const baseAnterior = parseNum(d.baseCalculada, 0) || (mainAnterior - parseNum(d.excessoCalculado, 0) - parseNum(d.pedagio, 0) - parseNum(d.gris, 0));
            const excessoAnterior = parseNum(d.excessoCalculado, 0);
            const taxasAnteriores = parseNum(d.pedagio, 0) + parseNum(d.gris, 0) + parseNum(d.taxaFixa, 0);
            const leadTimeAnterior = d.leadTime || '-';
            const leadTimeDaysAnterior = parseLeadTimeDays(leadTimeAnterior);

            let bestSimData = null;

            if (filterCarrierNovo !== '__AUTO__') {
                bestSimData = simulateDispatchCost(d, filterCarrierNovo);
            } else {
                // Modo automático: testa as transportadoras que cobrem a rota e escolhe o menor custo total
                let lowestCost = Infinity;
                allCandidateCarriers.forEach(cand => {
                    if (cand === actualCarrier) return;
                    const sim = simulateDispatchCost(d, cand);
                    if (sim && sim.custoNovo > 0 && sim.custoNovo < lowestCost) {
                        lowestCost = sim.custoNovo;
                        bestSimData = sim;
                    }
                });
            }

            // Se não encontrou cobertura, pula o despacho
            if (!bestSimData) return;

            // Percentual da transportadora anterior
            const antRule = state.freightRules.find(r =>
                normStr(r.transportadora) === normStr(actualCarrier) &&
                (normStr(r.cidade) === normStr(d.city) || (d.city && (normStr(d.city).includes(normStr(r.cidade)) || normStr(r.cidade).includes(normStr(d.city)))))
            );
            const percentualTabelaAnterior = parseNum(d.percentual, 0) || (antRule ? parseNum(antRule.percentual, 0) : 0) || (d.nfValue > 0 ? (baseAnterior / d.nfValue) * 100 : 0);

            const valorNF = parseNum(d.nfValue || d.valorNF || d.value, 0);
            const percentualEfetivoAnterior = valorNF > 0 ? (actualCost / valorNF) * 100 : 0;

            simulatedDispatches.push({
                raw: d,
                cliente: (d.client && d.client !== 'undefined') ? d.client : 'Consumidor',
                cidade: d.city || '-',
                bairro: d.neighborhood || '-',
                data: (d.date || d.data || '').split('T')[0],
                nf: d.invoice || d.invoiceNumber || d.nf || 'S/N',
                peso: parseNum(d.weight || d.peso, 0),
                volume: Math.max(1, parseInt(d.volume || d.volumes) || 1),
                valorNF: valorNF,

                // Anterior
                carrierAnterior: actualCarrier,
                custoAnterior: actualCost,
                mainAnterior: mainAnterior,
                baseAnterior: Math.max(0, baseAnterior),
                excessoAnterior: excessoAnterior,
                taxasAnteriores: Math.max(0, taxasAnteriores),
                redespachoAnterior: redespachoAnterior,
                redespCarrierAnterior: redespCarrierAnterior,
                leadTimeAnterior: leadTimeAnterior,
                leadTimeDaysAnterior: leadTimeDaysAnterior,
                percentualTabelaAnterior: percentualTabelaAnterior,
                percentualEfetivoAnterior: percentualEfetivoAnterior,

                // Sugerido
                carrierNovo: bestSimData.carrierNovo,
                custoNovo: bestSimData.custoNovo,
                mainNovo: bestSimData.mainNovo,
                baseNovo: bestSimData.baseNovo,
                excessoNovo: bestSimData.excessoNovo,
                taxasNovo: bestSimData.taxasNovo,
                redespachoNovo: bestSimData.redespachoNovo,
                redespCarrierNovo: bestSimData.redespCarrierNovo,
                leadTimeNovo: bestSimData.leadTimeNovo,
                leadTimeDaysNovo: bestSimData.leadTimeDaysNovo,
                percentualTabelaNovo: bestSimData.percentualTabelaNovo,
                percentualEfetivoNovo: bestSimData.percentualEfetivoNovo,

                // Diferenciais
                diferenca: bestSimData.diferenca,
                diferencaPerc: bestSimData.diferencaPerc,
                diffDiasPrazo: bestSimData.diffDiasPrazo,
                hasRedespachoNovo: bestSimData.hasRedespachoNovo
            });
        });

        // 3. Agrupa por Cliente + Cidade + Transportadora Anterior
        const groupsMap = new Map();

        simulatedDispatches.forEach(item => {
            const key = `${item.cliente}___${item.cidade}___${item.carrierAnterior}`;
            if (!groupsMap.has(key)) {
                groupsMap.set(key, {
                    key: key,
                    cliente: item.cliente,
                    cidade: item.cidade,
                    carrierAnterior: item.carrierAnterior,
                    carrierNovo: item.carrierNovo,
                    custoAnteriorTotal: 0,
                    mainAnteriorTotal: 0,
                    custoNovoTotal: 0,
                    mainNovoTotal: 0,
                    baseAnteriorTotal: 0,
                    baseNovoTotal: 0,
                    excessoAnteriorTotal: 0,
                    excessoNovoTotal: 0,
                    taxasAnterioresTotal: 0,
                    taxasNovoTotal: 0,
                    redespachoAnteriorTotal: 0,
                    redespachoNovoTotal: 0,
                    redespCarrierNovo: item.redespCarrierNovo,
                    redespCarrierAnterior: item.redespCarrierAnterior,
                    leadTimeAnterior: item.leadTimeAnterior,
                    leadTimeNovo: item.leadTimeNovo,
                    pesoTotal: 0,
                    volumesTotal: 0,
                    valorNFTotal: 0,
                    diffDiasPrazoTotal: 0,
                    percentualTabelaNovoTotal: 0,
                    percentualTabelaAnteriorTotal: 0,
                    dispatches: []
                });
            }

            const g = groupsMap.get(key);
            g.custoAnteriorTotal += item.custoAnterior;
            g.mainAnteriorTotal += item.mainAnterior;
            g.custoNovoTotal += item.custoNovo;
            g.mainNovoTotal += item.mainNovo;
            g.baseAnteriorTotal += item.baseAnterior;
            g.baseNovoTotal += item.baseNovo;
            g.excessoAnteriorTotal += item.excessoAnterior;
            g.excessoNovoTotal += item.excessoNovo;
            g.taxasAnterioresTotal += item.taxasAnteriores;
            g.taxasNovoTotal += item.taxasNovo;
            g.redespachoAnteriorTotal += item.redespachoAnterior;
            g.redespachoNovoTotal += item.redespachoNovo;
            g.pesoTotal += item.peso;
            g.volumesTotal += item.volume;
            g.valorNFTotal += item.valorNF;
            g.diffDiasPrazoTotal += item.diffDiasPrazo;
            g.percentualTabelaNovoTotal += item.percentualTabelaNovo;
            g.percentualTabelaAnteriorTotal += item.percentualTabelaAnterior;
            g.dispatches.push(item);
        });

        // Finaliza cálculos dos grupos
        state.groupedResults = Array.from(groupsMap.values()).map(g => {
            const count = g.dispatches.length;
            const diferencaTotal = g.custoAnteriorTotal - g.custoNovoTotal; // > 0 = Economia, < 0 = Gasto adicional
            const diferencaPerc = g.custoAnteriorTotal > 0 ? (diferencaTotal / g.custoAnteriorTotal) * 100 : 0;
            const diffDiasPrazoMedio = count > 0 ? (g.diffDiasPrazoTotal / count) : 0;
            const percentualTabelaNovo = count > 0 ? (g.percentualTabelaNovoTotal / count) : 0;
            const percentualTabelaAnterior = count > 0 ? (g.percentualTabelaAnteriorTotal / count) : 0;
            const percentualEfetivoNovo = g.valorNFTotal > 0 ? (g.custoNovoTotal / g.valorNFTotal) * 100 : 0;
            const percentualEfetivoAnterior = g.valorNFTotal > 0 ? (g.custoAnteriorTotal / g.valorNFTotal) * 100 : 0;

            return {
                ...g,
                count: count,
                diferencaTotal: diferencaTotal,
                diferencaPerc: diferencaPerc,
                diffDiasPrazoMedio: diffDiasPrazoMedio,
                percentualTabelaNovo: percentualTabelaNovo,
                percentualTabelaAnterior: percentualTabelaAnterior,
                percentualEfetivoNovo: percentualEfetivoNovo,
                percentualEfetivoAnterior: percentualEfetivoAnterior,
                isEconomia: diferencaTotal >= 0,
                hasRedespachoNovo: g.redespachoNovoTotal > 0
            };
        });

        // Ordena por maior impacto financeiro
        state.groupedResults.sort((a, b) => Math.abs(b.diferencaTotal) - Math.abs(a.diferencaTotal));

        // 4. Calcula KPIs do Topo
        recalculateKPIs();

        // 5. Aplica filtro de tag e renderiza na tela
        applyTagFilter(state.currentFilterTag || 'all');
    }

    // Recalcula KPIs consolidados do topo
    function recalculateKPIs() {
        let totalEconomia = 0;
        let totalGasto = 0;
        let rotasEconomia = 0;
        let rotasGasto = 0;
        let rotasComRedespacho = 0;
        let somaDiasPrazo = 0;

        state.groupedResults.forEach(g => {
            if (g.diferencaTotal >= 0) {
                totalEconomia += g.diferencaTotal;
                rotasEconomia++;
            } else {
                totalGasto += Math.abs(g.diferencaTotal);
                rotasGasto++;
            }
            if (g.hasRedespachoNovo) rotasComRedespacho++;
            somaDiasPrazo += g.diffDiasPrazoMedio;
        });

        state.summary = {
            totalEconomia: totalEconomia,
            totalGasto: totalGasto,
            saldoFinal: totalEconomia - totalGasto,
            rotasAnalisadas: state.groupedResults.length,
            rotasEconomia: rotasEconomia,
            rotasGasto: rotasGasto,
            rotasComRedespacho: rotasComRedespacho,
            prazoDiffMedio: state.groupedResults.length > 0 ? (somaDiasPrazo / state.groupedResults.length) : 0
        };
    }

    /**
     * Altera a Transportadora Sugerida diretamente na linha da tabela
     * Recalcula em tempo real os despachos, grupos e KPIs.
     */
    function changeRowCarrier(groupKey, newCarrier) {
        console.log('🔄 [CarrierSwitch] Alterando transportadora da linha:', { groupKey, newCarrier });
        const group = state.groupedResults.find(g => g.key === groupKey);
        if (!group) {
            console.warn('Grupo não encontrado:', groupKey);
            return;
        }

        group.carrierNovo = newCarrier;

        // Zera acumuladores da sugerida para este grupo
        group.custoNovoTotal = 0;
        group.mainNovoTotal = 0;
        group.redespachoNovoTotal = 0;
        group.baseNovoTotal = 0;
        group.excessoNovoTotal = 0;
        group.taxasNovoTotal = 0;
        group.diffDiasPrazoTotal = 0;
        group.percentualTabelaNovoTotal = 0;

        let lastRedespCarrier = null;
        let lastLeadTimeNovo = '-';

        group.dispatches.forEach(item => {
            const sim = simulateDispatchCost(item.raw, newCarrier);
            if (sim) {
                item.carrierNovo = newCarrier;
                item.custoNovo = sim.custoNovo;
                item.mainNovo = sim.mainNovo;
                item.redespachoNovo = sim.redespachoNovo;
                item.redespCarrierNovo = sim.redespCarrierNovo;
                item.baseNovo = sim.baseNovo;
                item.excessoNovo = sim.excessoNovo;
                item.taxasNovo = sim.taxasNovo;
                item.leadTimeNovo = sim.leadTimeNovo;
                item.leadTimeDaysNovo = sim.leadTimeDaysNovo;
                item.percentualTabelaNovo = sim.percentualTabelaNovo;
                item.percentualEfetivoNovo = sim.percentualEfetivoNovo;
                item.diferenca = sim.diferenca;
                item.diferencaPerc = sim.diferencaPerc;
                item.diffDiasPrazo = sim.diffDiasPrazo;
                item.hasRedespachoNovo = sim.hasRedespachoNovo;

                lastRedespCarrier = sim.redespCarrierNovo || lastRedespCarrier;
                lastLeadTimeNovo = sim.leadTimeNovo;
            }

            group.custoNovoTotal += item.custoNovo;
            group.mainNovoTotal += item.mainNovo;
            group.redespachoNovoTotal += item.redespachoNovo;
            group.baseNovoTotal += item.baseNovo;
            group.excessoNovoTotal += item.excessoNovo;
            group.taxasNovoTotal += item.taxasNovo;
            group.diffDiasPrazoTotal += item.diffDiasPrazo;
            group.percentualTabelaNovoTotal += item.percentualTabelaNovo;
        });

        const count = group.dispatches.length;
        group.redespCarrierNovo = lastRedespCarrier;
        group.leadTimeNovo = lastLeadTimeNovo;
        group.diferencaTotal = group.custoAnteriorTotal - group.custoNovoTotal;
        group.diferencaPerc = group.custoAnteriorTotal > 0 ? (group.diferencaTotal / group.custoAnteriorTotal) * 100 : 0;
        group.diffDiasPrazoMedio = count > 0 ? (group.diffDiasPrazoTotal / count) : 0;
        group.percentualTabelaNovo = count > 0 ? (group.percentualTabelaNovoTotal / count) : 0;
        group.percentualEfetivoNovo = group.valorNFTotal > 0 ? (group.custoNovoTotal / group.valorNFTotal) * 100 : 0;
        group.isEconomia = group.diferencaTotal >= 0;
        group.hasRedespachoNovo = group.redespachoNovoTotal > 0;

        // Recalcula KPIs consolidados
        recalculateKPIs();

        // Atualiza a visualização
        applyTagFilter(state.currentFilterTag || 'all');

        // Se o modal estiver aberto para esse grupo, atualiza o modal também
        if (state.selectedGroup && state.selectedGroup.key === group.key) {
            const idx = state.filteredGroups.findIndex(g => g.key === group.key);
            if (idx >= 0) openDetail(idx);
        }
    }

    // Filtra os grupos por clique nos KPIs do topo (Economia, Gasto, Redespacho ou Todos)
    function applyTagFilter(tag) {
        state.currentFilterTag = tag;

        // Atualiza estilo dos cards ativos
        const kpiCards = document.querySelectorAll('.switch-kpi-card');
        kpiCards.forEach(c => c.classList.remove('kpi-active'));
        const activeCard = document.getElementById(`kpiCard_${tag}`);
        if (activeCard) activeCard.classList.add('kpi-active');

        if (tag === 'economia') {
            state.filteredGroups = state.groupedResults.filter(g => g.isEconomia);
        } else if (tag === 'gasto') {
            state.filteredGroups = state.groupedResults.filter(g => !g.isEconomia);
        } else if (tag === 'redespacho') {
            state.filteredGroups = state.groupedResults.filter(g => g.hasRedespachoNovo);
        } else {
            state.filteredGroups = [...state.groupedResults];
        }

        renderKPIs();
        renderTable();
    }

    // Renderiza os Cards de KPI no topo
    function renderKPIs() {
        const s = state.summary;

        const elEconomia = document.getElementById('switchKpiEconomia');
        const elGasto = document.getElementById('switchKpiGasto');
        const elSaldo = document.getElementById('switchKpiSaldo');
        const elRotas = document.getElementById('switchKpiRotas');
        const elPrazo = document.getElementById('switchKpiPrazo');

        if (elEconomia) elEconomia.innerText = formatBRL(s.totalEconomia);
        if (elGasto) elGasto.innerText = formatBRL(s.totalGasto);

        if (elSaldo) {
            elSaldo.innerText = formatBRL(s.saldoFinal);
            if (s.saldoFinal >= 0) {
                elSaldo.style.color = '#10b981';
            } else {
                elSaldo.style.color = '#ef4444';
            }
        }

        if (elRotas) elRotas.innerText = s.rotasAnalisadas;

        if (elPrazo) {
            const d = s.prazoDiffMedio;
            if (Math.abs(d) < 0.1) {
                elPrazo.innerText = 'Prazo Neutro';
                elPrazo.style.color = '#94a3b8';
            } else if (d > 0) {
                elPrazo.innerText = `+${d.toFixed(1)} dias`;
                elPrazo.style.color = '#f59e0b';
            } else {
                elPrazo.innerText = `${d.toFixed(1)} dias`;
                elPrazo.style.color = '#10b981';
            }
        }

        // Subtítulos informativos
        const subSaldo = document.getElementById('switchKpiSaldoSub');
        if (subSaldo) {
            subSaldo.innerText = s.saldoFinal >= 0
                ? `Economia líquida de ${(s.totalEconomia > 0 ? ((s.saldoFinal / s.totalEconomia) * 100).toFixed(1) : 0)}% sobre ganhos`
                : 'Operação ficaria mais onerosa no período';
        }

        const subRotas = document.getElementById('switchKpiRotasSub');
        if (subRotas) {
            subRotas.innerText = `${s.rotasEconomia} vantajosas • ${s.rotasGasto} desfavoráveis`;
        }
    }

    // Renderiza a tabela principal compactada
    function renderTable() {
        const tbody = document.getElementById('switchTableBody');
        const countLabel = document.getElementById('switchRowCountLabel');
        if (!tbody) return;

        if (state.filteredGroups.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="11" style="text-align: center; padding: 3rem 1rem; color: var(--text-secondary);">
                        <span class="material-icons-round" style="font-size: 2.5rem; opacity: 0.3; display: block; margin-bottom: 0.5rem;">find_in_page</span>
                        Nenhum registro encontrado para os filtros selecionados.<br>
                        <small style="opacity: 0.7;">Tente ampliar o período ou alterar os filtros de cliente e município.</small>
                    </td>
                </tr>
            `;
            if (countLabel) countLabel.innerText = '0 registros encontrados';
            return;
        }

        if (countLabel) countLabel.innerText = `Exibindo ${state.filteredGroups.length} rotas analisadas`;

        let html = '';
        state.filteredGroups.forEach((g, index) => {
            const isEcon = g.isEconomia;
            const diffClass = isEcon ? 'color-success' : 'color-danger';
            const diffColor = isEcon ? '#10b981' : '#ef4444';
            const diffSignal = isEcon ? '-' : '+';

            // Transportadoras que atendem a cidade (inclusive com redespacho)
            const cityCarriers = getCarriersForCity(g.cidade);
            // Garante que a transportadora atual e sugerida estejam na lista
            const candidateNames = cityCarriers.map(c => c.name);
            if (!candidateNames.includes(g.carrierNovo)) {
                cityCarriers.push({ name: g.carrierNovo, hasRedespacho: g.hasRedespachoNovo, redespCarrier: g.redespCarrierNovo });
            }

            // Opções do Select
            const optionsHtml = cityCarriers.map(c => {
                const isSel = (c.name === g.carrierNovo);
                const tag = c.hasRedespacho ? ' (c/ Redesp.)' : '';
                return `<option value="${c.name}" ${isSel ? 'selected' : ''}>${c.name}${tag}</option>`;
            }).join('');

            // Badge de Redespacho
            let redespBadge = '';
            if (g.hasRedespachoNovo) {
                const rNome = g.redespCarrierNovo || 'Terceiro';
                redespBadge = `
                    <span style="
                        display: inline-flex; align-items: center; gap: 3px;
                        background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4);
                        color: #fde047; font-size: 0.68rem; font-weight: 700;
                        padding: 1px 6px; border-radius: 4px; margin-left: 6px;
                    " title="Frete com redespacho via ${rNome}">
                        🟨 ${rNome}
                    </span>
                `;
            }

            // Badge de Prazo
            let prazoBadge = '';
            const dPrazo = g.diffDiasPrazoMedio;
            if (Math.abs(dPrazo) < 0.2) {
                prazoBadge = `<span style="color: #94a3b8; font-size: 0.75rem;">Igual</span>`;
            } else if (dPrazo > 0) {
                prazoBadge = `<span style="color: #f59e0b; font-size: 0.75rem; font-weight: 600;">+${dPrazo.toFixed(0)}d (mais lento)</span>`;
            } else {
                prazoBadge = `<span style="color: #10b981; font-size: 0.75rem; font-weight: 600;">${dPrazo.toFixed(0)}d (mais rápido)</span>`;
            }

            // Chave codificada para segurança no onclick / onchange
            const safeKey = encodeURIComponent(g.key);

            html += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
                    <td>
                        <div style="font-weight: 600; color: #f8fafc; font-size: 0.82rem; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${g.cliente}">${g.cliente}</div>
                        <div style="font-size: 0.70rem; color: var(--text-secondary); margin-top: 1px;">
                            ${g.count} ${g.count === 1 ? 'despacho' : 'despachos'} • ${(g.pesoTotal).toFixed(0)} kg
                        </div>
                    </td>
                    <td style="color: #cbd5e1; font-size: 0.82rem;">${g.cidade}</td>
                    <td style="color: #94a3b8; font-size: 0.82rem;">${g.carrierAnterior}</td>
                    <td>
                        <select class="form-input"
                            onchange="window.CarrierSwitchModule.changeRowCarrier(decodeURIComponent('${safeKey}'), this.value)"
                            style="
                                height: 32px;
                                padding: 2px 8px;
                                font-size: 0.78rem;
                                font-weight: 700;
                                color: #60a5fa;
                                background: rgba(15, 23, 42, 0.9);
                                border: 1px solid rgba(59, 130, 246, 0.45);
                                border-radius: 6px;
                                cursor: pointer;
                                width: 100%;
                                max-width: 175px;
                            "
                            title="Selecione qualquer transportadora que atende ${g.cidade}">
                            ${optionsHtml}
                        </select>
                    </td>
                    <td style="text-align: center;">
                        <div style="display: inline-flex; align-items: center; justify-content: center; background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 4px; padding: 2px 7px; font-weight: 700; color: #60a5fa; font-size: 0.78rem;">
                            ${g.percentualTabelaNovo > 0 ? g.percentualTabelaNovo.toFixed(2) + '%' : '-'}
                        </div>
                        <div style="font-size: 0.68rem; color: var(--text-secondary); margin-top: 1px;" title="Percentual Efetivo sobre Valor Total de NFs">
                            ${g.percentualEfetivoNovo > 0 ? g.percentualEfetivoNovo.toFixed(2) + '% ef.' : ''}
                        </div>
                    </td>
                    <td>
                        ${g.redespachoAnteriorTotal > 0 ? `
                            <div style="font-weight: 700; color: #22c55e; font-size: 0.84rem;" title="Frete Principal da Transportadora Anterior">${formatBRL(g.mainAnteriorTotal)}</div>
                            <div style="font-size: 0.70rem; color: #fde047; font-weight: 600; margin-top: 1px; white-space: nowrap;" title="Redespacho Obrigatório via ${g.redespCarrierAnterior || 'EMBARQ'}">
                                + ${formatBRL(g.redespachoAnteriorTotal)} / ${g.redespCarrierAnterior || 'EMBARQ'}
                            </div>
                            <div style="font-size: 0.68rem; color: #94a3b8; margin-top: 2px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 1px;" title="Custo Total Anterior: ${formatBRL(g.mainAnteriorTotal)} principal + ${formatBRL(g.redespachoAnteriorTotal)} redespacho">
                                Total: <strong style="color:#e2e8f0;">${formatBRL(g.custoAnteriorTotal)}</strong> <span style="opacity:0.8;">(${g.percentualEfetivoAnterior > 0 ? g.percentualEfetivoAnterior.toFixed(2) + '%' : ''})</span>
                            </div>
                        ` : `
                            <div style="font-weight: 700; color: #22c55e; font-size: 0.84rem;">${formatBRL(g.custoAnteriorTotal)}</div>
                            <div style="font-size: 0.68rem; color: var(--text-secondary); margin-top: 1px;">
                                ${g.percentualEfetivoAnterior > 0 ? g.percentualEfetivoAnterior.toFixed(2) + '% s/ NF' : ''}
                            </div>
                        `}
                    </td>
                    <td>
                        ${g.redespachoNovoTotal > 0 ? `
                            <div style="font-weight: 700; color: #60a5fa; font-size: 0.84rem;" title="Frete Principal Sugerido">${formatBRL(g.mainNovoTotal)} ${redespBadge}</div>
                            <div style="font-size: 0.70rem; color: #fde047; font-weight: 600; margin-top: 1px; white-space: nowrap;" title="Redespacho Obrigatório mantido via ${g.redespCarrierNovo || 'EMBARQ'}">
                                + ${formatBRL(g.redespachoNovoTotal)} / ${g.redespCarrierNovo || 'EMBARQ'}
                            </div>
                            <div style="font-size: 0.68rem; color: #94a3b8; margin-top: 2px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 1px;" title="Custo Total Sugerido: ${formatBRL(g.mainNovoTotal)} principal + ${formatBRL(g.redespachoNovoTotal)} redespacho">
                                Total: <strong style="color:#f8fafc;">${formatBRL(g.custoNovoTotal)}</strong> <span style="opacity:0.8;">(${g.percentualEfetivoNovo > 0 ? g.percentualEfetivoNovo.toFixed(2) + '%' : ''})</span>
                            </div>
                        ` : `
                            <div style="font-weight: 700; color: #f8fafc; font-size: 0.84rem;">
                                ${formatBRL(g.custoNovoTotal)}
                                ${redespBadge}
                            </div>
                            <div style="font-size: 0.68rem; color: #94a3b8; margin-top: 1px;">
                                ${g.percentualEfetivoNovo > 0 ? g.percentualEfetivoNovo.toFixed(2) + '% s/ NF' : ''}
                            </div>
                        `}
                    </td>
                    <td style="font-weight: 700; color: ${diffColor}; font-size: 0.82rem;">
                        ${diffSignal} ${formatBRL(Math.abs(g.diferencaTotal))}
                    </td>
                    <td style="font-weight: 700; color: ${diffColor}; font-size: 0.82rem;">
                        ${diffSignal} ${Math.abs(g.diferencaPerc).toFixed(2)}%
                    </td>
                    <td>
                        <div style="font-size: 0.72rem; color: #94a3b8;">${g.leadTimeAnterior} ➔ ${g.leadTimeNovo}</div>
                        ${prazoBadge}
                    </td>
                    <td style="text-align: center;">
                        <button class="btn btn-secondary" onclick="window.CarrierSwitchModule.openDetail(${index})" style="
                            padding: 0.25rem 0.55rem; font-size: 0.72rem; gap: 0.25rem; border-color: rgba(59, 130, 246, 0.35); border-radius: 5px;
                        " title="Abrir Raio-X e perspectiva despacho a despacho">
                            <span class="material-icons-round" style="font-size: 0.95rem; color: #60a5fa;">visibility</span>
                            Detalhes
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    }

    // Abre o Modal com Detalhamento Sintético Lado a Lado + Drill-down Despacho a Despacho
    function openDetail(groupIndex) {
        const group = state.filteredGroups[groupIndex];
        if (!group) return;
        state.selectedGroup = group;

        const modal = document.getElementById('switchDetailModal');
        if (!modal) return;

        // Cabeçalho do modal
        const titleEl = document.getElementById('switchModalTitle');
        const subEl = document.getElementById('switchModalSubtitle');
        if (titleEl) titleEl.innerText = `${group.cliente} • ${group.cidade}`;
        if (subEl) {
            subEl.innerText = `Comparativo entre ${group.carrierAnterior} (Atual) vs ${group.carrierNovo} (Sugerida) com base em ${group.count} despachos reais.`;
        }

        // Cenário Anterior
        document.getElementById('detCarrierAnt').innerText = group.carrierAnterior;
        document.getElementById('detBaseAnt').innerText = formatBRL(group.mainAnteriorTotal);
        const percTabAntEl = document.getElementById('detPercTabAnt');
        if (percTabAntEl) {
            percTabAntEl.innerText = group.percentualTabelaAnterior > 0 ? `${group.percentualTabelaAnterior.toFixed(2)}%` : '-';
        }
        const percEfAntEl = document.getElementById('detPercEfAnt');
        if (percEfAntEl) {
            percEfAntEl.innerText = group.percentualEfetivoAnterior > 0 ? `${group.percentualEfetivoAnterior.toFixed(2)}%` : '-';
        }
        document.getElementById('detExcAnt').innerText = formatBRL(group.excessoAnteriorTotal);
        document.getElementById('detTaxasAnt').innerText = formatBRL(group.taxasAnterioresTotal);
        document.getElementById('detRedespAnt').innerText = group.redespachoAnteriorTotal > 0
            ? `${formatBRL(group.redespachoAnteriorTotal)} (${group.redespCarrierAnterior || 'EMBARQ'})`
            : 'R$ 0,00 (Direto)';
        document.getElementById('detTotalAnt').innerText = formatBRL(group.custoAnteriorTotal);
        document.getElementById('detPrazoAnt').innerText = group.leadTimeAnterior;

        // Cenário Sugerido
        document.getElementById('detCarrierNovo').innerText = group.carrierNovo;
        document.getElementById('detBaseNovo').innerText = formatBRL(group.mainNovoTotal);
        const percTabNovoEl = document.getElementById('detPercTabNovo');
        if (percTabNovoEl) {
            percTabNovoEl.innerText = group.percentualTabelaNovo > 0 ? `${group.percentualTabelaNovo.toFixed(2)}%` : '-';
        }
        const percEfNovoEl = document.getElementById('detPercEfNovo');
        if (percEfNovoEl) {
            percEfNovoEl.innerText = group.percentualEfetivoNovo > 0 ? `${group.percentualEfetivoNovo.toFixed(2)}%` : '-';
        }
        document.getElementById('detExcNovo').innerText = formatBRL(group.excessoNovoTotal);
        document.getElementById('detTaxasNovo').innerText = formatBRL(group.taxasNovoTotal);

        const redespNovoEl = document.getElementById('detRedespNovo');
        if (group.redespachoNovoTotal > 0) {
            redespNovoEl.innerHTML = `<span style="color:#fde047; font-weight:700;">🟨 ${formatBRL(group.redespachoNovoTotal)}</span> <small style="color:#fde047; opacity:0.8;">(${group.redespCarrierNovo || 'Redespacho'})</small>`;
        } else {
            redespNovoEl.innerText = 'R$ 0,00 (Entrega Direta)';
        }

        document.getElementById('detTotalNovo').innerText = formatBRL(group.custoNovoTotal);
        document.getElementById('detPrazoNovo').innerText = group.leadTimeNovo;

        // Box de Decisão / Resultado
        const resBox = document.getElementById('detResultBox');
        const resVal = document.getElementById('detResultValue');
        const resPerc = document.getElementById('detResultPerc');
        const resAlert = document.getElementById('detResultAlert');

        const isEcon = group.isEconomia;
        if (isEcon) {
            resBox.style.background = 'rgba(16, 185, 129, 0.1)';
            resBox.style.borderColor = 'rgba(16, 185, 129, 0.3)';
            resVal.innerText = `- ${formatBRL(Math.abs(group.diferencaTotal))} (ECONOMIA)`;
            resVal.style.color = '#10b981';
            resPerc.innerText = `Redução de ${Math.abs(group.diferencaPerc).toFixed(2)}% nos custos de frete`;
            resPerc.style.color = '#6ee7b7';

            if (group.diffDiasPrazoMedio > 1.5) {
                resAlert.innerHTML = `⚠️ <strong>Atenção ao Prazo:</strong> Embora gere economia de ${formatBRL(Math.abs(group.diferencaTotal))}, a transportadora sugerida pode adicionar cerca de ${group.diffDiasPrazoMedio.toFixed(0)} dias úteis ao prazo de entrega do cliente.`;
                resAlert.style.display = 'block';
            } else {
                resAlert.innerHTML = `✅ <strong>Decisão Segura:</strong> A troca apenas da transportadora principal gera economia real, preservando o redespacho obrigatório da rota.`;
                resAlert.style.display = 'block';
            }
        } else {
            resBox.style.background = 'rgba(239, 68, 68, 0.1)';
            resBox.style.borderColor = 'rgba(239, 68, 68, 0.3)';
            resVal.innerText = `+ ${formatBRL(Math.abs(group.diferencaTotal))} (GASTO ADICIONAL)`;
            resVal.style.color = '#ef4444';
            resPerc.innerText = `Aumento de ${Math.abs(group.diferencaPerc).toFixed(2)}% nos custos totais`;
            resPerc.style.color = '#fca5a5';

            if (group.hasRedespachoNovo && group.redespachoNovoTotal > group.custoAnteriorTotal * 0.1) {
                resAlert.innerHTML = `❌ <strong>Cuidado: Falsa Economia!</strong> O frete base parecia atrativo, mas o custo adicional de redespacho (<strong>${formatBRL(group.redespachoNovoTotal)}</strong>) e excedente tornou a opção sugerida mais cara que a atual.`;
                resAlert.style.display = 'block';
            } else {
                resAlert.innerHTML = `❌ <strong>Não Recomendado:</strong> A transportadora sugerida encarece o custo da rota para este cliente.`;
                resAlert.style.display = 'block';
            }
        }

        // Tabela Despacho a Despacho (Drill-Down / Auditoria)
        renderDetailDispatches(group.dispatches);

        modal.style.display = 'flex';
    }

    // Renderiza a lista despacho a despacho no modal
    function renderDetailDispatches(dispatchesList) {
        const tbody = document.getElementById('switchDetailTableBody');
        if (!tbody) return;

        let html = '';
        dispatchesList.forEach(item => {
            const isEcon = item.diferenca >= 0;
            const diffColor = isEcon ? '#10b981' : '#ef4444';
            const diffPrefix = isEcon ? '-' : '+';

            let redespInfoAnt = '';
            if (item.redespachoAnterior > 0) {
                redespInfoAnt = `<div style="color:#fde047; font-size:0.7rem; font-weight:bold;">+ ${formatBRL(item.redespachoAnterior)} / ${item.redespCarrierAnterior || 'EMBARQ'}</div>`;
            }

            let redespInfoNovo = '';
            if (item.redespachoNovo > 0) {
                redespInfoNovo = `<div style="color:#fde047; font-size:0.7rem; font-weight:bold;">+ ${formatBRL(item.redespachoNovo)} / ${item.redespCarrierNovo || 'EMBARQ'}</div>`;
            }

            html += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 0.8rem;">
                    <td>${formatDateBR(item.data)}</td>
                    <td style="font-weight: 600; color: #93c5fd;">NF ${item.nf}</td>
                    <td>${item.peso.toFixed(1)} kg</td>
                    <td>${item.volume} vol</td>
                    <td>${formatBRL(item.valorNF)}</td>
                    <td>
                        ${item.redespachoAnterior > 0 ? `
                            <div style="font-weight: 700; color: #22c55e;">${formatBRL(item.mainAnterior)}</div>
                            <div style="color: #fde047; font-size: 0.68rem; font-weight: 600;">+ ${formatBRL(item.redespachoAnterior)} / ${item.redespCarrierAnterior || 'EMBARQ'}</div>
                            <div style="font-size: 0.66rem; color: #94a3b8;">Total: ${formatBRL(item.custoAnterior)}</div>
                        ` : `
                            <div style="font-weight: 600; color: #cbd5e1;">${formatBRL(item.custoAnterior)}</div>
                            <div style="font-size: 0.7rem; color: var(--text-secondary);">${item.percentualEfetivoAnterior > 0 ? item.percentualEfetivoAnterior.toFixed(2) + '% s/ NF' : ''}</div>
                        `}
                    </td>
                    <td>
                        ${item.redespachoNovo > 0 ? `
                            <div style="font-weight: 700; color: #60a5fa;">${formatBRL(item.mainNovo)}</div>
                            <div style="color: #fde047; font-size: 0.68rem; font-weight: 600;">+ ${formatBRL(item.redespachoNovo)} / ${item.redespCarrierNovo || 'EMBARQ'}</div>
                            <div style="font-size: 0.66rem; color: #94a3b8;">Total: ${formatBRL(item.custoNovo)}</div>
                        ` : `
                            <div style="font-weight: 600; color: #f8fafc;">${formatBRL(item.custoNovo)}</div>
                            <div style="font-size: 0.7rem; color: #94a3b8;">${item.percentualEfetivoNovo > 0 ? item.percentualEfetivoNovo.toFixed(2) + '% s/ NF' : ''}</div>
                        `}
                    </td>
                    <td style="text-align: center;">
                        <span style="display:inline-block; padding: 2px 6px; border-radius: 4px; background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); color: #60a5fa; font-weight: 700; font-size: 0.8rem;">
                            ${item.percentualTabelaNovo > 0 ? item.percentualTabelaNovo.toFixed(2) + '%' : '-'}
                        </span>
                    </td>
                    <td style="font-weight: 700; color: ${diffColor};">
                        ${diffPrefix} ${formatBRL(Math.abs(item.diferenca))}
                    </td>
                    <td>
                        <span style="font-size:0.72rem; color:var(--text-secondary);">
                            Princ: ${formatBRL(item.mainNovo)} | Base: ${formatBRL(item.baseNovo)} | Exc: ${formatBRL(item.excessoNovo)}
                        </span>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
    }

    // Fecha o modal de detalhamento
    function closeDetail() {
        const modal = document.getElementById('switchDetailModal');
        if (modal) modal.style.display = 'none';
        state.selectedGroup = null;
    }

    // Limpa todos os filtros para os valores iniciais
    function clearFilters() {
        const clientSel = document.getElementById('switchFilterCliente');
        const citySel = document.getElementById('switchFilterCidade');
        const currentCarrierSel = document.getElementById('switchFilterCarrierAtual');
        const targetCarrierSel = document.getElementById('switchFilterCarrierNovo');

        if (clientSel) clientSel.value = '';
        if (citySel) citySel.value = '';
        if (currentCarrierSel) currentCarrierSel.value = '';
        if (targetCarrierSel) targetCarrierSel.value = '__AUTO__';

        setupDefaultDates();
        runAnalysis();
    }

    // Exportação em Excel do Resumo (tabela consolidada por cliente/rota)
    function exportSummaryExcel() {
        if (!state.filteredGroups || state.filteredGroups.length === 0) {
            alert('Não há dados filtrados para exportar.');
            return;
        }

        if (typeof XLSX === 'undefined') {
            alert('Biblioteca XLSX não carregada no navegador.');
            return;
        }

        const dataToExport = state.filteredGroups.map(g => ({
            'Cliente': g.cliente,
            'Município': g.cidade,
            'Transportadora Atual': g.carrierAnterior,
            'Transportadora Sugerida': g.carrierNovo,
            '% Frete Tabela (Sugerida)': Number(g.percentualTabelaNovo.toFixed(2)),
            '% Frete Efetivo Sugerido': Number(g.percentualEfetivoNovo.toFixed(2)),
            '% Frete Efetivo Anterior': Number(g.percentualEfetivoAnterior.toFixed(2)),
            'Qtd Despachos': g.count,
            'Peso Total (kg)': Number(g.pesoTotal.toFixed(2)),
            'Custo Anterior Total (R$)': Number(g.custoAnteriorTotal.toFixed(2)),
            'Frete Principal Anterior (R$)': Number(g.mainAnteriorTotal.toFixed(2)),
            'Redespacho Anterior (R$)': Number(g.redespachoAnteriorTotal.toFixed(2)),
            'Custo Sugerido Total (R$)': Number(g.custoNovoTotal.toFixed(2)),
            'Frete Principal Sugerido (R$)': Number(g.mainNovoTotal.toFixed(2)),
            'Redespacho Sugerido (R$)': Number(g.redespachoNovoTotal.toFixed(2)),
            'Transportadora Redespacho': g.redespCarrierNovo || '-',
            'Resultado': g.isEconomia ? 'Economia' : 'Gasto Adicional',
            'Diferença (R$)': Number(g.diferencaTotal.toFixed(2)),
            'Diferença (%)': Number(g.diferencaPerc.toFixed(2)),
            'Prazo Anterior': g.leadTimeAnterior,
            'Prazo Sugerido': g.leadTimeNovo,
            'Variação Dias Prazo': Number(g.diffDiasPrazoMedio.toFixed(1))
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        XLSX.utils.book_append_sheet(wb, ws, 'Comparativo Resumido');
        XLSX.writeFile(wb, `Analise_Troca_Transportadora_${new Date().toISOString().split('T')[0]}.xlsx`);
    }

    // Exportação em Excel Completa (despacho a despacho com cada NF aberta)
    function exportDetailedExcel() {
        if (!state.filteredGroups || state.filteredGroups.length === 0) {
            alert('Não há dados filtrados para exportar.');
            return;
        }

        if (typeof XLSX === 'undefined') {
            alert('Biblioteca XLSX não carregada no navegador.');
            return;
        }

        const allDetailed = [];
        state.filteredGroups.forEach(g => {
            g.dispatches.forEach(d => {
                allDetailed.push({
                    'Cliente': d.cliente,
                    'Município': d.cidade,
                    'Bairro': d.bairro,
                    'Data Despacho': d.data,
                    'Número NF': d.nf,
                    'Peso Real (kg)': Number(d.peso.toFixed(2)),
                    'Volumes': d.volume,
                    'Valor NF (R$)': Number(d.valorNF.toFixed(2)),
                    'Transp. Anterior': d.carrierAnterior,
                    '% Frete Ant. Efetivo': Number(d.percentualEfetivoAnterior.toFixed(2)),
                    'Custo Anterior Total (R$)': Number(d.custoAnterior.toFixed(2)),
                    'Frete Princ. Anterior (R$)': Number(d.mainAnterior.toFixed(2)),
                    'Redespacho Anterior (R$)': Number(d.redespachoAnterior.toFixed(2)),
                    'Transp. Sugerida': d.carrierNovo,
                    '% Frete Tabela (Sugerida)': Number(d.percentualTabelaNovo.toFixed(2)),
                    '% Frete Sugerido Efetivo': Number(d.percentualEfetivoNovo.toFixed(2)),
                    'Custo Sugerido Total (R$)': Number(d.custoNovo.toFixed(2)),
                    'Frete Princ. Sugerido (R$)': Number(d.mainNovo.toFixed(2)),
                    'Redespacho Sugerido (R$)': Number(d.redespachoNovo.toFixed(2)),
                    'Redespachante': d.redespCarrierNovo || '-',
                    'Diferença (R$)': Number(d.diferenca.toFixed(2)),
                    'Diferença (%)': Number(d.diferencaPerc.toFixed(2)),
                    'Impacto': d.diferenca >= 0 ? 'Economia' : 'Gasto Adicional',
                    'Prazo Anterior': d.leadTimeAnterior,
                    'Prazo Sugerido': d.leadTimeNovo
                });
            });
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(allDetailed);
        XLSX.utils.book_append_sheet(wb, ws, 'Auditoria Despacho a Despacho');
        XLSX.writeFile(wb, `Analise_Troca_Despacho_a_Despacho_${new Date().toISOString().split('T')[0]}.xlsx`);
    }

    return {
        init: init,
        runAnalysis: runAnalysis,
        applyTagFilter: applyTagFilter,
        changeRowCarrier: changeRowCarrier,
        openDetail: openDetail,
        closeDetail: closeDetail,
        clearFilters: clearFilters,
        exportSummaryExcel: exportSummaryExcel,
        exportDetailedExcel: exportDetailedExcel
    };
})();
