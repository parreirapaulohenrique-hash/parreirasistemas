/* ═══════════════════════════════════════════════════════════
   Tabelas de Preço — Parreira ERP (Fase 4 - Comercial)
   Tabelas regionais de preço com 6 faixas (PVENDA1 a PVENDA6)
   ═══════════════════════════════════════════════════════════ */
'use strict';

const CadTabelasPreco = (() => {
    const STORAGE_KEY = 'erp_cad_tabelas_preco';

    // Mock inicial se vazio
    function initData() {
        let dados = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (!dados || dados.length === 0) {
            dados = [
                {
                    id: 1,
                    nome: "TABELA PADRÃO - ATACADO",
                    status: "Ativa",
                    regras: [
                        { regiao: "01", faixa1: 0, faixa2: 2, faixa3: 5, faixa4: 7, faixa5: 10, faixa6: 15 },
                        { regiao: "02", faixa1: 3, faixa2: 5, faixa3: 8, faixa4: 10, faixa5: 15, faixa6: 20 }
                    ]
                },
                {
                    id: 2,
                    nome: "TABELA PROMOCIONAL - VAREJO",
                    status: "Ativa",
                    regras: [
                        { regiao: "01", faixa1: -5, faixa2: -3, faixa3: 0, faixa4: 2, faixa5: 5, faixa6: 10 }
                    ]
                }
            ];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
        }
    }

    // ═════════════════════════════════════════════════════
    // RENDER PRINCIPAL
    // ═════════════════════════════════════════════════════
    function render() {
        initData();
        const container = document.getElementById('tabelasPreco-container');
        if (!container) return;

        const dados = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:1rem;">
                <div style="display:flex; gap:0.5rem; flex:1; max-width:400px;">
                    <input type="text" id="filtroTabelaPreco" class="form-input" style="flex:1;" placeholder="Buscar tabela..." onkeyup="if(event.key==='Enter') CadTabelasPreco.filtrar()">
                    <button class="btn btn-secondary" onclick="CadTabelasPreco.filtrar()">
                        <span class="material-icons-round">search</span>
                    </button>
                </div>
                <button class="btn btn-primary" onclick="CadTabelasPreco.novo()">
                    <span class="material-icons-round">add</span> Nova Tabela
                </button>
            </div>
            
            <div class="card" style="overflow-x:auto;">
                <table class="data-table" style="width:100%; min-width:600px;">
                    <thead>
                        <tr>
                            <th style="width:60px;">ID</th>
                            <th>Nome da Tabela</th>
                            <th style="width:100px;">Regiões</th>
                            <th style="width:100px;">Status</th>
                            <th style="width:100px; text-align:right;">Ações</th>
                        </tr>
                    </thead>
                    <tbody id="gridTabelasPreco">
                        ${gerarLinhasGrid(dados)}
                    </tbody>
                </table>
            </div>
            
            <!-- MODAL FORMULÁRIO -->
            <div id="modalTabelaPreco" class="modal-overlay" style="display:none; z-index:9999;">
                <div class="modal-content" style="max-width:800px; width:95%;">
                    <div class="modal-header">
                        <h3 id="modalTabelaPrecoTitulo">Formulário de Tabela de Preço</h3>
                        <button class="btn-icon" onclick="CadTabelasPreco.fecharModal()"><span class="material-icons-round">close</span></button>
                    </div>
                    <div class="modal-body">
                        <input type="hidden" id="formTabelaId">
                        
                        <div style="display:flex; gap:1rem; margin-bottom:1rem; flex-wrap:wrap;">
                            <div style="flex:2; min-width:250px;">
                                <label style="display:block; margin-bottom:0.3rem;">Nome da Tabela</label>
                                <input type="text" id="formTabelaNome" class="form-input" style="width:100%;">
                            </div>
                            <div style="width:120px;">
                                <label style="display:block; margin-bottom:0.3rem;">Status</label>
                                <select id="formTabelaStatus" class="form-input" style="width:100%;">
                                    <option value="Ativa">Ativa</option>
                                    <option value="Inativa">Inativa</option>
                                </select>
                            </div>
                        </div>
                        
                        <h4 style="margin-top:1.5rem; margin-bottom:1rem; border-bottom:1px solid var(--border-color); padding-bottom:0.5rem;">
                            Faixas de Preço por Região (%)
                        </h4>
                        
                        <div style="margin-bottom:1rem; display:flex; gap:0.5rem;">
                            <button class="btn btn-secondary btn-sm" onclick="CadTabelasPreco.addRegra()">
                                <span class="material-icons-round" style="font-size:1rem;">add</span> Adicionar Região
                            </button>
                        </div>
                        
                        <div style="overflow-x:auto; border:1px solid var(--border-color); border-radius:4px;">
                            <table class="data-table" style="width:100%; min-width:700px; font-size:0.8rem;">
                                <thead>
                                    <tr>
                                        <th style="width:120px;">Cód Região</th>
                                        <th>Faixa 1 (%)</th>
                                        <th>Faixa 2 (%)</th>
                                        <th>Faixa 3 (%)</th>
                                        <th>Faixa 4 (%)</th>
                                        <th>Faixa 5 (%)</th>
                                        <th>Faixa 6 (%)</th>
                                        <th style="width:50px;">Exc</th>
                                    </tr>
                                </thead>
                                <tbody id="gridTabelaRegras">
                                    <!-- JS Renderiza Regras -->
                                </tbody>
                            </table>
                        </div>
                        <p style="font-size:0.7rem; color:var(--text-secondary); margin-top:0.5rem;">
                            * Informe o percentual de acréscimo (+) ou desconto (-) aplicado ao preço base do produto.
                        </p>
                        
                    </div>
                    <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:1rem;">
                        <button class="btn btn-secondary" onclick="CadTabelasPreco.fecharModal()">Cancelar</button>
                        <button class="btn btn-primary" onclick="CadTabelasPreco.salvar()">Salvar Tabela</button>
                    </div>
                </div>
            </div>
        `;
    }

    function gerarLinhasGrid(lista) {
        if (lista.length === 0) return '<tr><td colspan="5" style="text-align:center; padding:2rem;">Nenhuma tabela cadastrada.</td></tr>';

        return lista.map(item => `
            <tr style="border-bottom:1px solid var(--border-color);">
                <td style="font-weight:bold;">${item.id}</td>
                <td>${item.nome}</td>
                <td>${(item.regras || []).length} região(ões)</td>
                <td><span class="status-badge ${item.status === 'Ativa' ? 'status-shipped' : 'status-overdue'}">${item.status}</span></td>
                <td style="text-align:right;">
                    <button class="btn btn-secondary btn-icon" style="padding:0.3rem;" onclick="CadTabelasPreco.editar(${item.id})" title="Editar">
                        <span class="material-icons-round" style="font-size:1.1rem;">edit</span>
                    </button>
                    <button class="btn btn-secondary btn-icon" style="padding:0.3rem; border-color:var(--danger-color); color:var(--danger-color);" onclick="CadTabelasPreco.excluir(${item.id})" title="Excluir">
                        <span class="material-icons-round" style="font-size:1.1rem;">delete</span>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    function filtrar() {
        const termo = document.getElementById('filtroTabelaPreco').value.toLowerCase();
        const dados = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        const filtrados = dados.filter(i => i.nome.toLowerCase().includes(termo) || i.id.toString() === termo);
        document.getElementById('gridTabelasPreco').innerHTML = gerarLinhasGrid(filtrados);
    }

    // ═════════════════════════════════════════════════════
    // OPERAÇÕES DO MODAL
    // ═════════════════════════════════════════════════════
    let regrasAtuais = [];

    function abrirModal(titulo) {
        document.getElementById('modalTabelaPrecoTitulo').textContent = titulo;
        document.getElementById('modalTabelaPreco').style.display = 'flex';
    }

    function fecharModal() {
        document.getElementById('modalTabelaPreco').style.display = 'none';
        regrasAtuais = [];
    }

    function renderRegras() {
        const tbody = document.getElementById('gridTabelaRegras');
        if (regrasAtuais.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:1rem; color:var(--text-secondary);">Nenhuma região configurada.</td></tr>';
            return;
        }

        tbody.innerHTML = regrasAtuais.map((r, idx) => `
            <tr>
                <td><input type="text" class="form-input regra-regiao" style="width:100%; padding:0.3rem;" value="${r.regiao || ''}" placeholder="Cód"></td>
                <td><input type="number" step="0.01" class="form-input regra-f1" style="width:100%; padding:0.3rem; text-align:right;" value="${r.faixa1 || 0}"></td>
                <td><input type="number" step="0.01" class="form-input regra-f2" style="width:100%; padding:0.3rem; text-align:right;" value="${r.faixa2 || 0}"></td>
                <td><input type="number" step="0.01" class="form-input regra-f3" style="width:100%; padding:0.3rem; text-align:right;" value="${r.faixa3 || 0}"></td>
                <td><input type="number" step="0.01" class="form-input regra-f4" style="width:100%; padding:0.3rem; text-align:right;" value="${r.faixa4 || 0}"></td>
                <td><input type="number" step="0.01" class="form-input regra-f5" style="width:100%; padding:0.3rem; text-align:right;" value="${r.faixa5 || 0}"></td>
                <td><input type="number" step="0.01" class="form-input regra-f6" style="width:100%; padding:0.3rem; text-align:right;" value="${r.faixa6 || 0}"></td>
                <td style="text-align:center;">
                    <button class="btn btn-icon" style="color:var(--danger-color); padding:0.2rem;" onclick="CadTabelasPreco.removerRegra(${idx})">
                        <span class="material-icons-round" style="font-size:1rem;">delete</span>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    function addRegra() {
        colherRegrasDaTela();
        regrasAtuais.push({ regiao: "", faixa1: 0, faixa2: 0, faixa3: 0, faixa4: 0, faixa5: 0, faixa6: 0 });
        renderRegras();
    }

    function removerRegra(idx) {
        colherRegrasDaTela();
        regrasAtuais.splice(idx, 1);
        renderRegras();
    }

    function colherRegrasDaTela() {
        const linhas = document.querySelectorAll('#gridTabelaRegras tr');
        let novasRegras = [];
        linhas.forEach(tr => {
            const inputs = tr.querySelectorAll('input');
            if (inputs.length < 7) return; // ignora linha de placeholder
            novasRegras.push({
                regiao: inputs[0].value,
                faixa1: parseFloat(inputs[1].value || 0),
                faixa2: parseFloat(inputs[2].value || 0),
                faixa3: parseFloat(inputs[3].value || 0),
                faixa4: parseFloat(inputs[4].value || 0),
                faixa5: parseFloat(inputs[5].value || 0),
                faixa6: parseFloat(inputs[6].value || 0)
            });
        });
        regrasAtuais = novasRegras;
    }

    function novo() {
        document.getElementById('formTabelaId').value = '';
        document.getElementById('formTabelaNome').value = '';
        document.getElementById('formTabelaStatus').value = 'Ativa';
        regrasAtuais = [];
        renderRegras();
        abrirModal('Nova Tabela de Preço');
    }

    function editar(id) {
        const dados = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        const t = dados.find(x => x.id == id);
        if (!t) return;

        document.getElementById('formTabelaId').value = t.id;
        document.getElementById('formTabelaNome').value = t.nome;
        document.getElementById('formTabelaStatus').value = t.status;

        // Clone profundo para não alterar direto
        regrasAtuais = JSON.parse(JSON.stringify(t.regras || []));

        renderRegras();
        abrirModal(`Editar Tabela - #${t.id}`);
    }

    function salvar() {
        const id = document.getElementById('formTabelaId').value;
        const nome = document.getElementById('formTabelaNome').value.trim();
        const status = document.getElementById('formTabelaStatus').value;

        if (!nome) return alert('Informe o nome da tabela.');

        colherRegrasDaTela();

        // valida regras vazias
        if (regrasAtuais.some(r => !r.regiao)) return alert('Preencha o código da região em todas as linhas de faixa.');

        let dados = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];

        if (id) {
            const idx = dados.findIndex(x => x.id == id);
            if (idx >= 0) {
                dados[idx].nome = nome;
                dados[idx].status = status;
                dados[idx].regras = regrasAtuais;
            }
        } else {
            const maxId = dados.reduce((m, x) => Math.max(m, x.id), 0);
            dados.push({
                id: maxId + 1,
                nome,
                status,
                regras: regrasAtuais
            });
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
        fecharModal();
        filtrar();
    }

    function excluir(id) {
        if (!confirm(`Deseja realmente excluir a tabela #${id}?`)) return;
        let dados = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        dados = dados.filter(x => x.id != id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
        filtrar();
    }

    // Registrar viewHook para renderizar quando usuário clicar no menu
    window._viewHooks = window._viewHooks || [];
    window._viewHooks.push(viewId => {
        if (viewId === 'tabelasPreco') render();
    });

    console.log('💰 Módulo Tabelas de Preço Inicializado.');

    return { render, novo, editar, salvar, excluir, filtrar, fecharModal, addRegra, removerRegra };
})();
