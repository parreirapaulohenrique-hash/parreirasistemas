// ===========================================
// Parreira ERP - Módulo Financeiro & Fiscal
// Plano de Contas, Cobrança, Pagamento,
// Caixas/Bancos, CFOP, ICMS, PIS/COFINS
// ===========================================

// Ensure COLLECTIONS has the missing entries
if (typeof COLLECTIONS !== 'undefined') {
    COLLECTIONS.pisCofins = COLLECTIONS.pisCofins || { name: 'PIS/COFINS', path: 'fiscal/pisCofins', fields: ['codigo', 'descricao', 'principal', 'cstPis', 'cstCofins', 'aliqPis', 'aliqCofins'] };
    COLLECTIONS.cbsIbs = COLLECTIONS.cbsIbs || { name: 'CBS/IBS', path: 'fiscal/cbsIbs', fields: ['codigo', 'descricao'] };
    COLLECTIONS.pdv = COLLECTIONS.pdv || { name: 'PDV', path: 'fiscal/pdv', fields: ['numero', 'descricao'] };
}

// ===========================================
// DYNAMIC MODAL FACTORY
// ===========================================
function createDynamicModal(id, title, bodyHTML, saveFn) {
    let existing = document.getElementById(id);
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = id;
    modal.className = 'modal-overlay';
    modal.style.cssText = 'display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000; align-items:center; justify-content:center;';
    modal.innerHTML = `
        <div class="card" style="width:100%; max-width:600px; max-height:85vh; overflow-y:auto; margin:1rem; animation:fadeIn 0.2s ease;">
            <div class="card-header" style="position:sticky; top:0; z-index:1; padding:1rem 1.5rem;">
                <h3 style="font-size:1rem; font-weight:600;">${title}</h3>
                <button class="btn btn-secondary btn-icon" onclick="closeModal('${id}')" style="padding:0.3rem;">
                    <span class="material-icons-round" style="font-size:1.2rem;">close</span>
                </button>
            </div>
            <div style="padding:1.5rem;">
                ${bodyHTML}
                <div style="display:flex; gap:0.5rem; justify-content:flex-end; margin-top:1.5rem; padding-top:1rem; border-top:1px solid var(--border-color);">
                    <button class="btn btn-secondary" onclick="closeModal('${id}')">Cancelar</button>
                    <button class="btn btn-primary" onclick="${saveFn}">
                        <span class="material-icons-round" style="font-size:1rem;">save</span> Salvar
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

function formRow(label, inputHTML) {
    return `<div style="margin-bottom:1rem;"><label class="form-label">${label}</label>${inputHTML}</div>`;
}

function formRow2(label1, input1, label2, input2) {
    return `<div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem;">
        <div><label class="form-label">${label1}</label>${input1}</div>
        <div><label class="form-label">${label2}</label>${input2}</div>
    </div>`;
}

// ===========================================
// 1. PLANO DE CONTAS
// ===========================================
window.openAccountPlanModal = function (editId) {
    const item = editId ? getCadastro('accountPlans', editId) : null;
    createDynamicModal('finPlanModal', item ? 'Editar Conta' : 'Nova Conta', `
        ${formRow2('Código *', `<input type="text" id="apCodigo" class="form-input" value="${item?.codigo || ''}" placeholder="Ex: 1.1.01">`,
        'Tipo', `<select id="apTipo" class="form-input"><option value="Analítica" ${item?.tipo === 'Analítica' ? 'selected' : ''}>Analítica</option><option value="Sintética" ${item?.tipo === 'Sintética' ? 'selected' : ''}>Sintética</option></select>`)}
        ${formRow('Conta *', `<input type="text" id="apConta" class="form-input" value="${item?.conta || ''}" placeholder="Nome da conta">`)}
        ${formRow('Conta Contábil', `<input type="text" id="apContaContabil" class="form-input" value="${item?.contaContabil || ''}" placeholder="Ref. contábil">`)}
        ${formRow2('Valor Orçado (R$)', `<input type="number" id="apValorOrcado" class="form-input" value="${item?.valorOrcado || ''}" step="0.01" placeholder="0,00">`,
            'Investimento?', `<select id="apInvestimento" class="form-input"><option value="Não" ${item?.investimento !== 'Sim' ? 'selected' : ''}>Não</option><option value="Sim" ${item?.investimento === 'Sim' ? 'selected' : ''}>Sim</option></select>`)}
        ${formRow('Exibir no DRE?', `<select id="apExibirDre" class="form-input"><option value="Sim" ${item?.exibirDre !== 'Não' ? 'selected' : ''}>Sim</option><option value="Não" ${item?.exibirDre === 'Não' ? 'selected' : ''}>Não</option></select>`)}
        <input type="hidden" id="apEditId" value="${editId || ''}">
    `, 'saveAccountPlan()');
};

window.saveAccountPlan = function () {
    const data = {
        codigo: document.getElementById('apCodigo').value.trim(),
        conta: document.getElementById('apConta').value.trim(),
        contaContabil: document.getElementById('apContaContabil').value.trim(),
        valorOrcado: document.getElementById('apValorOrcado').value,
        tipo: document.getElementById('apTipo').value,
        investimento: document.getElementById('apInvestimento').value,
        exibirDre: document.getElementById('apExibirDre').value
    };
    if (!data.codigo || !data.conta) { alert('Código e Conta são obrigatórios!'); return; }
    const editId = document.getElementById('apEditId').value;
    saveCadastro('accountPlans', data, editId || null);
    closeModal('finPlanModal');
    renderAccountPlansGrid();
    alert('Conta salva com sucesso!');
};

window.renderAccountPlansGrid = function () {
    const tbody = document.getElementById('accountPlansTableBody');
    if (!tbody) return;
    const items = loadCadastros('accountPlans');
    if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-secondary);"><span class="material-icons-round" style="font-size:2rem; vertical-align:middle;">account_tree</span> Nenhuma conta cadastrada</td></tr>`;
        return;
    }
    tbody.innerHTML = items.map(i => `<tr>
        <td style="font-weight:600;">${i.codigo}</td><td>${i.conta}</td><td>${i.contaContabil || '-'}</td><td>${i.tipo || '-'}</td>
        <td style="text-align:right;">
            <button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="openAccountPlanModal('${i.id}')" title="Editar"><span class="material-icons-round" style="font-size:1rem;">edit</span></button>
            <button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="deleteAccountPlan('${i.id}')" title="Excluir"><span class="material-icons-round" style="font-size:1rem; color:#ef4444;">delete</span></button>
        </td></tr>`).join('');
};

