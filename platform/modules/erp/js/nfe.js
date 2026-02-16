/**
 * NF-e Module - Integração SEFAZ
 * Parreira ERP Core
 * 
 * Este módulo gerencia a emissão e transmissão de NF-e
 * através de APIs de terceiros (Focus NFe, NFE.io, etc.)
 * 
 * IMPORTANTE: O certificado digital é do CLIENTE (empresa emissora),
 * não do sistema ERP. O cliente cadastra o certificado na plataforma
 * da API escolhida, e o ERP faz as chamadas REST.
 */

// =========================================
// CONFIGURAÇÃO DA API DE NF-e
// =========================================

const NFE_CONFIG = {
    // Provedor padrão: 'focusnfe', 'nfeio', 'webmania', 'tecnospeed'
    provider: 'focusnfe',

    // Ambiente: 'homologacao' (testes) ou 'producao'
    ambiente: 'homologacao',

    // URLs base por provedor
    urls: {
        focusnfe: {
            homologacao: 'https://homologacao.focusnfe.com.br/v2',
            producao: 'https://api.focusnfe.com.br/v2'
        },
        nfeio: {
            homologacao: 'https://api.nfe.io/v1/companies',
            producao: 'https://api.nfe.io/v1/companies'
        }
    },

    // Token de acesso (cadastrado por empresa)
    // Em produção, isso viria do cadastro da empresa no ERP
    getToken: function () {
        const empresaAtiva = JSON.parse(localStorage.getItem('erp_empresa_ativa') || '{}');
        return empresaAtiva.nfe_token || '';
    },

    // Retorna a URL base conforme ambiente
    getBaseUrl: function () {
        return this.urls[this.provider]?.[this.ambiente] || '';
    }
};

// =========================================
// FUNÇÕES DE BUSCA E FILTRO
// =========================================

/**
 * Busca notas fiscais conforme filtros da tela
 */
window.buscarNotasFiscais = function () {
    const filtros = {
        empresa: document.getElementById('nfeEmpresa')?.value || '01',
        periodoIni: document.getElementById('nfePeriodoIni')?.value,
        periodoFim: document.getElementById('nfePeriodoFim')?.value,
        nota: document.getElementById('nfeNota')?.value,
        pedido: document.getElementById('nfePedido')?.value,
        frete: document.getElementById('nfeFrete')?.value,
        tipoOp: document.getElementById('nfeTipoOp')?.value,
        tipoDoc: document.getElementById('nfeTipoDoc')?.value,
        carregamento: document.getElementById('nfeCarreg')?.value,
        codCliente: document.getElementById('nfeCodCliente')?.value,
        razaoSocial: document.getElementById('nfeRazaoSocial')?.value
    };

    console.log('Buscando NF-e com filtros:', filtros);

    // Buscar dados do localStorage (mock) ou API futura
    const notas = carregarNotasFiscais(filtros);

    // Renderizar nas grids conforme status
    renderizarNotasTransmitir(notas.filter(n => n.status === 'pendente'));
    renderizarNotasEmTransmissao(notas.filter(n => n.status === 'transmitindo'));
    renderizarNotasDanfe(notas.filter(n => n.status === 'autorizada'));
    renderizarNotasRelatorio(notas);

    showToast('Busca realizada com sucesso!', 'success');
};

/**
 * Carrega notas fiscais do localStorage ou gera mock para demonstração
 */
function carregarNotasFiscais(filtros) {
    let notas = JSON.parse(localStorage.getItem('erp_nfe_notas') || '[]');

    // Se não há notas, gerar mock para demonstração
    if (notas.length === 0) {
        notas = gerarNotasMock();
        localStorage.setItem('erp_nfe_notas', JSON.stringify(notas));
    }

    // Aplicar filtros
    if (filtros.periodoIni) {
        notas = notas.filter(n => n.dtEmissao >= filtros.periodoIni);
    }
    if (filtros.periodoFim) {
        notas = notas.filter(n => n.dtEmissao <= filtros.periodoFim);
    }
    if (filtros.codCliente) {
        notas = notas.filter(n => n.codCliente == filtros.codCliente);
    }

    return notas;
}

