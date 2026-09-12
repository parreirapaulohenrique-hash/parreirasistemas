/**
 * maxcrm-visit.js — Motor do Questionário de Visita
 * ===================================================
 * Parreira Sistemas — MAXCRM Campo v1.0.0
 */

// ── Helpers genéricos de UI ──────────────────────────────────────────────────

function _chipGrid(opcoes, chaveResposta, multiplo) {
    return '<div class="chip-grid" id="chipGrid_' + chaveResposta + '">' +
        opcoes.map(function(op) {
            return '<div class="chip" data-valor="' + op.valor + '" onclick="toggleChip(this,\'' + chaveResposta + '\',' + multiplo + ')">' + op.label + '</div>';
        }).join('') + '</div>';
}

window.toggleChip = function(el, chave, multiplo) {
    if (!multiplo) {
        var grid = el.parentElement;
        grid.querySelectorAll('.chip').forEach(function(c) { c.classList.remove('selected'); });
    }
    el.classList.toggle('selected');
    _autoSaveChips(chave, multiplo);
};

function _autoSaveChips(chave, multiplo) {
    var grid = document.getElementById('chipGrid_' + chave);
    if (!grid) return;
    var selecionados = Array.from(grid.querySelectorAll('.chip.selected')).map(function(c) {
        return { valor: c.dataset.valor, label: c.textContent.trim() };
    });
    if (multiplo) {
        salvarRespostaEtapa(chave, selecionados);
    } else {
        salvarRespostaEtapa(chave, selecionados[0] ? selecionados[0].valor : null);
    }
}

window.selectSegmenter = function(el, chave) {
    el.parentElement.querySelectorAll('.segmenter-item').forEach(function(i) { i.classList.remove('active'); });
    el.classList.add('active');
    salvarRespostaEtapa(chave, el.dataset.valor);
};

window._proximo = function(proxTela) { navigateTo(proxTela); };

window.salvarEAvancar = async function(chaveChips, proxTela) {
    var grid = document.getElementById('chipGrid_' + chaveChips);
    if (grid) {
        var selecionados = Array.from(grid.querySelectorAll('.chip.selected')).map(function(c) {
            return { valor: c.dataset.valor, label: c.textContent.trim() };
        });
        await salvarRespostaEtapa(chaveChips, selecionados);
    }
    navigateTo(proxTela);
};
// ── TELA 1: CONTATO ──────────────────────────────────────────────────────────

window.initTelaContato = function() {
    var tela = document.getElementById('screen-visita_contato');
    if (!tela) return;
    var empresa = MaxCRMState.empresaAtual;
    tela.innerHTML = [
        '<div class="section-header">',
        '<div class="section-title">Identificar Contato</div>',
        '<div class="section-subtitle">' + (empresa ? (empresa.nomeFantasia || empresa.razaoSocial) : 'Empresa') + '</div>',
        '</div>',
        '<div class="card" id="contatos-lista"></div>',
        '<div class="card">',
        '<div class="card-header"><div class="card-icon"><span class="material-icons-round">person_add</span></div>',
        '<div><div class="card-title">Adicionar Contato</div><div class="card-subtitle">Quem atendeu você?</div></div></div>',
        '<div class="form-group"><label class="form-label required">Nome</label>',
        '<input type="text" class="form-input" id="contatoNome" placeholder="Nome completo" autocomplete="off"></div>',
        '<div class="form-group"><label class="form-label">Cargo</label>',
        '<input type="text" class="form-input" id="contatoCargo" placeholder="Ex: Gerente Financeiro"></div>',
        '<div class="form-group"><label class="form-label">Telefone / WhatsApp</label>',
        '<input type="tel" class="form-input" id="contatoTelefone" placeholder="(00) 00000-0000"></div>',
        '<div class="form-group"><label class="form-label">Papel na decisão</label>',
        _chipGrid([{valor:"usuario",label:"Usuário"},{valor:"influenciador",label:"Influenciador"},{valor:"decisor",label:"Decisor"},{valor:"decisor_fin",label:"Dec. Financeiro"},{valor:"proprietario",label:"Proprietário"},{valor:"ti",label:"TI"},{valor:"contador",label:"Contador"},{valor:"outro",label:"Outro"}],"contato_papel",false),
        '</div>',
        '<button class="btn btn-secondary" onclick="adicionarContato()" style="margin-bottom:8px"><span class="material-icons-round">add</span> Adicionar Contato</button>',
        '</div>',
        '<button class="btn btn-primary" onclick="_proximo(\'visita_perfil\')"><span class="material-icons-round">arrow_forward</span> Avançar para Perfil</button>',
        '<div style="height:12px"></div>',
        '<button class="btn btn-ghost" onclick="voltar()" style="width:100%">← Voltar</button>'
    ].join('');
    _renderContatosAdicionados();
};

