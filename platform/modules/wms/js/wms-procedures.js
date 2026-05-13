// =============================================================================
// WMS Procedures — Camada de Integração Multi-ERP
// Versão: 1.0.0 | WMS v1.7.0
//
// Procedures são os PONTOS DE INTEGRAÇÃO padronizados entre o WMS e qualquer ERP.
// Cada procedure tem implementações para: standalone (mock), parreira-erp e rest-api.
// Nunca acesse o ERP diretamente de outros módulos — passe sempre por uma procedure.
//
// FLUXO DE RECEBIMENTO:
//   proc_buscar_nf_destinada      → ERP → WMS  (consulta NF na fila de pedidos)
//   proc_buscar_nf_por_numero     → ERP → WMS  (fallback por número+série)
//   proc_verificar_pre_entrada    → ERP → WMS  (verifica pré-entrada e retorna itens com cód. interno)
//   proc_confirmar_recebimento    → WMS → ERP  (push de recebimento confirmado)
//   proc_registrar_divergencia    → WMS → ERP  (push de divergência de volumes)
//   proc_validar_pin_supervisor   → local     (valida PIN configurável de supervisor)
//   proc_registrar_entrada_avulsa → WMS log (auditoria de entradas sem NF)
//   proc_confirmar_conferencia_itens → WMS → ERP (push conferência de itens)
// =============================================================================

