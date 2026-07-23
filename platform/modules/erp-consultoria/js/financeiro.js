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
// SEED: Plano de Contas padrão (baseado no relatório 834)
// Executado automaticamente se accountPlans estiver vazio
// ===========================================
const PLANO_CONTAS_DEFAULT = [
    // GRUPO 1 — RECEITAS
    { codigo: '1.1',    conta: 'RECEITAS COM VENDAS',               tipo: 'Sintética' },
    { codigo: '1.1.01', conta: 'VENDAS',                            tipo: 'Analítica' },
    // GRUPO 2 — CUSTO E IMPOSTOS
    { codigo: '2.1',    conta: 'CUSTO COM MERCADORIA REVENDA',       tipo: 'Sintética' },
    { codigo: '2.1.01', conta: 'FORNECEDORES DE MERCADORIAS',        tipo: 'Analítica' },
    { codigo: '2.1.03', conta: 'TRANSPORTADORA MERCA REVENDA',       tipo: 'Analítica' },
    { codigo: '2.3',    conta: 'IMPOSTOS SE ESTIVER NO CMV',         tipo: 'Sintética' },
    { codigo: '2.3.06', conta: 'ICMS - NORMAL',                      tipo: 'Analítica' },
    { codigo: '2.3.07', conta: 'SUBSTITUIÇÃO TRIBUTÁRIA SAÍDA',      tipo: 'Analítica' },
    { codigo: '2.3.09', conta: 'FUNDO DESENVOLVIMENTO ECONOMICO',    tipo: 'Analítica' },
    { codigo: '2.3.11', conta: 'IMPOSTOS PARCELADOS',                tipo: 'Analítica' },
    // GRUPO 3 — DESPESAS OPERACIONAIS
    { codigo: '3.1',    conta: 'DESPESAS COM VENDAS',                tipo: 'Sintética' },
    { codigo: '3.1.01', conta: 'MARKETING E PROPAGANDA',             tipo: 'Analítica' },
    { codigo: '3.1.03', conta: 'SACOLAS E EMBALAGENS',               tipo: 'Analítica' },
    { codigo: '3.1.05', conta: 'COMISSÃO REPRESENTANTE COMERCIAL',   tipo: 'Analítica' },
    { codigo: '3.1.06', conta: 'FRETE COM ENTREGA DE VENDAS',        tipo: 'Analítica' },
    { codigo: '3.1.07', conta: 'TAXA CARTÃO CRÉDITO/DÉBITO',         tipo: 'Analítica' },
    { codigo: '3.1.10', conta: 'TARIFA PIX RECEBIDO',                tipo: 'Analítica' },
    { codigo: '3.2',    conta: 'FUNCIONÁRIOS',                       tipo: 'Sintética' },
    { codigo: '3.2.01', conta: 'SALÁRIO (CLT)',                      tipo: 'Analítica' },
    { codigo: '3.2.02', conta: 'ADIANTAMENTO SALARIO/VALES',         tipo: 'Analítica' },
    { codigo: '3.2.03', conta: 'AUXILIO ALIMENTAÇÃO/REFEIÇÃO',       tipo: 'Analítica' },
    { codigo: '3.2.05', conta: 'SEGURO DE VIDA FUNCIONÁRIOS',        tipo: 'Analítica' },
    { codigo: '3.2.06', conta: 'CONFRATERNIZAÇÃO E PREMIAÇÃO',       tipo: 'Analítica' },
    { codigo: '3.2.07', conta: 'VIAGENS E ESTADIAS FUNCIONÁRIOS',    tipo: 'Analítica' },
    { codigo: '3.2.08', conta: 'TREINAMENTOS E CURSOS',              tipo: 'Analítica' },
    { codigo: '3.2.12', conta: 'VALE TRANSPORTE',                    tipo: 'Analítica' },
    { codigo: '3.2.13', conta: 'FGTS',                               tipo: 'Analítica' },
    { codigo: '3.2.14', conta: 'INSS/GPS',                           tipo: 'Analítica' },
    { codigo: '3.2.15', conta: 'CONTRIBUIÇÃO SINDICAL',              tipo: 'Analítica' },
    { codigo: '3.2.16', conta: 'RESCISÃO TRABALHISTA',               tipo: 'Analítica' },
    { codigo: '3.2.17', conta: 'SELEÇÃO E CONTRATAÇÃO',              tipo: 'Analítica' },
    { codigo: '3.2.18', conta: 'ASO',                                tipo: 'Analítica' },
    { codigo: '3.2.20', conta: 'DESPESA COM TERCEIRIZADO',           tipo: 'Analítica' },
    { codigo: '3.2.21', conta: 'UNIFORMES E EPI',                    tipo: 'Analítica' },
    { codigo: '3.2.23', conta: 'DECIMO TERCEIRO INTEGRAL',           tipo: 'Analítica' },
    { codigo: '3.3',    conta: 'DESPESA DE INFORMÁTICA',             tipo: 'Sintética' },
    { codigo: '3.3.03', conta: 'CONSULTORIA DE TI',                  tipo: 'Analítica' },
    { codigo: '3.3.04', conta: 'MENSALI. PROG. DE TECNO INFORMACA',  tipo: 'Analítica' },
    { codigo: '3.4',    conta: 'DESPESAS ADMINISTRATIVAS',           tipo: 'Sintética' },
    { codigo: '3.4.01', conta: 'SUPERMERCADO/PADARIA/FARMÁCIA',      tipo: 'Analítica' },
    { codigo: '3.4.02', conta: 'MATERIAL ADMINISTRATIVO/EXPEDIEN',   tipo: 'Analítica' },
    { codigo: '3.4.04', conta: 'CARTÓRIO',                           tipo: 'Analítica' },
    { codigo: '3.4.06', conta: 'MANUTENÇÃO/REFORMAS/REPAROS',        tipo: 'Analítica' },
    { codigo: '3.4.07', conta: 'DIÁRIA DE PRESTADOR DE SERVIÇO',     tipo: 'Analítica' },
    { codigo: '3.4.08', conta: 'CONSULTORIA DE RH/ADM/FIN/CON',      tipo: 'Analítica' },
    { codigo: '3.4.09', conta: 'HONORÁRIOS ADVOCATÍCIOS',            tipo: 'Analítica' },
    { codigo: '3.4.10', conta: 'TAXAS ADMINISTRATIVAS',              tipo: 'Analítica' },
    { codigo: '3.4.13', conta: 'SEGURADORA PREDIAL/EQUIPAMENTOS',    tipo: 'Analítica' },
    { codigo: '3.4.14', conta: 'CONSULTA DE CRÉDITO SPC/SERASA',     tipo: 'Analítica' },
    { codigo: '3.4.16', conta: 'PRO LABORE',                         tipo: 'Analítica' },
    { codigo: '3.5',    conta: 'DESPESAS FIXAS',                     tipo: 'Sintética' },
    { codigo: '3.5.01', conta: 'CONTA DE ÁGUA',                      tipo: 'Analítica' },
    { codigo: '3.5.02', conta: 'CONTA DE ENERGIA',                   tipo: 'Analítica' },
    { codigo: '3.5.03', conta: 'CONTA TELEFONE FIXO/INTERNET',       tipo: 'Analítica' },
    { codigo: '3.5.04', conta: 'CONTA CELULAR',                      tipo: 'Analítica' },
    { codigo: '3.5.05', conta: 'ALUGUEL PREDIAL',                    tipo: 'Analítica' },
    { codigo: '3.5.07', conta: 'EMPRESA DE VIGILÂNCIA E MONITORA',   tipo: 'Analítica' },
    { codigo: '3.5.10', conta: 'HONORÁRIOS CONTABILIDADE',           tipo: 'Analítica' },
    { codigo: '3.6',    conta: 'DESPESAS BANCÁRIAS/FINANCEIRAS',     tipo: 'Sintética' },
    { codigo: '3.6.01', conta: 'TARIFAS BANCÁRIAS',                  tipo: 'Analítica' },
    { codigo: '3.6.02', conta: 'IOF',                                tipo: 'Analítica' },
    { codigo: '3.6.08', conta: 'JUROS SOBRE EMPRÉSTIMOS',            tipo: 'Analítica' },
    { codigo: '3.7',    conta: 'VEÍCULOS',                           tipo: 'Sintética' },
    { codigo: '3.7.01', conta: 'COMBUSTÍVEL E LUBRIFICANTES',        tipo: 'Analítica' },
    { codigo: '3.7.06', conta: 'ALUGUEL DE VEÍCULO',                 tipo: 'Analítica' },
    { codigo: '3.7.07', conta: 'RASTREAMENTO POR GPS',               tipo: 'Analítica' },
    // GRUPO 4 — RECEITAS E DESPESAS FINANCEIRAS
    { codigo: '4.1',    conta: 'RECEITA DE EMPRÉSTIMO/FINANCIAMENTO', tipo: 'Sintética' },
    { codigo: '4.1.01', conta: 'BANCÁRIOS',                          tipo: 'Analítica' },
    { codigo: '4.2',    conta: 'RECEITA DE INVESTIMENTO',            tipo: 'Sintética' },
    { codigo: '4.2.06', conta: 'RENDIMENTOS CDB/FUNDOS/ALUGUÉIS',   tipo: 'Analítica' },
    { codigo: '4.3',    conta: 'RECEITAS FINANCEIRAS',               tipo: 'Sintética' },
    { codigo: '4.3.07', conta: 'RECEITA NÃO IDENTIFICADA',           tipo: 'Analítica' },
    { codigo: '4.3.08', conta: 'DESPESAS NÃO IDENTIFICADAS',         tipo: 'Analítica' },
    // GRUPO 5 — FINANCIAMENTOS E INVESTIMENTOS
    { codigo: '5.1',    conta: 'EMPRÉSTIMO/FINANCIAMENTO',           tipo: 'Sintética' },
    { codigo: '5.1.01', conta: 'BANCÁRIOS',                          tipo: 'Analítica' },
    { codigo: '5.2',    conta: 'DESPESA COM INVESTIMENTOS',          tipo: 'Sintética' },
    { codigo: '5.2.01', conta: 'IMÓVEIS',                            tipo: 'Analítica' },
    { codigo: '5.2.04', conta: 'COMPRA DE TERRENOS',                 tipo: 'Analítica' },
    { codigo: '5.2.06', conta: 'AQUISIÇÃO TÍTULO DE CAPITALIZAÇÃO',  tipo: 'Analítica' },
    { codigo: '5.2.07', conta: 'CONSÓRCIOS',                         tipo: 'Analítica' },
    { codigo: '5.3',    conta: 'INVESTIMENTO EM IMOBILIZADOS',       tipo: 'Sintética' },
    { codigo: '5.3.01', conta: 'MOVEIS E UTENSI. IMOBILIZADOS',      tipo: 'Analítica' },
    { codigo: '5.3.02', conta: 'MAQUINAS E EQUIPAM. IMOBILIZADOS',   tipo: 'Analítica' },
    { codigo: '5.4',    conta: 'DISTRIBUIÇÃO DE LUCROS',             tipo: 'Sintética' },
    { codigo: '5.4.03', conta: 'VIAGENS E ESTADAS - DIRETORIA',      tipo: 'Analítica' },
];