window.filterAccountPlans = function () {
    const s = document.getElementById('accountPlanSearch').value.toLowerCase();
    const items = loadCadastros('accountPlans').filter(i => (i.codigo + ' ' + i.conta + ' ' + (i.contaContabil || '')).toLowerCase().includes(s));
    const tbody = document.getElementById('accountPlansTableBody');
    tbody.innerHTML = items.map(i => `<tr><td style="font-weight:600;">${i.codigo}</td><td>${i.conta}</td><td>${i.contaContabil || '-'}</td><td>${i.tipo || '-'}</td>
        <td style="text-align:right;"><button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="openAccountPlanModal('${i.id}')"><span class="material-icons-round" style="font-size:1rem;">edit</span></button>
        <button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="deleteAccountPlan('${i.id}')"><span class="material-icons-round" style="font-size:1rem; color:#ef4444;">delete</span></button></td></tr>`).join('');
};

window.deleteAccountPlan = function (id) { if (deleteCadastro('accountPlans', id)) renderAccountPlansGrid(); };

// ===========================================
// 2. COBRANÇA
// ===========================================
window.openBillingModal = function (editId) {
    const item = editId ? getCadastro('billing', editId) : null;
    createDynamicModal('finBillingModal', item ? 'Editar Cobrança' : 'Nova Cobrança', `
        ${formRow2('Código *', `<input type="text" id="blCodigo" class="form-input" value="${item?.codigo || ''}">`,
        'Moeda', `<select id="blMoeda" class="form-input"><option value="BRL" ${item?.moeda !== 'USD' ? 'selected' : ''}>Real (BRL)</option><option value="USD" ${item?.moeda === 'USD' ? 'selected' : ''}>Dólar (USD)</option></select>`)}
        ${formRow('Descrição *', `<input type="text" id="blDescricao" class="form-input" value="${item?.descricao || ''}" placeholder="Ex: Boleto Bancário">`)}
        ${formRow2('Carência (dias)', `<input type="number" id="blCarencia" class="form-input" value="${item?.carencia || ''}" min="0">`,
            'Dias Protesto', `<input type="number" id="blDiasProtesto" class="form-input" value="${item?.diasProtesto || ''}" min="0">`)}
        ${formRow('Juros Mensal (%)', `<input type="number" id="blJuros" class="form-input" value="${item?.juros || ''}" step="0.01" min="0" placeholder="0,00">`)}
        <input type="hidden" id="blEditId" value="${editId || ''}">
    `, 'saveBilling()');
};

window.saveBilling = function () {
    const data = {
        codigo: document.getElementById('blCodigo').value.trim(),
        descricao: document.getElementById('blDescricao').value.trim(),
        moeda: document.getElementById('blMoeda').value,
        carencia: document.getElementById('blCarencia').value,
        diasProtesto: document.getElementById('blDiasProtesto').value,
        juros: document.getElementById('blJuros').value
    };
    if (!data.codigo || !data.descricao) { alert('Código e Descrição são obrigatórios!'); return; }
    const editId = document.getElementById('blEditId').value;
    saveCadastro('billing', data, editId || null);
    closeModal('finBillingModal');
    renderBillingGrid();
    alert('Cobrança salva com sucesso!');
};