(function () {
    'use strict';

    // ─── HELPERS INTERNOS ─────────────────────────────────────────────────────

    function _ts() {
        return window.getTenantSuffix ? window.getTenantSuffix() : '';
    }

    function _getConnector() {
        const saved = JSON.parse(localStorage.getItem('wms_integration_config') || '{}');
        return {
            id: saved.connectorId || 'standalone',
            cfg: saved.connectorConfig || {}
        };
    }

    function _getCnpjs() {
        const wmsConfig = JSON.parse(localStorage.getItem('wms_config') || '{}');
        return (wmsConfig.empresas || []);
    }

    function _getRestHeaders(cfg) {
        const headers = { 'Content-Type': 'application/json' };
        if (cfg.apiKey) headers[cfg.authHeader || 'X-Api-Key'] = cfg.apiKey;
        return headers;
    }

    function _logSync(proc, direction, status, message) {
        const logs = JSON.parse(localStorage.getItem('wms_sync_log') || '[]');
        logs.unshift({ proc, direction, status, message, timestamp: new Date().toISOString() });
        if (logs.length > 100) logs.length = 100;
        localStorage.setItem('wms_sync_log', JSON.stringify(logs));
    }

    // ─── NORMALIZAÇÃO DE NF ───────────────────────────────────────────────────
    // Garante que independente do formato do ERP externo,
    // o WMS sempre trabalhe com este schema interno.

    function _normalizeNf(raw) {
        return {
            chaveNfe:           raw.chaveNfe || raw.chave_acesso || raw.chave || raw.accessKey || '',
            numero:             String(raw.numero || raw.nfNumero || raw.nf || raw.number || ''),
            serie:              String(raw.serie || raw.series || '1'),
            dataEmissao:        raw.dataEmissao || raw.emissao || raw.issueDate || raw.data || '',
            valorTotal:         Number(raw.valorTotal || raw.valor || raw.total || raw.amount || 0),
            cnpjEmitente:       raw.cnpjEmitente || raw.fornecedorCnpj || raw.supplierCnpj || '',
            razaoSocialEmitente:raw.razaoSocialEmitente || raw.fornecedor || raw.supplier || raw.supplierName || '',
            cnpjDestinatario:   raw.cnpjDestinatario || raw.destinatarioCnpj || raw.recipientCnpj || '',
            pedidoCompra:       raw.pedidoCompra || raw.pedido || raw.purchaseOrder || raw.po || '',
            transportadora:     raw.transportadora || raw.carrier || raw.carrierName || '',
            volumes:            raw.volumes != null ? Number(raw.volumes) : (raw.qtdVolumes != null ? Number(raw.qtdVolumes) : null),
            peso:               raw.peso != null ? Number(raw.peso) : (raw.pesoTotal != null ? Number(raw.pesoTotal) : null),
            itens: (raw.itens || raw.items || []).map(i => ({
                sku:           i.sku || i.codigo || i.code || i.productCode || '',
                descricao:     i.descricao || i.description || i.nome || i.name || '',
                quantidade:    Number(i.quantidade || i.qty || i.qtd || i.quantity || 0),
                unidade:       i.unidade || i.unit || i.un || 'UN',
                valorUnitario: Number(i.valorUnitario || i.preco || i.price || i.unitPrice || 0),
                ncm:           i.ncm || '',
                lote:          i.lote || i.batch || i.lot || ''
            })),
            _raw: raw
        };
    }

    // ─── MOCK NFs (modo standalone) ───────────────────────────────────────────
    // 3 NFs de exemplo carregadas quando não há ERP conectado.

    function _getMockNfs() {
        const stored = localStorage.getItem('wms_nf_mock' + _ts());
        if (stored) return JSON.parse(stored);
        return [
            {
                chaveNfe: '35260412345678000190550010000012341000012340',
                numero: '1234', serie: '1',
                dataEmissao: new Date(Date.now() - 86400000).toISOString(),
                razaoSocialEmitente: 'Fornecedor Alpha Ltda',
                cnpjEmitente: '12.345.678/0001-90',
                cnpjDestinatario: '98.765.432/0001-10',
                valorTotal: 15840.00,
                transportadora: 'Transportes Rápidos S.A.',
                volumes: 12, peso: 450.5,
                pedidoCompra: 'PC-2026-0089',
                itens: [
                    { sku: 'SKU-001', descricao: 'Produto A - Caixa 12un', quantidade: 24, unidade: 'CX', valorUnitario: 320.00 },
                    { sku: 'SKU-002', descricao: 'Produto B - Fardo 6un',  quantidade: 48, unidade: 'FD', valorUnitario: 185.00 },
                    { sku: 'SKU-003', descricao: 'Produto C - Unidade',    quantidade: 120, unidade: 'UN', valorUnitario: 45.50 }
                ]
            },
            {
                chaveNfe: '35260412345678000190550010000056781000056780',
                numero: '5678', serie: '1',
                dataEmissao: new Date().toISOString(),
                razaoSocialEmitente: 'Distribuidora Beta S.A.',
                cnpjEmitente: '98.765.432/0001-00',
                cnpjDestinatario: '98.765.432/0001-10',
                valorTotal: 8290.00,
                transportadora: 'FOB - Próprio fornecedor',
                volumes: 6, peso: 180.0,
                pedidoCompra: 'PC-2026-0092',
                itens: [
                    { sku: 'SKU-010', descricao: 'Produto D - Kit 3un', quantidade: 30, unidade: 'KT', valorUnitario: 250.00 },
                    { sku: 'SKU-011', descricao: 'Produto E - Display',  quantidade: 12, unidade: 'DP', valorUnitario: 195.83 }
                ]
            },
            {
                chaveNfe: '35260455555555000190550010000099991000099990',
                numero: '9999', serie: '1',
                dataEmissao: new Date().toISOString(),
                razaoSocialEmitente: 'Indústria Gama SA',
                cnpjEmitente: '55.555.555/0001-90',
                cnpjDestinatario: '11.111.111/0001-55',
                valorTotal: 42100.00,
                transportadora: 'Transportadora Omega',
                volumes: 48, peso: 1200.0,
                pedidoCompra: 'PC-2026-0077',
                itens: [
                    { sku: 'SKU-050', descricao: 'Produto F - Pallet completo', quantidade: 2, unidade: 'PAL', valorUnitario: 21050.00 }
                ]
            }
        ];
    }

    // ==========================================================================
    // PROC 1 — BUSCAR NF DESTINADA
    // Consulta ERP pela chave de acesso NF-e (44 dígitos) em todos os CNPJs
    // cadastrados do tenant. Retorna a NF normalizada + empresa destinatária.
    //
    // @param {string} chaveAcesso — Chave NF-e de 44 dígitos
    // @returns {object} { found, nf, empresa, empresas, source, error? }
    //   empresas = array com múltiplos matches em CNPJs diferentes (multi-CNPJ)
    // ==========================================================================
    async function proc_buscar_nf_destinada(chaveAcesso) {
        const { id, cfg } = _getConnector();
        const cnpjs = _getCnpjs();
        const chaveClean = chaveAcesso.replace(/\D/g, '');

        let result;

        if (id === 'rest-api' && cfg.baseUrl) {
            result = await _buscarNf_restApi(chaveClean, cnpjs, cfg);
        } else if (id === 'parreira-erp') {
            result = await _buscarNf_parreiraErp(chaveClean, cnpjs);
        } else if (id === 'maxdata') {
            result = await _buscarNf_maxdata(chaveClean, cnpjs);
        } else {
            result = await _buscarNf_standalone(chaveClean, cnpjs);
        }

        _logSync('proc_buscar_nf_destinada', 'erp→wms', result.found ? 'ok' : 'not_found',
            result.found ? `NF ${result.nf.numero} encontrada` : 'NF não localizada');

        return result;
    }

    async function _buscarNf_maxdata(chave, cnpjs) {
        try {
            const token   = await _maxdataGetToken();
            const entries = await _maxdataGetEntries(token);
            const match   = entries.find(e => {
                const eChave = (e.chaveNfe || e.accessKey || e.chave || '').replace(/\D/g,'');
                const eNum   = String(e.nfNumero || e.numero || e.number || e.id || '');
                return (eChave && eChave === chave) || eNum === chave || chave.endsWith(eNum);
            });
            if (!match) return { found: false, nf: null, empresa: null, empresas: [], source: 'maxdata' };
            const nf      = _maxdataNorm(match);
            const empresa = cnpjs.find(c => _cleanCnpj(c.cnpj) === _cleanCnpj(nf.cnpjDestinatario)) || cnpjs[0] || null;
            return { found: true, nf, empresa, empresas: empresa ? [empresa] : [], source: 'maxdata' };
        } catch (err) {
            return { found: false, nf: null, empresa: null, empresas: [], source: 'maxdata', error: err.message };
        }
    }

    async function _buscarNf_restApi(chave, cnpjs, cfg) {
        try {
            const url = `${cfg.baseUrl.replace(/\/$/, '')}/purchase-orders?chave=${encodeURIComponent(chave)}`;
            const resp = await fetch(url, {
                method: 'GET',
                headers: _getRestHeaders(cfg),
                signal: AbortSignal.timeout(12000)
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
            const data = await resp.json();
            const raws = Array.isArray(data) ? data : (data.data ? (Array.isArray(data.data) ? data.data : [data.data]) : [data]);
            const nfs = raws.filter(r => r && (r.chaveNfe || r.chave_acesso || r.numero));

            if (nfs.length === 0) return { found: false, nf: null, empresa: null, empresas: [], source: 'rest-api' };

            // Encontra os CNPJs destinatários com match
            const matches = nfs.map(raw => {
                const nf = _normalizeNf(raw);
                const emp = cnpjs.find(c => _cleanCnpj(c.cnpj) === _cleanCnpj(nf.cnpjDestinatario)) || null;
                return { nf, empresa: emp };
            }).filter(m => m.nf.chaveNfe || m.nf.numero);

            const empresas = matches.map(m => m.empresa).filter(Boolean);
            return {
                found: true,
                nf: matches[0].nf,
                empresa: matches[0].empresa || cnpjs[0] || null,
                empresas,
                source: 'rest-api'
            };
        } catch (err) {
            return { found: false, nf: null, empresa: null, empresas: [], source: 'rest-api', error: err.message };
        }
    }

    async function _buscarNf_parreiraErp(chave, cnpjs) {
        const pedidos = JSON.parse(localStorage.getItem('erp_pedidos_compra' + _ts()) || '[]');
        const mocks = _getMockNfs();
        const todos = [...pedidos, ...mocks];
        const matches = todos.filter(p => {
            const pChave = (p.chaveNfe || p.chave_acesso || p.chave || '').replace(/\D/g, '');
            return pChave && (pChave === chave || chave.includes(pChave) || pChave.includes(chave));
        });

        if (matches.length === 0) return { found: false, nf: null, empresa: null, empresas: [], source: 'parreira-erp' };

        const nfNormalizada = _normalizeNf(matches[0]);
        // Verifica em quais CNPJs a NF é destinada
        const empresasMatch = cnpjs.filter(c =>
            _cleanCnpj(c.cnpj) === _cleanCnpj(nfNormalizada.cnpjDestinatario)
        );

        return {
            found: true,
            nf: nfNormalizada,
            empresa: empresasMatch[0] || cnpjs[0] || null,
            empresas: empresasMatch,
            source: 'parreira-erp'
        };
    }

    async function _buscarNf_standalone(chave, cnpjs) {
        const mocks = _getMockNfs();
        const match = mocks.find(n => {
            const nChave = (n.chaveNfe || '').replace(/\D/g, '');
            return nChave === chave || n.numero === chave || chave.includes(n.numero);
        });

        if (!match) return { found: false, nf: null, empresa: null, empresas: [], source: 'standalone-mock' };

        const nf = _normalizeNf(match);
        const empresaMatch = cnpjs.find(c => _cleanCnpj(c.cnpj) === _cleanCnpj(nf.cnpjDestinatario));
        const empresa = empresaMatch || cnpjs[0] || { razaoSocial: 'Empresa Principal', cnpj: '00.000.000/0001-00' };

        return { found: true, nf, empresa, empresas: [empresa], source: 'standalone-mock' };
    }

    // ==========================================================================
    // PROC 2 — BUSCAR NF POR NÚMERO E SÉRIE
    // Fallback quando não se tem a chave de acesso completa.
    //
    // @param {string} numero — Número da NF
    // @param {string} serie  — Série da NF (default: '1')
    // @returns {object} mesmo schema de proc_buscar_nf_destinada
    // ==========================================================================
    async function proc_buscar_nf_por_numero(numero, serie = '1') {
        const { id, cfg } = _getConnector();
        const cnpjs = _getCnpjs();

        let result;

        if (id === 'rest-api' && cfg.baseUrl) {
            try {
                const url = `${cfg.baseUrl.replace(/\/$/, '')}/purchase-orders?numero=${encodeURIComponent(numero)}&serie=${encodeURIComponent(serie)}`;
                const resp = await fetch(url, {
                    method: 'GET',
                    headers: _getRestHeaders(cfg),
                    signal: AbortSignal.timeout(12000)
                });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const data = await resp.json();
                const raw = Array.isArray(data) ? data[0] : (data.data || data);
                if (raw && (raw.numero || raw.chaveNfe)) {
                    const nf = _normalizeNf(raw);
                    const empresa = cnpjs.find(c => _cleanCnpj(c.cnpj) === _cleanCnpj(nf.cnpjDestinatario)) || cnpjs[0] || null;
                    result = { found: true, nf, empresa, empresas: empresa ? [empresa] : [], source: 'rest-api' };
                } else {

                    result = { found: false, nf: null, empresa: null, empresas: [], source: 'rest-api' };
                }
            } catch (err) {
                result = { found: false, nf: null, empresa: null, empresas: [], source: 'rest-api', error: err.message };
            }
        } else if (id === 'maxdata') {
            try {
                const token   = await _maxdataGetToken();
                const entries = await _maxdataGetEntries(token);
                const match   = entries.find(e => String(e.nfNumero || e.numero || e.number || e.id) === String(numero));
                if (match) {
                    const nf = _maxdataNorm(match);
                    const empresa = cnpjs.find(c => _cleanCnpj(c.cnpj) === _cleanCnpj(nf.cnpjDestinatario)) || cnpjs[0] || null;
                    result = { found: true, nf, empresa, empresas: empresa ? [empresa] : [], source: 'maxdata' };
                } else {
                    result = { found: false, nf: null, empresa: null, empresas: [], source: 'maxdata' };
                }
            } catch (err) {
                result = { found: false, nf: null, empresa: null, empresas: [], source: 'maxdata', error: err.message };
            }
        } else {
            // Parreira ERP + Standalone: busca nos mocks e no localStorage
            const pedidos = JSON.parse(localStorage.getItem('erp_pedidos_compra' + _ts()) || '[]');
            const mocks = _getMockNfs();
            const todos = [...pedidos, ...mocks];
            const match = todos.find(n => String(n.numero) === String(numero));

            if (match) {
                const nf = _normalizeNf(match);
                const empresa = cnpjs.find(c => _cleanCnpj(c.cnpj) === _cleanCnpj(nf.cnpjDestinatario)) || cnpjs[0] || null;
                result = { found: true, nf, empresa, empresas: empresa ? [empresa] : [], source: id };
            } else {
                result = { found: false, nf: null, empresa: null, empresas: [], source: id };
            }
        }


        _logSync('proc_buscar_nf_por_numero', 'erp→wms', result.found ? 'ok' : 'not_found',
            result.found ? `NF ${numero} encontrada` : `NF ${numero} não localizada`);
        return result;
    }

    // ==========================================================================
    // PROC 3 — CONFIRMAR RECEBIMENTO
    // Push WMS → ERP: informa que a NF foi recebida e conferida.
    // Sempre salva localmente. Tenta push ao ERP se conectado.
    //
    // @param {object} payload — Objeto de recebimento completo (schema wms_receipt_v2)
    // @returns {object} { status: 'ok'|'warning'|'error', message }
    // ==========================================================================
    async function proc_confirmar_recebimento(payload) {
        const { id, cfg } = _getConnector();

        // Sempre persiste localmente como fonte de verdade
        const key = 'wms_receipts_v2' + _ts();
        const receipts = JSON.parse(localStorage.getItem(key) || '[]');
        receipts.unshift(payload);
        localStorage.setItem(key, JSON.stringify(receipts));

        let result;

        if (id === 'parreira-erp') {
            // Atualiza status do pedido de compra no ERP Parreira
            const pkKey = 'erp_pedidos_compra' + _ts();
            const pedidos = JSON.parse(localStorage.getItem(pkKey) || '[]');
            const idx = pedidos.findIndex(p => {
                const pChave = (p.chaveNfe || p.chave_acesso || '').replace(/\D/g, '');
                return pChave === (payload.chaveNfe || '').replace(/\D/g, '') || String(p.numero) === String(payload.nfNumero);
            });
            if (idx >= 0) {
                pedidos[idx].statusRecebimento = 'RECEBIDO';
                pedidos[idx].dataRecebimento = payload.dataConferencia;
                pedidos[idx].operadorRecebimento = payload.operador;
                localStorage.setItem(pkKey, JSON.stringify(pedidos));
            }
            window.dispatchEvent(new CustomEvent('wms-data-push', { detail: { entity: 'receipts', payload } }));
            result = { status: 'ok', message: 'Recebimento confirmado no ERP Parreira.' };

        } else if (id === 'rest-api' && cfg.baseUrl) {
            try {
                const resp = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/receipts`, {
                    method: 'POST',
                    headers: _getRestHeaders(cfg),
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(15000)
                });
                result = resp.ok
                    ? { status: 'ok', message: 'Recebimento confirmado via REST API.' }
                    : { status: 'warning', message: `ERP retornou HTTP ${resp.status}. Dados salvos localmente.` };
            } catch (err) {
                result = { status: 'warning', message: `ERP inacessível. Dados salvos localmente. (${err.message})` };
            }
        } else if (id === 'maxdata') {
            try {
                const token = await _maxdataGetToken();
                const cfg2  = _maxdataCfg();
                const base  = cfg2.baseUrl.replace(/\/$/, '');
                const body  = {
                    entryId:          payload._maxdataId || payload._maxdataEntryId || null,
                    nfNumero:         payload.nfNumero,
                    operador:         payload.operador,
                    dataRecebimento:  payload.dataConferencia || new Date().toISOString(),
                    volumesRecebidos: payload.volumesFisicos || payload.volumes || 0,
                    status:           'RECEBIDO'
                };
                const resp = await fetch(`${base}/entry/markaschecked`, {
                    method: 'PUT', headers: _maxdataHdrs(token),
                    body: JSON.stringify(body), signal: AbortSignal.timeout(15000)
                });
                result = resp.ok
                    ? { status: 'ok', message: 'Recebimento confirmado no Maxdata.' }
                    : { status: 'warning', message: `Maxdata HTTP ${resp.status}. Dados salvos localmente.` };
            } catch (err) {
                result = { status: 'warning', message: `Maxdata inacessível. Dados salvos localmente. (${err.message})` };
            }
        } else {
            result = { status: 'ok', message: 'Recebimento salvo localmente (modo standalone).' };
        }

        _logSync('proc_confirmar_recebimento', 'wms→erp', result.status, result.message);

        // Hook para compatibilidade com código legacy (ex: dashboard que escuta onWmsConferenciaFinalizada)
        if (window.onWmsConferenciaFinalizada) window.onWmsConferenciaFinalizada(payload);

        return result;
    }

    // ==========================================================================
    // PROC 4 — REGISTRAR DIVERGÊNCIA
    // Push WMS → ERP: comunica divergências de volumes/itens ao setor de Compras.
    //
    // @param {object} payload — { recId, nfNumero, chaveNfe, tipoDivergencia,
    //                             volumesNF, volumesFisicos, volumesAvariados,
    //                             volumesFaltantes, volumesExcesso, descricao, operador }
    // @returns {object} { status, message }
    // ==========================================================================
    async function proc_registrar_divergencia(payload) {
        const { id, cfg } = _getConnector();

        // Persiste localmente
        const key = 'wms_divergencias' + _ts();
        const divs = JSON.parse(localStorage.getItem(key) || '[]');
        divs.unshift({
            ...payload,
            id: `DIV-${Date.now()}`,
            registradoEm: new Date().toISOString()
        });
        localStorage.setItem(key, JSON.stringify(divs));

        let result;

        if (id === 'parreira-erp') {
            window.dispatchEvent(new CustomEvent('wms-data-push', {
                detail: { entity: 'divergencia-recebimento', payload }
            }));
            result = { status: 'ok', message: 'Divergência registrada e ERP Parreira notificado.' };

        } else if (id === 'rest-api' && cfg.baseUrl) {
            try {
                const resp = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/receipts/divergencias`, {
                    method: 'POST',
                    headers: _getRestHeaders(cfg),
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(10000)
                });
                result = resp.ok
                    ? { status: 'ok', message: 'Divergência enviada ao ERP.' }
                    : { status: 'warning', message: `ERP retornou HTTP ${resp.status}. Divergência salva localmente.` };
            } catch (err) {
                result = { status: 'warning', message: `ERP inacessível. Divergência salva localmente.` };
            }
        } else {
            result = { status: 'ok', message: 'Divergência registrada localmente.' };
        }

        _logSync('proc_registrar_divergencia', 'wms→erp', result.status, result.message);
        return result;
    }

    // ==========================================================================
    // PROC 5 — VALIDAR PIN DE SUPERVISOR
    // Valida o PIN numérico configurável de supervisor para liberar entrada avulsa.
    //
    // O PIN é definido nas configurações do WMS (cfg-integracao > Segurança).
    // Armazenado em wms_config.seguranca.pinSupervisor
    //
    // @param {string} pinDigitado — PIN numérico digitado pelo operador
    // @returns {object} { valid: bool, message: string }
    // ==========================================================================
    async function proc_validar_pin_supervisor(pinDigitado) {
        const wmsConfig = JSON.parse(localStorage.getItem('wms_config') || '{}');
        const pinConfig = wmsConfig.seguranca?.pinSupervisor;

        if (!pinConfig) {
            return {
                valid: false,
                message: 'PIN de supervisor não configurado. Acesse Configurações → Segurança.'
            };
        }

        if (String(pinDigitado).trim() === String(pinConfig).trim()) {
            return { valid: true, message: 'PIN validado com sucesso.' };
        }

        return { valid: false, message: 'PIN inválido. Tente novamente.' };
    }

    // ==========================================================================
    // PROC 6 — REGISTRAR ENTRADA AVULSA
    // Log de auditoria para entradas de NFs não localizadas no ERP,
    // liberadas via PIN de supervisor.
    //
    // @param {object} nfData      — Dados manuais da NF
    // @param {object} autorizacao — { pin: string, timestamp: string }
    // @returns {object} { status }
    // ==========================================================================
    async function proc_registrar_entrada_avulsa(nfData, autorizacao) {
        const key = 'wms_audit_entradas_avulsas' + _ts();
        const audits = JSON.parse(localStorage.getItem(key) || '[]');
        audits.unshift({
            ...nfData,
            tipo: 'ENTRADA_AVULSA',
            autorizadoEm: autorizacao.timestamp || new Date().toISOString(),
            pinUsado: '****' // Nunca loga o PIN em texto puro
        });
        localStorage.setItem(key, JSON.stringify(audits));
        _logSync('proc_registrar_entrada_avulsa', 'wms→log', 'ok', `Entrada avulsa NF ${nfData.nfNumero || 'S/N'} registrada.`);
        return { status: 'ok' };
    }

    // ─── UTIL ────────────────────────────────────────────────────────────────

    function _cleanCnpj(cnpj) {
        return String(cnpj || '').replace(/\D/g, '');
    }

    // ─── MAXDATA HELPERS ─────────────────────────────────────────────────────

    function _maxdataCfg() {
        const ic = JSON.parse(localStorage.getItem('wms_integration_config') || '{}');
        return ic.connectorConfig || {};
    }

    async function _maxdataGetToken() {
        const cfg  = _maxdataCfg();
        const cached = cfg._maxdataToken;
        if (cached?.value && new Date(cached.expiresAt) > new Date(Date.now() + 60000)) return cached.value;
        const base = (cfg.baseUrl || '').replace(/\/$/, '');
        if (!base || !cfg.empId || !cfg.terminal)
            throw new Error('Maxdata não configurado. Acesse Configurações → Integração.');
        const resp = await fetch(`${base}/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ empId: Number(cfg.empId), terminal: cfg.terminal }),
            signal: AbortSignal.timeout(10000)
        });
        if (!resp.ok) throw new Error(`Maxdata Auth HTTP ${resp.status}`);
        const data = await resp.json();
        if (!data.token) throw new Error('Token não retornado pelo Maxdata.');
        const ic = JSON.parse(localStorage.getItem('wms_integration_config') || '{}');
        if (!ic.connectorConfig) ic.connectorConfig = {};
        ic.connectorConfig._maxdataToken = { value: data.token, expiresAt: data.expiration };
        localStorage.setItem('wms_integration_config', JSON.stringify(ic));
        return data.token;
    }

    function _maxdataHdrs(token) {
        return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
    }

    // Normaliza entry Maxdata → schema NF interno
    function _maxdataNorm(e) {
        return _normalizeNf({
            chaveNfe:            e.chaveNfe || e.accessKey || e.chave || '',
            numero:              e.nfNumero || e.numero || e.number || String(e.id || ''),
            serie:               e.serie || '1',
            dataEmissao:         e.dataEmissao || e.issueDate || '',
            valorTotal:          e.valorTotal || e.total || 0,
            cnpjEmitente:        e.cnpjEmitente || e.fornecedorCnpj || '',
            razaoSocialEmitente: e.fornecedor || e.supplier || e.supplierName || '',
            cnpjDestinatario:    e.cnpjDestinatario || e.recipientCnpj || '',
            pedidoCompra:        e.pedidoCompra || e.purchaseOrder || '',
            volumes:             e.volumes || e.qtdVolumes || null,
            itens:               e.itens || e.items || [],
            _maxdataId:          e.id   // guardado para markaschecked
        });
    }

    // GET /entry e retorna lista de entradas
    async function _maxdataGetEntries(token) {
        const cfg  = _maxdataCfg();
        const base = cfg.baseUrl.replace(/\/$/, '');
        const resp = await fetch(`${base}/entry`, {
            method: 'GET', headers: _maxdataHdrs(token), signal: AbortSignal.timeout(12000)
        });
        if (!resp.ok) throw new Error(`Maxdata GET /entry HTTP ${resp.status}`);
        const data = await resp.json();
        return Array.isArray(data) ? data : (data.data || data.results || []);
    }


    // ==========================================================================
    // PROC 7 — ENVIAR EMAIL DE DIVERGÊNCIA AO FORNECEDOR
    // Envia relatório de divergência automaticamente ao email do fornecedor
    // a partir do email da distribuidora configurado no WMS.
    //
    // Estratégia por prioridade:
    //   1. REST API configurada com endpoint /email  (produção)
    //   2. EmailJS (cliente SDK, se apiKey EmailJS configurado)
    //   3. mailto: (abre cliente de email padrão — fallback universal)
    //
    // @param {object} divPayload — payload completo da divergência
    // @returns {object} { status, method, message }
    // ==========================================================================
    async function proc_enviar_email_divergencia(divPayload) {
        const wmsConfig = JSON.parse(localStorage.getItem('wms_config') || '{}');
        const emailRemetente  = wmsConfig.email?.remetente || '';
        const nomeRemetente   = wmsConfig.email?.nomeRemetente || 'WMS ParreiraLog';
        const emailjsKey      = wmsConfig.email?.emailjsPublicKey || '';
        const emailjsService  = wmsConfig.email?.emailjsServiceId || '';
        const emailjsTemplate = wmsConfig.email?.emailjsTemplateId || '';

        const destinatario    = divPayload.emailFornecedor || '';
        if (!destinatario) return { status: 'skip', message: 'Email do fornecedor não informado.' };

        const { id, cfg } = _getConnector();

        // ── 1. REST API ──────────────────────────────────────────────────────
        if (id === 'rest-api' && cfg.baseUrl && cfg.baseUrl.includes('/api')) {
            try {
                const body = {
                    to:      destinatario,
                    from:    emailRemetente,
                    subject: `Relatório de Divergência no Recebimento — NF ${divPayload.nfNumero}`,
                    data:    divPayload
                };
                const resp = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/email/divergencia`, {
                    method: 'POST',
                    headers: _getRestHeaders(cfg),
                    body: JSON.stringify(body),
                    signal: AbortSignal.timeout(10000)
                });
                if (resp.ok) {
                    _logSync('proc_enviar_email_divergencia', 'wms→email', 'ok', `Email enviado via REST para ${destinatario}`);
                    return { status: 'ok', method: 'rest-api', message: `Relatório enviado para ${destinatario}.` };
                }
            } catch (_) { /* fallback */ }
        }

        // ── 2. EmailJS (se configurado) ──────────────────────────────────────
        if (emailjsKey && emailjsService && emailjsTemplate && window.emailjs) {
            try {
                await window.emailjs.init(emailjsKey);
                await window.emailjs.send(emailjsService, emailjsTemplate, {
                    to_email:     destinatario,
                    from_name:    nomeRemetente,
                    nf_numero:    divPayload.nfNumero,
                    fornecedor:   divPayload.fornecedor,
                    tipo_div:     divPayload.tipo,
                    avariados:    divPayload.volumesAvariados || 0,
                    faltantes:    divPayload.volumesFaltantes || 0,
                    excesso:      divPayload.volumesExcesso   || 0,
                    descricao:    divPayload.descricao || '',
                    operador:     divPayload.operador  || '',
                    data:         new Date(divPayload.dataOcorrencia).toLocaleString('pt-BR'),
                    reply_to:     emailRemetente
                });
                _logSync('proc_enviar_email_divergencia', 'wms→email', 'ok', `Email enviado via EmailJS para ${destinatario}`);
                return { status: 'ok', method: 'emailjs', message: `Relatório enviado para ${destinatario}.` };
            } catch (ejsErr) {
                console.warn('[WMS Email] EmailJS falhou:', ejsErr.message);
            }
        }

        // ── 3. mailto: (fallback universal — abre cliente de email) ──────────
        const subject = encodeURIComponent(`Relatório de Divergência — NF ${divPayload.nfNumero} | ${divPayload.fornecedor}`);
        const fotos_note = (divPayload.fotos && divPayload.fotos.length > 0)
            ? `\n\n• Fotos da ocorrência: ${divPayload.fotos.length} imagem(ns) registrada(s) no sistema WMS (disponíveis para download).`
            : '';
        const body = encodeURIComponent(
`Prezado(a) Fornecedor — ${divPayload.fornecedor},

Informamos que foram registradas divergências no recebimento da NF ${divPayload.nfNumero} em nossa unidade.

=== RELATÓRIO DE DIVERGÊNCIA ===
• NF Número:           ${divPayload.nfNumero}
• Data da Ocorrência:  ${new Date(divPayload.dataOcorrencia).toLocaleString('pt-BR')}
• Tipo de Divergência: ${divPayload.tipo}
• Volumes Avariados:   ${divPayload.volumesAvariados || 0}
• Volumes Faltantes:   ${divPayload.volumesFaltantes || 0}
• Volumes em Excesso:  ${divPayload.volumesExcesso   || 0}
• Descrição:           ${divPayload.descricao || '—'}
• Operador de Receb.:  ${divPayload.operador  || '—'}${fotos_note}

Por favor, entre em contato para providenciar a regularização.

Atenciosamente,
${nomeRemetente}
${emailRemetente ? `<${emailRemetente}>` : ''}
--- Gerado automaticamente pelo WMS ParreiraLog ---`);

        const mailtoUrl = `mailto:${destinatario}?subject=${subject}&body=${body}`;
        window.open(mailtoUrl, '_blank');

        _logSync('proc_enviar_email_divergencia', 'wms→email', 'warning', `Fallback mailto: aberto para ${destinatario}`);
        return {
            status: 'warning',
            method: 'mailto',
            message: `Cliente de email aberto (mailto:). Configure EmailJS ou REST API nas integrações para envio automático silencioso.`
        };
    }

    // ==========================================================================
    // PROC 8 — CONFIRMAR CONFERÊNCIA DE ITENS (Micro-recebimento / SKUs)
    // ==========================================================================
    async function proc_confirmar_conferencia_itens(payload) {
        // @param {object} payload — { nfNumero, chaveNfe, operador, inicio, fim, itens: [{sku, divergenciaQty, lido, esperado}] }
        const { connectorId } = window.WmsIntegration.getStatus();

        if (connectorId !== 'standalone') {
            try {
                const res = await window.WmsIntegration.sync('product_conference', 'wms→erp', payload);
                if (res.status === 'error') throw new Error(res.message);
                _logSync('proc_confirmar_conferencia_itens', 'wms→erp', 'ok', `Conferência Produtos NF ${payload.nfNumero} repassada via ${connectorId}`);
                return res;
            } catch (err) {
                _logSync('proc_confirmar_conferencia_itens', 'wms→erp', 'error', `Falha ao integrar conferência NF ${payload.nfNumero}: ${err.message}`);
                throw new Error(`Falha na integração: ${err.message}`);
            }
        }

        // Mock Standalone / ERP Local
        try {
            const confList = JSON.parse(localStorage.getItem('erp_conferencias_itens') || '[]');
            confList.push({
                ...payload,
                integrationStatus: 'MOCK_OK',
                dataIntegracao: new Date().toISOString()
            });
            localStorage.setItem('erp_conferencias_itens', JSON.stringify(confList));

            _logSync('proc_confirmar_conferencia_itens', 'wms→erp', 'ok', `[MOCK] Conferência Itens NF ${payload.nfNumero} salva localmente.`);
            return { status: 'ok', message: 'Conferência gravada no Mock ERP com sucesso.' };
        } catch (e) {
            _logSync('proc_confirmar_conferencia_itens', 'wms→erp', 'error', e.message);
            throw e;
        }
    }
    // ==========================================================================
    // PROC: VERIFICAR PRÉ-ENTRADA
    // Consulta o ERP se existe uma pré-entrada (pedido de compra) vinculada
    // à NF informada. Se sim, retorna os itens com código interno do cadastro
    // de produtos do ERP (codigoInterno), que é o que permite a conferência.
    // Se não, a NF fica com status AGUARDANDO_PRE_ENTRADA.
    //
    // @param {string} chaveNfe  — Chave NF-e de 44 dígitos (sem máscara)
    // @returns {object} { found, pedidoCompra?, itens?, mensagem? }
    //   itens = [{ sku, codigoInterno, codigoBarras, descricao, quantidade, unidade }]
    // ==========================================================================
    async function proc_verificar_pre_entrada(chaveNfe) {
        const { id, cfg } = _getConnector();
        const chave = (chaveNfe || '').replace(/\D/g, '');

        // ── REST API genérica ──────────────────────────────────────────────────
        if (id === 'rest-api' && cfg.baseUrl) {
            try {
                const url = `${cfg.baseUrl.replace(/\/$/, '')}/pre-entrada?chave=${encodeURIComponent(chave)}`;
                const resp = await fetch(url, { method: 'GET', headers: _getRestHeaders(cfg), signal: AbortSignal.timeout(12000) });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const data = await resp.json();
                _logSync('proc_verificar_pre_entrada', 'erp→wms', data.found ? 'ok' : 'not_found',
                    data.found ? `Pré-entrada: PC ${data.pedidoCompra}` : 'Sem pré-entrada');
                return data;
            } catch(e) {
                _logSync('proc_verificar_pre_entrada', 'erp→wms', 'error', e.message);
                throw e;
            }
        }

        // ── Parreira ERP ───────────────────────────────────────────────────────
        if (id === 'parreira-erp') {
            _logSync('proc_verificar_pre_entrada', 'erp→wms', 'pending', 'Endpoint Parreira ERP pendente');
            return { found: false, mensagem: 'Integração Parreira ERP pendente.' };
        }

        // ── Maxdata ────────────────────────────────────────────────────────────
        if (id === 'maxdata') {
            try {
                const token   = await _maxdataGetToken();
                const entries = await _maxdataGetEntries(token);
                const entry   = entries.find(e => {
                    const eChave = (e.chaveNfe || e.accessKey || e.chave || '').replace(/\D/g,'');
                    return eChave === chave || String(e.nfNumero || e.id) === chave;
                });
                if (!entry) {
                    _logSync('proc_verificar_pre_entrada', 'erp→wms', 'not_found', 'Maxdata: NF não encontrada');
                    return { found: false, mensagem: 'NF não localizada no Maxdata.' };
                }
                const cfg2 = _maxdataCfg();
                const base = cfg2.baseUrl.replace(/\/$/, '');
                const itemsResp = await fetch(`${base}/entry/${entry.id}/items`, {
                    method: 'GET', headers: _maxdataHdrs(token), signal: AbortSignal.timeout(12000)
                });
                if (!itemsResp.ok) throw new Error(`Maxdata /items HTTP ${itemsResp.status}`);
                const itemsData = await itemsResp.json();
                const rawItems  = Array.isArray(itemsData) ? itemsData : (itemsData.data || itemsData.items || []);
                const itens = rawItems.map(it => ({
                    sku:           it.sku || it.codigo || it.code || String(it.id || ''),
                    codigoInterno: it.codigoInterno || it.internalCode || String(it.id || ''),
                    codigoBarras:  it.codigoBarras || it.ean || it.barcode || it.sku || '',
                    descricao:     it.descricao || it.description || it.nome || '',
                    quantidade:    Number(it.quantidade || it.qty || it.qtd || it.quantity || 0),
                    unidade:       it.unidade || it.unit || 'UN',
                    valorUnitario: Number(it.valorUnitario || it.preco || it.price || 0),
                    ncm:           it.ncm || '',
                    lote:          it.lote || it.batch || ''
                }));
                _logSync('proc_verificar_pre_entrada', 'erp→wms', 'ok',
                    `Maxdata: ${itens.length} item(ns) para NF ${entry.nfNumero || entry.id}`);
                return {
                    found:           true,
                    pedidoCompra:    entry.pedidoCompra || entry.purchaseOrder || '',
                    itens,
                    _maxdataEntryId: entry.id  // usado no markaschecked
                };
            } catch (e) {
                _logSync('proc_verificar_pre_entrada', 'erp→wms', 'error', e.message);
                return { found: false, mensagem: `Erro Maxdata: ${e.message}` };
            }
        }

        // ── MOCK Standalone ────────────────────────────────────────────────────
        // NF 9999 simula ausência de pré-entrada para testes
        await new Promise(r => setTimeout(r, 800));
        const mockNfs = _getMockNfs();
        const nfMatch = mockNfs.find(n => n.chaveNfe.replace(/\D/g,'') === chave);

        if (!nfMatch || !nfMatch.pedidoCompra || nfMatch.numero === '9999') {
            _logSync('proc_verificar_pre_entrada', 'erp→wms', 'not_found',
                `[MOCK] Sem pré-entrada para chave ...${chave.slice(-6)}`);
            return { found: false, mensagem: 'Pré-entrada não localizada para esta NF no ERP.' };
        }

        // Monta itens com código interno (simula mapeamento do cadastro do ERP)
        const itensComCodInterno = nfMatch.itens.map((it, idx) => ({
            sku:           it.sku,
            codigoInterno: `INT-${String(10000 + idx + Number(nfMatch.numero)).padStart(5,'0')}`,
            codigoBarras:  it.codigoBarras || it.sku,
            descricao:     it.descricao,
            quantidade:    it.quantidade,
            unidade:       it.unidade || 'UN',
            valorUnitario: it.valorUnitario || 0,
            ncm:           it.ncm || '',
            lote:          it.lote || ''
        }));

        _logSync('proc_verificar_pre_entrada', 'erp→wms', 'ok',
            `[MOCK] Pré-entrada OK: ${nfMatch.pedidoCompra} — ${itensComCodInterno.length} item(ns)`);

        return { found: true, pedidoCompra: nfMatch.pedidoCompra, itens: itensComCodInterno };
    }

    // ==========================================================================
    // PROC: ENVIAR CONFERÊNCIA — MAXDATA
    // Envia o resumo da conferência de recebimento para o ERP Maxdata.
    // O payload contém todos os dados; na integração real será decidido
    // se manda quantidade total conferida ou apenas as divergências.
    //
    // @param {object} payload
    //   {
    //     recebimentoId, nfNumero, chaveNfe, fornecedor, pedidoCompra,
    //     operador, inicio, fim, hasDivergencia,
    //     itens: [{ sku, codigoInterno, descricao, esperado, lido, divergencia }]
    //   }
    // ==========================================================================
    async function proc_enviar_conferencia_maxdata(payload) {
        const { id: connId, cfg } = _getConnector();

        // ── REST API genérica (Maxdata ou outro ERP via REST) ─────────────────
        if (connId === 'rest-api' && cfg.baseUrl) {
            try {
                const url = `${cfg.baseUrl.replace(/\/$/, '')}/conferencia/recebimento`;
                const body = {
                    // Identificação
                    nfNumero:      payload.nfNumero,
                    chaveNfe:      payload.chaveNfe,
                    pedidoCompra:  payload.pedidoCompra || '',
                    fornecedor:    payload.fornecedor,
                    operador:      payload.operador,
                    // Datas
                    dataInicio:    payload.inicio,
                    dataFim:       payload.fim,
                    // Status geral
                    comDivergencia: payload.hasDivergencia,
                    // Itens — manda tudo; o ERP decide o que usar
                    itens: (payload.itens || []).map(it => ({
                        codigoInterno: it.codigoInterno || it.sku,
                        sku:           it.sku,
                        descricao:     it.descricao,
                        quantidadeNF:  it.esperado,
                        quantidadeConferida: it.lido,
                        divergencia:   it.divergencia  // negativo=falta, positivo=excesso
                    }))
                };
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { ..._getRestHeaders(cfg), 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    signal: AbortSignal.timeout(15000)
                });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const data = await resp.json();
                _logSync('proc_enviar_conferencia_maxdata', 'wms→erp', 'ok',
                    `NF ${payload.nfNumero} enviada ao Maxdata. Protocolo: ${data.protocolo || '—'}`);
                return { ok: true, protocolo: data.protocolo };
            } catch(e) {
                _logSync('proc_enviar_conferencia_maxdata', 'wms→erp', 'error', e.message);
                throw e;
            }
        }

        // ── Maxdata: PUT /entry/markaschecked (com itens conferidos) ─────────
        if (connId === 'maxdata') {
            try {
                const token = await _maxdataGetToken();
                const cfg2  = _maxdataCfg();
                const base  = cfg2.baseUrl.replace(/\/$/, '');
                const body  = {
                    entryId:        payload._maxdataEntryId || payload._maxdataId || null,
                    nfNumero:       payload.nfNumero,
                    chaveNfe:       payload.chaveNfe,
                    operador:       payload.operador,
                    dataConferencia: payload.fim,
                    comDivergencia:  payload.hasDivergencia,
                    itens: (payload.itens || []).map(it => ({
                        codigoInterno:       it.codigoInterno || it.sku,
                        sku:                 it.sku,
                        descricao:           it.descricao,
                        quantidadeNF:        it.esperado,
                        quantidadeConferida: it.lido,
                        divergencia:         it.divergencia
                    }))
                };
                const resp = await fetch(`${base}/entry/markaschecked`, {
                    method: 'PUT', headers: _maxdataHdrs(token),
                    body: JSON.stringify(body), signal: AbortSignal.timeout(15000)
                });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                const data = await resp.json().catch(() => ({}));
                _logSync('proc_enviar_conferencia_maxdata', 'wms→erp', 'ok',
                    `Maxdata: NF ${payload.nfNumero} conferida. Protocolo: ${data.protocolo || data.id || '—'}`);
                return { ok: true, protocolo: data.protocolo || data.id || '' };
            } catch (e) {
                _logSync('proc_enviar_conferencia_maxdata', 'wms→erp', 'error', e.message);
                throw e;
            }
        }

        // ── MOCK ──────────────────────────────────────────────────────────────
        await new Promise(r => setTimeout(r, 600));
        _logSync('proc_enviar_conferencia_maxdata', 'wms→erp', 'ok',
            `[MOCK] NF ${payload.nfNumero} enviada | ${payload.itens?.length || 0} itens | Diverg: ${payload.hasDivergencia}`);
        console.log('[MOCK] Payload Maxdata:', JSON.stringify(payload, null, 2));
        return { ok: true, protocolo: 'MOCK-' + Date.now() };
    }

    // ─── EXPORT GLOBAL ────────────────────────────────────────────────────────

    window.WmsProcedures = {
        proc_buscar_nf_destinada,
        proc_buscar_nf_por_numero,
        proc_verificar_pre_entrada,
        proc_confirmar_recebimento,
        proc_registrar_divergencia,
        proc_validar_pin_supervisor,
        proc_registrar_entrada_avulsa,
        proc_enviar_email_divergencia,
        proc_confirmar_conferencia_itens,
        proc_enviar_conferencia_maxdata,
        _normalizeNf,
        _getMockNfs
    };

    console.log('📋 WMS Procedures carregadas (v2.0.0) — 8 procedures Multi-ERP disponíveis');

})();