/**
 * Gera notas fiscais de demonstração
 */
function gerarNotasMock() {
    const clientes = [
        { codigo: 1556, nome: 'A C F DE CARVALHO COM. DE PEÇAS' },
        { codigo: 714, nome: 'DANIEL CARVALHO MAGALHÃES' },
        { codigo: 5, nome: 'COELHOTEMPONI LTDA-ME' },
        { codigo: 892, nome: 'DANIEL SOUSA GONÇALVES' },
        { codigo: 1016, nome: 'JOAO EDUARDO ALVES RAMOS' },
        { codigo: 791, nome: 'IVONE F MIRANDA' },
        { codigo: 406, nome: 'FLAVIO MARQUES MESSIAS' },
        { codigo: 129, nome: 'RICARDO MOTOS COMERCIO' }
    ];

    const notas = [];
    const hoje = new Date().toISOString().split('T')[0];

    for (let i = 0; i < 20; i++) {
        const cliente = clientes[Math.floor(Math.random() * clientes.length)];
        const numNota = 49162 + i;
        const pedido = 63622 + i;
        const status = ['pendente', 'autorizada', 'autorizada', 'autorizada'][Math.floor(Math.random() * 4)];

        notas.push({
            id: `nfe_${numNota}`,
            empresa: '01',
            numNota: numNota,
            serie: 1,
            dtEmissao: hoje,
            dtSaida: hoje,
            pedido: pedido,
            carregamento: 40441 + i,
            impresso: status === 'autorizada' ? 'Sim' : 'Não',
            placaVeiculo: '',
            codCliente: cliente.codigo,
            cliente: cliente.nome,
            valorNF: (Math.random() * 1000 + 50).toFixed(2),
            status: status,
            statusDesc: status === 'autorizada' ? 'Autorizado o uso da NF-e' : 'Pendente de transmissão',
            dtGeracao: hoje,
            chaveAcesso: status === 'autorizada' ? `215260005${String(numNota).padStart(9, '0')}` : '',
            protocolo: status === 'autorizada' ? `1526000057${i}` : '',
            cNFe: status === 'autorizada' ? '100' : ''
        });
    }

    return notas;
}

// =========================================
// RENDERIZAÇÃO DAS GRIDS
// =========================================

function renderizarNotasTransmitir(notas) {
    const tbody = document.getElementById('nfeTransmitirTableBody');
    if (!tbody) return;

    if (notas.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="13" style="text-align:center; padding:2rem; color:var(--text-secondary);">
                <span class="material-icons-round" style="font-size:2rem; vertical-align:middle;">check_circle</span>
                <span style="margin-left:0.5rem;">Nenhuma nota fiscal pendente de transmissão</span>
            </td></tr>
        `;
        return;
    }

    tbody.innerHTML = notas.map(n => `
        <tr>
            <td><input type="checkbox" name="nfeSelect" value="${n.id}"></td>
            <td>${n.empresa}</td>
            <td style="font-weight:600;">${n.numNota}</td>
            <td>${formatarData(n.dtEmissao)}</td>
            <td>${formatarData(n.dtSaida)}</td>
            <td>${n.pedido}</td>
            <td>${n.carregamento}</td>
            <td>${n.placaVeiculo || '-'}</td>
            <td>${n.codCliente}</td>
            <td>${n.cliente}</td>
            <td><span class="status-badge status-pending">Pendente</span></td>
            <td>${formatarData(n.dtGeracao)}</td>
            <td style="font-size:0.75rem;">${n.chaveAcesso || '-'}</td>
        </tr>
    `).join('');
}

function renderizarNotasEmTransmissao(notas) {
    const tbody = document.getElementById('nfeEmTransmissaoTableBody');
    if (!tbody) return;

    document.getElementById('qtdEmTransmissao').textContent = notas.length;

    if (notas.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-secondary);">
                <span class="material-icons-round" style="font-size:2rem; vertical-align:middle;">check_circle</span>
                <span style="margin-left:0.5rem;">Nenhuma nota em transmissão no momento</span>
            </td></tr>
        `;
        return;
    }

    tbody.innerHTML = notas.map(n => `
        <tr>
            <td>${n.empresa}</td>
            <td style="font-weight:600;">${n.numNota}</td>
            <td>${n.carregamento}</td>
            <td>${n.cNFe || '-'}</td>
            <td><span class="status-badge status-pending">Transmitindo...</span></td>
            <td style="font-size:0.75rem;">${n.chaveAcesso || 'Aguardando...'}</td>
        </tr>
    `).join('');
}

