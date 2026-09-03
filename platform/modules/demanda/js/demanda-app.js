/**
 * demanda-app.js — Orquestrador Principal do Módulo de Demanda
 * ============================================================
 * Gerencia toda a lógica de UI, eventos e fluxo da Central de Captura.
 * Coordena DemandaDB, DemandaSearch, DemandaImport e DemandaStates.
 *
 * Parreira Sistemas — Módulo de Inteligência de Demanda v1.0.0
 */

const DemandaApp = (() => {

    // ── Estado da sessão ─────────────────────────────────────
    let _session = {
        user:     null,       // { nome, empId, filialNome, erpUserId }
        isLogged: false,
    };

    // ── Rascunho da demanda atual (em memória, autosave) ─────
    let _draft = {
        id:          null,    // null = novo; string = demanda salva
        clienteId:   null,
        clienteNome: '',
        clienteCnpj: '',
        origem:      'whatsapp',
        obs:         '',
        itens:       [],      // [{ seq, refOriginal, descOriginal, qtdeSolicitada, status, ... }]
    };

    let _searchDebounce = null;
    let _currentSearchResult = null; // resultado selecionado para adicionar
    let _excelParsed = null;         // dados do Excel parseado aguardando confirmação
    let _conferenciaItens = [];      // itens na tela de conferência

    // ── Mapa de filiais ───────────────────────────────────────
    const FILIAIS = {
        1: 'CTR MATRIZ PALMAS ATACADO',
        2: 'CTR FILIAL PALMAS VAREJO',
        4: 'CTR PORTO VAREJO',
        5: 'CTR REDENÇÃO',
    };

    // ─────────────────────────────────────────────────────────
    //  INICIALIZAÇÃO
    // ─────────────────────────────────────────────────────────

    async function init() {
        // Tenta restaurar sessão do sessionStorage
        const saved = DemandaDB.loadSession('user');
        if (saved && saved.empId) {
            _session.user     = saved;
            _session.isLogged = true;
            _showApp();
        } else {
            _showLogin();
        }

        // Fecha dropdowns ao clicar fora
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#clienteDropdown') && !e.target.closest('#btnSelectCliente')) {
                document.getElementById('clienteDropdown').classList.remove('open');
            }
        });
    }

    // ─────────────────────────────────────────────────────────
    //  LOGIN (via MaxData)
    // ─────────────────────────────────────────────────────────

    async function doLogin() {
        const usuario = document.getElementById('loginUser').value.trim();
        const senha   = document.getElementById('loginPass').value;
        const filialId = parseInt(document.getElementById('loginFilial').value);

        if (!usuario || !senha) {
            _showLoginError('Informe usuário e senha.');
            return;
        }

        const btn = document.getElementById('btnLogin');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner" style="width:16px;height:16px"></span> Autenticando...';

        try {
            // Autentica via MaxData: POST /auth com empId + terminal
            const BASE_URL = 'http://rds.skytins.com.br:8720/v2';
            const TERMINAL = '364F64E6539974C1D75C8A46C14B2D3D';

            const resp = await fetch(`${BASE_URL}/auth`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ empId: filialId, terminal: TERMINAL }),
                signal:  AbortSignal.timeout(15000),
            });

            if (!resp.ok) throw new Error(`Autenticação falhou (HTTP ${resp.status}).`);
            const data = await resp.json();
            if (!data.token) throw new Error('Token não retornado. Verifique o terminal.');

            // Salva config do ERP para o DemandaSearch usar
            sessionStorage.setItem('_demanda_erp_config', JSON.stringify({
                baseUrl:  BASE_URL,
                empId:    filialId,
                terminal: TERMINAL,
                apiToken: data.token,
            }));

            // Tenta buscar dados do usuário via GET /users (se disponível)
            let erpUserId = null;
            let erpUserNome = usuario.toUpperCase();
            try {
                const uResp = await fetch(
                    `${BASE_URL}/users`,
                    { headers: { Authorization: `Bearer ${data.token}`, 'Content-Type': 'application/json' } }
                );
                if (uResp.ok) {
                    const users = await uResp.json();
                    const arr   = Array.isArray(users) ? users : (users.docs || users.data || []);
                    const found = arr.find(u =>
                        (u.login || u.usuario || u.nome || '').toUpperCase() === usuario.toUpperCase()
                    );
                    if (found) {
                        erpUserId   = found.id || found.codigo;
                        erpUserNome = found.nome || found.nomeCompleto || erpUserNome;
                    }
                }
            } catch (_) { /* não crítico */ }

            // Salva sessão do módulo
            const user = {
                nome:      erpUserNome,
                empId:     filialId,
                filialNome: FILIAIS[filialId] || `Filial ${filialId}`,
                erpUserId,
                loginEm:   new Date().toISOString(),
            };
            _session.user     = user;
            _session.isLogged = true;
            DemandaDB.saveSession('user', user);

            _showApp();

        } catch (e) {
            console.error('[DemandaApp] Login error:', e);
            _showLoginError(e.message.includes('Failed to fetch')
                ? 'Não foi possível conectar ao ERP. Verifique sua rede.'
                : e.message
            );
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span class="material-icons-round">login</span> Entrar';
        }
    }

    function _showLoginError(msg) {
        const el = document.getElementById('loginError');
        el.style.display = 'block';
        el.textContent   = msg;
    }

    // ─────────────────────────────────────────────────────────
    //  MOSTRAR / OCULTAR TELAS
    // ─────────────────────────────────────────────────────────

    function _showLogin() {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('appShell').style.display    = 'none';
    }

    function _showApp() {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appShell').style.display    = 'flex';

        // Preenche dados do usuário na sidebar
        const u = _session.user;
        if (u) {
            const initial = (u.nome || '?')[0].toUpperCase();
            document.getElementById('sidebarAvatarLetter').textContent = initial;
            document.getElementById('sidebarUserName').textContent     = u.nome;
            document.getElementById('sidebarFilial').textContent       = u.filialNome || `Filial ${u.empId}`;
        }

        // Lê versão do módulo
        fetch('version.json').then(r => r.json()).then(v => {
            document.getElementById('sidebarVersion').textContent = `v${v.version}`;
        }).catch(() => {});

        // Mostra view padrão
        switchView('captura');
    }

    // ─────────────────────────────────────────────────────────
    //  ROTEAMENTO DE VIEWS
    // ─────────────────────────────────────────────────────────

    function switchView(view) {
        // Oculta todas as views
        const views = ['captura', 'lista', 'pesquisa', 'compras', 'dashboard', 'base'];
        views.forEach(v => {
            const el = document.getElementById(`view-${v}`);
            if (el) el.style.display = 'none';
        });

        // Desativa todos os nav-items
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

        // Ativa a view e o nav
        const viewEl = document.getElementById(`view-${view}`);
        if (viewEl) viewEl.style.display = 'flex';
        const navEl = document.getElementById(`nav-${view}`);
        if (navEl) navEl.classList.add('active');

        // Ações específicas por view
        if (view === 'lista') _loadListaDemandas();
    }

    // ─────────────────────────────────────────────────────────
    //  PESQUISA DE PRODUTOS
    // ─────────────────────────────────────────────────────────

    function onSearchInput(val) {
        const input = document.getElementById('searchInput');
        const clear = document.getElementById('searchClear');
        clear.classList.toggle('visible', val.length > 0);

        clearTimeout(_searchDebounce);
        if (val.length < 2) {
            _showSearchPlaceholder();
            return;
        }
        if (val.length < 3) return;

        _showSearchLoading();
        _searchDebounce = setTimeout(() => _runSearch(val), 350);
    }

    async function _runSearch(query) {
        try {
            const filialId = _session.user?.empId || 1;
            const results  = await DemandaSearch.search(query, { filialId });
            _renderSearchResults(results, query);
        } catch (e) {
            console.error('[DemandaApp] Search error:', e);
            _renderSearchError(e.message);
        }
    }

    function _showSearchPlaceholder() {
        document.getElementById('searchResults').innerHTML = `
            <div class="search-placeholder" id="searchPlaceholder">
                <span class="material-icons-round">manage_search</span>
                <h4>Pesquise uma peça</h4>
                <p>Digite a referência, código, descrição ou nome da máquina.</p>
            </div>`;
    }

    function _showSearchLoading() {
        document.getElementById('searchResults').innerHTML = `
            <div class="search-loading">
                <div class="spinner"></div>
                <span>Pesquisando no ERP e base técnica...</span>
            </div>`;
    }

    function _renderSearchError(msg) {
        document.getElementById('searchResults').innerHTML = `
            <div class="empty-state" style="padding:2rem">
                <span class="material-icons-round" style="color:var(--danger)">error_outline</span>
                <h4>Erro na pesquisa</h4>
                <p>${msg}</p>
            </div>`;
    }

    function _renderSearchResults(results, query) {
        const container = document.getElementById('searchResults');

        if (results.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-round">search_off</span>
                    <h4>Nenhum resultado</h4>
                    <p>Não encontramos nada para "${query}".<br>Adicione manualmente como item provisório.</p>
                    <button class="btn btn-secondary btn-sm" style="margin-top:.5rem"
                        onclick="DemandaApp.addItemProvisorio('${query.replace(/'/g,"\\'")}')">
                        <span class="material-icons-round">add</span> Adicionar como provisório
                    </button>
                </div>`;
            return;
        }

        const html = results.map((r, idx) => _buildProductCard(r, idx)).join('');
        container.innerHTML = `
            <div style="font-size:.72rem;color:var(--text-secondary);margin-bottom:.5rem;padding:0 .25rem">
                ${results.length} resultado(s) para "<strong>${_escHtml(query)}</strong>"
            </div>
            ${html}`;
    }

    function _buildProductCard(r, idx) {
        const estoque     = r.estoqueFilial !== null ? r.estoqueFilial : '—';
        const temEstoque  = (r.estoqueFilial || 0) > 0;
        const temOutro    = r._temEstoqueOutro;
        const estoqueColor = temEstoque ? 'badge-stock' : (temOutro ? 'badge-low-stock' : 'badge-no-stock');
        const estoqueLabel = temEstoque
            ? `${estoque} em estoque`
            : (temOutro ? 'Outras filiais' : 'Sem estoque');

        const erp = r.erpProdutoId
            ? `<span class="badge badge-erp">✅ ERP #${r.erpProdutoId}</span>`
            : `<span class="badge badge-no-erp">⚠️ Sem cadastro ERP</span>`;

        const confianca = r.confidencia && r.confidencia !== 'erp'
            ? `<span class="badge badge-confianca" title="Confiança: ${r.confidencia}">${r.confidencia}</span>` : '';

        const preco = r.preco > 0
            ? `<div class="product-price">R$ ${r.preco.toFixed(2).replace('.', ',')}</div>` : '';

        return `
            <div class="product-card" onclick="DemandaApp.openProductDetails(${idx})" data-idx="${idx}">
                <div class="product-thumb">
                    <span class="material-icons-round">settings</span>
                </div>
                <div class="product-info">
                    <div class="product-desc">${_escHtml(r.erpProdutoDesc || r.descricao || '—')}</div>
                    <div class="product-meta">
                        ${r.erpCodigoFab ? `<span class="product-ref">${_escHtml(r.erpCodigoFab)}</span>` : ''}
                        ${r.fabricante ? `<span class="product-maker">${_escHtml(r.fabricante)}</span>` : ''}
                    </div>
                    <div class="product-badges">
                        ${erp}
                        <span class="badge ${estoqueColor}">${estoqueLabel}</span>
                        ${confianca}
                    </div>
                </div>
                ${preco}
                <button class="btn-add-item" onclick="event.stopPropagation();DemandaApp.quickAddItem(${idx})" title="Adicionar à demanda">
                    <span class="material-icons-round">add</span>
                </button>
            </div>`;
    }

    // Armazena resultados da última pesquisa para referência rápida
    let _lastResults = [];

    // Sobrescreve _runSearch para guardar resultados
    const _origRunSearch = DemandaApp?._runSearch;
    async function _runSearchWithCache(query) {
        try {
            const filialId = _session.user?.empId || 1;
            const results  = await DemandaSearch.search(query, { filialId });
            _lastResults   = results;
            _renderSearchResults(results, query);
        } catch (e) {
            _renderSearchError(e.message);
        }
    }

    function clearSearch() {
        document.getElementById('searchInput').value = '';
        document.getElementById('searchClear').classList.remove('visible');
        _lastResults = [];
        _showSearchPlaceholder();
    }

    // ─────────────────────────────────────────────────────────
    //  ADICIONAR ITENS À DEMANDA
    // ─────────────────────────────────────────────────────────

    /** Adiciona item rapidamente do card de resultado */
    function quickAddItem(idx) {
        const r = _lastResults[idx];
        if (!r) return;

        const item = {
            refOriginal:    r.erpCodigoFab || '',
            descOriginal:   r.erpProdutoDesc || r.descricao || '',
            qtdeSolicitada: 1,
            status:         r.erpProdutoId
                ? (r.estoqueFilial > 0 ? 'estoque_disponivel' : 'sem_estoque')
                : 'em_identificacao',
            erpProdutoId:   r.erpProdutoId || null,
            erpProdutoDesc: r.erpProdutoDesc || '',
            erpCodigoFab:   r.erpCodigoFab || '',
            estoqueFilial:  r.estoqueFilial,
            estoqueOutrasFiliais: r.estoqueOutrasFiliais || [],
            preco:          r.preco || null,
            confidenciaIdentificacao: r.erpProdutoId ? 'confirmado' : 'pendente',
        };

        _addItemToDraft(item);
        _showToast(`"${item.descOriginal || item.refOriginal}" adicionado!`, 'success');
    }

    /** Adiciona item provisório (sem encontrar no ERP) */
    function addItemProvisorio(query) {
        _addItemToDraft({
            refOriginal:    query,
            descOriginal:   query,
            qtdeSolicitada: 1,
            status:         'em_identificacao',
            confidenciaIdentificacao: 'pendente',
            incerteza:      true,
        });
        _showToast(`Item provisório adicionado: "${query}"`, 'info');
    }

    /** Adiciona item da grade de entrada rápida */
    function addItemGrade() {
        const ref  = document.getElementById('gradeRef').value.trim();
        const qtde = parseFloat(document.getElementById('gradeQtde').value) || 1;
        if (!ref) {
            document.getElementById('gradeRef').focus();
            return;
        }
        _addItemToDraft({ refOriginal: ref, descOriginal: ref, qtdeSolicitada: qtde, status: 'demanda_recebida' });
        document.getElementById('gradeRef').value  = '';
        document.getElementById('gradeQtde').value = '1';
        document.getElementById('gradeRef').focus();
        _showToast(`"${ref}" adicionado!`, 'success');
    }

    function onGradeKeydown(e) {
        if (e.key === 'Enter') addItemGrade();
        if (e.key === 'Tab' && e.target.id === 'gradeQtde') {
            e.preventDefault();
            addItemGrade();
        }
    }

    /** Adiciona um item ao rascunho e re-renderiza a tabela */
    function _addItemToDraft(item) {
        const seq = _draft.itens.length + 1;
        _draft.itens.push({ seq, ...item });
        _renderItensTable();
    }

    function removeItem(seq) {
        _draft.itens = _draft.itens.filter(i => i.seq !== seq);
        // Renumera
        _draft.itens.forEach((item, idx) => { item.seq = idx + 1; });
        _renderItensTable();
    }

    function limparDemanda() {
        if (_draft.itens.length === 0) return;
        if (!confirm('Limpar todos os itens da demanda atual?')) return;
        _draft.itens = [];
        _renderItensTable();
    }

    // ─────────────────────────────────────────────────────────
    //  RENDERIZAÇÃO DA TABELA DE ITENS
    // ─────────────────────────────────────────────────────────

    function _renderItensTable() {
        const tbody = document.getElementById('itensTbody');

        if (_draft.itens.length === 0) {
            tbody.innerHTML = `
                <tr id="trEmptyState">
                    <td colspan="6">
                        <div class="empty-state" style="padding:1.5rem">
                            <span class="material-icons-round">add_shopping_cart</span>
                            <p>Pesquise uma peça ou importe uma lista para começar.</p>
                        </div>
                    </td>
                </tr>`;
            return;
        }

        tbody.innerHTML = _draft.itens.map(item => {
            const st  = DemandaStates.get(item.status || 'demanda_recebida');
            const dot = `<span class="item-status-dot" style="background:${st.color}" title="${st.label}"></span>`;

            const ref  = _escHtml(item.refOriginal  || '—');
            const desc = _escHtml((item.descOriginal || '').substring(0, 45));

            return `<tr>
                <td class="item-seq">${item.seq}</td>
                <td class="item-ref-cell">${ref}</td>
                <td class="item-desc-cell" title="${_escHtml(item.descOriginal)}">${desc}</td>
                <td class="item-qtde-cell">${item.qtdeSolicitada}</td>
                <td style="text-align:center">${dot}</td>
                <td class="item-actions">
                    <button class="btn-icon danger" onclick="DemandaApp.removeItem(${item.seq})" title="Remover">
                        <span class="material-icons-round">close</span>
                    </button>
                </td>
            </tr>`;
        }).join('');
    }

    // ─────────────────────────────────────────────────────────
    //  SALVAR DEMANDA NO FIRESTORE
    // ─────────────────────────────────────────────────────────

    async function salvarDemanda() {
        if (_draft.itens.length === 0) {
            _showToast('Adicione pelo menos 1 item antes de salvar.', 'warn');
            return;
        }

        const btn = document.getElementById('btnSalvarDemanda');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner" style="width:14px;height:14px"></span> Salvando...';

        try {
            const u = _session.user;

            const demandaData = {
                clienteId:   _draft.clienteId  || null,
                clienteNome: _draft.clienteNome || 'Não informado',
                clienteCnpj: _draft.clienteCnpj || '',
                vendedorId:  u?.erpUserId  || null,
                vendedorNome: u?.nome      || '',
                filialId:    u?.empId      || 1,
                filialNome:  u?.filialNome || '',
                origem:      document.getElementById('selectOrigem')?.value || _draft.origem,
                obs:         _draft.obs || '',
                criadoPor:   `erp:${u?.erpUserId || 'desconhecido'}`,
            };

            const demandaId = await DemandaDB.createDemanda(demandaData, _draft.itens);

            _showToast(`Demanda salva! (${_draft.itens.length} itens)`, 'success');

            // Reseta o rascunho
            _draft = { id: null, clienteId: null, clienteNome: '', clienteCnpj: '', origem: 'whatsapp', obs: '', itens: [] };
            _renderItensTable();
            document.getElementById('clienteLabel').textContent = 'Selecionar cliente';
            document.getElementById('btnSelectCliente').classList.remove('selected');
            document.getElementById('demandaCodigoTopbar').textContent = '';

            // Vai para a lista de demandas
            setTimeout(() => switchView('lista'), 800);

        } catch (e) {
            console.error('[DemandaApp] Erro ao salvar demanda:', e);
            _showToast(`Erro ao salvar: ${e.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span class="material-icons-round">save</span> Salvar';
        }
    }

    // ─────────────────────────────────────────────────────────
    //  SELEÇÃO DE CLIENTE
    // ─────────────────────────────────────────────────────────

    function toggleClienteDropdown() {
        const dd = document.getElementById('clienteDropdown');
        dd.classList.toggle('open');
        if (dd.classList.contains('open')) {
            document.getElementById('clienteSearchInput').focus();
        }
    }

    function searchCliente(query) {
        const results = DemandaSearch.searchClients(query);
        const list    = document.getElementById('clienteDropdownList');

        if (results.length === 0) {
            list.innerHTML = `<div style="padding:.75rem;font-size:.8rem;color:var(--text-secondary);text-align:center">Nenhum cliente encontrado</div>`;
            return;
        }

        list.innerHTML = results.map(c => `
            <div class="client-dropdown-item" onclick="DemandaApp.selectCliente('${_escAttr(String(c.codigo))}', '${_escAttr(c.nome)}', '${_escAttr(c.cnpj || '')}')">
                <strong>${_escHtml(c.nome)}</strong>
                <span>${_escHtml(c.cidade || '')} ${c.cnpj ? '· ' + c.cnpj : ''}</span>
            </div>`).join('');
    }

    function selectCliente(id, nome, cnpj) {
        _draft.clienteId   = id;
        _draft.clienteNome = nome;
        _draft.clienteCnpj = cnpj;

        document.getElementById('clienteLabel').textContent = nome;
        document.getElementById('btnSelectCliente').classList.add('selected');
        document.getElementById('clienteDropdown').classList.remove('open');
    }

    // ─────────────────────────────────────────────────────────
    //  IMPORTAÇÃO MULTIMODAL
    // ─────────────────────────────────────────────────────────

    function openImportModal(tipo) {
        if (tipo === 'texto') {
            document.getElementById('textareaImport').value = '';
            openModal('modalTexto');
            setTimeout(() => document.getElementById('textareaImport').focus(), 100);
        } else if (tipo === 'excel') {
            document.getElementById('excelPreviewArea').style.display = 'none';
            document.getElementById('btnConfirmExcel').style.display  = 'none';
            document.getElementById('excelUploadArea').style.display  = 'block';
            _excelParsed = null;
            openModal('modalExcel');
        } else if (tipo === 'pdf' || tipo === 'foto') {
            _showToast('Esta funcionalidade está em desenvolvimento (Fase 2).', 'info');
        }
    }

    /** Processa texto colado */
    function processImportTexto() {
        const txt   = document.getElementById('textareaImport').value;
        const itens = DemandaImport.parseText(txt);
        if (itens.length === 0) {
            _showToast('Não foi possível extrair itens do texto. Verifique o formato.', 'warn');
            return;
        }
        closeModal('modalTexto');
        _openConferencia(itens, 'Texto colado');
    }

    /** Drag & Drop */
    function onExcelDrop(e) {
        e.preventDefault();
        e.currentTarget.style.borderColor = 'var(--border)';
        const file = e.dataTransfer.files[0];
        if (file) onExcelFileSelected(file);
    }

    /** Arquivo Excel selecionado */
    async function onExcelFileSelected(file) {
        if (!file) return;
        document.getElementById('excelUploadArea').style.display = 'none';
        document.getElementById('excelPreviewArea').style.display = 'block';
        document.getElementById('excelPreviewArea').innerHTML = `
            <div class="search-loading">
                <div class="spinner"></div>
                <span>Processando "${file.name}"...</span>
            </div>`;

        try {
            const result = await DemandaImport.parseExcel(file);
            _excelParsed = result;

            // Preview resumido
            const totalLinhas = result.itens.length;
            const comRef  = result.itens.filter(i => i.refOriginal).length;
            const comDesc = result.itens.filter(i => i.descOriginal).length;

            const colMapeadas = Object.entries(result.colunas)
                .filter(([, v]) => v >= 0)
                .map(([k]) => k).join(', ');

            document.getElementById('excelPreviewArea').innerHTML = `
                <div style="background:var(--bg-dark);border-radius:8px;padding:1rem;font-size:.83rem">
                    <div style="margin-bottom:.5rem;color:var(--text-primary);font-weight:500">✅ Arquivo lido com sucesso</div>
                    <div style="color:var(--text-secondary)">📦 ${totalLinhas} itens detectados</div>
                    <div style="color:var(--text-secondary)">🔗 ${comRef} com referência | 📝 ${comDesc} com descrição</div>
                    <div style="color:var(--text-secondary)">📋 Colunas: ${colMapeadas || 'auto-detectadas'}</div>
                </div>`;
            document.getElementById('btnConfirmExcel').style.display = 'inline-flex';

        } catch (e) {
            document.getElementById('excelPreviewArea').innerHTML = `
                <div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:8px;padding:1rem;color:#ef4444;font-size:.83rem">
                    ❌ Erro ao processar: ${e.message}
                </div>`;
            document.getElementById('excelUploadArea').style.display = 'block';
        }
    }

    function confirmExcelImport() {
        if (!_excelParsed) return;
        closeModal('modalExcel');
        _openConferencia(_excelParsed.itens, 'Excel');
    }

    /** Abre a tela de conferência */
    function _openConferencia(itens, origem = '') {
        _conferenciaItens = DemandaImport.validateItens(itens).map((item, idx) => ({
            ...item,
            _idx:       idx,
            _selecionado: !item._erros?.length, // pré-seleciona os sem erro
        }));

        const ok   = _conferenciaItens.filter(i => i._selecionado).length;
        const warn = _conferenciaItens.filter(i => i._erros?.length > 0).length;

        document.getElementById('conferenciaStats').innerHTML =
            `<strong>${_conferenciaItens.length}</strong> itens detectados de <em>${origem}</em> — `
            + `<span style="color:var(--success)">${ok} prontos</span>`
            + (warn ? ` · <span style="color:var(--warning)">${warn} com atenção</span>` : '');

        _renderConferenciaTbody();
        openModal('modalConferencia');
    }

    function _renderConferenciaTbody() {
        const tbody = document.getElementById('conferenciaTbody');
        tbody.innerHTML = _conferenciaItens.map((item, idx) => {
            const hasErr  = item._erros?.length > 0;
            const checked = item._selecionado ? 'checked' : '';
            const rowCls  = hasErr ? 'row-uncertain' : '';

            return `<tr class="${rowCls}">
                <td><input type="checkbox" ${checked} onchange="DemandaApp.toggleConferenciaItem(${idx}, this.checked)"></td>
                <td style="color:var(--text-secondary);font-size:.72rem">${idx + 1}</td>
                <td><input type="text" value="${_escAttr(item.refOriginal || '')}"
                    oninput="DemandaApp.updateConferenciaField(${idx}, 'refOriginal', this.value)" style="width:120px"></td>
                <td><input type="text" value="${_escAttr(item.descOriginal || '')}"
                    oninput="DemandaApp.updateConferenciaField(${idx}, 'descOriginal', this.value)" style="width:200px"></td>
                <td><input type="number" value="${item.qtdeSolicitada || 1}" min="1"
                    oninput="DemandaApp.updateConferenciaField(${idx}, 'qtdeSolicitada', +this.value)"></td>
                <td><input type="text" value="${_escAttr(item.obs || '')}"
                    oninput="DemandaApp.updateConferenciaField(${idx}, 'obs', this.value)"></td>
                <td>
                    ${hasErr
                        ? `<span style="color:var(--warning);font-size:.7rem" title="${item._erros.join(', ')}">⚠️ Verificar</span>`
                        : `<span style="color:var(--success);font-size:.7rem">✅ OK</span>`
                    }
                </td>
            </tr>`;
        }).join('');
    }

    function toggleConferenciaItem(idx, sel) {
        _conferenciaItens[idx]._selecionado = sel;
    }

    function toggleAllConferencia(sel) {
        _conferenciaItens.forEach(i => { i._selecionado = sel; });
        document.querySelectorAll('#conferenciaTbody input[type=checkbox]').forEach(cb => { cb.checked = sel; });
    }

    function selectAllConferencia() {
        document.getElementById('chkAllConf').checked = true;
        toggleAllConferencia(true);
    }

    function updateConferenciaField(idx, field, value) {
        _conferenciaItens[idx][field] = value;
    }

    function confirmConferencia() {
        const selecionados = _conferenciaItens.filter(i => i._selecionado);
        if (selecionados.length === 0) {
            _showToast('Selecione pelo menos 1 item.', 'warn');
            return;
        }
        closeModal('modalConferencia');
        selecionados.forEach(item => _addItemToDraft({
            refOriginal:    item.refOriginal   || '',
            descOriginal:   item.descOriginal  || '',
            qtdeSolicitada: item.qtdeSolicitada || 1,
            obs:            item.obs || '',
            status:         'demanda_recebida',
        }));
        _showToast(`${selecionados.length} item(ns) adicionado(s) à demanda!`, 'success');
    }

    // ─────────────────────────────────────────────────────────
    //  DETALHES DO PRODUTO (Modal)
    // ─────────────────────────────────────────────────────────

    function openProductDetails(idx) {
        _currentSearchResult = _lastResults[idx];
        if (!_currentSearchResult) return;

        const r = _currentSearchResult;
        const body = document.getElementById('modalItemDetalhesBody');

        body.innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
                <div>
                    <div class="form-label">Descrição</div>
                    <div style="font-size:.95rem;font-weight:500;color:var(--text-primary);margin-bottom:.75rem">
                        ${_escHtml(r.erpProdutoDesc || '—')}
                    </div>
                    ${r.erpCodigoFab ? `<div class="form-label">Referência</div>
                    <div class="product-ref" style="display:inline-block;margin-bottom:.75rem">${_escHtml(r.erpCodigoFab)}</div>` : ''}
                    ${r.fabricante ? `<div class="form-label">Fabricante</div>
                    <div style="font-size:.85rem;margin-bottom:.75rem">${_escHtml(r.fabricante)}</div>` : ''}
                    ${r.erpGrupo ? `<div class="form-label">Grupo</div>
                    <div style="font-size:.85rem;margin-bottom:.75rem">${_escHtml(r.erpGrupo)}</div>` : ''}
                    ${r.erpProdutoId ? `<div class="form-label">Código ERP</div>
                    <div style="font-size:.85rem;margin-bottom:.75rem">#${r.erpProdutoId}</div>` : ''}
                </div>
                <div>
                    <div class="form-label">Estoque — ${_escHtml(FILIAIS[_session.user?.empId] || 'Filial')}</div>
                    <div style="font-size:1.5rem;font-weight:700;color:${(r.estoqueFilial||0)>0 ? 'var(--success)' : 'var(--danger)'};margin-bottom:.75rem">
                        ${r.estoqueFilial !== null ? r.estoqueFilial : '—'} un
                    </div>
                    ${r.estoqueOutrasFiliais?.length > 0 ? `
                    <div class="form-label">Outras filiais</div>
                    ${r.estoqueOutrasFiliais.map(f => `
                        <div style="display:flex;justify-content:space-between;font-size:.8rem;padding:.2rem 0;border-bottom:1px solid var(--border)">
                            <span style="color:var(--text-secondary)">${_escHtml(f.nome)}</span>
                            <span style="font-weight:600;color:${f.estoque>0?'var(--success)':'var(--text-secondary)'}">${f.estoque} un</span>
                        </div>`).join('')}` : ''}
                    ${r.preco > 0 ? `
                    <div class="form-label" style="margin-top:.75rem">Preço (valorVenda)</div>
                    <div style="font-size:1.2rem;font-weight:700;color:var(--success)">
                        R$ ${r.preco.toFixed(2).replace('.', ',')}
                    </div>` : ''}
                </div>
            </div>
            <div class="form-group" style="margin-top:1rem">
                <label class="form-label">Quantidade a adicionar</label>
                <input type="number" id="modalQtde" class="form-input" value="1" min="1" style="max-width:100px">
            </div>`;

        openModal('modalItemDetalhes');
    }

    function addItemFromDetails() {
        if (!_currentSearchResult) return;
        const r    = _currentSearchResult;
        const qtde = parseInt(document.getElementById('modalQtde')?.value) || 1;

        _addItemToDraft({
            refOriginal:    r.erpCodigoFab || '',
            descOriginal:   r.erpProdutoDesc || '',
            qtdeSolicitada: qtde,
            status:         r.erpProdutoId
                ? ((r.estoqueFilial || 0) >= qtde ? 'estoque_disponivel' : 'sem_estoque')
                : 'em_identificacao',
            erpProdutoId:  r.erpProdutoId || null,
            erpProdutoDesc: r.erpProdutoDesc || '',
            erpCodigoFab:  r.erpCodigoFab || '',
            estoqueFilial: r.estoqueFilial,
            estoqueOutrasFiliais: r.estoqueOutrasFiliais || [],
            preco:         r.preco || null,
            confidenciaIdentificacao: r.erpProdutoId ? 'confirmado' : 'pendente',
        });

        closeModal('modalItemDetalhes');
        _showToast(`"${r.erpProdutoDesc || r.erpCodigoFab}" adicionado (${qtde} un)`, 'success');
    }

    // ─────────────────────────────────────────────────────────
    //  LISTA DE DEMANDAS
    // ─────────────────────────────────────────────────────────

    let _filtroLista = 'todas';

    async function _loadListaDemandas() {
        const container = document.getElementById('listaDemandasContainer');
        container.innerHTML = `<div class="search-loading"><div class="spinner"></div><span>Carregando...</span></div>`;

        try {
            const u = _session.user;
            const filters = { vendedorId: u?.erpUserId ? String(u.erpUserId) : null, limit: 30 };
            if (_filtroLista && _filtroLista !== 'todas') filters.status = _filtroLista;

            const demandas = await DemandaDB.listDemandas(filters);

            if (demandas.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <span class="material-icons-round">inbox</span>
                        <h4>Nenhuma demanda encontrada</h4>
                        <p>Crie sua primeira demanda na Central de Captura.</p>
                        <button class="btn btn-primary btn-sm" style="margin-top:.5rem" onclick="DemandaApp.switchView('captura')">
                            <span class="material-icons-round">add</span> Nova Demanda
                        </button>
                    </div>`;
                return;
            }

            container.innerHTML = demandas.map(d => {
                const data = d.criadoEm?.toDate
                    ? d.criadoEm.toDate().toLocaleDateString('pt-BR')
                    : (d.criadoEm ? new Date(d.criadoEm).toLocaleDateString('pt-BR') : '—');

                return `
                    <div class="demanda-list-item" onclick="DemandaApp.abrirDemanda('${d.id}')">
                        <div>
                            <div class="demanda-list-codigo">${d.codigo || d.id}</div>
                            <div class="demanda-list-cliente">${_escHtml(d.clienteNome || 'Cliente não informado')}</div>
                            <div class="demanda-list-meta">
                                ${d.totalItens || 0} item(ns) ·
                                ${d.filialNome || ''} ·
                                ${data}
                            </div>
                        </div>
                        <div style="text-align:right">
                            ${DemandaStates.renderBadge(d.status || 'aberta')}
                        </div>
                    </div>`;
            }).join('');

        } catch (e) {
            console.error('[DemandaApp] Erro ao carregar demandas:', e);
            container.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-round" style="color:var(--danger)">error</span>
                    <h4>Erro ao carregar</h4>
                    <p>${e.message}</p>
                </div>`;
        }
    }

    function filterDemandas(filtro, btn) {
        _filtroLista = filtro;
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        if (btn) btn.classList.add('active');
        _loadListaDemandas();
    }

    function abrirDemanda(id) {
        // TODO: Fase 2 — tela de detalhe da demanda
        _showToast(`Detalhes da demanda — em desenvolvimento (Fase 2)`, 'info');
    }

    // ─────────────────────────────────────────────────────────
    //  UTILITÁRIOS DE UI
    // ─────────────────────────────────────────────────────────

    function openModal(id) {
        document.getElementById(id)?.classList.add('open');
    }

    function closeModal(id) {
        document.getElementById(id)?.classList.remove('open');
    }

    function _showToast(msg, type = 'info') {
        const icons = { success: 'check_circle', error: 'error', warn: 'warning', info: 'info' };
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="material-icons-round" style="color:${_toastColor(type)};font-size:1.1rem">${icons[type]}</span>
            <span>${msg}</span>`;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(10px)'; }, 2700);
        setTimeout(() => toast.remove(), 3000);
    }

    function _toastColor(type) {
        return { success: 'var(--success)', error: 'var(--danger)', warn: 'var(--warning)', info: 'var(--demanda-accent)' }[type] || 'var(--text-primary)';
    }

    function _escHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _escAttr(s) {
        return String(s || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    }

    // ─────────────────────────────────────────────────────────
    //  INICIALIZAÇÃO AO CARREGAR O DOM
    // ─────────────────────────────────────────────────────────

    // Sobrescreve _runSearch interno para capturar resultados
    function onSearchInput_(val) {
        const clear = document.getElementById('searchClear');
        clear.classList.toggle('visible', val.length > 0);
        clearTimeout(_searchDebounce);
        if (val.length < 2) { _showSearchPlaceholder(); return; }
        if (val.length < 3) return;
        _showSearchLoading();
        _searchDebounce = setTimeout(async () => {
            try {
                const filialId = _session.user?.empId || 1;
                _lastResults = await DemandaSearch.search(val, { filialId });
                _renderSearchResults(_lastResults, val);
            } catch (e) { _renderSearchError(e.message); }
        }, 350);
    }

    // Expõe como a versão final de onSearchInput
    const publicAPI = {
        init,
        doLogin,
        switchView,
        onSearchInput: onSearchInput_,
        clearSearch,
        quickAddItem,
        addItemProvisorio,
        addItemGrade,
        onGradeKeydown,
        removeItem,
        limparDemanda,
        salvarDemanda,
        toggleClienteDropdown,
        searchCliente,
        selectCliente,
        openImportModal,
        processImportTexto,
        onExcelDrop,
        onExcelFileSelected,
        confirmExcelImport,
        toggleConferenciaItem,
        toggleAllConferencia,
        selectAllConferencia,
        updateConferenciaField,
        confirmConferencia,
        openProductDetails,
        addItemFromDetails,
        filterDemandas,
        abrirDemanda,
        openModal,
        closeModal,
    };

    document.addEventListener('DOMContentLoaded', init);

    return publicAPI;

})();

if (typeof window !== 'undefined') window.DemandaApp = DemandaApp;