window.adicionarContato = async function() {
    var nome = (document.getElementById('contatoNome') || {}).value || '';
    nome = nome.trim();
    if (!nome) { showToast('Informe o nome do contato', 'error'); return; }
    var cargo    = ((document.getElementById('contatoCargo') || {}).value || '').trim();
    var telefone = ((document.getElementById('contatoTelefone') || {}).value || '').trim();
    var papelEl  = document.querySelector('#chipGrid_contato_papel .chip.selected');
    var papel    = papelEl ? papelEl.dataset.valor : 'usuario';
    var contato  = await MaxCRMDB.salvarContato({ empresaId: (MaxCRMState.empresaAtual || {}).id, nome, cargo, telefone, papel, decisorPrincipal: papel === 'decisor' || papel === 'proprietario' });
    var lista    = (MaxCRMState.visitaAtual && MaxCRMState.visitaAtual.respostas && MaxCRMState.visitaAtual.respostas.contatos) || [];
    lista.push({ id: contato.id, nome, cargo, papel });
    await salvarRespostaEtapa('contatos', lista);
    document.getElementById('contatoNome').value = '';
    document.getElementById('contatoCargo').value = '';
    document.getElementById('contatoTelefone').value = '';
    document.querySelectorAll('#chipGrid_contato_papel .chip').forEach(function(c) { c.classList.remove('selected'); });
    _renderContatosAdicionados();
    showToast(nome + ' adicionado', 'success');
};

function _renderContatosAdicionados() {
    var lista    = document.getElementById('contatos-lista');
    var contatos = (MaxCRMState.visitaAtual && MaxCRMState.visitaAtual.respostas && MaxCRMState.visitaAtual.respostas.contatos) || [];
    if (!lista) return;
    if (contatos.length === 0) { lista.innerHTML = '<div style="padding:8px;color:var(--text-muted);font-size:0.82rem;text-align:center">Nenhum contato adicionado ainda</div>'; return; }
    lista.innerHTML = '<div style="font-size:0.75rem;font-weight:700;color:var(--text-secondary);margin-bottom:8px">CONTATOS ADICIONADOS</div>' +
        contatos.map(function(c) {
            return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">' +
                '<span class="material-icons-round" style="color:var(--primary);font-size:1.1rem">person</span>' +
                '<div><div style="font-weight:600;font-size:0.88rem">' + c.nome + '</div>' +
                '<div style="font-size:0.75rem;color:var(--text-secondary)">' + (c.cargo || '') + (c.papel ? ' • ' + c.papel : '') + '</div></div></div>';
        }).join('');
}
// ── TELA 2: PERFIL OPERACIONAL ────────────────────────────────────────────────

window.initTelaPerfilOperacional = function() {
    var tela = document.getElementById('screen-visita_perfil');
    if (!tela) return;
    tela.innerHTML = [
        '<div class="section-header"><div class="section-title">Perfil Operacional</div><div class="section-subtitle">Estrutura da empresa</div></div>',
        '<div class="card">',
        '<div class="form-group"><label class="form-label">Usuários do ERP</label>',
        _chipGrid([{valor:"1-5",label:"1-5"},{valor:"6-15",label:"6-15"},{valor:"16-30",label:"16-30"},{valor:"31-50",label:"31-50"},{valor:"51-100",label:"51-100"},{valor:"100+",label:"100+"}],"perfil_usuarios",false),
        '</div>',
        '<div class="form-group"><label class="form-label">Número de filiais</label>',
        _chipGrid([{valor:"0",label:"Só matriz"},{valor:"1",label:"1 filial"},{valor:"2-3",label:"2-3"},{valor:"4-10",label:"4-10"},{valor:"10+",label:"Mais de 10"}],"perfil_filiais",false),
        '</div>',
        '<div class="form-group"><label class="form-label">Segmento</label>',
        _chipGrid([{valor:"distribuidor",label:"Distribuidor"},{valor:"atacado",label:"Atacado"},{valor:"varejo",label:"Varejo"},{valor:"autopecas",label:"Autopeças"},{valor:"supermercado",label:"Supermercado"},{valor:"industria",label:"Indústria"},{valor:"servicos",label:"Serviços"},{valor:"agro",label:"Agronegócio"},{valor:"construcao",label:"Construção"},{valor:"saude",label:"Saúde"},{valor:"outro",label:"Outro"}],"perfil_segmento",false),
        '</div>',
        '</div>',
        '<div class="card">',
        '<div style="font-size:0.82rem;font-weight:700;color:var(--text-secondary);margin-bottom:12px">RECURSOS UTILIZADOS</div>',
        _chipGrid([{valor:"pdv",label:"PDV/Caixa"},{valor:"ecommerce",label:"E-commerce"},{valor:"wms",label:"WMS"},{valor:"bi",label:"BI"},{valor:"fv",label:"Força de Vendas"},{valor:"banco",label:"Int. Bancária"},{valor:"pix",label:"PIX"},{valor:"fiscal",label:"NF-e/Fiscal"},{valor:"contabil",label:"Int. Contábil"},{valor:"crm",label:"CRM"},{valor:"app",label:"App Mobile"}],"perfil_modulos",true),
        '</div>',
        '<button class="btn btn-primary" onclick="salvarPerfilEAvancar()"><span class="material-icons-round">arrow_forward</span> Avançar para ERP Atual</button>',
        '<div style="height:12px"></div>',
        '<button class="btn btn-ghost" onclick="voltar()" style="width:100%">← Voltar</button>'
    ].join('');
};

