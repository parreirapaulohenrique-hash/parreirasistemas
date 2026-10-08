/**
 * DELIVERY MODULE - Moto Entrega & Carro Entrega
 * Version: 1.0.0
 * Created: 2026-01-13
 */

const DeliveryModule = {
    // Motivos pré-definidos para devolução/cancelamento
    MOTIVOS: [
        'Cliente desistiu',
        'Erro do vendedor',
        'Peça com defeito',
        'Entrega atrasada',
        'Cliente ausente',
        'Endereço não encontrado',
        'Outro (especificar)'
    ],

    /**
     * Inicializa o módulo
     */
    init() {
        console.log('🚚 Inicializando Delivery Module...');
        this.renderMotoEntregas();
        this.renderCarroEntregas();
    },

    /**
     * Obtém entregas pendentes para um tipo (moto ou carro)
     * Se o usuário for motoboy/motorista, filtra apenas as dele
     */
    getPendingDeliveries(type) {
        const dispatches = Utils.getStorage('dispatches') || [];

        // Obter usuário logado
        let loggedUser = Utils.getStorage('logged_user');
        if (Array.isArray(loggedUser)) loggedUser = loggedUser[0];

        const userRole = loggedUser?.role?.toLowerCase() || '';
        const userLogin = loggedUser?.login || '';
        const isDriver = userRole === 'motoboy' || userRole === 'motorista';

        let pending = dispatches.filter(d => {
            // Filtrar por tipo de despacho e status
            const deliveryType = (d.deliveryType || '').toLowerCase();
            const status = (d.deliveryStatus || d.status || '').toLowerCase();

            // Despachado para moto/carro e ainda pendente de entrega
            return deliveryType === type &&
                (status === 'em_entrega' || status === 'despachado_entrega');
        });

        // Se for motoboy/motorista, filtrar apenas as entregas atribuídas a ele
        if (isDriver && userLogin) {
            pending = pending.filter(d => d.driverLogin === userLogin);
            console.log(`🔐 [DeliveryModule] Filtrado para ${userLogin}: ${pending.length} entregas`);
        }

        return pending;
    },

    /**
     * Obtém histórico de entregas finalizadas
     */
    getDeliveryHistory(type) {
        const history = Utils.getStorage('delivery_history') || [];
        return history.filter(d => (d.deliveryType || '').toLowerCase() === type);
    },

    /**
     * Despacha uma NF para entrega (Moto ou Carro)
     */
    dispatchForDelivery(dispatchId, type, deliveryPerson) {
        const dispatches = Utils.getStorage('dispatches') || [];
        const idx = dispatches.findIndex(d => d.id === dispatchId);

        if (idx === -1) {
            showToast('❌ Despacho não encontrado');
            return false;
        }

        // Atualizar o despacho
        dispatches[idx].deliveryType = type; // 'moto' ou 'carro'
        dispatches[idx].deliveryPerson = deliveryPerson;
        dispatches[idx].deliveryStatus = 'em_entrega';
        dispatches[idx].deliveryDispatchedAt = new Date().toISOString();
        dispatches[idx].deliveryDispatchedBy = Utils.getStorage('logged_user')?.login || 'sistema';

        Utils.saveRaw('dispatches', JSON.stringify(dispatches));

        // Registrar no log
        this.addDeliveryLog({
            type: type,
            action: 'despacho',
            dispatchId: dispatchId,
            invoice: dispatches[idx].invoice,
            client: dispatches[idx].client,
            deliveryPerson: deliveryPerson,
            timestamp: new Date().toISOString()
        });

        showToast(`✅ NF ${dispatches[idx].invoice} despachada para ${type === 'moto' ? '🏍️ Moto' : '🚗 Carro'} Entrega`);

        this.renderMotoEntregas();
        this.renderCarroEntregas();

        return true;
    },

    /**
     * Finaliza uma entrega com sucesso e registra comprovante digital (POD)
     */
    finalizeDelivery(dispatchId, podData = null) {
        const dispatches = Utils.getStorage('dispatches') || [];
        const idx = dispatches.findIndex(d => d.id === dispatchId);

        if (idx === -1) {
            showToast('❌ Despacho não encontrado');
            return false;
        }

        const dispatch = dispatches[idx];

        // Atualizar status
        dispatch.deliveryStatus = 'entregue';
        dispatch.deliveryCompletedAt = new Date().toISOString();

        // v3.22.0 - Fase 3: Registro do Comprovante Digital de Entrega (POD)
        if (podData) {
            dispatch.pod = {
                receiverName: podData.receiverName || '',
                receiverDoc:  podData.receiverDoc || '',
                photo:        podData.photo || null,
                signature:    podData.signature || null,
                gps:          podData.gps || null,
                capturedAt:   new Date().toISOString()
            };
            if (podData.gps) {
                dispatch.deliveryLocation = podData.gps;
            }
        }

        // v3.24.0: Atualizar trilha de rastreamento com ponto final de destino / POD
        try {
            const trail = this.getDispatchTrail(dispatch);
            const clientAddr = [dispatch.address, dispatch.neighborhood, dispatch.city, dispatch.state].filter(Boolean).join(', ') || 'Endereço de Entrega';
            const destPoint = {
                step: trail.length + 1,
                type: 'destino',
                title: 'Chegada no Destino (Cliente)',
                location: dispatch.client || 'Cliente Final',
                address: clientAddr,
                status: 'Entregue com Sucesso',
                timestamp: (podData && podData.capturedAt) || new Date().toISOString(),
                driver: dispatch.deliveryPerson || dispatch.driverName || 'Entregador',
                receiver: podData ? podData.receiverName : null,
                doc: podData ? podData.receiverDoc : null,
                lat: podData && podData.gps ? podData.gps.lat : null,
                lng: podData && podData.gps ? podData.gps.lng : null,
                accuracy: podData && podData.gps ? podData.gps.accuracy : null,
                hasPOD: !!(podData && (podData.photo || podData.signature))
            };
            const destIdx = trail.findIndex(t => t.type === 'destino');
            if (destIdx >= 0) {
                trail[destIdx] = { ...trail[destIdx], ...destPoint, step: destIdx + 1 };
            } else {
                trail.push(destPoint);
            }
            dispatch.trackingTrail = trail;
        } catch (e) {
            console.warn('[DeliveryModule] Erro ao sincronizar trackingTrail na finalização:', e);
        }

        Utils.saveRaw('dispatches', JSON.stringify(dispatches));

        // Sincronização direta na subcoleção individual dispatches_db (Fase 4)
        if (window.db && Utils.Cloud && Utils.Cloud.hasTenant()) {
            try {
                window.db.collection('tenants').doc(Utils.Cloud.tenantId)
                    .collection('dispatches_db').doc(String(dispatch.id))
                    .set(dispatch, { merge: true });
            } catch(e) { console.warn('[DeliveryModule] Falha ao sincronizar dispatches_db:', e); }
        }

        // Adicionar ao histórico de entregas
        const history = Utils.getStorage('delivery_history') || [];
        history.push({
            ...dispatch,
            finalizedAt: new Date().toISOString(),
            result: 'entregue'
        });
        Utils.saveRaw('delivery_history', JSON.stringify(history));

        // Registrar no log
        this.addDeliveryLog({
            type: dispatch.deliveryType,
            action: 'entregue',
            dispatchId: dispatchId,
            invoice: dispatch.invoice,
            client: dispatch.client,
            deliveryPerson: dispatch.deliveryPerson,
            hasPOD: !!(podData && (podData.photo || podData.signature)),
            hasGPS: !!(podData && podData.gps),
            timestamp: new Date().toISOString()
        });

        if (Utils.playBeep) Utils.playBeep('success');
        showToast(`✅ Entrega da NF ${dispatch.invoice} finalizada com comprovante digital!`);

        this.renderMotoEntregas();
        this.renderCarroEntregas();

        return true;
    },

    /**
     * Registra devolução ou cancelamento
     */
    registerReturn(dispatchId, motivo, observacao) {
        const dispatches = Utils.getStorage('dispatches') || [];
        const idx = dispatches.findIndex(d => d.id === dispatchId);

        if (idx === -1) {
            showToast('❌ Despacho não encontrado');
            return false;
        }

        const dispatch = dispatches[idx];

        // Atualizar status
        dispatch.deliveryStatus = 'devolvido';
        dispatch.deliveryCompletedAt = new Date().toISOString();
        dispatch.returnReason = motivo;
        dispatch.returnObs = observacao;

        Utils.saveRaw('dispatches', JSON.stringify(dispatches));

        // Adicionar ao histórico de entregas
        const history = Utils.getStorage('delivery_history') || [];
        history.push({
            ...dispatch,
            finalizedAt: new Date().toISOString(),
            result: 'devolvido',
            returnReason: motivo,
            returnObs: observacao
        });
        Utils.saveRaw('delivery_history', JSON.stringify(history));

        // Registrar no log
        this.addDeliveryLog({
            type: dispatch.deliveryType,
            action: 'devolvido',
            dispatchId: dispatchId,
            invoice: dispatch.invoice,
            client: dispatch.client,
            deliveryPerson: dispatch.deliveryPerson,
            motivo: motivo,
            observacao: observacao,
            timestamp: new Date().toISOString()
        });

        showToast(`⚠️ NF ${dispatch.invoice} registrada como devolução`);

        this.renderMotoEntregas();
        this.renderCarroEntregas();

        return true;
    },

    /**
     * Adiciona entrada no log de entregas
     */
    addDeliveryLog(entry) {
        const logs = Utils.getStorage('delivery_logs') || [];
        logs.push(entry);
        Utils.saveRaw('delivery_logs', JSON.stringify(logs));
    },

    /**
     * Imprime romaneio padronizado para o entregador (idêntico ao de transportadora)
     */
    printDriverRomaneio(type, person) {
        const pending = this.getPendingDeliveries(type);
        const items = pending.filter(d => (d.deliveryPerson || d.driverName || 'Não Atribuído') === person);
        if (items.length === 0) {
            showToast('⚠️ Nenhuma entrega pendente para imprimir.');
            return;
        }
        const carrierTitle = type === 'moto' ? `MOTO ENTREGA - ${person}` : `CARRO ENTREGA - ${person}`;
        if (window.printSpecificRomaneio) {
            window.printSpecificRomaneio(carrierTitle, items);
        } else {
            alert('Função de impressão não disponível.');
        }
    },

    /**
     * Renderiza cards de entregas para Moto (AGRUPADO POR ENTREGADOR)
     */
    renderMotoEntregas() {
        const container = document.getElementById('motoEntregasContainer');
        if (!container) return;

        const pending = this.getPendingDeliveries('moto');

        if (pending.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                    <span class="material-icons-round" style="font-size: 4rem; opacity: 0.3;">two_wheeler</span>
                    <h3 style="margin: 1rem 0 0.5rem;">Nenhuma entrega pendente</h3>
                    <p style="margin: 0;">As NFs despachadas para Moto Entrega aparecerão aqui.</p>
                </div>
            `;
            return;
        }

        // Agrupar por entregador
        const grouped = {};
        pending.forEach(d => {
            const person = d.deliveryPerson || d.driverName || 'Não Atribuído';
            if (!grouped[person]) grouped[person] = [];
            grouped[person].push(d);
        });

        let html = '';
        Object.keys(grouped).sort().forEach(person => {
            const items = grouped[person];
            html += `
                <div style="margin-bottom: 1.5rem;">
                    <div style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 12px 16px; border-radius: 12px 12px 0 0; font-weight: 700; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                        <span>🏍️ ${person}</span>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 20px; font-size: 0.9rem;">${items.length} entrega(s)</span>
                            <button onclick="DeliveryModule.printDriverRomaneio('moto', '${person.replace(/'/g, "\\'")}')" class="btn" style="background: rgba(255,255,255,0.25); color: white; border: 1px solid rgba(255,255,255,0.4); padding: 4px 10px; font-size: 0.8rem; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="Imprimir Romaneio Padronizado">
                                <span class="material-icons-round" style="font-size: 1rem;">print</span> Imprimir Romaneio
                            </button>
                        </div>
                    </div>
                    <div style="border: 1px solid var(--border-color); border-top: none; border-radius: 0 0 12px 12px; padding: 10px; background: var(--bg-secondary);">
                        ${items.map(d => this.createDeliveryCard(d, 'moto')).join('')}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        // Atualizar contadores no banner
        const stats = this.getDeliveryStats('moto');
        const pEl = document.getElementById('motoPendentes');
        const eEl = document.getElementById('motoEntregues');
        if (pEl) pEl.innerText = stats.pendentes;
        if (eEl) eEl.innerText = stats.entregues;
    },

    /**
     * Renderiza cards de entregas para Carro (AGRUPADO POR ENTREGADOR)
     */
    renderCarroEntregas() {
        const container = document.getElementById('carroEntregasContainer');
        if (!container) return;

        const pending = this.getPendingDeliveries('carro');

        if (pending.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                    <span class="material-icons-round" style="font-size: 4rem; opacity: 0.3;">directions_car</span>
                    <h3 style="margin: 1rem 0 0.5rem;">Nenhuma entrega pendente</h3>
                    <p style="margin: 0;">As NFs despachadas para Carro Entrega aparecerão aqui.</p>
                </div>
            `;
            const stats = this.getDeliveryStats('carro');
            const pEl = document.getElementById('carroPendentes');
            const eEl = document.getElementById('carroEntregues');
            if (pEl) pEl.innerText = stats.pendentes;
            if (eEl) eEl.innerText = stats.entregues;
            return;
        }

        // Agrupar por entregador
        const grouped = {};
        pending.forEach(d => {
            const person = d.deliveryPerson || d.driverName || 'Não Atribuído';
            if (!grouped[person]) grouped[person] = [];
            grouped[person].push(d);
        });

        let html = '';
        Object.keys(grouped).sort().forEach(person => {
            const items = grouped[person];
            html += `
                <div style="margin-bottom: 1.5rem;">
                    <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 12px 16px; border-radius: 12px 12px 0 0; font-weight: 700; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                        <span>🚗 ${person}</span>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 20px; font-size: 0.9rem;">${items.length} entrega(s)</span>
                            <button onclick="DeliveryModule.printDriverRomaneio('carro', '${person.replace(/'/g, "\\'")}')" class="btn" style="background: rgba(255,255,255,0.25); color: white; border: 1px solid rgba(255,255,255,0.4); padding: 4px 10px; font-size: 0.8rem; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="Imprimir Romaneio Padronizado">
                                <span class="material-icons-round" style="font-size: 1rem;">print</span> Imprimir Romaneio
                            </button>
                        </div>
                    </div>
                    <div style="border: 1px solid var(--border-color); border-top: none; border-radius: 0 0 12px 12px; padding: 10px; background: var(--bg-secondary);">
                        ${items.map(d => this.createDeliveryCard(d, 'carro')).join('')}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        // Atualizar contadores no banner
        const stats = this.getDeliveryStats('carro');
        const pEl = document.getElementById('carroPendentes');
        const eEl = document.getElementById('carroEntregues');
        if (pEl) pEl.innerText = stats.pendentes;
        if (eEl) eEl.innerText = stats.entregues;
    },

    /**
     * Cria HTML de um card de entrega
     */
    createDeliveryCard(dispatch, type) {
        const dispatchedTime = dispatch.deliveryDispatchedAt ?
            new Date(dispatch.deliveryDispatchedAt).toLocaleString('pt-BR') : '-';

        const icon = type === 'moto' ? 'two_wheeler' : 'directions_car';
        const color = type === 'moto' ? '#f59e0b' : '#10b981';

        // Status visual
        const statusLabel = (dispatch.deliveryStatus || dispatch.status || 'em_entrega').replace('_', ' ').toUpperCase();
        const hasPOD = !!(dispatch.pod && (dispatch.pod.photo || dispatch.pod.signature));

        return `
            <div class="delivery-card" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 1rem; margin-bottom: 1rem; border-left: 4px solid ${color};">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
                    <div>
                        <div style="font-size: 1.25rem; font-weight: 700; color: ${color};">NF ${dispatch.invoice}</div>
                        <div style="font-size: 0.95rem; font-weight: 600; color: var(--text-primary); margin-top: 0.2rem;">${dispatch.client}</div>
                    </div>
                    <span class="material-icons-round" style="font-size: 2rem; color: ${color}; opacity: 0.6;">${icon}</span>
                </div>
                
                <div style="display: grid; gap: 0.4rem; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem; background: rgba(255,255,255,0.02); padding: 0.75rem; border-radius: 8px;">
                    <div><strong>Endereço:</strong> ${dispatch.address || 'Não informado'}</div>
                    <div><strong>Bairro / Cidade:</strong> ${dispatch.neighborhood || '-'} - ${dispatch.city || '-'}</div>
                    <div><strong>Entregador:</strong> ${dispatch.deliveryPerson || dispatch.driverName || '-'}</div>
                    <div><strong>Despachado:</strong> ${dispatchedTime}</div>
                    <div><strong>Valor NF:</strong> ${Utils.formatCurrency ? Utils.formatCurrency(dispatch.value || dispatch.nfValue || 0) : 'R$ ' + (dispatch.value || dispatch.nfValue || 0)}</div>
                    <div><strong>Status:</strong> <span style="font-weight:700; color:${color}; font-size:0.8rem;">${statusLabel}</span></div>
                </div>

                <!-- Registro de Rastreamento da Rota (Origem ao Destino) -->
                <div style="margin-bottom: 0.75rem;">
                    <button type="button" onclick="DeliveryModule.showTrackingModal(${dispatch.id})" class="btn" style="width: 100%; justify-content: center; background: rgba(56, 189, 248, 0.12); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); font-weight: 600; font-size: 0.82rem; padding: 0.55rem; border-radius: 8px; display: flex; align-items: center; gap: 0.45rem; cursor: pointer; transition: all 0.2s ease;">
                        <span class="material-icons-round" style="font-size: 1.15rem; color: #38bdf8;">route</span>
                        <span>Registro de Rastreamento (Origem ➔ Destino)</span>
                    </button>
                </div>
                
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    <button onclick="DeliveryModule.showFinalizeModal(${dispatch.id})" class="btn btn-primary" style="flex: 2; justify-content: center; min-width: 140px; background: #10b981;">
                        <span class="material-icons-round" style="font-size: 1.1rem;">assignment_turned_in</span>
                        Baixar Entrega (POD)
                    </button>
                    <button onclick="DeliveryModule.showOccurrenceModal(${dispatch.id})" class="btn btn-secondary" style="flex: 1; justify-content: center; min-width: 100px;">
                        <span class="material-icons-round" style="font-size: 1rem;">report_problem</span>
                        Ocorrência
                    </button>
                    <button onclick="DeliveryModule.showReturnModal(${dispatch.id})" class="btn btn-secondary" style="flex: 1; justify-content: center; background: var(--accent-warning); color: #000; font-weight: 600; min-width: 100px;">
                        <span class="material-icons-round" style="font-size: 1rem;">undo</span>
                        Devolver
                    </button>
                    ${hasPOD ? `
                        <button onclick="DeliveryModule.showPODModal(${dispatch.id})" class="btn" style="width: 100%; justify-content: center; background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); margin-top: 0.25rem;">
                            <span class="material-icons-round" style="font-size: 1rem;">receipt_long</span> Ver Comprovante (POD)
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    },

    /**
     * Modal Completo para Finalizar Entrega com Comprovante Digital (POD) - Fase 3
     */
    showFinalizeModal(dispatchId) {
        const dispatches = Utils.getStorage('dispatches') || [];
        const dispatch = dispatches.find(d => d.id === dispatchId);
        if (!dispatch) return;

        window._currentPodPhoto = null;
        window._currentPodGps = null;

        const modalHtml = `
            <div id="podFinalizeModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 1rem; backdrop-filter: blur(4px);">
                <div style="background: var(--bg-card, #1e293b); color: var(--text-primary, #f8fafc); border-radius: 14px; padding: 1.5rem; width: 100%; max-width: 480px; max-height: 92vh; overflow-y: auto; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:0.75rem;">
                        <h3 style="margin: 0; display: flex; align-items: center; gap: 0.5rem; font-size: 1.15rem; color: #10b981;">
                            <span class="material-icons-round">verified</span>
                            Comprovante de Entrega (POD)
                        </h3>
                        <button onclick="document.getElementById('podFinalizeModal').remove()" style="background:none; border:none; color:var(--text-secondary,#94a3b8); cursor:pointer; font-size:1.5rem; line-height:1;">&times;</button>
                    </div>

                    <div style="margin-bottom: 1rem; padding: 0.75rem; background: rgba(16, 185, 129, 0.1); border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.2);">
                        <strong style="color: #10b981;">NF ${dispatch.invoice}</strong> — <span>${dispatch.client}</span>
                    </div>

                    <!-- 1. Foto do Canhoto / Documento -->
                    <div style="margin-bottom: 1rem;">
                        <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.4rem;">📷 Foto do Canhoto / Comprovante</label>
                        <input type="file" id="podPhotoInput" accept="image/*" capture="environment" style="display: none;">
                        <button type="button" onclick="document.getElementById('podPhotoInput').click()" class="btn btn-secondary" style="width: 100%; justify-content: center; gap: 0.5rem; border: 1px dashed #3b82f6; background: rgba(59, 130, 246, 0.08); color: #60a5fa;">
                            <span class="material-icons-round">photo_camera</span>
                            Tirar Foto do Canhoto
                        </button>
                        <div id="podPhotoPreviewContainer" style="display:none; margin-top:0.5rem; position:relative; text-align:center;">
                            <img id="podPhotoImg" src="" alt="Canhoto" style="max-width:100%; max-height:160px; border-radius:8px; border:1px solid #334155; object-fit:contain; background:#000;">
                            <button type="button" onclick="DeliveryModule.clearPodPhoto()" style="position:absolute; top:4px; right:4px; background:#ef4444; color:white; border:none; border-radius:50%; width:26px; height:26px; cursor:pointer; font-weight:bold;">&times;</button>
                        </div>
                    </div>

                    <!-- 2. Assinatura Digital Touch -->
                    <div style="margin-bottom: 1rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                            <label style="font-size:0.85rem; font-weight:600; margin:0;">✍️ Assinatura do Recebedor</label>
                            <button type="button" onclick="DeliveryModule.clearSignature()" style="background:none; border:none; color:#f87171; font-size:0.75rem; cursor:pointer; text-decoration:underline;">Limpar</button>
                        </div>
                        <div style="border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; background: #ffffff; touch-action: none; overflow: hidden;">
                            <canvas id="podSignatureCanvas" width="400" height="130" style="width:100%; height:130px; display:block; cursor:crosshair;"></canvas>
                        </div>
                        <span style="font-size:0.7rem; color:var(--text-secondary,#94a3b8);">Assine com o dedo ou caneta touch no quadro branco.</span>
                    </div>

                    <!-- 3. Dados do Recebedor -->
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem; margin-bottom:1rem;">
                        <div>
                            <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:0.25rem;">Nome do Recebedor *</label>
                            <input type="text" id="podReceiverName" class="form-input" placeholder="Quem recebeu" style="width:100%;">
                        </div>
                        <div>
                            <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:0.25rem;">RG ou CPF</label>
                            <input type="text" id="podReceiverDoc" class="form-input" placeholder="Doc do recebedor" style="width:100%;">
                        </div>
                    </div>

                    <!-- 4. Geolocalização GPS -->
                    <div id="podGpsStatus" style="font-size:0.8rem; padding:0.5rem; background:rgba(255,255,255,0.03); border-radius:6px; margin-bottom:1.25rem; display:flex; align-items:center; gap:0.5rem; color:var(--text-secondary,#94a3b8);">
                        <span class="material-icons-round" style="font-size:1.1rem; color:#f59e0b;">location_searching</span>
                        <span>Capturando coordenadas GPS em tempo real...</span>
                    </div>

                    <!-- Botões de Ação -->
                    <div style="display: flex; gap: 0.5rem;">
                        <button type="button" onclick="document.getElementById('podFinalizeModal').remove()" class="btn btn-secondary" style="flex: 1; justify-content: center;">
                            Cancelar
                        </button>
                        <button type="button" onclick="DeliveryModule.confirmFinalizePOD(${dispatchId})" class="btn btn-primary" style="flex: 2; justify-content: center; background: #10b981; font-weight: 700;">
                            <span class="material-icons-round">check_circle</span>
                            Confirmar & Salvar
                        </button>
                    </div>
                </div>
            </div>
        `;

        const existing = document.getElementById('podFinalizeModal');
        if (existing) existing.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Inicializar Canvas de Assinatura e Eventos
        setTimeout(() => {
            this.initSignatureCanvas();
            this.initPhotoHandler();
            this.initGpsCapture();
        }, 50);
    },

    /**
     * Inicializa Canvas Touch de Assinatura
     */
    initSignatureCanvas() {
        const canvas = document.getElementById('podSignatureCanvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let isDrawing = false;
        let hasDrawn = false;

        // Suporte para retina/alta resolução
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * 2;
        canvas.height = rect.height * 2;
        ctx.scale(2, 2);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        function getPos(e) {
            const r = canvas.getBoundingClientRect();
            if (e.touches && e.touches[0]) {
                return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
            }
            return { x: e.clientX - r.left, y: e.clientY - r.top };
        }

        function start(e) {
            e.preventDefault();
            isDrawing = true;
            hasDrawn = true;
            window._podHasSignature = true;
            const pos = getPos(e);
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
        }

        function draw(e) {
            if (!isDrawing) return;
            e.preventDefault();
            const pos = getPos(e);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
        }

        function stop(e) {
            if (isDrawing) {
                isDrawing = false;
                ctx.closePath();
            }
        }

        canvas.addEventListener('mousedown', start);
        canvas.addEventListener('mousemove', draw);
        window.addEventListener('mouseup', stop);

        canvas.addEventListener('touchstart', start, { passive: false });
        canvas.addEventListener('touchmove', draw, { passive: false });
        canvas.addEventListener('touchend', stop, { passive: false });

        window._podSignatureCanvas = canvas;
        window._podHasSignature = false;
    },

    clearSignature() {
        const canvas = window._podSignatureCanvas || document.getElementById('podSignatureCanvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            window._podHasSignature = false;
        }
    },

    /**
     * Manipulador de Câmera e Compressão de Foto (Canvas JPEG < 100KB)
     */
    initPhotoHandler() {
        const input = document.getElementById('podPhotoInput');
        if (!input) return;

        input.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    // Redimensiona proporcionalmente para max 1200px
                    const maxDim = 1200;
                    let width = img.width;
                    let height = img.height;
                    if (width > maxDim || height > maxDim) {
                        if (width > height) {
                            height = Math.round((height * maxDim) / width);
                            width = maxDim;
                        } else {
                            width = Math.round((width * maxDim) / height);
                            height = maxDim;
                        }
                    }

                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = width;
                    tempCanvas.height = height;
                    const ctx = tempCanvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // Carimbo de data/hora na imagem
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                    ctx.fillRect(0, height - 36, width, 36);
                    ctx.fillStyle = '#ffffff';
                    ctx.font = '16px monospace';
                    ctx.fillText(`ENTREGA POD - ${new Date().toLocaleString('pt-BR')}`, 12, height - 12);

                    const compressedBase64 = tempCanvas.toDataURL('image/jpeg', 0.72);
                    window._currentPodPhoto = compressedBase64;

                    const previewContainer = document.getElementById('podPhotoPreviewContainer');
                    const previewImg = document.getElementById('podPhotoImg');
                    if (previewContainer && previewImg) {
                        previewImg.src = compressedBase64;
                        previewContainer.style.display = 'block';
                    }
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });
    },

    clearPodPhoto() {
        window._currentPodPhoto = null;
        const previewContainer = document.getElementById('podPhotoPreviewContainer');
        const input = document.getElementById('podPhotoInput');
        if (previewContainer) previewContainer.style.display = 'none';
        if (input) input.value = '';
    },

    /**
     * Captura GPS nativa
     */
    initGpsCapture() {
        const gpsEl = document.getElementById('podGpsStatus');
        if (!navigator.geolocation) {
            if (gpsEl) gpsEl.innerHTML = `<span class="material-icons-round" style="color:#ef4444;">location_off</span> Geolocation não suportada no aparelho.`;
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude, accuracy } = pos.coords;
                window._currentPodGps = {
                    lat: latitude,
                    lng: longitude,
                    accuracy: Math.round(accuracy),
                    capturedAt: new Date().toISOString()
                };
                if (gpsEl) {
                    gpsEl.innerHTML = `
                        <span class="material-icons-round" style="color:#10b981;">my_location</span>
                        <span style="color:#10b981; font-weight:600;">GPS OK:</span>
                        <span>${latitude.toFixed(5)}, ${longitude.toFixed(5)} (±${Math.round(accuracy)}m)</span>
                    `;
                }
            },
            (err) => {
                console.warn('[GPS POD] Erro ao obter geolocalização:', err.message);
                if (gpsEl) {
                    gpsEl.innerHTML = `
                        <span class="material-icons-round" style="color:#f59e0b;">location_disabled</span>
                        <span>GPS não capturado (${err.message}). Prosseguindo com POD.</span>
                    `;
                }
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        );
    },

    /**
     * Valida e confirma baixa com POD
     */
    confirmFinalizePOD(dispatchId) {
        const receiverName = (document.getElementById('podReceiverName')?.value || '').trim();
        const receiverDoc = (document.getElementById('podReceiverDoc')?.value || '').trim();

        if (!receiverName) {
            alert('Por favor, informe o Nome do Recebedor.');
            document.getElementById('podReceiverName')?.focus();
            return;
        }

        let signatureBase64 = null;
        if (window._podHasSignature && window._podSignatureCanvas) {
            signatureBase64 = window._podSignatureCanvas.toDataURL('image/png');
        }

        const podData = {
            receiverName,
            receiverDoc,
            photo: window._currentPodPhoto || null,
            signature: signatureBase64 || null,
            gps: window._currentPodGps || null
        };

        const modal = document.getElementById('podFinalizeModal');
        if (modal) modal.remove();

        this.finalizeDelivery(dispatchId, podData);
    },

    /**
     * Visualizador de Comprovante de Entrega Digital (POD)
     */
    showPODModal(dispatchId) {
        const dispatches = Utils.getStorage('dispatches') || [];
        const history = Utils.getStorage('delivery_history') || [];
        const d = dispatches.find(item => item.id === dispatchId) ||
                  history.find(item => item.id === dispatchId);

        if (!d || !d.pod) {
            alert('Nenhum comprovante digital (POD) encontrado para esta entrega.');
            return;
        }

        const pod = d.pod;
        const capturedTime = pod.capturedAt ? new Date(pod.capturedAt).toLocaleString('pt-BR') : '-';
        const mapsLink = pod.gps ? `https://www.google.com/maps/search/?api=1&query=${pod.gps.lat},${pod.gps.lng}` : null;

        const modalHtml = `
            <div id="podViewerModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.88); z-index: 10001; display: flex; align-items: center; justify-content: center; padding: 1rem; backdrop-filter: blur(4px);">
                <div style="background: var(--bg-card, #1e293b); color: var(--text-primary, #f8fafc); border-radius: 14px; padding: 1.5rem; width: 100%; max-width: 520px; max-height: 92vh; overflow-y: auto; border: 1px solid rgba(255,255,255,0.1);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:0.75rem;">
                        <h3 style="margin: 0; display: flex; align-items: center; gap: 0.5rem; color: #38bdf8;">
                            <span class="material-icons-round">receipt_long</span> Comprovante POD — NF ${d.invoice}
                        </h3>
                        <button onclick="document.getElementById('podViewerModal').remove()" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:1.5rem; line-height:1;">&times;</button>
                    </div>

                    <div style="font-size:0.85rem; line-height:1.6; margin-bottom:1rem; background:rgba(255,255,255,0.03); padding:0.75rem; border-radius:8px;">
                        <div><strong>Cliente:</strong> ${d.client}</div>
                        <div><strong>Recebido por:</strong> ${pod.receiverName || 'Não informado'} ${pod.receiverDoc ? `(Doc: ${pod.receiverDoc})` : ''}</div>
                        <div><strong>Data da Baixa:</strong> ${capturedTime}</div>
                        ${pod.gps ? `<div><strong>GPS:</strong> Lat ${pod.gps.lat.toFixed(5)}, Lng ${pod.gps.lng.toFixed(5)} <a href="${mapsLink}" target="_blank" style="color:#38bdf8; text-decoration:underline; margin-left:6px;">Ver no Mapa 🗺️</a></div>` : ''}
                    </div>

                    ${pod.photo ? `
                        <div style="margin-bottom: 1rem;">
                            <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.4rem;">Foto do Canhoto Assinado:</label>
                            <img src="${pod.photo}" alt="Canhoto" style="width:100%; border-radius:8px; border:1px solid #334155; background:#000; max-height:280px; object-fit:contain;">
                        </div>
                    ` : ''}

                    ${pod.signature ? `
                        <div style="margin-bottom: 1rem;">
                            <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:0.4rem;">Assinatura Digital:</label>
                            <div style="background:#fff; border-radius:8px; padding:8px; text-align:center;">
                                <img src="${pod.signature}" alt="Assinatura" style="max-height:100px; max-width:100%;">
                            </div>
                        </div>
                    ` : ''}

                    <button onclick="document.getElementById('podViewerModal').remove()" class="btn btn-secondary" style="width: 100%; justify-content: center; margin-top: 0.5rem;">
                        Fechar
                    </button>
                </div>
            </div>
        `;

        const existing = document.getElementById('podViewerModal');
        if (existing) existing.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    /**
     * Modal para Registrar Ocorrência Intermediária (Fase 4 - Status Intermediários)
     */
    showOccurrenceModal(dispatchId) {
        const dispatches = Utils.getStorage('dispatches') || [];
        const dispatch = dispatches.find(d => d.id === dispatchId);
        if (!dispatch) return;

        const modalHtml = `
            <div id="occModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 1rem;">
                <div style="background: var(--bg-card, #1e293b); border-radius: 12px; padding: 1.5rem; width: 100%; max-width: 420px; color: var(--text-primary, #fff);">
                    <h3 style="margin: 0 0 1rem; display: flex; align-items: center; gap: 0.5rem; color: #f59e0b;">
                        <span class="material-icons-round">notification_important</span>
                        Registrar Ocorrência / Status
                    </h3>
                    <div style="margin-bottom: 1rem; padding: 0.5rem; background: rgba(245, 158, 11, 0.1); border-radius: 6px;">
                        <strong>NF ${dispatch.invoice}</strong> — ${dispatch.client}
                    </div>
                    <div class="form-group" style="margin-bottom: 1rem;">
                        <label class="form-label" style="font-size:0.85rem;">Novo Status</label>
                        <select id="occStatus" class="form-input" style="width: 100%;">
                            <option value="em_transito">🚚 Em Trânsito (Rota Iniciada)</option>
                            <option value="entregue_parcial">⚠️ Entregue Parcial (Falta de Item/Avaria)</option>
                            <option value="retido_fiscal">🛑 Retido Fiscal (Posto Fiscal)</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom: 1.25rem;">
                        <label class="form-label" style="font-size:0.85rem;">Observação / Motivo</label>
                        <textarea id="occObs" class="form-input" rows="3" placeholder="Detalhes da ocorrência..." style="width: 100%;"></textarea>
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                        <button onclick="document.getElementById('occModal').remove()" class="btn btn-secondary" style="flex: 1; justify-content: center;">Cancelar</button>
                        <button onclick="DeliveryModule.confirmOccurrence(${dispatchId})" class="btn btn-primary" style="flex: 1; justify-content: center; background: #f59e0b; color: #000; font-weight: 700;">Salvar</button>
                    </div>
                </div>
            </div>
        `;
        const existing = document.getElementById('occModal');
        if (existing) existing.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    /**
     * Confirma registro de ocorrência
     */
    confirmOccurrence(dispatchId) {
        const status = document.getElementById('occStatus')?.value;
        const obs = document.getElementById('occObs')?.value || '';

        const dispatches = Utils.getStorage('dispatches') || [];
        const idx = dispatches.findIndex(d => d.id === dispatchId);
        if (idx !== -1) {
            dispatches[idx].deliveryStatus = status;
            dispatches[idx].occurrenceObs = obs;
            dispatches[idx].occurrenceAt = new Date().toISOString();

            // v3.24.0: Registra ponto de ocorrência na trilha de rastreamento
            try {
                const trail = this.getDispatchTrail(dispatches[idx]);
                const occPoint = {
                    step: trail.length + 1,
                    type: 'passagem',
                    title: `Ocorrência: ${(status || 'Trânsito').replace(/_/g, ' ').toUpperCase()}`,
                    location: 'Posição em Trânsito',
                    address: 'Posição registrada em trânsito',
                    status: status,
                    obs: obs,
                    timestamp: new Date().toISOString(),
                    driver: dispatches[idx].deliveryPerson || dispatches[idx].driverName || 'Entregador'
                };
                const destIdx = trail.findIndex(t => t.type === 'destino');
                if (destIdx >= 0) {
                    trail.splice(destIdx, 0, occPoint);
                } else {
                    trail.push(occPoint);
                }
                trail.forEach((p, i) => p.step = i + 1);
                dispatches[idx].trackingTrail = trail;
            } catch (e) {
                console.warn('[DeliveryModule] Erro ao registrar ocorrência na trilha:', e);
            }

            Utils.saveRaw('dispatches', JSON.stringify(dispatches));

            // Sincronizar dispatches_db
            if (window.db && Utils.Cloud && Utils.Cloud.hasTenant()) {
                window.db.collection('tenants').doc(Utils.Cloud.tenantId)
                    .collection('dispatches_db').doc(String(dispatchId))
                    .set(dispatches[idx], { merge: true }).catch(e => console.warn(e));
            }

            this.addDeliveryLog({
                type: dispatches[idx].deliveryType,
                action: 'ocorrencia',
                status,
                dispatchId,
                invoice: dispatches[idx].invoice,
                obs,
                timestamp: new Date().toISOString()
            });

            showToast(`Status da NF ${dispatches[idx].invoice} atualizado para ${status}!`);
            this.renderMotoEntregas();
            this.renderCarroEntregas();
        }

        const modal = document.getElementById('occModal');
        if (modal) modal.remove();
    },

    /**
     * Modal para registrar devolução
     */
    showReturnModal(dispatchId) {
        const dispatches = Utils.getStorage('dispatches') || [];
        const dispatch = dispatches.find(d => d.id === dispatchId);

        if (!dispatch) return;

        // Criar modal
        const modalHtml = `
            <div id="returnModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 1rem;">
                <div style="background: var(--bg-card); border-radius: var(--radius-lg); padding: 1.5rem; width: 100%; max-width: 400px; max-height: 90vh; overflow-y: auto;">
                    <h3 style="margin: 0 0 1rem; display: flex; align-items: center; gap: 0.5rem;">
                        <span class="material-icons-round" style="color: var(--accent-warning);">undo</span>
                        Registrar Devolução
                    </h3>
                    
                    <div style="margin-bottom: 1rem; padding: 0.75rem; background: rgba(245, 158, 11, 0.1); border-radius: var(--radius-md); border: 1px solid rgba(245, 158, 11, 0.2);">
                        <strong>NF ${dispatch.invoice}</strong><br>
                        <span style="font-size: 0.9rem; color: var(--text-secondary);">${dispatch.client}</span>
                    </div>

                    <div class="form-group" style="margin-bottom: 1rem;">
                        <label class="form-label">Motivo da Devolução</label>
                        <select id="returnMotivo" class="form-input" style="width: 100%;">
                            ${this.MOTIVOS.map(m => `<option value="${m}">${m}</option>`).join('')}
                        </select>
                    </div>

                    <div class="form-group" style="margin-bottom: 1.5rem;">
                        <label class="form-label">Observações (opcional)</label>
                        <textarea id="returnObs" class="form-input" rows="3" placeholder="Detalhes adicionais..." style="width: 100%; resize: vertical;"></textarea>
                    </div>

                    <div style="display: flex; gap: 0.5rem;">
                        <button onclick="document.getElementById('returnModal').remove()" class="btn btn-secondary" style="flex: 1; justify-content: center;">
                            Cancelar
                        </button>
                        <button onclick="DeliveryModule.confirmReturn(${dispatchId})" class="btn btn-primary" style="flex: 1; justify-content: center; background: var(--accent-warning);">
                            Confirmar Devolução
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Remover modal existente se houver
        const existing = document.getElementById('returnModal');
        if (existing) existing.remove();

        // Adicionar ao DOM
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    /**
     * Confirma devolução
     */
    confirmReturn(dispatchId) {
        const motivo = document.getElementById('returnMotivo').value;
        const obs = document.getElementById('returnObs').value;

        this.registerReturn(dispatchId, motivo, obs);

        // Fechar modal
        const modal = document.getElementById('returnModal');
        if (modal) modal.remove();
    },

    /**
     * Relatório de entregas por tipo
     */
    getDeliveryReport(type, startDate, endDate) {
        const history = Utils.getStorage('delivery_history') || [];

        return history.filter(d => {
            if ((d.deliveryType || '').toLowerCase() !== type) return false;

            const finalized = new Date(d.finalizedAt);
            if (startDate && finalized < startDate) return false;
            if (endDate && finalized > endDate) return false;

            return true;
        });
    },

    /**
     * Retorna ou inicializa a trilha auditável de rastreamento (Origem ao Destino)
     */
    getDispatchTrail(dispatch) {
        if (dispatch.trackingTrail && Array.isArray(dispatch.trackingTrail) && dispatch.trackingTrail.length > 0) {
            return dispatch.trackingTrail;
        }

        const company = Utils.getStorage('company_data') || {};
        const originName = company.name || 'Centro de Distribuição / Base';
        const originAddr = [company.address, company.city, company.state].filter(Boolean).join(', ') || 'Base Operacional Logística';
        const driverName = dispatch.deliveryPerson || dispatch.driverName || 'Entregador Responsável';
        const dispatchedTime = dispatch.deliveryDispatchedAt || dispatch.dispatchedAt || dispatch.createdAt || new Date().toISOString();

        // Ponto 1: Origem (Saída da base/CD)
        const trail = [
            {
                step: 1,
                type: 'origem',
                title: 'Saída da Origem (Base / CD)',
                location: originName,
                address: originAddr,
                timestamp: dispatchedTime,
                driver: driverName,
                status: 'Despachado para rota',
                lat: company.lat || -1.3653,
                lng: company.lng || -48.3745,
                obs: 'Carga conferida e liberada para saída.'
            }
        ];

        // Ponto Intermediário de Ocorrência se houver
        if (dispatch.occurrenceAt) {
            trail.push({
                step: trail.length + 1,
                type: 'passagem',
                title: `Ocorrência: ${(dispatch.deliveryStatus || 'Trânsito').replace(/_/g, ' ').toUpperCase()}`,
                location: 'Posição em Trânsito',
                address: 'Rota em andamento',
                timestamp: dispatch.occurrenceAt,
                driver: driverName,
                status: dispatch.deliveryStatus || 'Ocorrência',
                obs: dispatch.occurrenceObs || 'Atualização de status em rota'
            });
        }

        // Ponto Final: Destino (Cliente)
        const clientAddr = [dispatch.address, dispatch.neighborhood, dispatch.city, dispatch.state].filter(Boolean).join(', ') || 'Endereço do Cliente';
        const isDelivered = dispatch.deliveryStatus === 'entregue' || !!(dispatch.pod && dispatch.pod.capturedAt);

        if (isDelivered) {
            const pod = dispatch.pod || {};
            trail.push({
                step: trail.length + 1,
                type: 'destino',
                title: 'Chegada no Destino (Cliente)',
                location: dispatch.client || 'Cliente Final',
                address: clientAddr,
                timestamp: dispatch.deliveryCompletedAt || pod.capturedAt || new Date().toISOString(),
                driver: driverName,
                status: 'Entregue com Sucesso',
                receiver: pod.receiverName || 'Não especificado',
                doc: pod.receiverDoc || '',
                lat: pod.gps ? pod.gps.lat : null,
                lng: pod.gps ? pod.gps.lng : null,
                accuracy: pod.gps ? pod.gps.accuracy : null,
                hasPOD: !!(pod.photo || pod.signature)
            });
        } else {
            trail.push({
                step: trail.length + 1,
                type: 'destino',
                title: 'Destino Previsto (Cliente)',
                location: dispatch.client || 'Cliente Final',
                address: clientAddr,
                status: 'Em deslocamento para o destino',
                isPending: true
            });
        }

        dispatch.trackingTrail = trail;
        return trail;
    },

    /**
     * Calcula o tempo de rota decorrido ou final entre primeiro e último ponto
     */
    calculateTrailDuration(trail) {
        if (!trail || trail.length === 0) return '-';
        const start = new Date(trail[0].timestamp || Date.now());
        const lastWithTime = [...trail].reverse().find(t => t.timestamp);
        const end = lastWithTime ? new Date(lastWithTime.timestamp) : new Date();

        const diffMs = Math.max(0, end - start);
        const totalMinutes = Math.floor(diffMs / 60000);
        if (totalMinutes < 1) return 'Menos de 1 min';
        if (totalMinutes < 60) return `${totalMinutes} min`;
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return `${hours}h ${minutes}min`;
    },

    /**
     * Modal Completo de Registro de Rastreamento (Origem ao Destino)
     */
    showTrackingModal(dispatchId) {
        const dispatches = Utils.getStorage('dispatches') || [];
        const history = Utils.getStorage('delivery_history') || [];
        const dispatch = dispatches.find(d => d.id === dispatchId) ||
                         history.find(d => d.id === dispatchId);

        if (!dispatch) {
            showToast('❌ Entrega não encontrada.');
            return;
        }

        const trail = this.getDispatchTrail(dispatch);
        const isMoto = (dispatch.deliveryType || '').toLowerCase() === 'moto';
        const vehicleIcon = isMoto ? 'two_wheeler' : 'directions_car';
        const vehicleLabel = isMoto ? 'Moto Entrega' : 'Carro Entrega';
        const vehicleColor = isMoto ? '#f59e0b' : '#10b981';
        const driverName = dispatch.deliveryPerson || dispatch.driverName || 'Entregador';
        const durationText = this.calculateTrailDuration(trail);

        const statusLabel = (dispatch.deliveryStatus || dispatch.status || 'em_entrega').replace(/_/g, ' ').toUpperCase();
        const isCompleted = dispatch.deliveryStatus === 'entregue';
        const hasPOD = !!(dispatch.pod && (dispatch.pod.photo || dispatch.pod.signature));

        const waypointsCount = trail.filter(t => t.type === 'passagem').length;

        const modalHtml = `
            <div id="trackingTrailModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 1rem; backdrop-filter: blur(5px);" onclick="if(event.target===this)this.remove()">
                <div style="background: var(--bg-card, #1e293b); color: var(--text-primary, #f8fafc); border-radius: 14px; padding: 1.5rem; width: 100%; max-width: 760px; max-height: 94vh; overflow-y: auto; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);">
                    
                    <!-- Header -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.85rem;">
                        <div>
                            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                                <h3 style="margin: 0; font-size: 1.2rem; font-weight: 700; color: #38bdf8; display: flex; align-items: center; gap: 0.4rem;">
                                    <span class="material-icons-round" style="font-size: 1.3rem;">route</span>
                                    Rastreamento de Rota — NF ${dispatch.invoice}
                                </h3>
                                <span style="background: ${vehicleColor}20; color: ${vehicleColor}; border: 1px solid ${vehicleColor}50; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
                                    <span class="material-icons-round" style="font-size: 0.9rem;">${vehicleIcon}</span>
                                    ${vehicleLabel}
                                </span>
                                <span style="background: ${isCompleted ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'}; color: ${isCompleted ? '#10b981' : '#f59e0b'}; border: 1px solid ${isCompleted ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)'}; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 700;">
                                    ${statusLabel}
                                </span>
                            </div>
                            <div style="font-size: 0.88rem; color: var(--text-secondary, #94a3b8); margin-top: 0.3rem;">
                                <strong>Cliente:</strong> ${dispatch.client} &bull; <strong>Condutor:</strong> ${driverName}
                            </div>
                        </div>
                        <button type="button" onclick="document.getElementById('trackingTrailModal').remove()" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 1.7rem; line-height: 1; padding: 0 4px;" title="Fechar">&times;</button>
                    </div>

                    <!-- Métricas / Resumo da Rota -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.65rem; margin-bottom: 1.25rem;">
                        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 0.65rem; border-radius: 8px;">
                            <div style="font-size: 0.72rem; color: var(--text-secondary, #94a3b8); text-transform: uppercase; font-weight: 600; margin-bottom: 2px;">🏢 Saída (Origem)</div>
                            <div style="font-size: 0.85rem; font-weight: 700; color: #10b981;">
                                ${trail[0]?.timestamp ? new Date(trail[0].timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                            </div>
                            <div style="font-size: 0.72rem; color: var(--text-secondary, #94a3b8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${trail[0]?.location || 'Galpão / CD'}</div>
                        </div>

                        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 0.65rem; border-radius: 8px;">
                            <div style="font-size: 0.72rem; color: var(--text-secondary, #94a3b8); text-transform: uppercase; font-weight: 600; margin-bottom: 2px;">📍 Passagens</div>
                            <div style="font-size: 0.85rem; font-weight: 700; color: #38bdf8;">
                                ${waypointsCount} ponto(s)
                            </div>
                            <div style="font-size: 0.72rem; color: var(--text-secondary, #94a3b8);">registrado(s) na rota</div>
                        </div>

                        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 0.65rem; border-radius: 8px;">
                            <div style="font-size: 0.72rem; color: var(--text-secondary, #94a3b8); text-transform: uppercase; font-weight: 600; margin-bottom: 2px;">🏁 Destino</div>
                            <div style="font-size: 0.85rem; font-weight: 700; color: ${isCompleted ? '#10b981' : '#f59e0b'};">
                                ${dispatch.city || '-'}
                            </div>
                            <div style="font-size: 0.72rem; color: var(--text-secondary, #94a3b8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${dispatch.neighborhood || 'Bairro'}</div>
                        </div>

                        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 0.65rem; border-radius: 8px;">
                            <div style="font-size: 0.72rem; color: var(--text-secondary, #94a3b8); text-transform: uppercase; font-weight: 600; margin-bottom: 2px;">⏱️ Tempo Total</div>
                            <div style="font-size: 0.85rem; font-weight: 700; color: #a78bfa;">
                                ${durationText}
                            </div>
                            <div style="font-size: 0.72rem; color: var(--text-secondary, #94a3b8);">${isCompleted ? 'Até a entrega final' : 'Em andamento'}</div>
                        </div>
                    </div>

                    <!-- Mapa Interativo de Rastreamento (Leaflet / OSM) -->
                    <div style="margin-bottom: 1.25rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
                            <label style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary, #f1f5f9); display: flex; align-items: center; gap: 0.35rem;">
                                <span class="material-icons-round" style="font-size: 1rem; color: #38bdf8;">map</span>
                                Mapa Interativo da Rota (Origem ➔ Passagens ➔ Destino)
                            </label>
                            <span style="font-size: 0.72rem; color: var(--text-secondary, #94a3b8);">Georreferenciamento auditável</span>
                        </div>
                        <div id="trackingTrailMap" style="width: 100%; height: 290px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: #0f172a; position: relative;">
                            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #94a3b8; font-size: 0.85rem; display: flex; align-items: center; gap: 0.5rem;">
                                <span class="material-icons-round" style="animation: spin 1s infinite linear;">refresh</span> Carregando mapa georreferenciado...
                            </div>
                        </div>
                    </div>

                    <!-- Ação em tempo real: Gravação de Ponto de Passagem (GPS) -->
                    ${!isCompleted ? `
                        <div style="background: rgba(56, 189, 248, 0.05); border: 1px dashed rgba(56, 189, 248, 0.3); border-radius: 10px; padding: 0.85rem; margin-bottom: 1.25rem;">
                            <div style="font-size: 0.82rem; font-weight: 700; color: #38bdf8; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.35rem;">
                                <span class="material-icons-round" style="font-size: 1.1rem;">add_location_alt</span>
                                Registrar Ponto de Passagem Agora (GPS em Tempo Real)
                            </div>
                            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                                <input type="text" id="trailCustomObs" class="form-input" placeholder="Referência / Parada (ex: Posto Marajó, Travessia, BR-316)" style="flex: 2; min-width: 220px; font-size: 0.82rem; padding: 0.45rem 0.65rem; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #fff;">
                                <button type="button" id="btnRecordWaypoint" onclick="DeliveryModule.recordLiveWaypoint(${dispatch.id})" class="btn" style="flex: 1; min-width: 170px; justify-content: center; background: #0284c7; color: white; font-weight: 600; font-size: 0.82rem; padding: 0.45rem 0.75rem; border-radius: 6px; display: inline-flex; align-items: center; gap: 0.35rem; cursor: pointer;">
                                    <span class="material-icons-round" style="font-size: 1rem;">my_location</span> Gravar Ponto GPS
                                </button>
                            </div>
                            <div id="trailLiveGpsStatus" style="font-size: 0.72rem; color: var(--text-secondary, #94a3b8); margin-top: 0.4rem;">
                                📍 Captura a coordenada exata de onde o condutor está no momento e anexa ao trajeto.
                            </div>
                        </div>
                    ` : ''}

                    <!-- Linha do Tempo Auditável (Passo a Passo da Rota) -->
                    <div style="margin-bottom: 1rem;">
                        <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-primary, #f1f5f9); margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.35rem;">
                            <span class="material-icons-round" style="font-size: 1rem; color: #10b981;">history_edu</span>
                            Histórico Auditável do Trajeto percorrido
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 0; padding-left: 0.5rem;">
                            ${trail.map((point, idx) => {
                                const isFirst = idx === 0;
                                const isLast = idx === trail.length - 1;
                                
                                let dotColor = '#38bdf8';
                                let iconName = 'location_on';
                                if (point.type === 'origem') {
                                    dotColor = '#10b981';
                                    iconName = 'warehouse';
                                } else if (point.type === 'destino') {
                                    dotColor = isCompleted ? '#10b981' : '#f59e0b';
                                    iconName = isCompleted ? 'task_alt' : 'flag';
                                }

                                const dateStr = point.timestamp ? new Date(point.timestamp).toLocaleString('pt-BR') : 'Pendente';
                                const coordsText = (point.lat && point.lng) ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` : null;

                                return `
                                    <div style="display: flex; gap: 0.85rem; position: relative;">
                                        <!-- Vertical line connector -->
                                        ${!isLast ? `
                                            <div style="position: absolute; left: 15px; top: 32px; bottom: -8px; width: 2px; background: rgba(255,255,255,0.12);"></div>
                                        ` : ''}

                                        <!-- Step Icon Dot -->
                                        <div style="width: 32px; height: 32px; border-radius: 50%; background: ${dotColor}25; border: 2px solid ${dotColor}; display: flex; align-items: center; justify-content: center; z-index: 1; flex-shrink: 0; margin-top: 2px;">
                                            <span class="material-icons-round" style="font-size: 1rem; color: ${dotColor};">${iconName}</span>
                                        </div>

                                        <!-- Content Card -->
                                        <div style="flex: 1; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 0.65rem 0.85rem; margin-bottom: 0.75rem;">
                                            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.25rem;">
                                                <div style="font-size: 0.85rem; font-weight: 700; color: ${dotColor};">
                                                    Passo ${point.step || (idx + 1)}: ${point.title || point.label || 'Ponto de Rota'}
                                                </div>
                                                <div style="font-size: 0.74rem; color: var(--text-secondary, #94a3b8); font-weight: 500;">
                                                    🕒 ${dateStr}
                                                </div>
                                            </div>

                                            <div style="font-size: 0.82rem; color: var(--text-primary, #f1f5f9); margin-top: 0.25rem;">
                                                <strong>Local:</strong> ${point.location || point.address || '-'}
                                            </div>

                                            ${point.address && point.address !== point.location ? `
                                                <div style="font-size: 0.76rem; color: var(--text-secondary, #94a3b8); margin-top: 0.15rem;">
                                                    📍 ${point.address}
                                                </div>
                                            ` : ''}

                                            ${coordsText ? `
                                                <div style="margin-top: 0.35rem; display: inline-flex; align-items: center; gap: 0.3rem; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.25); padding: 2px 7px; border-radius: 4px; font-size: 0.72rem; color: #38bdf8;">
                                                    <span class="material-icons-round" style="font-size: 0.85rem;">pin_drop</span>
                                                    GPS: ${coordsText} ${point.accuracy ? `(±${point.accuracy}m)` : ''}
                                                </div>
                                            ` : ''}

                                            ${point.receiver ? `
                                                <div style="margin-top: 0.35rem; font-size: 0.78rem; color: #10b981; font-weight: 600;">
                                                    👤 Recebido por: ${point.receiver} ${point.doc ? `(Doc: ${point.doc})` : ''}
                                                </div>
                                            ` : ''}

                                            ${point.obs ? `
                                                <div style="margin-top: 0.35rem; font-size: 0.76rem; color: #f59e0b; background: rgba(245, 158, 11, 0.08); padding: 3px 6px; border-radius: 4px; border-left: 2px solid #f59e0b;">
                                                    📝 <strong>Obs:</strong> ${point.obs}
                                                </div>
                                            ` : ''}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>

                    <!-- Footer -->
                    <div style="display: flex; justify-content: flex-end; gap: 0.5rem; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 0.85rem;">
                        ${hasPOD ? `
                            <button type="button" onclick="DeliveryModule.showPODModal(${dispatch.id})" class="btn" style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); font-size: 0.82rem; padding: 0.45rem 0.85rem; border-radius: 6px; display: inline-flex; align-items: center; gap: 0.3rem;">
                                <span class="material-icons-round" style="font-size: 1rem;">receipt_long</span> Ver Comprovante (POD)
                            </button>
                        ` : ''}
                        <button type="button" onclick="document.getElementById('trackingTrailModal').remove()" class="btn btn-secondary" style="font-size: 0.82rem; padding: 0.45rem 1.25rem;">
                            Fechar
                        </button>
                    </div>

                </div>
            </div>
        `;

        const existing = document.getElementById('trackingTrailModal');
        if (existing) existing.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Inicializar mapa após renderização no DOM
        setTimeout(() => {
            this.initTrackingMap(dispatch, trail);
        }, 150);
    },

    /**
     * Inicializa o mapa com Leaflet e renderiza a rota Origem ➔ Passagens ➔ Destino
     */
    initTrackingMap(dispatch, trail) {
        const mapContainer = document.getElementById('trackingTrailMap');
        if (!mapContainer) return;

        // Se Leaflet não estiver disponível, renderiza fallback visual diagramático
        if (typeof L === 'undefined') {
            mapContainer.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary, #94a3b8); padding: 1.5rem; text-align: center;">
                    <span class="material-icons-round" style="font-size: 2.5rem; color: #38bdf8; margin-bottom: 0.5rem;">alt_route</span>
                    <strong style="color: #f1f5f9; font-size: 0.9rem;">Trilha de Rota Registrada</strong>
                    <div style="font-size: 0.78rem; margin-top: 0.25rem;">Origem (${trail[0]?.location || 'Base'}) ➔ ${trail.length - 2 > 0 ? (trail.length - 2) + ' Parada(s) ➔ ' : ''} Destino (${dispatch.neighborhood || dispatch.city || 'Cliente'})</div>
                    <div style="font-size: 0.72rem; color: #64748b; margin-top: 0.4rem;">Coordenadas e timestamps gravados no histórico auditável abaixo.</div>
                </div>
            `;
            return;
        }

        // Limpa conteúdo prévio
        mapContainer.innerHTML = '';

        // Cria o mapa Leaflet
        try {
            // Coleta pontos com coordenadas válidas
            const geoPoints = [];
            trail.forEach(t => {
                if (typeof t.lat === 'number' && typeof t.lng === 'number' && !isNaN(t.lat) && !isNaN(t.lng)) {
                    geoPoints.push({
                        lat: t.lat,
                        lng: t.lng,
                        title: t.title || t.location,
                        type: t.type,
                        step: t.step,
                        time: t.timestamp ? new Date(t.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
                        obs: t.obs || t.address || ''
                    });
                }
            });

            // Se não houver coordenadas explícitas, define pontos padrão representativos baseados na origem
            let center = [-1.3653, -48.3745]; // Belém / Região Metropolitana (Base LT Distribuidora)
            let zoom = 12;

            if (geoPoints.length > 0) {
                center = [geoPoints[0].lat, geoPoints[0].lng];
            }

            const map = L.map(mapContainer, {
                center: center,
                zoom: zoom,
                zoomControl: true,
                attributionControl: false
            });

            // Tile layer elegante estilo voyager / carto
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                maxZoom: 19,
                subdomains: 'abcd'
            }).addTo(map);

            // Adiciona marcadores e linhas se houver pontos
            if (geoPoints.length > 0) {
                const latLngs = [];

                geoPoints.forEach((pt, index) => {
                    latLngs.push([pt.lat, pt.lng]);

                    let pinBg = '#0284c7';
                    let pinSymbol = `${pt.step || (index + 1)}`;
                    if (pt.type === 'origem') {
                        pinBg = '#10b981';
                        pinSymbol = 'A';
                    } else if (pt.type === 'destino') {
                        pinBg = '#e11d48';
                        pinSymbol = 'B';
                    }

                    const customIcon = L.divIcon({
                        className: 'custom-trail-pin',
                        html: `
                            <div style="background: ${pinBg}; color: white; width: 28px; height: 28px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0,0,0,0.4); border: 2px solid #ffffff;">
                                <span style="transform: rotate(45deg); font-size: 11px; font-weight: 700; font-family: sans-serif;">${pinSymbol}</span>
                            </div>
                        `,
                        iconSize: [28, 28],
                        iconAnchor: [14, 28],
                        popupAnchor: [0, -28]
                    });

                    const marker = L.marker([pt.lat, pt.lng], { icon: customIcon }).addTo(map);
                    marker.bindPopup(`
                        <div style="font-family: sans-serif; font-size: 12px; color: #1e293b; line-height: 1.4;">
                            <strong style="color: ${pinBg}; font-size: 13px;">${pt.title}</strong><br>
                            ${pt.time ? `🕒 ${pt.time}<br>` : ''}
                            ${pt.obs ? `<span>${pt.obs}</span><br>` : ''}
                            <span style="font-size: 10px; color: #64748b;">GPS: ${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)}</span>
                        </div>
                    `);

                    if (index === geoPoints.length - 1) {
                        marker.openPopup();
                    }
                });

                // Traçado da rota conectando os pontos
                if (latLngs.length > 1) {
                    const polyline = L.polyline(latLngs, {
                        color: '#0284c7',
                        weight: 4,
                        opacity: 0.85,
                        dashArray: '6, 8',
                        lineJoin: 'round'
                    }).addTo(map);

                    map.fitBounds(polyline.getBounds(), { padding: [35, 35] });
                } else {
                    map.setView(latLngs[0], 14);
                }
            } else {
                // Mensagem informativa no mapa se pontos não tiverem GPS
                const banner = L.control({ position: 'topright' });
                banner.onAdd = function() {
                    const div = L.DomUtil.create('div', 'trail-info-banner');
                    div.style.background = 'rgba(15, 23, 42, 0.85)';
                    div.style.color = '#38bdf8';
                    div.style.padding = '6px 12px';
                    div.style.borderRadius = '6px';
                    div.style.fontSize = '11px';
                    div.style.border = '1px solid rgba(56, 189, 248, 0.4)';
                    div.innerHTML = '📍 Origem registrada na Base. Clique em "Gravar Ponto GPS" para capturar paradas.';
                    return div;
                };
                banner.addTo(map);
            }

            // Invalidação de tamanho essencial para modals
            setTimeout(() => {
                map.invalidateSize();
            }, 200);

        } catch (err) {
            console.warn('[TrackingMap] Erro ao instanciar Leaflet map:', err);
            mapContainer.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:center; height:100%; color:#94a3b8; font-size:0.85rem;">
                    Trilha de rota georreferenciada gravada com sucesso.
                </div>
            `;
        }
    },

    /**
     * Grava um novo Ponto de Passagem em tempo real utilizando a Geolocation nativa
     */
    recordLiveWaypoint(dispatchId) {
        const btn = document.getElementById('btnRecordWaypoint');
        const statusEl = document.getElementById('trailLiveGpsStatus');
        const customObsInput = document.getElementById('trailCustomObs');
        const customObs = (customObsInput?.value || '').trim();

        if (!navigator.geolocation) {
            alert('Geolocalização não é suportada neste dispositivo / navegador.');
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="material-icons-round" style="font-size:1rem; animation:spin 1s infinite linear;">refresh</span> Gravando...';
        }
        if (statusEl) {
            statusEl.innerHTML = '<span style="color:#f59e0b;">⏳ Obtendo coordenadas de satélite de alta precisão...</span>';
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude, accuracy } = pos.coords;
                const nowIso = new Date().toISOString();

                const dispatches = Utils.getStorage('dispatches') || [];
                const idx = dispatches.findIndex(d => d.id === dispatchId);

                if (idx === -1) {
                    alert('Despacho não encontrado no armazenamento local.');
                    if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-icons-round" style="font-size:1rem;">my_location</span> Gravar Ponto GPS'; }
                    return;
                }

                const dispatch = dispatches[idx];
                const trail = this.getDispatchTrail(dispatch);

                const newPoint = {
                    step: trail.length,
                    type: 'passagem',
                    title: 'Ponto de Passagem Registrado',
                    location: customObs || 'Parada / Passagem em Rota',
                    address: `Posição GPS: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
                    timestamp: nowIso,
                    driver: dispatch.deliveryPerson || dispatch.driverName || 'Entregador',
                    status: 'Em Trânsito',
                    lat: latitude,
                    lng: longitude,
                    accuracy: Math.round(accuracy),
                    obs: customObs || 'Ponto de passagem registrado pelo condutor.'
                };

                // Insere antes do ponto final (Destino) se ele já existir
                const destIndex = trail.findIndex(t => t.type === 'destino');
                if (destIndex >= 0) {
                    trail.splice(destIndex, 0, newPoint);
                } else {
                    trail.push(newPoint);
                }

                // Reindexa steps
                trail.forEach((item, i) => { item.step = i + 1; });
                dispatch.trackingTrail = trail;

                // Salva
                Utils.saveRaw('dispatches', JSON.stringify(dispatches));

                // Sincroniza dispatches_db
                if (window.db && Utils.Cloud && Utils.Cloud.hasTenant()) {
                    window.db.collection('tenants').doc(Utils.Cloud.tenantId)
                        .collection('dispatches_db').doc(String(dispatchId))
                        .set(dispatch, { merge: true }).catch(e => console.warn(e));
                }

                this.addDeliveryLog({
                    type: dispatch.deliveryType,
                    action: 'waypoint_gps',
                    dispatchId: dispatchId,
                    invoice: dispatch.invoice,
                    lat: latitude,
                    lng: longitude,
                    accuracy: Math.round(accuracy),
                    obs: customObs,
                    timestamp: nowIso
                });

                showToast(`📍 Ponto de passagem registrado com precisão de ±${Math.round(accuracy)}m!`);

                // Reabre / atualiza o modal
                this.showTrackingModal(dispatchId);
            },
            (err) => {
                console.warn('[GPS Waypoint] Erro ao obter posição:', err);
                let msg = 'Não foi possível obter a localização.';
                if (err.code === 1) msg = 'Permissão de localização negada pelo usuário.';
                else if (err.code === 2) msg = 'Posição indisponível (sem sinal GPS).';
                else if (err.code === 3) msg = 'Tempo limite de busca do GPS esgotado.';

                if (statusEl) {
                    statusEl.innerHTML = `<span style="color:#ef4444;">⚠️ ${msg}</span>`;
                }
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<span class="material-icons-round" style="font-size:1rem;">my_location</span> Tentar Novamente';
                }
                alert(msg + '\n\nCertifique-se de autorizar a localização no navegador.');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    },

    /**
     * Estatísticas de entregas
     */
    getDeliveryStats(type) {
        const history = Utils.getStorage('delivery_history') || [];
        const typeHistory = history.filter(d => (d.deliveryType || '').toLowerCase() === type);

        const total = typeHistory.length;
        const entregues = typeHistory.filter(d => d.result === 'entregue').length;
        const devolvidos = typeHistory.filter(d => d.result === 'devolvido').length;

        // Pendentes atuais
        const dispatches = Utils.getStorage('dispatches') || [];
        const pendentes = dispatches.filter(d =>
            (d.deliveryType || '').toLowerCase() === type &&
            d.deliveryStatus === 'em_entrega'
        ).length;

        return {
            total,
            entregues,
            devolvidos,
            pendentes,
            taxaSucesso: total > 0 ? ((entregues / total) * 100).toFixed(1) : 0
        };
    }
};

// Expor globalmente
window.DeliveryModule = DeliveryModule;

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => DeliveryModule.init(), 500);
});

console.log('✅ Delivery Module loaded');
