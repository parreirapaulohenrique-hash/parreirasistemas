/**
 * dispatch-dashboard.js
 * Módulo Dashboard do Sistema de Despacho — ParreiraLog
 *
 * Extraído de app.js na Etapa 4 da Refatoração (v3.12.5)
 * Dependências: utils.js (Utils), dispatch-state.js (AppState)
 *
 * Funções expostas:
 *   window.renderDashboard()
 *   window.openShipmentModal(carrier)
 *   window.toggleNFSelection(id)
 *   window.undoDispatch(id)
 *   window.generateRomaneioAction()
 */

(function () {
    'use strict';

    // ── Estado local do Dashboard/Modal ──────────────────────────────────────
    // Movido de app.js (era let dentro do DOMContentLoaded)
    let currentModalCarrier = '';
    let selectedNFIds = [];

    // ── Helpers internos ──────────────────────────────────────────────────────

    function renderModalItems(items) {
        const body = document.getElementById('shipmentModalBody');
        if (!body) return;

        const rules = Utils.getStorage('freight_tables') || [];

        const isLate = (carrier, city) => {
            const rulesFound = rules.filter(r =>
                String(r.transportadora || '').trim().toUpperCase() === String(carrier || '').trim().toUpperCase() &&
                String(r.cidade || '').trim().toUpperCase() === String(city || '').trim().toUpperCase()
            );
            if (rulesFound.length === 0) return false;

            const rule = rulesFound[0];
            if (!rule.horarios) return false;

            const times = rule.horarios.match(/(\d{1,2}:\d{2})/g);
            if (!times || times.length === 0) return false;

            const now = new Date();
            const currentMins = now.getHours() * 60 + now.getMinutes();

            let maxMins = -1;
            times.forEach(t => {
                const [h, m] = t.split(':').map(Number);
                const mins = h * 60 + m;
                if (mins > maxMins) maxMins = mins;
            });

            return currentMins > maxMins;
        };

        body.innerHTML = items.map(item => {
            const delayed = isLate(item.carrier, item.city);
            const iconHtml = delayed
                ? `<span class="material-icons-round" style="color: var(--accent-danger); font-size: 1.1rem; vertical-align: middle; margin-left: 4px;" title="⚠️ Horário limite de despacho excedido!">alarm_off</span>`
                : '';

            return `
        <tr id="nf-modal-row-${item.id}" data-invoice="${String(item.invoice || '').trim()}">
            <td><input type="checkbox" id="check-nf-${item.id}" ${selectedNFIds.includes(item.id) ? 'checked' : ''} onchange="window.toggleNFSelection(${item.id})"></td>
            <td style="font-weight: 600; display: flex; align-items: center;">
                ${item.invoice}
                ${iconHtml}
            </td>
            <td>${item.client}</td>
            <td><span style="font-size: 0.8rem; color: var(--text-secondary);">${item.city}</span></td>
            <td>${item.weight} kg</td>
            <td style="font-weight: 600; color: var(--accent-success);">${Utils.formatCurrency(item.total)}</td>
            <td style="text-align: right;">
                <button onclick="window.undoDispatch(${item.id})" class="btn btn-secondary" style="padding: 0.3rem; min-width: auto; background: rgba(255,0,0,0.05); color: var(--accent-danger); border: none;" title="Estornar/Remover da Fila">
                    <span class="material-icons-round" style="font-size: 1.1rem;">undo</span>
                </button>
            </td>
        </tr>
    `}).join('');

        updateModalTotals(items);
    }

    function updateModalTotals(allPending) {
        const selectedItems = allPending.filter(i => selectedNFIds.includes(i.id));
        const total = selectedItems.reduce((acc, curr) => acc + (parseFloat(curr.total) || 0), 0);

        const countEl = document.getElementById('modalSelectedCount');
        const totalEl = document.getElementById('modalSelectedTotal');

        if (countEl) countEl.innerText = selectedItems.length;
        if (totalEl) totalEl.innerText = Utils.formatCurrency(total);
    }

    // ── Bipagem Óptica de NF (v3.21.0 - Fase 2) ──────────────────────────────
    window.triggerScanNF = (customVal = null) => {
        const input = document.getElementById('scanNFInput');
        const feedback = document.getElementById('scanFeedback');
        const raw = (customVal != null ? customVal : (input ? input.value : '')).trim();
        if (!raw) return;

        // Normalização de NF:
        // 1) Chave DANFE de 44 dígitos: número da NF está entre posições 25 e 34
        // 2) Número comum digitado ou com zeros/prefixos
        let targetNF = '';
        const digitsOnly = raw.replace(/\D/g, '');
        if (digitsOnly.length === 44) {
            targetNF = parseInt(digitsOnly.substring(25, 34), 10).toString();
        } else {
            targetNF = digitsOnly.replace(/^0+/, '');
        }

        if (!targetNF) {
            if (feedback) {
                feedback.style.display = 'inline-block';
                feedback.style.background = 'rgba(239, 68, 68, 0.15)';
                feedback.style.color = '#ef4444';
                feedback.innerText = 'Código inválido';
            }
            if (Utils.playBeep) Utils.playBeep('error');
            return;
        }

        const history = Utils.getStorage('dispatches');
        const items = (Array.isArray(history) ? history : []).filter(d => {
            const dCarrier = String(d.carrier || '').trim().toUpperCase();
            const isSameCarrier = dCarrier === currentModalCarrier || dCarrier === 'FOB - ' + currentModalCarrier;
            return isSameCarrier && d.status === 'Pendente Despacho';
        });

        // Localiza a NF na transportadora atual
        const matchItem = items.find(it => {
            const itNF = String(it.invoice || '').replace(/\D/g, '').replace(/^0+/, '');
            return itNF === targetNF;
        });

        if (!matchItem) {
            if (feedback) {
                feedback.style.display = 'inline-block';
                feedback.style.background = 'rgba(239, 68, 68, 0.15)';
                feedback.style.color = '#ef4444';
                feedback.innerText = `NF ${targetNF} não encontrada nesta carga`;
            }
            if (Utils.playBeep) Utils.playBeep('error');
            if (input) { input.value = ''; input.focus(); }
            return;
        }

        // Se já está selecionada:
        if (selectedNFIds.includes(matchItem.id)) {
            if (feedback) {
                feedback.style.display = 'inline-block';
                feedback.style.background = 'rgba(245, 158, 11, 0.15)';
                feedback.style.color = '#f59e0b';
                feedback.innerText = `NF ${matchItem.invoice} já está selecionada!`;
            }
            if (Utils.playBeep) Utils.playBeep('warn');
            const row = document.getElementById(`nf-modal-row-${matchItem.id}`);
            if (row) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                row.style.transition = 'all 0.3s';
                row.style.background = 'rgba(245, 158, 11, 0.2)';
                setTimeout(() => { row.style.background = ''; }, 1200);
            }
            if (input) { input.value = ''; input.focus(); }
            return;
        }

        // Seleciona a NF
        selectedNFIds.push(matchItem.id);
        const chk = document.getElementById(`check-nf-${matchItem.id}`);
        if (chk) chk.checked = true;

        updateModalTotals(items);

        if (feedback) {
            feedback.style.display = 'inline-block';
            feedback.style.background = 'rgba(16, 185, 129, 0.15)';
            feedback.style.color = '#10b981';
            feedback.innerText = `✅ NF ${matchItem.invoice} bipada com sucesso!`;
        }
        if (Utils.playBeep) Utils.playBeep('success');

        const row = document.getElementById(`nf-modal-row-${matchItem.id}`);
        if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.style.transition = 'all 0.3s';
            row.style.background = 'rgba(16, 185, 129, 0.25)';
            setTimeout(() => { row.style.background = ''; }, 1500);
        }

        if (input) { input.value = ''; input.focus(); }
    };

    // ── Funções Públicas (window.*) ───────────────────────────────────────────

    window.renderDashboard = () => {
        let history = Utils.getStorage('dispatches') || [];
        if ((!Array.isArray(history) || history.length === 0) && Utils._memStore && Array.isArray(Utils._memStore['dispatches'])) {
            history = Utils._memStore['dispatches'];
        }
        const pending = (Array.isArray(history) ? history : []).filter(d => d.status === 'Pendente Despacho');
        const grid = document.getElementById('carrierDashboardGrid');
        if (!grid) return;

        grid.innerHTML = '';

        // Update Totals
        const totalWeight = pending.reduce((acc, curr) => acc + (parseFloat(curr.weight) || 0), 0);
        const totalFreight = pending.reduce((acc, curr) => acc + (parseFloat(curr.total) || 0), 0);

        document.getElementById('dashTotalInvoices').innerText = pending.length;
        document.getElementById('dashTotalWeight').innerText = `${totalWeight.toFixed(2)} kg`;
        document.getElementById('dashTotalFreight').innerText = Utils.formatCurrency(totalFreight);

        // All registered carriers com fallback para memória
        let allCarriers = Utils.getStorage('carrier_list');
        if (!Array.isArray(allCarriers) || allCarriers.length === 0) {
            allCarriers = (Utils._memStore && Array.isArray(Utils._memStore['carrier_list'])) ? Utils._memStore['carrier_list'] : [];
        }
        allCarriers = [...allCarriers];

        // Group pending items by Carrier
        const pendingByCarrier = {};
        pending.forEach(p => {
            let carrierKey = String(p.carrier || '').trim().toUpperCase();

            // v3.8.2 - Agrupar itens FOB na transportadora principal para alimentar o card
            if (carrierKey.startsWith('FOB - ')) {
                carrierKey = carrierKey.replace('FOB - ', '').trim();
            }

            if (!pendingByCarrier[carrierKey]) pendingByCarrier[carrierKey] = [];
            pendingByCarrier[carrierKey].push(p);
        });

        // v3.22.1: Garante que transportadoras com cargas pendentes SEMPRE tenham card visível, mesmo se carrier_list ainda estiver carregando
        Object.keys(pendingByCarrier).forEach(cName => {
            if (cName && !allCarriers.some(c => String(c || '').trim().toUpperCase() === cName)) {
                allCarriers.push(cName);
            }
        });

        // NOVO: Ordenar transportadoras por quantidade de itens pendentes (v3.7.3)
        allCarriers.sort((a, b) => {
            const countA = (pendingByCarrier[String(a || '').trim().toUpperCase()] || []).length;
            const countB = (pendingByCarrier[String(b || '').trim().toUpperCase()] || []).length;
            if (countA !== countB) return countB - countA; // Quem tem carga sobe
            return String(a).localeCompare(String(b));     // Ordem alfabética para empate/vazios
        });

        // Show all carriers (fixed cards)
        allCarriers.forEach(carrier => {
            const cleanCarrier = String(carrier || '').trim().toUpperCase();
            const items = pendingByCarrier[cleanCarrier] || [];
            const weight = items.reduce((acc, curr) => acc + (parseFloat(curr.weight) || 0), 0);
            const total = items.reduce((acc, curr) => acc + (parseFloat(curr.total) || 0), 0);
            const hasItems = items.length > 0;

            const card = document.createElement('div');
            card.className = 'card';
            if (hasItems) {
                card.style.cursor = 'pointer';
                card.style.opacity = '1';
                card.onclick = (e) => {
                    try {
                        console.log('Clicou no card:', cleanCarrier);
                        window.openShipmentModal(cleanCarrier);
                    } catch (err) {
                        console.error('Erro ao abrir modal:', err);
                        alert('Erro ao abrir despacho: ' + err.message);
                    }
                };
            } else {
                card.style.cursor = 'default';
                card.style.opacity = '0.6';
            }

            // Retrieve Schedules for relevant cities
            let scheduleHtml = '';
            if (hasItems) {
                const pendingCities = [...new Set(items.map(i => i.city))];
                const rawRules = Utils.getStorage('freight_tables');
                const rules = Array.isArray(rawRules) ? rawRules : [];

                const schedules = [];
                pendingCities.forEach(city => {
                    const rule = rules.find(r =>
                        String(r.transportadora || '').trim().toUpperCase() === cleanCarrier &&
                        String(r.cidade || '').trim().toUpperCase() === String(city || '').trim().toUpperCase()
                    );
                    if (rule && rule.horarios && rule.horarios.trim()) {
                        const times = rule.horarios.replace(/\|/g, ',').replace(/\s+/g, ' ').trim();
                        if (times) schedules.push(`<div style="font-size: 0.75rem; margin-top: 2px;"><strong>${city}:</strong> <span style="color: var(--text-primary);">${times}</span></div>`);
                    }
                });

                if (schedules.length > 0) {
                    scheduleHtml = `
                        <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--border-color); color: var(--text-secondary);">
                            <div style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; margin-bottom: 2px;">⏰ Horários de Despacho</div>
                            ${schedules.join('')}
                        </div>
                    `;
                }
            }

            card.innerHTML = `
                    <div class="card-body" style="padding: 1.5rem;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <div style="font-weight: 700; font-size: 1.1rem; color: ${hasItems ? 'var(--text-primary)' : 'var(--text-secondary)'}; margin-bottom: 0.5rem;">${carrier}</div>
                                <div style="font-size: 0.85rem; color: var(--text-secondary); display: flex; gap: 1rem;">
                                    <span>📦 ${items.length} notas</span>
                                    <span>⚖️ ${weight.toFixed(2)} kg</span>
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 1.25rem; font-weight: 700; color: ${hasItems ? 'var(--accent-success)' : 'var(--border-color)'};">${Utils.formatCurrency(total)}</div>
                                <div style="font-size: 0.7rem; color: ${hasItems ? 'var(--primary-color)' : 'var(--text-secondary)'}; font-weight: 600; text-transform: uppercase; margin-top: 4px;">
                                    ${hasItems ? 'Abrir Carga' : 'Carga Vazia'}
                                </div>
                            </div>
                        </div>
                        ${scheduleHtml}
                    </div>
                    `;
            grid.appendChild(card);
        });

        // v3.22.1: Sincronização em segundo plano dos pendentes no Firestore (dispatches_db)
        // Garante que o painel mostre as cargas imediatamente mesmo em novos acessos ou abas
        if (window.db && Utils.Cloud && Utils.Cloud.hasTenant() && !window._dashSyncing) {
            window._dashSyncing = true;
            window.db.collection('tenants').doc(Utils.Cloud.tenantId).collection('dispatches_db')
                .where('status', '==', 'Pendente Despacho')
                .get()
                .then(snap => {
                    window._dashSyncing = false;
                    if (!snap || snap.empty) return;
                    let localList = Utils.getStorage('dispatches') || [];
                    if ((!Array.isArray(localList) || localList.length === 0) && Utils._memStore && Array.isArray(Utils._memStore['dispatches'])) {
                        localList = Utils._memStore['dispatches'];
                    }
                    let hasNew = false;
                    snap.forEach(docSnap => {
                        const dData = docSnap.data();
                        const idx = localList.findIndex(l => String(l.id || l.codigo) === String(dData.id || dData.codigo));
                        if (idx === -1) {
                            localList.push(dData);
                            hasNew = true;
                        } else if (localList[idx].status !== dData.status) {
                            localList[idx] = dData;
                            hasNew = true;
                        }
                    });
                    if (hasNew) {
                        Utils.setStorage('dispatches', localList);
                        window.renderDashboard();
                    }
                })
                .catch(err => {
                    window._dashSyncing = false;
                    console.warn('[Dashboard] Sync pendentes Firestore:', err);
                });
        }
    };

    window.openShipmentModal = (carrier) => {
        try {
            const cleanCarrier = String(carrier || '').trim().toUpperCase();
            console.log('openShipmentModal executando para:', cleanCarrier);
            currentModalCarrier = cleanCarrier;

            let history = Utils.getStorage('dispatches') || [];
            if ((!Array.isArray(history) || history.length === 0) && Utils._memStore && Array.isArray(Utils._memStore['dispatches'])) {
                history = Utils._memStore['dispatches'];
            }
            const items = (Array.isArray(history) ? history : []).filter(d => {
                const dCarrier = String(d.carrier || '').trim().toUpperCase();
                // v3.8.2 - Incluir itens FOB na listagem da transportadora no modal
                const isSameCarrier = dCarrier === cleanCarrier || dCarrier === 'FOB - ' + cleanCarrier;
                return isSameCarrier && d.status === 'Pendente Despacho';
            });

            if (items.length === 0) {
                console.warn('Nenhum item pendente (Pendente Despacho) para:', cleanCarrier);
            }

            selectedNFIds = [...new Set(items.map(i => i.id))]; // ✅ deduplicado por segurança

            const titleEl = document.getElementById('modalCarrierTitle');
            if (titleEl) titleEl.innerText = `Itens Pendentes: ${cleanCarrier}`;

            const modalEl = document.getElementById('shipmentModal');
            if (modalEl) {
                modalEl.style.display = 'flex';
                renderModalItems(items);

                // Auto-foco na barra de leitura óptica (v3.21.0 - Fase 2)
                setTimeout(() => {
                    const scanIn = document.getElementById('scanNFInput');
                    const scanFb = document.getElementById('scanFeedback');
                    if (scanFb) scanFb.style.display = 'none';
                    if (scanIn) {
                        scanIn.value = '';
                        scanIn.focus();
                        if (!scanIn._hasScanListener) {
                            scanIn._hasScanListener = true;
                            scanIn.addEventListener('keydown', (e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (window.triggerScanNF) window.triggerScanNF();
                                }
                            });
                        }
                    }
                }, 120);

                // IMPORTANTE: Atualizar dropdown de motoristas
                if (window.populateDriverSelector) window.populateDriverSelector();
            } else {
                console.error('Elemento #shipmentModal não encontrado no DOM!');
                alert('Erro crítico: Modal de despacho não encontrado na página.');
            }
        } catch (err) {
            console.error('Falha no openShipmentModal:', err);
            alert('Erro ao processar modal: ' + err.message);
        }
    };

    window.toggleNFSelection = (id) => {
        if (selectedNFIds.includes(id)) {
            selectedNFIds = selectedNFIds.filter(i => i !== id);
        } else {
            selectedNFIds.push(id);
        }

        let history = Utils.getStorage('dispatches') || [];
        if ((!Array.isArray(history) || history.length === 0) && Utils._memStore && Array.isArray(Utils._memStore['dispatches'])) {
            history = Utils._memStore['dispatches'];
        }
        const items = history.filter(d => {
            const dCarrier = String(d.carrier || '').trim().toUpperCase();
            return dCarrier === currentModalCarrier && d.status === 'Pendente Despacho';
        });
        updateModalTotals(items);
    };

    window.undoDispatch = (id) => {
        if (confirm('Deseja estornar este lançamento? Ele sairá desta lista de despacho e voltará para o histórico como cancelado.')) {
            let history = Utils.getStorage('dispatches') || [];
            if ((!Array.isArray(history) || history.length === 0) && Utils._memStore && Array.isArray(Utils._memStore['dispatches'])) {
                history = Utils._memStore['dispatches'];
            }
            const idx = history.findIndex(d => d.id === id);
            if (idx !== -1) {
                const _dispBefore = { ...history[idx] };
                history[idx].status = 'Cancelado';
                Utils.saveRaw('dispatches', JSON.stringify(history));

                if (window.db && Utils.Cloud && Utils.Cloud.hasTenant()) {
                    window.db.collection('tenants').doc(Utils.Cloud.tenantId)
                        .collection('dispatches_db').doc(String(id))
                        .update({ status: 'Cancelado' })
                        .catch(e => console.warn('[Undo] Erro dispatches_db:', e));
                }

                // v3.14.54: Audit Log
                if (Utils.writeLog) Utils.writeLog('DISPATCH_UNDISPATCH', 'Despacho', `NF ${_dispBefore.invoice || '#'+id} cancelada do painel — ${_dispBefore.carrier || ''} / ${_dispBefore.city || ''}`, { status: 'Pendente Despacho', id }, { status: 'Cancelado' });

                // Refresh modal
                const remaining = history.filter(d => {
                    const dCarrier = String(d.carrier || '').trim().toUpperCase();
                    return dCarrier === currentModalCarrier && d.status === 'Pendente Despacho';
                });

                if (remaining.length === 0) {
                    const modal = document.getElementById('shipmentModal');
                    if (modal) modal.style.display = 'none';
                    selectedNFIds = [];
                    currentModalCarrier = '';
                    if (typeof window.renderDashboard === 'function') {
                        window.renderDashboard();
                    }
                } else {
                    selectedNFIds = selectedNFIds.filter(i => i !== id);
                    renderModalItems(remaining);
                    if (typeof window.renderDashboard === 'function') {
                        window.renderDashboard();
                    }
                }
                window.showToast('🔄 Lançamento estornado!');
            }
        }
    };

    window.generateRomaneioAction = () => {
        try {
            console.log('Tentando gerar romaneio...');
            if (selectedNFIds.length === 0) {
                alert('Selecione ao menos uma nota fiscal para gerar o romaneio.');
                return;
            }

            const history = Utils.getStorage('dispatches');
            const toDispatchRaw = history.filter(d => selectedNFIds.includes(d.id));
            // ✅ Deduplicar por id para evitar NFs duplicadas no romaneio
            const toDispatch = toDispatchRaw.filter((item, idx, arr) => arr.findIndex(x => x.id === item.id) === idx);
            if (toDispatchRaw.length !== toDispatch.length) {
                console.warn(`[Romaneio] ⚠️ ${toDispatchRaw.length - toDispatch.length} NF(s) duplicada(s) removida(s) antes de imprimir.`);
            }

            if (toDispatch.length === 0) {
                alert('Erro: Notas selecionadas não encontradas no histórico.');
                return;
            }

            // v3.11.29 — Sanitizar campos undefined/null antes de gerar romaneio
            const _san = (v, fb) => (!v || v === 'undefined' || v === 'null' || String(v).trim() === '') ? fb : v;
            toDispatch.forEach(d => {
                d.client       = _san(d.client,       'NÃO INFORMADO');
                d.city         = _san(d.city,         'NÃO INFORMADO');
                d.neighborhood = _san(d.neighborhood, '-');
                d.carrier      = _san(d.carrier,      currentModalCarrier || 'NÃO INFORMADO');
                d.invoice      = _san(d.invoice,      'S/N');
                if (d.total  == null || isNaN(d.total))   d.total   = 0;
                if (d.nfValue == null || isNaN(d.nfValue)) d.nfValue = 0;
                if (d.weight == null || isNaN(d.weight))   d.weight  = 0;
                console.warn(`[v3.11.29] NF ${d.invoice} — cliente: "${d.client}", cidade: "${d.city}"`);
            });

            const totalWeight = toDispatch.reduce((acc, curr) => acc + (parseFloat(curr.weight) || 0), 0);
            const totalFreight = toDispatch.reduce((acc, curr) => acc + (parseFloat(curr.total) || 0), 0);

            const deliveryTypeEl = document.getElementById('deliveryTypeSelector');
            let rawType = deliveryTypeEl ? deliveryTypeEl.value : 'direto';

            console.log('🔍 [DEBUG] Valor do seletor (rawType):', rawType);
            console.log('🔍 [DEBUG] Elemento seletor:', deliveryTypeEl);

            let deliveryType = rawType;
            let assignedDriverLogin = null;
            let assignedDriverName = null;

            if (rawType.startsWith('moto_') || rawType.startsWith('carro_')) {
                const parts = rawType.split('_');
                deliveryType = parts[0];
                assignedDriverLogin = parts.slice(1).join('_');

                const allUsers = Utils.getStorage('app_users') || [];
                const uObj = allUsers.find(u => u.login === assignedDriverLogin);
                if (uObj) assignedDriverName = uObj.name;
            }

            console.log('📦 Tipo de despacho:', deliveryType, '| Motorista:', assignedDriverName || 'N/A');

            const loggedUser = Utils.getStorage('logged_user');
            const dispatchedBy = (Array.isArray(loggedUser) ? loggedUser[0]?.login : loggedUser?.login) || 'sistema';

            // ✅ v3.11.40: Gera o ID do romaneio ANTES de carimbar nos despachos
            const randomId = 'ROM-' + Date.now().toString().slice(-6) + '-' + Math.floor(Math.random() * 100);

            // Mark as dispatched and set delivery type
            history.forEach(d => {
                if (selectedNFIds.includes(d.id)) {
                    d.status = 'Despachado';
                    d.dispatchedAt = new Date().toISOString();
                    d.dispatchedBy = dispatchedBy;
                    d.romaneioId = randomId;

                    if (deliveryType === 'moto' || deliveryType === 'carro') {
                        d.deliveryType = deliveryType;
                        d.deliveryStatus = 'em_entrega';
                        d.deliveryDispatchedAt = new Date().toISOString();
                        d.deliveryDispatchedBy = dispatchedBy;
                        d.deliveryDestination = d.carrier;

                        if (assignedDriverLogin) {
                            d.driverLogin = assignedDriverLogin;
                            d.driverName = assignedDriverName;
                            d.deliveryPerson = assignedDriverName;
                        }

                        console.log(`🚚 NF ${d.invoice} enviada para ${deliveryType === 'moto' ? '🏍️ Moto' : '🚗 Carro'} Entrega (${assignedDriverName})`);
                    }
                }
            });

            Utils.saveRaw('dispatches', JSON.stringify(history));

            // v3.22.0 - Fase 4: Gravação concorrente direta na subcoleção dispatches_db
            if (window.db && Utils.Cloud && Utils.Cloud.hasTenant()) {
                try {
                    const batch = window.db.batch();
                    toDispatch.forEach(item => {
                        const docRef = window.db.collection('tenants').doc(Utils.Cloud.tenantId).collection('dispatches_db').doc(String(item.id));
                        batch.set(docRef, item, { merge: true });
                    });
                    batch.commit().catch(e => console.warn('[Dashboard] Aviso batch dispatches_db:', e));
                } catch (err) {
                    console.warn('[Dashboard] Falha ao gravar dispatches_db:', err);
                }
            }

            // NOVO: Notificar Vendedores automaticamente (Parametrizável v3.7)
            const settings = window.app_settings || { wa_auto_seller: true };
            const sellersToNotify = {};
            if (settings.wa_auto_seller) {
                toDispatch.forEach(d => {
                    if (d.sellerId && d.sellerPhone) {
                        // v3.14.55: armazena o objeto completo (não só o ID)
                        // para evitar re-lookup no _dispatchesFullCache que pode não ter o despacho recém-criado
                        if (!sellersToNotify[d.sellerId]) {
                            sellersToNotify[d.sellerId] = d;
                        }
                    }
                });
            }

            // ======= SALVAMENTO DA ENTIDADE ROMANEIO =======
            const romaneios = Utils.getStorage('app_romaneios') || [];
            const novoRomaneio = {
                id: randomId,
                createdAt: new Date().toISOString(),
                createdBy: dispatchedBy,
                carrier: currentModalCarrier,
                driverName: assignedDriverName || '-',
                vehicle: deliveryType,
                totalWeight: totalWeight,
                totalFreight: totalFreight,
                invoiceCount: toDispatch.length,
                items: toDispatch.map(d => ({
                    id: d.id, invoice: d.invoice,
                    client: d.client, city: d.city, neighborhood: d.neighborhood,
                    carrier: d.carrier, total: d.total, weight: d.weight,
                    volume: d.volume, nfValue: d.nfValue,
                    redespacho: d.redespacho, isComplement: d.isComplement
                })),
                status: 'em_rota',
                baixadoAt: null
            };
            romaneios.push(novoRomaneio);
            Utils.saveRaw('app_romaneios', JSON.stringify(romaneios));
            // v3.14.54: Audit Log
            if (Utils.writeLog) Utils.writeLog('ROMANEIO_CREATE', 'Romaneio', `Romaneio ${randomId} gerado — ${currentModalCarrier} — ${toDispatch.length} NF(s) despachadas por ${dispatchedBy}`, null, { id: randomId, carrier: currentModalCarrier, nfs: toDispatch.length, dispatchedBy });
            // ===============================================

            // Disparo Automático de WhatsApp para CLIENTES + VENDEDORES (Parametrizável v3.7)
            if (settings.wa_auto_client || settings.wa_auto_seller) {
                const waQueue = [];

                if (settings.wa_auto_client) {
                    const cList = Utils.getStorage('clients') || [];
                    const norm = (s) => s ? s.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase() : '';
                    const ignoredNames = ['DIVERSOS', 'CONSUMIDOR FINAL'];
                    toDispatch.forEach(d => {
                        if (ignoredNames.includes(norm(d.client))) return;
                        const clientObj = cList.find(c => norm(c.nome) === norm(d.client));
                        const phone = clientObj && clientObj.telefone ? clientObj.telefone.replace(/\D/g, '') : '';
                        if (!phone || phone.length < 10) {
                            console.warn(`[WA Auto] Sem telefone para ${d.client} (NF ${d.invoice})`);
                            return;
                        }
                        const rawLead = (d.leadTime || '').replace(/\D/g, '');
                        const fullName = (clientObj && clientObj.nome) ? clientObj.nome : d.client;
                        const msg = `Olá ${fullName}!\nInformamos que seu pedido NF: ${d.invoice} foi despachado via ${d.carrier}.\nPrevisão de Entrega: D+${rawLead} dias.\nLT Distribuidora agradece!\nQualquer dúvida, estamos à disposição!`;
                        waQueue.push({
                            label: `📦 ${d.client} (NF ${d.invoice})`,
                            url: `https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`
                        });
                    });
                }

                if (settings.wa_auto_seller) {
                    // v3.14.55: usa o objeto do despacho diretamente (sem re-lookup no cache)
                    Object.values(sellersToNotify).forEach(d => {
                        if (!d || !d.sellerPhone) return;
                        const phone = d.sellerPhone.replace(/\D/g, '');
                        const dispatchDate = new Date(d.dispatchedAt || d.date || new Date()).toLocaleDateString('pt-BR');
                        const msg = window._buildVendorWAMsg(d, dispatchDate);
                        waQueue.push({
                            label: `🧑‍💼 Vendedor: ${d.sellerName}`,
                            url: `https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`
                        });
                    });
                }

                if (waQueue.length > 0) {
                    // Abre todas as abas automaticamente — sem painel intermediário.
                    // Funciona porque generateRomaneioAction é 100% síncrona até aqui:
                    // não há await/Promise antes deste ponto, então o browser ainda
                    // reconhece o contexto de "gesto do usuário" do clique original
                    // e libera todos os window.open() sem bloquear.
                    waQueue.forEach(item => window.open(item.url, '_blank'));
                }
            }

            // Open print manifest (called AFTER WA panel to preserve user gesture for WA)
            window.printSpecificRomaneio(currentModalCarrier, toDispatch, randomId);

            if (deliveryType === 'moto') {
                window.showToast('🏍️ Romaneio gerado! NFs enviadas para Moto Entrega.');
            } else if (deliveryType === 'carro') {
                window.showToast('🚗 Romaneio gerado! NFs enviadas para Carro Entrega.');
            } else {
                window.showToast('🚚 Romaneio gerado com sucesso!');
            }

            const modal = document.getElementById('shipmentModal');
            if (modal) modal.style.display = 'none';

            // NOVO: Atualizar o Painel imediatamente após finalizar o despacho (v3.7.6)
            if (window.renderDashboard) window.renderDashboard();

            // Refresh delivery modules if available
            if (window.DeliveryModule) {
                window.DeliveryModule.renderMotoEntregas();
                window.DeliveryModule.renderCarroEntregas();
            }

            // v3.22.0 - Fase 4: Notificação assíncrona ao ERP ativo (confirmDispatch)
            if (window.ErpIntegration && window.ErpIntegration.confirmDispatch) {
                toDispatch.forEach(item => {
                    window.ErpIntegration.confirmDispatch({
                        numero_nf: item.invoice,
                        transportadora: currentModalCarrier,
                        valor_frete_total: item.total || item.freightValue || item.freightCost || 0,
                        valor_frete_principal: item.mainFreight || 0,
                        valor_redespacho: item.redespachoValue || 0,
                        romaneio_id: randomId,
                        motorista: assignedDriverName || '',
                        data_despacho: new Date().toISOString().split('T')[0]
                    }).catch(e => console.warn('[ERP confirmDispatch] Erro silencioso:', e));
                });
            }

            // Reset delivery type selector for next use
            if (deliveryTypeEl) deliveryTypeEl.value = 'direto';

        } catch (err) {
            console.error('Erro em generateRomaneioAction:', err);
            alert('Erro ao gerar romaneio: ' + err.message);
        }
    };

    // Render inicial do dashboard (após DOM pronto)
    document.addEventListener('DOMContentLoaded', () => {
        if (window.renderDashboard) window.renderDashboard();
        console.log('[Dashboard] dispatch-dashboard.js carregado. ✅');
    });

})();