window.renderBillingGrid = function () {
    const tbody = document.getElementById('billingTableBody');
    if (!tbody) return;
    const items = loadCadastros('billing');
    if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-secondary);"><span class="material-icons-round" style="font-size:2rem; vertical-align:middle;">receipt_long</span> Nenhuma cobrança cadastrada</td></tr>`;
        return;
    }
    tbody.innerHTML = items.map(i => `<tr><td style="font-weight:600;">${i.codigo}</td><td>${i.descricao}</td><td>${i.moeda || 'BRL'}</td><td>${i.juros || '0'}%</td>
        <td style="text-align:right;">
            <button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="openBillingModal('${i.id}')"><span class="material-icons-round" style="font-size:1rem;">edit</span></button>
            <button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="deleteBillingItem('${i.id}')"><span class="material-icons-round" style="font-size:1rem; color:#ef4444;">delete</span></button>
        </td></tr>`).join('');
};

window.filterBilling = function () {
    const s = document.getElementById('billingSearch').value.toLowerCase();
    const items = loadCadastros('billing').filter(i => (i.codigo + ' ' + i.descricao).toLowerCase().includes(s));
    const tbody = document.getElementById('billingTableBody');
    tbody.innerHTML = items.map(i => `<tr><td style="font-weight:600;">${i.codigo}</td><td>${i.descricao}</td><td>${i.moeda || 'BRL'}</td><td>${i.juros || '0'}%</td>
        <td style="text-align:right;"><button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="openBillingModal('${i.id}')"><span class="material-icons-round" style="font-size:1rem;">edit</span></button>
        <button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="deleteBillingItem('${i.id}')"><span class="material-icons-round" style="font-size:1rem; color:#ef4444;">delete</span></button></td></tr>`).join('');
};

window.deleteBillingItem = function (id) { if (deleteCadastro('billing', id)) renderBillingGrid(); };

// ===========================================
// 3. PLANOS DE PAGAMENTO
// ===========================================
window.openPaymentPlanModal = function (editId) {
    const item = editId ? getCadastro('paymentPlans', editId) : null;
    createDynamicModal('finPayPlanModal', item ? 'Editar Plano' : 'Novo Plano de Pagamento', `
        ${formRow2('Código *', `<input type="text" id="ppCodigo" class="form-input" value="${item?.codigo || ''}">`,
        'Tipo', `<select id="ppTipo" class="form-input"><option value="Prazo" ${item?.tipo !== 'Entrada' ? 'selected' : ''}>Prazo</option><option value="Entrada" ${item?.tipo === 'Entrada' ? 'selected' : ''}>Entrada</option><option value="Financiamento" ${item?.tipo === 'Financiamento' ? 'selected' : ''}>Financiamento</option></select>`)}
        ${formRow('Descrição do Prazo *', `<input type="text" id="ppDescricao" class="form-input" value="${item?.descricao || ''}" placeholder="Ex: 30/60/90 dias">`)}
        ${formRow2('Parcelas', `<input type="number" id="ppParcelas" class="form-input" value="${item?.parcelas || ''}" min="1">`,
            'Libera Bloqueado?', `<select id="ppLiberaBloqueado" class="form-input"><option value="Não" ${item?.liberaBloqueado !== 'Sim' ? 'selected' : ''}>Não</option><option value="Sim" ${item?.liberaBloqueado === 'Sim' ? 'selected' : ''}>Sim</option></select>`)}
        <input type="hidden" id="ppEditId" value="${editId || ''}">
    `, 'savePaymentPlan()');
};

window.savePaymentPlan = function () {
    const data = {
        codigo: document.getElementById('ppCodigo').value.trim(),
        descricao: document.getElementById('ppDescricao').value.trim(),
        parcelas: document.getElementById('ppParcelas').value,
        tipo: document.getElementById('ppTipo').value,
        liberaBloqueado: document.getElementById('ppLiberaBloqueado').value
    };
    if (!data.codigo || !data.descricao) { alert('Código e Descrição são obrigatórios!'); return; }
    const editId = document.getElementById('ppEditId').value;
    saveCadastro('paymentPlans', data, editId || null);
    closeModal('finPayPlanModal');
    renderPaymentPlansGrid();
    alert('Plano de Pagamento salvo com sucesso!');
};

window.renderPaymentPlansGrid = function () {
    const tbody = document.getElementById('paymentPlansTableBody');
    if (!tbody) return;
    const items = loadCadastros('paymentPlans');
    if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-secondary);"><span class="material-icons-round" style="font-size:2rem; vertical-align:middle;">payments</span> Nenhum plano cadastrado</td></tr>`;
        return;
    }
    tbody.innerHTML = items.map(i => `<tr><td style="font-weight:600;">${i.codigo}</td><td>${i.descricao}</td><td style="text-align:center;">${i.parcelas || '-'}</td><td>${i.tipo || '-'}</td>
        <td style="text-align:right;">
            <button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="openPaymentPlanModal('${i.id}')"><span class="material-icons-round" style="font-size:1rem;">edit</span></button>
            <button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="deletePaymentPlan('${i.id}')"><span class="material-icons-round" style="font-size:1rem; color:#ef4444;">delete</span></button>
        </td></tr>`).join('');
};

