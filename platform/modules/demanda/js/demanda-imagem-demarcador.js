/**
 * demanda-imagem-demarcador.js — Demarcador Visual de Colunas na Imagem
 * ======================================================================
 * Permite ao operador demarcar as divisões de colunas e os limites da tabela
 * (início e fim dos produtos, cortando cabeçalho e rodapé) DIRETAMENTE
 * SOBRE A IMAGEM antes de digitalizar.
 *
 * Somente após o operador posicionar as divisões é que o OCR é executado,
 * mapeando cada palavra nas coordenadas da sua respectiva coluna.
 */

const DemandaImagemDemarcador = (() => {

    let _st = null; // { file, imgUrl, naturalW, naturalH, cortesPct: [], yTopPct: 0.15, yBottomPct: 0.85, onConfirm, toast }
    let _activeDrag = null; // { type: 'x'|'yTop'|'yBottom', index, startClientX, startClientY, startPct }

    const $ = (id) => document.getElementById(id);

    function _toast(msg, tipo) {
        if (_st && typeof _st.toast === 'function') return _st.toast(msg, tipo);
        if (window.DemandaApp && typeof DemandaApp._toast === 'function') return DemandaApp._toast(msg, tipo);
        console.log('[Demarcador]', msg);
    }

    // ── Criação do Modal / Estrutura DOM ─────────────────────
    function _garantirDOM() {
        if ($('didOverlay')) return;

        const html = `
        <div id="didOverlay" class="did-overlay" style="display:none">
            <div class="did-shell">
                <!-- Cabeçalho -->
                <div class="did-header">
                    <div style="display:flex;align-items:center;gap:.6rem">
                        <span class="material-icons-round" style="color:#38bdf8;font-size:1.4rem">crop</span>
                        <div>
                            <div style="font-weight:700;font-size:.96rem;color:#f8fafc">Demarcar Colunas na Imagem</div>
                            <div style="font-size:.74rem;color:#94a3b8">Posicione as linhas de corte verticais e os limites da tabela sobre a foto antes de digitalizar</div>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:.5rem">
                        <button class="did-btn did-btn-ghost did-btn-sm" id="didBtnFechar" title="Fechar">
                            <span class="material-icons-round" style="font-size:1.1rem">close</span>
                        </button>
                    </div>
                </div>

                <!-- Barra de Ferramentas -->
                <div class="did-toolbar">
                    <div class="did-tools-left">
                        <button class="did-btn did-btn-sec did-btn-sm" id="didBtnAddCol" title="Adiciona uma nova linha vertical de coluna">
                            <span class="material-icons-round">add</span> Coluna
                        </button>
                        <button class="did-btn did-btn-sec did-btn-sm" id="didBtnAutoCols" title="Posiciona automaticamente divisões sugeridas">
                            <span class="material-icons-round">auto_awesome</span> Sugerir 5 Colunas
                        </button>
                        <button class="did-btn did-btn-sec did-btn-sm" id="didBtnLimpar" title="Remove todos os cortes verticais">
                            <span class="material-icons-round">clear_all</span> Limpar Cortes
                        </button>

                        <div class="did-divider"></div>

                        <!-- Dica de uso rápida -->
                        <span class="did-hint">
                            <span class="material-icons-round" style="font-size:.85rem;color:#38bdf8">info</span>
                            Clique na imagem para criar coluna · Arraste para mover · Duplo-clique no marcador para excluir
                        </span>
                    </div>

                    <div class="did-tools-right">
                        <!-- Zoom -->
                        <div class="did-zoom-group">
                            <button class="did-btn did-btn-icon" id="didBtnZoomOut" title="Diminuir Zoom">－</button>
                            <span id="didZoomVal" style="font-size:.76rem;color:#cbd5e1;font-weight:600;min-width:42px;text-align:center">100%</span>
                            <button class="did-btn did-btn-icon" id="didBtnZoomIn" title="Aumentar Zoom">＋</button>
                            <button class="did-btn did-btn-sec did-btn-xs" id="didBtnZoomFit" title="Ajustar à tela">Ajustar</button>
                        </div>

                        <!-- Botão Principal de Digitalização -->
                        <button class="did-btn did-btn-primary" id="didBtnDigitalizar">
                            <span class="material-icons-round">document_scanner</span>
                            <span>Digitalizar e Importar</span>
                        </button>
                    </div>
                </div>

                <!-- Palco de Imagem e Demarcações -->
                <div class="did-stage-scroll" id="didStageScroll">
                    <div class="did-stage" id="didStage">
                        <!-- Imagem do documento -->
                        <img id="didImage" alt="Documento para demarcação" draggable="false" />

                        <!-- Máscara de Cabeçalho (tudo acima de yTop) -->
                        <div id="didMaskTop" class="did-mask did-mask-top"></div>
                        <!-- Alça e Linha de Início dos Itens -->
                        <div id="didLineTop" class="did-hline did-hline-top">
                            <div class="did-hline-handle" id="didHandleTop">
                                <span class="material-icons-round" style="font-size:.8rem">expand_more</span>
                                Início dos Produtos (ignorar cabeçalho acima)
                            </div>
                        </div>

                        <!-- Máscara de Rodapé (tudo abaixo de yBottom) -->
                        <div id="didMaskBottom" class="did-mask did-mask-bottom"></div>
                        <!-- Alça e Linha de Fim dos Itens -->
                        <div id="didLineBottom" class="did-hline did-hline-bottom">
                            <div class="did-hline-handle" id="didHandleBottom">
                                <span class="material-icons-round" style="font-size:.8rem">expand_less</span>
                                Fim dos Produtos (ignorar rodapé abaixo)
                            </div>
                        </div>

                        <!-- Container dinâmico das linhas de colunas -->
                        <div id="didColsLayer" class="did-cols-layer"></div>
                    </div>
                </div>

                <!-- Rodapé informativo -->
                <div class="did-footer">
                    <div id="didInfoColunas" style="font-size:.76rem;color:#94a3b8">
                        0 cortes definidos (1 coluna gerada)
                    </div>
                    <div style="font-size:.74rem;color:#64748b">
                        Linhas de Início/Fim e Colunas cortam os dados com precisão matemática diretamente dos pixels da foto.
                    </div>
                </div>

                <!-- Overlay de Carregamento durante o OCR -->
                <div id="didLoading" class="did-loading" style="display:none">
                    <div class="did-loading-box">
                        <div class="did-spinner"></div>
                        <div style="font-weight:700;font-size:1rem;color:#f8fafc" id="didLoadingTitle">Digitalizando Colunas...</div>
                        <div style="font-size:.8rem;color:#94a3b8" id="didLoadingMsg">Extraindo dados das colunas demarcadas. Aguarde alguns segundos...</div>
                    </div>
                </div>
            </div>
        </div>
        `;

        document.body.insertAdjacentHTML('beforeend', html);
        _bindEventosGlobais();
    }

    // ── Abertura do Demarcador com Arquivo de Imagem ──────────
    function abrir(opts) {
        _garantirDOM();

        const file = opts.file;
        const dataUrl = opts.dataUrl;
        const onConfirm = opts.onConfirm;
        const toast = opts.toast;

        if (!file && !dataUrl) {
            _toast('Nenhuma imagem fornecida para demarcação.', 'error');
            return;
        }

        const imgEl = $('didImage');
        $('didOverlay').style.display = 'flex';
        $('didLoading').style.display = 'none';

        // Estado inicial
        _st = {
            file: file,
            nome: opts.nome || (file ? file.name : 'Foto / Print'),
            imgUrl: dataUrl || '',
            naturalW: 1000,
            naturalH: 1000,
            zoom: 1.0,
            yTopPct: opts.yTopPct != null ? opts.yTopPct : 0.18,      // 18% do topo corta cabeçalho comum
            yBottomPct: opts.yBottomPct != null ? opts.yBottomPct : 0.88, // 88% corta rodapé
            cortesPct: opts.cortesPct && opts.cortesPct.length ? opts.cortesPct.slice() : [0.15, 0.45, 0.62, 0.76, 0.88], // 5 cortes = 6 colunas típicas
            onConfirm: onConfirm,
            toast: toast
        };

        if (dataUrl) {
            imgEl.src = dataUrl;
            imgEl.onload = () => _aoCarregarImagem(imgEl);
        } else if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                _st.imgUrl = e.target.result;
                imgEl.src = _st.imgUrl;
                imgEl.onload = () => _aoCarregarImagem(imgEl);
            };
            reader.readAsDataURL(file);
        }
    }

    function _aoCarregarImagem(imgEl) {
        _st.naturalW = imgEl.naturalWidth || 1000;
        _st.naturalH = imgEl.naturalHeight || 1000;
        _ajustarZoomFit();
        _renderizar();
        _toast('Foto carregada! Posicione as colunas e os limites da tabela e clique em Digitalizar.', 'info');
    }

    function fechar() {
        const overlay = $('didOverlay');
        if (overlay) overlay.style.display = 'none';
        _activeDrag = null;
    }

    // ── Renderização das Camadas ──────────────────────────────
    function _renderizar() {
        if (!_st) return;

        const stage = $('didStage');
        const imgEl = $('didImage');
        const w = _st.naturalW * _st.zoom;
        const h = _st.naturalH * _st.zoom;

        stage.style.width = w + 'px';
        stage.style.height = h + 'px';
        imgEl.style.width = w + 'px';
        imgEl.style.height = h + 'px';

        $('didZoomVal').textContent = Math.round(_st.zoom * 100) + '%';

        // 1. Limites Horizontais (Início / Fim dos Produtos)
        const yTopPx = _st.yTopPct * h;
        const yBottomPx = _st.yBottomPct * h;

        const maskTop = $('didMaskTop');
        const lineTop = $('didLineTop');
        maskTop.style.top = '0px';
        maskTop.style.height = Math.max(0, yTopPx) + 'px';
        maskTop.style.width = w + 'px';
        lineTop.style.top = yTopPx + 'px';
        lineTop.style.width = w + 'px';

        const maskBottom = $('didMaskBottom');
        const lineBottom = $('didLineBottom');
        maskBottom.style.top = yBottomPx + 'px';
        maskBottom.style.height = Math.max(0, h - yBottomPx) + 'px';
        maskBottom.style.width = w + 'px';
        lineBottom.style.top = yBottomPx + 'px';
        lineBottom.style.width = w + 'px';

        // 2. Colunas Verticais
        _renderizarColunas(w, h, yTopPx, yBottomPx);

        // 3. Atualiza contadores
        const qtdCortes = _st.cortesPct.length;
        const qtdCols = qtdCortes + 1;
        $('didInfoColunas').textContent = `${qtdCortes} corte(s) definido(s) (${qtdCols} colunas geradas) · Linhas: ${Math.round(_st.yTopPct * 100)}% até ${Math.round(_st.yBottomPct * 100)}% da imagem`;
    }

    function _renderizarColunas(w, h, yTopPx, yBottomPx) {
        const layer = $('didColsLayer');
        layer.innerHTML = '';

        // Ordena cortes
        _st.cortesPct.sort((a, b) => a - b);

        // Faixas de colunas (labels no topo)
        const borders = [0, ..._st.cortesPct, 1];
        for (let i = 0; i < borders.length - 1; i++) {
            const leftPx = borders[i] * w;
            const rightPx = borders[i + 1] * w;
            const colWidth = rightPx - leftPx;

            const badge = document.createElement('div');
            badge.className = 'did-col-badge';
            badge.style.left = leftPx + 'px';
            badge.style.width = colWidth + 'px';
            badge.style.top = Math.max(4, yTopPx - 26) + 'px';
            badge.textContent = `Col ${i + 1}`;
            layer.appendChild(badge);
        }

        // Marcadores de corte verticais
        _st.cortesPct.forEach((pct, idx) => {
            const xPx = pct * w;

            // Linha guia vertical
            const line = document.createElement('div');
            line.className = 'did-vline';
            line.style.left = xPx + 'px';
            line.style.top = yTopPx + 'px';
            line.style.height = Math.max(0, yBottomPx - yTopPx) + 'px';

            // Marcador interativo (alça com seta)
            const handle = document.createElement('div');
            handle.className = 'did-vhandle';
            handle.style.left = xPx + 'px';
            handle.style.top = Math.max(0, yTopPx - 16) + 'px';
            handle.title = `Coluna ${idx + 1} / ${idx + 2} (${Math.round(pct * 100)}%)\nArraste para mover · Duplo-clique para excluir`;

            handle.innerHTML = `
                <span class="did-vhandle-arrow">▲</span>
                <span class="did-vhandle-tag">${idx + 1}</span>
            `;

            // Mousedown / Touchstart para arrastar
            const iniciarArrasto = (e) => {
                e.stopPropagation();
                e.preventDefault();
                _activeDrag = {
                    type: 'x',
                    index: idx,
                    startClientX: e.touches ? e.touches[0].clientX : e.clientX,
                    startPct: pct
                };
            };
            handle.addEventListener('mousedown', iniciarArrasto);
            handle.addEventListener('touchstart', iniciarArrasto, { passive: false });

            // Duplo clique exclui corte
            handle.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                _st.cortesPct.splice(idx, 1);
                _renderizar();
            });

            layer.appendChild(line);
            layer.appendChild(handle);
        });
    }

    // ── Ajuste de Zoom ────────────────────────────────────────
    function _ajustarZoomFit() {
        const scrollEl = $('didStageScroll');
        if (!scrollEl || !_st.naturalW) return;
        const padX = 40;
        const availW = scrollEl.clientWidth - padX;
        const fitRatio = Math.min(availW / _st.naturalW, 1.2);
        _st.zoom = Math.max(0.3, Math.min(1.5, fitRatio));
    }

    // ── Eventos Globais de Mouse e Toque ──────────────────────
    function _bindEventosGlobais() {
        $('didBtnFechar').onclick = fechar;

        // Adicionar Coluna (cria corte no centro do maior vão existente)
        $('didBtnAddCol').onclick = () => {
            if (!_st) return;
            const borders = [0, ..._st.cortesPct, 1];
            let maxGap = 0, gapStart = 0;
            for (let i = 0; i < borders.length - 1; i++) {
                const gap = borders[i + 1] - borders[i];
                if (gap > maxGap) {
                    maxGap = gap;
                    gapStart = borders[i];
                }
            }
            if (maxGap > 0.04) {
                const novoPct = Math.round((gapStart + maxGap / 2) * 1000) / 1000;
                _st.cortesPct.push(novoPct);
                _renderizar();
            }
        };

        // Sugerir 5 Colunas (6 faixas típicas: Seq, Código, Descrição, Marca/Local, Qtde, Preço)
        $('didBtnAutoCols').onclick = () => {
            if (!_st) return;
            _st.cortesPct = [0.15, 0.45, 0.62, 0.76, 0.88];
            _renderizar();
            _toast('5 colunas sugeridas aplicadas na foto. Ajuste os marcadores conforme necessário.', 'info');
        };

        // Limpar Cortes
        $('didBtnLimpar').onclick = () => {
            if (!_st) return;
            _st.cortesPct = [];
            _renderizar();
            _toast('Cortes de coluna removidos.', 'info');
        };

        // Controles de Zoom
        $('didBtnZoomIn').onclick = () => {
            if (!_st) return;
            _st.zoom = Math.min(2.5, Math.round((_st.zoom + 0.15) * 100) / 100);
            _renderizar();
        };
        $('didBtnZoomOut').onclick = () => {
            if (!_st) return;
            _st.zoom = Math.max(0.3, Math.round((_st.zoom - 0.15) * 100) / 100);
            _renderizar();
        };
        $('didBtnZoomFit').onclick = () => {
            if (!_st) return;
            _ajustarZoomFit();
            _renderizar();
        };

        // Clique no palco para criar corte
        const stage = $('didStage');
        stage.onclick = (e) => {
            if (_activeDrag) return;
            if (e.target.closest('.did-vhandle') || e.target.closest('.did-hline-handle')) return;
            const rect = stage.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const pct = Math.max(0.02, Math.min(0.98, clickX / rect.width));

            // Não cria se já houver um corte muito perto (tolerância 1.5%)
            const perto = _st.cortesPct.some(p => Math.abs(p - pct) < 0.015);
            if (!perto) {
                _st.cortesPct.push(Math.round(pct * 1000) / 1000);
                _renderizar();
            }
        };

        // Arrasto das Linhas Horizontais
        const handleTop = $('didHandleTop');
        const handleBottom = $('didHandleBottom');

        const iniciarArrastoH = (tipo, e) => {
            e.stopPropagation();
            e.preventDefault();
            _activeDrag = {
                type: tipo,
                startClientY: e.touches ? e.touches[0].clientY : e.clientY,
                startPct: tipo === 'yTop' ? _st.yTopPct : _st.yBottomPct
            };
        };

        handleTop.addEventListener('mousedown', (e) => iniciarArrastoH('yTop', e));
        handleTop.addEventListener('touchstart', (e) => iniciarArrastoH('yTop', e), { passive: false });

        handleBottom.addEventListener('mousedown', (e) => iniciarArrastoH('yBottom', e));
        handleBottom.addEventListener('touchstart', (e) => iniciarArrastoH('yBottom', e), { passive: false });

        // Movimentação global (MouseMove / TouchMove)
        const emMovimento = (e) => {
            if (!_activeDrag || !_st) return;
            const stageRect = stage.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            if (_activeDrag.type === 'x') {
                const xStage = clientX - stageRect.left;
                const newPct = Math.max(0.01, Math.min(0.99, xStage / stageRect.width));
                _st.cortesPct[_activeDrag.index] = Math.round(newPct * 1000) / 1000;
                _renderizar();
            } else if (_activeDrag.type === 'yTop') {
                const yStage = clientY - stageRect.top;
                const newPct = Math.max(0.02, Math.min(_st.yBottomPct - 0.05, yStage / stageRect.height));
                _st.yTopPct = Math.round(newPct * 1000) / 1000;
                _renderizar();
            } else if (_activeDrag.type === 'yBottom') {
                const yStage = clientY - stageRect.top;
                const newPct = Math.max(_st.yTopPct + 0.05, Math.min(0.98, yStage / stageRect.height));
                _st.yBottomPct = Math.round(newPct * 1000) / 1000;
                _renderizar();
            }
        };

        const fimMovimento = () => {
            _activeDrag = null;
        };

        window.addEventListener('mousemove', emMovimento);
        window.addEventListener('touchmove', emMovimento, { passive: false });
        window.addEventListener('mouseup', fimMovimento);
        window.addEventListener('touchend', fimMovimento);

        // Digitalização e Importação
        $('didBtnDigitalizar').onclick = () => _executarDigitalizacao();
    }

    // ── Execução do OCR com Mapeamento em Coordenadas ────────
    async function _executarDigitalizacao() {
        if (!_st || !_st.imgUrl) {
            _toast('Nenhuma imagem disponível para digitalizar.', 'error');
            return;
        }

        const loading = $('didLoading');
        const loadingMsg = $('didLoadingMsg');
        loading.style.display = 'flex';
        loadingMsg.textContent = 'Enviando imagem recortada para motor OCR de alta resolução...';

        try {
            // 1. Gera base64 recortando da linha de início à linha de fim (cortando cabeçalho e rodapé)
            const imgEl = $('didImage');
            const natW = _st.naturalW;
            const natH = _st.naturalH;

            const yTopPx = Math.round(_st.yTopPct * natH);
            const yBottomPx = Math.round(_st.yBottomPct * natH);
            const cropH = Math.max(50, yBottomPx - yTopPx);

            // Canvas da tabela limpa
            const cv = document.createElement('canvas');
            const maxDim = 1800;
            const scale = Math.min(maxDim / natW, maxDim / cropH, 1.0);
            cv.width = Math.round(natW * scale);
            cv.height = Math.round(cropH * scale);

            const ctx = cv.getContext('2d');
            ctx.drawImage(imgEl, 0, yTopPx, natW, cropH, 0, 0, cv.width, cv.height);
            const croppedBase64 = cv.toDataURL('image/jpeg', 0.90);

            // 2. Chama a API de OCR
            loadingMsg.textContent = 'Lendo e identificando texto nas coordenadas demarcadas...';
            const resp = await fetch('/api/ocr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ base64: croppedBase64, engine: '1' })
            });

            if (!resp.ok) {
                throw new Error(`Erro no servidor OCR: HTTP ${resp.status}`);
            }

            const data = await resp.json();
            const text = (data && data.text ? data.text : '').trim();
            const overlay = (data && data.overlay) || null;

            // 3. Monta a Grade Tabular usando as Colunas Demarcadas
            loadingMsg.textContent = 'Distribuindo dados nas colunas demarcadas...';

            let grade = [];

            // Método Primário: Extração por Overlay de Palavras com Bounding Boxes
            if (overlay && overlay.Lines && overlay.Lines.length > 0) {
                grade = _montarGradePorOverlay(overlay, _st.cortesPct, cv.width, cv.height);
            }

            // Fallback: se overlay não veio ou veio vazio, utiliza linhas de texto
            if (!grade || grade.length === 0) {
                grade = _montarGradePorTexto(text, _st.cortesPct.length + 1);
            }

            loading.style.display = 'none';

            if (!grade || grade.length === 0) {
                _toast('Nenhum dado legível foi extraído da área demarcada. Verifique se o recorte abrange os produtos.', 'warning');
                return;
            }

            _toast(`Digitalização concluída com sucesso! ${grade.length} linha(s) extraída(s) nas colunas demarcadas.`, 'success');

            const onConfirmCallback = _st.onConfirm;
            const nomeArq = _st.nome;
            const estadoDemarcador = {
                file: _st.file,
                dataUrl: _st.imgUrl,
                yTopPct: _st.yTopPct,
                yBottomPct: _st.yBottomPct,
                cortesPct: _st.cortesPct.slice()
            };

            fechar();

            // Envia grade para o Mapeador de Colunas
            if (typeof onConfirmCallback === 'function') {
                onConfirmCallback(grade, estadoDemarcador);
            } else if (window.DemandaMapeador) {
                DemandaMapeador.abrir({
                    rows: grade,
                    fonte: 'foto',
                    nome: nomeArq,
                    estadoDemarcador: estadoDemarcador,
                    toast: _toast,
                    onConfirm: function(itens) {
                        if (window.DemandaApp && typeof DemandaApp._showConferencia === 'function') {
                            DemandaApp._showConferencia(itens);
                        }
                    }
                });
            }

        } catch (err) {
            console.error('[Demarcador]', err);
            loading.style.display = 'none';
            _toast(`Falha na digitalização: ${err.message || err}`, 'error');
        }
    }

    // ── Distribuição das Palavras nas Colunas Demarcadas ──────
    function _montarGradePorOverlay(overlay, cortesPct, imgW, imgH) {
        // Coleta todas as palavras com suas coordenadas no recorte
        const palavras = [];
        overlay.Lines.forEach(line => {
            if (!line.Words) return;
            line.Words.forEach(w => {
                const txt = String(w.WordText || '').trim();
                if (!txt) return;
                palavras.push({
                    text: txt,
                    left: w.Left,
                    top: w.Top,
                    height: w.Height || 16,
                    width: w.Width || 40,
                    centerY: w.Top + (w.Height || 16) / 2,
                    centerX: w.Left + (w.Width || 40) / 2
                });
            });
        });

        if (!palavras.length) return [];

        // 1. Agrupa palavras em Linhas usando proximidade vertical (Y)
        palavras.sort((a, b) => a.centerY - b.centerY);

        const avgHeight = palavras.reduce((acc, p) => acc + p.height, 0) / palavras.length;
        const lineTol = Math.max(8, avgHeight * 0.65);

        const gruposLinhas = [];
        let linhaAtual = [palavras[0]];

        for (let i = 1; i < palavras.length; i++) {
            const p = palavras[i];
            const mediaYLinha = linhaAtual.reduce((acc, it) => acc + it.centerY, 0) / linhaAtual.length;

            if (Math.abs(p.centerY - mediaYLinha) <= lineTol) {
                linhaAtual.push(p);
            } else {
                gruposLinhas.push(linhaAtual);
                linhaAtual = [p];
            }
        }
        if (linhaAtual.length) gruposLinhas.push(linhaAtual);

        // 2. Para cada linha, distribui as palavras nas colunas demarcadas
        const borders = [0, ...cortesPct, 1].map(pct => pct * imgW);
        const numCols = borders.length - 1;

        const grade = [];

        gruposLinhas.forEach(linha => {
            const cols = new Array(numCols).fill('');

            // Ordena palavras da linha da esquerda para a direita
            linha.sort((a, b) => a.left - b.left);

            linha.forEach(p => {
                // Encontra qual coluna contém o centro da palavra
                let colIdx = numCols - 1;
                for (let c = 0; c < numCols; c++) {
                    if (p.centerX >= borders[c] && p.centerX < borders[c + 1]) {
                        colIdx = c;
                        break;
                    }
                }
                cols[colIdx] = (cols[colIdx] ? cols[colIdx] + ' ' : '') + p.text;
            });

            // Adiciona se a linha tiver pelo menos algum conteúdo não vazio
            const temTexto = cols.some(c => c.trim().length > 0);
            if (temTexto) {
                grade.push(cols);
            }
        });

        return grade;
    }

    // ── Fallback de Distribuição por Texto ─────────────────────
    function _montarGradePorTexto(texto, numCols) {
        if (!texto) return [];
        const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const grade = [];

        linhas.forEach(l => {
            let partes = [];
            if (l.includes('\t')) {
                partes = l.split('\t').map(p => p.trim());
            } else if (l.includes(';')) {
                partes = l.split(';').map(p => p.trim());
            } else if (l.includes('  ')) {
                partes = l.split(/\s{2,}/).map(p => p.trim());
            } else {
                partes = [l];
            }

            // Normaliza para o número de colunas
            while (partes.length < numCols) partes.push('');
            if (partes.length > numCols) {
                const prim = partes.slice(0, numCols - 1);
                prim.push(partes.slice(numCols - 1).join(' '));
                partes = prim;
            }
            grade.push(partes);
        });

        return grade;
    }

    return {
        abrir,
        fechar
    };

})();

window.DemandaImagemDemarcador = DemandaImagemDemarcador;
