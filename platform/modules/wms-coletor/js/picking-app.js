// =============================================================================
// WMS COLETOR - MÓDULO DE SEPARAÇÃO (PICKING)
// Sincronizado via Firestore (WmsStore) + Fila Offline (WmsOfflineQueue)
// Rota Otimizada de Separação por Endereçamento Físico
// =============================================================================

window.PickingApp = {
    currentWave: null,
    waveItems: [],
    currentItemIndex: 0,

    init: function () {
        console.log('📦 [PickingApp] Inicializado');
        this.renderWaveList();
    },

    _getTenantSuffix: function () {
        return window.getTenantSuffix ? window.getTenantSuffix() : '';
    },

    /**
     * Ordena itens pela rota ótima no armazém (Rua -> Prédio -> Nível -> Posição)
     */
    _sortItemsByRoute: function (items) {
        return items.slice().sort((a, b) => {
            const endA = String(a.endereco || a.locais?.[0] || '').trim();
            const endB = String(b.endereco || b.locais?.[0] || '').trim();
            return endA.localeCompare(endB, undefined, { numeric: true, sensitivity: 'base' });
        });
    },

    /**
     * Lista de Ondas Disponíveis
     */
    renderWaveList: async function () {
        const container = document.getElementById('screen-separar');
        if (!container) return;

        container.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;height:200px;gap:.75rem;color:var(--text-secondary);">
                <span class="material-icons-round" style="animation:spin 1s linear infinite; font-size:1.6rem;">refresh</span>
                Carregando ondas de separação...
            </div>
        `;

        const suf = this._getTenantSuffix();
        let ondas = [];
        let pickingTasks = [];

        // 1. Tenta carregar do Firestore
        try {
            if (window.WmsStore && window.WmsStore.listarOndas) {
                ondas = await window.WmsStore.listarOndas();
                pickingTasks = await window.WmsStore.listarPickingTasks();
            }
        } catch (e) {
            console.warn('[PickingApp] Falha ao carregar do Firestore, usando cache local:', e.message);
        }

        // 2. Fallback / Merge com localStorage
        const localOndas = JSON.parse(localStorage.getItem('wms_ondas' + suf) || '[]');
        const localPicking = JSON.parse(localStorage.getItem('wms_picking' + suf) || '[]');

        if (ondas.length === 0) ondas = localOndas;
        if (pickingTasks.length === 0) pickingTasks = localPicking;

        // Filtra ondas disponíveis (SEPARANDO ou FORMADA ou Pendente)
        const available = ondas.filter(w => {
            const st = (w.status || '').toUpperCase();
            return st === 'SEPARANDO' || st === 'FORMADA' || st === 'PENDENTE' || st === 'EM SEPARAÇÃO';
        });

        if (available.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding:3rem 1.5rem; text-align:center;">
                    <span class="material-icons-round" style="font-size:3rem; color:var(--text-secondary); opacity:0.5;">assignment_turned_in</span>
                    <h3 style="margin-top:1rem; color:var(--text-primary);">Nenhuma onda disponível</h3>
                    <p style="font-size:.85rem; color:var(--text-secondary); margin-bottom:1.5rem;">Libere ondas no WMS desktop para iniciar a separação.</p>
                    <button class="m-btn m-btn-primary" onclick="PickingApp.renderWaveList()" style="width:100%; max-width:240px; margin:0 auto;">
                        <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">refresh</span> Atualizar
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="list-container" style="padding:1rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                    <h3 style="font-size:1.05rem; font-weight:700; color:var(--text-primary); margin:0;">Ondas de Separação</h3>
                    <button class="m-btn m-btn-secondary" onclick="PickingApp.renderWaveList()" style="padding:4px 10px; font-size:.8rem;">
                        <span class="material-icons-round" style="font-size:.9rem;">refresh</span>
                    </button>
                </div>

                <div style="display:flex; flex-direction:column; gap:.75rem;">
                    ${available.map(w => {
                        const tasks = pickingTasks.filter(t => t.onda === w.id);
                        const totalItens = tasks.length > 0 ? tasks.length : (w.totalItens || w.items?.length || 0);
                        const concluidos = tasks.filter(t => t.status === 'COLETADO').length;
                        const pct = totalItens > 0 ? Math.round((concluidos / totalItens) * 100) : 0;

                        return `
                            <div class="card-item" onclick="PickingApp.startWave('${w.id}')" style="background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:1rem; cursor:pointer; transition:transform 0.15s, border-color 0.15s;">
                                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:.5rem;">
                                    <div>
                                        <div style="font-weight:700; font-size:.95rem; color:var(--text-primary);">${w.id}</div>
                                        <div style="font-size:.78rem; color:var(--text-secondary);">${(w.pedidos || []).length} pedido(s) vinculados</div>
                                    </div>
                                    <span style="font-size:.7rem; font-weight:700; padding:3px 8px; border-radius:10px; background:rgba(245,158,11,0.15); color:#f59e0b;">
                                        ${w.status}
                                    </span>
                                </div>

                                <div style="display:flex; justify-content:space-between; font-size:.8rem; color:var(--text-secondary); margin-bottom:.5rem;">
                                    <span>Progresso:</span>
                                    <span style="font-weight:700; color:var(--text-primary);">${concluidos} / ${totalItens} itens (${pct}%)</span>
                                </div>

                                <div style="width:100%; height:6px; background:rgba(255,255,255,0.08); border-radius:3px; overflow:hidden;">
                                    <div style="width:${pct}%; height:100%; background:linear-gradient(90deg, #f59e0b, #10b981); transition:width 0.3s;"></div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    },

    /**
     * Iniciar Separação da Onda
     */
    startWave: async function (waveId) {
        const suf = this._getTenantSuffix();
        let ondas = [];
        let pickingTasks = [];

        try {
            if (window.WmsStore && window.WmsStore.listarOndas) {
                ondas = await window.WmsStore.listarOndas();
                pickingTasks = await window.WmsStore.listarPickingTasks({ onda: waveId });
            }
        } catch (_) {}

        if (ondas.length === 0) ondas = JSON.parse(localStorage.getItem('wms_ondas' + suf) || '[]');
        if (pickingTasks.length === 0) {
            const allLocal = JSON.parse(localStorage.getItem('wms_picking' + suf) || '[]');
            pickingTasks = allLocal.filter(t => t.onda === waveId);
        }

        this.currentWave = ondas.find(w => w.id === waveId);
        if (!this.currentWave) return alert('Onda não encontrada!');

        // Ordena itens pela rota ótima
        this.waveItems = this._sortItemsByRoute(pickingTasks);

        // Se todos já estão coletados
        const pendenteIdx = this.waveItems.findIndex(i => i.status !== 'COLETADO');
        if (pendenteIdx === -1 && this.waveItems.length > 0) {
            this.finishWaveScreen();
            return;
        }

        this.currentItemIndex = pendenteIdx > -1 ? pendenteIdx : 0;
        this.renderPickScreen();
    },

    /**
     * Tela de Separação (Passo a Passo com Rota Guiada)
     */
    renderPickScreen: function () {
        const container = document.getElementById('screen-separar');
        const item = this.waveItems[this.currentItemIndex];

        if (!item) {
            this.finishWaveScreen();
            return;
        }

        const endereco = item.endereco || item.locais?.[0] || 'DOCA / INDEFINIDO';
        const sku = item.sku || '';
        const desc = item.desc || item.descricao || item.nome || 'Produto sem descrição';
        const qtd = item.qtd || item.qtdTotal || 1;

        // Callback do leitor global (Zebra laser ou digitação)
        window.currentScanCallback = (code, parsed) => this.checkScan(code, item, parsed);

        container.innerHTML = `
            <div class="pick-screen" style="padding:1rem; display:flex; flex-direction:column; gap:1rem;">
                
                <!-- Header com Voltar e Onda -->
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <button class="m-btn m-btn-secondary" onclick="PickingApp.renderWaveList()" style="padding:6px 12px; font-size:.8rem;">
                        <span class="material-icons-round" style="font-size:1rem;">arrow_back</span> Sair
                    </button>
                    <span style="font-weight:700; font-size:.9rem; color:var(--text-secondary);">${this.currentWave.id}</span>
                </div>

                <!-- Banner de Rota e Endereço -->
                <div style="background:linear-gradient(135deg, rgba(59,130,246,0.18), rgba(37,99,235,0.08)); border:1.5px solid #3b82f6; border-radius:14px; padding:1rem; text-align:center;">
                    <div style="font-size:.75rem; font-weight:700; color:#3b82f6; letter-spacing:1px; text-transform:uppercase;">
                        📍 IR PARA O ENDEREÇO
                    </div>
                    <div style="font-size:1.8rem; font-weight:900; color:#ffffff; font-family:monospace; margin:.3rem 0;">
                        ${endereco}
                    </div>
                    <div style="font-size:.78rem; color:var(--text-secondary);">
                        Corredor otimizado na sequência de picking
                    </div>
                </div>

                <!-- Card do Produto -->
                <div style="background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:1.25rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:.5rem;">
                        <span style="font-family:monospace; font-weight:800; font-size:1rem; color:#f59e0b; background:rgba(245,158,11,0.12); padding:3px 8px; border-radius:6px;">
                            ${sku}
                        </span>
                        <span style="font-size:.75rem; color:var(--text-secondary);">${item.pedido || ''}</span>
                    </div>

                    <div style="font-size:1.05rem; font-weight:700; color:var(--text-primary); line-height:1.3; margin-bottom:1rem;">
                        ${desc}
                    </div>

                    <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(0,0,0,0.25); border-radius:10px; padding:.75rem 1rem; margin-bottom:1.25rem;">
                        <span style="font-size:.85rem; font-weight:600; color:var(--text-secondary);">QUANTIDADE:</span>
                        <span style="font-size:1.8rem; font-weight:900; color:#10b981;">${qtd} <span style="font-size:.9rem; font-weight:600; color:var(--text-secondary);">UN</span></span>
                    </div>

                    <!-- Área de Bipagem -->
                    <div style="position:relative; margin-bottom:1rem;">
                        <input type="text" id="inputScanPicking" placeholder="Bipe o código de barras ou SKU..."
                            style="width:100%; padding:12px 45px 12px 14px; font-size:.95rem; border-radius:10px; border:1.5px solid var(--border); background:var(--background); color:var(--text-primary); font-family:monospace;"
                            onchange="if(this.value) window.currentScanCallback(this.value)">
                        <button type="button" onclick="document.getElementById('inputScanPicking').focus()"
                            style="position:absolute; right:8px; top:50%; transform:translateY(-50%); background:transparent; border:none; color:var(--text-secondary); cursor:pointer;">
                            <span class="material-icons-round" style="font-size:1.3rem;">qr_code_scanner</span>
                        </button>
                    </div>

                    <!-- Botões de Ação -->
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:.75rem;">
                        <button class="m-btn m-btn-secondary" onclick="PickingApp.skipItem()" style="padding:10px; font-size:.85rem;">
                            <span class="material-icons-round" style="font-size:1rem; vertical-align:middle;">skip_next</span> Pular
                        </button>
                        <button class="m-btn m-btn-primary" onclick="PickingApp.confirmItemManual()" style="padding:10px; font-size:.85rem;">
                            <span class="material-icons-round" style="font-size:1rem; vertical-align:middle;">check</span> Confirmar
                        </button>
                    </div>
                </div>

                <!-- Barra de Progresso -->
                <div style="background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:.75rem 1rem;">
                    <div style="display:flex; justify-content:space-between; font-size:.8rem; color:var(--text-secondary); margin-bottom:.4rem;">
                        <span>Progresso da Onda:</span>
                        <span style="font-weight:700; color:var(--text-primary);">${this.currentItemIndex + 1} de ${this.waveItems.length}</span>
                    </div>
                    <div style="width:100%; height:6px; background:rgba(255,255,255,0.08); border-radius:3px; overflow:hidden;">
                        <div style="width:${((this.currentItemIndex + 1) / this.waveItems.length) * 100}%; height:100%; background:#10b981;"></div>
                    </div>
                </div>

            </div>
        `;

        requestAnimationFrame(() => {
            const input = document.getElementById('inputScanPicking');
            if (input) input.focus();
        });
    },

    checkScan: function (code, item, parsed) {
        const raw = String(code || '').trim().toUpperCase();
        const skuNorm = String(item.sku || '').trim().toUpperCase();

        let match = (raw === skuNorm);

        // Se passou pelo parser GS1
        if (!match && parsed) {
            if (parsed.sku && String(parsed.sku).toUpperCase() === skuNorm) match = true;
            if (parsed.gtin && String(parsed.gtin).toUpperCase() === skuNorm) match = true;
        }

        // Suporte a EAN ou código de barras cadastrado
        if (!match && item.ean && String(item.ean).toUpperCase() === raw) {
            match = true;
        }

        if (match) {
            if (window.Feedback) {
                window.Feedback.vibrateSuccess();
                window.Feedback.beep('success');
                window.Feedback.flash('success');
            }
            this.confirmPickSuccess(item);
        } else {
            if (window.Feedback) {
                window.Feedback.vibrateError();
                window.Feedback.beep('error');
                window.Feedback.flash('error');
            }
            alert(`⚠️ Código incompatível!\nEsperado: ${item.sku}\nLido: ${code}`);
            const input = document.getElementById('inputScanPicking');
            if (input) {
                input.value = '';
                input.focus();
            }
        }
    },

    confirmItemManual: function () {
        const item = this.waveItems[this.currentItemIndex];
        if (!item) return;

        if (confirm(`Confirmar separação manual de ${item.qtd}x [${item.sku}] no endereço ${item.endereco || ''}?`)) {
            if (window.Feedback) {
                window.Feedback.vibrateSuccess();
                window.Feedback.beep('success');
            }
            this.confirmPickSuccess(item);
        }
    },

    confirmPickSuccess: function (item) {
        item.status = 'COLETADO';
        item.coletadoEm = new Date().toISOString();

        // 1. Atualiza StockManager (Local)
        if (window.StockManager) {
            window.StockManager.commit(item.sku, item.qtd);
        }

        // 2. Fila Offline / Firestore
        if (window.WmsOfflineQueue) {
            window.WmsOfflineQueue.enqueue('PICKING_TASK', {
                id: item.id,
                dados: {
                    status: 'COLETADO',
                    coletadoEm: item.coletadoEm
                }
            });
        } else if (window.WmsStore && window.WmsStore.atualizarPickingTask) {
            window.WmsStore.atualizarPickingTask(item.id, { status: 'COLETADO' }).catch(() => {});
        }

        // 3. Atualiza cache local
        const suf = this._getTenantSuffix();
        try {
            const allLocal = JSON.parse(localStorage.getItem('wms_picking' + suf) || '[]');
            const idx = allLocal.findIndex(t => t.id === item.id);
            if (idx > -1) {
                allLocal[idx].status = 'COLETADO';
                localStorage.setItem('wms_picking' + suf, JSON.stringify(allLocal));
            }
        } catch (_) {}

        this.nextItem();
    },

    skipItem: function () {
        // Move o item atual para o final da rota
        const item = this.waveItems.splice(this.currentItemIndex, 1)[0];
        this.waveItems.push(item);
        this.renderPickScreen();
    },

    nextItem: function () {
        this.currentItemIndex++;
        if (this.currentItemIndex >= this.waveItems.length) {
            this.finishWaveScreen();
        } else {
            this.renderPickScreen();
        }
    },

    finishWaveScreen: function () {
        const container = document.getElementById('screen-separar');
        window.currentScanCallback = null;

        container.innerHTML = `
            <div class="success-screen" style="padding:3rem 1.5rem; text-align:center;">
                <span class="material-icons-round" style="font-size:3.5rem; color:#10b981; animation:bounce 0.6s ease;">check_circle</span>
                <h2 style="margin:1rem 0 .5rem; color:var(--text-primary);">Onda Concluída!</h2>
                <p style="font-size:.9rem; color:var(--text-secondary); margin-bottom:2rem;">
                    Todos os itens da onda foram separados e encaminhados para a bancada de conferência de expedição.
                </p>
                <button class="m-btn m-btn-primary" onclick="PickingApp.completeWave()" style="width:100%; max-width:280px; margin:0 auto; padding:12px;">
                    <span class="material-icons-round" style="font-size:1.1rem; vertical-align:middle;">done_all</span> Finalizar Separação
                </button>
            </div>
        `;
    },

    completeWave: function () {
        const suf = this._getTenantSuffix();

        if (this.currentWave) {
            this.currentWave.status = 'CONFERÊNCIA';

            // Fila Offline / Firestore
            if (window.WmsOfflineQueue) {
                window.WmsOfflineQueue.enqueue('ONDA_STATUS', {
                    id: this.currentWave.id,
                    dados: { status: 'CONFERÊNCIA', concluidaEm: new Date().toISOString() }
                });
            } else if (window.WmsStore && window.WmsStore.atualizarOnda) {
                window.WmsStore.atualizarOnda(this.currentWave.id, { status: 'CONFERÊNCIA' }).catch(() => {});
            }

            try {
                const ondas = JSON.parse(localStorage.getItem('wms_ondas' + suf) || '[]');
                const idx = ondas.findIndex(w => w.id === this.currentWave.id);
                if (idx > -1) {
                    ondas[idx].status = 'CONFERÊNCIA';
                    localStorage.setItem('wms_ondas' + suf, JSON.stringify(ondas));
                }
            } catch (_) {}
        }

        if (window.Feedback) window.Feedback.vibrateSuccess();
        alert('Separação concluída com sucesso!');
        this.renderWaveList();
    }
};

// Integração com o roteador de navegação do Coletor
document.addEventListener('navigateTo', function (e) {
    if (e.detail && e.detail.screen === 'separar') {
        PickingApp.init();
    }
});