window.filterPaymentPlans = function () {
    const s = document.getElementById('paymentPlanSearch').value.toLowerCase();
    const items = loadCadastros('paymentPlans').filter(i => (i.codigo + ' ' + i.descricao).toLowerCase().includes(s));
    const tbody = document.getElementById('paymentPlansTableBody');
    tbody.innerHTML = items.map(i => `<tr><td style="font-weight:600;">${i.codigo}</td><td>${i.descricao}</td><td style="text-align:center;">${i.parcelas || '-'}</td><td>${i.tipo || '-'}</td>
        <td style="text-align:right;"><button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="openPaymentPlanModal('${i.id}')"><span class="material-icons-round" style="font-size:1rem;">edit</span></button>
        <button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="deletePaymentPlan('${i.id}')"><span class="material-icons-round" style="font-size:1rem; color:#ef4444;">delete</span></button></td></tr>`).join('');
};

window.deletePaymentPlan = function (id) { if (deleteCadastro('paymentPlans', id)) renderPaymentPlansGrid(); };

// ===========================================
// 4. CAIXAS E BANCOS
// ===========================================
window.openBankModal = function (editId) {
    const item = editId ? getCadastro('banks', editId) : null;
    createDynamicModal('finBankModal', item ? 'Editar Caixa/Banco' : 'Novo Caixa/Banco', `
        ${formRow2('Código *', `<input type="text" id="bkCodigo" class="form-input" value="${item?.codigo || ''}">`,
        'Empresa', `<select id="bkEmpresa" class="form-input"><option value="1" ${item?.empresa !== '2' ? 'selected' : ''}>1 - Matriz</option><option value="2" ${item?.empresa === '2' ? 'selected' : ''}>2 - Filial</option></select>`)}
        ${formRow('Nome *', `<input type="text" id="bkNome" class="form-input" value="${item?.nome || ''}" placeholder="Ex: Caixa Geral, Bradesco CC">`)}
        ${formRow2('Banco', `<input type="text" id="bkBanco" class="form-input" value="${item?.banco || ''}" placeholder="Ex: 237 - Bradesco">`,
            'Agência', `<input type="text" id="bkAgencia" class="form-input" value="${item?.agencia || ''}">`)}
        ${formRow2('Conta', `<input type="text" id="bkConta" class="form-input" value="${item?.conta || ''}">`,
                'Dígito', `<input type="text" id="bkDigito" class="form-input" value="${item?.digito || ''}" maxlength="2">`)}
        <input type="hidden" id="bkEditId" value="${editId || ''}">
    `, 'saveBank()');
};

window.saveBank = function () {
    const data = {
        codigo: document.getElementById('bkCodigo').value.trim(),
        empresa: document.getElementById('bkEmpresa').value,
        nome: document.getElementById('bkNome').value.trim(),
        banco: document.getElementById('bkBanco').value.trim(),
        agencia: document.getElementById('bkAgencia').value.trim(),
        conta: document.getElementById('bkConta').value.trim(),
        digito: document.getElementById('bkDigito').value.trim()
    };
    if (!data.codigo || !data.nome) { alert('Código e Nome são obrigatórios!'); return; }
    const editId = document.getElementById('bkEditId').value;
    saveCadastro('banks', data, editId || null);
    closeModal('finBankModal');
    renderBanksGrid();
    alert('Caixa/Banco salvo com sucesso!');
};

window.renderBanksGrid = function () {
    const tbody = document.getElementById('banksTableBody');
    if (!tbody) return;
    const items = loadCadastros('banks');
    if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-secondary);"><span class="material-icons-round" style="font-size:2rem; vertical-align:middle;">account_balance</span> Nenhum caixa/banco cadastrado</td></tr>`;
        return;
    }
    tbody.innerHTML = items.map(i => `<tr><td style="font-weight:600;">${i.codigo}</td><td>${i.nome}</td><td>${i.banco || '-'}</td><td>${i.agencia || '-'}</td><td>${i.conta || '-'}</td>
        <td style="text-align:right;">
            <button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="openBankModal('${i.id}')"><span class="material-icons-round" style="font-size:1rem;">edit</span></button>
            <button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="deleteBankItem('${i.id}')"><span class="material-icons-round" style="font-size:1rem; color:#ef4444;">delete</span></button>
        </td></tr>`).join('');
};

window.filterBanks = function () {
    const s = document.getElementById('bankSearch').value.toLowerCase();
    const items = loadCadastros('banks').filter(i => (i.codigo + ' ' + i.nome + ' ' + (i.banco || '')).toLowerCase().includes(s));
    const tbody = document.getElementById('banksTableBody');
    tbody.innerHTML = items.map(i => `<tr><td style="font-weight:600;">${i.codigo}</td><td>${i.nome}</td><td>${i.banco || '-'}</td><td>${i.agencia || '-'}</td><td>${i.conta || '-'}</td>
        <td style="text-align:right;"><button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="openBankModal('${i.id}')"><span class="material-icons-round" style="font-size:1rem;">edit</span></button>
        <button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="deleteBankItem('${i.id}')"><span class="material-icons-round" style="font-size:1rem; color:#ef4444;">delete</span></button></td></tr>`).join('');
};

