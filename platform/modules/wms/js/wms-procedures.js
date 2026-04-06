// =============================================================================
// WMS Procedures — Camada de Integração Multi-ERP
// Versão: 1.0.0 | WMS v1.7.0
//
// Procedures são os PONTOS DE INTEGRAÇÃO padronizados entre o WMS e qualquer ERP.
// Cada procedure tem implementações para: standalone (mock), parreira-erp e rest-api.
// Nunca acesse o ERP diretamente de outros módulos — passe sempre por uma procedure.
//
// FLUXO DE RECEBIMENTO:
//   proc_buscar_nf_destinada   → ERP → WMS  (consulta NF na fila de pedidos)
//   proc_buscar_nf_por_numero  → ERP → WMS  (fallback por número+série)
//   proc_confirmar_recebimento → WMS → ERP  (push de recebimento confirmado)
//   proc_registrar_divergencia → WMS → ERP  (push de divergência de volumes)
//   proc_validar_pin_supervisor → local     (valida PIN configurável de supervisor)
//   proc_registrar_entrada_avulsa → WMS log (auditoria de entradas sem NF)
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
        } else {
            result = await _buscarNf_standalone(chaveClean, cnpjs);
        }

        _logSync('proc_buscar_nf_destinada', 'erp→wms', result.found ? 'ok' : 'not_found',
            result.found ? `NF ${result.nf.numero} encontrada` : 'NF não localizada');

        return result;
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
        const matches = pedidos.filter(p => {
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

    // ─── EXPORT GLOBAL ────────────────────────────────────────────────────────

    window.WmsProcedures = {
        proc_buscar_nf_destinada,
        proc_buscar_nf_por_numero,
        proc_confirmar_recebimento,
        proc_registrar_divergencia,
        proc_validar_pin_supervisor,
        proc_registrar_entrada_avulsa,
        proc_enviar_email_divergencia,
        // Utilitários expostos para uso em outros módulos
        _normalizeNf,
        _getMockNfs
    };

    console.log('📋 WMS Procedures carregadas (v1.0.0) — 7 procedures Multi-ERP disponíveis');

})();
