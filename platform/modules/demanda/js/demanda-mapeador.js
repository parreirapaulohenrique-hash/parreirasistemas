/**
 * demanda-mapeador.js — Mapeador de Colunas da Importação (Fase 1: Excel/CSV + texto)
 * ===================================================================================
 * Fluxo: documento -> grade (linhas x colunas) -> SUGESTÃO do padrão (modelo salvo ou
 * automático) -> operador revisa (arrasta colunas, junta Ref+Desc, define linhas)
 * -> confirma -> itens vão para a Conferência (busca nas tabelas).
 *
 * Modelos ficam em Firestore: <BASE_PATH>/data/mapeadorModelos (todos os operadores)
 * com cópia em localStorage. A sugestão NUNCA é aplicada sem o clique do operador.
 */
const DemandaMapeador = (() => {

    // ── Campos ──────────────────────────────────────────────
    const CAMPOS = {
        ref:        { label: 'Referência',   fixo: true,  cor: '#60a5fa' },
        desc:       { label: 'Descrição',    fixo: true,  cor: '#a78bfa' },
        qtde:       { label: 'Qtde',         fixo: true,  cor: '#34d399' },
        item:       { label: 'Item',         fixo: false, cor: '#94a3b8' },
        codInterno: { label: 'Cód. interno', fixo: false, cor: '#94a3b8' },
        marca:      { label: 'Marca',        fixo: false, cor: '#f59e0b' },
        unit:       { label: 'Valor unit.',  fixo: false, cor: '#f472b6' },
        total:      { label: 'Valor total',  fixo: false, cor: '#fb7185' },
        obs:        { label: 'Obs',          fixo: false, cor: '#94a3b8' },
    };
    const ORDEM_CAMPOS = ['ref', 'desc', 'qtde', 'item', 'codInterno', 'marca', 'unit', 'total', 'obs'];
    const SEPARADORES = [
        { v: 'auto', label: 'Automático (código no início ou fim)' },
        { v: ' - ',  label: '" - " (traço com espaços)' },
        { v: '-',    label: '"-" (traço)' },
        { v: ' ',    label: 'Espaço' },
        { v: '/',    label: '"/" (barra)' },
        { v: 'custom', label: 'Outro…' },
    ];
    const MAX_LINHAS_VIEW = 300;
    const LS_MODELOS = 'demanda_mapeador_modelos';

    let _st = null;          // estado da sessão aberta
    let _modelos = [];       // modelos carregados
    let _dragCampo = null;   // campo sendo arrastado

    const $ = (id) => document.getElementById(id);
    const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const U = () => (window.DemandaImport && DemandaImport._util) || {};
    const _cel = (row, i) => { const v = row ? row[i] : ''; return v == null ? '' : v; };
    const _str = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

    function _toast(msg, tipo) {
        if (_st && typeof _st.toast === 'function') return _st.toast(msg, tipo);
        console.log('[Mapeador]', msg);
    }

    // ── Números pt-BR ───────────────────────────────────────
    function _num(v) {
        if (typeof v === 'number') return isFinite(v) ? v : 0;
        let s = _str(v).replace(/^R\$\s*/i, '').replace(/[^\d.,-]/g, '');
        if (!s) return 0;
        if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
        else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
        const n = parseFloat(s);
        return isNaN(n) ? 0 : n;
    }

    // ── Estrutura de configuração ───────────────────────────
    // cfg = { slots: [{campos:[], sep:'auto', sepCustom:'', ocorr:'primeira'}], inicio, excluidas:[] }
    function _novoSlot() { return { campos: [], sep: 'auto', sepCustom: '', ocorr: 'primeira' }; }
    function _nCols(rows) { return Math.max(1, ...rows.slice(0, 500).map(r => r.length)); }
    function _cfgVazia(n) { return { slots: Array.from({ length: n }, _novoSlot), inicio: 0, fim: null, excluidas: [] }; }

    // ── Sugestão automática ─────────────────────────────────
    const PADROES_TITULO = [
        ['codInterno', /c[oó]d\.?\s*(int|interno)|interno|c[oó]d\.?\s*(cli|forn)/i],
        ['total',      /total/i],
        ['unit',       /pre[çc]o|valor\s*unit|vl\.?\s*unit|unit[áa]rio|^valor$|^vlr/i],
        ['qtde',       /^(qtde?|qtd|quant|qty|qt\.?)\b|quantidade/i],
        ['ref',        /^(ref|c[oó]d|part\s*n|p\/n|pn$)|refer[eê]ncia|c[oó]digo|n[úu]mero\s*(da\s*)?pe[çc]a/i],
        ['desc',       /desc|produto|^pe[çc]as?$|denomina|material|^itens?\s*desc/i],
        ['marca',      /marca|fabric|brand/i],
        ['obs',        /^obs|observ|coment/i],
        ['item',       /^(item|it|seq|n[º°o]\.?|#)$/i],
    ];

    function _detectarTitulos(row) {
        const achados = {};
        row.forEach((c, idx) => {
            const t = _str(c).toLowerCase();
            if (!t || t.length > 40) return;
            for (const [campo, pat] of PADROES_TITULO) {
                if (achados[campo] == null && pat.test(t)) { achados[campo] = idx; break; }
            }
        });
        return achados;
    }

    function sugerir(rows) {
        const n = _nCols(rows);
        const cfg = _cfgVazia(n);
        // 1. cabeçalho nas 10 primeiras linhas
        let hdr = -1, mapa = {}, melhor = 0;
        for (let i = 0; i < Math.min(10, rows.length); i++) {
            const m = _detectarTitulos(rows[i]);
            const sc = Object.keys(m).length;
            if (sc > melhor) { melhor = sc; hdr = i; mapa = m; }
        }
        if (melhor < 1) { hdr = -1; mapa = {}; }
        cfg.inicio = hdr + 1;
        const dados = rows.slice(cfg.inicio);
        Object.entries(mapa).forEach(([campo, idx]) => { if (!cfg.slots[idx].campos.length) cfg.slots[idx].campos = [campo]; });

        const usadas = () => new Set(cfg.slots.map((s, i) => s.campos.length ? i : -1).filter(i => i >= 0));
        const amostra = dados.slice(0, 80);

        // 2. descrição pelo conteúdo (coluna com mais textos)
        if (mapa.desc == null && mapa.ref == null) {
            let best = -1, bestSc = 0;
            for (let c = 0; c < n; c++) {
                if (usadas().has(c)) continue;
                const sc = amostra.filter(r => { const v = _str(_cel(r, c)); return v.length >= 4 && /[A-Za-zÀ-ÿ]{3,}/.test(v); }).length;
                if (sc > bestSc) { bestSc = sc; best = c; }
            }
            if (best >= 0 && bestSc >= Math.max(1, amostra.length * 0.3)) { cfg.slots[best].campos = ['desc']; mapa.desc = best; }
        }
        // 3. Sem coluna de referência: a descrição traz "CÓDIGO - DESCRIÇÃO"?
        if (mapa.ref == null && mapa.desc != null && U().splitCodigoDescricao) {
            const comCod = amostra.filter(r => U().splitCodigoDescricao(_str(_cel(r, mapa.desc))).ref).length;
            if (comCod >= Math.max(1, amostra.length * 0.5)) {
                cfg.slots[mapa.desc].campos = ['ref', 'desc'];
                cfg.slots[mapa.desc].sep = 'auto';
                mapa.ref = mapa.desc;
            } else {
                // coluna com códigos de peça
                let best = -1, bestSc = 0;
                for (let c = 0; c < n; c++) {
                    if (usadas().has(c)) continue;
                    const sc = amostra.filter(r => { const v = _str(_cel(r, c)); return v && U().isPartCode && U().isPartCode(v) && !/\s{1}\S+\s\S+/.test(v); }).length;
                    if (sc > bestSc) { bestSc = sc; best = c; }
                }
                if (best >= 0 && bestSc >= amostra.length * 0.5) { cfg.slots[best].campos = ['ref']; mapa.ref = best; }
            }
        }
        // 4. Qtde pelo conteúdo (apenas números inteiros ou decimais típicos de quantidade)
        // Só sugere se NÃO tiver formato de NCM (xxxx.xx.xx ou 8 dígitos), código ou data,
        // e se pelo menos 75% dos valores forem estritamente numéricos pequenos (1 a 999)
        if (mapa.qtde == null) {
            let best = -1, bestSc = 0;
            for (let c = 0; c < n; c++) {
                if (usadas().has(c)) continue;
                let ehNcmOuCodigo = 0;
                let ehQtdeValida = 0;
                let preenchidos = 0;
                amostra.forEach(r => {
                    const v = _str(_cel(r, c)).trim();
                    if (!v) return;
                    preenchidos++;
                    if (/^\d{4}\.\d{2}\.\d{2}$|^\d{8}$|^\d{1,2}\/\d{1,2}/.test(v) || /[A-Za-z]{2,}/.test(v)) {
                        ehNcmOuCodigo++;
                    } else {
                        const numLimpo = v.replace(/\b(?:un|und|pç|pc|cx|jg|mts?|kg)\b/gi, '').trim();
                        const x = _num(numLimpo);
                        if (x > 0 && x <= 999 && /^[\d.,\s]+$/.test(numLimpo)) {
                            ehQtdeValida++;
                        }
                    }
                });
                if (preenchidos > 0 && ehNcmOuCodigo === 0 && (ehQtdeValida / preenchidos) >= 0.75) {
                    if (ehQtdeValida > bestSc) { bestSc = ehQtdeValida; best = c; }
                }
            }
            if (best >= 0 && bestSc >= Math.max(2, amostra.length * 0.5)) {
                cfg.slots[best].campos = ['qtde'];
            }
        }
        // 5. Detectar linhas de rodapé/totais no final do documento para pré-definir FIM ou pré-excluir
        const PADRAO_RODAPE = /^(servi[çc]os?:?|frete:?|outras\s+despesas:?|nro\s+itens:?|n[°º]?\s+itens:?|total\s+de\s+itens:?|total\s+geral:?|sub-?total:?|condi[çc][ãa]o\s+de\s+pagamento:?|forma\s+de\s+pagamento:?|vendedor:?|dados\s+banc[áa]rios:?|chave\s+pix:?|observa[çc][õo]es?:?)\b/i;
        let primeiroRodape = -1;
        for (let r = cfg.inicio; r < rows.length; r++) {
            const col0 = _str(_cel(rows[r], 0));
            const col1 = _str(_cel(rows[r], 1));
            const txt = rows[r].map(c => _str(c)).join(' ').trim();
            if (PADRAO_RODAPE.test(col0) || PADRAO_RODAPE.test(col1) || (PADRAO_RODAPE.test(txt) && !/[A-Z0-9]{5,}/.test(col0))) {
                if (primeiroRodape === -1) primeiroRodape = r - 1;
                if (!cfg.excluidas.includes(r)) cfg.excluidas.push(r);
            }
        }
        cfg.fim = (primeiroRodape >= cfg.inicio) ? primeiroRodape : (rows.length - 1);
        _ajustarOcorr(cfg);
        return cfg;
    }

    function _ajustarOcorr(cfg) {
        cfg.slots.forEach(s => {
            if (s.campos.length >= 2 && s.campos[s.campos.length - 1] === 'ref' && s.sep !== 'auto') s.ocorr = 'ultima';
        });
    }

    // ── Extração pelo padrão confirmado ─────────────────────
    function _sepReal(slot) { return slot.sep === 'custom' ? (slot.sepCustom || '') : slot.sep; }

    function _dividir(texto, slot) {
        const campos = slot.campos;
        const t = _str(texto);
        const out = {};
        let alternativas = [];
        if (campos.length === 1) { out[campos[0]] = t; return { out, alternativas }; }

        const sep = _sepReal(slot);
        const ehRefDesc = campos.length === 2 && campos.indexOf('ref') >= 0 && campos.indexOf('desc') >= 0;
        if (sep === 'auto' && ehRefDesc && U().splitCodigoDescricao) {
            const sp = U().splitCodigoDescricao(t);
            out.ref = sp.ref; out.desc = sp.desc; alternativas = sp.alternativas || [];
            return { out, alternativas };
        }
        const s = (sep === 'auto' || !sep) ? ' ' : sep;
        const partes = [];
        let resto = t;
        const nCortes = campos.length - 1;
        if (slot.ocorr === 'ultima') {
            for (let k = 0; k < nCortes; k++) {
                const i = resto.lastIndexOf(s);
                if (i < 0) break;
                partes.unshift(resto.slice(i + s.length).trim());
                resto = resto.slice(0, i).trim();
            }
            partes.unshift(resto);
            while (partes.length < campos.length) partes.unshift('');
        } else {
            for (let k = 0; k < nCortes; k++) {
                const i = resto.indexOf(s);
                if (i < 0) break;
                partes.push(resto.slice(0, i).trim());
                resto = resto.slice(i + s.length).trim();
            }
            partes.push(resto);
            while (partes.length < campos.length) partes.push('');
        }
        campos.forEach((c, i) => { out[c] = partes[i] || ''; });
        // referências alternativas entre parênteses logo após o código
        if (out.ref) {
            const p = out.ref.match(/^(\S+)\s*\(([^)]*)\)\s*$/);
            if (p) { out.ref = p[1]; alternativas = p[2].split(/[-,;\/]+/).map(x => _str(x).toUpperCase()).filter(x => x.length >= 3 && /\d/.test(x)); }
        }
        return { out, alternativas };
    }

    function extrair(rows, cfg) {
        const excl = new Set(cfg.excluidas || []);
        const itens = [];
        const fim = (cfg.fim != null && cfg.fim >= 0) ? Math.min(cfg.fim, rows.length - 1) : (rows.length - 1);
        for (let r = cfg.inicio || 0; r <= fim; r++) {
            if (excl.has(r)) continue;
            const row = rows[r];
            const v = {};
            let alternativas = [];
            const brutos = {};
            cfg.slots.forEach((slot, i) => {
                if (!slot.campos.length) return;
                const cel = _cel(row, i);
                if (slot.campos.length === 1) { v[slot.campos[0]] = cel; brutos[slot.campos[0]] = cel; return; }
                const d = _dividir(cel, slot);
                Object.assign(v, d.out);
                alternativas = alternativas.concat(d.alternativas);
            });
            // v3.4.0: Sanitização avançada de ruídos de OCR e pontuações em códigos e descrições
            let ref  = _str(v.ref).toUpperCase().trim();
            ref = ref.replace(/^[*|~"“”'`.–—\s]+/, '').replace(/[*|~"“”'`.–—\s]+$/, '');
            let desc = _str(v.desc).trim();
            desc = desc.replace(/^[*|~"“”'`.–—\s]+/, '');

            if (!ref && !desc) continue;
            if (!ref && /^(sub-?\s*)?total\b|^valor\s+total|^total\s+geral/i.test(desc)) continue;
            // Filtro defensivo contra rodapés típicos caso não tenham sido excluídos manualmente
            if (/^(servi[çc]os?:?|frete:?|nro\s+itens:?|total\s+de\s+itens:?|condi[çc][ãa]o\s+de\s+pagamento:?)/i.test(ref)) continue;

            // Tratamento de quantidade com unidades de medida e formatação BR
            const qStr = _str(v.qtde).toLowerCase().replace(/\b(?:un|und|pç|pc|cx|jg|mts?|kg)\b/gi, '').trim();
            const qRaw = qStr;
            const qtdeInformada = qStr !== '';
            let qtde = _num(qStr);
            const qtdeInvalida = qtdeInformada && !(qtde > 0);
            const semQtdeNaOrigem = !qtdeInformada;
            // Se a foto original não trouxe quantidade para esta linha, usa 1 como padrão operacional sem inventar dados
            if (!(qtde > 0)) qtde = 1;
            let unit = _num(v.unit);
            const total = _num(v.total);
            if (!(unit > 0) && total > 0 && qtde > 0) unit = Math.round((total / qtde) * 100) / 100;

            const obsPartes = [];
            if (_str(v.obs)) obsPartes.push(_str(v.obs));
            if (_str(v.codInterno)) obsPartes.push('Cód. interno: ' + _str(v.codInterno));
            if (alternativas.length) obsPartes.push('Ref. alternativas: ' + alternativas.join(', '));

            const item = {
                refOriginal:      ref,
                descOriginal:     desc || ref,
                qtdeSolicitada:   Math.round(qtde * 1000) / 1000,
                marca:            _str(v.marca),
                obs:              obsPartes.join(' | '),
                incerteza:        !ref,
                _rowNum:          r - (cfg.inicio || 0) + 1,
                _docLine:         r + 1,
                _rawIndex:        r,
                _qtdeInvalida:    qtdeInvalida,
                _semQtdeNaOrigem: semQtdeNaOrigem,
            };
            if (unit > 0) item.precoConcorrente = unit;
            itens.push(item);
        }
        return itens;
    }

    // ── Impressão digital / semelhança de modelos ───────────
    function _tipoCol(rows, c, ini) {
        const amostra = rows.slice(ini, ini + 40).map(r => _str(_cel(r, c))).filter(Boolean);
        if (!amostra.length) return 'v';
        const num = amostra.filter(x => /^[R$\s\d.,-]+$/.test(x)).length;
        if (num >= amostra.length * 0.7) return 'n';
        const cod = amostra.filter(x => x.length <= 25 && /\d/.test(x) && /[A-Za-z]/.test(x) && !/\s\S+\s/.test(x)).length;
        if (cod >= amostra.length * 0.6) return 'c';
        return 't';
    }

    function _digital(rows, cfg, fonte) {
        const n = _nCols(rows);
        const topo = rows.slice(0, Math.max(1, Math.min(cfg.inicio || 0, 6)) + 1);
        const tokens = new Set();
        topo.forEach(r => r.forEach(c => _str(c).toLowerCase().split(/[^a-zà-ÿ0-9]+/).forEach(t => { if (t.length >= 3 && /[a-zà-ÿ]/.test(t)) tokens.add(t); })));
        const forma = Array.from({ length: n }, (_, c) => _tipoCol(rows, c, cfg.inicio || 0)).join('');
        return { n, fonte, tokens: Array.from(tokens).slice(0, 60), forma };
    }

    function _semelhanca(dA, dB) {
        if (!dA || !dB) return 0;
        const a = new Set(dA.tokens || []), b = new Set(dB.tokens || []);
        const inter = [...a].filter(x => b.has(x)).length;
        const uni = new Set([...a, ...b]).size;
        const jac = uni ? inter / uni : 0;
        const nEq = dA.n === dB.n ? 1 : 0;
        const fa = dA.forma || '', fb = dB.forma || '';
        let eq = 0; const L = Math.max(fa.length, fb.length) || 1;
        for (let i = 0; i < Math.min(fa.length, fb.length); i++) if (fa[i] === fb[i]) eq++;
        const forma = eq / L;
        const fonte = dA.fonte === dB.fonte ? 1 : 0;
        return Math.round((0.45 * jac + 0.2 * nEq + 0.25 * forma + 0.1 * fonte) * 100);
    }

    // ── Persistência dos modelos ────────────────────────────
    function _colModelos() {
        if (typeof firebase === 'undefined' || !firebase.firestore || !window.DemandaDB) return null;
        try { return firebase.firestore().collection(DemandaDB.BASE_PATH + '/data/mapeadorModelos'); } catch (_) { return null; }
    }
    function _lsModelos() { try { return JSON.parse(localStorage.getItem(LS_MODELOS) || '[]') || []; } catch (_) { return []; } }
    function _lsSalvar(lista) { try { localStorage.setItem(LS_MODELOS, JSON.stringify(lista)); } catch (_) {} }

    async function carregarModelos() {
        _modelos = _lsModelos();
        const col = _colModelos();
        if (!col) return _modelos;
        try {
            const snap = await col.get();
            const remoto = snap.docs.map(d => ({ ...d.data(), id: d.id }));
            const mapa = new Map(_modelos.map(m => [m.id, m]));
            remoto.forEach(m => mapa.set(m.id, m));
            _modelos = Array.from(mapa.values()).filter(m => !m._excluido);
            _lsSalvar(_modelos);
        } catch (e) { console.warn('[Mapeador] modelos (cache local):', e.message || e); }
        return _modelos;
    }

    async function _salvarModelo(nome) {
        const s = _st;
        const id = s.modeloId && _modelos.some(m => m.id === s.modeloId && m.nome === nome) ? s.modeloId : ('mod_' + Date.now().toString(36));
        let usuario = '';
        try { const ses = window.ParreiraAuth && ParreiraAuth.getSessao ? ParreiraAuth.getSessao() : null; usuario = ses ? (ses.nome || ses.login || '') : ''; } catch (_) {}
        const modelo = {
            id, nome,
            fonte: s.fonte,
            cfg: { slots: s.cfg.slots, inicio: s.cfg.inicio },
            digital: _digital(s.rows, s.cfg, s.fonte),
            atualizadoEm: new Date().toISOString(),
            atualizadoPor: usuario,
            usos: ((_modelos.find(m => m.id === id) || {}).usos || 0) + 1,
        };
        _modelos = _modelos.filter(m => m.id !== id).concat([modelo]);
        _lsSalvar(_modelos);
        s.modeloId = id;
        const col = _colModelos();
        if (col) {
            try { await col.doc(id).set(JSON.parse(JSON.stringify(modelo))); }
            catch (e) { console.warn('[Mapeador] salvar no Firestore falhou (ficou no navegador):', e.message || e); _toast('Modelo salvo só neste navegador (sem acesso ao servidor).', 'warning'); return modelo; }
        }
        return modelo;
    }

    async function excluirModelo(id) {
        _modelos = _modelos.filter(m => m.id !== id);
        _lsSalvar(_modelos);
        const col = _colModelos();
        if (col) { try { await col.doc(id).delete(); } catch (_) {} }
    }

    function _melhorModelo() {
        const dig = _digital(_st.rows, _st.cfg, _st.fonte);
        let best = null, sc = 0;
        _modelos.forEach(m => {
            const x = _semelhanca(dig, m.digital);
            if (x > sc) { sc = x; best = m; }
        });
        return best ? { modelo: best, score: sc } : null;
    }

    function _aplicarModelo(m) {
        const n = _nCols(_st.rows);
        const cfg = _cfgVazia(n);
        (m.cfg.slots || []).forEach((s, i) => { if (i < n) cfg.slots[i] = JSON.parse(JSON.stringify(s)); });
        cfg.inicio = Math.min(m.cfg.inicio || 0, Math.max(0, _st.rows.length - 1));
        _st.cfg = cfg;
        _st.modeloId = m.id;
        _st.modeloNome = m.nome;
    }

    // ── UI ──────────────────────────────────────────────────
    function _garantirDOM() {
        if ($('mpdOverlay')) return;
        const el = document.createElement('div');
        el.id = 'mpdOverlay';
        el.className = 'mpd-overlay';
        el.innerHTML = `
          <div class="mpd-shell" role="dialog" aria-modal="true" aria-labelledby="mpdTitulo">
            <header class="mpd-head">
              <div class="mpd-head-l">
                <button class="mpd-btn-voltar" id="mpdBtnVoltar" title="Voltar para a tela de edição ou reajuste de cortes sem perder o arquivo">
                  <span class="material-icons-round" style="font-size:1.15rem">arrow_back</span>
                  <span id="mpdTxtVoltar">Voltar para Edição</span>
                </button>
                <div class="mpd-tabs-modo" style="display:inline-flex;background:rgba(15,23,42,.7);border:1px solid rgba(148,163,184,.22);border-radius:6px;padding:3px;gap:3px">
                  <button class="mpd-tab-btn active" id="mpdTabMapear" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;font-size:.78rem;font-weight:700;border:none;border-radius:4px;cursor:pointer;background:#2563eb;color:#fff">
                    <span class="material-icons-round" style="font-size:1rem">view_column</span> Mapear Colunas
                  </button>
                  <button class="mpd-tab-btn" id="mpdTabEditar" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;font-size:.78rem;font-weight:700;border:none;border-radius:4px;cursor:pointer;background:transparent;color:#94a3b8">
                    <span class="material-icons-round" style="font-size:1rem">edit_note</span> Editar Dados do Arquivo
                  </button>
                </div>
                <div>
                  <h3 id="mpdTitulo" style="display:none">Mapear colunas da importação</h3>
                  <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
                    <div class="mpd-sub" id="mpdArquivo"></div>
                    <button class="mpd-btn mpd-btn-ghost mpd-btn-sm" id="mpdBtnDemarcarFoto" style="display:none;padding:.15rem .5rem;font-size:.72rem;border-color:#06b6d4;color:#06b6d4" title="Voltar ao Demarcador Visual para reajustar colunas e limites na foto">
                        <span class="material-icons-round" style="font-size:.9rem">crop</span> Reajustar Linhas na Foto
                    </button>
                    <button class="mpd-btn mpd-btn-ghost mpd-btn-sm" id="mpdBtnAjustarCortes" style="display:none;padding:.15rem .5rem;font-size:.72rem;border-color:#38bdf8;color:#38bdf8" title="Abrir Assistente de Linhas de Divisão com Régua interativa">
                        <span class="material-icons-round" style="font-size:.9rem">straighten</span> Linhas de Divisão (Régua)
                    </button>
                    <button class="mpd-btn mpd-btn-ghost mpd-btn-sm" id="mpdBtnAddLinha" style="padding:.15rem .5rem;font-size:.72rem;border-color:#10b981;color:#10b981" title="Adicionar nova linha vazia para produto">
                        <span class="material-icons-round" style="font-size:.9rem">add</span> + Linha
                    </button>
                  </div>
                </div>
              </div>
              <div class="mpd-head-r">
                <label class="mpd-lbl" for="mpdSelModelo">Modelo</label>
                <select id="mpdSelModelo" class="mpd-sel"></select>
                <button class="mpd-btn mpd-btn-ghost" id="mpdBtnExcluirModelo" title="Excluir o modelo selecionado"><span class="material-icons-round">delete_outline</span></button>
                <button class="mpd-btn mpd-btn-ghost" id="mpdBtnFechar" title="Fechar importação"><span class="material-icons-round">close</span></button>
              </div>
            </header>
            <div class="mpd-aviso" id="mpdAviso"></div>
            <!-- Painel 1: Mapear Colunas -->
            <div class="mpd-body" id="mpdPainelMapear">
              <section class="mpd-doc">
                <div class="mpd-tray-wrap">
                  <span class="mpd-tray-tit">Colunas disponíveis</span>
                  <div class="mpd-tray" id="mpdTray"></div>
                  <span class="mpd-dica">Arraste cada coluna para cima da coluna do documento. Solte em <b>+ juntar</b> para combinar duas informações na mesma coluna. Linhas de cabeçalho ficam como <b>0</b>; clique na lixeira ou no ✕ para excluir linhas de rodapé/totais.</span>
                </div>
                <div class="mpd-grid-wrap" id="mpdGridWrap"></div>
              </section>
              <aside class="mpd-side">
                <div class="mpd-resumo" id="mpdResumo"></div>
                <div class="mpd-prev-wrap"><table class="mpd-prev" id="mpdPrev"></table></div>
                <div class="mpd-save">
                  <label class="mpd-chk"><input type="checkbox" id="mpdChkSalvar"> Salvar este padrão como modelo</label>
                  <input type="text" id="mpdNomeModelo" class="mpd-inp" placeholder="Nome do modelo (ex.: Santa Ana – planilha)">
                </div>
                <div class="mpd-acoes">
                  <button class="mpd-btn mpd-btn-ghost" id="mpdBtnAuto" title="Usa a leitura automática antiga, sem mapear"><span class="material-icons-round">auto_fix_high</span> Leitura automática</button>
                  <button class="mpd-btn mpd-btn-pri" id="mpdBtnConfirmar"><span class="material-icons-round">check_circle</span> Confirmar e buscar itens</button>
                </div>
              </aside>
            </div>

            <!-- Painel 2: Edição dos Dados do Arquivo -->
            <div class="mpd-edicao-body" id="mpdPainelEdicao" style="display:none;flex:1;flex-direction:column;overflow:hidden;padding:1rem;background:#0b1120">
              <div class="mpd-edicao-toolbar" style="display:flex;align-items:center;justify-content:space-between;padding-bottom:.8rem;border-bottom:1px solid rgba(148,163,184,.15);flex-wrap:wrap;gap:.6rem">
                <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
                  <button class="mpd-btn mpd-btn-sec mpd-btn-sm" id="mpdEdBtnAddLinha" title="Adiciona uma linha no final da grade"><span class="material-icons-round">add</span> + Nova Linha</button>
                  <button class="mpd-btn mpd-btn-sec mpd-btn-sm" id="mpdEdBtnAddColuna" title="Adiciona uma nova coluna à direita"><span class="material-icons-round">view_week</span> + Nova Coluna</button>
                  <button class="mpd-btn mpd-btn-sec mpd-btn-sm" id="mpdEdBtnLimparVazias" title="Remove linhas vazias"><span class="material-icons-round">cleaning_services</span> Limpar Vazias</button>
                  <span style="font-size:.78rem;color:#38bdf8;margin-left:.5rem;display:inline-flex;align-items:center;gap:4px">
                    <span class="material-icons-round" style="font-size:1rem">info</span>
                    <b>Modo Edição:</b> edite qualquer texto diretamente nas células abaixo. Seus dados e arquivo continuam salvos.
                  </span>
                </div>
                <div style="display:flex;align-items:center;gap:.6rem">
                  <button class="mpd-btn mpd-btn-pri" id="mpdEdBtnSalvar" style="font-weight:700;padding:.45rem 1.1rem;background:#10b981;border-color:#10b981">
                    <span class="material-icons-round">check_circle</span> Concluir Edição e Ir para Mapeamento
                  </button>
                </div>
              </div>
              <div class="mpd-edicao-grid-wrap" id="mpdEdicaoGridWrap" style="flex:1;overflow:auto;margin-top:.8rem;border:1px solid rgba(148,163,184,.18);border-radius:6px;background:#090e17"></div>
            </div>
          </div>`;
        document.body.appendChild(el);
        $('mpdBtnFechar').onclick = () => {
            if (confirm('Deseja cancelar o mapeamento deste arquivo? (O arquivo continuará salvo em memória na Central de Cotação)')) {
                fechar();
            }
        };
        $('mpdBtnConfirmar').onclick = _confirmar;
        $('mpdBtnAuto').onclick = () => { const s = _st; fechar(); if (s && s.onAutomatico) s.onAutomatico(); };
        $('mpdSelModelo').onchange = (e) => _trocarModelo(e.target.value);
        $('mpdBtnExcluirModelo').onclick = _excluirSelecionado;
        $('mpdChkSalvar').onchange = (e) => { $('mpdNomeModelo').style.display = e.target.checked ? '' : 'none'; if (e.target.checked) $('mpdNomeModelo').focus(); };
        document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && _st && $('mpdOverlay').classList.contains('open')) fechar(); });

        // Alternância de abas: Mapear Colunas <---> Editar Dados
        $('mpdTabMapear').onclick = () => _setModoTela('mapear');
        $('mpdTabEditar').onclick = () => _setModoTela('edicao');
        $('mpdEdBtnSalvar').onclick = () => _setModoTela('mapear');

        // Toolbar de Edição
        $('mpdEdBtnAddLinha').onclick = () => {
            if (!_st || !_st.rows) return;
            const nCols = _nCols(_st.rows) || 5;
            _st.rows.push(new Array(nCols).fill(''));
            _renderEdicaoGrade();
        };
        $('mpdEdBtnAddColuna').onclick = () => {
            if (!_st || !_st.rows) return;
            _st.rows.forEach(r => r.push(''));
            if (_st.cfg && _st.cfg.slots) _st.cfg.slots.push(_novoSlot());
            _renderEdicaoGrade();
        };
        $('mpdEdBtnLimparVazias').onclick = () => {
            if (!_st || !_st.rows) return;
            _st.rows = _st.rows.filter(r => r.some(c => String(c || '').trim() !== ''));
            _renderEdicaoGrade();
            if (typeof _st.toast === 'function') _st.toast('Linhas vazias removidas.', 'info');
        };
    }

    function _chip(campo, origem) {
        const c = CAMPOS[campo];
        const x = (!c.fixo) ? `<button class="mpd-chip-x" title="Remover coluna" data-x="${campo}">×</button>` : '';
        return `<span class="mpd-chip${c.fixo ? ' fixo' : ''}" draggable="true" data-campo="${campo}" data-origem="${origem}" style="--c:${c.cor}">
                  <span class="material-icons-round mpd-drag">drag_indicator</span>${_esc(c.label)}${c.fixo ? '<i class="mpd-req">*</i>' : ''}${x}</span>`;
    }

    function _camposUsados() { const u = new Set(); _st.cfg.slots.forEach(s => s.campos.forEach(c => u.add(c))); return u; }

    function _renderTray() {
        const usados = _camposUsados();
        const livres = ORDEM_CAMPOS.filter(c => !usados.has(c) && !(_st.removidos || new Set()).has(c));
        const removidos = ORDEM_CAMPOS.filter(c => !usados.has(c) && (_st.removidos || new Set()).has(c));
        $('mpdTray').innerHTML = (livres.map(c => _chip(c, 'tray')).join('') || '<span class="mpd-vazio">todas posicionadas</span>') +
            (removidos.length ? `<span class="mpd-rem">Removidas: ${removidos.map(c => `<button class="mpd-rem-b" data-volta="${c}">+ ${_esc(CAMPOS[c].label)}</button>`).join('')}</span>` : '');
    }

    function _slotHtml(slot, i) {
        const chips = slot.campos.map(c => _chip(c, 'slot:' + i)).join(slot.campos.length > 1 ? '<span class="mpd-mais">+</span>' : '');
        let extra = '';
        if (slot.campos.length >= 2) {
            extra = `<div class="mpd-sepbox">
                <select class="mpd-sel mini" data-sep="${i}" title="Separador entre as informações">
                  ${SEPARADORES.map(s => `<option value="${_esc(s.v)}"${s.v === slot.sep ? ' selected' : ''}>${_esc(s.label)}</option>`).join('')}
                </select>
                ${slot.sep === 'custom' ? `<input class="mpd-inp mini" data-sepc="${i}" value="${_esc(slot.sepCustom)}" placeholder="separador">` : ''}
                ${slot.sep !== 'auto' && slot.campos.length >= 2 ? `<select class="mpd-sel mini" data-ocorr="${i}" title="Onde dividir"><option value="primeira"${slot.ocorr !== 'ultima' ? ' selected' : ''}>na 1ª ocorrência</option><option value="ultima"${slot.ocorr === 'ultima' ? ' selected' : ''}>na última ocorrência</option></select>` : ''}
                <button class="mpd-mini-b" data-inv="${i}" title="Inverter a ordem">⇄</button>
                <button class="mpd-mini-b" data-sep1="${i}" title="Separar (deixar só a primeira)">✂</button>
              </div>`;
        }
        return `<th class="mpd-slot${slot.campos.length ? ' ok' : ''}" data-slot="${i}">
                  <div class="mpd-slot-h">Coluna ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}</div>
                  <div class="mpd-drop" data-drop="${i}">${chips || '<span class="mpd-ign">ignorada</span>'}</div>
                  ${slot.campos.length ? `<div class="mpd-juntar" data-juntar="${i}">+ juntar</div>` : ''}
                  ${extra}
                </th>`;
    }

    function _setModoTela(modo) {
        if (!_st) return;
        _st.modoTela = modo;
        const tabMap = $('mpdTabMapear');
        const tabEd = $('mpdTabEditar');
        const pMap = $('mpdPainelMapear');
        const pEd = $('mpdPainelEdicao');
        const txtVoltar = $('mpdTxtVoltar');

        if (modo === 'edicao') {
            if (tabMap) { tabMap.style.background = 'transparent'; tabMap.style.color = '#94a3b8'; }
            if (tabEd) { tabEd.style.background = '#2563eb'; tabEd.style.color = '#fff'; }
            if (pMap) pMap.style.display = 'none';
            if (pEd) pEd.style.display = 'flex';
            if (txtVoltar) txtVoltar.textContent = 'Voltar ao Mapeamento';
            _renderEdicaoGrade();
        } else {
            if (tabEd) { tabEd.style.background = 'transparent'; tabEd.style.color = '#94a3b8'; }
            if (tabMap) { tabMap.style.background = '#2563eb'; tabMap.style.color = '#fff'; }
            if (pEd) pEd.style.display = 'none';
            if (pMap) pMap.style.display = 'flex';
            if (txtVoltar) {
                txtVoltar.textContent = (_st.estadoDemarcador && window.DemandaImagemDemarcador)
                    ? 'Voltar ao Demarcador'
                    : 'Voltar para Edição';
            }
            _render();
        }
    }

    function _renderEdicaoGrade() {
        if (!_st || !_st.rows) return;
        const rows = _st.rows;
        const nCols = _nCols(rows) || 5;
        const wrap = $('mpdEdicaoGridWrap');
        if (!wrap) return;

        let h = '<table class="mpd-ed-table" style="width:100%;border-collapse:collapse;font-size:.8rem;color:#e2e8f0">';
        h += '<thead><tr style="position:sticky;top:0;background:#1e293b;z-index:2;border-bottom:2px solid #3b82f6">';
        h += '<th style="width:50px;padding:.5rem;text-align:center;border-right:1px solid rgba(148,163,184,.2)">#</th>';
        h += '<th style="width:110px;padding:.5rem;text-align:center;border-right:1px solid rgba(148,163,184,.2)">Ações</th>';
        for (let c = 0; c < nCols; c++) {
            const letra = String.fromCharCode(65 + (c % 26)) + (c >= 26 ? Math.floor(c / 26) : '');
            h += `<th style="padding:.5rem;text-align:left;min-width:140px;border-right:1px solid rgba(148,163,184,.2)">Coluna ${letra}</th>`;
        }
        h += '</tr></thead><tbody>';

        rows.forEach((r, rIdx) => {
            h += `<tr style="border-bottom:1px solid rgba(148,163,184,.1)">`;
            h += `<td style="padding:.4rem;text-align:center;background:rgba(15,23,42,.6);color:#94a3b8;font-weight:700;border-right:1px solid rgba(148,163,184,.2)">${rIdx + 1}</td>`;
            h += `<td style="padding:.4rem;text-align:center;white-space:nowrap;border-right:1px solid rgba(148,163,184,.2)">`;
            h += `<button class="mpd-row-btn" data-ed-shift="${rIdx}" data-dir="1" title="Deslocar linha para a direita">⇥</button> `;
            h += `<button class="mpd-row-btn" data-ed-shift="${rIdx}" data-dir="-1" title="Deslocar linha para a esquerda">⇤</button> `;
            h += `<button class="mpd-row-btn" data-ed-del="${rIdx}" title="Excluir esta linha" style="color:#ef4444;border-color:rgba(239,68,68,.3)">✕</button>`;
            h += `</td>`;
            for (let c = 0; c < nCols; c++) {
                const val = r[c] != null ? String(r[c]) : '';
                h += `<td style="padding:.25rem;border-right:1px solid rgba(148,163,184,.1)">`;
                h += `<input type="text" class="mpd-ed-inp" data-r="${rIdx}" data-c="${c}" value="${_esc(val)}" style="width:100%;box-sizing:border-box;background:rgba(15,23,42,.8);border:1px solid rgba(148,163,184,.2);border-radius:4px;color:#fff;padding:.3rem .5rem;font-size:.78rem;outline:none" onfocus="this.style.borderColor='#38bdf8';this.style.background='#020617'" onblur="this.style.borderColor='rgba(148,163,184,.2)';this.style.background='rgba(15,23,42,.8)'">`;
                h += `</td>`;
            }
            h += `</tr>`;
        });
        h += '</tbody></table>';
        wrap.innerHTML = h;

        wrap.querySelectorAll('.mpd-ed-inp').forEach(inp => {
            inp.addEventListener('input', () => {
                const r = Number(inp.dataset.r);
                const c = Number(inp.dataset.c);
                if (_st && _st.rows && _st.rows[r]) {
                    while (_st.rows[r].length <= c) _st.rows[r].push('');
                    _st.rows[r][c] = inp.value;
                }
            });
        });
        wrap.querySelectorAll('[data-ed-shift]').forEach(b => {
            b.onclick = () => {
                const r = Number(b.dataset.edShift);
                const dir = Number(b.dataset.dir);
                if (_st && _st.rows && _st.rows[r]) {
                    if (dir === 1) _st.rows[r].unshift('');
                    else if (dir === -1) {
                        if (_st.rows[r].length > 1) _st.rows[r].shift();
                        else _st.rows[r][0] = '';
                    }
                    _renderEdicaoGrade();
                }
            };
        });
        wrap.querySelectorAll('[data-ed-del]').forEach(b => {
            b.onclick = () => {
                const r = Number(b.dataset.edDel);
                if (_st && _st.rows) {
                    _st.rows.splice(r, 1);
                    _renderEdicaoGrade();
                }
            };
        });
    }

    function _renderGrid() {
        const rows = _st.rows, cfg = _st.cfg;
        const n = cfg.slots.length;
        const excl = new Set(cfg.excluidas || []);
        const fim = (cfg.fim != null && cfg.fim >= 0) ? Math.min(cfg.fim, rows.length - 1) : (rows.length - 1);
        const lim = Math.min(rows.length, MAX_LINHAS_VIEW);

        let h = '<div class="mpd-grid-info-bar">' +
            `<div class="mpd-limite-tag ini"><span class="mpd-dot ini"></span> Início: <strong>Linha ${cfg.inicio + 1}</strong></div>` +
            `<div class="mpd-limite-tag fim"><span class="mpd-dot fim"></span> Fim: <strong>Linha ${fim + 1}</strong></div>` +
            `<div class="mpd-limite-tag col"><span class="mpd-dot col"></span> <strong>${n}</strong> Colunas</div>` +
            `<div class="mpd-limite-tag dica" style="background:rgba(56,189,248,.12);border-color:rgba(56,189,248,.3);color:#38bdf8"><span class="material-icons-round" style="font-size:13px">edit</span> <b>Células editáveis:</b> clique em qualquer texto para editar na hora</div>` +
            `<div class="mpd-limite-dica">Início 🟢 · Fim 🔴 · ⇥/⇤ Deslocar linha · ✕ Excluir</div>` +
            '</div>';

        h += '<table class="mpd-grid"><thead><tr><th class="mpd-rn-h">Linha</th>' + cfg.slots.map(_slotHtml).join('') + '</tr></thead><tbody>';
        for (let r = 0; r < lim; r++) {
            const antes = r < cfg.inicio;
            const depois = r > fim;
            const fora = excl.has(r) || depois;
            const numExibicao = (antes || depois) ? 0 : (r - cfg.inicio + 1);
            const classesLinha = [
                antes ? 'antes' : '',
                depois ? 'depois' : '',
                fora ? 'fora' : '',
                r === cfg.inicio ? 'inicio' : '',
                r === fim ? 'fim' : ''
            ].filter(Boolean).join(' ');

            h += `<tr class="${classesLinha}">` +
                `<td class="mpd-rn">` +
                `<div class="mpd-rn-actions">` +
                `<button class="mpd-rn-b ${antes ? 'mpd-rn-zero' : ''} ${r === cfg.inicio ? 'is-ini' : ''}" data-ini="${r}" title="${antes ? 'Linha ' + (r + 1) + ' (cabeçalho). Clique para iniciar produtos aqui' : 'Definir INÍCIO dos produtos na Linha ' + (r + 1)}">${numExibicao}</button>` +
                `<button class="mpd-rn-fim-b ${r === fim ? 'is-fim' : ''} ${depois ? 'mpd-rn-zero' : ''}" data-fim="${r}" title="${r === fim ? 'Linha de FIM das peças (clique para remover corte)' : 'Definir FIM dos produtos na Linha ' + (r + 1) + ' (linhas abaixo são ignoradas)'}"><span class="material-icons-round" style="font-size:13px">vertical_align_bottom</span></button>` +
                `<button class="mpd-row-btn" data-shift-r="${r}" data-dir="1" title="Deslocar células para a DIREITA (insere célula vazia no início desta linha)">⇥</button>` +
                `<button class="mpd-row-btn" data-shift-r="${r}" data-dir="-1" title="Deslocar células para a ESQUERDA (puxa células para esquerda)">⇤</button>` +
                (antes || depois ? '' : `<button class="mpd-exc-b ${excl.has(r) ? 'is-fora' : ''}" data-exc="${r}" title="${excl.has(r) ? 'Restaurar linha ' + numExibicao : 'Excluir linha ' + numExibicao + ' da importação'}">` +
                    `<span class="material-icons-round" style="font-size:14px;vertical-align:middle">${excl.has(r) ? 'undo' : 'delete_outline'}</span>` +
                    (excl.has(r) ? '<span class="mpd-exc-lbl">Restaurar</span>' : '') +
                `</button>`) +
                `</div></td>`;
            for (let c = 0; c < n; c++) {
                const v = _cel(rows[r], c);
                h += `<td class="${cfg.slots[c].campos.length ? 'map' : ''} mpd-cell-editable" contenteditable="true" data-r="${r}" data-c="${c}" title="Clique para editar este valor diretamente">${_esc(typeof v === 'number' ? String(v).replace('.', ',') : v)}</td>`;
            }
            h += '</tr>';
        }
        h += '</tbody></table>';
        if (rows.length > lim) h += `<div class="mpd-mais-linhas">Mostrando ${lim} de ${rows.length} linhas — todas serão importadas.</div>`;
        $('mpdGridWrap').innerHTML = h;
    }

    function _renderPreview() {
        const itens = extrair(_st.rows, _st.cfg);
        _st.itensPrev = itens;
        const semRef = itens.filter(i => !i.refOriginal).length;
        const qInv = itens.filter(i => i._qtdeInvalida).length;

        // v3.4.0: Live Match Check no preview do mapeador
        let totalIdentificados = 0;
        const matchMap = new Map();
        if (typeof DemandaSearch !== 'undefined' && typeof DemandaSearch.smartMatch === 'function') {
            itens.forEach((it, idx) => {
                if (it.refOriginal) {
                    const m = DemandaSearch.smartMatch(it);
                    if (m) {
                        totalIdentificados++;
                        matchMap.set(idx, m);
                    }
                }
            });
        }

        const usados = _camposUsados();
        const faltam = [];
        if (!usados.has('ref') && !usados.has('desc')) faltam.push('Referência ou Descrição');

        const badgeIdentificados = totalIdentificados > 0
            ? `<div class="mpd-kpi" style="border-color:rgba(16,185,129,.35);background:rgba(16,185,129,.08);color:#10b981"><b style="color:#10b981">${totalIdentificados}</b><span style="color:#10b981">no catálogo ERP</span></div>`
            : '';

        $('mpdResumo').innerHTML =
            `<div class="mpd-kpi"><b>${itens.length}</b><span>itens</span></div>` +
            badgeIdentificados +
            `<div class="mpd-kpi ${semRef ? 'warn' : ''}"><b>${semRef}</b><span>sem referência</span></div>` +
            `<div class="mpd-kpi ${qInv ? 'warn' : ''}"><b>${qInv}</b><span>qtde inválida</span></div>` +
            (!usados.has('qtde') ? '<div class="mpd-alerta">Qtde não posicionada: todos os itens entram com 1.</div>' : '') +
            (faltam.length ? `<div class="mpd-alerta err">Posicione ${faltam.join(', ')}.</div>` : '');
        const cols = ['ref', 'desc', 'qtde'].concat(usados.has('marca') ? ['marca'] : []).concat((usados.has('unit') || usados.has('total')) ? ['preco'] : []).concat(['obs']);
        const lab = { ref: 'Referência', desc: 'Descrição', qtde: 'Qtde', marca: 'Marca', preco: 'Preço', obs: 'Obs' };
        let h = '<thead><tr><th style="width:40px">Lin.</th>' + cols.map(c => `<th>${lab[c]}</th>`).join('') + '<th style="width:36px;text-align:center">Excluir</th></tr></thead><tbody>';
        itens.slice(0, 40).forEach((it, idx) => {
            const m = matchMap.get(idx);
            let refDisplay = _esc(it.refOriginal);
            if (m) {
                const estqTxt = (m.estoqueFilial > 0) ? `${m.estoqueFilial} un` : '0';
                refDisplay += ` <span style="display:inline-flex;align-items:center;gap:2px;font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;background:rgba(16,185,129,.18);color:#10b981;" title="Identificado no ERP: ${m.erpProdutoDesc || ''} (Estoque: ${estqTxt})">🟢 ERP (${estqTxt})</span>`;
            } else if (it.refOriginal) {
                refDisplay += ` <span style="display:inline-flex;align-items:center;font-size:10px;font-weight:600;padding:1px 4px;border-radius:4px;background:rgba(245,158,11,.15);color:#f59e0b;" title="Código novo / sem vínculo automático">⚪ Novo</span>`;
            }

            const qtdeTxt = _esc(String(it.qtdeSolicitada).replace('.', ','));
            const qtdeCellHtml = it._semQtdeNaOrigem
                ? `<span style="color:#94a3b8;font-style:italic" title="Esta linha não continha quantidade legível na imagem original; entrará com 1 como padrão operacional se confirmada">${qtdeTxt} <small style="font-size:9px;opacity:0.8">(padrão)</small></span>`
                : qtdeTxt;

            const val = {
                ref: refDisplay,
                desc: _esc(it.descOriginal),
                qtde: qtdeCellHtml,
                marca: _esc(it.marca),
                preco: it.precoConcorrente ? _esc(it.precoConcorrente.toFixed(2).replace('.', ',')) : '',
                obs: _esc(it.obs)
            };
            h += `<tr class="${!it.refOriginal || it._qtdeInvalida ? 'warn' : ''}"><td>#${it._rowNum}</td>` +
                cols.map(c => `<td class="c-${c}">${val[c]}</td>`).join('') +
                `<td style="text-align:center"><button class="mpd-prev-del-b" data-exc="${it._rawIndex}" title="Excluir item ${it._rowNum} (${_esc(it.refOriginal || it.descOriginal)})"><span class="material-icons-round" style="font-size:14px;color:#f87171">delete_outline</span></button></td>` +
                '</tr>';
        });
        if (itens.length > 40) h += `<tr><td colspan="${cols.length + 2}" class="mpd-mais-linhas">+ ${itens.length - 40} itens…</td></tr>`;
        $('mpdPrev').innerHTML = h + '</tbody>';
        $('mpdBtnConfirmar').disabled = !itens.length || faltam.length > 0;
    }

    function _renderModelos() {
        const sel = $('mpdSelModelo');
        const dig = _digital(_st.rows, _st.cfg, _st.fonte);
        const lista = _modelos.map(m => ({ m, sc: _semelhanca(dig, m.digital) })).sort((a, b) => b.sc - a.sc);
        sel.innerHTML = '<option value="">— Sugestão automática —</option>' +
            lista.map(x => `<option value="${_esc(x.m.id)}"${x.m.id === _st.modeloId ? ' selected' : ''}>${_esc(x.m.nome)} (${x.sc}%)</option>`).join('');
        $('mpdBtnExcluirModelo').style.display = _st.modeloId ? '' : 'none';
    }

    function _renderAviso() {
        const av = $('mpdAviso');
        if (_st.modeloId && _st.modeloNome) {
            av.className = 'mpd-aviso on ' + (_st.modeloScore >= 95 ? 'ok' : 'info');
            av.innerHTML = `<span class="material-icons-round">${_st.modeloScore >= 95 ? 'verified' : 'lightbulb'}</span>` +
                (_st.modeloScore != null ? `Parece com o modelo <b>${_esc(_st.modeloNome)}</b> (${_st.modeloScore}%). ` : `Modelo <b>${_esc(_st.modeloNome)}</b> aplicado. `) +
                'Confira as colunas e a prévia antes de confirmar.';
        } else {
            av.className = 'mpd-aviso on info';
            av.innerHTML = '<span class="material-icons-round">lightbulb</span>Padrão sugerido automaticamente. Confira as colunas e a prévia antes de confirmar.';
        }
    }

    function _render() {
        _renderTray();
        _renderGrid();
        _renderPreview();
        _renderModelos();
        _bind();
    }

    // ── Interações ──────────────────────────────────────────
    function _tirarDeOnde(campo) {
        _st.cfg.slots.forEach(s => { s.campos = s.campos.filter(c => c !== campo); if (s.campos.length < 2) { s.sep = 'auto'; s.ocorr = 'primeira'; } });
        if (_st.removidos) _st.removidos.delete(campo);
    }

    function _soltar(campo, slotIdx, juntar) {
        const cfg = _st.cfg;
        const origemSlot = cfg.slots.findIndex(s => s.campos.indexOf(campo) >= 0);
        const alvo = cfg.slots[slotIdx];
        if (juntar) {
            if (alvo.campos.indexOf(campo) >= 0) return;
            _tirarDeOnde(campo);
            alvo.campos.push(campo);
            if (alvo.campos.length === 2) alvo.sep = (alvo.campos.indexOf('ref') >= 0 && alvo.campos.indexOf('desc') >= 0) ? 'auto' : ' - ';
            _ajustarOcorr(cfg);
        } else {
            if (origemSlot === slotIdx) return;
            const anteriores = alvo.campos.slice();
            const origemCfg = origemSlot >= 0 ? JSON.parse(JSON.stringify(cfg.slots[origemSlot])) : null;
            if (origemSlot >= 0 && origemCfg.campos.length === 1) {
                // troca as duas colunas de lugar
                cfg.slots[origemSlot] = Object.assign(_novoSlot(), JSON.parse(JSON.stringify(alvo)));
                cfg.slots[slotIdx] = Object.assign(_novoSlot(), { campos: [campo] });
            } else {
                _tirarDeOnde(campo);
                anteriores.forEach(c => _tirarDeOnde(c)); // voltam para "disponíveis"
                cfg.slots[slotIdx] = Object.assign(_novoSlot(), { campos: [campo] });
            }
        }
        _render();
    }

    function _bind() {
        const root = $('mpdOverlay');
        root.querySelectorAll('.mpd-chip').forEach(ch => {
            ch.addEventListener('dragstart', (e) => { _dragCampo = ch.dataset.campo; e.dataTransfer.setData('text/plain', _dragCampo); e.dataTransfer.effectAllowed = 'move'; root.classList.add('arrastando'); });
            ch.addEventListener('dragend', () => { _dragCampo = null; root.classList.remove('arrastando'); });
        });
        const alvo = (el, juntar) => {
            el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('hover'); });
            el.addEventListener('dragleave', () => el.classList.remove('hover'));
            el.addEventListener('drop', (e) => {
                e.preventDefault(); el.classList.remove('hover');
                const campo = e.dataTransfer.getData('text/plain') || _dragCampo;
                if (campo && CAMPOS[campo]) _soltar(campo, Number(juntar ? el.dataset.juntar : el.dataset.drop), juntar);
            });
        };
        root.querySelectorAll('[data-drop]').forEach(el => alvo(el, false));
        root.querySelectorAll('[data-juntar]').forEach(el => alvo(el, true));
        // soltar na bandeja = tirar da coluna
        const tray = $('mpdTray');
        tray.ondragover = (e) => e.preventDefault();
        tray.ondrop = (e) => { e.preventDefault(); const campo = e.dataTransfer.getData('text/plain') || _dragCampo; if (campo) { _tirarDeOnde(campo); _render(); } };

        root.querySelectorAll('[data-x]').forEach(b => b.onclick = (e) => { e.stopPropagation(); const c = b.dataset.x; _tirarDeOnde(c); (_st.removidos = _st.removidos || new Set()).add(c); _render(); });
        root.querySelectorAll('[data-volta]').forEach(b => b.onclick = () => { _st.removidos.delete(b.dataset.volta); _render(); });
        root.querySelectorAll('[data-sep]').forEach(s => s.onchange = () => { const sl = _st.cfg.slots[Number(s.dataset.sep)]; sl.sep = s.value; _ajustarOcorr(_st.cfg); _render(); });
        root.querySelectorAll('[data-sepc]').forEach(s => s.oninput = () => { _st.cfg.slots[Number(s.dataset.sepc)].sepCustom = s.value; _renderPreview(); });
        root.querySelectorAll('[data-ocorr]').forEach(s => s.onchange = () => { _st.cfg.slots[Number(s.dataset.ocorr)].ocorr = s.value; _renderPreview(); });
        root.querySelectorAll('[data-inv]').forEach(b => b.onclick = () => { const sl = _st.cfg.slots[Number(b.dataset.inv)]; sl.campos.reverse(); _ajustarOcorr(_st.cfg); _render(); });
        root.querySelectorAll('[data-sep1]').forEach(b => b.onclick = () => { const sl = _st.cfg.slots[Number(b.dataset.sep1)]; sl.campos = sl.campos.slice(0, 1); sl.sep = 'auto'; _render(); });
        root.querySelectorAll('[data-ini]').forEach(b => b.onclick = () => {
            _st.cfg.inicio = Number(b.dataset.ini);
            _st.cfg.excluidas = _st.cfg.excluidas.filter(r => r >= _st.cfg.inicio);
            if (_st.cfg.fim != null && _st.cfg.fim < _st.cfg.inicio) _st.cfg.fim = _st.rows.length - 1;
            _render();
        });
        root.querySelectorAll('[data-fim]').forEach(b => b.onclick = () => {
            const f = Number(b.dataset.fim);
            if (_st.cfg.fim === f) {
                _st.cfg.fim = _st.rows.length - 1;
            } else {
                _st.cfg.fim = f;
            }
            _render();
        });
        root.querySelectorAll('[data-exc]').forEach(b => b.onclick = () => {
            const r = Number(b.dataset.exc); const ex = new Set(_st.cfg.excluidas);
            ex.has(r) ? ex.delete(r) : ex.add(r); _st.cfg.excluidas = Array.from(ex); _render();
        });

        // Deslocamento de linha ⇥ / ⇤ (shift)
        root.querySelectorAll('[data-shift-r]').forEach(b => {
            b.onclick = () => {
                const r = Number(b.dataset.shiftR);
                const dir = Number(b.dataset.dir);
                if (_st && _st.rows && _st.rows[r]) {
                    if (dir === 1) {
                        _st.rows[r].unshift('');
                    } else if (dir === -1) {
                        if (_st.rows[r].length > 1) _st.rows[r].shift();
                        else _st.rows[r][0] = '';
                    }
                    _render();
                }
            };
        });

        // Edição direta de células na grade
        root.querySelectorAll('.mpd-cell-editable').forEach(td => {
            td.addEventListener('blur', () => {
                const r = Number(td.dataset.r);
                const c = Number(td.dataset.c);
                if (_st && _st.rows && _st.rows[r]) {
                    while (_st.rows[r].length <= c) _st.rows[r].push('');
                    _st.rows[r][c] = td.innerText.trim();
                    _renderPreview();
                }
            });
            td.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    td.blur();
                }
            });
        });

        // Botão + Linha
        const btnAdd = $('mpdBtnAddLinha');
        if (btnAdd) {
            btnAdd.onclick = () => {
                if (!_st || !_st.rows) return;
                const nCols = (_st.cfg && _st.cfg.slots && _st.cfg.slots.length) || 5;
                const novaLinha = new Array(nCols).fill('');
                const pos = (_st.cfg.inicio != null && _st.cfg.inicio >= 0) ? _st.cfg.inicio + 1 : _st.rows.length;
                _st.rows.splice(pos, 0, novaLinha);
                if (_st.cfg.fim != null) _st.cfg.fim++;
                _render();
                if (typeof _st.toast === 'function') _st.toast('Linha adicionada! Clique nas células para preencher.', 'info');
            };
        }
    }

    function _trocarModelo(id) {
        if (!id) {
            _st.cfg = sugerir(_st.rows); _st.modeloId = null; _st.modeloNome = ''; _st.modeloScore = null;
        } else {
            const m = _modelos.find(x => x.id === id);
            if (!m) return;
            const dig = _digital(_st.rows, _st.cfg, _st.fonte);
            _aplicarModelo(m);
            _st.modeloScore = _semelhanca(dig, m.digital);
            $('mpdNomeModelo').value = m.nome;
        }
        _renderAviso();
        _render();
    }

    async function _excluirSelecionado() {
        if (!_st.modeloId) return;
        const m = _modelos.find(x => x.id === _st.modeloId);
        if (!m || !confirm('Excluir o modelo "' + m.nome + '"? Isso vale para todos os operadores.')) return;
        await excluirModelo(m.id);
        _toast('Modelo excluído.', 'info');
        _trocarModelo('');
    }

    async function _confirmar() {
        const itens = extrair(_st.rows, _st.cfg);
        if (!itens.length) { _toast('Nenhum item com esse padrão.', 'warning'); return; }
        const s = _st;
        if ($('mpdChkSalvar').checked) {
            const nome = _str($('mpdNomeModelo').value);
            if (!nome) { $('mpdNomeModelo').focus(); _toast('Dê um nome ao modelo.', 'warning'); return; }
            await _salvarModelo(nome);
            _toast('Modelo "' + nome + '" salvo.', 'success');
        } else if (s.modeloId) {
            // registra uso do modelo aplicado (sem alterar o padrão)
            const m = _modelos.find(x => x.id === s.modeloId);
            if (m) { m.usos = (m.usos || 0) + 1; _lsSalvar(_modelos); }
        }
        fechar();
        const limpos = itens.map(it => { const c = Object.assign({}, it); delete c._qtdeInvalida; return c; });
        if (s.onConfirm) s.onConfirm(limpos);
    }

    // ── API ─────────────────────────────────────────────────
    /**
     * Abre o mapeador.
     * @param {{rows:Array<Array>, fonte:string, nome:string, onConfirm:Function, onAutomatico?:Function, toast?:Function}} opts
     */
    async function abrir(opts) {
        _garantirDOM();
        const rows = (opts.rows || []).filter(r => Array.isArray(r) && r.some(c => _str(c) !== ''));
        if (!rows.length) { (opts.toast || console.warn)('Documento sem linhas legíveis.', 'error'); return; }
        const cfgSugerida = opts.cfg || sugerir(rows);
        _st = {
            rows,
            fonte: opts.fonte || 'excel',
            nome: opts.nome || '',
            rawText: opts.rawText || '',
            file: opts.file || (opts.estadoDemarcador ? opts.estadoDemarcador.file : null),
            dataUrl: opts.dataUrl || (opts.estadoDemarcador ? opts.estadoDemarcador.dataUrl : ''),
            estadoDemarcador: opts.estadoDemarcador || null,
            onConfirm: opts.onConfirm,
            onAutomatico: opts.onAutomatico,
            onVoltar: opts.onVoltar || null,
            toast: opts.toast,
            cfg: cfgSugerida,
            modeloId: null,
            modeloNome: '',
            modeloScore: null,
            removidos: new Set()
        };
        $('mpdArquivo').textContent = (_st.nome ? _st.nome + ' · ' : '') + rows.length + ' linhas · ' + _nCols(rows) + ' colunas';
        $('mpdChkSalvar').checked = false;
        $('mpdNomeModelo').value = '';
        $('mpdNomeModelo').style.display = 'none';

        // Botão de Voltar inteligente: alterna para edição ou para o demarcador de imagem, NUNCA fecha para a tela inicial
        const btnVoltar = $('mpdBtnVoltar');
        if (btnVoltar) {
            btnVoltar.onclick = () => {
                if (_st && _st.modoTela === 'edicao') {
                    _setModoTela('mapear');
                    return;
                }
                // Se estiver no modo mapear:
                if (_st && _st.estadoDemarcador && window.DemandaImagemDemarcador) {
                    const est = _st.estadoDemarcador || {};
                    const nome = _st.nome;
                    const fonte = _st.fonte;
                    const onConf = _st.onConfirm;
                    const onVolt = _st.onVoltar;
                    const cfgAtual = _st.cfg;
                    const rws = _st.rows;
                    const tst = _st.toast || (window.DemandaApp && DemandaApp._toast) || console.log;
                    const fl = est.file || _st.file || (window.DemandaImagemDemarcador._ultimoEstado && window.DemandaImagemDemarcador._ultimoEstado.file);
                    const dUrl = est.dataUrl || _st.dataUrl || (window.DemandaImagemDemarcador._ultimoEstado && window.DemandaImagemDemarcador._ultimoEstado.imgUrl);
                    fechar();
                    DemandaImagemDemarcador.abrir({
                        file: fl,
                        dataUrl: dUrl,
                        rawImgUrl: est.rawImgUrl || dUrl,
                        rotacao: est.rotacao,
                        inclinacao: est.inclinacao,
                        contraste: est.contraste,
                        pb: est.pb,
                        cortesPct: est.cortesPct,
                        yTopPct: est.yTopPct,
                        yBottomPct: est.yBottomPct,
                        nome: nome,
                        toast: tst,
                        onVoltar: () => abrir({ rows: rws, nome, fonte, file: fl, dataUrl: dUrl, estadoDemarcador: est, cfg: cfgAtual, onConfirm: onConf, onVoltar: onVolt, toast: tst }),
                        onConfirm: (g, novoEst) => abrir({ rows: g, nome, fonte, file: fl, dataUrl: dUrl, estadoDemarcador: novoEst, cfg: cfgAtual, onConfirm: onConf, onVoltar: onVolt, toast: tst })
                    });
                } else {
                    // Arquivo Excel/Texto ou sem foto: abre diretamente a tela de edição de dados!
                    _setModoTela('edicao');
                }
            };
        }

        const btnFoto = $('mpdBtnDemarcarFoto');
        if (btnFoto) {
            btnFoto.style.display = (_st.estadoDemarcador && window.DemandaImagemDemarcador) ? 'inline-flex' : 'none';
            btnFoto.onclick = () => {
                const est = (_st && _st.estadoDemarcador) || {};
                const nome = _st.nome;
                const fonte = _st.fonte;
                const onConf = _st.onConfirm;
                const onVolt = _st.onVoltar;
                const cfgAtual = _st.cfg;
                const rws = _st.rows;
                const tst = _st.toast || (window.DemandaApp && DemandaApp._toast) || console.log;
                const fl = est.file || _st.file || (window.DemandaImagemDemarcador._ultimoEstado && window.DemandaImagemDemarcador._ultimoEstado.file);
                const dUrl = est.dataUrl || _st.dataUrl || (window.DemandaImagemDemarcador._ultimoEstado && window.DemandaImagemDemarcador._ultimoEstado.imgUrl);
                fechar();
                DemandaImagemDemarcador.abrir({
                    file: fl,
                    dataUrl: dUrl,
                    rawImgUrl: est.rawImgUrl || dUrl,
                    rotacao: est.rotacao,
                    inclinacao: est.inclinacao,
                    contraste: est.contraste,
                    pb: est.pb,
                    cortesPct: est.cortesPct,
                    yTopPct: est.yTopPct,
                    yBottomPct: est.yBottomPct,
                    nome: nome,
                    toast: tst,
                    onVoltar: () => abrir({ rows: rws, nome, fonte, file: fl, dataUrl: dUrl, estadoDemarcador: est, cfg: cfgAtual, onConfirm: onConf, onVoltar: onVolt, toast: tst }),
                    onConfirm: (g, novoEst) => abrir({ rows: g, nome, fonte, file: fl, dataUrl: dUrl, estadoDemarcador: novoEst, cfg: cfgAtual, onConfirm: onConf, onVoltar: onVolt, toast: tst })
                });
            };
        }

        const btnCortes = $('mpdBtnAjustarCortes');
        if (btnCortes) {
            btnCortes.style.display = (!_st.estadoDemarcador && window.DemandaTextoColunas) ? 'inline-flex' : 'none';
            btnCortes.onclick = () => {
                const raw = _st.rawText || (rows ? rows.map(r => Array.isArray(r) ? r.join('   ') : String(r)).join('\n') : '');
                const nome = _st.nome, fonte = _st.fonte, onConf = _st.onConfirm, onVolt = _st.onVoltar, cfgAtual = _st.cfg, rws = _st.rows;
                const tst = _st.toast || (window.DemandaApp && DemandaApp._toast) || console.log;
                fechar();
                DemandaTextoColunas.abrir({
                    text: raw, nome, fonte,
                    onVoltar: () => abrir({ rows: rws, nome, fonte, rawText: raw, cfg: cfgAtual, onConfirm: onConf, onVoltar: onVolt, toast: tst }),
                    onConfirm: (g) => abrir({ rows: g, nome, fonte, rawText: raw, cfg: cfgAtual, onConfirm: onConf, onVoltar: onVolt, toast: tst })
                });
            };
        }

        $('mpdOverlay').classList.add('open');
        _renderAviso();
        _render();

        // Modelos salvos: sugere o mais parecido (operador continua tendo que confirmar)
        await carregarModelos();
        if (!_st || !$('mpdOverlay').classList.contains('open')) return;
        const best = _melhorModelo();
        if (best && best.score >= 60) {
            _aplicarModelo(best.modelo);
            _st.modeloScore = best.score;
            $('mpdNomeModelo').value = best.modelo.nome;
        }
        _renderAviso();
        _render();
    }

    function fechar() {
        const o = $('mpdOverlay');
        if (o) o.classList.remove('open');
        _st = null;
    }

    return { abrir, fechar, sugerir, extrair, carregarModelos, excluirModelo, _semelhanca, _digital };
})();

if (typeof window !== 'undefined') window.DemandaMapeador = DemandaMapeador;