window.deleteBankItem = function (id) { if (deleteCadastro('banks', id)) renderBanksGrid(); };

// ===========================================
// 5. CFOP
// ===========================================
window.openCfopModal = function (editId) {
    const item = editId ? getCadastro('cfop', editId) : null;
    createDynamicModal('fisCfopModal', item ? 'Editar CFOP' : 'Novo CFOP', `
        ${formRow('Código Fiscal *', `<input type="text" id="cfCodigo" class="form-input" value="${item?.codigo || ''}" placeholder="Ex: 5102" maxlength="4">`)}
        ${formRow('Descrição da Operação *', `<input type="text" id="cfDescricao" class="form-input" value="${item?.descricao || ''}" placeholder="Venda de mercadoria adquirida...">`)}
        ${formRow('Observação / Natureza', `<textarea id="cfObservacao" class="form-input" rows="3" style="resize:vertical;">${item?.observacao || ''}</textarea>`)}
        <input type="hidden" id="cfEditId" value="${editId || ''}">
    `, 'saveCfopItem()');
};

window.saveCfopItem = function () {
    const data = {
        codigo: document.getElementById('cfCodigo').value.trim(),
        descricao: document.getElementById('cfDescricao').value.trim(),
        observacao: document.getElementById('cfObservacao').value.trim()
    };
    if (!data.codigo || !data.descricao) { alert('Código e Descrição são obrigatórios!'); return; }
    const editId = document.getElementById('cfEditId').value;
    saveCadastro('cfop', data, editId || null);
    closeModal('fisCfopModal');
    renderCfopGrid();
    alert('CFOP salvo com sucesso!');
};

window.renderCfopGrid = function () {
    const tbody = document.getElementById('cfopTableBody');
    if (!tbody) return;
    const items = loadCadastros('cfop');
    if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:2rem; color:var(--text-secondary);"><span class="material-icons-round" style="font-size:2rem; vertical-align:middle;">description</span> Nenhum CFOP cadastrado</td></tr>`;
        return;
    }
    tbody.innerHTML = items.map(i => `<tr><td style="font-weight:600; font-family:monospace;">${i.codigo}</td><td>${i.descricao}</td>
        <td style="text-align:right;">
            <button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="openCfopModal('${i.id}')"><span class="material-icons-round" style="font-size:1rem;">edit</span></button>
            <button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="deleteCfopItem('${i.id}')"><span class="material-icons-round" style="font-size:1rem; color:#ef4444;">delete</span></button>
        </td></tr>`).join('');
};

window.filterCfop = function () {
    const s = document.getElementById('cfopSearch').value.toLowerCase();
    const items = loadCadastros('cfop').filter(i => (i.codigo + ' ' + i.descricao).toLowerCase().includes(s));
    const tbody = document.getElementById('cfopTableBody');
    tbody.innerHTML = items.map(i => `<tr><td style="font-weight:600; font-family:monospace;">${i.codigo}</td><td>${i.descricao}</td>
        <td style="text-align:right;"><button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="openCfopModal('${i.id}')"><span class="material-icons-round" style="font-size:1rem;">edit</span></button>
        <button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="deleteCfopItem('${i.id}')"><span class="material-icons-round" style="font-size:1rem; color:#ef4444;">delete</span></button></td></tr>`).join('');
};

window.deleteCfopItem = function (id) { if (deleteCadastro('cfop', id)) renderCfopGrid(); };

// ===========================================
// 6. PARÂMETROS ICMS
// ===========================================
window.openIcmsModal = function (editId) {
    const item = editId ? getCadastro('icmsParams', editId) : null;
    createDynamicModal('fisIcmsModal', item ? 'Editar Parâmetro ICMS' : 'Novo Parâmetro ICMS', `
        ${formRow('Código Tributação *', `<input type="text" id="icCodTribut" class="form-input" value="${item?.codTribut || ''}">`)}
        ${formRow2('ICMS NF (%)', `<input type="number" id="icIcmsNf" class="form-input" value="${item?.icmsNf || ''}" step="0.01" min="0">`,
        'ICMS Substituição (%)', `<input type="number" id="icIcmsSubs" class="form-input" value="${item?.icmsSubs || ''}" step="0.01" min="0">`)}
        ${formRow2('Base Redução (%)', `<input type="number" id="icBaseRed" class="form-input" value="${item?.baseRed || ''}" step="0.01" min="0">`,
            'MVA (%)', `<input type="number" id="icMva" class="form-input" value="${item?.mva || ''}" step="0.01" min="0">`)}
        ${formRow2('CST', `<input type="text" id="icCst" class="form-input" value="${item?.cst || ''}" maxlength="3">`,
                'CSOSN', `<input type="text" id="icCsosn" class="form-input" value="${item?.csosn || ''}" maxlength="4">`)}
        <input type="hidden" id="icEditId" value="${editId || ''}">
    `, 'saveIcmsParam()');
};