window.seedAccountPlans = function () {
    const existing = loadCadastros('accountPlans');
    if (existing.length > 0) return; // já populado
    const suffix = typeof window.getTenantSuffix === 'function' ? window.getTenantSuffix() : '';
    const seeded = PLANO_CONTAS_DEFAULT.map((a, idx) => ({
        id: 'AP-SEED-' + idx,
        codigo: a.codigo,
        conta: a.conta,
        contaContabil: a.codigo,
        tipo: a.tipo,
        valorOrcado: '',
        investimento: 'Não',
        exibirDre: 'Sim'
    }));
    localStorage.setItem('erp_accountPlans' + suffix, JSON.stringify(seeded));
    // Força reload do cache interno do módulo de cadastros
    if (typeof cadastrosData !== 'undefined') cadastrosData['accountPlans'] = seeded;
    console.log('[ERP] Plano de Contas populado com', seeded.length, 'contas.');
};

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
    const suffix = typeof window.getTenantSuffix === 'function' ? window.getTenantSuffix() : '';
    let items = JSON.parse(localStorage.getItem('erp_pagar' + suffix) || '[]');

    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fmtBRL = v => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const CCS = { '1': 'MATRIZ', '2': 'PALMAS', '4': 'PORTO' };

    // Atualiza status Vencido automaticamente
    items = items.map(i => {
        if (i.status === 'Aberto' && new Date(i.vencimento) < hoje) return { ...i, status: 'Vencido' };
        return i;
    });
    localStorage.setItem('erp_pagar' + suffix, JSON.stringify(items)); // persiste status atualizado

    // Cards de resumo
    const totalPendente = items.filter(i => i.status !== 'Pago').reduce((s,i) => s + parseFloat(i.valor||0), 0);
    const totalVencido  = items.filter(i => i.status === 'Vencido').reduce((s,i) => s + parseFloat(i.valor||0), 0);
    const totalPagoMes  = items.filter(i => i.status === 'Pago' && i.dataPagamento && new Date(i.dataPagamento) >= inicioMes)
                               .reduce((s,i) => s + parseFloat(i.valor||0), 0);
    const cardsEl = document.getElementById('pagar-cards');
    if (cardsEl) cardsEl.innerHTML = `
        <div class="stat-card" style="cursor:default;">
            <div class="stat-icon" style="background:rgba(251,191,36,.15);color:#fbbf24;"><span class="material-icons-round">pending_actions</span></div>
            <div><div style="font-size:.75rem;color:var(--text-secondary);">Total Pendente</div><div style="font-size:1.1rem;font-weight:700;">${fmtBRL(totalPendente)}</div></div>
        </div>
        <div class="stat-card" style="cursor:default;">
            <div class="stat-icon" style="background:rgba(239,68,68,.15);color:#ef4444;"><span class="material-icons-round">warning</span></div>
            <div><div style="font-size:.75rem;color:var(--text-secondary);">Vencido</div><div style="font-size:1.1rem;font-weight:700;color:#ef4444;">${fmtBRL(totalVencido)}</div></div>
        </div>
        <div class="stat-card" style="cursor:default;">
            <div class="stat-icon" style="background:rgba(16,185,129,.15);color:#10b981;"><span class="material-icons-round">check_circle</span></div>
            <div><div style="font-size:.75rem;color:var(--text-secondary);">Pago este Mês</div><div style="font-size:1.1rem;font-weight:700;color:#10b981;">${fmtBRL(totalPagoMes)}</div></div>
        </div>`;

    if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-secondary);"><span class="material-icons-round" style="font-size:2rem;vertical-align:middle;">sentiment_dissatisfied</span> Nenhuma conta a pagar cadastrada</td></tr>`;
        return;
    }

    items.sort((a, b) => new Date(a.vencimento) - new Date(b.vencimento));
    tbody.innerHTML = items.map(i => {
        const venc = new Date(i.vencimento + 'T00:00:00').toLocaleDateString('pt-BR');
        const isPago = i.status === 'Pago';
        const isVencido = i.status === 'Vencido';
        const est = isPago ? 'status-shipped' : (isVencido ? 'status-cancelled' : 'status-pending');
        const contaLabel = i.codigoConta ? `${i.codigoConta} — ${i.conta || ''}` : (i.categoria || '-');
        const ccLabel = CCS[i.centroCusto] || '-';
        return `<tr>
            <td>
                <div style="font-weight:600;">${i.descricao}</div>
                ${i.beneficiario ? `<div style="font-size:.8rem;color:var(--text-secondary);">${i.beneficiario}</div>` : ''}
            </td>
            <td style="font-size:.82rem;color:var(--text-secondary);max-width:180px;overflow:hidden;text-overflow:ellipsis;">${contaLabel}</td>
            <td><span class="status-badge" style="background:rgba(99,102,241,.12);color:#818cf8;font-size:.7rem;">${ccLabel}</span></td>
            <td style="${isVencido?'color:#ef4444;':''}">${venc}</td>
            <td style="font-weight:700;">${(parseFloat(i.valor||0)).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td>
            <td><span class="status-badge ${est}">${i.status}</span></td>
            <td style="text-align:right;display:flex;gap:.25rem;justify-content:flex-end;">
                ${!isPago ? `<button class="btn btn-primary btn-icon" data-pagid="${i.id}" style="padding:.35rem;" title="Baixar/Pagar"><span class="material-icons-round" style="font-size:.95rem;">payment</span></button>` : `<span class="material-icons-round" style="color:var(--accent-success);line-height:2rem;">check_circle</span>`}
                <button class="btn btn-secondary btn-icon" data-delid="${i.id}" style="padding:.35rem;" title="Excluir"><span class="material-icons-round" style="font-size:.95rem;color:#ef4444;">delete</span></button>
            </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-pagid]').forEach(btn =>
        btn.addEventListener('click', () => baixarContaPagar(btn.dataset.pagid)));
    tbody.querySelectorAll('[data-delid]').forEach(btn =>
        btn.addEventListener('click', () => {
            if (!confirm('Excluir esta conta a pagar?')) return;
            const it2 = JSON.parse(localStorage.getItem('erp_pagar' + suffix) || '[]').filter(x => x.id !== btn.dataset.delid);
            localStorage.setItem('erp_pagar' + suffix, JSON.stringify(it2));
            renderPagarGrid();
        }));
};

window.novaDespesa = function () {
    // Popula select de contas a partir do Plano de Contas (somente Analíticas)
    const plans = loadCadastros('accountPlans');
    const sinteticas = plans.filter(p => p.tipo === 'Sintética').sort((a,b) => a.codigo.localeCompare(b.codigo));
    const analiticas = plans.filter(p => p.tipo === 'Analítica').sort((a,b) => a.codigo.localeCompare(b.codigo));
    let optsHtml = '<option value="">-- Selecione a Conta --</option>';
    sinteticas.forEach(s => {
        const filhos = analiticas.filter(a => a.codigo.startsWith(s.codigo + '.'));
        if (!filhos.length) return;
        optsHtml += `<optgroup label="${s.codigo} — ${s.conta}">`;
        filhos.forEach(a => { optsHtml += `<option value="${a.codigo}|${a.conta}">${a.codigo} — ${a.conta}</option>`; });
        optsHtml += '</optgroup>';
    });
    // Analíticas sem pai listado
    const semPai = analiticas.filter(a => !sinteticas.some(s => a.codigo.startsWith(s.codigo + '.')));
    if (semPai.length) {
        optsHtml += '<optgroup label="Outras">';
        semPai.forEach(a => { optsHtml += `<option value="${a.codigo}|${a.conta}">${a.codigo} — ${a.conta}</option>`; });
        optsHtml += '</optgroup>';
    }
    const selEl = document.getElementById('despesaCodigoConta');
    if (selEl) selEl.innerHTML = optsHtml;

    // Limpa campos
    ['despesaDescricao','despesaBeneficiario','despesaValor'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    const vencEl = document.getElementById('despesaVencimento');
    if (vencEl) vencEl.value = new Date().toISOString().split('T')[0];
    const ccEl = document.getElementById('despesaCentroCusto');
    if (ccEl) ccEl.value = '';
    document.getElementById('finDespesaModal').style.display = 'flex';
};

window.salvarDespesa = function () {
    const desc  = (document.getElementById('despesaDescricao')?.value || '').trim();
    const valor = parseFloat((document.getElementById('despesaValor')?.value || '').replace(',', '.'));
    const venc  = document.getElementById('despesaVencimento')?.value || '';
    const contaRaw = document.getElementById('despesaCodigoConta')?.value || '';
    const cc    = document.getElementById('despesaCentroCusto')?.value || '';
    const ben   = (document.getElementById('despesaBeneficiario')?.value || '').trim();

    if (!desc || isNaN(valor) || !venc) { alert('Preencha os campos obrigatórios!'); return; }

    const [codigoConta, conta] = contaRaw ? contaRaw.split('|') : ['', ''];
    const suffix = typeof window.getTenantSuffix === 'function' ? window.getTenantSuffix() : '';
    const items = JSON.parse(localStorage.getItem('erp_pagar' + suffix) || '[]');
    items.push({
        id: 'CP-' + Date.now(),
        descricao: desc,
        beneficiario: ben,
        valor,
        vencimento: venc,
        codigoConta: codigoConta || '',
        conta: conta || '',
        categoria: conta || 'Outros', // compatibilidade retroativa
        centroCusto: cc,
        status: 'Aberto',
        criadoEm: new Date().toISOString()
    });
    localStorage.setItem('erp_pagar' + suffix, JSON.stringify(items));
    document.getElementById('finDespesaModal').style.display = 'none';
    renderPagarGrid();
};

window.baixarContaPagar = function (id) {
    if (!confirm('Confirmar o pagamento desta conta?')) return;
    const suffix = typeof window.getTenantSuffix === 'function' ? window.getTenantSuffix() : '';
    const items = JSON.parse(localStorage.getItem('erp_pagar' + suffix) || '[]');
    const item = items.find(i => i.id === id);
    if (item) {
        item.status = 'Pago';
        item.dataPagamento = new Date().toISOString();
        localStorage.setItem('erp_pagar' + suffix, JSON.stringify(items));
        renderPagarGrid();
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
        case 'accountPlans': seedAccountPlans(); renderAccountPlansGrid(); break;
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
        case 'relatorios-gerenciais':
            // Default to ABC
            renderCurvaABC();
            document.getElementById('tab-abc').style.display = 'block';
            document.getElementById('tab-dre').style.display = 'none';
            break;
        case 'cad-produtos': if (typeof renderProdutosGrid === 'function') renderProdutosGrid(); break;
        case 'bank-integration': if (typeof renderBoletoEmissao === 'function') renderBoletoEmissao(); break;
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
    // Seed Plano de Contas na primeira carga
    if (typeof seedAccountPlans === 'function') seedAccountPlans();
});
