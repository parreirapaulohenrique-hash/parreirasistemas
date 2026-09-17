// =============================================================================
// coletor-inventario.js — Mapeamento de Estoque e Inventário no Coletor
// Parreira Sistemas — WMS Coletor
// =============================================================================
// Suporta:
//   1. Endereçamento Fixo vs Dinâmico (Caótico)
//   2. Único Endereço de Picking vs Múltiplos Pickings por Produto
//   3. Validação instantânea das Regras de Armazenagem
// =============================================================================

window.ColetorInventario = (function () {

    let _currentEndereco = null;
    let _tipoEndereco = 'PICKING';
    let _itensNoVao = [];
    let _ultimoProdutoIdentificado = null;

    function _getRegras() {
        if (window.WmsStore && window.WmsStore.getRegrasArmazenagem) {
            return window.WmsStore.getRegrasArmazenagem();
        }
        try {
            const raw = localStorage.getItem('wms_config' + (window.getTenantSuffix ? window.getTenantSuffix() : ''));
            const cfg = raw ? JSON.parse(raw) : {};
            return {
                tipoEnderec:         cfg.putaway?.tipoEnderec || 'FLUTUANTE',
                limitePickingPorSku: cfg.putaway?.limitePickingPorSku || 'UNICO',
                acaoDivergencia:     cfg.putaway?.acaoDivergencia || 'ALERTAR',
                permiteMisturaSku:   cfg.putaway?.permiteMisturaSku !== false,
                enderecosFixos:      cfg.enderecoFixo || {}
            };
        } catch(_) {
            return { tipoEnderec: 'FLUTUANTE', limitePickingPorSku: 'UNICO', acaoDivergencia: 'ALERTAR', permiteMisturaSku: true, enderecosFixos: {} };
        }
    }

    function _detectarTipoEndereco(endStr) {
        const e = (endStr || '').toUpperCase();
        const partes = e.split('-');
        if (partes.length >= 3) {
            const nivel = parseInt(partes[2], 10);
            if (!isNaN(nivel) && nivel >= 3) return 'PULMAO';
        }
        if (e.includes('PUL') || e.includes('RES')) return 'PULMAO';
        return 'PICKING';
    }

    /** Renderiza a tela principal de inventário */
    function render(container) {
        if (!container) container = document.getElementById('screen-inventario');
        if (!container) return;

        const regras = _getRegras();
        const modoFixo = regras.tipoEnderec === 'FIXO';
        const pickingUnico = regras.limitePickingPorSku === 'UNICO';

        container.innerHTML = `
            <!-- Cabeçalho e Regras Ativas -->
            <div class="m-card" style="margin-bottom:.75rem;border-left:3px solid #10b981;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div style="font-weight:700;font-size:.9rem;display:flex;align-items:center;gap:.4rem;color:#10b981;">
                        <span class="material-icons-round">inventory_2</span>
                        Inventário & Endereçamento
                    </div>
                    <div style="display:flex;gap:.3rem;">
                        <span class="m-badge ${modoFixo ? 'm-badge-blue' : 'm-badge-green'}" style="font-size:.65rem;" title="Regra de Endereçamento">
                            ${modoFixo ? '📌 FIXO' : '🔄 DINÂMICO'}
                        </span>
                        <span class="m-badge ${pickingUnico ? 'm-badge-purple' : 'm-badge-blue'}" style="font-size:.65rem;" title="Política de Picking">
                            ${pickingUnico ? '🎯 PICKING ÚNICO' : '📦 MULTI-PICK'}
                        </span>
                    </div>
                </div>
            </div>

            <!-- Card 1: Endereço do Vão -->
            <div class="m-card" style="margin-bottom:.75rem;">
                ${!_currentEndereco ? `
                    <label class="m-label" style="display:flex;justify-content:space-between;">
                        <span>1. Bipar ou Informar Endereço</span>
                        <span style="font-size:.68rem;color:var(--text-secondary);">Ex: A-01-02-01</span>
                    </label>
                    <div style="display:flex;gap:.5rem;">
                        <input id="inv-endereco-inp" type="text" class="m-input" 
                            placeholder="Rua-Módulo-Nível-Vão..." 
                            style="font-family:monospace;font-weight:700;font-size:.9rem;text-transform:uppercase;"
                            onkeydown="if(event.key==='Enter') window.ColetorInventario.selecionarEnderecoManual()">
                        <button class="m-btn m-btn-primary" onclick="window.ColetorInventario.selecionarEnderecoManual()"
                            style="padding:0 .85rem;white-space:nowrap;font-size:.8rem;font-weight:700;">
                            OK
                        </button>
                        <button onclick="startCameraScanner('inv-endereco-inp')" 
                            style="background:#0ea5e9;color:white;border:none;padding:0 .75rem;border-radius:6px;cursor:pointer;display:flex;align-items:center;"
                            title="Bipar etiqueta com a Câmera">
                            <span class="material-icons-round" style="font-size:1.1rem;">photo_camera</span>
                        </button>
                    </div>
                ` : `
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div style="display:flex;align-items:center;gap:.5rem;">
                            <span class="material-icons-round" style="color:#10b981;font-size:1.6rem;">place</span>
                            <div>
                                <div style="font-size:1.15rem;font-weight:800;font-family:monospace;letter-spacing:1px;color:white;">
                                    ${_currentEndereco}
                                </div>
                                <div style="font-size:.7rem;color:var(--text-secondary);">
                                    Setor / Nível: <strong style="color:${_tipoEndereco==='PICKING'?'#38bdf8':'#f59e0b'};">${_tipoEndereco}</strong>
                                </div>
                            </div>
                        </div>
                        <button onclick="window.ColetorInventario.trocarEndereco()" 
                            style="background:rgba(255,255,255,.1);color:white;border:none;padding:.35rem .65rem;border-radius:6px;font-size:.72rem;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:.25rem;">
                            <span class="material-icons-round" style="font-size:.85rem;">swap_horiz</span> Trocar Vão
                        </button>
                    </div>
                `}
            </div>

            <!-- Card 2: Bipagem de Peças (habilitado após ter endereço) -->
            ${_currentEndereco ? `
                <div class="m-card" style="margin-bottom:.75rem;border-left:3px solid #38bdf8;">
                    <label class="m-label" style="display:flex;justify-content:space-between;">
                        <span>2. Bipar Produto / Peça</span>
                        <span style="font-size:.68rem;color:var(--text-secondary);">EAN, Ref ou Cód. Fábrica</span>
                    </label>
                    <div style="display:flex;gap:.5rem;">
                        <input id="inv-produto-inp" type="text" class="m-input" 
                            placeholder="Aponte o leitor ou digite o código..." 
                            style="font-size:.85rem;"
                            onkeydown="if(event.key==='Enter') window.ColetorInventario.processarProdutoBipado(this.value)">
                        <button class="m-btn m-btn-primary" onclick="window.ColetorInventario.processarProdutoBipado(document.getElementById('inv-produto-inp').value)"
                            style="padding:0 .85rem;white-space:nowrap;font-size:.8rem;font-weight:700;">
                            Bipar
                        </button>
                        <button onclick="startCameraScanner('inv-produto-inp')" 
                            style="background:#38bdf8;color:white;border:none;padding:0 .75rem;border-radius:6px;cursor:pointer;display:flex;align-items:center;"
                            title="Bipar código de barras com a Câmera">
                            <span class="material-icons-round" style="font-size:1.1rem;">photo_camera</span>
                        </button>
                    </div>

                    <!-- Painel de Feedback da Última Peça -->
                    <div id="inv-produto-feedback" style="margin-top:.75rem;display:none;"></div>
                </div>

                <!-- Card 3: Lista de Peças no Vão Atual -->
                <div class="m-card" style="margin-bottom:1rem;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem;">
                        <span style="font-weight:700;font-size:.82rem;color:var(--text-secondary);">
                            Peças neste Vão (${_itensNoVao.length})
                        </span>
                        <span style="font-size:.78rem;font-weight:700;color:#10b981;">
                            Total: ${_itensNoVao.reduce((acc, i) => acc + (Number(i.quantidade)||0), 0)} un
                        </span>
                    </div>

                    <div id="inv-itens-list">
                        ${_itensNoVao.length === 0 ? `
                            <div style="text-align:center;padding:1.2rem;color:var(--text-secondary);font-size:.78rem;">
                                Nenhuma peça adicionada neste vão ainda.<br>
                                Aponte o leitor para a primeira peça.
                            </div>
                        ` : `
                            <div style="display:flex;flex-direction:column;gap:.45rem;">
                                ${_itensNoVao.map((it, idx) => `
                                    <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,.04);padding:.55rem .7rem;border-radius:6px;border:1px solid rgba(255,255,255,.06);">
                                        <div style="flex:1;overflow:hidden;padding-right:.5rem;">
                                            <div style="font-weight:700;font-size:.83rem;color:white;text-overflow:ellipsis;white-space:nowrap;overflow:hidden;">
                                                ${it.sku}
                                            </div>
                                            <div style="font-size:.72rem;color:var(--text-secondary);text-overflow:ellipsis;white-space:nowrap;overflow:hidden;">
                                                ${it.descricao || ''} ${it.fabricante ? '• ' + it.fabricante : ''}
                                            </div>
                                        </div>
                                        <div style="display:flex;align-items:center;gap:.6rem;">
                                            <div style="text-align:right;">
                                                <span style="font-size:.95rem;font-weight:800;color:#10b981;">${it.quantidade}</span>
                                                <span style="font-size:.68rem;color:var(--text-secondary);">un</span>
                                            </div>
                                            <button onclick="window.ColetorInventario.removerItem(${idx})" 
                                                style="background:none;border:none;color:#ef4444;cursor:pointer;padding:.2rem;display:flex;align-items:center;">
                                                <span class="material-icons-round" style="font-size:1.1rem;">delete</span>
                                            </button>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        `}
                    </div>

                    ${_itensNoVao.length > 0 ? `
                        <div style="margin-top:1rem;display:flex;gap:.5rem;">
                            <button class="m-btn m-btn-success" onclick="window.ColetorInventario.concluirVao()"
                                style="flex:1;font-weight:800;font-size:.85rem;padding:.75rem;">
                                <span class="material-icons-round">check_circle</span> Concluir Vão e Próximo
                            </button>
                        </div>
                    ` : ''}
                </div>
            ` : ''}
        `;

        // Foco automático inteligente
        setTimeout(() => {
            if (!_currentEndereco) {
                const inp = document.getElementById('inv-endereco-inp');
                if (inp) inp.focus();
            } else {
                const inp = document.getElementById('inv-produto-inp');
                if (inp) inp.focus();
            }
        }, 150);
    }

    function selecionarEnderecoManual() {
        const inp = document.getElementById('inv-endereco-inp');
        const end = (inp?.value || '').trim().toUpperCase();
        if (!end) {
            showToast('Informe o endereço do vão', 'warning');
            return;
        }
        _currentEndereco = end;
        _tipoEndereco = _detectarTipoEndereco(end);
        _itensNoVao = [];
        if (window.Feedback) window.Feedback.beep('success');
        showToast(`Endereço ${end} selecionado (${_tipoEndereco})`, 'success');
        render();
    }

    function trocarEndereco() {
        if (_itensNoVao.length > 0) {
            if (!confirm(`Existem ${_itensNoVao.length} itens registrados neste vão. Deseja salvar antes de trocar?`)) {
                _currentEndereco = null;
                _itensNoVao = [];
                render();
                return;
            }
            concluirVao();
            return;
        }
        _currentEndereco = null;
        render();
    }

    /** Localiza dados do produto no cadastro ou cache */
    function _localizarProduto(codigo) {
        const c = (codigo || '').trim().toUpperCase();
        if (!c) return null;

        // 1. Procurar em produtos de cadastros.js (se disponivel)
        try {
            const cadData = JSON.parse(localStorage.getItem('wms_mock_cadastros') || '{}');
            const prods = cadData['produtos'] || [];
            const p = prods.find(x => 
                (x.codigo || '').toUpperCase() === c || 
                (x.codigoFab || '').toUpperCase() === c || 
                (x.barcode || '').toUpperCase() === c ||
                (x.descricao || '').toUpperCase() === c
            );
            if (p) return { sku: p.codigo || p.codigoFab || c, descricao: p.descricao, fabricante: p.fabricante, barcode: p.barcode };
        } catch(_) {}

        // 2. Procurar em wms_produtos
        try {
            const wmsProds = JSON.parse(localStorage.getItem('wms_produtos') || '[]');
            const p = wmsProds.find(x => 
                (x.sku || '').toUpperCase() === c || 
                (x.codigoFab || '').toUpperCase() === c || 
                (x.barcode || '').toUpperCase() === c
            );
            if (p) return { sku: p.sku || c, descricao: p.descricao, fabricante: p.fabricante, barcode: p.barcode };
        } catch(_) {}

        // Fallback: assume o código bipado como o próprio SKU/Referência
        return { sku: c, descricao: 'Produto ' + c, fabricante: 'N/I', barcode: c };
    }

    function processarProdutoBipado(codigo) {
        const rawCode = (codigo || '').trim();
        if (!rawCode) return;

        const inp = document.getElementById('inv-produto-inp');
        if (inp) inp.value = '';

        const produto = _localizarProduto(rawCode);
        if (!produto) {
            showToast('Produto não identificado', 'error');
            return;
        }

        // 1. Validar Regras de Armazenagem
        let validacao = { valido: true, status: 'OK', mensagem: '' };
        if (window.WmsStore && window.WmsStore.validarAlocacaoArmazenagem) {
            validacao = window.WmsStore.validarAlocacaoArmazenagem(produto.sku, _currentEndereco, _tipoEndereco);
        }

        const fbDiv = document.getElementById('inv-produto-feedback');
        if (!validacao.valido) {
            // BLOQUEADO PELA REGRA
            if (window.Feedback) {
                window.Feedback.beep('error');
                window.Feedback.flash('error');
            }
            if (fbDiv) {
                fbDiv.style.display = 'block';
                fbDiv.innerHTML = `
                    <div style="background:rgba(239,68,68,.15);border:1px solid #ef4444;border-radius:8px;padding:.75rem;color:#fca5a5;font-size:.8rem;">
                        <div style="font-weight:700;display:flex;align-items:center;gap:.3rem;color:#ef4444;margin-bottom:.25rem;">
                            <span class="material-icons-round">block</span> BLOQUEADO POR REGRA
                        </div>
                        ${validacao.mensagem}
                    </div>
                `;
            }
            return;
        }

        // Se houver alerta de divergência ou picking duplicado
        let alertaHtml = '';
        if (validacao.status === 'AVISO_FIXO_DIVERGENTE') {
            alertaHtml = `
                <div style="background:rgba(245,158,11,.15);border:1px solid #f59e0b;border-radius:6px;padding:.5rem .7rem;color:#fde68a;font-size:.75rem;margin-bottom:.5rem;">
                    <strong>Aviso Fixo:</strong> ${validacao.mensagem}
                </div>
            `;
        } else if (validacao.status === 'AVISO_PICKING_DUPLICADO') {
            alertaHtml = `
                <div style="background:rgba(168,85,247,.15);border:1px solid #a855f7;border-radius:6px;padding:.5rem .7rem;color:#e9d5ff;font-size:.75rem;margin-bottom:.5rem;">
                    <strong>Picking Único:</strong> ${validacao.mensagem}
                </div>
            `;
        }

        _ultimoProdutoIdentificado = produto;

        if (fbDiv) {
            fbDiv.style.display = 'block';
            fbDiv.innerHTML = `
                <div style="background:rgba(15,23,42,.8);border:1px solid rgba(56,189,248,.3);border-radius:8px;padding:.75rem;">
                    ${alertaHtml}
                    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:.5rem;">
                        <div>
                            <div style="font-weight:800;font-size:.92rem;color:#38bdf8;">${produto.sku}</div>
                            <div style="font-size:.75rem;color:var(--text-secondary);">${produto.descricao}</div>
                            ${produto.fabricante ? `<div style="font-size:.7rem;color:#94a3b8;">Fab: <strong>${produto.fabricante}</strong></div>` : ''}
                        </div>
                        <span class="m-badge m-badge-green">Identificado</span>
                    </div>

                    <div style="display:flex;align-items:center;gap:.5rem;margin-top:.6rem;">
                        <button onclick="window.ColetorInventario.ajustarQtdConfirm(-1)" style="width:34px;height:34px;border-radius:6px;background:rgba(255,255,255,.1);border:none;color:white;font-size:1.1rem;cursor:pointer;">-</button>
                        <input id="inv-qtd-confirm" type="number" value="1" min="1" 
                            style="flex:1;text-align:center;font-size:1.1rem;font-weight:700;padding:.4rem;border-radius:6px;background:#0f172a;color:white;border:1px solid #38bdf8;"
                            onkeydown="if(event.key==='Enter') window.ColetorInventario.confirmarInclusaoItem()">
                        <button onclick="window.ColetorInventario.ajustarQtdConfirm(1)" style="width:34px;height:34px;border-radius:6px;background:rgba(255,255,255,.1);border:none;color:white;font-size:1.1rem;cursor:pointer;">+</button>
                        <button class="m-btn m-btn-success" onclick="window.ColetorInventario.confirmarInclusaoItem()"
                            style="padding:0 1rem;height:34px;font-weight:700;font-size:.82rem;">
                            Confirmar
                        </button>
                    </div>

                    <div style="display:flex;gap:.3rem;margin-top:.5rem;justify-content:center;">
                        <button onclick="window.ColetorInventario.definirQtdConfirm(5)" style="background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);color:white;border-radius:4px;padding:2px 8px;font-size:.7rem;cursor:pointer;">+5</button>
                        <button onclick="window.ColetorInventario.definirQtdConfirm(10)" style="background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);color:white;border-radius:4px;padding:2px 8px;font-size:.7rem;cursor:pointer;">+10</button>
                        <button onclick="window.ColetorInventario.definirQtdConfirm(50)" style="background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);color:white;border-radius:4px;padding:2px 8px;font-size:.7rem;cursor:pointer;">+50</button>
                    </div>
                </div>
            `;
            const qtdInp = document.getElementById('inv-qtd-confirm');
            if (qtdInp) qtdInp.focus();
        }

        if (window.Feedback) window.Feedback.beep('success');
    }

    function ajustarQtdConfirm(delta) {
        const inp = document.getElementById('inv-qtd-confirm');
        if (!inp) return;
        let v = parseInt(inp.value, 10) || 1;
        v = Math.max(1, v + delta);
        inp.value = v;
    }

    function definirQtdConfirm(val) {
        const inp = document.getElementById('inv-qtd-confirm');
        if (!inp) return;
        let v = parseInt(inp.value, 10) || 0;
        inp.value = v + val;
    }

    function confirmarInclusaoItem() {
        if (!_ultimoProdutoIdentificado) return;
        const inp = document.getElementById('inv-qtd-confirm');
        const qtd = parseInt(inp?.value, 10) || 1;

        const existente = _itensNoVao.find(i => i.sku === _ultimoProdutoIdentificado.sku);
        if (existente) {
            existente.quantidade = (Number(existente.quantidade) || 0) + qtd;
        } else {
            _itensNoVao.push({
                sku: _ultimoProdutoIdentificado.sku,
                descricao: _ultimoProdutoIdentificado.descricao,
                fabricante: _ultimoProdutoIdentificado.fabricante,
                quantidade: qtd
            });
        }

        showToast(`${qtd}x ${_ultimoProdutoIdentificado.sku} adicionado ao vão`, 'success');
        if (window.Feedback) {
            window.Feedback.beep('success');
            window.Feedback.flash('success');
        }

        _ultimoProdutoIdentificado = null;
        render();
    }

    function removerItem(index) {
        if (index >= 0 && index < _itensNoVao.length) {
            const item = _itensNoVao[index];
            _itensNoVao.splice(index, 1);
            showToast(`${item.sku} removido`, 'info');
            render();
        }
    }

    /** Salva o estoque do endereço no WMS e Firestore */
    function concluirVao() {
        if (!_currentEndereco || _itensNoVao.length === 0) {
            showToast('Nenhum item registrado para salvar', 'warning');
            return;
        }

        const user = JSON.parse(localStorage.getItem('logged_user') || '{"nome":"Operador Coletor"}');
        const opNome = user.nome || user.login || 'Operador';

        _itensNoVao.forEach(it => {
            if (window.WmsStore && window.WmsStore.salvarItemInventariado) {
                window.WmsStore.salvarItemInventariado(_currentEndereco, it, it.quantidade, opNome);
            } else if (window.StockManager) {
                window.StockManager.add(it.sku, it.quantidade, _currentEndereco, it.descricao, 'UN', 'INVENTARIO-WMS');
            }
        });

        const qtdTotal = _itensNoVao.reduce((acc, i) => acc + (Number(i.quantidade)||0), 0);
        showToast(`✔ Vão ${_currentEndereco} concluído com sucesso! (${qtdTotal} un)`, 'success');
        if (window.Feedback) window.Feedback.beep('success');

        _currentEndereco = null;
        _itensNoVao = [];
        _ultimoProdutoIdentificado = null;
        render();
    }

    /** Intercepta bipagens globais quando na tela de inventário */
    function handleScan(code) {
        if (!_currentEndereco) {
            const inp = document.getElementById('inv-endereco-inp');
            if (inp) {
                inp.value = code.trim().toUpperCase();
                selecionarEnderecoManual();
            }
        } else {
            processarProdutoBipado(code);
        }
    }

    return {
        render,
        selecionarEnderecoManual,
        trocarEndereco,
        processarProdutoBipado,
        ajustarQtdConfirm,
        definirQtdConfirm,
        confirmarInclusaoItem,
        removerItem,
        concluirVao,
        handleScan
    };

})();