window.saveIcmsParam = function () {
    const data = {
        codTribut: document.getElementById('icCodTribut').value.trim(),
        icmsNf: document.getElementById('icIcmsNf').value,
        icmsSubs: document.getElementById('icIcmsSubs').value,
        baseRed: document.getElementById('icBaseRed').value,
        mva: document.getElementById('icMva').value,
        cst: document.getElementById('icCst').value.trim(),
        csosn: document.getElementById('icCsosn').value.trim()
    };
    if (!data.codTribut) { alert('Código Tributação é obrigatório!'); return; }
    const editId = document.getElementById('icEditId').value;
    saveCadastro('icmsParams', data, editId || null);
    closeModal('fisIcmsModal');
    renderIcmsGrid();
    alert('Parâmetro ICMS salvo com sucesso!');
};

window.renderIcmsGrid = function () {
    const tbody = document.getElementById('icmsParamsTableBody');
    if (!tbody) return;
    const items = loadCadastros('icmsParams');
    if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-secondary);"><span class="material-icons-round" style="font-size:2rem; vertical-align:middle;">calculate</span> Nenhum parâmetro cadastrado</td></tr>`;
        return;
    }
    tbody.innerHTML = items.map(i => `<tr><td style="font-weight:600;">${i.codTribut}</td><td>${i.icmsNf || '0'}%</td><td>${i.icmsSubs || '0'}%</td><td>${i.baseRed || '0'}%</td>
        <td style="text-align:right;">
            <button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="openIcmsModal('${i.id}')"><span class="material-icons-round" style="font-size:1rem;">edit</span></button>
            <button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="deleteIcmsParam('${i.id}')"><span class="material-icons-round" style="font-size:1rem; color:#ef4444;">delete</span></button>
        </td></tr>`).join('');
};

window.filterIcmsParams = function () {
    const s = document.getElementById('icmsSearch').value.toLowerCase();
    const items = loadCadastros('icmsParams').filter(i => (i.codTribut + ' ' + (i.cst || '')).toLowerCase().includes(s));
    const tbody = document.getElementById('icmsParamsTableBody');
    tbody.innerHTML = items.map(i => `<tr><td style="font-weight:600;">${i.codTribut}</td><td>${i.icmsNf || '0'}%</td><td>${i.icmsSubs || '0'}%</td><td>${i.baseRed || '0'}%</td>
        <td style="text-align:right;"><button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="openIcmsModal('${i.id}')"><span class="material-icons-round" style="font-size:1rem;">edit</span></button>
        <button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="deleteIcmsParam('${i.id}')"><span class="material-icons-round" style="font-size:1rem; color:#ef4444;">delete</span></button></td></tr>`).join('');
};

window.deleteIcmsParam = function (id) { if (deleteCadastro('icmsParams', id)) renderIcmsGrid(); };

// ===========================================
// 7. PIS/COFINS
// ===========================================
window.openPisCofinsModal = function (editId) {
    const item = editId ? getCadastro('pisCofins', editId) : null;
    createDynamicModal('fisPisCofinsModal', item ? 'Editar PIS/COFINS' : 'Novo PIS/COFINS', `
        ${formRow2('Código *', `<input type="text" id="pcCodigo" class="form-input" value="${item?.codigo || ''}">`,
        'Principal?', `<select id="pcPrincipal" class="form-input"><option value="Sim" ${item?.principal !== 'Não' ? 'selected' : ''}>Sim</option><option value="Não" ${item?.principal === 'Não' ? 'selected' : ''}>Não</option></select>`)}
        ${formRow('Descrição do Imposto *', `<input type="text" id="pcDescricao" class="form-input" value="${item?.descricao || ''}">`)}
        ${formRow2('CST PIS', `<input type="text" id="pcCstPis" class="form-input" value="${item?.cstPis || ''}" maxlength="2">`,
            'Alíq. PIS (%)', `<input type="number" id="pcAliqPis" class="form-input" value="${item?.aliqPis || ''}" step="0.01" min="0">`)}
        ${formRow2('CST COFINS', `<input type="text" id="pcCstCofins" class="form-input" value="${item?.cstCofins || ''}" maxlength="2">`,
                'Alíq. COFINS (%)', `<input type="number" id="pcAliqCofins" class="form-input" value="${item?.aliqCofins || ''}" step="0.01" min="0">`)}
        <input type="hidden" id="pcEditId" value="${editId || ''}">
    `, 'savePisCofins()');
};

window.savePisCofins = function () {
    const data = {
        codigo: document.getElementById('pcCodigo').value.trim(),
        descricao: document.getElementById('pcDescricao').value.trim(),
        principal: document.getElementById('pcPrincipal').value,
        cstPis: document.getElementById('pcCstPis').value.trim(),
        aliqPis: document.getElementById('pcAliqPis').value,
        cstCofins: document.getElementById('pcCstCofins').value.trim(),
        aliqCofins: document.getElementById('pcAliqCofins').value
    };
    if (!data.codigo || !data.descricao) { alert('Código e Descrição são obrigatórios!'); return; }
    const editId = document.getElementById('pcEditId').value;
    saveCadastro('pisCofins', data, editId || null);
    closeModal('fisPisCofinsModal');
    renderPisCofinsGrid();
    alert('PIS/COFINS salvo com sucesso!');
};