window.salvarPerfilEAvancar = async function() {
    var campos = ['perfil_usuarios','perfil_filiais','perfil_segmento'];
    var perfil = {};
    campos.forEach(function(c) {
        var grid = document.getElementById('chipGrid_' + c);
        if (grid) {
            var sel = grid.querySelector('.chip.selected');
            perfil[c] = sel ? sel.dataset.valor : null;
        }
    });
    var modulosGrid = document.getElementById('chipGrid_perfil_modulos');
    perfil.perfil_modulos = modulosGrid ? Array.from(modulosGrid.querySelectorAll('.chip.selected')).map(function(c) { return c.dataset.valor; }) : [];
    await salvarRespostaEtapa('perfil', perfil);
    navigateTo('visita_erp');
};

// ── TELA 3: ERP ATUAL ─────────────────────────────────────────────────────────

window.initTelaERP = async function() {
    var tela = document.getElementById('screen-visita_erp');
    if (!tela) return;
    var erps = await MaxCRMDB.listarERPs();
    var erpsHtml = erps.map(function(e) {
        return '<div class="list-item" style="padding:10px 12px;margin-bottom:4px" onclick="selecionarERP(\'' + e.id + '\',\'' + e.nome.replace(/'/g,"&#39;") + '\',\'' + e.fornecedor.replace(/'/g,"&#39;") + '\')">' +
            '<div class="list-item-content"><div class="list-item-title">' + e.nome + '</div><div class="list-item-sub">' + e.fornecedor + '</div></div></div>';
    }).join('');
    var satHtml = [{v:1,e:"😡",l:"Muito\nInsatisfeito"},{v:2,e:"😞",l:"Insatisfeito"},{v:3,e:"😐",l:"Neutro"},{v:4,e:"😊",l:"Satisfeito"},{v:5,e:"😍",l:"Muito\nSatisfeito"}].map(function(s) {
        return '<div class="sat-btn" data-val="' + s.v + '" onclick="selecionarSatisfacao(' + s.v + ')"><div class="sat-emoji">' + s.e + '</div><div style="font-size:0.6rem;text-align:center;white-space:pre-line">' + s.l + '</div></div>';
    }).join('');
    tela.innerHTML = [
        '<div class="section-header"><div class="section-title">ERP Atual</div><div class="section-subtitle">Qual sistema utilizam?</div></div>',
        '<div class="card">',
        '<div class="form-group"><label class="form-label required">Sistema ERP</label>',
        '<input type="text" class="form-input" id="erpSearch" placeholder="Buscar sistema..." autocomplete="off" oninput="filtrarERPs(this.value)">',
        '<div id="erpLista" style="margin-top:8px;max-height:200px;overflow-y:auto">' + erpsHtml + '</div>',
        '<div id="erpSelecionado" style="display:none;margin-top:12px;padding:10px;background:var(--primary-bg);border:1px solid var(--primary);border-radius:8px;font-weight:700;color:var(--primary)"></div>',
        '<button class="btn btn-ghost btn-sm" onclick="cadastrarNovoERP()" style="margin-top:8px"><span class="material-icons-round" style="font-size:0.9rem">add</span> Não encontrei — cadastrar novo</button>',
        '</div>',
        '<div class="divider"></div>',
        '<div class="form-group"><label class="form-label">Tempo de uso</label>',
        _chipGrid([{valor:"menos1",label:"< 1 ano"},{valor:"1-3",label:"1-3 anos"},{valor:"3-5",label:"3-5 anos"},{valor:"5-10",label:"5-10 anos"},{valor:"mais10",label:"> 10 anos"}],"erp_tempo",false),
        '</div>',
        '<div class="form-group"><label class="form-label">Satisfação com o ERP atual</label>',
        '<div class="satisfaction-grid" id="satGrid">' + satHtml + '</div>',
        '</div>',
        '<div class="form-group"><label class="form-label">Mensalidade aprox. (opcional)</label>',
        '<input type="text" class="form-input" id="erpMensalidade" placeholder="R$ 0,00" oninput="salvarRespostaEtapa(\'erp_mensalidade\', this.value)"></div>',
        '<div class="form-group"><label class="form-label">Contrato / Fidelidade?</label>',
        _chipGrid([{valor:"sim_vigente",label:"Contrato vigente"},{valor:"sim_vencendo",label:"Vencendo em breve"},{valor:"mensal",label:"Mensal (sem fidelidade)"},{valor:"nao_sei",label:"Não sabe"}],"erp_contrato",false),
        '</div>',
        '</div>',
        '<button class="btn btn-primary" onclick="_proximo(\'visita_pontos\')"><span class="material-icons-round">arrow_forward</span> Avançar para Pontos Fortes</button>',
        '<div style="height:12px"></div>',
        '<button class="btn btn-ghost" onclick="voltar()" style="width:100%">← Voltar</button>'
    ].join('');
};

window.filtrarERPs = async function(termo) {
    var erps = await MaxCRMDB.listarERPs();
    var lista = document.getElementById('erpLista');
    if (!lista) return;
    var t = (termo || '').toLowerCase();
    var filtrados = erps.filter(function(e) { return e.nome.toLowerCase().includes(t) || e.fornecedor.toLowerCase().includes(t); });
    lista.innerHTML = filtrados.map(function(e) {
        return '<div class="list-item" style="padding:10px 12px;margin-bottom:4px" onclick="selecionarERP(\'' + e.id + '\',\'' + e.nome.replace(/'/g,"&#39;") + '\',\'' + e.fornecedor.replace(/'/g,"&#39;") + '\')">' +
            '<div class="list-item-content"><div class="list-item-title">' + e.nome + '</div><div class="list-item-sub">' + e.fornecedor + '</div></div></div>';
    }).join('');
};

window.selecionarERP = async function(id, nome, fornecedor) {
    (document.getElementById('erpSearch') || {}).value = '';
    var lista = document.getElementById('erpLista'); if (lista) lista.innerHTML = '';
    var div = document.getElementById('erpSelecionado');
    if (div) { div.style.display = 'block'; div.innerHTML = '<span class="material-icons-round" style="font-size:1rem;vertical-align:middle">check_circle</span> ' + nome; }
    var atual = (MaxCRMState.visitaAtual && MaxCRMState.visitaAtual.respostas && MaxCRMState.visitaAtual.respostas.erpAtual) || {};
    await salvarRespostaEtapa('erpAtual', Object.assign({}, atual, { erpId: id, erpNome: nome, erpFornecedor: fornecedor }));
    showToast(nome + ' selecionado');
};

window.cadastrarNovoERP = async function() {
    var nome = prompt('Nome do sistema ERP não listado:');
    if (!nome || !nome.trim()) return;
    var fornecedor = prompt('Fornecedor/empresa:') || '';
    var erp = await MaxCRMDB.salvarERP({ nome: nome.trim(), fornecedor: fornecedor.trim() });
    await selecionarERP(erp.id, erp.nome, erp.fornecedor);
};

window.selecionarSatisfacao = async function(val) {
    document.querySelectorAll('.sat-btn').forEach(function(b) { b.classList.remove('selected'); });
    var btn = document.querySelector('.sat-btn[data-val="' + val + '"]');
    if (btn) btn.classList.add('selected');
    var atual = (MaxCRMState.visitaAtual && MaxCRMState.visitaAtual.respostas && MaxCRMState.visitaAtual.respostas.erpAtual) || {};
    await salvarRespostaEtapa('erpAtual', Object.assign({}, atual, { satisfacao: val }));
};
// ── TELAS 4-11 (Pontos Fortes, Dores, Mudancas, Intencao, Barreiras, Interesse, Timing, Acao) ──

window.initTelaPontos = function() {
    var tela = document.getElementById('screen-visita_pontos');
    if (!tela) return;
    var erp = (MaxCRMState.visitaAtual && MaxCRMState.visitaAtual.respostas && MaxCRMState.visitaAtual.respostas.erpAtual && MaxCRMState.visitaAtual.respostas.erpAtual.erpNome) || 'ERP atual';
    tela.innerHTML = '<div class="section-header"><div class="section-title">Pontos Fortes</div><div class="section-subtitle">"O que você mais gosta no ' + erp + '?"</div></div>' +
        '<div class="card">' +
        _chipGrid([{valor:"facilidade",label:"Facilidade"},{valor:"preco",label:"Preço"},{valor:"suporte",label:"Suporte"},{valor:"estabilidade",label:"Estabilidade"},{valor:"velocidade",label:"Velocidade"},{valor:"financeiro",label:"Financeiro"},{valor:"fiscal",label:"Fiscal"},{valor:"estoque",label:"Estoque"},{valor:"compras",label:"Compras"},{valor:"vendas",label:"Vendas"},{valor:"relatorios",label:"Relatórios"},{valor:"pdv",label:"PDV"},{valor:"wms",label:"WMS"},{valor:"bi",label:"BI"},{valor:"app",label:"App"},{valor:"fv",label:"Força de Vendas"},{valor:"integracoes",label:"Integrações"},{valor:"atendimento",label:"Atendimento"},{valor:"outros",label:"Outros"}],"pontosFortes",true) +
        '<div style="margin-top:16px"><label class="form-label">Observação (opcional)</label>' +
        '<textarea class="form-input" id="pontosObs" rows="2" placeholder="Algo que se destacou na conversa..." oninput="salvarRespostaEtapa(\'pontosObs\', this.value)" style="resize:none"></textarea></div>' +
        '</div>' +
        '<button class="btn btn-primary" onclick="salvarEAvancar(\'pontosFortes\',\'visita_dores\')"><span class="material-icons-round">arrow_forward</span> Avançar para Dores</button>' +
        '<div style="height:12px"></div><button class="btn btn-ghost" onclick="voltar()" style="width:100%">← Voltar</button>';
};

window.initTelaDores = function() {
    var tela = document.getElementById('screen-visita_dores');
    if (!tela) return;
    tela.innerHTML = '<div class="section-header"><div class="section-title">Dores</div><div class="section-subtitle">"O que mais incomoda no sistema atual?"</div></div>' +
        '<div class="card"><div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:12px">Selecione as dores e indique a intensidade de cada uma</div>' +
        _chipGrid([{valor:"suporte",label:"Suporte lento"},{valor:"atendimento",label:"Atendimento ruim"},{valor:"lentidao",label:"Lentidão"},{valor:"instabilidade",label:"Instabilidade"},{valor:"usabilidade",label:"Usabilidade difícil"},{valor:"relatorios",label:"Relatórios fracos"},{valor:"estoque",label:"Estoque"},{valor:"compras",label:"Compras"},{valor:"financeiro",label:"Financeiro"},{valor:"fiscal",label:"Fiscal"},{valor:"vendas",label:"Vendas"},{valor:"wms",label:"WMS"},{valor:"bi",label:"BI"},{valor:"app",label:"App"},{valor:"fv",label:"Força de Vendas"},{valor:"integracao",label:"Integração"},{valor:"ecommerce",label:"E-commerce"},{valor:"custo",label:"Custo alto"},{valor:"sem_presencial",label:"Sem suporte presencial"},{valor:"outros",label:"Outros"}],"dores_sel",true) +
        '</div>' +
        '<div class="card" id="doresIntCard" style="display:none"><div class="card-title" style="margin-bottom:12px">Intensidade das Dores</div><div id="doresIntGrid"></div></div>' +
        '<button class="btn btn-primary" onclick="salvarDoresEAvancar()"><span class="material-icons-round">arrow_forward</span> Avançar para 3 Mudanças</button>' +
        '<div style="height:12px"></div><button class="btn btn-ghost" onclick="voltar()" style="width:100%">← Voltar</button>';
    // Observer
    var grid = document.getElementById('chipGrid_dores_sel');
    if (grid) {
        var obs = new MutationObserver(_renderDoresIntensidade);
        obs.observe(grid, { attributes: true, subtree: true, attributeFilter: ['class'] });
    }
};

function _renderDoresIntensidade() {
    var selecionados = Array.from(document.querySelectorAll('#chipGrid_dores_sel .chip.selected'));
    var card = document.getElementById('doresIntCard');
    var gridEl = document.getElementById('doresIntGrid');
    if (!card || !gridEl) return;
    if (selecionados.length === 0) { card.style.display = 'none'; return; }
    card.style.display = 'block';
    gridEl.innerHTML = selecionados.map(function(chip) {
        return '<div style="margin-bottom:12px"><div style="font-size:0.82rem;font-weight:600;margin-bottom:6px">' + chip.textContent.trim() + '</div>' +
            '<div class="scale-grid">' +
            [{l:'BAIXA',n:1},{l:'MÉDIA',n:2},{l:'ALTA',n:3},{l:'CRÍTICA',n:4}].map(function(x) {
                return '<div class="scale-btn" data-level="' + x.n + '" data-dor="' + chip.dataset.valor + '" onclick="selecionarIntensidade(this,\'' + chip.dataset.valor + '\',\'' + x.l + '\')">' + x.l + '</div>';
            }).join('') + '</div></div>';
    }).join('');
}

window.selecionarIntensidade = function(el, dor, nivel) {
    el.parentElement.querySelectorAll('.scale-btn').forEach(function(b) { b.classList.remove('selected'); });
    el.classList.add('selected');
    var dores = (MaxCRMState.visitaAtual && MaxCRMState.visitaAtual.respostas && MaxCRMState.visitaAtual.respostas.dores) || [];
    var idx = dores.findIndex(function(d) { return d.valor === dor; });
    if (idx >= 0) dores[idx].intensidade = nivel;
    else dores.push({ valor: dor, label: dor, intensidade: nivel });
    salvarRespostaEtapa('dores', dores);
};

window.salvarDoresEAvancar = async function() {
    var selecionados = Array.from(document.querySelectorAll('#chipGrid_dores_sel .chip.selected'));
    var doresExist = (MaxCRMState.visitaAtual && MaxCRMState.visitaAtual.respostas && MaxCRMState.visitaAtual.respostas.dores) || [];
    var dores = selecionados.map(function(c) {
        var ex = doresExist.find(function(d) { return d.valor === c.dataset.valor; });
        return { valor: c.dataset.valor, label: c.textContent.trim(), intensidade: ex ? ex.intensidade : 'BAIXA' };
    });
    await salvarRespostaEtapa('dores', dores);
    navigateTo('visita_mudancas');
};

window.initTelaMudancas = function() {
    var tela = document.getElementById('screen-visita_mudancas');
    if (!tela) return;
    tela.innerHTML = '<div class="section-header"><div class="section-title">As 3 Mudanças</div><div class="section-subtitle">"Se pudesse mudar 3 coisas no sistema hoje, quais seriam?"</div></div>' +
        '<div class="card">' +
        '<div class="form-group"><label class="form-label">Mudança 1</label><input type="text" class="form-input" id="mudanca1" placeholder="O que mudaria primeiro?" oninput="salvarMudanca()"></div>' +
        '<div class="form-group"><label class="form-label">Mudança 2</label><input type="text" class="form-input" id="mudanca2" placeholder="E em segundo?" oninput="salvarMudanca()"></div>' +
        '<div class="form-group"><label class="form-label">Mudança 3</label><input type="text" class="form-input" id="mudanca3" placeholder="E por último?" oninput="salvarMudanca()"></div>' +
        '<div style="padding:12px;background:var(--primary-bg);border-radius:8px;font-size:0.78rem;color:var(--primary)">💡 Registre exatamente o que o cliente disse — peso estratégico no Lead Score.</div>' +
        '</div>' +
        '<button class="btn btn-primary" onclick="_proximo(\'visita_intencao\')"><span class="material-icons-round">arrow_forward</span> Avançar para Intenção de Troca</button>' +
        '<div style="height:12px"></div><button class="btn btn-ghost" onclick="voltar()" style="width:100%">← Voltar</button>';
};

window.salvarMudanca = function() {
    clearTimeout(window._mudancaTimer);
    window._mudancaTimer = setTimeout(async function() {
        await salvarRespostaEtapa('tresMudancas', {
            mudanca1: ((document.getElementById('mudanca1') || {}).value || '').trim(),
            mudanca2: ((document.getElementById('mudanca2') || {}).value || '').trim(),
            mudanca3: ((document.getElementById('mudanca3') || {}).value || '').trim()
        });
    }, 600);
};

window.initTelaIntencao = function() {
    var tela = document.getElementById('screen-visita_intencao');
    if (!tela) return;
    tela.innerHTML = '<div class="section-header"><div class="section-title">Intenção de Troca</div><div class="section-subtitle">"Já pensou em trocar de ERP?"</div></div>' +
        '<div class="card">' +
        _chipGrid([{valor:"nunca",label:"Nunca pensei"},{valor:"ja_pensei",label:"Já pensei"},{valor:"pesquisando",label:"Estou pesquisando"},{valor:"avaliando",label:"Avaliando sistemas"},{valor:"demonstracoes",label:"Fiz demonstrações"},{valor:"negociando",label:"Estou negociando"},{valor:"pretendo",label:"Pretendo trocar"},{valor:"rapidamente",label:"Quero trocar já!"}],"intencaoTroca",false) +
        '</div>' +
        '<div class="card" id="sistemasAvCard" style="display:none">' +
        '<div style="font-size:0.82rem;font-weight:700;color:var(--text-secondary);margin-bottom:10px">Quais sistemas está avaliando?</div>' +
        '<input type="text" class="form-input" id="sistemaSearch" placeholder="Buscar sistema..." oninput="filtrarERPsSistemas(this.value)">' +
        '<div id="sistemasLista" style="margin-top:8px;max-height:150px;overflow-y:auto"></div>' +
        '<div id="sistemasSel" style="margin-top:8px"></div>' +
        '</div>' +
        '<button class="btn btn-primary" onclick="_proximo(\'visita_barreiras\')"><span class="material-icons-round">arrow_forward</span> Avançar para Barreiras</button>' +
        '<div style="height:12px"></div><button class="btn btn-ghost" onclick="voltar()" style="width:100%">← Voltar</button>';
    var grid = document.getElementById('chipGrid_intencaoTroca');
    if (grid) {
        var obs = new MutationObserver(function() {
            var sel = grid.querySelector('.chip.selected');
            var card = document.getElementById('sistemasAvCard');
            if (card) card.style.display = ['avaliando','demonstracoes','negociando','pretendo','rapidamente'].indexOf(sel ? sel.dataset.valor : '') >= 0 ? 'block' : 'none';
        });
        obs.observe(grid, { attributes: true, subtree: true, attributeFilter: ['class'] });
    }
};

window.filtrarERPsSistemas = async function(termo) {
    var erps = await MaxCRMDB.listarERPs();
    var lista = document.getElementById('sistemasLista');
    if (!lista) return;
    var t = (termo||'').toLowerCase();
    var filtrados = erps.filter(function(e) { return e.nome.toLowerCase().includes(t); });
    lista.innerHTML = filtrados.slice(0,8).map(function(e) {
        return '<div class="list-item" style="padding:8px 12px;margin-bottom:3px" onclick="adicionarSistema(\'' + e.id + '\',\'' + e.nome.replace(/'/g,"&#39;") + '\')"><div class="list-item-title">' + e.nome + '</div></div>';
    }).join('');
};

window.adicionarSistema = async function(id, nome) {
    var lista = (MaxCRMState.visitaAtual && MaxCRMState.visitaAtual.respostas && MaxCRMState.visitaAtual.respostas.sistemasAvaliando) || [];
    if (!lista.find(function(s) { return s.id === id; })) lista.push({ id: id, nome: nome });
    await salvarRespostaEtapa('sistemasAvaliando', lista);
    var inp = document.getElementById('sistemaSearch'); if (inp) inp.value = '';
    var lst = document.getElementById('sistemasLista'); if (lst) lst.innerHTML = '';
    var sel = document.getElementById('sistemasSel');
    if (sel) sel.innerHTML = lista.map(function(s) { return '<span class="chip selected" style="margin:3px">' + s.nome + '</span>'; }).join('');
};

window.initTelaBarreiras = function() {
    var tela = document.getElementById('screen-visita_barreiras');
    if (!tela) return;
    tela.innerHTML = '<div class="section-header"><div class="section-title">Barreiras</div><div class="section-subtitle">"O que dificulta a troca de sistema?"</div></div>' +
        '<div class="card">' +
        _chipGrid([{valor:"preco",label:"Custo de implantação"},{valor:"migracao",label:"Migração de dados"},{valor:"treinamento",label:"Treinamento"},{valor:"equipe",label:"Resistência da equipe"},{valor:"interrupcao",label:"Medo de interrupção"},{valor:"contrato",label:"Contrato vigente"},{valor:"proprietario",label:"Proprietário"},{valor:"contador",label:"Indicação do contador"},{valor:"integracoes",label:"Integrações existentes"},{valor:"customizacoes",label:"Customizações"},{valor:"tempo",label:"Falta de tempo"},{valor:"satisfeito",label:"Satisfação atual"},{valor:"outras",label:"Outras"}],"barreiras",true) +
        '</div>' +
        '<button class="btn btn-primary" onclick="salvarEAvancar(\'barreiras\',\'visita_interesse\')"><span class="material-icons-round">arrow_forward</span> Avançar para Interesse</button>' +
        '<div style="height:12px"></div><button class="btn btn-ghost" onclick="voltar()" style="width:100%">← Voltar</button>';
};

window.initTelaInteresse = function() {
    var tela = document.getElementById('screen-visita_interesse');
    if (!tela) return;
    tela.innerHTML = '<div class="section-header"><div class="section-title">Interesse Percebido</div><div class="section-subtitle">Qual o nível de interesse na troca?</div></div>' +
        '<div class="card">' +
        '<div class="form-group"><label class="form-label">Nível percebido</label>' +
        _chipGrid([{valor:"nenhum",label:"😶 Nenhum"},{valor:"baixo",label:"🔵 Baixo"},{valor:"medio",label:"🟡 Médio"},{valor:"alto",label:"🟠 Alto"},{valor:"muito_alto",label:"🔴 Muito Alto"}],"interesse",false) +
        '</div><div class="divider"></div>' +
        '<div class="form-group"><label class="form-label">Aceitaria uma demonstração?</label>' +
        _chipGrid([{valor:"sim",label:"✅ Sim!"},{valor:"talvez",label:"🤔 Talvez"},{valor:"nao",label:"❌ Não"}],"aceitaDemo",false) +
        '</div></div>' +
        '<button class="btn btn-primary" onclick="_proximo(\'visita_timing\')"><span class="material-icons-round">arrow_forward</span> Avançar para Timing</button>' +
        '<div style="height:12px"></div><button class="btn btn-ghost" onclick="voltar()" style="width:100%">← Voltar</button>';
};

window.initTelaTiming = function() {
    var tela = document.getElementById('screen-visita_timing');
    if (!tela) return;
    tela.innerHTML = '<div class="section-header"><div class="section-title">Timing</div><div class="section-subtitle">Quando poderia acontecer a troca?</div></div>' +
        '<div class="card">' +
        _chipGrid([{valor:"imediata",label:"⚡ Imediata"},{valor:"30d",label:"🔥 Até 30 dias"},{valor:"90d",label:"🟠 31-90 dias"},{valor:"6m",label:"🟡 3-6 meses"},{valor:"12m",label:"🔵 6-12 meses"},{valor:"mais12m",label:"⚪ > 12 meses"},{valor:"sem_previsao",label:"❓ Sem previsão"}],"timing",false) +
        '</div>' +
        '<button class="btn btn-primary" onclick="_proximo(\'visita_acao\')"><span class="material-icons-round">arrow_forward</span> Avançar para Próxima Ação</button>' +
        '<div style="height:12px"></div><button class="btn btn-ghost" onclick="voltar()" style="width:100%">← Voltar</button>';
};

window.initTelaAcao = function() {
    var tela = document.getElementById('screen-visita_acao');
    if (!tela) return;
    var hoje = new Date().toISOString().split('T')[0];
    tela.innerHTML = '<div class="section-header"><div class="section-title">Próxima Ação</div><div class="section-subtitle">Nenhuma visita termina sem uma ação definida</div></div>' +
        '<div class="card">' +
        '<div class="form-group"><label class="form-label required">Tipo de ação</label>' +
        _chipGrid([{valor:"whatsapp",label:"💬 WhatsApp"},{valor:"ligacao",label:"📞 Ligação"},{valor:"nova_visita",label:"🚶 Nova visita"},{valor:"decisor",label:"👔 Falar com decisor"},{valor:"material",label:"📄 Enviar material"},{valor:"ag_demo",label:"📅 Agendar demo"},{valor:"demo",label:"🖥 Realizar demo"},{valor:"proposta",label:"📋 Proposta"},{valor:"acompanhar",label:"🔄 Acompanhar"},{valor:"sem_interesse",label:"⛔ Sem interesse"}],"acao_tipo",false) +
        '</div>' +
        '<div class="form-group"><label class="form-label">Data</label><input type="date" class="form-input" id="acaoData" value="' + hoje + '" oninput="salvarAcao()"></div>' +
        '<div class="form-group"><label class="form-label">Observação</label><textarea class="form-input" id="acaoObs" rows="2" placeholder="O que combinou exatamente?" oninput="salvarAcao()" style="resize:none"></textarea></div>' +
        '</div>' +
        '<button class="btn btn-primary" onclick="avancarParaResumo()"><span class="material-icons-round">summarize</span> Ver Resumo da Visita</button>' +
        '<div style="height:12px"></div><button class="btn btn-ghost" onclick="voltar()" style="width:100%">← Voltar</button>';
    var grid = document.getElementById('chipGrid_acao_tipo');
    if (grid) {
        var obs = new MutationObserver(salvarAcao);
        obs.observe(grid, { attributes: true, subtree: true, attributeFilter: ['class'] });
    }
};

window.salvarAcao = async function() {
    var tipo = document.querySelector('#chipGrid_acao_tipo .chip.selected');
    var data = (document.getElementById('acaoData') || {}).value || '';
    var obs  = ((document.getElementById('acaoObs') || {}).value || '').trim();
    await salvarRespostaEtapa('proximaAcao', { tipo: tipo ? tipo.dataset.valor : '', data: data, responsavel: (MaxCRMState.sessao || {}).nome || '', obs: obs });
};

window.avancarParaResumo = async function() {
    await salvarAcao();
    navigateTo('visita_resumo');
};

// ── HOOK: Intercepta navigateTo para inicializar telas de visita ──────────────

(function() {
    var _orig = window.navigateTo;
    window.navigateTo = function(telaId, opcoes) {
        _orig(telaId, opcoes);
        var mapa = {
            visita_contato:   window.initTelaContato,
            visita_perfil:    window.initTelaPerfilOperacional,
            visita_erp:       window.initTelaERP,
            visita_pontos:    window.initTelaPontos,
            visita_dores:     window.initTelaDores,
            visita_mudancas:  window.initTelaMudancas,
            visita_intencao:  window.initTelaIntencao,
            visita_barreiras: window.initTelaBarreiras,
            visita_interesse: window.initTelaInteresse,
            visita_timing:    window.initTelaTiming,
            visita_acao:      window.initTelaAcao
        };
        if (mapa[telaId]) mapa[telaId]();
    };
})();

console.log('✅ MaxCRM Visit Engine carregado');