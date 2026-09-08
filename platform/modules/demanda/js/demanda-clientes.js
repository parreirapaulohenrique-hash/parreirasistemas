/**
 * demanda-clientes.js — Gerenciamento de Clientes (Demanda)
 * ==========================================================
 * Persistencia: Firestore → tenants/{tenant}/demanda/data/clientes/{id}
 * Fallback:     Funciona sem ERP. Importacao opcional via Maxdata.
 */

const DemandaClientes = (() => {

    const TENANT_ID    = 'centralpecas';
    const BASE_PATH    = `tenants/${TENANT_ID}/demanda`;
    const CLIENTES_COL = `${BASE_PATH}/data/clientes`;   // 5 segs valido

    let _cache  = [];
    let _cacheTs = 0;
    const CACHE_TTL = 5 * 60 * 1000;

    function _db() {
        if (typeof firebase === 'undefined' || !firebase.firestore)
            throw new Error('[DemandaClientes] Firebase nao disponivel.');
        return firebase.firestore();
    }

    function _normalize(str) {
        return (str || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
    }

    function _gerarId(nome, doc) {
        if (doc) return doc.replace(/\D/g,'').slice(0,14) || '_' + Date.now().toString(36);
        return _normalize(nome).replace(/\s+/g,'_').slice(0,30) + '_' + Date.now().toString(36);
    }

    async function listar(forcar) {
        if (!forcar && _cache.length > 0 && Date.now() - _cacheTs < CACHE_TTL) return _cache;
        const db   = _db();
        const snap = await db.collection(CLIENTES_COL).orderBy('nome').limit(1000).get();
        _cache   = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        _cacheTs = Date.now();
        return _cache;
    }

    async function buscar(termo) {
        if (!termo || termo.length < 2) return [];
        const todos = await listar();
        const t     = _normalize(termo);
        return todos.filter(c =>
            _normalize(c.nome).includes(t) ||
            _normalize(c.documento || '').includes(t) ||
            _normalize(c.codigo    || '').includes(t) ||
            _normalize(c.cidade    || '').includes(t)
        ).slice(0, 20);
    }

    async function salvar(cliente) {
        if (!cliente.nome) throw new Error('Nome do cliente obrigatorio.');
        const db  = _db();
        const id  = cliente.id || _gerarId(cliente.nome, cliente.documento);
        const doc = {
            nome:      (cliente.nome      || '').trim(),
            documento: (cliente.documento || '').replace(/\D/g,''),
            telefone:  (cliente.telefone  || '').replace(/\D/g,''),
            email:     (cliente.email     || '').trim().toLowerCase(),
            cidade:    (cliente.cidade    || '').trim(),
            estado:    (cliente.estado    || '').trim().toUpperCase(),
            codigo:    (cliente.codigo    || '').trim(),
            origemErp: cliente.origemErp  || false,
            ativo:     cliente.ativo      !== false,
            updatedAt: new Date().toISOString(),
        };
        if (!cliente.id) doc.createdAt = new Date().toISOString();
        await db.collection(CLIENTES_COL).doc(id).set(doc, { merge: true });
        _cache = [];
        return { id, ...doc };
    }

    async function desativar(id) {
        await _db().collection(CLIENTES_COL).doc(id).update({ ativo: false, updatedAt: new Date().toISOString() });
        _cache = [];
    }

    async function importarLote(clientes, onProgress) {
        const db    = _db();
        let   salvo = 0;
        const SZ    = 499;
        for (let i = 0; i < clientes.length; i += SZ) {
            const batch = db.batch();
            const slice = clientes.slice(i, i + SZ);
            for (const c of slice) {
                const id  = _gerarId(c.nome || c.razaoSocial || '', c.cnpj || c.cpf || c.documento || '');
                const ref = db.collection(CLIENTES_COL).doc(id);
                batch.set(ref, {
                    nome:      (c.nome || c.razaoSocial || c.nomeFantasia || '').trim(),
                    documento: (c.cnpj || c.cpf || c.documento || '').replace(/\D/g,''),
                    telefone:  (c.telefone || c.fone || '').replace(/\D/g,''),
                    email:     (c.email || '').trim().toLowerCase(),
                    cidade:    (c.cidade || c.municipio || '').trim(),
                    estado:    (c.estado || c.uf || '').trim().toUpperCase(),
                    codigo:    String(c.id || c.codigo || c.clienteId || ''),
                    origemErp: true,
                    ativo:     true,
                    updatedAt: new Date().toISOString(),
                }, { merge: true });
            }
            await batch.commit();
            salvo += slice.length;
            if (onProgress) onProgress(salvo, clientes.length);
        }
        _cache = [];
        return salvo;
    }

    // --- Helpers HTML ---
    function _esc(s)  { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function _doc(d)  {
        if (!d) return '—';
        const s = d.replace(/\D/g,'');
        if (s.length===14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5');
        if (s.length===11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/,'$1.$2.$3-$4');
        return d;
    }
    function _tel(t)  {
        if (!t) return '—';
        const s = t.replace(/\D/g,'');
        if (s.length===11) return s.replace(/^(\d{2})(\d{5})(\d{4})$/,'($1) $2-$3');
        if (s.length===10) return s.replace(/^(\d{2})(\d{4})(\d{4})$/,'($1) $2-$3');
        return t;
    }

    async function renderView(containerId) {
        const el = document.getElementById(containerId);
        if (!el) return;
        el.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:1.5rem;max-width:980px;margin:0 auto;">
          <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;">
            <div style="flex:1">
              <h2 style="margin:0;font-size:1.1rem;font-weight:700;color:var(--text-primary)">👥 Cadastro de Clientes</h2>
              <p style="margin:.25rem 0 0;font-size:.8rem;color:var(--text-secondary)">Clientes disponíveis para seleção nas demandas</p>
            </div>
            <button onclick="DemandaClientes._abrirForm()" style="background:var(--accent-primary);color:#fff;border:none;border-radius:8px;padding:.55rem 1.2rem;cursor:pointer;font-size:.85rem;font-weight:600;display:flex;align-items:center;gap:.4rem;">
              <span class="material-icons-round" style="font-size:1rem">person_add</span> Novo Cliente
            </button>
            <button onclick="DemandaClientes._sincErp()" id="btnClientesSinc" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:.55rem 1.2rem;cursor:pointer;font-size:.85rem;color:var(--text-primary);display:flex;align-items:center;gap:.4rem;">
              <span class="material-icons-round" style="font-size:1rem">sync</span> Importar do ERP
            </button>
          </div>
          <div style="position:relative">
            <span class="material-icons-round" style="position:absolute;left:.75rem;top:50%;transform:translateY(-50%);color:var(--text-secondary);font-size:1.1rem;pointer-events:none">search</span>
            <input id="clientesBusca" type="text" placeholder="Buscar por nome, CNPJ/CPF, cidade..." oninput="DemandaClientes._onBusca(this.value)"
              style="width:100%;padding:.6rem .75rem .6rem 2.5rem;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:.9rem;box-sizing:border-box;">
          </div>
          <div id="clientesStatus" style="font-size:.8rem;color:var(--text-secondary)">Carregando...</div>
          <div style="overflow-x:auto;border-radius:8px;border:1px solid var(--border)">
            <table style="width:100%;border-collapse:collapse;font-size:.85rem">
              <thead><tr style="background:var(--bg-secondary)">
                <th style="padding:.7rem 1rem;text-align:left;font-size:.76rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em">Nome</th>
                <th style="padding:.7rem 1rem;text-align:left;font-size:.76rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em">CNPJ/CPF</th>
                <th style="padding:.7rem 1rem;text-align:left;font-size:.76rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em">Cidade/UF</th>
                <th style="padding:.7rem 1rem;text-align:left;font-size:.76rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em">Telefone</th>
                <th style="padding:.7rem 1rem;text-align:left;font-size:.76rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em">Origem</th>
                <th style="padding:.7rem 1rem;width:90px"></th>
              </tr></thead>
              <tbody id="clientesTbody"><tr><td colspan="6" style="padding:2rem;text-align:center;color:var(--text-secondary)">Carregando...</td></tr></tbody>
            </table>
          </div>
        </div>
        <div id="modalClienteForm" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;align-items:center;justify-content:center">
          <div style="background:var(--bg-card,#1e293b);border-radius:12px;padding:2rem;width:min(520px,95vw);max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.5)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
              <h3 id="cfTitulo" style="margin:0;font-size:1rem;font-weight:700;color:var(--text-primary)">Novo Cliente</h3>
              <button onclick="DemandaClientes._fecharForm()" style="background:none;border:none;color:var(--text-secondary);font-size:1.4rem;cursor:pointer">✕</button>
            </div>
            <form id="clienteForm" onsubmit="DemandaClientes._submitForm(event)" style="display:grid;gap:1rem">
              <input type="hidden" id="cfId">
              <div style="grid-template-columns:1fr">
                <label style="font-size:.78rem;color:var(--text-secondary);display:block;margin-bottom:.3rem">Nome / Razão Social *</label>
                <input id="cfNome" required type="text" placeholder="Ex: Agropecuaria São João LTDA"
                  style="width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:.5rem .75rem;color:var(--text-primary);font-size:.9rem;box-sizing:border-box">
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
                <div>
                  <label style="font-size:.78rem;color:var(--text-secondary);display:block;margin-bottom:.3rem">CNPJ / CPF</label>
                  <input id="cfDoc" type="text" placeholder="00.000.000/0000-00"
                    style="width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:.5rem .75rem;color:var(--text-primary);font-size:.9rem;box-sizing:border-box">
                </div>
                <div>
                  <label style="font-size:.78rem;color:var(--text-secondary);display:block;margin-bottom:.3rem">Telefone</label>
                  <input id="cfTel" type="tel" placeholder="(63) 99999-9999"
                    style="width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:.5rem .75rem;color:var(--text-primary);font-size:.9rem;box-sizing:border-box">
                </div>
                <div>
                  <label style="font-size:.78rem;color:var(--text-secondary);display:block;margin-bottom:.3rem">E-mail</label>
                  <input id="cfEmail" type="email" placeholder="cliente@email.com"
                    style="width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:.5rem .75rem;color:var(--text-primary);font-size:.9rem;box-sizing:border-box">
                </div>
                <div>
                  <label style="font-size:.78rem;color:var(--text-secondary);display:block;margin-bottom:.3rem">Cidade</label>
                  <input id="cfCidade" type="text" placeholder="Ex: Palmas"
                    style="width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:.5rem .75rem;color:var(--text-primary);font-size:.9rem;box-sizing:border-box">
                </div>
                <div>
                  <label style="font-size:.78rem;color:var(--text-secondary);display:block;margin-bottom:.3rem">UF</label>
                  <input id="cfUF" type="text" maxlength="2" placeholder="TO"
                    style="width:100%;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:.5rem .75rem;color:var(--text-primary);font-size:.9rem;box-sizing:border-box;text-transform:uppercase">
                </div>
              </div>
              <div style="display:flex;gap:.75rem;justify-content:flex-end;margin-top:.5rem">
                <button type="button" onclick="DemandaClientes._fecharForm()"
                  style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:.5rem 1.2rem;cursor:pointer;color:var(--text-primary);font-size:.85rem">
                  Cancelar
                </button>
                <button type="submit"
                  style="background:var(--accent-primary);color:#fff;border:none;border-radius:8px;padding:.5rem 1.2rem;cursor:pointer;font-size:.85rem;font-weight:600">
                  💾 Salvar
                </button>
              </div>
            </form>
          </div>
        </div>`;
        await _atualizarTabela();
    }

    async function _atualizarTabela(filtro) {
        const tbody  = document.getElementById('clientesTbody');
        const status = document.getElementById('clientesStatus');
        if (!tbody) return;
        try {
            let lista = filtro ? await buscar(filtro) : await listar();
            lista = lista.filter(c => c.ativo !== false);
            if (status) status.textContent = lista.length + ' clientes cadastrados';
            if (!lista.length) {
                tbody.innerHTML = '<tr><td colspan="6" style="padding:2rem;text-align:center;color:var(--text-secondary)">Nenhum cliente. Clique em "Novo Cliente" ou "Importar do ERP".</td></tr>';
                return;
            }
            tbody.innerHTML = lista.map(c => {
                const jc = JSON.stringify({id:c.id,nome:c.nome,documento:c.documento,telefone:c.telefone,email:c.email,cidade:c.cidade,estado:c.estado}).replace(/"/g,"'");
                return `<tr style="border-top:1px solid var(--border)" onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background=''">
                    <td style="padding:.6rem 1rem;font-weight:500;color:var(--text-primary)">${_esc(c.nome)}</td>
                    <td style="padding:.6rem 1rem;color:var(--text-secondary);font-family:monospace;font-size:.8rem">${_doc(c.documento)}</td>
                    <td style="padding:.6rem 1rem;color:var(--text-secondary)">${c.cidade?_esc(c.cidade)+(c.estado?' - '+c.estado:''):'—'}</td>
                    <td style="padding:.6rem 1rem;color:var(--text-secondary);font-family:monospace;font-size:.8rem">${_tel(c.telefone)}</td>
                    <td style="padding:.6rem 1rem">${c.origemErp?'<span style="font-size:.72rem;background:#0ea5e920;color:#0ea5e9;border-radius:4px;padding:.15rem .4rem">ERP</span>':'<span style="font-size:.72rem;background:var(--bg-secondary);color:var(--text-secondary);border-radius:4px;padding:.15rem .4rem">Manual</span>'}</td>
                    <td style="padding:.6rem 1rem">
                        <button onclick="DemandaClientes._abrirForm(${jc})" style="background:none;border:none;cursor:pointer;color:var(--accent-primary);padding:.2rem .4rem" title="Editar"><span class="material-icons-round" style="font-size:1rem">edit</span></button>
                        <button onclick="DemandaClientes._excluir('${c.id}','${_esc(c.nome)}')" style="background:none;border:none;cursor:pointer;color:#ef4444;padding:.2rem .4rem" title="Remover"><span class="material-icons-round" style="font-size:1rem">delete</span></button>
                    </td>
                </tr>`;
            }).join('');
        } catch(e) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="padding:2rem;text-align:center;color:#ef4444">Erro: '+_esc(e.message)+'</td></tr>';
        }
    }

    function _abrirForm(c) {
        const m = document.getElementById('modalClienteForm');
        if(!m) return;
        m.style.display = 'flex';
        const t = document.getElementById('cfTitulo');
        if(t) t.textContent = c ? 'Editar Cliente' : 'Novo Cliente';
        document.getElementById('cfId').value    = c?.id    || '';
        document.getElementById('cfNome').value  = c?.nome  || '';
        document.getElementById('cfDoc').value   = _doc(c?.documento) || '';
        document.getElementById('cfTel').value   = _tel(c?.telefone)  || '';
        document.getElementById('cfEmail').value = c?.email || '';
        document.getElementById('cfCidade').value= c?.cidade|| '';
        document.getElementById('cfUF').value    = c?.estado|| '';
    }

    function _fecharForm() {
        const m = document.getElementById('modalClienteForm');
        if(m) m.style.display = 'none';
    }

    async function _submitForm(e) {
        e.preventDefault();
        try {
            await salvar({
                id:        document.getElementById('cfId').value    || undefined,
                nome:      document.getElementById('cfNome').value,
                documento: document.getElementById('cfDoc').value,
                telefone:  document.getElementById('cfTel').value,
                email:     document.getElementById('cfEmail').value,
                cidade:    document.getElementById('cfCidade').value,
                estado:    document.getElementById('cfUF').value,
            });
            _fecharForm();
            await _atualizarTabela();
            if(typeof DemandaApp!=='undefined') DemandaApp._toast('Cliente salvo!','success');
        } catch(err) { alert('Erro: '+err.message); }
    }

    async function _excluir(id, nome) {
        if (!confirm('Remover o cliente "'+nome+'"?')) return;
        await desativar(id);
        await _atualizarTabela();
    }

    let _t;
    function _onBusca(v) { clearTimeout(_t); _t = setTimeout(() => _atualizarTabela(v||null), 300); }

    async function _sincErp() {
        const btn = document.getElementById('btnClientesSinc');
        const status = document.getElementById('clientesStatus');
        if(btn) btn.disabled = true;
        if(status) status.textContent = 'Conectando ao ERP...';
        try {
            if(typeof ErpIntegration==='undefined') throw new Error('Modulo ERP nao carregado.');
            const adapter = await ErpIntegration.getAdapter();
            if(!adapter) throw new Error('ERP nao configurado.');
            if(status) status.textContent = 'Sincronizando...';
            const clientes = await adapter.syncClients();
            const total = await importarLote(clientes, (s,t) => { if(status) status.textContent = 'Importando '+s+'/'+t+'...'; });
            await _atualizarTabela();
            if(typeof DemandaApp!=='undefined') DemandaApp._toast(total+' clientes importados!','success');
        } catch(e) {
            alert('Falha ao importar ERP: '+e.message);
            if(status) status.textContent = 'Erro na importacao.';
        } finally {
            if(btn) { btn.disabled=false; btn.innerHTML='<span class="material-icons-round" style="font-size:1rem">sync</span> Importar do ERP'; }
        }
    }

    return { listar, buscar, salvar, desativar, importarLote, renderView,
             _abrirForm, _fecharForm, _submitForm, _excluir, _onBusca, _sincErp };
})();

if (typeof window !== 'undefined') window.DemandaClientes = DemandaClientes;