window.renderPisCofinsGrid = function () {
    const tbody = document.getElementById('pisCofinsTableBody');
    if (!tbody) return;
    const items = loadCadastros('pisCofins');
    if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:2rem; color:var(--text-secondary);"><span class="material-icons-round" style="font-size:2rem; vertical-align:middle;">calculate</span> Nenhum PIS/COFINS cadastrado</td></tr>`;
        return;
    }
    tbody.innerHTML = items.map(i => `<tr><td style="font-weight:600;">${i.codigo}</td><td>${i.descricao}</td><td>${i.principal || '-'}</td>
        <td style="text-align:right;">
            <button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="openPisCofinsModal('${i.id}')"><span class="material-icons-round" style="font-size:1rem;">edit</span></button>
            <button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="deletePisCofinsItem('${i.id}')"><span class="material-icons-round" style="font-size:1rem; color:#ef4444;">delete</span></button>
        </td></tr>`).join('');
};

window.filterPisCofins = function () {
    const s = document.getElementById('pisCofinsSearch').value.toLowerCase();
    const items = loadCadastros('pisCofins').filter(i => (i.codigo + ' ' + i.descricao).toLowerCase().includes(s));
    const tbody = document.getElementById('pisCofinsTableBody');
    tbody.innerHTML = items.map(i => `<tr><td style="font-weight:600;">${i.codigo}</td><td>${i.descricao}</td><td>${i.principal || '-'}</td>
        <td style="text-align:right;"><button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="openPisCofinsModal('${i.id}')"><span class="material-icons-round" style="font-size:1rem;">edit</span></button>
        <button class="btn btn-secondary btn-icon" style="padding:0.4rem;" onclick="deletePisCofinsItem('${i.id}')"><span class="material-icons-round" style="font-size:1rem; color:#ef4444;">delete</span></button></td></tr>`).join('');
};

window.deletePisCofinsItem = function (id) { if (deleteCadastro('pisCofins', id)) renderPisCofinsGrid(); };

// ===========================================
// 8. CONTAS A RECEBER
// ===========================================
window.renderReceberGrid = function () {
    const tbody = document.getElementById('receberTableBody');
    if (!tbody) return;
    const items = JSON.parse(localStorage.getItem('erp_receber') || '[]');

    if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-secondary);"><span class="material-icons-round" style="font-size:2rem; vertical-align:middle;">sentiment_dissatisfied</span> Nenhuma conta a receber</td></tr>`;
        return;
    }

    // Sort by vencimento
    items.sort((a, b) => new Date(a.vencimento) - new Date(b.vencimento));

    tbody.innerHTML = items.map(i => {
        const venc = new Date(i.vencimento).toLocaleDateString('pt-BR');
        const est = i.status === 'Pago' ? 'status-shipped' : (new Date(i.vencimento) < new Date() ? 'status-cancelled' : 'status-pending');
        const valor = parseFloat(i.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        return `<tr>
            <td style="font-weight:600;">${i.id}</td>
            <td>${i.cliente}</td>
            <td>${venc}</td>
            <td style="font-weight:700;">${valor}</td>
            <td><span class="status-badge ${est}">${i.status}</span></td>
            <td style="text-align:right;">
                ${i.status !== 'Pago' ?
                `<button class="btn btn-primary btn-icon" style="padding:0.4rem; background:var(--accent-success);" onclick="baixarContaReceber('${i.id}')" title="Baixar/Receber">
                    <span class="material-icons-round" style="font-size:1rem;">attach_money</span>
                </button>` :
                `<span class="material-icons-round" style="color:var(--accent-success);">check_circle</span>`}
            </td>
        </tr>`;
    }).join('');
};

window.baixarContaReceber = function (id) {
    if (!confirm('Confirmar o recebimento desta conta?')) return;

    const items = JSON.parse(localStorage.getItem('erp_receber') || '[]');
    const item = items.find(i => i.id === id);
    if (item) {
        item.status = 'Pago';
        item.dataPagamento = new Date().toISOString();
        localStorage.setItem('erp_receber', JSON.stringify(items));
        renderReceberGrid();
        alert('Conta recebida com sucesso!');
    }
};

