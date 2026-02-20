/* ═══════════════════════════════════════════════════════════
   Compras — Parreira ERP (Fase 2)
   Sugestão, Pedido, Cotação, Entrada NF/XML, Consulta
   ═══════════════════════════════════════════════════════════ */
'use strict';

const Compras = (() => {
    // ─── Storage Keys ────────────────────────────────────
    const KEYS = {
        pedidos: 'erp_pedidos_compra',
        cotacoes: 'erp_cotacoes',
        entradas: 'erp_entradas_nf'
    };

    // ─── Helpers ─────────────────────────────────────────
    const fmtMoney = v => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fmtDate = d => d ? new Date(d).toLocaleDateString('pt-BR') : '-';
    const getProducts = () => JSON.parse(localStorage.getItem('erp_products') || '[]');
    const getSuppliers = () => {
        const s = JSON.parse(localStorage.getItem('erp_suppliers') || 'null');
        if (s) return s;
        // Use inline suppliers from app.js
        return [
            { code: 451, name: 'LUBRIFICANTES DO BRASIL LTDA', fantasy: 'LUBRAX', cnpj: '33.000.167/0001-01', city: 'Rio de Janeiro/RJ', type: 'Revenda' },
            { code: 452, name: 'MICHELIN PNEUS S/A', fantasy: 'MICHELIN', cnpj: '00.000.000/0002-00', city: 'São Paulo/SP', type: 'Indústria' }
        ];
    };
    const getEstoque = () => JSON.parse(localStorage.getItem('erp_estoque') || '{}');

    // ═════════════════════════════════════════════════════
    // 1. SUGESTÃO DE COMPRA
    // ═════════════════════════════════════════════════════
    function renderSugestaoCompra() {
        const el = document.getElementById('view-sugestaoCompra');
        if (!el) return;

        const produtos = getProducts();
        const estoque = getEstoque();
        const vendas = JSON.parse(localStorage.getItem('erp_vendas') || '[]');

        // Calcular sugestão por produto
        const sugestoes = produtos.map(p => {
            const est = estoque[p.sku] || {};
            const estoqueAtual = est.estoqueAtual || est.disponivel || 0;
            // Simular giro — vendas dos últimos 30 dias
            const vendasProd = vendas.reduce((acc, v) => {
                (v.itens || []).forEach(i => { if (i.sku === p.sku) acc += (i.quantidade || i.qtd || 0); });
                return acc;
            }, 0);
            const giroDiario = vendasProd > 0 ? vendasProd / 30 : 0.5;
            const diasCobertura = giroDiario > 0 ? Math.round(estoqueAtual / giroDiario) : 999;
            const estoqueIdeal = Math.ceil(giroDiario * 45); // 45 dias de cobertura
            const sugestaoQtd = Math.max(0, estoqueIdeal - estoqueAtual);

            return {
                sku: p.sku,
                nome: p.nome,
                unidade: p.unidade || 'UN',
                grupo: p.grupo || '-',
                estoqueAtual,
                giroDiario: giroDiario.toFixed(1),
                diasCobertura,
                estoqueIdeal,
                sugestaoQtd,
                custo: p.custo || 0,
                valorTotal: sugestaoQtd * (p.custo || 0),
                alerta: diasCobertura < 15 ? 'critico' : diasCobertura < 30 ? 'atencao' : 'ok'
            };
        }).filter(s => s.sugestaoQtd > 0).sort((a, b) => a.diasCobertura - b.diasCobertura);

        const totalSugestao = sugestoes.reduce((s, i) => s + i.valorTotal, 0);

        el.innerHTML = `
        <div class="view-header-bar">
            <h2><span class="material-icons-round">auto_awesome</span> Sugestão de Compra</h2>
            <div style="display:flex;gap:0.5rem;">
                <button class="btn btn-secondary btn-sm" onclick="Compras.gerarPedidoDaSugestao()">
                    <span class="material-icons-round" style="font-size:1rem">send</span> Gerar Pedido
                </button>
            </div>
        </div>
        <div style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;">
            <div class="card" style="flex:1;min-width:200px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Itens em Ruptura</div>
                <div style="font-size:1.8rem;font-weight:700;color:var(--danger-color)">${sugestoes.filter(s => s.alerta === 'critico').length}</div>
            </div>
            <div class="card" style="flex:1;min-width:200px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Itens com Atenção</div>
                <div style="font-size:1.8rem;font-weight:700;color:#f59e0b">${sugestoes.filter(s => s.alerta === 'atencao').length}</div>
            </div>
            <div class="card" style="flex:1;min-width:200px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Total Sugestão</div>
                <div style="font-size:1.8rem;font-weight:700;color:var(--primary-color)">${fmtMoney(totalSugestao)}</div>
            </div>
        </div>
        <div class="card" style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="border-bottom:1px solid var(--border-color);">
                        <th style="text-align:left;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">SKU</th>
                        <th style="text-align:left;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Produto</th>
                        <th style="text-align:center;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">UN</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Estoque</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Giro/Dia</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Dias Cob.</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Ideal</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);font-weight:700;">Sugestão</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Custo UN</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Valor Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${sugestoes.map(s => `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                            <td style="padding:0.6rem 0.5rem;font-weight:600;font-size:0.85rem;">${s.sku}</td>
                            <td style="padding:0.6rem 0.5rem;font-size:0.85rem;">${s.nome}</td>
                            <td style="text-align:center;padding:0.6rem 0.5rem;font-size:0.8rem;">${s.unidade}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;">${s.estoqueAtual}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;">${s.giroDiario}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;">
                                <span class="status-badge ${s.alerta === 'critico' ? 'status-overdue' : s.alerta === 'atencao' ? 'status-pending' : 'status-shipped'}">${s.diasCobertura}d</span>
                            </td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;">${s.estoqueIdeal}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;font-weight:700;color:var(--primary-color)">${s.sugestaoQtd}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;">${fmtMoney(s.custo)}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;font-weight:600;">${fmtMoney(s.valorTotal)}</td>
                        </tr>
                    `).join('')}
                    ${sugestoes.length === 0 ? '<tr><td colspan="10" style="text-align:center;padding:2rem;color:var(--text-secondary)">Todos os produtos estão com estoque adequado.</td></tr>' : ''}
                </tbody>
            </table>
        </div>`;
    }

    // ═════════════════════════════════════════════════════
    // 2. PEDIDO DE COMPRA
    // ═════════════════════════════════════════════════════
    function renderPedidoCompra() {
        const el = document.getElementById('view-pedidoCompra');
        if (!el) return;

        const pedidos = JSON.parse(localStorage.getItem(KEYS.pedidos) || '[]');
        const fornecedores = getSuppliers();

        el.innerHTML = `
        <div class="view-header-bar">
            <h2><span class="material-icons-round">description</span> Pedidos de Compra</h2>
            <button class="btn btn-primary btn-sm" onclick="Compras.novoPedidoCompra()">
                <span class="material-icons-round" style="font-size:1rem">add</span> Novo Pedido
            </button>
        </div>
        <div class="card" style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="border-bottom:1px solid var(--border-color);">
                        <th style="text-align:left;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Nº</th>
                        <th style="text-align:left;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Data</th>
                        <th style="text-align:left;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Fornecedor</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Itens</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">valor Total</th>
                        <th style="text-align:center;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Status</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${pedidos.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-secondary)">Nenhum pedido de compra cadastrado.</td></tr>' : ''}
                    ${pedidos.map(p => {
            const statusMap = { aberto: 'status-pending', enviado: 'status-shipped', recebido: 'status-shipped', cancelado: 'status-overdue' };
            return `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                            <td style="padding:0.6rem 0.5rem;font-weight:700;">${p.numero}</td>
                            <td style="padding:0.6rem 0.5rem;">${fmtDate(p.data)}</td>
                            <td style="padding:0.6rem 0.5rem;">${p.fornecedorNome || '-'}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;">${(p.itens || []).length}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;font-weight:600;">${fmtMoney(p.valorTotal)}</td>
                            <td style="text-align:center;padding:0.6rem 0.5rem;">
                                <span class="status-badge ${statusMap[p.status] || 'status-pending'}">${(p.status || '').toUpperCase()}</span>
                            </td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;">
                                <button class="btn btn-secondary btn-sm" style="padding:0.3rem 0.5rem;" onclick="Compras.verPedidoCompra('${p.numero}')">
                                    <span class="material-icons-round" style="font-size:0.9rem">visibility</span>
                                </button>
                            </td>
                        </tr>`;
        }).join('')}
                </tbody>
            </table>
        </div>`;
    }

    function novoPedidoCompra() {
        const fornecedores = getSuppliers();
        const produtos = getProducts();
        const numero = 'PC-' + String(Date.now()).slice(-6);

        const pedido = {
            numero,
            data: new Date().toISOString().slice(0, 10),
            fornecedorCode: fornecedores[0]?.code || '',
            fornecedorNome: fornecedores[0]?.name || 'Selecione',
            itens: [],
            valorTotal: 0,
            status: 'aberto',
            obs: '',
            createdAt: new Date().toISOString()
        };

        // Pré-carregar sugestão
        const estoque = getEstoque();
        const vendas = JSON.parse(localStorage.getItem('erp_vendas') || '[]');
        produtos.forEach(p => {
            const est = estoque[p.sku] || {};
            const estoqueAtual = est.estoqueAtual || 0;
            const vendasProd = vendas.reduce((a, v) => { (v.itens || []).forEach(i => { if (i.sku === p.sku) a += (i.quantidade || i.qtd || 0); }); return a; }, 0);
            const giro = vendasProd > 0 ? vendasProd / 30 : 0.5;
            const ideal = Math.ceil(giro * 45);
            const sugestao = Math.max(0, ideal - estoqueAtual);
            if (sugestao > 0) {
                pedido.itens.push({
                    sku: p.sku,
                    nome: p.nome,
                    unidade: p.unidade || 'UN',
                    qtd: sugestao,
                    custo: p.custo || 0,
                    valorTotal: sugestao * (p.custo || 0)
                });
            }
        });
        pedido.valorTotal = pedido.itens.reduce((s, i) => s + i.valorTotal, 0);

        const pedidos = JSON.parse(localStorage.getItem(KEYS.pedidos) || '[]');
        pedidos.unshift(pedido);
        localStorage.setItem(KEYS.pedidos, JSON.stringify(pedidos));

        alert(`Pedido ${numero} criado com ${pedido.itens.length} itens (sugestão pré-carregada).\nTotal: ${fmtMoney(pedido.valorTotal)}`);
        renderPedidoCompra();
    }

    function verPedidoCompra(numero) {
        const pedidos = JSON.parse(localStorage.getItem(KEYS.pedidos) || '[]');
        const p = pedidos.find(x => x.numero === numero);
        if (!p) return;
        const detalhes = (p.itens || []).map(i => `  ${i.sku} | ${i.nome} | Qtd: ${i.qtd} | ${fmtMoney(i.valorTotal)}`).join('\n');
        alert(`PEDIDO DE COMPRA ${p.numero}\nData: ${fmtDate(p.data)}\nFornecedor: ${p.fornecedorNome}\nStatus: ${p.status}\n\nITENS:\n${detalhes}\n\nTOTAL: ${fmtMoney(p.valorTotal)}`);
    }

    function gerarPedidoDaSugestao() {
        novoPedidoCompra();
    }

    // ═════════════════════════════════════════════════════
    // 3. COTAÇÃO
    // ═════════════════════════════════════════════════════
    function renderCotacao() {
        const el = document.getElementById('view-cotacao');
        if (!el) return;

        const cotacoes = JSON.parse(localStorage.getItem(KEYS.cotacoes) || '[]');
        const fornecedores = getSuppliers();

        el.innerHTML = `
        <div class="view-header-bar">
            <h2><span class="material-icons-round">compare_arrows</span> Cotação de Compra</h2>
            <button class="btn btn-primary btn-sm" onclick="Compras.novaCotacao()">
                <span class="material-icons-round" style="font-size:1rem">add</span> Nova Cotação
            </button>
        </div>
        <div class="card" style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="border-bottom:1px solid var(--border-color);">
                        <th style="text-align:left;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Nº</th>
                        <th style="text-align:left;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Data</th>
                        <th style="text-align:left;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Produto</th>
                        <th style="text-align:left;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Fornecedores</th>
                        <th style="text-align:center;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Menor Preço</th>
                        <th style="text-align:center;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${cotacoes.length === 0 ? `
                        <tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-secondary)">
                            Nenhuma cotação registrada.<br>
                            <span style="font-size:0.8rem">Clique em "Nova Cotação" para comparar preços entre fornecedores.</span>
                        </td></tr>` : ''}
                    ${cotacoes.map(c => `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                            <td style="padding:0.6rem 0.5rem;font-weight:700;">${c.numero}</td>
                            <td style="padding:0.6rem 0.5rem;">${fmtDate(c.data)}</td>
                            <td style="padding:0.6rem 0.5rem;">${c.produto || '-'}</td>
                            <td style="padding:0.6rem 0.5rem;">${(c.propostas || []).length} fornecedor(es)</td>
                            <td style="text-align:center;padding:0.6rem 0.5rem;font-weight:700;color:var(--success-color)">${fmtMoney(c.menorPreco)}</td>
                            <td style="text-align:center;padding:0.6rem 0.5rem;">
                                <span class="status-badge ${c.status === 'fechada' ? 'status-shipped' : 'status-pending'}">${(c.status || 'aberta').toUpperCase()}</span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
    }

    function novaCotacao() {
        const produtos = getProducts();
        const fornecedores = getSuppliers();
        if (produtos.length === 0) { alert('Cadastre produtos primeiro.'); return; }

        const prod = produtos[Math.floor(Math.random() * produtos.length)];
        const propostas = fornecedores.map(f => ({
            fornecedorCode: f.code,
            fornecedorNome: f.name || f.fantasy,
            preco: parseFloat((prod.custo || prod.preco || 50) * (0.85 + Math.random() * 0.3)).toFixed(2),
            prazo: Math.floor(Math.random() * 15) + 7 + ' dias',
            frete: Math.random() > 0.5 ? 'CIF' : 'FOB'
        }));

        const cotacao = {
            numero: 'COT-' + String(Date.now()).slice(-6),
            data: new Date().toISOString().slice(0, 10),
            produto: `${prod.sku} - ${prod.nome}`,
            propostas,
            menorPreco: Math.min(...propostas.map(p => parseFloat(p.preco))),
            status: 'aberta',
            createdAt: new Date().toISOString()
        };

        const cotacoes = JSON.parse(localStorage.getItem(KEYS.cotacoes) || '[]');
        cotacoes.unshift(cotacao);
        localStorage.setItem(KEYS.cotacoes, JSON.stringify(cotacoes));

        const comparativo = propostas.map(p => `  ${p.fornecedorNome}: ${fmtMoney(p.preco)} | Prazo: ${p.prazo} | ${p.frete}`).join('\n');
        alert(`COTAÇÃO ${cotacao.numero}\nProduto: ${cotacao.produto}\n\nPROPOSTAS:\n${comparativo}\n\n⭐ Menor preço: ${fmtMoney(cotacao.menorPreco)}`);
        renderCotacao();
    }

    // ═════════════════════════════════════════════════════
    // 4. ENTRADA NF / XML
    // ═════════════════════════════════════════════════════
    function renderEntradaNf() {
        const el = document.getElementById('view-entradaNf');
        if (!el) return;

        const entradas = JSON.parse(localStorage.getItem(KEYS.entradas) || '[]');

        el.innerHTML = `
        <div class="view-header-bar">
            <h2><span class="material-icons-round">move_to_inbox</span> Entrada de NF / XML</h2>
            <div style="display:flex;gap:0.5rem;">
                <button class="btn btn-primary btn-sm" onclick="Compras.novaEntradaManual()">
                    <span class="material-icons-round" style="font-size:1rem">add</span> Entrada Manual
                </button>
                <button class="btn btn-secondary btn-sm" onclick="Compras.importarXml()">
                    <span class="material-icons-round" style="font-size:1rem">upload_file</span> Importar XML
                </button>
            </div>
        </div>
        <div class="card" style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="border-bottom:1px solid var(--border-color);">
                        <th style="text-align:left;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Nº NF</th>
                        <th style="text-align:left;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Data</th>
                        <th style="text-align:left;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Fornecedor</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Itens</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Valor NF</th>
                        <th style="text-align:center;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Conferência</th>
                        <th style="text-align:center;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${entradas.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-secondary)">Nenhuma entrada registrada.</td></tr>' : ''}
                    ${entradas.map(e => `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                            <td style="padding:0.6rem 0.5rem;font-weight:700;">${e.nfNumero}</td>
                            <td style="padding:0.6rem 0.5rem;">${fmtDate(e.data)}</td>
                            <td style="padding:0.6rem 0.5rem;">${e.fornecedorNome || '-'}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;">${(e.itens || []).length}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;font-weight:600;">${fmtMoney(e.valorNF)}</td>
                            <td style="text-align:center;padding:0.6rem 0.5rem;">
                                <span class="status-badge ${e.conferido ? 'status-shipped' : 'status-pending'}">${e.conferido ? 'CONFERIDO' : 'PENDENTE'}</span>
                            </td>
                            <td style="text-align:center;padding:0.6rem 0.5rem;">
                                <span class="status-badge status-shipped">${(e.status || 'lançado').toUpperCase()}</span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
    }

    function novaEntradaManual() {
        const fornecedores = getSuppliers();
        const produtos = getProducts();
        const forn = fornecedores[Math.floor(Math.random() * fornecedores.length)];

        // Simular entrada com 2-4 itens aleatórios
        const numItens = 2 + Math.floor(Math.random() * 3);
        const itens = [];
        const usados = new Set();
        for (let i = 0; i < numItens && i < produtos.length; i++) {
            let idx;
            do { idx = Math.floor(Math.random() * produtos.length); } while (usados.has(idx) && usados.size < produtos.length);
            usados.add(idx);
            const p = produtos[idx];
            const qtd = 5 + Math.floor(Math.random() * 50);
            const custo = p.custo || p.preco * 0.7 || 10;
            itens.push({ sku: p.sku, nome: p.nome, qtd, custo, valorTotal: qtd * custo });
        }

        const entrada = {
            nfNumero: String(1000 + Math.floor(Math.random() * 9000)),
            data: new Date().toISOString().slice(0, 10),
            fornecedorCode: forn.code,
            fornecedorNome: forn.name || forn.fantasy,
            itens,
            valorNF: itens.reduce((s, i) => s + i.valorTotal, 0),
            conferido: false,
            status: 'lançado',
            createdAt: new Date().toISOString()
        };

        const entradas = JSON.parse(localStorage.getItem(KEYS.entradas) || '[]');
        entradas.unshift(entrada);
        localStorage.setItem(KEYS.entradas, JSON.stringify(entradas));

        // Atualizar estoque ERP via integração
        if (window.onWmsRecebimento) {
            window.onWmsRecebimento({
                nf: entrada.nfNumero,
                fornecedor: entrada.fornecedorNome,
                itens: itens.map(i => ({ sku: i.sku, descricao: i.nome, quantidade: i.qtd, valorUnitario: i.custo }))
            });
        }

        alert(`NF ${entrada.nfNumero} lançada!\nFornecedor: ${entrada.fornecedorNome}\nItens: ${itens.length}\nValor: ${fmtMoney(entrada.valorNF)}\n\n✅ Estoque atualizado automaticamente.`);
        renderEntradaNf();
    }

    function importarXml() {
        alert('📄 Importação XML\n\nEm produção, aqui o sistema leria um arquivo XML de NF-e e preencheria automaticamente:\n- Dados do fornecedor\n- Itens com quantidade, preço, CFOP, NCM\n- Impostos (ICMS, IPI, PIS, COFINS)\n\nPor enquanto, use "Entrada Manual" para simular.');
    }

    // ═════════════════════════════════════════════════════
    // 5. CONSULTA DE ENTRADAS
    // ═════════════════════════════════════════════════════
    function renderConsultaEntradas() {
        const el = document.getElementById('view-consultaEntradas');
        if (!el) return;

        const entradas = JSON.parse(localStorage.getItem(KEYS.entradas) || '[]');
        const pedidos = JSON.parse(localStorage.getItem(KEYS.pedidos) || '[]');

        const totalEntradas = entradas.reduce((s, e) => s + (e.valorNF || 0), 0);
        const totalPedidos = pedidos.reduce((s, p) => s + (p.valorTotal || 0), 0);
        const pendentes = entradas.filter(e => !e.conferido).length;

        el.innerHTML = `
        <div class="view-header-bar">
            <h2><span class="material-icons-round">search</span> Consulta de Entradas</h2>
        </div>
        <div style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;">
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">NFs Lançadas</div>
                <div style="font-size:1.8rem;font-weight:700;color:var(--primary-color)">${entradas.length}</div>
            </div>
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Total Entradas</div>
                <div style="font-size:1.5rem;font-weight:700;">${fmtMoney(totalEntradas)}</div>
            </div>
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Pedidos Compra</div>
                <div style="font-size:1.5rem;font-weight:700;">${pedidos.length}</div>
            </div>
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Conf. Pendente</div>
                <div style="font-size:1.8rem;font-weight:700;color:${pendentes > 0 ? '#f59e0b' : 'var(--success-color)'}">${pendentes}</div>
            </div>
        </div>
        <div class="card" style="overflow-x:auto;">
            <div style="padding:0.75rem 1rem;border-bottom:1px solid var(--border-color);display:flex;align-items:center;gap:0.5rem;">
                <span class="material-icons-round" style="color:var(--text-secondary);font-size:1.2rem;">filter_list</span>
                <input type="text" placeholder="Buscar por NF, fornecedor..." oninput="Compras.filtrarEntradas(this.value)"
                    style="flex:1;background:var(--surface-darker);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:0.5rem 0.75rem;color:var(--text-primary);font-size:0.85rem;" />
            </div>
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="border-bottom:1px solid var(--border-color);">
                        <th style="text-align:left;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">NF</th>
                        <th style="text-align:left;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Data</th>
                        <th style="text-align:left;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Fornecedor</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Valor</th>
                        <th style="text-align:center;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Conferência</th>
                    </tr>
                </thead>
                <tbody id="consultaEntradasBody">
                    ${renderEntradasRows(entradas)}
                </tbody>
            </table>
        </div>`;
    }

    function renderEntradasRows(entradas) {
        if (entradas.length === 0) return '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-secondary)">Nenhuma entrada encontrada.</td></tr>';
        return entradas.map(e => `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                <td style="padding:0.6rem 0.5rem;font-weight:700;">${e.nfNumero}</td>
                <td style="padding:0.6rem 0.5rem;">${fmtDate(e.data)}</td>
                <td style="padding:0.6rem 0.5rem;">${e.fornecedorNome || '-'}</td>
                <td style="text-align:right;padding:0.6rem 0.5rem;font-weight:600;">${fmtMoney(e.valorNF)}</td>
                <td style="text-align:center;padding:0.6rem 0.5rem;">
                    <span class="status-badge ${e.conferido ? 'status-shipped' : 'status-pending'}">${e.conferido ? 'OK' : 'PENDENTE'}</span>
                </td>
            </tr>
        `).join('');
    }

    function filtrarEntradas(query) {
        const entradas = JSON.parse(localStorage.getItem(KEYS.entradas) || '[]');
        const q = (query || '').toLowerCase();
        const filtrado = q ? entradas.filter(e =>
            (e.nfNumero || '').includes(q) ||
            (e.fornecedorNome || '').toLowerCase().includes(q)
        ) : entradas;
        const tbody = document.getElementById('consultaEntradasBody');
        if (tbody) tbody.innerHTML = renderEntradasRows(filtrado);
    }

    // ═════════════════════════════════════════════════════
    // VIEW HOOKS
    // ═════════════════════════════════════════════════════
    const VIEW_MAP = {
        sugestaoCompra: renderSugestaoCompra,
        pedidoCompra: renderPedidoCompra,
        cotacao: renderCotacao,
        entradaNf: renderEntradaNf,
        consultaEntradas: renderConsultaEntradas
    };

    window._viewHooks = window._viewHooks || [];
    window._viewHooks.push(viewId => {
        if (VIEW_MAP[viewId]) VIEW_MAP[viewId]();
    });

    console.log('🛒 Módulo de Compras inicializado (5 telas)');

    return {
        renderSugestaoCompra,
        renderPedidoCompra,
        renderCotacao,
        renderEntradaNf,
        renderConsultaEntradas,
        novoPedidoCompra,
        verPedidoCompra,
        gerarPedidoDaSugestao,
        novaCotacao,
        novaEntradaManual,
        importarXml,
        filtrarEntradas
    };
})();
