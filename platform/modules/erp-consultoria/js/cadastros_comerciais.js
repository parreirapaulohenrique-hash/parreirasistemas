/* ═══════════════════════════════════════════════════════════
   Cadastros Comerciais — Parreira ERP (Fase 12.1)
   Vendedores, Transportadoras, Marcas, Regiões, Rotas, Tabelas de Preço
   ═══════════════════════════════════════════════════════════ */
'use strict';

const CadComercial = (() => {

    // ─── Entity Definitions ───────────────────────────────────
    const ENTITIES = {
        vendedores: {
            key: 'erp_vendedores',
            title: 'Vendedores / RCA',
            icon: 'support_agent',
            fields: [
                { id: 'codigo', label: 'Código', type: 'number', width: '80px', required: true },
                { id: 'nome', label: 'Nome', type: 'text', width: '200px', required: true },
                { id: 'cpf', label: 'CPF', type: 'text', width: '130px' },
                { id: 'telefone', label: 'Telefone', type: 'text', width: '130px' },
                { id: 'email', label: 'E-mail', type: 'email', width: '180px' },
                { id: 'regiao', label: 'Região', type: 'text', width: '120px' },
                { id: 'metaMensal', label: 'Meta Mensal', type: 'number', width: '110px' },
                { id: 'comissao', label: '% Comissão', type: 'number', width: '100px', step: '0.01' },
                { id: 'descontoMax', label: '% Desc. Max', type: 'number', width: '100px', step: '0.01' },
                { id: 'supervisor', label: 'Supervisor', type: 'text', width: '150px' },
                { id: 'ativo', label: 'Ativo', type: 'checkbox', width: '60px', default: true }
            ]
        },
        transportadoras: {
            key: 'erp_transportadoras',
            title: 'Transportadoras',
            icon: 'airport_shuttle',
            fields: [
                { id: 'codigo', label: 'Código', type: 'number', width: '80px', required: true },
                { id: 'razaoSocial', label: 'Razão Social', type: 'text', width: '250px', required: true },
                { id: 'nomeFantasia', label: 'Nome Fantasia', type: 'text', width: '200px' },
                { id: 'cnpj', label: 'CNPJ', type: 'text', width: '160px' },
                { id: 'ie', label: 'IE', type: 'text', width: '120px' },
                { id: 'telefone', label: 'Telefone', type: 'text', width: '130px' },
                { id: 'cidade', label: 'Cidade', type: 'text', width: '150px' },
                { id: 'uf', label: 'UF', type: 'text', width: '50px' },
                {
                    id: 'modalidade', label: 'Modalidade', type: 'select', width: '120px',
                    options: ['CIF', 'FOB', 'Redespacho']
                },
                { id: 'ativo', label: 'Ativo', type: 'checkbox', width: '60px', default: true }
            ]
        },
        marcas: {
            key: 'erp_marcas',
            title: 'Marcas',
            icon: 'branding_watermark',
            fields: [
                { id: 'codigo', label: 'Código', type: 'number', width: '80px', required: true },
                { id: 'descricao', label: 'Descrição', type: 'text', width: '300px', required: true },
                { id: 'ativo', label: 'Ativo', type: 'checkbox', width: '60px', default: true }
            ]
        },
        regioes: {
            key: 'erp_regioes',
            title: 'Regiões / Praças',
            icon: 'public',
            fields: [
                { id: 'codigo', label: 'Código', type: 'number', width: '80px', required: true },
                { id: 'descricao', label: 'Descrição', type: 'text', width: '250px', required: true },
                { id: 'uf', label: 'UF', type: 'text', width: '50px' },
                { id: 'tabelaPreco', label: 'Tab. Preço', type: 'number', width: '100px' },
                { id: 'ativo', label: 'Ativo', type: 'checkbox', width: '60px', default: true }
            ]
        },
        rotas: {
            key: 'erp_rotas',
            title: 'Rotas',
            icon: 'route',
            fields: [
                { id: 'codigo', label: 'Código', type: 'number', width: '80px', required: true },
                { id: 'descricao', label: 'Descrição', type: 'text', width: '250px', required: true },
                { id: 'regiao', label: 'Região', type: 'text', width: '150px' },
                { id: 'vendedor', label: 'Vendedor', type: 'text', width: '150px' },
                { id: 'diasSemana', label: 'Dias Semana', type: 'text', width: '120px' },
                { id: 'ativo', label: 'Ativo', type: 'checkbox', width: '60px', default: true }
            ]
        },
        tabelasPreco: {
            key: 'erp_tabelasPreco',
            title: 'Tabelas de Preço',
            icon: 'sell',
            fields: [
                { id: 'codigo', label: 'Código', type: 'number', width: '80px', required: true },
                { id: 'descricao', label: 'Descrição', type: 'text', width: '200px', required: true },
                {
                    id: 'faixa', label: 'Faixa', type: 'select', width: '100px',
                    options: ['1', '2', '3', '4', '5', '6']
                },
                { id: 'margemMin', label: '% Margem Min', type: 'number', width: '110px', step: '0.01' },
                { id: 'vigenciaInicio', label: 'Início Vigência', type: 'date', width: '130px' },
                { id: 'vigenciaFim', label: 'Fim Vigência', type: 'date', width: '130px' },
                { id: 'ativo', label: 'Ativo', type: 'checkbox', width: '60px', default: true }
            ]
        }
    };

    // ─── Storage ──────────────────────────────────────────────
    function getAll(entityName) {
        const def = ENTITIES[entityName];
        if (!def) return [];
        try { return JSON.parse(localStorage.getItem(def.key) || '[]'); }
        catch { return []; }
    }

    function saveAll(entityName, data) {
        const def = ENTITIES[entityName];
        if (!def) return;
        localStorage.setItem(def.key, JSON.stringify(data));
    }

    // ─── Render Grid ─────────────────────────────────────────
    function renderEntity(entityName) {
        const def = ENTITIES[entityName];
        if (!def) return;
        const container = document.getElementById(`${entityName}-container`);
        if (!container) return;

        const items = getAll(entityName);
        const visibleFields = def.fields.filter(f => f.type !== 'checkbox' || f.id === 'ativo');

        container.innerHTML = `
            <div class="crud-toolbar">
                <button class="btn btn-primary btn-sm" onclick="CadComercial.openModal('${entityName}')">
                    <span class="material-icons-round" style="font-size:1rem">add</span> Novo
                </button>
                <input type="text" class="search-input" placeholder="Buscar..." 
                       oninput="CadComercial.filter('${entityName}', this.value)">
                <span style="color:var(--text-secondary); font-size:0.8rem">${items.length} registro(s)</span>
            </div>
            <div class="crud-grid" style="overflow:auto; max-height:calc(100vh - 260px);">
                <table>
                    <thead><tr>
                        ${visibleFields.map(f => `<th style="min-width:${f.width}">${f.label}</th>`).join('')}
                        <th style="width:100px">Ações</th>
                    </tr></thead>
                    <tbody id="${entityName}-tbody">
                        ${items.length === 0 ? `
                            <tr><td colspan="${visibleFields.length + 1}" class="empty-state">
                                <span class="material-icons-round">inbox</span>
                                <div>Nenhum registro cadastrado</div>
                            </td></tr>
                        ` : items.map((item, idx) => `
                            <tr data-idx="${idx}">
                                ${visibleFields.map(f => {
            if (f.type === 'checkbox') {
                return `<td><span class="material-icons-round" style="font-size:1rem; color:${item[f.id] ? 'var(--accent-success)' : 'var(--accent-danger)'}">${item[f.id] ? 'check_circle' : 'cancel'}</span></td>`;
            }
            return `<td>${item[f.id] != null ? item[f.id] : ''}</td>`;
        }).join('')}
                                <td>
                                    <button class="btn-icon" title="Editar" onclick="CadComercial.openModal('${entityName}', ${idx})">
                                        <span class="material-icons-round" style="font-size:1rem">edit</span>
                                    </button>
                                    <button class="btn-icon" title="Excluir" onclick="CadComercial.deleteItem('${entityName}', ${idx})" style="margin-left:4px">
                                        <span class="material-icons-round" style="font-size:1rem; color:var(--accent-danger)">delete</span>
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // ─── Filter ───────────────────────────────────────────────
    function filter(entityName, query) {
        const tbody = document.getElementById(`${entityName}-tbody`);
        if (!tbody) return;
        const rows = tbody.querySelectorAll('tr[data-idx]');
        const q = (query || '').toLowerCase();
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(q) ? '' : 'none';
        });
    }

    // ─── Modal ────────────────────────────────────────────────
    let _currentEntity = null;
    let _currentIdx = null;

    function openModal(entityName, idx) {
        _currentEntity = entityName;
        _currentIdx = idx !== undefined ? idx : null;
        const def = ENTITIES[entityName];
        const isEdit = _currentIdx !== null;
        const item = isEdit ? getAll(entityName)[_currentIdx] : {};

        let overlay = document.getElementById('cadcom-modal-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'cadcom-modal-overlay';
            overlay.className = 'modal-overlay';
            document.body.appendChild(overlay);
        }

        overlay.innerHTML = `
            <div class="modal-card" style="max-width:650px; width:90%;">
                <div class="modal-header">
                    <h3>${isEdit ? 'Editar' : 'Novo'} — ${def.title}</h3>
                    <button class="btn-icon" onclick="CadComercial.closeModal()">
                        <span class="material-icons-round">close</span>
                    </button>
                </div>
                <div class="modal-body" style="padding:1.5rem;">
                    <form id="cadcom-form" style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                        ${def.fields.map(f => {
            const val = item[f.id] != null ? item[f.id] : (f.default != null ? f.default : '');
            if (f.type === 'checkbox') {
                return `<label class="form-group" style="display:flex; align-items:center; gap:0.5rem;">
                                    <input type="checkbox" id="cc-${f.id}" ${val ? 'checked' : ''}>
                                    <span class="form-label" style="margin:0">${f.label}</span>
                                </label>`;
            }
            if (f.type === 'select') {
                return `<div class="form-group">
                                    <label class="form-label">${f.label}</label>
                                    <select id="cc-${f.id}" class="form-input">
                                        <option value="">—</option>
                                        ${(f.options || []).map(o => `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`).join('')}
                                    </select>
                                </div>`;
            }
            return `<div class="form-group">
                                <label class="form-label">${f.label}${f.required ? ' *' : ''}</label>
                                <input type="${f.type}" id="cc-${f.id}" class="form-input" value="${val}"
                                       ${f.required ? 'required' : ''} ${f.step ? `step="${f.step}"` : ''}>
                            </div>`;
        }).join('')}
                    </form>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="CadComercial.closeModal()">Cancelar</button>
                    <button class="btn btn-primary" onclick="CadComercial.saveItem()">
                        <span class="material-icons-round" style="font-size:1rem">save</span> Salvar
                    </button>
                </div>
            </div>
        `;
        overlay.style.display = 'flex';
    }

    function closeModal() {
        const overlay = document.getElementById('cadcom-modal-overlay');
        if (overlay) overlay.style.display = 'none';
        _currentEntity = null;
        _currentIdx = null;
    }

    function saveItem() {
        const def = ENTITIES[_currentEntity];
        if (!def) return;
        const items = getAll(_currentEntity);
        const obj = {};

        for (const f of def.fields) {
            const el = document.getElementById(`cc-${f.id}`);
            if (!el) continue;
            if (f.type === 'checkbox') {
                obj[f.id] = el.checked;
            } else if (f.type === 'number') {
                obj[f.id] = el.value !== '' ? parseFloat(el.value) : '';
            } else {
                obj[f.id] = el.value;
            }

            if (f.required && (obj[f.id] === '' || obj[f.id] == null)) {
                el.style.borderColor = 'var(--accent-danger)';
                el.focus();
                return;
            }
        }

        if (_currentIdx !== null) {
            items[_currentIdx] = obj;
        } else {
            items.push(obj);
        }

        saveAll(_currentEntity, items);
        closeModal();
        renderEntity(_currentEntity);
    }

    function deleteItem(entityName, idx) {
        if (!confirm('Deseja realmente excluir este registro?')) return;
        const items = getAll(entityName);
        items.splice(idx, 1);
        saveAll(entityName, items);
        renderEntity(entityName);
    }

    return { renderEntity, filter, openModal, closeModal, saveItem, deleteItem };
})();
