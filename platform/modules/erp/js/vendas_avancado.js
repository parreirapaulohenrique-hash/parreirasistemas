/* ═══════════════════════════════════════════════════════════
   Vendas Avançado — Parreira ERP (Fase 4)
   Orçamento, Faturamento, Liberação Crédito, Romaneio, Comissões
   ═══════════════════════════════════════════════════════════ */
'use strict';

const VendasAvancado = (() => {
    const KEYS = {
        orcamentos: 'erp_orcamentos',
        vendas: 'erp_vendas',
        comissoes: 'erp_comissoes'
    };

    const fmtMoney = v => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fmtDate = d => d ? new Date(d).toLocaleDateString('pt-BR') : '-';
    const getProducts = () => JSON.parse(localStorage.getItem('erp_products' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '[]');
    const getVendas = () => JSON.parse(localStorage.getItem(KEYS.vendas) || '[]');

    // ═════════════════════════════════════════════════════
    // 1. ORÇAMENTO
    // ═════════════════════════════════════════════════════
    function renderOrcamento() {
        const el = document.getElementById('view-orcamento');
        if (!el) return;

        const orcamentos = JSON.parse(localStorage.getItem(KEYS.orcamentos) || '[]');

        el.innerHTML = `
        <div class="view-header-bar">
            <h2><span class="material-icons-round">request_quote</span> Orçamentos</h2>
            <button class="btn btn-primary btn-sm" onclick="VendasAvancado.novoOrcamento()">
                <span class="material-icons-round" style="font-size:1rem">add</span> Novo Orçamento
            </button>
        </div>
        <div class="card" style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="border-bottom:1px solid var(--border-color);">
                        <th style="text-align:left;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Nº</th>
                        <th style="text-align:left;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Data</th>
                        <th style="text-align:left;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Cliente</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Itens</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Valor</th>
                        <th style="text-align:center;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Validade</th>
                        <th style="text-align:center;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Status</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${orcamentos.length === 0 ? '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-secondary)">Nenhum orçamento registrado.</td></tr>' : ''}
                    ${orcamentos.map(o => {
            const vencido = new Date(o.validade) < new Date();
            const sClass = o.status === 'convertido' ? 'status-shipped' : o.status === 'cancelado' || vencido ? 'status-overdue' : 'status-pending';
            const sText = o.status === 'convertido' ? 'CONVERTIDO' : vencido ? 'VENCIDO' : (o.status || 'aberto').toUpperCase();
            return `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                            <td style="padding:0.6rem 0.5rem;font-weight:700;">${o.numero}</td>
                            <td style="padding:0.6rem 0.5rem;">${fmtDate(o.data)}</td>
                            <td style="padding:0.6rem 0.5rem;">${o.clienteNome || '-'}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;">${(o.itens || []).length}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;font-weight:600;">${fmtMoney(o.valorTotal)}</td>
                            <td style="text-align:center;padding:0.6rem 0.5rem;">${fmtDate(o.validade)}</td>
                            <td style="text-align:center;padding:0.6rem 0.5rem;">
                                <span class="status-badge ${sClass}">${sText}</span>
                            </td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;">
                                ${o.status !== 'convertido' ? `<button class="btn btn-sm btn-primary" style="padding:0.3rem 0.6rem;font-size:0.75rem;" onclick="VendasAvancado.converterOrcamento('${o.numero}')">Converter</button>` : ''}
                            </td>
                        </tr>`;
        }).join('')}
                </tbody>
            </table>
        </div>`;
    }

    function novoOrcamento() {
        const clientes = JSON.parse(localStorage.getItem('erp_clientes' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '[]');
        const produtos = getProducts();
        const cli = clientes[Math.floor(Math.random() * Math.max(1, clientes.length))] || { code: 1, name: 'CLIENTE EXEMPLO' };

        const numItens = 1 + Math.floor(Math.random() * 4);
        const itens = [];
        for (let i = 0; i < numItens && i < produtos.length; i++) {
            const p = produtos[i];
            const qtd = 1 + Math.floor(Math.random() * 20);
            itens.push({ sku: p.sku, nome: p.nome, qtd, preco: p.preco || 50, valorTotal: qtd * (p.preco || 50) });
        }

        const validade = new Date();
        validade.setDate(validade.getDate() + 15);

        const orc = {
            numero: 'ORC-' + String(Date.now()).slice(-6),
            data: new Date().toISOString().slice(0, 10),
            clienteCodigo: cli.code,
            clienteNome: cli.name || cli.fantasy,
            itens,
            valorTotal: itens.reduce((s, i) => s + i.valorTotal, 0),
            validade: validade.toISOString().slice(0, 10),
            status: 'aberto',
            vendedor: '32 - ABNAEL',
            createdAt: new Date().toISOString()
        };

        const orcamentos = JSON.parse(localStorage.getItem(KEYS.orcamentos) || '[]');
        orcamentos.unshift(orc);
        localStorage.setItem(KEYS.orcamentos, JSON.stringify(orcamentos));

        alert(`Orçamento ${orc.numero} criado!\nCliente: ${orc.clienteNome}\nItens: ${itens.length}\nValor: ${fmtMoney(orc.valorTotal)}\nValidade: ${fmtDate(orc.validade)}`);
        renderOrcamento();
    }

    function converterOrcamento(numero) {
        const orcamentos = JSON.parse(localStorage.getItem(KEYS.orcamentos) || '[]');
        const orc = orcamentos.find(o => o.numero === numero);
        if (!orc) return;
        if (!confirm(`Converter orçamento ${numero} em Pedido de Venda?\nCliente: ${orc.clienteNome}\nValor: ${fmtMoney(orc.valorTotal)}`)) return;

        orc.status = 'convertido';
        localStorage.setItem(KEYS.orcamentos, JSON.stringify(orcamentos));

        // Criar pedido de venda
        const pedido = {
            numero: 'PV-' + String(Date.now()).slice(-6),
            data: new Date().toISOString().slice(0, 10),
            cliente: { codigo: orc.clienteCodigo, razaoSocial: orc.clienteNome },
            itens: orc.itens.map((i, idx) => ({
                seq: idx + 1, sku: i.sku, descricao: i.nome, quantidade: i.qtd,
                valorUnitario: i.preco, valorTotal: i.valorTotal, desconto: 0
            })),
            totais: { totalProdutos: orc.valorTotal, totalNF: orc.valorTotal, desconto: 0 },
            status: 'aberto',
            origemOrcamento: orc.numero,
            createdAt: new Date().toISOString()
        };

        const vendas = getVendas();
        vendas.unshift(pedido);
        localStorage.setItem(KEYS.vendas, JSON.stringify(vendas));

        alert(`✅ Pedido ${pedido.numero} criado a partir do orçamento ${numero}!`);
        renderOrcamento();
    }

    // ═════════════════════════════════════════════════════
    // 2. FATURAMENTO / NF-e
    // ═════════════════════════════════════════════════════
    function renderFaturamento() {
        const el = document.getElementById('view-faturamento');
        if (!el) return;

        const vendas = getVendas();
        const abertos = vendas.filter(v => v.status === 'aberto');
        const faturados = vendas.filter(v => ['faturado', 'venda'].includes(v.status));

        el.innerHTML = `
        <div class="view-header-bar">
            <h2><span class="material-icons-round">task_alt</span> Faturamento / NF-e</h2>
        </div>
        <div style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;">
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Aguardando Faturamento</div>
                <div style="font-size:1.8rem;font-weight:700;color:#f59e0b">${abertos.length}</div>
            </div>
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Faturados</div>
                <div style="font-size:1.8rem;font-weight:700;color:var(--success-color)">${faturados.length}</div>
            </div>
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Valor Pendente</div>
                <div style="font-size:1.5rem;font-weight:700;">${fmtMoney(abertos.reduce((s, v) => s + (v.totais?.totalNF || 0), 0))}</div>
            </div>
        </div>
        <div class="card" style="overflow-x:auto;">
            <div style="padding:0.75rem 1rem;border-bottom:1px solid var(--border-color);font-weight:600;font-size:0.9rem;">
                Pedidos aguardando faturamento
            </div>
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="border-bottom:1px solid var(--border-color);">
                        <th style="padding:0.6rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:left">Pedido</th>
                        <th style="padding:0.6rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:left">Data</th>
                        <th style="padding:0.6rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:left">Cliente</th>
                        <th style="padding:0.6rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:right">Valor</th>
                        <th style="padding:0.6rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:right">Ação</th>
                    </tr>
                </thead>
                <tbody>
                    ${abertos.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-secondary)">Nenhum pedido aguardando faturamento.</td></tr>' : ''}
                    ${abertos.map(v => `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                            <td style="padding:0.6rem 0.5rem;font-weight:700;">${v.numero}</td>
                            <td style="padding:0.6rem 0.5rem;">${fmtDate(v.data)}</td>
                            <td style="padding:0.6rem 0.5rem;">${v.cliente?.razaoSocial || '-'}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;font-weight:600;">${fmtMoney(v.totais?.totalNF)}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;">
                                <button class="btn btn-sm btn-primary" style="padding:0.3rem 0.6rem;font-size:0.75rem;" onclick="VendasAvancado.faturarPedido('${v.numero}')">
                                    <span class="material-icons-round" style="font-size:0.85rem;">receipt_long</span> Faturar
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
    }

    function faturarPedido(numero) {
        const vendas = getVendas();
        const venda = vendas.find(v => v.numero === numero);
        if (!venda) return;
        if (!confirm(`Faturar pedido ${numero}?\nCliente: ${venda.cliente?.razaoSocial}\nValor: ${fmtMoney(venda.totais?.totalNF)}`)) return;

        venda.status = 'faturado';
        venda.nfe = 'NF-' + String(Date.now()).slice(-8);
        venda.dataFaturamento = new Date().toISOString();
        localStorage.setItem(KEYS.vendas, JSON.stringify(vendas));

        if (window.onErpVendaFaturada) window.onErpVendaFaturada(venda);

        alert(`✅ Pedido ${numero} faturado!\nNF-e: ${venda.nfe}`);
        renderFaturamento();
    }

    // ═════════════════════════════════════════════════════
    // 3. LIBERAÇÃO DE CRÉDITO
    // ═════════════════════════════════════════════════════
    function renderLiberacaoCredito() {
        const el = document.getElementById('view-liberacaoCredito');
        if (!el) return;

        const vendas = getVendas();
        const clientes = JSON.parse(localStorage.getItem('erp_clientes' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '[]');

        // Pedidos bloqueados: status=aberto e cliente com bloqueio ou sem limite
        const bloqueados = vendas.filter(v => {
            if (v.status !== 'aberto') return false;
            const cli = clientes.find(c => c.code == v.cliente?.codigo);
            return cli && (cli.bloqueado || (cli.limiteDisponivel || 0) < (v.totais?.totalNF || 0));
        });

        el.innerHTML = `
        <div class="view-header-bar">
            <h2><span class="material-icons-round">verified</span> Liberação de Crédito</h2>
        </div>
        <div style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;">
            <div class="card" style="flex:1;min-width:200px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Pedidos Bloqueados</div>
                <div style="font-size:1.8rem;font-weight:700;color:var(--danger-color)">${bloqueados.length}</div>
            </div>
            <div class="card" style="flex:1;min-width:200px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Valor Retido</div>
                <div style="font-size:1.5rem;font-weight:700;">${fmtMoney(bloqueados.reduce((s, v) => s + (v.totais?.totalNF || 0), 0))}</div>
            </div>
        </div>
        <div class="card" style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="border-bottom:1px solid var(--border-color);">
                        <th style="padding:0.6rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:left">Pedido</th>
                        <th style="padding:0.6rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:left">Cliente</th>
                        <th style="padding:0.6rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:right">Valor Pedido</th>
                        <th style="padding:0.6rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:right">Limite Disp.</th>
                        <th style="padding:0.6rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:center">Motivo</th>
                        <th style="padding:0.6rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:right">Ação</th>
                    </tr>
                </thead>
                <tbody>
                    ${bloqueados.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-secondary)">Nenhum pedido bloqueado por crédito. ✅</td></tr>' : ''}
                    ${bloqueados.map(v => {
            const cli = clientes.find(c => c.code == v.cliente?.codigo) || {};
            const motivo = cli.bloqueado ? 'BLOQUEADO' : 'SEM LIMITE';
            return `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                            <td style="padding:0.6rem 0.5rem;font-weight:700;">${v.numero}</td>
                            <td style="padding:0.6rem 0.5rem;">${v.cliente?.razaoSocial || '-'}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;font-weight:600;">${fmtMoney(v.totais?.totalNF)}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;color:var(--danger-color);">${fmtMoney(cli.limiteDisponivel)}</td>
                            <td style="text-align:center;padding:0.6rem 0.5rem;">
                                <span class="status-badge status-overdue">${motivo}</span>
                            </td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;">
                                <button class="btn btn-sm btn-primary" style="padding:0.3rem 0.6rem;font-size:0.75rem;" onclick="VendasAvancado.liberarCredito('${v.numero}')">Liberar</button>
                            </td>
                        </tr>`;
        }).join('')}
                </tbody>
            </table>
        </div>`;
    }

    function liberarCredito(numero) {
        if (!confirm(`Liberar crédito para o pedido ${numero}?\nIsto aprovará o pedido para faturamento.`)) return;
        const vendas = getVendas();
        const v = vendas.find(x => x.numero === numero);
        if (v) {
            v.creditoLiberado = true;
            v.creditoLiberadoEm = new Date().toISOString();
            localStorage.setItem(KEYS.vendas, JSON.stringify(vendas));
            alert(`✅ Crédito liberado para ${numero}. Pedido disponível para faturamento.`);
        }
        renderLiberacaoCredito();
    }

    // ═════════════════════════════════════════════════════
    // 4. ROMANEIO DE CARGA
    // ═════════════════════════════════════════════════════
    function renderRomaneio() {
        const el = document.getElementById('view-romaneio');
        if (!el) return;

        const vendas = getVendas();
        const faturados = vendas.filter(v => ['faturado', 'venda'].includes(v.status));

        // Agrupar por rota
        const porRota = {};
        faturados.forEach(v => {
            const rota = v.rota || v.transporte?.transportadora?.razaoSocial || 'SEM ROTA';
            if (!porRota[rota]) porRota[rota] = [];
            porRota[rota].push(v);
        });

        const rotas = Object.entries(porRota);

        el.innerHTML = `
        <div class="view-header-bar">
            <h2><span class="material-icons-round">local_shipping</span> Romaneio de Carga</h2>
        </div>
        <div style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;">
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Pedidos p/ Embarque</div>
                <div style="font-size:1.8rem;font-weight:700;color:var(--primary-color)">${faturados.length}</div>
            </div>
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Rotas</div>
                <div style="font-size:1.8rem;font-weight:700;">${rotas.length}</div>
            </div>
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Valor Total</div>
                <div style="font-size:1.5rem;font-weight:700">${fmtMoney(faturados.reduce((s, v) => s + (v.totais?.totalNF || 0), 0))}</div>
            </div>
        </div>
        ${rotas.length === 0 ? '<div class="card" style="padding:2rem;text-align:center;color:var(--text-secondary)">Nenhum pedido faturado para montar romaneio.</div>' : ''}
        ${rotas.map(([rota, pedidos]) => `
            <div class="card" style="margin-bottom:1rem;overflow-x:auto;">
                <div style="padding:0.75rem 1rem;border-bottom:1px solid var(--border-color);display:flex;align-items:center;justify-content:space-between;">
                    <div>
                        <span class="material-icons-round" style="font-size:1.1rem;vertical-align:middle;color:var(--primary-color);">route</span>
                        <strong>${rota}</strong>
                        <span style="font-size:0.8rem;color:var(--text-secondary);margin-left:0.5rem;">${pedidos.length} pedido(s)</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:1rem;">
                        <span style="font-weight:700;color:var(--primary-color);">${fmtMoney(pedidos.reduce((s, v) => s + (v.totais?.totalNF || 0), 0))}</span>
                        <button class="btn btn-primary btn-sm" onclick="VendasAvancado.despacharRota('${rota}')"><span class="material-icons-round" style="font-size:1rem">local_shipping</span> Embarcar & Integrar Dispatch</button>
                    </div>
                </div>
                <table style="width:100%;border-collapse:collapse;">
                    <tbody>
                        ${pedidos.map(v => `
                            <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                                <td style="padding:0.5rem;font-weight:600;width:100px;">${v.numero}</td>
                                <td style="padding:0.5rem;">${v.cliente?.razaoSocial || '-'}</td>
                                <td style="text-align:right;padding:0.5rem;">${fmtMoney(v.totais?.totalNF)}</td>
                                <td style="text-align:right;padding:0.5rem;width:80px;">
                                    <span class="status-badge status-shipped">${(v.status || '').toUpperCase()}</span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `).join('')}
        
        <script>
            // Expositor the action function
            window.VendasAvancado = window.VendasAvancado || {};
            window.VendasAvancado.despacharRota = function(rota) {
                if(!confirm('Confirma o despacho do Romaneio da ' + rota + '? Isso enviará as NF-es para a tela do transportador na nuvem.')) return;
                
                // 1) Mark in ERP
                const tenantSuffix = typeof window.getTenantSuffix === 'function' ? window.getTenantSuffix() : '';
                const vendas = JSON.parse(localStorage.getItem('erp_vendas' + tenantSuffix) || '[]');
                
                // 2) Load Dispatches array for the Dispatch app
                let dispatchAppList = JSON.parse(localStorage.getItem('dispatches') || '[]');
                
                let alterados = 0;
                vendas.forEach(v => {
                    const vRota = v.rota || v.transporte?.transportadora?.razaoSocial || 'SEM ROTA';
                    if (vRota === rota && ['faturado', 'venda'].includes(v.status)) {
                        v.status = 'despachado';
                        alterados++;
                        
                        // INTEGRAÇÃO FASE 8: Construir item suportado pelo Dispatcher e injetar globalmente
                        const clienteInfo = typeof v.cliente === 'object' ? v.cliente : { razaoSocial: v.clienteNome || 'Consumidor', cidade: 'Cidade Default', bairro: 'Bairro Default' };
                        
                        const dispatchObj = {
                            id: v.numeroOriginalBase || v.numero || v.id || Date.now().toString(),
                            client: clienteInfo.razaoSocial,
                            city: clienteInfo.cidade || 'CASTANHAL',
                            neighborhood: clienteInfo.bairro || 'CENTRO',
                            value: v.totais?.totalNF || v.valorTotal || 0,
                            weight: 12.5, // Mocked weight for now
                            volumes: v.itens?.reduce((acc, it) => acc + (it.qtd || it.quantidade || 0), 0) || 1,
                            carrier: rota,
                            status: 'Pendente Despacho', // Status that Dispatch App lists
                            date: new Date().toISOString(),
                            createdAt: new Date().toISOString()
                        };
                        
                        // Checa se já não existe na lista do dispatcher
                        const exists = dispatchAppList.find(d => d.id === dispatchObj.id);
                        if(!exists) dispatchAppList.push(dispatchObj);
                    }
                });
                
                if (alterados > 0) {
                    localStorage.setItem('erp_vendas' + tenantSuffix, JSON.stringify(vendas));
                    // Salvar pro Dispatch ler nativamente (Sincronizado p/ firebase se cloud ativo)
                    localStorage.setItem('dispatches', JSON.stringify(dispatchAppList));
                    
                    alert('✅ ' + alterados + ' pedidos despachados e integrados com sistema Mobile/Dispatch.');
                    document.getElementById('view-romaneio').innerHTML = ''; // forcing re-render below
                    window._viewHooks.forEach(fn => { try { fn('romaneio') } catch(e){} });
                } else {
                    alert('Nenhum pedido faturado elegível para esta rota.');
                }
            }
        </script>
        `;
    }

    // ═════════════════════════════════════════════════════
    // 5. COMISSÕES
    // ═════════════════════════════════════════════════════
    function renderComissoes() {
        const el = document.getElementById('view-comissoes');
        if (!el) return;

        const vendas = getVendas();
        const vendedores = JSON.parse(localStorage.getItem('erp_cad_vendedores') || '[]');
        const TAXA_COMISSAO = 3; // 3% padrão

        // Calcular comissões por vendedor
        const comissaoMap = {};
        vendas.filter(v => ['faturado', 'venda', 'despachado'].includes(v.status)).forEach(v => {
            const vendCod = v.vendedor?.codigo || v.vendedorCodigo || '0';
            const vendNome = v.vendedor?.nome || v.vendedorNome || 'Não informado';
            const valor = v.totais?.totalNF || v.totais?.totalProdutos || 0;
            if (!comissaoMap[vendCod]) comissaoMap[vendCod] = { codigo: vendCod, nome: vendNome, totalVendas: 0, qtdPedidos: 0, comissao: 0 };
            comissaoMap[vendCod].totalVendas += valor;
            comissaoMap[vendCod].qtdPedidos++;
            comissaoMap[vendCod].comissao += valor * TAXA_COMISSAO / 100;
        });

        const comissoes = Object.values(comissaoMap).sort((a, b) => b.totalVendas - a.totalVendas);
        const totalComissoes = comissoes.reduce((s, c) => s + c.comissao, 0);
        const totalVendido = comissoes.reduce((s, c) => s + c.totalVendas, 0);

        el.innerHTML = `
        <div class="view-header-bar">
            <h2><span class="material-icons-round">paid</span> Comissões por Vendedor</h2>
        </div>
        <div style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;">
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Vendedores Ativos</div>
                <div style="font-size:1.8rem;font-weight:700;color:var(--primary-color)">${comissoes.length}</div>
            </div>
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Total Vendido</div>
                <div style="font-size:1.5rem;font-weight:700;">${fmtMoney(totalVendido)}</div>
            </div>
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Taxa Comissão</div>
                <div style="font-size:1.8rem;font-weight:700;">${TAXA_COMISSAO}%</div>
            </div>
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Total Comissões</div>
                <div style="font-size:1.5rem;font-weight:700;color:var(--success-color)">${fmtMoney(totalComissoes)}</div>
            </div>
        </div>
        <div class="card" style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="border-bottom:1px solid var(--border-color);">
                        <th style="padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:left">Cód.</th>
                        <th style="padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:left">Vendedor</th>
                        <th style="padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:right">Pedidos</th>
                        <th style="padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:right">Total Vendas</th>
                        <th style="padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:right;font-weight:700;">Comissão</th>
                    </tr>
                </thead>
                <tbody>
                    ${comissoes.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-secondary)">Nenhuma comissão a calcular. Fature pedidos primeiro.</td></tr>' : ''}
                    ${comissoes.map(c => `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                            <td style="padding:0.6rem 0.5rem;font-weight:600;">${c.codigo}</td>
                            <td style="padding:0.6rem 0.5rem;">${c.nome}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;">${c.qtdPedidos}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;">${fmtMoney(c.totalVendas)}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;font-weight:700;color:var(--success-color);">${fmtMoney(c.comissao)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
    }

    // ═════════════════════════════════════════════════════
    // VIEW HOOKS
    // ═════════════════════════════════════════════════════
    const VIEW_MAP = {
        orcamento: renderOrcamento,
        faturamento: renderFaturamento,
        liberacaoCredito: renderLiberacaoCredito,
        romaneio: renderRomaneio,
        comissoes: renderComissoes
    };

    window._viewHooks = window._viewHooks || [];
    window._viewHooks.push(viewId => {
        if (VIEW_MAP[viewId]) VIEW_MAP[viewId]();
    });

    console.log('🛍️ Módulo de Vendas Avançado inicializado (5 telas)');

    return {
        renderOrcamento, novoOrcamento, converterOrcamento,
        renderFaturamento, faturarPedido,
        renderLiberacaoCredito, liberarCredito,
        renderRomaneio,
        renderComissoes
    };
})();
