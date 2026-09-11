/**
 * maxcrm-db.js — Camada de Persistência Local (IndexedDB)
 * =========================================================
 * Gerencia o banco local do promotor no dispositivo.
 * Toda operação de leitura/escrita local passa por aqui.
 * A sincronização com o Firestore é responsabilidade do maxcrm-sync.js
 *
 * Stores:
 *   - empresas      : cadastros de prospects/clientes
 *   - visitas       : visitas realizadas (com todas as respostas)
 *   - contatos      : contatos de cada empresa
 *   - erp_concorrentes : banco de ERPs concorrentes
 *   - sync_queue    : fila de itens pendentes de sincronização
 *
 * Parreira Sistemas — MAXCRM Campo v1.0.0
 */

const MaxCRMDB = (() => {

    const DB_NAME    = 'maxcrm_campo';
    const DB_VERSION = 1;
    let _db = null;

    // ── Inicialização do IndexedDB ──────────────────────────────────────────
    function open() {
        if (_db) return Promise.resolve(_db);

        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Store: empresas
                if (!db.objectStoreNames.contains('empresas')) {
                    const s = db.createObjectStore('empresas', { keyPath: 'id' });
                    s.createIndex('cnpj',       'cnpj',       { unique: false });
                    s.createIndex('razaoSocial', 'razaoSocial', { unique: false });
                    s.createIndex('cidade',      'cidade',     { unique: false });
                    s.createIndex('status',      'status',     { unique: false });
                    s.createIndex('syncStatus',  'syncStatus', { unique: false });
                }

                // Store: visitas
                if (!db.objectStoreNames.contains('visitas')) {
                    const s = db.createObjectStore('visitas', { keyPath: 'id' });
                    s.createIndex('empresaId',  'empresaId',  { unique: false });
                    s.createIndex('promotorId', 'promotorId', { unique: false });
                    s.createIndex('data',       'data',       { unique: false });
                    s.createIndex('syncStatus', 'syncStatus', { unique: false });
                }

                // Store: contatos
                if (!db.objectStoreNames.contains('contatos')) {
                    const s = db.createObjectStore('contatos', { keyPath: 'id' });
                    s.createIndex('empresaId', 'empresaId', { unique: false });
                    s.createIndex('syncStatus','syncStatus', { unique: false });
                }

                // Store: erp_concorrentes
                if (!db.objectStoreNames.contains('erp_concorrentes')) {
                    const s = db.createObjectStore('erp_concorrentes', { keyPath: 'id' });
                    s.createIndex('nome', 'nome', { unique: false });
                }

                // Store: sync_queue (fila de pendentes)
                if (!db.objectStoreNames.contains('sync_queue')) {
                    const s = db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
                    s.createIndex('tipo',    'tipo',    { unique: false });
                    s.createIndex('status',  'status',  { unique: false });
                    s.createIndex('criadoEm','criadoEm',{ unique: false });
                }

                console.log('[MaxCRMDB] IndexedDB criado/atualizado v' + DB_VERSION);
            };

            req.onsuccess  = (e) => { _db = e.target.result; resolve(_db); };
            req.onerror    = (e) => reject(new Error('[MaxCRMDB] Erro ao abrir IndexedDB: ' + e.target.errorCode));
        });
    }

    // ── Helper: transação de escrita ────────────────────────────────────────
    function _tx(store, mode = 'readonly') {
        return _db.transaction([store], mode).objectStore(store);
    }

    function _put(storeName, obj) {
        return new Promise((resolve, reject) => {
            const s = _tx(storeName, 'readwrite');
            const r = s.put(obj);
            r.onsuccess = () => resolve(r.result);
            r.onerror   = (e) => reject(e.target.error);
        });
    }

    function _get(storeName, key) {
        return new Promise((resolve, reject) => {
            const r = _tx(storeName).get(key);
            r.onsuccess = () => resolve(r.result || null);
            r.onerror   = (e) => reject(e.target.error);
        });
    }

    function _getAll(storeName) {
        return new Promise((resolve, reject) => {
            const r = _tx(storeName).getAll();
            r.onsuccess = () => resolve(r.result || []);
            r.onerror   = (e) => reject(e.target.error);
        });
    }

    function _delete(storeName, key) {
        return new Promise((resolve, reject) => {
            const s = _tx(storeName, 'readwrite');
            const r = s.delete(key);
            r.onsuccess = () => resolve();
            r.onerror   = (e) => reject(e.target.error);
        });
    }

    function _getByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            const idx = _tx(storeName).index(indexName);
            const r   = idx.getAll(value);
            r.onsuccess = () => resolve(r.result || []);
            r.onerror   = (e) => reject(e.target.error);
        });
    }

    // ── Geração de ID local ──────────────────────────────────────────────────
    function _uid() {
        return 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // ════════════════════════════════════════════════════════════════════════
    //  EMPRESAS
    // ════════════════════════════════════════════════════════════════════════

    async function salvarEmpresa(dados) {
        const empresa = {
            id:           dados.id || _uid(),
            tenantId:     'parreira',
            cnpj:         dados.cnpj         || '',
            razaoSocial:  dados.razaoSocial  || '',
            nomeFantasia: dados.nomeFantasia  || '',
            segmento:     dados.segmento      || '',
            endereco:     dados.endereco      || '',
            numero:       dados.numero        || '',
            bairro:       dados.bairro        || '',
            cidade:       dados.cidade        || '',
            uf:           dados.uf            || '',
            cep:          dados.cep           || '',
            telefone:     dados.telefone      || '',
            whatsapp:     dados.whatsapp      || '',
            email:        dados.email         || '',
            site:         dados.site          || '',
            numFuncionarios: dados.numFuncionarios || null,
            numFiliais:   dados.numFiliais    || null,
            status:       dados.status        || 'prospecto',
            leadScore:    dados.leadScore      || 0,
            responsavelId: dados.responsavelId || null,
            criadoEm:     dados.criadoEm      || new Date().toISOString(),
            atualizadoEm: new Date().toISOString(),
            syncStatus:   dados.syncStatus    || 'pending',
            _localOnly:   !dados.id || dados._localOnly || false
        };
        await _put('empresas', empresa);
        await _enqueueSync('empresa', empresa.id, 'upsert');
        return empresa;
    }

    async function getEmpresa(id) {
        return _get('empresas', id);
    }

    async function listarEmpresas() {
        const all = await _getAll('empresas');
        return all.sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
    }

    async function buscarEmpresas(termo) {
        const all = await _getAll('empresas');
        const t = (termo || '').trim().toLowerCase();
        if (!t) return all;
        return all.filter(e =>
            (e.razaoSocial  || '').toLowerCase().includes(t) ||
            (e.nomeFantasia || '').toLowerCase().includes(t) ||
            (e.cnpj         || '').replace(/\D/g,'').includes(t.replace(/\D/g,'')) ||
            (e.cidade       || '').toLowerCase().includes(t) ||
            (e.telefone     || '').replace(/\D/g,'').includes(t.replace(/\D/g,''))
        );
    }

    // ════════════════════════════════════════════════════════════════════════
    //  CONTATOS
    // ════════════════════════════════════════════════════════════════════════

    async function salvarContato(dados) {
        const contato = {
            id:          dados.id || _uid(),
            empresaId:   dados.empresaId || '',
            nome:        dados.nome || '',
            cargo:       dados.cargo || '',
            departamento:dados.departamento || '',
            telefone:    dados.telefone || '',
            whatsapp:    dados.whatsapp || '',
            email:       dados.email || '',
            papel:       dados.papel || 'usuario', // decisor, influenciador, usuario, etc.
            decisorPrincipal: dados.decisorPrincipal || false,
            criadoEm:    dados.criadoEm || new Date().toISOString(),
            atualizadoEm: new Date().toISOString(),
            syncStatus:  'pending'
        };
        await _put('contatos', contato);
        await _enqueueSync('contato', contato.id, 'upsert');
        return contato;
    }

    async function getContatosEmpresa(empresaId) {
        return _getByIndex('contatos', 'empresaId', empresaId);
    }

    // ════════════════════════════════════════════════════════════════════════
    //  VISITAS
    // ════════════════════════════════════════════════════════════════════════

    async function iniciarVisita(dados) {
        const visita = {
            id:            dados.id || _uid(),
            empresaId:     dados.empresaId || '',
            empresaNome:   dados.empresaNome || '',
            promotorId:    dados.promotorId || '',
            promotorNome:  dados.promotorNome || '',
            tenantId:      'parreira',
            data:          dados.data || new Date().toISOString().split('T')[0],
            inicioTs:      new Date().toISOString(),
            fimTs:         null,
            duracaoMin:    null,
            latitude:      dados.latitude || null,
            longitude:     dados.longitude || null,
            dispositivo:   navigator.userAgent,
            status:        'em_andamento',

            // Respostas do questionário (preenchidas progressivamente)
            respostas: {
                contatos:           [],
                perfil:             {},
                erpAtual:           {},
                pontosFortes:       [],
                dores:              [],
                tresMudancas:       { mudanca1: '', mudanca2: '', mudanca3: '' },
                intencaoTroca:      null,
                sistemasAvaliando:  [],
                barreiras:          [],
                interesse:          null,
                aceitaDemo:         null,
                timing:             null,
                proximaAcao:        {},
                observacoes:        ''
            },

            etapaAtual:  'contato',
            etapasOk:    [],
            syncStatus:  'pending',
            criadoEm:    new Date().toISOString(),
            atualizadoEm: new Date().toISOString(),
            sincronizadoEm: null
        };
        await _put('visitas', visita);
        return visita;
    }

    async function salvarProgresso(visitaId, campos) {
        const visita = await _get('visitas', visitaId);
        if (!visita) throw new Error('[MaxCRMDB] Visita não encontrada: ' + visitaId);

        const atualizada = {
            ...visita,
            ...campos,
            respostas:   { ...visita.respostas, ...(campos.respostas || {}) },
            atualizadoEm: new Date().toISOString(),
            syncStatus:   'pending'
        };
        await _put('visitas', atualizada);
        // NÃO enfileira sync a cada save intermediário — só na finalização
        return atualizada;
    }

    async function finalizarVisita(visitaId) {
        const visita = await _get('visitas', visitaId);
        if (!visita) throw new Error('[MaxCRMDB] Visita não encontrada: ' + visitaId);

        const fimTs       = new Date().toISOString();
        const inicio      = new Date(visita.inicioTs);
        const fim         = new Date(fimTs);
        const duracaoMin  = Math.round((fim - inicio) / 60000);

        const finalizada = {
            ...visita,
            status:       'finalizada',
            fimTs,
            duracaoMin,
            atualizadoEm: fimTs,
            syncStatus:   'pending'
        };
        await _put('visitas', finalizada);
        await _enqueueSync('visita', visitaId, 'upsert');
        return finalizada;
    }

    async function getVisita(id) {
        return _get('visitas', id);
    }

    async function listarVisitas(limite = 50) {
        const all = await _getAll('visitas');
        return all
            .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
            .slice(0, limite);
    }

    async function getVisitasEmpresa(empresaId) {
        return _getByIndex('visitas', 'empresaId', empresaId);
    }

    async function getPendentesSync() {
        return _getByIndex('visitas', 'syncStatus', 'pending');
    }

    // ════════════════════════════════════════════════════════════════════════
    //  ERP CONCORRENTES
    // ════════════════════════════════════════════════════════════════════════

    async function listarERPs() {
        const all = await _getAll('erp_concorrentes');
        return all.sort((a, b) => a.nome.localeCompare(b.nome));
    }

    async function salvarERP(dados) {
        const erp = {
            id:           dados.id || _uid(),
            nome:         dados.nome || '',
            fornecedor:   dados.fornecedor || '',
            categoria:    dados.categoria || 'erp',
            ativo:        dados.ativo !== false
        };
        await _put('erp_concorrentes', erp);
        return erp;
    }

    async function popularERPsIniciais() {
        const erpsIniciais = [
            { id: 'totvs-protheus',  nome: 'TOTVS Protheus',      fornecedor: 'TOTVS' },
            { id: 'totvs-datasul',   nome: 'TOTVS Datasul',       fornecedor: 'TOTVS' },
            { id: 'totvs-rm',        nome: 'TOTVS RM',            fornecedor: 'TOTVS' },
            { id: 'sap-b1',          nome: 'SAP Business One',     fornecedor: 'SAP' },
            { id: 'sankhya',         nome: 'Sankhya',              fornecedor: 'Sankhya' },
            { id: 'senior',          nome: 'Senior Sistemas',      fornecedor: 'Senior' },
            { id: 'omie',            nome: 'Omie',                 fornecedor: 'Omie' },
            { id: 'bling',           nome: 'Bling',                fornecedor: 'Bling' },
            { id: 'tiny',            nome: 'Tiny ERP',             fornecedor: 'Olist' },
            { id: 'nfe-io',          nome: 'NFe.io',               fornecedor: 'NFe.io' },
            { id: 'linx',            nome: 'Linx',                 fornecedor: 'Linx' },
            { id: 'cigam',           nome: 'CIGAM',                fornecedor: 'CIGAM' },
            { id: 'oracle-erp',      nome: 'Oracle ERP Cloud',     fornecedor: 'Oracle' },
            { id: 'microsiga',       nome: 'Microsiga',            fornecedor: 'TOTVS' },
            { id: 'metix',           nome: 'Metix',                fornecedor: 'Metix' },
            { id: 'sistema-uno',     nome: 'Sistema Uno',          fornecedor: 'Uno' },
            { id: 'novasoft',        nome: 'Novasoft',             fornecedor: 'Novasoft' },
            { id: 'webmais',         nome: 'WebMais',              fornecedor: 'WebMais' },
            { id: 'alterdata',       nome: 'Alterdata',            fornecedor: 'Alterdata' },
            { id: 'siaf',            nome: 'SIAF',                 fornecedor: 'SIAF' },
            { id: 'planilha',        nome: 'Planilha Excel',       fornecedor: 'Microsoft' },
            { id: 'srk',             nome: 'SRK',                  fornecedor: 'SRK Sistemas' },
            { id: 'sem-erp',         nome: 'Sem sistema / Manual', fornecedor: '-' },
            { id: 'outro',           nome: 'Outro (não listado)',   fornecedor: '-' }
        ];

        for (const erp of erpsIniciais) {
            const existente = await _get('erp_concorrentes', erp.id);
            if (!existente) {
                await _put('erp_concorrentes', { ...erp, ativo: true });
            }
        }
        console.log('[MaxCRMDB] ERPs iniciais populados:', erpsIniciais.length);
    }

    // ════════════════════════════════════════════════════════════════════════
    //  FILA DE SINCRONIZAÇÃO
    // ════════════════════════════════════════════════════════════════════════

    async function _enqueueSync(tipo, referenciaId, operacao) {
        const item = {
            tipo,
            referenciaId,
            operacao,
            status:   'pending',
            tentativas: 0,
            criadoEm: new Date().toISOString(),
            erroMsg:  null
        };
        const s = _tx('sync_queue', 'readwrite');
        return new Promise((resolve, reject) => {
            const r = s.add(item);
            r.onsuccess = () => resolve(r.result);
            r.onerror   = (e) => reject(e.target.error);
        });
    }

    async function getFilaSync() {
        // Retorna pending E error (para contarPendentes mostrar status real)
        const pending = await _getByIndex('sync_queue', 'status', 'pending');
        const errors  = await _getByIndex('sync_queue', 'status', 'error');
        return [...pending, ...errors];
    }

    async function marcarSyncOk(queueId, referenciaId, store) {
        // Atualiza status do item na fila
        const s = _tx('sync_queue', 'readwrite');
        const item = await new Promise((res, rej) => {
            const r = s.get(queueId);
            r.onsuccess = () => res(r.result);
            r.onerror   = (e) => rej(e.target.error);
        });
        if (item) {
            item.status = 'done';
            await new Promise((res) => { const r = s.put(item); r.onsuccess = res; });
        }
        // fix: também atualiza o syncStatus do registro original (visita/empresa/contato)
        if (referenciaId && store && ['visitas', 'empresas', 'contatos'].includes(store)) {
            try {
                const st = _tx(store, 'readwrite');
                const rec = await new Promise((res) => {
                    const r = st.get(referenciaId);
                    r.onsuccess = () => res(r.result);
                    r.onerror = () => res(null);
                });
                if (rec) {
                    rec.syncStatus = 'synced';
                    rec.sincronizadoEm = new Date().toISOString();
                    await new Promise((res) => { const r = st.put(rec); r.onsuccess = res; });
                }
            } catch(e) { console.warn('[MaxCRMDB] marcarSyncOk: erro ao atualizar registro:', e); }
        }

        // Atualiza syncStatus da entidade
        if (store && referenciaId) {
            const entidade = await _get(store, referenciaId);
            if (entidade) {
                entidade.syncStatus     = 'synced';
                entidade.sincronizadoEm = new Date().toISOString();
                await _put(store, entidade);
            }
        }
    }

    async function marcarSyncErro(queueId, erro) {
        const s    = _tx('sync_queue', 'readwrite');
        const item = await new Promise((res, rej) => {
            const r = s.get(queueId);
            r.onsuccess = () => res(r.result);
            r.onerror   = (e) => rej(e.target.error);
        });
        if (item) {
            item.status     = 'error';
            item.tentativas = (item.tentativas || 0) + 1;
            item.erroMsg    = erro;
            await new Promise((res) => { const r = s.put(item); r.onsuccess = res; });
        }
    }

    async function resetarErrosSync() {
        const s    = _tx('sync_queue', 'readwrite');
        const erros = await _getByIndex('sync_queue', 'status', 'error');
        for (const item of erros) {
            item.status = 'pending';
            item.tentativas = 0;
            await new Promise((res) => { const r = s.put(item); r.onsuccess = res; });
        }
    }

    // ── API Pública ─────────────────────────────────────────────────────────
    return {
        // Init
        open,

        // Empresas
        salvarEmpresa,
        getEmpresa,
        listarEmpresas,
        buscarEmpresas,

        // Contatos
        salvarContato,
        getContatosEmpresa,

        // Visitas
        iniciarVisita,
        salvarProgresso,
        finalizarVisita,
        getVisita,
        listarVisitas,
        getVisitasEmpresa,
        getPendentesSync,

        // ERPs
        listarERPs,
        salvarERP,
        popularERPsIniciais,

        // Sync
        getFilaSync,
        marcarSyncOk,
        marcarSyncErro,
        resetarErrosSync
    };

})();

window.MaxCRMDB = MaxCRMDB;
console.log('✅ MaxCRMDB (IndexedDB) carregado');