// ===========================================
// 9. CONTAS A PAGAR
// ===========================================
window.renderPagarGrid = function () {
    const tbody = document.getElementById('pagarTableBody');
    if (!tbody) return;
    const items = JSON.parse(localStorage.getItem('erp_pagar') || '[]');

    if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-secondary);"><span class="material-icons-round" style="font-size:2rem; vertical-align:middle;">sentiment_dissatisfied</span> Nenhuma conta a pagar</td></tr>`;
        return;
    }

    // Sort by vencimento
    items.sort((a, b) => new Date(a.vencimento) - new Date(b.vencimento));

    tbody.innerHTML = items.map(i => {
        const venc = new Date(i.vencimento).toLocaleDateString('pt-BR');
        const est = i.status === 'Pago' ? 'status-shipped' : (new Date(i.vencimento) < new Date() ? 'status-cancelled' : 'status-pending');
        const valor = parseFloat(i.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        return `<tr>
            <td style="font-weight:600;">${i.descricao}</td>
            <td>${venc}</td>
            <td><span class="status-badge status-pending" style="background:var(--bg-secondary); color:var(--text-primary);">${i.categoria}</span></td>
            <td style="font-weight:700;">${valor}</td>
            <td><span class="status-badge ${est}">${i.status}</span></td>
            <td style="text-align:right;">
                ${i.status !== 'Pago' ?
                `<button class="btn btn-primary btn-icon" style="padding:0.4rem; background:var(--accent-primary);" onclick="baixarContaPagar('${i.id}')" title="Baixar/Pagar">
                    <span class="material-icons-round" style="font-size:1rem;">payment</span>
                </button>` :
                `<span class="material-icons-round" style="color:var(--accent-success);">check_circle</span>`}
            </td>
        </tr>`;
    }).join('');
};

window.novaDespesa = function () {
    document.getElementById('finDespesaModal').style.display = 'flex';
    document.getElementById('despesaDescricao').value = '';
    document.getElementById('despesaValor').value = '';
    document.getElementById('despesaVencimento').value = new Date().toISOString().split('T')[0];
};

window.salvarDespesa = function () {
    const desc = document.getElementById('despesaDescricao').value;
    const valor = parseFloat(document.getElementById('despesaValor').value.replace(',', '.'));
    const venc = document.getElementById('despesaVencimento').value;
    const cat = document.getElementById('despesaCategoria').value;

    if (!desc || isNaN(valor) || !venc) {
        alert('Preencha os campos obrigatórios!');
        return;
    }

    const items = JSON.parse(localStorage.getItem('erp_pagar') || '[]');
    items.push({
        id: 'CP-' + Date.now(),
        descricao: desc,
        valor: valor,
        vencimento: venc,
        categoria: cat,
        status: 'Aberto',
        criadoEm: new Date().toISOString()
    });
    localStorage.setItem('erp_pagar', JSON.stringify(items));

    alert('Despesa salva com sucesso!');
    document.getElementById('finDespesaModal').style.display = 'none';
    renderPagarGrid();
};

window.baixarContaPagar = function (id) {
    if (!confirm('Confirmar o pagamento desta conta?')) return;

    const items = JSON.parse(localStorage.getItem('erp_pagar') || '[]');
    const item = items.find(i => i.id === id);
    if (item) {
        item.status = 'Pago';
        item.dataPagamento = new Date().toISOString();
        localStorage.setItem('erp_pagar', JSON.stringify(items));
        renderPagarGrid();
        alert('Conta paga com sucesso!');
    }
};

// ===========================================
// HOOK INTO SWITCHVIEW — render grids on view change
// ===========================================
const _origSwitchView = window.switchView;
window.switchView = function (viewName) {
    _origSwitchView(viewName);

    // Render grids when switching to financial/fiscal views
    switch (viewName) {
        case 'accountPlans': renderAccountPlansGrid(); break;
        case 'billing': renderBillingGrid(); break;
        case 'paymentPlans': renderPaymentPlansGrid(); break;
        case 'banks': renderBanksGrid(); break;
        case 'cfop': renderCfopGrid(); break;
        case 'icmsParams': renderIcmsGrid(); break;
        case 'pisCofins': renderPisCofinsGrid(); break;
        case 'cbsIbs': if (typeof renderCbsIbsGrid === 'function') renderCbsIbsGrid(); break;
        case 'pdv': if (typeof renderPdvGrid === 'function') renderPdvGrid(); break;
        case 'receber': renderReceberGrid(); break;
        case 'pagar': renderPagarGrid(); break;
    }
};

// Also fix the "Novo" buttons in HTML to use our dynamic modal open functions
document.addEventListener('DOMContentLoaded', () => {
    // Override the modal buttons to use dynamic modals
    const overrides = {
        'finPlanModal': () => openAccountPlanModal(),
        'finBillingModal': () => openBillingModal(),
        'finPayPlanModal': () => openPaymentPlanModal(),
        'finBankModal': () => openBankModal(),
        'fisCfopModal': () => openCfopModal(),
        'fisIcmsModal': () => openIcmsModal(),
        'fisPisCofinsModal': () => openPisCofinsModal()
    };

    // Intercept openModal calls for financial modals
    const _origOpenModal = window.openModal;
    window.openModal = function (modalId) {
        if (overrides[modalId]) {
            overrides[modalId]();
        } else {
            _origOpenModal(modalId);
        }
    };

    // Also initialize any missing collections data
    ['pisCofins', 'cbsIbs', 'pdv'].forEach(key => {
        if (!cadastrosData[key]) {
            const stored = localStorage.getItem(`erp_${key}`);
            cadastrosData[key] = stored ? JSON.parse(stored) : [];
        }
    });
});
