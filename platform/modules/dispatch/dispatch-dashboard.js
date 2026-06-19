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
        <tr>
            <td><input type="checkbox" ${selectedNFIds.includes(item.id) ? 'checked' : ''} onchange="window.toggleNFSelection(${item.id})"></td>
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

    // ── Funções Públicas (window.*) ───────────────────────────────────────────

    window.renderDashboard = () => {

        const history = Utils.getStorage('dispatches');
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

        // All registered carriers
        const allCarriers = Utils.getStorage('carrier_list') || [];

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
                const rules = Utils.getStorage('freight_tables');

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
    };

    window.openShipmentModal = (carrier) => {
        try {
            const cleanCarrier = String(carrier || '').trim().toUpperCase();
            console.log('openShipmentModal executando para:', cleanCarrier);
            currentModalCarrier = cleanCarrier;

            const history = Utils.getStorage('dispatches');
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

        const history = Utils.getStorage('dispatches');
        const items = history.filter(d => {
            const dCarrier = String(d.carrier || '').trim().toUpperCase();
            return dCarrier === currentModalCarrier && d.status === 'Pendente Despacho';
        });
        updateModalTotals(items);
    };

    window.undoDispatch = (id) => {
        if (confirm('Deseja estornar este lançamento? Ele sairá desta lista de despacho e voltará para o histórico como cancelado.')) {
            let history = Utils.getStorage('dispatches');
            const idx = history.findIndex(d => d.id === id);
            if (idx !== -1) {
                history[idx].status = 'Cancelado';
                Utils.saveRaw('dispatches', JSON.stringify(history));

                // Refresh modal
                const remaining = history.filter(d => {
                    const dCarrier = String(d.carrier || '').trim().toUpperCase();
                    return dCarrier === currentModalCarrier && d.status === 'Pendente Despacho';
                });

                if (remaining.length === 0) {
                    document.getElementById('shipmentModal').style.display = 'none';
                    setTimeout(() => location.reload(), 800); // Dá tempo do Firebase Sync salvar na nuvem
                } else {
                    selectedNFIds = selectedNFIds.filter(i => i !== id);
                    renderModalItems(remaining);
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

            // NOVO: Notificar Vendedores automaticamente (Parametrizável v3.7)
            const settings = window.app_settings || { wa_auto_seller: true };
            const sellersToNotify = {};
            if (settings.wa_auto_seller) {
                toDispatch.forEach(d => {
                    if (d.sellerId && d.sellerPhone) {
                        if (!sellersToNotify[d.sellerId]) {
                            sellersToNotify[d.sellerId] = d.id;
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
                    Object.values(sellersToNotify).forEach(dispatchId => {
                        const numId = Number(dispatchId);
                        const localH = Utils.getStorage('dispatches') || [];
                        const allH = window._dispatchesFullCache || localH;
                        const d = allH.find(item => Number(item.id) === numId);
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
            window.printSpecificRomaneio(currentModalCarrier, toDispatch);

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
