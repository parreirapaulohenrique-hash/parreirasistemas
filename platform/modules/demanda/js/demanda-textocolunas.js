/**
 * demanda-textocolunas.js — Assistente para Conversão de Texto em Colunas (Estilo Excel)
 * ======================================================================================
 * Inspirado no Assistente de Importação / Texto para Colunas do Microsoft Excel:
 *  1. Régua com quebras de coluna por Largura Fixa (setas clicáveis/arrastáveis/excluíveis).
 *  2. Grade interativa com alinhamento fino por linha: botões [ ⇥ ] (deslocar para direita)
 *     e [ ⇤ ] (deslocar para esquerda), corrigindo quando o OCR engole a 1ª coluna (ex: SEQ).
 *  3. Células editáveis na grade para correções pontuais antes do Mapeador de Colunas.
 *
 * Parreira Sistemas — Inteligência de Demanda v3.3.6
 */
const DemandaTextoColunas = (() => {

    let _st = null; // { text, nome, fonte, onConfirm, onVoltar, cortes: [], linhas: [], grade: [], modo: 'regua' }

    const $ = (id) => document.getElementById(id);
    const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ── Sugestão automática de quebras por vales de espaços ──
    function sugerirQuebras(linhas) {
        if (!linhas || !linhas.length) return [10, 50, 70];
        const amostra = linhas.slice(0, 50);
        const maxLen = Math.min(180, Math.max(...amostra.map(l => l.length)));
        if (maxLen < 8) return [4];

        // Conta quantos caracteres são espaço em cada posição X
        const densidadeEspaco = new Array(maxLen).fill(0);
        amostra.forEach(l => {
            for (let i = 0; i < maxLen; i++) {
                if (i >= l.length || l[i] === ' ' || l[i] === '\t') densidadeEspaco[i]++;
            }
        });

        // Encontra vales contínuos de espaços compartilhados por pelo menos 40% das linhas
        const minLinhas = Math.max(2, Math.floor(amostra.length * 0.35));
        const cortes = [];
        let emVale = false;
        let inicioVale = -1;

        for (let i = 2; i < maxLen - 2; i++) {
            const ehEspaco = densidadeEspaco[i] >= minLinhas;
            if (ehEspaco && !emVale) {
                emVale = true;
                inicioVale = i;
            } else if (!ehEspaco && emVale) {
                emVale = false;
                const corte = Math.round((inicioVale + i) / 2);
                if (cortes.length === 0 || (corte - cortes[cortes.length - 1] >= 4)) {
                    cortes.push(corte);
                }
            }
        }

        // Se não achou vales suficientes, tenta cortes padrões baseados em números ou delimitadores
        if (cortes.length < 2) {
            // Tenta achar colunas comuns: 1-6 (SEQ), 7-55 (DESC/REF), 56-70 (MARCA/QNT), 71-90 (PRECO)
            return [6, 52, 68, 80, 95].filter(c => c < maxLen - 3);
        }
        return cortes;
    }

    // ── Aplica os cortes de largura fixa nas linhas para gerar a grade ──
    function fatiarTexto(linhas, cortes) {
        const sorted = [...new Set(cortes)].sort((a, b) => a - b);
        return linhas.map(l => {
            const cols = [];
            let ult = 0;
            sorted.forEach(c => {
                cols.push(l.slice(ult, c).trim());
                ult = c;
            });
            cols.push(l.slice(ult).trim());
            return cols;
        });
    }

    // ── DOM do Assistente ──
    function _garantirDOM() {
        if ($('dtcOverlay')) return;
        const div = document.createElement('div');
        div.id = 'dtcOverlay';
        div.className = 'dtc-overlay';
        div.innerHTML = `
        <div class="dtc-shell">
            <header class="dtc-head">
                <div class="dtc-head-l">
                    <span class="material-icons-round dtc-ico">view_column</span>
                    <div>
                        <h3>Assistente de Quebra de Colunas (Estilo Excel)</h3>
                        <div class="dtc-sub" id="dtcDocInfo">Defina as larguras dos campos antes de extrair os itens</div>
                    </div>
                </div>
                <div class="dtc-head-r">
                    <div class="dtc-tabs">
                        <button class="dtc-tab active" id="dtcTabRegua" onclick="DemandaTextoColunas._setModo('regua')">
                            <span class="material-icons-round">straighten</span> 1. Régua de Largura Fixa
                        </button>
                        <button class="dtc-tab" id="dtcTabGrade" onclick="DemandaTextoColunas._setModo('grade')">
                            <span class="material-icons-round">table_chart</span> 2. Grade &amp; Alinhamento Fino
                        </button>
                    </div>
                    <button class="dtc-btn dtc-btn-ghost" onclick="DemandaTextoColunas.fechar()" title="Fechar">✕</button>
                </div>
            </header>

            <div class="dtc-instrucao" id="dtcInstrucao">
                <span class="material-icons-round" style="color:#60a5fa;font-size:1.15rem">info</span>
                <span><b>Como usar a régua:</b> Clique na régua para <b>CRIAR</b> uma linha de corte. Arraste para <b>MOVER</b>. Clique duas vezes em uma seta para <b>EXCLUIR</b>.</span>
                <div style="margin-left:auto;display:flex;gap:.5rem">
                    <button class="dtc-btn dtc-btn-ghost dtc-btn-sm" onclick="DemandaTextoColunas._autoSugerir()">
                        <span class="material-icons-round">auto_fix_high</span> Auto-detectar Cortes
                    </button>
                    <button class="dtc-btn dtc-btn-ghost dtc-btn-sm" onclick="DemandaTextoColunas._limparCortes()">
                        <span class="material-icons-round">clear</span> Limpar Cortes
                    </button>
                </div>
            </div>

            <!-- Painel 1: Régua de Largura Fixa -->
            <div class="dtc-painel" id="dtcPainelRegua">
                <div class="dtc-ruler-outer" id="dtcRulerOuter">
                    <div class="dtc-ruler-wrap" id="dtcRulerWrap">
                        <div class="dtc-ruler" id="dtcRuler"></div>
                        <div class="dtc-markers" id="dtcMarkers"></div>
                    </div>
                    <div class="dtc-text-scroll" id="dtcTextScroll">
                        <div class="dtc-text-canvas" id="dtcTextCanvas">
                            <div class="dtc-vguides" id="dtcVGuides"></div>
                            <pre class="dtc-pre" id="dtcPre"></pre>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Painel 2: Grade com Shift de Linhas -->
            <div class="dtc-painel" id="dtcPainelGrade" style="display:none">
                <div class="dtc-grade-toolbar">
                    <span style="font-size:.78rem;color:#94a3b8">
                        Se o OCR engoliu a primeira coluna (ex: o número do item), clique em <b>[ ⇥ ]</b> naquela linha para deslocar as células para a direita.
                    </span>
                    <button class="dtc-btn dtc-btn-ghost dtc-btn-sm" onclick="DemandaTextoColunas._adicionarColunaVazia()">
                        <span class="material-icons-round">add</span> Adicionar Coluna no Fim
                    </button>
                </div>
                <div class="dtc-grade-scroll" id="dtcGradeScroll">
                    <table class="dtc-table" id="dtcTable"></table>
                </div>
            </div>

            <footer class="dtc-foot">
                <button class="dtc-btn dtc-btn-ghost" onclick="DemandaTextoColunas.fechar()">Cancelar</button>
                <div style="display:flex;gap:.75rem;align-items:center">
                    <span id="dtcStatusCortes" style="font-size:.8rem;color:#94a3b8"></span>
                    <button class="dtc-btn dtc-btn-pri" id="dtcBtnAvancar" onclick="DemandaTextoColunas._avancarParaMapeador()">
                        Avançar para Mapeador de Colunas <span class="material-icons-round">arrow_forward</span>
                    </button>
                </div>
            </footer>
        </div>
        `;
        document.body.appendChild(div);
    }

    // ── Medição precisa da largura de 1 caractere monoespaçado ──
    let _charWidth = 9.6; // fallback
    function _medirCharWidth() {
        const span = document.createElement('span');
        span.style.fontFamily = "'JetBrains Mono', 'Fira Code', 'Courier New', monospace";
        span.style.fontSize = '12px';
        span.style.visibility = 'hidden';
        span.style.position = 'absolute';
        span.textContent = 'WWWWWWWWWWWWWWWWWWWW'; // 20 chars
        document.body.appendChild(span);
        const w = span.getBoundingClientRect().width / 20;
        document.body.removeChild(span);
        if (w > 5 && w < 20) _charWidth = w;
        return _charWidth;
    }

    // ── Renderização da Régua e Guias ──
    function _renderRegua() {
        const rEl = $('dtcRuler');
        const mEl = $('dtcMarkers');
        const gEl = $('dtcVGuides');
        const pEl = $('dtcPre');
        if (!rEl || !mEl || !gEl || !pEl || !_st) return;

        const charW = _medirCharWidth();
        const maxLen = Math.max(120, ...(_st.linhas || []).slice(0, 80).map(l => l.length));
        const totalW = Math.max(800, Math.ceil((maxLen + 15) * charW));

        // Régua graduada
        let rHtml = '';
        for (let i = 0; i <= maxLen + 10; i += 10) {
            const px = i * charW;
            rHtml += `<div class="dtc-tick" style="left:${px}px"><span class="dtc-tick-num">${i}</span></div>`;
        }
        rEl.style.width = totalW + 'px';
        rEl.innerHTML = rHtml;

        // Setas / Marcadores
        const cortes = _st.cortes;
        let mHtml = '';
        let gHtml = '';
        cortes.forEach((c, idx) => {
            const px = Math.round(c * charW);
            mHtml += `
            <div class="dtc-marker" data-corte-idx="${idx}" data-char="${c}" style="left:${px}px" title="Quebra na coluna ${c}. Arraste para mover, clique 2x para remover.">
                <span class="dtc-arrow">▲</span>
                <span class="dtc-marker-lbl">${c}</span>
            </div>`;
            gHtml += `<div class="dtc-vguide" style="left:${px}px"></div>`;
        });
        mEl.style.width = totalW + 'px';
        mEl.innerHTML = mHtml;

        gEl.style.width = totalW + 'px';
        gEl.innerHTML = gHtml;

        // Texto
        pEl.style.width = totalW + 'px';
        pEl.textContent = _st.linhas.join('\n');

        // Status
        const colsCount = cortes.length + 1;
        $('dtcStatusCortes').textContent = `${cortes.length} quebras (${colsCount} colunas geradas) · ${_st.linhas.length} linhas`;

        _vincularEventosRegua(charW);
    }

    // ── Eventos de Arrastar, Criar e Remover Quebras ──
    function _vincularEventosRegua(charW) {
        const wrap = $('dtcRulerWrap');
        if (!wrap) return;

        // Clique na régua para CRIAR corte
        wrap.onclick = (e) => {
            if (e.target.closest('.dtc-marker')) return;
            const rect = wrap.getBoundingClientRect();
            const scrollLeft = $('dtcTextScroll').scrollLeft;
            const clickX = e.clientX - rect.left + scrollLeft;
            const charPos = Math.max(1, Math.round(clickX / charW));

            // Não cria se já existe muito perto
            if (_st.cortes.some(c => Math.abs(c - charPos) < 2)) return;
            _st.cortes.push(charPos);
            _st.cortes.sort((a, b) => a - b);
            _st.grade = fatiarTexto(_st.linhas, _st.cortes);
            _renderRegua();
        };

        // Arrastar ou excluir marcador
        const markers = wrap.querySelectorAll('.dtc-marker');
        markers.forEach(m => {
            const idx = Number(m.dataset.corteIdx);

            // Duplo clique = EXCLUIR
            m.ondblclick = (e) => {
                e.stopPropagation();
                _st.cortes.splice(idx, 1);
                _st.grade = fatiarTexto(_st.linhas, _st.cortes);
                _renderRegua();
            };

            // Mousedown = ARRASTAR
            m.onmousedown = (e) => {
                e.stopPropagation();
                e.preventDefault();
                const startX = e.clientX;
                const origPos = _st.cortes[idx];

                function onMove(ev) {
                    const deltaX = ev.clientX - startX;
                    const deltaChars = Math.round(deltaX / charW);
                    const newPos = Math.max(1, origPos + deltaChars);
                    _st.cortes[idx] = newPos;
                    const px = Math.round(newPos * charW);
                    m.style.left = px + 'px';
                    const lbl = m.querySelector('.dtc-marker-lbl');
                    if (lbl) lbl.textContent = newPos;
                    const guides = $('dtcVGuides').querySelectorAll('.dtc-vguide');
                    if (guides[idx]) guides[idx].style.left = px + 'px';
                }

                function onUp() {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    _st.cortes.sort((a, b) => a - b);
                    _st.grade = fatiarTexto(_st.linhas, _st.cortes);
                    _renderRegua();
                }

                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            };
        });

        // Sincroniza rolagem horizontal da régua com o texto
        const scroller = $('dtcTextScroll');
        scroller.onscroll = () => {
            wrap.style.transform = `translateX(-${scroller.scrollLeft}px)`;
        };
    }

    // ── Renderização da Grade & Alinhamento Fino ──
    function _renderGrade() {
        const table = $('dtcTable');
        if (!table || !_st) return;

        if (!_st.grade || !_st.grade.length) {
            _st.grade = fatiarTexto(_st.linhas, _st.cortes);
        }
        const grade = _st.grade;
        const maxCols = Math.max(1, ...grade.map(r => r.length));

        // Cabeçalho das colunas
        let thead = '<thead><tr><th style="width:75px;text-align:center">Linha</th><th style="width:90px;text-align:center">Ajustar</th>';
        for (let c = 0; c < maxCols; c++) {
            const letter = String.fromCharCode(65 + (c % 26)) + (c >= 26 ? Math.floor(c / 26) : '');
            thead += `<th>Coluna ${letter}</th>`;
        }
        thead += '</tr></thead>';

        // Linhas com botões [ ⇥ ] (Shift Right) e [ ⇤ ] (Shift Left)
        let tbody = '<tbody>';
        grade.forEach((row, rIdx) => {
            const lineNum = rIdx + 1;
            tbody += `<tr data-row="${rIdx}">`;
            tbody += `<td class="dtc-td-num"><b>${lineNum}</b></td>`;
            tbody += `
            <td class="dtc-td-actions">
                <button class="dtc-shift-b" onclick="DemandaTextoColunas._shiftRow(${rIdx}, 1)" title="Deslocar células para a DIREITA (insere célula vazia no início desta linha)">
                    ⇥
                </button>
                <button class="dtc-shift-b" onclick="DemandaTextoColunas._shiftRow(${rIdx}, -1)" title="Deslocar células para a ESQUERDA (puxa células)">
                    ⇤
                </button>
                <button class="dtc-del-b" onclick="DemandaTextoColunas._excluirLinhaGrade(${rIdx})" title="Remover esta linha">✕</button>
            </td>`;

            for (let c = 0; c < maxCols; c++) {
                const val = row[c] != null ? String(row[c]) : '';
                tbody += `
                <td class="dtc-td-cell" contenteditable="true" onblur="DemandaTextoColunas._editarCelula(${rIdx}, ${c}, this.innerText)">
                    ${_esc(val)}
                </td>`;
            }
            tbody += '</tr>';
        });
        tbody += '</tbody>';

        table.innerHTML = thead + tbody;
    }

    // ── Ações da Grade ──
    function _shiftRow(rIdx, dir) {
        if (!_st || !_st.grade || !_st.grade[rIdx]) return;
        if (dir === 1) {
            // Insere vazio no início
            _st.grade[rIdx].unshift('');
        } else if (dir === -1) {
            // Remove o primeiro elemento
            if (_st.grade[rIdx].length > 1) _st.grade[rIdx].shift();
            else _st.grade[rIdx][0] = '';
        }
        _renderGrade();
    }

    function _editarCelula(rIdx, cIdx, val) {
        if (!_st || !_st.grade || !_st.grade[rIdx]) return;
        while (_st.grade[rIdx].length <= cIdx) _st.grade[rIdx].push('');
        _st.grade[rIdx][cIdx] = (val || '').trim();
    }

    function _excluirLinhaGrade(rIdx) {
        if (!_st || !_st.grade) return;
        _st.grade.splice(rIdx, 1);
        _renderGrade();
    }

    function _adicionarColunaVazia() {
        if (!_st || !_st.grade) return;
        _st.grade.forEach(r => r.push(''));
        _renderGrade();
    }

    function _setModo(modo) {
        if (!_st) return;
        _st.modo = modo;
        const pRegua = $('dtcPainelRegua');
        const pGrade = $('dtcPainelGrade');
        const tRegua = $('dtcTabRegua');
        const tGrade = $('dtcTabGrade');
        const inst   = $('dtcInstrucao');

        if (modo === 'regua') {
            pRegua.style.display = 'flex';
            pGrade.style.display = 'none';
            tRegua.classList.add('active');
            tGrade.classList.remove('active');
            inst.innerHTML = `
                <span class="material-icons-round" style="color:#60a5fa;font-size:1.15rem">info</span>
                <span><b>Como usar a régua:</b> Clique na régua para <b>CRIAR</b> uma linha de corte. Arraste para <b>MOVER</b>. Clique duas vezes em uma seta para <b>EXCLUIR</b>.</span>
                <div style="margin-left:auto;display:flex;gap:.5rem">
                    <button class="dtc-btn dtc-btn-ghost dtc-btn-sm" onclick="DemandaTextoColunas._autoSugerir()">
                        <span class="material-icons-round">auto_fix_high</span> Auto-detectar Cortes
                    </button>
                    <button class="dtc-btn dtc-btn-ghost dtc-btn-sm" onclick="DemandaTextoColunas._limparCortes()">
                        <span class="material-icons-round">clear</span> Limpar Cortes
                    </button>
                </div>`;
            _renderRegua();
        } else {
            pRegua.style.display = 'none';
            pGrade.style.display = 'flex';
            tRegua.classList.remove('active');
            tGrade.classList.add('active');
            inst.innerHTML = `
                <span class="material-icons-round" style="color:#34d399;font-size:1.15rem">tune</span>
                <span><b>Alinhamento fino de linhas:</b> Use <b>[ ⇥ ]</b> para empurrar uma linha que pulou a 1ª coluna (ex: o número SEQ). Dê dois cliques em qualquer célula para corrigir texto.</span>
                <div style="margin-left:auto;display:flex;gap:.5rem">
                    <button class="dtc-btn dtc-btn-ghost dtc-btn-sm" onclick="DemandaTextoColunas._adicionarColunaVazia()">
                        <span class="material-icons-round">add</span> + Coluna
                    </button>
                </div>`;
            _renderGrade();
        }
    }

    function _autoSugerir() {
        if (!_st) return;
        _st.cortes = sugerirQuebras(_st.linhas);
        _st.grade = fatiarTexto(_st.linhas, _st.cortes);
        _renderRegua();
    }

    function _limparCortes() {
        if (!_st) return;
        _st.cortes = [];
        _st.grade = fatiarTexto(_st.linhas, []);
        _renderRegua();
    }

    function _avancarParaMapeador() {
        if (!_st) return;
        // Atualiza a grade com base nos cortes ou edições
        if (!_st.grade || !_st.grade.length) {
            _st.grade = fatiarTexto(_st.linhas, _st.cortes);
        }
        const gradeFinal = _st.grade
            .map(r => r.map(c => String(c == null ? '' : c).trim()))
            .filter(r => r.some(c => c !== ''));

        if (!gradeFinal.length) {
            alert('Nenhum dado legível na grade.');
            return;
        }

        const onConfirm = _st.onConfirm;
        fechar();
        if (onConfirm) onConfirm(gradeFinal);
    }

    // ── Abrir e Fechar ──
    function abrir(opts) {
        _garantirDOM();
        const rawText = String(opts.text || '').replace(/\r\n/g, '\n');
        const linhas = rawText.split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.trim().length > 0);
        if (!linhas.length) {
            if (opts.toast) opts.toast('Texto vazio para separar colunas.', 'warning');
            return;
        }

        const cortes = (opts.cortes && opts.cortes.length) ? [...opts.cortes] : sugerirQuebras(linhas);
        _st = {
            text: rawText,
            linhas,
            cortes,
            nome: opts.nome || 'Documento',
            fonte: opts.fonte || 'foto',
            onConfirm: opts.onConfirm,
            grade: fatiarTexto(linhas, cortes),
            modo: 'regua'
        };

        $('dtcDocInfo').textContent = `${_st.nome} · ${linhas.length} linhas reconhecidas`;
        $('dtcOverlay').classList.add('open');
        _setModo('regua');
    }

    function fechar() {
        const o = $('dtcOverlay');
        if (o) o.classList.remove('open');
        _st = null;
    }

    return {
        abrir,
        fechar,
        sugerirQuebras,
        fatiarTexto,
        _setModo,
        _autoSugerir,
        _limparCortes,
        _shiftRow,
        _editarCelula,
        _excluirLinhaGrade,
        _adicionarColunaVazia,
        _avancarParaMapeador,
    };

})();

if (typeof window !== 'undefined') window.DemandaTextoColunas = DemandaTextoColunas;
