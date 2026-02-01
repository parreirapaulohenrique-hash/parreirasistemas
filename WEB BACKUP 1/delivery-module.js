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
     * Finaliza uma entrega com sucesso
     */
    finalizeDelivery(dispatchId) {
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

        Utils.saveRaw('dispatches', JSON.stringify(dispatches));

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
            timestamp: new Date().toISOString()
        });

        showToast(`✅ Entrega da NF ${dispatch.invoice} finalizada com sucesso!`);

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
                    <div style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 12px 16px; border-radius: 12px 12px 0 0; font-weight: 700; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center;">
                        <span>🏍️ ${person}</span>
                        <span style="background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 20px; font-size: 0.9rem;">${items.length} entrega(s)</span>
                    </div>
                    <div style="border: 1px solid var(--border-color); border-top: none; border-radius: 0 0 12px 12px; padding: 10px; background: var(--bg-secondary);">
                        ${items.map(d => this.createDeliveryCard(d, 'moto')).join('')}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
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
                    <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 12px 16px; border-radius: 12px 12px 0 0; font-weight: 700; font-size: 1.1rem; display: flex; justify-content: space-between; align-items: center;">
                        <span>🚗 ${person}</span>
                        <span style="background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 20px; font-size: 0.9rem;">${items.length} entrega(s)</span>
                    </div>
                    <div style="border: 1px solid var(--border-color); border-top: none; border-radius: 0 0 12px 12px; padding: 10px; background: var(--bg-secondary);">
                        ${items.map(d => this.createDeliveryCard(d, 'carro')).join('')}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    },

    /**
     * Cria HTML de um card de entrega
     */
    createDeliveryCard(dispatch, type) {
        const dispatchedTime = dispatch.deliveryDispatchedAt ?
            new Date(dispatch.deliveryDispatchedAt).toLocaleString('pt-BR') : '-';

        const icon = type === 'moto' ? 'two_wheeler' : 'directions_car';
        const color = type === 'moto' ? '#f59e0b' : '#10b981';

        return `
            <div class="delivery-card" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 1rem; margin-bottom: 1rem; border-left: 4px solid ${color};">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                    <div>
                        <div style="font-size: 1.25rem; font-weight: 700; color: ${color};">NF ${dispatch.invoice}</div>
                        <div style="font-size: 0.9rem; color: var(--text-primary); margin-top: 0.25rem;">${dispatch.client}</div>
                    </div>
                    <span class="material-icons-round" style="font-size: 2rem; color: ${color}; opacity: 0.5;">${icon}</span>
                </div>
                
                <div style="display: grid; gap: 0.5rem; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 1rem;">
                    <div><strong>Cidade:</strong> ${dispatch.city || '-'}</div>
                    <div><strong>Bairro:</strong> ${dispatch.neighborhood || '-'}</div>
                    <div><strong>Entregador:</strong> ${dispatch.deliveryPerson || '-'}</div>
                    <div><strong>Despachado:</strong> ${dispatchedTime}</div>
                    <div><strong>Valor:</strong> ${Utils.formatCurrency ? Utils.formatCurrency(dispatch.value) : 'R$ ' + dispatch.value}</div>
                </div>
                
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    <button onclick="DeliveryModule.showFinalizeModal(${dispatch.id})" class="btn btn-primary" style="flex: 1; justify-content: center;">
                        <span class="material-icons-round" style="font-size: 1rem;">check_circle</span>
                        Finalizar Entrega
                    </button>
                    <button onclick="DeliveryModule.showReturnModal(${dispatch.id})" class="btn btn-secondary" style="flex: 1; justify-content: center; background: var(--accent-warning);">
                        <span class="material-icons-round" style="font-size: 1rem;">undo</span>
                        Devolução
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Modal para finalizar entrega
     */
    showFinalizeModal(dispatchId) {
        const dispatches = Utils.getStorage('dispatches') || [];
        const dispatch = dispatches.find(d => d.id === dispatchId);

        if (!dispatch) return;

        if (confirm(`Confirmar entrega da NF ${dispatch.invoice} para o cliente ${dispatch.client}?`)) {
            this.finalizeDelivery(dispatchId);
        }
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