function renderizarNotasDanfe(notas) {
    const tbody = document.getElementById('nfeDanfeTableBody');
    if (!tbody) return;

    if (notas.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="12" style="text-align:center; padding:2rem; color:var(--text-secondary);">
                <span class="material-icons-round" style="font-size:2rem; vertical-align:middle;">description</span>
                <span style="margin-left:0.5rem;">Nenhuma nota autorizada encontrada</span>
            </td></tr>
        `;
        return;
    }

    tbody.innerHTML = notas.map(n => `
        <tr>
            <td>${n.empresa}</td>
            <td style="font-weight:600;">${n.numNota}</td>
            <td>${n.pedido}</td>
            <td>${n.carregamento}</td>
            <td>${n.impresso}</td>
            <td>${formatarData(n.dtEmissao)}</td>
            <td>${formatarData(n.dtGeracao)}</td>
            <td><span class="status-badge status-shipped">Autorizada</span></td>
            <td>${n.codCliente}</td>
            <td>${n.cliente}</td>
            <td style="font-size:0.75rem;">${n.protocolo}</td>
            <td style="text-align:right;">
                <div class="dropdown" style="display:inline-block;">
                    <button class="btn btn-secondary btn-icon" style="padding:0.3rem;" onclick="toggleNfeMenu(this)">
                        <span class="material-icons-round" style="font-size:1rem;">more_vert</span>
                    </button>
                    <div class="dropdown-menu">
                        <a onclick="visualizarXml('${n.id}')"><span class="material-icons-round">code</span> Visualizar XML</a>
                        <a onclick="imprimirDanfe('${n.id}')"><span class="material-icons-round">print</span> Imprimir DANFE</a>
                        <a onclick="downloadXml('${n.id}')"><span class="material-icons-round">download</span> Download XML</a>
                        <a onclick="abrirCartaCorrecao('${n.id}')"><span class="material-icons-round">edit_note</span> Carta de Correção</a>
                        <a onclick="cancelarNfe('${n.id}')" style="color:var(--accent-danger);"><span class="material-icons-round">cancel</span> Cancelar NF-e</a>
                    </div>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderizarNotasRelatorio(notas) {
    const tbody = document.getElementById('nfeRelatorioTableBody');
    if (!tbody) return;

    // Filtrar por situação selecionada
    const situacao = document.querySelector('input[name="situacaoSefaz"]:checked')?.value || 'autorizada';
    let notasFiltradas = notas;

    if (situacao === 'autorizada') {
        notasFiltradas = notas.filter(n => n.status === 'autorizada');
    } else if (situacao === 'cancelada') {
        notasFiltradas = notas.filter(n => n.status === 'cancelada');
    }

    // Atualizar totalizadores
    document.getElementById('relDocumentos').textContent = notasFiltradas.length;
    const valorTotal = notasFiltradas.reduce((sum, n) => sum + parseFloat(n.valorNF || 0), 0);
    document.getElementById('relValorTotal').textContent = `R$ ${valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

    if (notasFiltradas.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="13" style="text-align:center; padding:2rem; color:var(--text-secondary);">
                <span class="material-icons-round" style="font-size:2rem; vertical-align:middle;">assessment</span>
                <span style="margin-left:0.5rem;">Nenhuma nota encontrada para esta situação</span>
            </td></tr>
        `;
        return;
    }

    tbody.innerHTML = notasFiltradas.map((n, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>S</td>
            <td>${n.empresa}</td>
            <td style="font-weight:600;">${n.numNota}</td>
            <td>${n.serie}</td>
            <td>${formatarData(n.dtEmissao)}</td>
            <td>${n.codCliente}</td>
            <td>${n.cliente}</td>
            <td style="text-align:right;">R$ ${parseFloat(n.valorNF).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td>${formatarData(n.dtGeracao)}</td>
            <td>${n.cNFe || '-'}</td>
            <td><span class="status-badge status-shipped">${n.statusDesc}</span></td>
            <td style="font-size:0.7rem;">${n.chaveAcesso?.substring(0, 15)}...</td>
        </tr>
    `).join('');
}

// =========================================
// TRANSMISSÃO DE NF-e
// =========================================

/**
 * Transmite as notas selecionadas para a SEFAZ
 */
window.transmitirNFeSelecionadas = async function () {
    const checkboxes = document.querySelectorAll('input[name="nfeSelect"]:checked');
    if (checkboxes.length === 0) {
        showToast('Selecione ao menos uma nota para transmitir', 'warning');
        return;
    }

    const ids = Array.from(checkboxes).map(cb => cb.value);

    if (!confirm(`Confirma a transmissão de ${ids.length} nota(s) fiscal(is)?`)) {
        return;
    }

    showToast(`Iniciando transmissão de ${ids.length} nota(s)...`, 'info');

    // Simular processo de transmissão
    for (const id of ids) {
        await transmitirNota(id);
    }

    showToast('Transmissão concluída! Verifique a aba "Retorno" para o resultado.', 'success');
    buscarNotasFiscais();
};

/**
 * Transmite uma nota individual para a SEFAZ via API
 */
async function transmitirNota(notaId) {
    // Em produção, aqui seria a chamada para a API
    // Ex: await fetch(`${NFE_CONFIG.getBaseUrl()}/nfe`, { method: 'POST', ... })

    // Simulação: atualizar status da nota
    const notas = JSON.parse(localStorage.getItem('erp_nfe_notas') || '[]');
    const nota = notas.find(n => n.id === notaId);

    if (nota) {
        nota.status = 'autorizada';
        nota.statusDesc = 'Autorizado o uso da NF-e';
        nota.chaveAcesso = `21526000${nota.numNota}${Date.now().toString().slice(-6)}`;
        nota.protocolo = `1526000${Date.now().toString().slice(-6)}`;
        nota.cNFe = '100';
        nota.dtGeracao = new Date().toISOString().split('T')[0];

        localStorage.setItem('erp_nfe_notas', JSON.stringify(notas));
    }

    // Simular delay de comunicação com SEFAZ
    await new Promise(resolve => setTimeout(resolve, 500));

    return { success: true, nota };
}

// =========================================
// OPERAÇÕES COM NF-e AUTORIZADA
// =========================================

window.imprimirDanfe = function (notaId) {
    showToast('Gerando DANFE para impressão...', 'info');
    // Em produção: buscar PDF do DANFE na API
    console.log('Imprimir DANFE:', notaId);

    setTimeout(() => {
        showToast('DANFE gerado! Abrindo impressão...', 'success');
    }, 1000);
};

window.downloadXml = function (notaId) {
    showToast('Baixando XML da NF-e...', 'info');
    // Em produção: buscar XML na API
    console.log('Download XML:', notaId);

    setTimeout(() => {
        showToast('XML baixado com sucesso!', 'success');
    }, 500);
};

window.abrirCartaCorrecao = function (notaId) {
    const motivo = prompt('Digite o motivo da Carta de Correção (CC-e):');
    if (motivo && motivo.length >= 15) {
        showToast('Carta de Correção enviada para a SEFAZ...', 'info');
        // Em produção: POST para API de CC-e
        setTimeout(() => {
            showToast('Carta de Correção autorizada!', 'success');
        }, 1000);
    } else if (motivo) {
        showToast('O motivo deve ter no mínimo 15 caracteres', 'warning');
    }
};

window.cancelarNfe = function (notaId) {
    const justificativa = prompt('Digite a justificativa do cancelamento (mínimo 15 caracteres):');
    if (justificativa && justificativa.length >= 15) {
        if (confirm('Tem certeza que deseja CANCELAR esta NF-e? Esta ação é irreversível.')) {
            showToast('Enviando cancelamento para a SEFAZ...', 'info');
            // Em produção: POST para API de cancelamento
            setTimeout(() => {
                showToast('NF-e cancelada com sucesso!', 'success');
                buscarNotasFiscais();
            }, 1500);
        }
    } else if (justificativa) {
        showToast('A justificativa deve ter no mínimo 15 caracteres', 'warning');
    }
};

window.imprimirDANFESelecionadas = function () {
    showToast('Gerando DANFEs selecionados...', 'info');
};

window.downloadXMLSelecionadas = function () {
    showToast('Baixando XMLs selecionados...', 'info');
};

// =========================================
// CONSULTAS E RETORNOS
// =========================================

window.consultarRetornoSEFAZ = function () {
    showToast('Consultando retornos na SEFAZ...', 'info');
    // Em produção: GET para API de consulta
    setTimeout(() => {
        showToast('Consulta realizada! Nenhum retorno pendente.', 'success');
    }, 1000);
};

window.reprocessarNotas = function () {
    showToast('Reprocessando notas pendentes...', 'info');
    setTimeout(() => {
        showToast('Reprocessamento concluído!', 'success');
    }, 1500);
};

window.exportarRelatorioNFe = function () {
    showToast('Exportando relatório...', 'info');
    // Em produção: gerar CSV/Excel
    setTimeout(() => {
        showToast('Relatório exportado!', 'success');
    }, 1000);
};

// =========================================
// XML VIEWER
// =========================================
window.visualizarXml = function (id) {
    const xml = window.generateNfeXml(id);
    document.getElementById('xmlContent').value = xml;
    openModal('xmlModal');
};

window.copyXml = function () {
    const content = document.getElementById('xmlContent');
    content.select();
    document.execCommand('copy');
    showToast('XML copiado para a área de transferência!', 'success');
};

window.downloadXmlFile = function () {
    const content = document.getElementById('xmlContent').value;
    const blob = new Blob([content], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nfe_${Date.now()}.xml`;
    a.click();
    showToast('Download iniciado!', 'success');
};

// =========================================
// UTILITÁRIOS
// =========================================

function formatarData(data) {
    if (!data) return '-';
    const d = new Date(data + 'T00:00:00');
    return d.toLocaleDateString('pt-BR');
}

window.toggleNfeMenu = function (btn) {
    const menu = btn.nextElementSibling;
    document.querySelectorAll('.dropdown-menu').forEach(m => {
        if (m !== menu) m.style.display = 'none';
    });
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
};

// Fechar menus ao clicar fora
document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown')) {
        document.querySelectorAll('.dropdown-menu').forEach(m => m.style.display = 'none');
    }
});

// =========================================
// TOAST NOTIFICATIONS (se não existir)
// =========================================
if (typeof showToast !== 'function') {
    window.showToast = function (message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);
        // Criar toast simples se não houver implementação
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = message;
        toast.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; padding: 1rem 1.5rem;
            background: ${type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : type === 'error' ? '#ef4444' : '#3b82f6'};
            color: white; border-radius: 8px; z-index: 10000; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            animation: slideIn 0.3s ease;
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    };
}

console.log('✅ Módulo NF-e carregado - Versão 1.0');
