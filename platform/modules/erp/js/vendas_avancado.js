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
    const sfx = () => (typeof window.getTenantSuffix === 'function' ? window.getTenantSuffix() : '') || (localStorage.getItem('erp_products_01') ? '_01' : '');

    const fmtMoney = v => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fmtDate = d => d ? new Date(d).toLocaleDateString('pt-BR') : '-';
    const getProducts = () => JSON.parse(localStorage.getItem('erp_products' + sfx()) || '[]');
    const getVendas = () => JSON.parse(localStorage.getItem(KEYS.vendas + sfx()) || '[]');
    const saveVendas = (vendas) => localStorage.setItem(KEYS.vendas + sfx(), JSON.stringify(vendas));

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
        const separando = vendas.filter(v => ['Aprovado', 'Pendente WMS', 'Em Separação'].includes(v.status));
        const conferidos = vendas.filter(v => v.status === 'conferido_wms');
        const faturados = vendas.filter(v => ['faturado', 'venda', 'despachado'].includes(v.status));

        el.innerHTML = `
        <div class="view-header-bar">
            <h2><span class="material-icons-round">task_alt</span> Aprovação Comercial & Faturamento</h2>
        </div>
        <div style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;">
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Aprovação (Caixa Única)</div>
                <div style="font-size:1.8rem;font-weight:700;color:#f59e0b">${abertos.length}</div>
            </div>
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;border-left:3px solid #3b82f6;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">No WMS (Separação)</div>
                <div style="font-size:1.8rem;font-weight:700;color:#3b82f6">${separando.length}</div>
            </div>
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;border-left:3px solid #8b5cf6;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Pronto p/ Emissão NF</div>
                <div style="font-size:1.8rem;font-weight:700;color:#8b5cf6">${conferidos.length}</div>
            </div>
        </div>
        
        <div class="card" style="margin-bottom:1rem;overflow-x:auto;">
            <div style="padding:0.75rem 1rem;background:rgba(245,158,11,0.05);border-bottom:1px solid var(--border-color);font-weight:600;font-size:0.9rem;color:#f59e0b;display:flex;align-items:center;gap:0.5rem;">
                <span class="material-icons-round" style="font-size:1.2rem;">shopping_bag</span> 1. Pedidos (Novos)
            </div>
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="border-bottom:1px solid var(--border-color);">
                        <th style="padding:0.6rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:left">Pedido / Origem</th>
                        <th style="padding:0.6rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:left">Cliente</th>
                        <th style="padding:0.6rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:right">Valor</th>
                        <th style="padding:0.6rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:right">Ação</th>
                    </tr>
                </thead>
                <tbody>
                    ${abertos.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:1rem;color:var(--text-secondary)">Nenhuma venda nova na fila.</td></tr>' : ''}
                    ${abertos.map(v => `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                            <td style="padding:0.6rem 0.5rem;font-weight:700;">
                                ${v.numero} <span style="font-size:0.65rem;color:var(--text-secondary);display:block;">${v.origemFV ? 'App Vendas' : 'ERP Local'}</span>
                            </td>
                            <td style="padding:0.6rem 0.5rem;">${v.cliente?.razaoSocial || v.clienteNome || '-'}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;font-weight:600;">${fmtMoney(v.totais?.totalNF || v.valorTotal)}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;">
                                <button class="btn btn-sm" style="background:var(--surface-darker);border:1px solid var(--primary-color);color:var(--primary-color);padding:0.3rem 0.6rem;font-size:0.75rem;" onclick="VendasAvancado.enviarWMS('${v.numero}')">
                                    <span class="material-icons-round" style="font-size:0.85rem;">inventory_2</span> Enviar p/ Separação
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="card" style="overflow-x:auto;">
            <div style="padding:0.75rem 1rem;background:rgba(139,92,246,0.05);border-bottom:1px solid var(--border-color);font-weight:600;font-size:0.9rem;color:#d8b4fe;display:flex;align-items:center;gap:0.5rem;">
                <span class="material-icons-round" style="font-size:1.2rem;">receipt_long</span> 2. Conferidos WMS (Prontos p/ Faturar NF)
            </div>
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="border-bottom:1px solid var(--border-color);">
                        <th style="padding:0.6rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:left">Pedido</th>
                        <th style="padding:0.6rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:left">Volumes (WMS)</th>
                        <th style="padding:0.6rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:left">Peso Bruto</th>
                        <th style="padding:0.6rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:right">Valor NF</th>
                        <th style="padding:0.6rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:right">Ação Fiscal</th>
                    </tr>
                </thead>
                <tbody>
                    ${conferidos.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:1rem;color:var(--text-secondary)">Nenhum pedido aguardando emissão fiscal e liberação.</td></tr>' : ''}
                    ${conferidos.map(v => `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                            <td style="padding:0.6rem 0.5rem;font-weight:700;">${v.numero}</td>
                            <td style="padding:0.6rem 0.5rem;">${v.transporte?.volumes?.quantidade || '-'} cx</td>
                            <td style="padding:0.6rem 0.5rem;">${v.transporte?.volumes?.pesoBruto || '-'} kg</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;font-weight:600;color:var(--primary-color)">${fmtMoney(v.totais?.totalNF || v.valorTotal)}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;">
                                <button class="btn btn-sm btn-primary" style="padding:0.3rem 0.6rem;font-size:0.75rem;background:#8b5cf6;" onclick="VendasAvancado.faturarPedido('${v.numero}')">
                                    <span class="material-icons-round" style="font-size:0.85rem;">receipt</span> Gerar XML & Faturar
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
    }

    function enviarWMS(numero) {
        const vendas = getVendas();
        const venda = vendas.find(v => String(v.numero) === String(numero) || String(v.id) === String(numero));
        if (!venda) return;

        venda.status = 'Aprovado'; // 'Aprovado' is read by WMS picking.js
        venda.dataAprovacao = new Date().toISOString();
        localStorage.setItem(KEYS.vendas, JSON.stringify(vendas));

        alert(`📦 Pedido comercial aprovado.\nEnviado para a Gestão de Ondas do Logístico (WMS) para separação.`);
        renderFaturamento();
    }

    function faturarPedido(numero) {
        const vendas = getVendas();
        const venda = vendas.find(v => String(v.numero) === String(numero) || String(v.id) === String(numero));
        if (!venda) return;
        if (!confirm(`Faturar pedido ${numero}?\nCliente: ${venda.cliente?.razaoSocial}\nValor: ${fmtMoney(venda.totais?.totalNF)}`)) return;

        venda.status = 'faturado'; // Volta pro pool de Romaneio
        venda.nfe = 'NF-' + String(Date.now()).slice(-8);
        venda.chaveNFe = '352602' + Math.floor(Math.random() * 99999999999999).toString().padStart(14, '0') + '55001000' + venda.nfe.split('-')[1] + '19372911';
        venda.dataFaturamento = new Date().toISOString();
        localStorage.setItem(KEYS.vendas, JSON.stringify(vendas));

        // Atualizar estoque definitivamente & Enviar Chave pra Expedição WMS (Integration)
        if (window.onErpVendaFaturada) window.onErpVendaFaturada(venda);

        alert(`✅ Pedido ${numero} autorizado pela SEFAZ!\nNF-e Emitida: ${venda.nfe}\nChave transferida pro Expedidor do WMS.\n\nApto para emissão de Romaneio.`);
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
    // 6. CONSULTA PEDIDOS DE VENDA
    // ═════════════════════════════════════════════════════
    function renderConsultaPedidos() {
        const el = document.getElementById('view-consultaPedidos');
        if (!el) return;

        const vendas = getVendas();
        const totalValor = vendas.reduce((s, v) => s + (v.totais?.totalNF || v.valorTotal || 0), 0);

        const statusColors = {
            'aberto': '#f59e0b', 'Aprovado': '#3b82f6', 'Pendente WMS': '#3b82f6',
            'Em Separação': '#8b5cf6', 'conferido_wms': '#a855f7', 'venda': '#22c55e',
            'faturado': '#22c55e', 'despachado': '#06b6d4', 'orcamento': '#f59e0b',
            'cancelado': '#ef4444'
        };

        el.innerHTML = `
        <div class="view-header-bar">
            <h2><span class="material-icons-round">list_alt</span> Consulta Pedidos de Venda</h2>
            <span style="font-size:0.8rem;color:var(--text-secondary)">${vendas.length} pedido(s) · ${fmtMoney(totalValor)}</span>
        </div>
        <div style="display:flex;gap:0.5rem;margin-bottom:1rem;flex-wrap:wrap;">
            <input type="text" id="cpFilterText" placeholder="Buscar por nº, cliente, status..."
                   style="flex:1;min-width:200px;padding:0.5rem 0.75rem;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:0.85rem"
                   oninput="VendasAvancado.filterConsultaPedidos()">
            <select id="cpFilterStatus"
                    style="padding:0.5rem;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:0.85rem"
                    onchange="VendasAvancado.filterConsultaPedidos()">
                <option value="">Todos status</option>
                <option value="aberto">Aberto</option>
                <option value="orcamento">Orçamento</option>
                <option value="venda">Venda</option>
                <option value="Aprovado">Aprovado</option>
                <option value="faturado">Faturado</option>
                <option value="despachado">Despachado</option>
                <option value="cancelado">Cancelado</option>
            </select>
        </div>
        <div class="card" style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;" id="cpTable">
                <thead>
                    <tr style="border-bottom:2px solid var(--border-color);background:var(--bg-secondary);">
                        <th style="padding:0.6rem 0.5rem;font-size:0.72rem;color:var(--text-secondary);text-align:left">Pedido</th>
                        <th style="padding:0.6rem 0.5rem;font-size:0.72rem;color:var(--text-secondary);text-align:left">Data</th>
                        <th style="padding:0.6rem 0.5rem;font-size:0.72rem;color:var(--text-secondary);text-align:left">Cliente</th>
                        <th style="padding:0.6rem 0.5rem;font-size:0.72rem;color:var(--text-secondary);text-align:center">Origem</th>
                        <th style="padding:0.6rem 0.5rem;font-size:0.72rem;color:var(--text-secondary);text-align:center">Frete</th>
                        <th style="padding:0.6rem 0.5rem;font-size:0.72rem;color:var(--text-secondary);text-align:right">Itens</th>
                        <th style="padding:0.6rem 0.5rem;font-size:0.72rem;color:var(--text-secondary);text-align:right">Desc.</th>
                        <th style="padding:0.6rem 0.5rem;font-size:0.72rem;color:var(--text-secondary);text-align:right">IPI</th>
                        <th style="padding:0.6rem 0.5rem;font-size:0.72rem;color:var(--text-secondary);text-align:right">Total NF</th>
                        <th style="padding:0.6rem 0.5rem;font-size:0.72rem;color:var(--text-secondary);text-align:center">Status</th>
                    </tr>
                </thead>
                <tbody id="cpTableBody">
                    ${vendas.length === 0 ? '<tr><td colspan="10" style="text-align:center;padding:2rem;color:var(--text-secondary)">Nenhum pedido de venda registrado.</td></tr>' : ''}
                    ${vendas.map(v => {
            const clienteNome = v.cliente?.razaoSocial || v.cliente?.fantasia || v.clienteNome || '-';
            const origem = v.origemFV ? 'FV' : v.origemOrcamento ? 'ORC' : 'ERP';
            const origemColor = v.origemFV ? '#22c55e' : v.origemOrcamento ? '#f59e0b' : '#3b82f6';
            const frete = v.transporte?.tipoFrete || v.tipoFrete || '-';
            const freteColor = frete === 'CIF' ? '#22c55e' : frete === 'FOB' ? '#f59e0b' : 'var(--text-secondary)';
            const qtdItens = (v.itens || []).reduce((s, i) => s + (i.quantidade || i.qtd || 0), 0);
            const descTotal = (v.totais?.desconto || 0) + (v.totais?.descontoPedidoValor || 0);
            const totalIpi = v.totais?.valorIPI || 0;
            const totalNF = v.totais?.totalNF || v.valorTotal || 0;
            const status = (v.status || 'aberto');
            const sColor = statusColors[status] || 'var(--text-secondary)';
            return `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.03);" data-search="${(v.numero + ' ' + clienteNome + ' ' + status).toLowerCase()}">
                            <td style="padding:0.5rem;font-weight:700;font-size:0.8rem;">${v.numero || v.id}</td>
                            <td style="padding:0.5rem;font-size:0.8rem;">${fmtDate(v.data)}</td>
                            <td style="padding:0.5rem;font-size:0.8rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${clienteNome}">${clienteNome}</td>
                            <td style="text-align:center;padding:0.5rem;"><span style="font-size:0.65rem;font-weight:700;padding:2px 6px;border-radius:4px;background:${origemColor}22;color:${origemColor}">${origem}</span></td>
                            <td style="text-align:center;padding:0.5rem;"><span style="font-size:0.7rem;font-weight:600;color:${freteColor}">${frete}</span></td>
                            <td style="text-align:right;padding:0.5rem;font-size:0.8rem;">${qtdItens}</td>
                            <td style="text-align:right;padding:0.5rem;font-size:0.8rem;color:${descTotal > 0 ? '#22c55e' : 'var(--text-secondary)'}">${descTotal > 0 ? fmtMoney(descTotal) : '-'}</td>
                            <td style="text-align:right;padding:0.5rem;font-size:0.8rem;color:${totalIpi > 0 ? '#f59e0b' : 'var(--text-secondary)'}">${totalIpi > 0 ? fmtMoney(totalIpi) : '-'}</td>
                            <td style="text-align:right;padding:0.5rem;font-weight:700;font-size:0.85rem;">${fmtMoney(totalNF)}</td>
                            <td style="text-align:center;padding:0.5rem;"><span style="font-size:0.65rem;font-weight:700;padding:2px 8px;border-radius:4px;background:${sColor}22;color:${sColor}">${status.toUpperCase()}</span></td>
                        </tr>`;
        }).join('')}
                </tbody>
            </table>
        </div>`;
    }

    function filterConsultaPedidos() {
        const text = (document.getElementById('cpFilterText')?.value || '').toLowerCase();
        const status = (document.getElementById('cpFilterStatus')?.value || '').toLowerCase();
        const rows = document.querySelectorAll('#cpTableBody tr[data-search]');
        rows.forEach(row => {
            const search = row.dataset.search || '';
            const matchText = !text || search.includes(text);
            const matchStatus = !status || search.includes(status);
            row.style.display = matchText && matchStatus ? '' : 'none';
        });
    }

    // ═════════════════════════════════════════════════════
    // VIEW HOOKS
    // ═════════════════════════════════════════════════════
    const VIEW_MAP = {
        orcamento: renderOrcamento,
        faturamento: renderFaturamento,
        liberacaoCredito: renderLiberacaoCredito,
        romaneio: renderRomaneio,
        comissoes: renderComissoes,
        consultaPedidos: renderConsultaPedidos
    };

    window._viewHooks = window._viewHooks || [];
    window._viewHooks.push(viewId => {
        if (VIEW_MAP[viewId]) VIEW_MAP[viewId]();
    });

    console.log('🛍️ Módulo de Vendas Avançado inicializado (6 telas)');

    return {
        renderOrcamento, novoOrcamento, converterOrcamento,
        renderFaturamento, faturarPedido,
        renderLiberacaoCredito, liberarCredito,
        renderRomaneio,
        renderComissoes,
        renderConsultaPedidos, filterConsultaPedidos
    };
})();

// ── Expor no window (app.js é module e não enxerga const) ──
window.VendasAvancado = VendasAvancado;

// ── Auto-render: detecta clique no menu e chama render diretamente ──
document.addEventListener('click', function (e) {
    var link = e.target.closest('[onclick]');
    if (!link) return;
    var oc = link.getAttribute('onclick') || '';
    var m = oc.match(/switchView\(['"]([\w]+)['"]\)/);
    if (!m) return;
    var view = m[1];
    var fns = {
        orcamento: 'renderOrcamento',
        faturamento: 'renderFaturamento',
        liberacaoCredito: 'renderLiberacaoCredito',
        romaneio: 'renderRomaneio',
        comissoes: 'renderComissoes',
        consultaPedidos: 'renderConsultaPedidos'
    };
    if (fns[view] && window.VendasAvancado && typeof window.VendasAvancado[fns[view]] === 'function') {
        setTimeout(function () { window.VendasAvancado[fns[view]](); }, 50);
    }
});
