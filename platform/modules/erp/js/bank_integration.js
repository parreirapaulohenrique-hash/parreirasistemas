// ===========================================
// INTEGRAÇÃO BANCÁRIA (Simulação)
// Boletos e CNAB 400/240
// ===========================================

// ===========================================
// 1. EMISSÃO DE BOLETOS
// ===========================================
window.renderBoletoEmissao = function () {
    const tbody = document.getElementById('boletoTableBody');
    if (!tbody) return;

    // Load Receivables
    const contas = JSON.parse(localStorage.getItem('erp_receber') || '[]');
    // Filter: Aberto or Em Atraso
    const pendentes = contas.filter(c => c.status !== 'Pago');

    if (pendentes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem;">Nenhuma conta pendente para gerar boleto.</td></tr>`;
        return;
    }

    tbody.innerHTML = pendentes.map(c => `
        <tr>
            <td><input type="checkbox" class="boleto-check" value="${c.id}"></td>
            <td>${c.cliente || '-'}</td>
            <td>${c.descricao || '-'}</td>
            <td>${new Date(c.vencimento).toLocaleDateString('pt-BR')}</td>
            <td>${parseFloat(c.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
            <td><span class="status-badge ${c.status === 'Em Atraso' ? 'status-danger' : 'status-warning'}">${c.status}</span></td>
            <td style="text-align:right;">
                <button class="btn btn-sm btn-primary" onclick="openBoletoModal('${c.id}')">
                    <span class="material-icons-round">receipt_long</span> Gerar Boleto
                </button>
            </td>
        </tr>
    `).join('');
};

// ===========================================
// 2. VISUALIZAÇÃO DO BOLETO (Simulado)
// ===========================================
window.openBoletoModal = function (id) {
    const contas = JSON.parse(localStorage.getItem('erp_receber') || '[]');
    const conta = contas.find(c => c.id === id);
    if (!conta) return;

    // Simulate Nosso Número and Barcode
    const nossoNumero = Math.floor(Math.random() * 10000000000).toString().padStart(10, '0');
    const linhaDigitavel = `34191.09008 ${nossoNumero.substr(0, 5)}.${nossoNumero.substr(5, 5)} 40123.456000 1 890100000${(conta.valor * 100).toFixed(0).padStart(10, '0')}`;

    // Fill Modal
    const modal = document.getElementById('boletoModal');
    const content = document.getElementById('boletoContent');

    content.innerHTML = `
        <div style="border:1px solid #000; padding:20px; font-family: 'Courier New', monospace; background:#fff;">
            <div style="display:flex; justify-content:space-between; border-bottom:2px solid #000; padding-bottom:10px; margin-bottom:10px;">
                <div style="font-weight:bold; font-size:1.2rem;">BANCO MOCK S.A. | 341-7</div>
                <div style="font-weight:bold; font-size:1.2rem;">${linhaDigitavel}</div>
            </div>
            
            <div style="display:grid; grid-template-columns: 2fr 1fr; gap:10px;">
                <div style="border-right:1px solid #ccc; padding-right:10px;">
                    <p><strong>Beneficiário:</strong> LT DISTRIBUIDORA LTDA</p>
                    <p><strong>Agência/Código:</strong> 1234 / 56789-0</p>
                    <p><strong>Pagador:</strong> ${conta.cliente}</p>
                    <p><strong>Nosso Número:</strong> ${nossoNumero}</p>
                </div>
                <div>
                    <p><strong>Vencimento:</strong> ${new Date(conta.vencimento).toLocaleDateString('pt-BR')}</p>
                    <p><strong>Valor do Documento:</strong> ${parseFloat(conta.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                    <p><strong>Data Documento:</strong> ${new Date().toLocaleDateString('pt-BR')}</p>
                </div>
            </div>
            
            <div style="margin-top:20px; border-top:1px dashed #000; padding-top:10px; text-align:center;">
                <p>Autenticação Mecânica</p>
                <div style="background:#eee; height:50px; margin:10px auto; width:80%; display:flex; align-items:center; justify-content:center; letter-spacing:5px; font-weight:bold;">
                    ||| || ||| || |||| ||| || || |||| ||| || ||
                </div>
            </div>
        </div>
    `;

    openModal('boletoModal');
};

// ===========================================
// 3. REMESSA CNAB 400 (Mock)
// ===========================================
window.gerarRemessaCNAB = function () {
    const checks = document.querySelectorAll('.boleto-check:checked');
    if (checks.length === 0) {
        alert('Selecione pelo menos uma conta para gerar a remessa.');
        return;
    }

    const ids = Array.from(checks).map(c => c.value);
    const contas = JSON.parse(localStorage.getItem('erp_receber') || '[]');
    const selecionadas = contas.filter(c => ids.includes(c.id));

    // Header do Arquivo (Mock CNAB 400)
    let cnab = `01REMESSA01COBRANCA       341BANCO ITAU S.A.      ${new Date().toISOString().slice(0, 10).replace(/-/g, '')}000001\n`;

    // Detalhes
    selecionadas.forEach((c, idx) => {
        // Mock line content typically 400 chars
        cnab += `1${String(idx + 1).padStart(5, '0')}${c.cliente.padEnd(30, ' ').substring(0, 30)}${c.valor.toFixed(2).replace('.', '').padStart(13, '0')}${new Date(c.vencimento).toISOString().slice(0, 10).replace(/-/g, '')}\n`;
    });

    // Trailer
    cnab += `9${String(selecionadas.length + 2).padStart(5, '0').padEnd(394, ' ')}`;

    // Show output
    document.getElementById('remessaOutput').value = cnab;
    openModal('remessaModal');
};

// ===========================================
// 4. PROCESSAR RETORNO (Mock)
// ===========================================
window.processarRetorno = function () {
    const content = document.getElementById('retornoInput').value;
    if (!content.trim()) {
        alert('Cole o conteúdo do arquivo de retorno.');
        return;
    }

    // Mock parsing: Just looks for lines starting with '1' and assumes they are paid
    // In a real scenario, we would parse Nosso Número.
    // Here, let's just pretend we paid the first 3 "Aberto" bills just for demo,
    // OR we can try to parse something.
    // Let's implement a "Simulate Upload" that randomly pays pending bills for demo purposes.

    if (confirm('Simulação: O sistema irá processar o retorno e baixar as contas identificadas. Confirmar?')) {
        const contas = JSON.parse(localStorage.getItem('erp_receber') || '[]');
        let count = 0;

        // Randomly pay 50% of open bills
        contas.forEach(c => {
            if (c.status !== 'Pago' && Math.random() > 0.5) {
                c.status = 'Pago';
                c.dataPagamento = new Date().toISOString();
                count++;
            }
        });

        localStorage.setItem('erp_receber', JSON.stringify(contas));
        renderBoletoEmissao(); // Refresh grid
        alert(`Retorno processado com sucesso! ${count} títulos liquidados.`);
        document.getElementById('retornoInput').value = '';
    }
};
