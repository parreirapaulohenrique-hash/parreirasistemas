/**
 * demanda-filial.js — Controle de Filial (empresa MaxData) da Cotação
 * ===================================================================
 * - Filial padrão do usuário (por login, salva no navegador)
 * - Filial da cotação atual (padrão do usuário, cliente ou escolha manual)
 * - Preço de venda / estoque POR FILIAL a partir de window.ERP_FILIAIS
 *   (gerado pelo sync MaxData com os dados "multiloja" de cada produto)
 */
const DemandaFilial = (() => {

    // empId (MaxData) -> nome exibido. Ajustável em localStorage 'demanda_filiais_nomes'.
    const _NOMES_PADRAO = {
        1: '1.CTR MATRIZ',
        2: '2.CTR PALMAS VAREJO',
        3: '4.CTR PORTO',
        5: '5.CTR REDENÇÃO'
    };

    let _atual = null; // filial da cotação em edição

    function _login() {
        try {
            const s = (window.ParreiraAuth && ParreiraAuth.getSessao) ? ParreiraAuth.getSessao() : null;
            return s ? String(s.login || s.email || s.nome || 'anon').toLowerCase() : 'anon';
        } catch (_) { return 'anon'; }
    }

    function _nomes() {
        const n = Object.assign({}, _NOMES_PADRAO);
        try {
            const extra = JSON.parse(localStorage.getItem('demanda_filiais_nomes') || 'null');
            if (extra && typeof extra === 'object') Object.assign(n, extra);
        } catch (_) {}
        return n;
    }

    /** Lista de filiais disponíveis: [{ empId, nome }] */
    function listar() {
        const nomes = _nomes();
        const ids = new Set(Object.keys(nomes).map(Number));
        if (window.ERP_FILIAIS && Array.isArray(window.ERP_FILIAIS.emps)) window.ERP_FILIAIS.emps.forEach(e => ids.add(Number(e)));
        return Array.from(ids).filter(n => !isNaN(n)).sort((a, b) => a - b).map(e => ({ empId: e, nome: nomes[e] || ('Filial ' + e) }));
    }

    function nome(empId) {
        const n = _nomes()[Number(empId)];
        return n || (empId ? 'Filial ' + empId : '—');
    }

    // ── Filial padrão do usuário ─────────────────────────────
    function padraoUsuario() {
        const v = Number(localStorage.getItem('demanda_filial_padrao_' + _login()) || 0);
        return v > 0 ? v : null;
    }
    function definirPadraoUsuario(empId) {
        const v = Number(empId);
        if (v > 0) localStorage.setItem('demanda_filial_padrao_' + _login(), String(v));
    }

    // ── Filial da cotação atual ──────────────────────────────
    function atual() { return _atual || padraoUsuario() || 1; }
    /** Filial escolhida para a cotação (null enquanto não for escolhida) */
    function selecionada() { return _atual || null; }
    function definirAtual(empId) { const v = Number(empId); _atual = v > 0 ? v : null; return atual(); }
    function resetarAtual() { _atual = null; return atual(); }

    /** Filiais onde o cliente tem cadastro (campo 'filiais' do cadastro sincronizado) */
    function filiaisDoCliente(cli) {
        if (!cli) return [];
        const arr = Array.isArray(cli.filiais) ? cli.filiais : (cli.empIds || []);
        return Array.from(new Set(arr.map(Number).filter(n => n > 0)));
    }

    // ── Preço / estoque por filial ───────────────────────────
    function _idx(empId) {
        const F = window.ERP_FILIAIS;
        if (!F || !Array.isArray(F.emps)) return -1;
        return F.emps.indexOf(Number(empId));
    }

    /**
     * Preço de venda do produto na filial.
     * @returns {{v:number, empId:number, exato:boolean}} exato=false quando caiu no preço da filial 1
     */
    function preco(prodId, empId) {
        const emp = Number(empId || atual());
        const id = String(prodId || '').trim();
        const F = window.ERP_FILIAIS;
        if (id && F && F.p && F.p[id]) {
            const i = _idx(emp);
            if (i >= 0 && Number(F.p[id][i]) > 0) return { v: Number(F.p[id][i]), empId: emp, exato: true };
        }
        const base = (window.ERP_PRICES_BY_ID && id) ? window.ERP_PRICES_BY_ID[id] : null;
        const v1 = base ? Number(base.v || 0) : 0;
        return { v: v1, empId: 1, exato: emp === 1 && v1 > 0 };
    }

    /** Estoque do produto na filial (null se não houver dado por filial) */
    function estoque(prodId, empId) {
        const F = window.ERP_FILIAIS;
        if (!F || !F.p) return null;
        const id = String(prodId || '').trim();
        if (!F.p[id]) return null;
        const i = _idx(empId || atual());
        if (i < 0) return null;
        return F.e && F.e[id] ? Number(F.e[id][i] || 0) : 0;
    }

    function temDadosPorFilial() { return !!(window.ERP_FILIAIS && window.ERP_FILIAIS.p); }

    return { listar, nome, padraoUsuario, definirPadraoUsuario, atual, selecionada, definirAtual, resetarAtual,
             filiaisDoCliente, preco, estoque, temDadosPorFilial };
})();

if (typeof window !== 'undefined') window.DemandaFilial = DemandaFilial;
