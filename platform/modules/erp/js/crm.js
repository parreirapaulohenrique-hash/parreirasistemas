// ===========================================
// ERP - CRM GESTÃO DE RELACIONAMENTO
// ===========================================

const STORAGE_KEY_CRM_OPP = 'erp_crm_oportunidades';

// ─── INIT E RENDERIZAÇÃO ────────
window.renderCrm = function () {
    const opps = JSON.parse(localStorage.getItem(STORAGE_KEY_CRM_OPP + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '[]');

    // Sort by Data Fechamento (Proxima de fechar primeiro)
    opps.sort((a, b) => new Date(a.dataFechamento || '2099-01-01') - new Date(b.dataFechamento || '2099-01-01'));

    const fases = [
        { id: 'Prospecção', title: 'Prospecção', cor: 'var(--accent-primary)' },
        { id: 'Qualificação', title: 'Qualificação', cor: 'var(--accent-warning)' },
        { id: 'Proposta', title: 'Proposta', cor: '#9c27b0' },
        { id: 'Negociação', title: 'Negociação', cor: '#ff9800' },
        { id: 'Ganho', title: 'Ganho', cor: 'var(--accent-success)' }
    ];

    const kanbanBoard = document.getElementById('kanbanBoard');
    if (!kanbanBoard) return;

    kanbanBoard.innerHTML = fases.map(fase => {
        const oppsFase = opps.filter(o => o.fase === fase.id);
        const totalFase = oppsFase.reduce((acc, o) => acc + (parseFloat(o.valor) || 0), 0);

        return `
            <div class="kanban-column" style="flex:1; min-width:250px; background:var(--bg-card); border-radius:var(--radius-md); border:1px solid var(--border-color); display:flex; flex-direction:column;"
                 ondrop="dropCrm(event, '${fase.id}')" ondragover="allowDropCrm(event)">
                
                <div class="kanban-header" style="padding:1rem; border-bottom:3px solid ${fase.cor}; font-weight:600; display:flex; justify-content:space-between; align-items:center;">
                    <span>${fase.title} <small style="color:var(--text-secondary);">(${oppsFase.length})</small></span>
                    <span style="font-size:0.875rem;">${totalFase.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                </div>
                
                <div class="kanban-body" style="padding:0.5rem; flex:1; min-height:200px; display:flex; flex-direction:column; gap:0.5rem; overflow-y:auto;">
                    ${oppsFase.map(o => `
                        <div class="kanban-card card" draggable="true" ondragstart="dragCrm(event, '${o.id}')" onclick="editOportunidade('${o.id}')"
                             style="cursor:pointer; padding:0.75rem; border-left:4px solid ${fase.cor}; background:var(--bg-body); box-shadow:0 1px 3px rgba(0,0,0,0.1);">
                            
                            <div style="font-weight:600; font-size:0.9rem; margin-bottom:0.25rem;">${o.titulo}</div>
                            <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.5rem;">
                                <span class="material-icons-round" style="font-size:0.9rem; vertical-align:middle;">business</span> ${o.leadNome}
                            </div>
                            
                            <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                                <div style="font-weight:700; color:${fase.cor}; font-size:0.9rem;">
                                    ${parseFloat(o.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </div>
                                <div style="font-size:0.75rem; color:var(--text-secondary);">
                                    ${o.dataFechamento ? o.dataFechamento.split('-').reverse().join('/') : 'S/ Data'}
                                </div>
                            </div>

                            ${o.proximaAcao ? `
                            <div style="margin-top:0.5rem; padding-top:0.5rem; border-top:1px dashed var(--border-color); font-size:0.75rem; color:var(--text-secondary);">
                                <strong>Lembrete:</strong> ${o.proximaAcao}
                            </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
};

// ─── DRAG AND DROP ────────
window.allowDropCrm = function (ev) {
    ev.preventDefault();
};

window.dragCrm = function (ev, oppId) {
    ev.dataTransfer.setData("text/plain", oppId);
};

window.dropCrm = function (ev, novaFase) {
    ev.preventDefault();
    const oppId = ev.dataTransfer.getData("text/plain");
    if (oppId) {
        window.moveOportunidade(oppId, novaFase);
    }
};

// ─── CRUD OPORTUNIDADE ────────
window.newOportunidade = function () {
    document.getElementById('formCrm').reset();
    document.getElementById('crmId').value = '';

    // Auto-preencher data de fechamento para d+30
    const d30 = new Date();
    d30.setDate(d30.getDate() + 30);
    document.getElementById('crmDataFechamento').value = d30.toISOString().slice(0, 10);

    openModal('crmOportunidadeModal');
};

window.editOportunidade = function (id) {
    const opps = JSON.parse(localStorage.getItem(STORAGE_KEY_CRM_OPP + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '[]');
    const opp = opps.find(o => o.id === id);
    if (!opp) return;

    document.getElementById('crmId').value = opp.id;
    document.getElementById('crmTitulo').value = opp.titulo || '';
    document.getElementById('crmLeadNome').value = opp.leadNome || '';
    document.getElementById('crmContato').value = opp.contato || '';
    document.getElementById('crmTelefone').value = opp.telefone || '';
    document.getElementById('crmEmail').value = opp.email || '';
    document.getElementById('crmValor').value = parseFloat(opp.valor || 0).toFixed(2);
    document.getElementById('crmDataFechamento').value = opp.dataFechamento || '';
    document.getElementById('crmFase').value = opp.fase || 'Prospecção';
    document.getElementById('crmProximaAcao').value = opp.proximaAcao || '';
    document.getElementById('crmAnotacoes').value = opp.anotacoes || '';

    openModal('crmOportunidadeModal');
};

window.saveOportunidade = function () {
    const id = document.getElementById('crmId').value;
    const opps = JSON.parse(localStorage.getItem(STORAGE_KEY_CRM_OPP + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '[]');

    const titulo = document.getElementById('crmTitulo').value.trim();
    const fase = document.getElementById('crmFase').value;

    if (!titulo) {
        alert("O Título da oportunidade é obrigatório.");
        return;
    }

    const opp = {
        id: id || 'crm_' + Date.now(),
        titulo: titulo,
        leadNome: document.getElementById('crmLeadNome').value.trim() || 'Lead ' + Date.now(),
        contato: document.getElementById('crmContato').value.trim(),
        telefone: document.getElementById('crmTelefone').value.trim(),
        email: document.getElementById('crmEmail').value.trim(),
        valor: parseFloat(document.getElementById('crmValor').value) || 0,
        dataFechamento: document.getElementById('crmDataFechamento').value,
        fase: fase,
        proximaAcao: document.getElementById('crmProximaAcao').value.trim(),
        anotacoes: document.getElementById('crmAnotacoes').value.trim(),
        updatedAt: new Date().toISOString()
    };

    const isNew = !id;
    let oldFase = null;

    if (id) {
        const index = opps.findIndex(o => o.id === id);
        if (index > -1) {
            oldFase = opps[index].fase;
            opp.createdAt = opps[index].createdAt;
            opps[index] = opp;
        }
    } else {
        opp.createdAt = new Date().toISOString();
        opps.push(opp);
    }

    localStorage.setItem(STORAGE_KEY_CRM_OPP + (window.getTenantSuffix ? window.getTenantSuffix() : ''), JSON.stringify(opps));

    // Check conversion
    if ((isNew && fase === 'Ganho') || (!isNew && fase === 'Ganho' && oldFase !== 'Ganho')) {
        handleCrmConversao(opp);
    }

    closeModal('crmOportunidadeModal');
    renderCrm();
};

window.moveOportunidade = function (id, novaFase) {
    const opps = JSON.parse(localStorage.getItem(STORAGE_KEY_CRM_OPP + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '[]');
    const opp = opps.find(o => o.id === id);
    if (!opp) return;

    const oldFase = opp.fase;

    // Previne loops se for a mesma fase
    if (oldFase === novaFase) return;

    opp.fase = novaFase;
    opp.updatedAt = new Date().toISOString();

    localStorage.setItem(STORAGE_KEY_CRM_OPP + (window.getTenantSuffix ? window.getTenantSuffix() : ''), JSON.stringify(opps));

    renderCrm(); // Render imediato p/ UI

    // Se mudou pra ganho, converter em pedido no ERP
    if (novaFase === 'Ganho') {
        setTimeout(() => handleCrmConversao(opp), 100);
    }
};

// ─── CONVERSÃO CRM -> VENDAS (ERP) ────────
window.handleCrmConversao = function (opp) {
    console.log("Convertendo Oportunidade Ganhada:", opp);

    // 1. Criar Cliente se não existir
    const clientesKey = 'erp_clientes' + (window.getTenantSuffix ? window.getTenantSuffix() : '');
    const crmClientes = JSON.parse(localStorage.getItem(clientesKey) || '[]');

    let cliente = crmClientes.find(c => c.razaoSocial.toUpperCase() === opp.leadNome.toUpperCase() || (c.nome && c.nome.toUpperCase() === opp.leadNome.toUpperCase()));

    if (!cliente) {
        cliente = {
            id: 'cli_' + Date.now(),
            codigo: 'CLI' + Math.floor(Math.random() * 10000),
            razaoSocial: opp.leadNome,
            nomeFantasia: opp.leadNome,
            cnpjCpf: '',
            telefone: opp.telefone,
            email: opp.email,
            contato: opp.contato,
            createdAt: new Date().toISOString()
        };
        crmClientes.push(cliente);
        localStorage.setItem(clientesKey, JSON.stringify(crmClientes));
        console.log("🚀 CRM: Novo cliente cadastrado no ERP:", cliente.razaoSocial);
    }

    // 2. Gerar Pedido de Venda/Orçamento
    const vendasKey = 'erp_vendas' + (window.getTenantSuffix ? window.getTenantSuffix() : '');
    const crmVendas = JSON.parse(localStorage.getItem(vendasKey) || '[]');

    const novoPedido = {
        id: 'crm_ped_' + Date.now(),
        numero: Math.floor(100000 + Math.random() * 900000).toString(),
        data: new Date().toISOString().slice(0, 10),
        status: 'orcamento', // Começa como orçamento para revisão
        origem: 'CRM',

        cliente: {
            codigo: cliente.codigo,
            razaoSocial: cliente.razaoSocial,
            cnpjCpf: cliente.cnpjCpf || ''
        },

        totais: {
            subtotal: parseFloat(opp.valor),
            desconto: 0,
            totalNF: parseFloat(opp.valor)
        },
        itens: [{
            seq: 1,
            sku: 'SRV-CRM',
            descricao: `Contrato/Serviço: ${opp.titulo}`,
            quantidade: 1,
            valorUnitario: parseFloat(opp.valor),
            valorTotal: parseFloat(opp.valor)
        }],
        observacao: `Gerado automaticamente via Funil CRM. \nContato: ${opp.contato} \nAnotações: ${opp.anotacoes}`,

        createdAt: new Date().toISOString()
    };

    crmVendas.push(novoPedido);
    localStorage.setItem(vendasKey, JSON.stringify(crmVendas));

    console.log("🚀 CRM: Oportunidade convertida em Orçamento. Pedido Número:", novoPedido.numero);

    // Dispara alerta customizado
    alert(`🎉 Oportunidade "${opp.titulo}" Ganha!\n\nFoi gerado um novo Orçamento (Nº ${novoPedido.numero}) no módulo de Vendas com o valor de R$ ${parseFloat(opp.valor).toLocaleString('pt-BR')}.`);
};

// ─── HOOK DE RENDERIZAÇÃO ────────
window._viewHooks = window._viewHooks || [];
window._viewHooks.push(function (viewName) {
    if (viewName === 'crmFunil') {
        renderCrm();
    }
});

console.log('📈 Módulo de CRM inicializado');
