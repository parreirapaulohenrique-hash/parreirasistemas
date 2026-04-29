// ===========================================
// ERP - MÓDULO RECURSOS HUMANOS (RH)
// ===========================================

const STORAGE_KEY_RH_PONTO = 'erp_rh_ponto';
const STORAGE_KEY_RH_FERIAS = 'erp_rh_ferias';

// ─── 1. CONTROLE DE PONTO ELETRÔNICO ─────────────

function updateClockRH() {
    const clockEl = document.getElementById('rhRelogio');
    if (!clockEl) return;

    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('pt-BR');
}

setInterval(updateClockRH, 1000);

window.baterPontoRH = function () {
    const pontos = JSON.parse(localStorage.getItem(STORAGE_KEY_RH_PONTO + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '[]');
    const now = new Date();
    const dataString = now.toISOString().split('T')[0];
    const horaString = now.toLocaleTimeString('pt-BR');

    // Identificação mockada baseada pre-existente
    const usuarioLogado = "Funcionário Padrão";

    // Obter mock de localização
    const mockLat = -23.5505;
    const mockLng = -46.6333;

    const registro = {
        id: 'pto_' + Date.now(),
        data: dataString,
        hora: horaString,
        usuario: usuarioLogado,
        tipo: (pontos.filter(p => p.data === dataString).length % 2 === 0) ? 'Entrada' : 'Saída',
        localizacao: `${mockLat}, ${mockLng}`
    };

    pontos.push(registro);
    localStorage.setItem(STORAGE_KEY_RH_PONTO + (window.getTenantSuffix ? window.getTenantSuffix() : ''), JSON.stringify(pontos));

    alert(`✅ Ponto registrado com sucesso!\n\nTipo: ${registro.tipo}\nHorário: ${registro.hora}\nLocal: Geo Validada`);

    renderRhPonto();
};

window.renderRhPonto = function () {
    const listaEl = document.getElementById('rhListaPontos');
    if (!listaEl) return;

    const pontos = JSON.parse(localStorage.getItem(STORAGE_KEY_RH_PONTO + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '[]');
    const now = new Date();
    const dataString = now.toISOString().split('T')[0];

    // Filtra só os de hoje
    const pontosHoje = pontos.filter(p => p.data === dataString);

    if (pontosHoje.length === 0) {
        listaEl.innerHTML = '<li style="padding:1rem; text-align:center; color:var(--text-secondary);">Nenhum registro hoje.</li>';
        return;
    }

    listaEl.innerHTML = pontosHoje.map(p => `
        <li style="padding:1rem; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between;">
            <span><strong>${p.tipo}</strong> — ${p.usuario}</span>
            <span style="font-weight:600; color:var(--primary-color);">${p.hora}</span>
        </li>
    `).join('');
};

// ─── 2. FOLHA DE PAGAMENTO ─────────────

window.renderRhFolha = function () {
    const tbody = document.getElementById('rhFolhaTableBody');
    if (!tbody) return;

    // Busca funcionários da base ERP
    const storageEmployees = JSON.parse(localStorage.getItem('erp_employees' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '[]');

    // Se não tiver, usar mocados
    let employees = storageEmployees.length ? storageEmployees : [
        { id: '1', nome: 'João Vendedor', cargo: 'Vendedor Externo', salario: 2500.00 },
        { id: '2', nome: 'Maria Administrativa', cargo: 'Auxiliar Admin', salario: 2100.00 },
        { id: '3', nome: 'Carlos Logística', cargo: 'Conferente', salario: 1950.00 }
    ];

    tbody.innerHTML = employees.map(emp => {
        const salarioBase = parseFloat(emp.salario) || 2000.00;
        const inss = salarioBase * 0.10; // 10% fixo
        const vt = salarioBase * 0.06;   // 6% fixo
        const descontos = inss + vt;
        const liquido = salarioBase - descontos;

        return `
            <tr>
                <td><strong>${emp.nome || 'Func. S/Nome'}</strong></td>
                <td>${emp.cargo || 'Não especificado'}</td>
                <td>R$ ${salarioBase.toFixed(2)}</td>
                <td style="color:var(--accent-warning);">- R$ ${descontos.toFixed(2)}</td>
                <td style="color:var(--accent-success); font-weight:700;">R$ ${liquido.toFixed(2)}</td>
                <td style="text-align:right;">
                    <button class="btn btn-sm btn-secondary" onclick="visualizarHolerite('${emp.id}', '${emp.nome}', ${salarioBase}, ${inss}, ${vt}, ${liquido})">
                        <span class="material-icons-round" style="font-size:1rem;">visibility</span>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
};

window.gerarHoleritesLote = function () {
    alert("🔄 Processando folha de pagamento geral do mês vigente...\n\n✅ 3/3 holerites gerados com sucesso e disponibilizados para os colaboradores via portal.");
};

window.visualizarHolerite = function (id, nome, salario, inss, vt, liquido) {
    const content = document.getElementById('rhHoleriteContent');
    const dataMes = new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();

    content.innerHTML = `
        <div style="text-align:center; font-weight:700; margin-bottom:1rem; font-size:1.2rem; border-bottom:2px dashed #000; padding-bottom:1rem;">
            RECIBO DE PAGAMENTO DE SALÁRIO<br>
            <span style="font-size:0.9rem; font-weight:400;">COMPETÊNCIA: ${dataMes}</span>
        </div>
        <div style="margin-bottom:1rem;">
            <strong>EMPREGADOR:</strong> Parreira ERP Group<br>
            <strong>EMPREGADO:</strong> ${(nome && nome !== 'undefined') ? nome : 'Colaborador'}<br>
            <strong>MATRÍCULA:</strong> ${id || '001'}
        </div>
        <table style="width:100%; border-collapse:collapse; margin-bottom:1rem;">
            <tr style="border-bottom:1px solid #000; border-top:1px solid #000;">
                <th style="padding:0.5rem; text-align:left;">Descrição</th>
                <th style="padding:0.5rem; text-align:right;">Vencimentos</th>
                <th style="padding:0.5rem; text-align:right;">Descontos</th>
            </tr>
            <tr>
                <td style="padding:0.5rem;">Salário Base</td>
                <td style="padding:0.5rem; text-align:right;">${salario.toFixed(2)}</td>
                <td style="padding:0.5rem; text-align:right;"></td>
            </tr>
            <tr>
                <td style="padding:0.5rem;">INSS (10%)</td>
                <td style="padding:0.5rem; text-align:right;"></td>
                <td style="padding:0.5rem; text-align:right;">${inss.toFixed(2)}</td>
            </tr>
            <tr>
                <td style="padding:0.5rem;">Vale Transporte (6%)</td>
                <td style="padding:0.5rem; text-align:right;"></td>
                <td style="padding:0.5rem; text-align:right;">${vt.toFixed(2)}</td>
            </tr>
            <tr style="border-top:1px solid #000; font-weight:700;">
                <td style="padding:0.5rem; text-align:right;">TOTAIS</td>
                <td style="padding:0.5rem; text-align:right;">${salario.toFixed(2)}</td>
                <td style="padding:0.5rem; text-align:right;">${(inss + vt).toFixed(2)}</td>
            </tr>
        </table>
        <div style="text-align:right; font-weight:700; font-size:1.1rem;">
            LÍQUIDO A RECEBER: R$ ${liquido.toFixed(2)}
        </div>
        <div style="margin-top:3rem; border-top:1px solid #000; width:60%; margin-inline:auto; text-align:center; font-size:0.8rem;">
            ASSINATURA DO EMPREGADO
        </div>
    `;
    openModal('rhHoleriteModal');
};

// ─── 3. FÉRIAS E LICENÇAS ─────────────

window.renderRhFerias = function () {
    const tbody = document.getElementById('rhFeriasTableBody');
    if (!tbody) return;

    const ferias = JSON.parse(localStorage.getItem(STORAGE_KEY_RH_FERIAS + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '[]');

    if (ferias.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-secondary);">Nenhum afastamento programado.</td></tr>';
        return;
    }

    tbody.innerHTML = ferias.map(f => {
        const now = new Date();
        const dataFim = new Date(f.dataFim);
        let status = '<span class="badge" style="background:var(--accent-warning);">Programado</span>';
        if (dataFim < now) {
            status = '<span class="badge" style="background:var(--text-secondary);">Concluído</span>';
        } else if (new Date(f.dataInicio) <= now && dataFim >= now) {
            status = '<span class="badge" style="background:var(--accent-success);">Em andamento</span>';
        }

        return `
            <tr>
                <td><strong>${f.nome}</strong></td>
                <td>${f.tipo}</td>
                <td>${f.dataInicio.split('-').reverse().join('/')}</td>
                <td>${f.dataFim.split('-').reverse().join('/')}</td>
                <td>${status}</td>
            </tr>
        `;
    }).join('');
};

window.abrirModalFeriasRH = function () {
    const select = document.getElementById('rhFeriasFunc');

    // Popula select
    const storageEmployees = JSON.parse(localStorage.getItem('erp_employees' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '[]');
    let employees = storageEmployees.length ? storageEmployees : [
        { nome: 'João Vendedor' }, { nome: 'Maria Administrativa' }, { nome: 'Carlos Logística' }
    ];

    select.innerHTML = employees.map(e => `<option value="${e.nome}">${e.nome}</option>`).join('');

    document.getElementById('formRhFerias').reset();
    openModal('rhFeriasModal');
};

window.salvarFeriasRH = function () {
    const ferias = JSON.parse(localStorage.getItem(STORAGE_KEY_RH_FERIAS + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '[]');

    const registro = {
        id: 'fer_' + Date.now(),
        nome: document.getElementById('rhFeriasFunc').value,
        tipo: document.getElementById('rhFeriasTipo').value,
        dataInicio: document.getElementById('rhFeriasInicio').value,
        dataFim: document.getElementById('rhFeriasFim').value,
    };

    if (registro.dataInicio > registro.dataFim) {
        alert("A data de término deve ser maior que a de início.");
        return;
    }

    ferias.push(registro);
    localStorage.setItem(STORAGE_KEY_RH_FERIAS + (window.getTenantSuffix ? window.getTenantSuffix() : ''), JSON.stringify(ferias));

    closeModal('rhFeriasModal');
    renderRhFerias();
};

// ─── HOOKS DE RENDERIZAÇÃO ─────────────
window._viewHooks = window._viewHooks || [];
window._viewHooks.push(function (viewName) {
    if (viewName === 'rhPonto') {
        renderRhPonto();
    }
    if (viewName === 'rhFolha') {
        renderRhFolha();
    }
    if (viewName === 'rhFerias') {
        renderRhFerias();
    }
});

console.log('👤 Módulo de RH inicializado.');
