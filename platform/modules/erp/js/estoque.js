/* ═══════════════════════════════════════════════════════════
   Estoque — Parreira ERP (Fase 3)
   Posição, Ajuste, Transferência, Inventário, Giro/Cobertura
   ═══════════════════════════════════════════════════════════ */
'use strict';

const Estoque = (() => {
    // ─── Storage Keys ────────────────────────────────────
    const KEYS = {
        estoque: 'erp_estoque',
        movimentacoes: 'erp_mov_estoque',
        inventarios: 'erp_inventarios'
    };

    const fmtMoney = v => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fmtDate = d => d ? new Date(d).toLocaleDateString('pt-BR') : '-';
    const getProducts = () => JSON.parse(localStorage.getItem('erp_products') || '[]');
    const getEstoque = () => JSON.parse(localStorage.getItem(KEYS.estoque) || '{}');
    const saveEstoque = (est) => localStorage.setItem(KEYS.estoque, JSON.stringify(est));

    // ═════════════════════════════════════════════════════
    // 1. POSIÇÃO DE ESTOQUE
    // ═════════════════════════════════════════════════════
    function renderPosicaoEstoque() {
        const el = document.getElementById('view-posicaoEstoque');
        if (!el) return;

        const produtos = getProducts();
        const estoque = getEstoque();

        const posicao = produtos.map(p => {
            const e = estoque[p.sku] || {};
            return {
                sku: p.sku,
                nome: p.nome,
                unidade: p.unidade || 'UN',
                grupo: p.grupo || '-',
                estoqueAtual: e.estoqueAtual || 0,
                reservado: e.reservado || 0,
                disponivel: e.disponivel || e.estoqueAtual || 0,
                custoMedio: e.custoMedio || p.custo || 0,
                valorEstoque: (e.estoqueAtual || 0) * (e.custoMedio || p.custo || 0)
            };
        });

        const totalItens = posicao.reduce((s, p) => s + p.estoqueAtual, 0);
        const totalValor = posicao.reduce((s, p) => s + p.valorEstoque, 0);
        const semEstoque = posicao.filter(p => p.estoqueAtual <= 0).length;

        el.innerHTML = `
        <div class="view-header-bar">
            <h2><span class="material-icons-round">assessment</span> Posição de Estoque</h2>
            <div style="display:flex;gap:0.5rem;">
                <input type="text" id="estoqueFiltro" placeholder="Buscar SKU ou produto..."
                    oninput="Estoque.filtrarPosicao(this.value)"
                    style="background:var(--surface-darker);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:0.5rem 0.75rem;color:var(--text-primary);font-size:0.85rem;width:220px;" />
            </div>
        </div>
        <div style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;">
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">SKUs Cadastrados</div>
                <div style="font-size:1.8rem;font-weight:700;color:var(--primary-color)">${produtos.length}</div>
            </div>
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Unidades em Estoque</div>
                <div style="font-size:1.8rem;font-weight:700;">${totalItens.toLocaleString('pt-BR')}</div>
            </div>
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Valor do Estoque</div>
                <div style="font-size:1.5rem;font-weight:700;">${fmtMoney(totalValor)}</div>
            </div>
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Sem Estoque</div>
                <div style="font-size:1.8rem;font-weight:700;color:${semEstoque > 0 ? 'var(--danger-color)' : 'var(--success-color)'}">${semEstoque}</div>
            </div>
        </div>
        <div class="card" style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="border-bottom:1px solid var(--border-color);">
                        <th style="text-align:left;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">SKU</th>
                        <th style="text-align:left;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Produto</th>
                        <th style="text-align:center;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">UN</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Atual</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Reservado</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);font-weight:700;">Disponível</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Custo Médio</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Valor Total</th>
                    </tr>
                </thead>
                <tbody id="posicaoEstoqueBody">
                    ${renderPosicaoRows(posicao)}
                </tbody>
            </table>
        </div>`;
    }

    function renderPosicaoRows(data) {
        if (data.length === 0) return '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-secondary)">Nenhum produto encontrado.</td></tr>';
        return data.map(p => `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.03);${p.estoqueAtual <= 0 ? 'opacity:0.5;' : ''}">
                <td style="padding:0.6rem 0.5rem;font-weight:600;font-size:0.85rem;">${p.sku}</td>
                <td style="padding:0.6rem 0.5rem;font-size:0.85rem;">${p.nome}</td>
                <td style="text-align:center;padding:0.6rem 0.5rem;font-size:0.8rem;">${p.unidade}</td>
                <td style="text-align:right;padding:0.6rem 0.5rem;">${p.estoqueAtual}</td>
                <td style="text-align:right;padding:0.6rem 0.5rem;color:#f59e0b;">${p.reservado}</td>
                <td style="text-align:right;padding:0.6rem 0.5rem;font-weight:700;color:var(--primary-color);">${p.disponivel}</td>
                <td style="text-align:right;padding:0.6rem 0.5rem;">${fmtMoney(p.custoMedio)}</td>
                <td style="text-align:right;padding:0.6rem 0.5rem;font-weight:600;">${fmtMoney(p.valorEstoque)}</td>
            </tr>
        `).join('');
    }

    function filtrarPosicao(query) {
        const produtos = getProducts();
        const estoque = getEstoque();
        const q = (query || '').toLowerCase();
        const posicao = produtos.filter(p =>
            p.sku.toLowerCase().includes(q) || (p.nome || '').toLowerCase().includes(q)
        ).map(p => {
            const e = estoque[p.sku] || {};
            return {
                sku: p.sku, nome: p.nome, unidade: p.unidade || 'UN',
                estoqueAtual: e.estoqueAtual || 0, reservado: e.reservado || 0,
                disponivel: e.disponivel || e.estoqueAtual || 0,
                custoMedio: e.custoMedio || p.custo || 0,
                valorEstoque: (e.estoqueAtual || 0) * (e.custoMedio || p.custo || 0)
            };
        });
        const tbody = document.getElementById('posicaoEstoqueBody');
        if (tbody) tbody.innerHTML = renderPosicaoRows(posicao);
    }

    // ═════════════════════════════════════════════════════
    // 2. AJUSTE DE ESTOQUE
    // ═════════════════════════════════════════════════════
    function renderAjusteEstoque() {
        const el = document.getElementById('view-ajusteEstoque');
        if (!el) return;

        const movs = JSON.parse(localStorage.getItem(KEYS.movimentacoes) || '[]');
        const produtos = getProducts();

        el.innerHTML = `
        <div class="view-header-bar">
            <h2><span class="material-icons-round">tune</span> Ajuste de Estoque</h2>
        </div>
        <div style="display:flex;gap:1.5rem;flex-wrap:wrap;">
            <div class="card" style="flex:1;min-width:320px;padding:1.5rem;">
                <h3 style="margin-bottom:1rem;font-size:0.95rem;color:var(--text-primary)">
                    <span class="material-icons-round" style="font-size:1.1rem;vertical-align:middle;">add_circle</span> Novo Ajuste
                </h3>
                <div style="display:grid;gap:0.75rem;">
                    <div>
                        <label style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;">Produto (SKU)</label>
                        <select id="ajusteSku" style="width:100%;background:var(--surface-darker);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:0.5rem;color:var(--text-primary);">
                            ${produtos.map(p => `<option value="${p.sku}">${p.sku} - ${p.nome}</option>`).join('')}
                        </select>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;">
                        <div>
                            <label style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;">Tipo</label>
                            <select id="ajusteTipo" style="width:100%;background:var(--surface-darker);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:0.5rem;color:var(--text-primary);">
                                <option value="entrada">Entrada</option>
                                <option value="saida">Saída</option>
                                <option value="perda">Perda</option>
                                <option value="bonificacao">Bonificação</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;">Quantidade</label>
                            <input type="number" id="ajusteQtd" min="1" value="1" style="width:100%;background:var(--surface-darker);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:0.5rem;color:var(--text-primary);" />
                        </div>
                    </div>
                    <div>
                        <label style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;">Motivo</label>
                        <input type="text" id="ajusteMotivo" placeholder="Ex: Inventário, avaria, bonificação..."
                            style="width:100%;background:var(--surface-darker);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:0.5rem;color:var(--text-primary);" />
                    </div>
                    <button class="btn btn-primary" onclick="Estoque.salvarAjuste()" style="margin-top:0.5rem;">
                        <span class="material-icons-round" style="font-size:1rem;">save</span> Salvar Ajuste
                    </button>
                </div>
            </div>
            <div class="card" style="flex:1.5;min-width:350px;overflow-x:auto;padding:0;">
                <div style="padding:0.75rem 1rem;border-bottom:1px solid var(--border-color);font-weight:600;font-size:0.9rem;">
                    Últimas Movimentações
                </div>
                <table style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr style="border-bottom:1px solid var(--border-color);">
                            <th style="text-align:left;padding:0.6rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Data</th>
                            <th style="text-align:left;padding:0.6rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">SKU</th>
                            <th style="text-align:center;padding:0.6rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Tipo</th>
                            <th style="text-align:right;padding:0.6rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Qtd</th>
                            <th style="text-align:left;padding:0.6rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Motivo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${movs.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:1.5rem;color:var(--text-secondary);font-size:0.85rem;">Nenhuma movimentação.</td></tr>' : ''}
                        ${movs.slice(0, 15).map(m => {
            const corTipo = m.tipo === 'entrada' ? 'var(--success-color)' : m.tipo === 'saida' ? 'var(--danger-color)' : '#f59e0b';
            return `
                            <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                                <td style="padding:0.5rem;font-size:0.8rem;">${fmtDate(m.data)}</td>
                                <td style="padding:0.5rem;font-weight:600;font-size:0.85rem;">${m.sku}</td>
                                <td style="text-align:center;padding:0.5rem;">
                                    <span style="color:${corTipo};font-weight:600;font-size:0.8rem;text-transform:uppercase;">${m.tipo}</span>
                                </td>
                                <td style="text-align:right;padding:0.5rem;font-weight:700;color:${corTipo};">${m.tipo === 'saida' || m.tipo === 'perda' ? '-' : '+'}${m.qtd}</td>
                                <td style="padding:0.5rem;font-size:0.8rem;color:var(--text-secondary);">${m.motivo || '-'}</td>
                            </tr>`;
        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
    }

    function salvarAjuste() {
        const sku = document.getElementById('ajusteSku')?.value;
        const tipo = document.getElementById('ajusteTipo')?.value;
        const qtd = parseInt(document.getElementById('ajusteQtd')?.value) || 0;
        const motivo = document.getElementById('ajusteMotivo')?.value || '';

        if (!sku || qtd <= 0) { alert('Selecione um produto e informe a quantidade.'); return; }

        const estoque = getEstoque();
        if (!estoque[sku]) {
            estoque[sku] = { sku, descricao: '', estoqueAtual: 0, reservado: 0, disponivel: 0, custoMedio: 0 };
        }

        if (tipo === 'entrada') {
            estoque[sku].estoqueAtual += qtd;
        } else {
            estoque[sku].estoqueAtual = Math.max(0, estoque[sku].estoqueAtual - qtd);
        }
        estoque[sku].disponivel = estoque[sku].estoqueAtual - (estoque[sku].reservado || 0);
        saveEstoque(estoque);

        // Registrar movimentação
        const movs = JSON.parse(localStorage.getItem(KEYS.movimentacoes) || '[]');
        movs.unshift({
            data: new Date().toISOString(),
            sku, tipo, qtd, motivo,
            saldoAntes: tipo === 'entrada' ? estoque[sku].estoqueAtual - qtd : estoque[sku].estoqueAtual + qtd,
            saldoDepois: estoque[sku].estoqueAtual
        });
        localStorage.setItem(KEYS.movimentacoes, JSON.stringify(movs));

        window.dispatchEvent(new CustomEvent('estoque-atualizado', { detail: { origem: 'ajuste-manual', sku } }));

        alert(`✅ Ajuste salvo: ${tipo.toUpperCase()} de ${qtd} un. para ${sku}\nNovo saldo: ${estoque[sku].estoqueAtual}`);
        renderAjusteEstoque();
    }

    // ═════════════════════════════════════════════════════
    // 3. TRANSFERÊNCIA
    // ═════════════════════════════════════════════════════
    function renderTransferenciaEstoque() {
        const el = document.getElementById('view-transferenciaEstoque');
        if (!el) return;

        const produtos = getProducts();

        el.innerHTML = `
        <div class="view-header-bar">
            <h2><span class="material-icons-round">swap_horiz</span> Transferência de Estoque</h2>
        </div>
        <div class="card" style="max-width:600px;padding:1.5rem;">
            <h3 style="margin-bottom:1rem;font-size:0.95rem;">Nova Transferência</h3>
            <div style="display:grid;gap:0.75rem;">
                <div>
                    <label style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;">Produto</label>
                    <select id="transfSku" style="width:100%;background:var(--surface-darker);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:0.5rem;color:var(--text-primary);">
                        ${produtos.map(p => `<option value="${p.sku}">${p.sku} - ${p.nome}</option>`).join('')}
                    </select>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;">
                    <div>
                        <label style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;">Origem</label>
                        <select id="transfOrigem" style="width:100%;background:var(--surface-darker);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:0.5rem;color:var(--text-primary);">
                            <option value="DEPOSITO-PRINCIPAL">Depósito Principal</option>
                            <option value="DEPOSITO-02">Depósito 02</option>
                            <option value="LOJA">Loja / Showroom</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;">Destino</label>
                        <select id="transfDestino" style="width:100%;background:var(--surface-darker);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:0.5rem;color:var(--text-primary);">
                            <option value="DEPOSITO-02">Depósito 02</option>
                            <option value="DEPOSITO-PRINCIPAL">Depósito Principal</option>
                            <option value="LOJA">Loja / Showroom</option>
                        </select>
                    </div>
                </div>
                <div>
                    <label style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;">Quantidade</label>
                    <input type="number" id="transfQtd" min="1" value="1" style="width:100%;background:var(--surface-darker);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:0.5rem;color:var(--text-primary);" />
                </div>
                <button class="btn btn-primary" onclick="Estoque.executarTransferencia()">
                    <span class="material-icons-round" style="font-size:1rem;">swap_horiz</span> Transferir
                </button>
            </div>
        </div>`;
    }

    function executarTransferencia() {
        const sku = document.getElementById('transfSku')?.value;
        const origem = document.getElementById('transfOrigem')?.value;
        const destino = document.getElementById('transfDestino')?.value;
        const qtd = parseInt(document.getElementById('transfQtd')?.value) || 0;

        if (origem === destino) { alert('Origem e destino devem ser diferentes.'); return; }
        if (qtd <= 0) { alert('Informe a quantidade.'); return; }

        // Registrar movimentação
        const movs = JSON.parse(localStorage.getItem(KEYS.movimentacoes) || '[]');
        movs.unshift({
            data: new Date().toISOString(),
            sku, tipo: 'transferencia', qtd,
            motivo: `${origem} → ${destino}`
        });
        localStorage.setItem(KEYS.movimentacoes, JSON.stringify(movs));

        alert(`✅ Transferência realizada!\n${sku}: ${qtd} un.\n${origem} → ${destino}`);
    }

    // ═════════════════════════════════════════════════════
    // 4. INVENTÁRIO
    // ═════════════════════════════════════════════════════
    function renderInventario() {
        const el = document.getElementById('view-inventario');
        if (!el) return;

        const produtos = getProducts();
        const estoque = getEstoque();
        const inventarios = JSON.parse(localStorage.getItem(KEYS.inventarios) || '[]');

        el.innerHTML = `
        <div class="view-header-bar">
            <h2><span class="material-icons-round">fact_check</span> Inventário</h2>
            <button class="btn btn-primary btn-sm" onclick="Estoque.novoInventario()">
                <span class="material-icons-round" style="font-size:1rem">add</span> Novo Inventário
            </button>
        </div>
        <div class="card" style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="border-bottom:1px solid var(--border-color);">
                        <th style="text-align:left;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Nº</th>
                        <th style="text-align:left;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Data</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">SKUs Contados</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Divergências</th>
                        <th style="text-align:center;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${inventarios.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-secondary)">Nenhum inventário realizado.<br><span style="font-size:0.8rem">Clique em "Novo Inventário" para iniciar contagem.</span></td></tr>' : ''}
                    ${inventarios.map(inv => `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                            <td style="padding:0.6rem 0.5rem;font-weight:700;">${inv.numero}</td>
                            <td style="padding:0.6rem 0.5rem;">${fmtDate(inv.data)}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;">${inv.skusContados}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;font-weight:700;color:${inv.divergencias > 0 ? 'var(--danger-color)' : 'var(--success-color)'};">${inv.divergencias}</td>
                            <td style="text-align:center;padding:0.6rem 0.5rem;">
                                <span class="status-badge ${inv.status === 'concluido' ? 'status-shipped' : 'status-pending'}">${(inv.status || '').toUpperCase()}</span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
    }

    function novoInventario() {
        const produtos = getProducts();
        const estoque = getEstoque();

        // Simular contagem — gera divergências aleatórias
        let divergencias = 0;
        const itens = produtos.map(p => {
            const e = estoque[p.sku] || {};
            const sistema = e.estoqueAtual || 0;
            const hasDiverg = Math.random() < 0.2; // 20% chance de divergência
            const contagem = hasDiverg ? Math.max(0, sistema + Math.floor(Math.random() * 10 - 5)) : sistema;
            if (contagem !== sistema) divergencias++;
            return { sku: p.sku, nome: p.nome, sistema, contagem, diferenca: contagem - sistema };
        });

        const inventario = {
            numero: 'INV-' + String(Date.now()).slice(-6),
            data: new Date().toISOString(),
            skusContados: produtos.length,
            divergencias,
            itens,
            status: 'concluido'
        };

        // Acertar estoque com contagem
        const estoqueAtual = getEstoque();
        itens.forEach(i => {
            if (i.diferenca !== 0 && estoqueAtual[i.sku]) {
                estoqueAtual[i.sku].estoqueAtual = i.contagem;
                estoqueAtual[i.sku].disponivel = i.contagem - (estoqueAtual[i.sku].reservado || 0);
            }
        });
        saveEstoque(estoqueAtual);

        const inventarios = JSON.parse(localStorage.getItem(KEYS.inventarios) || '[]');
        inventarios.unshift(inventario);
        localStorage.setItem(KEYS.inventarios, JSON.stringify(inventarios));

        const divMsg = itens.filter(i => i.diferenca !== 0).map(i => `  ${i.sku}: Sistema=${i.sistema} Contagem=${i.contagem} (${i.diferenca > 0 ? '+' : ''}${i.diferenca})`).join('\n');
        alert(`INVENTÁRIO ${inventario.numero}\nSKUs contados: ${produtos.length}\nDivergências: ${divergencias}\n\n${divMsg ? 'DIVERGÊNCIAS:\n' + divMsg : 'Nenhuma divergência encontrada.'}\n\n✅ Estoque ajustado automaticamente.`);
        renderInventario();
    }

    // ═════════════════════════════════════════════════════
    // 5. GIRO / COBERTURA
    // ═════════════════════════════════════════════════════
    function renderGiroEstoque() {
        const el = document.getElementById('view-giroEstoque');
        if (!el) return;

        const produtos = getProducts();
        const estoque = getEstoque();
        const vendas = JSON.parse(localStorage.getItem('erp_vendas') || '[]');

        const analise = produtos.map(p => {
            const e = estoque[p.sku] || {};
            const estoqueAtual = e.estoqueAtual || 0;
            const vendasQtd = vendas.reduce((acc, v) => {
                (v.itens || []).forEach(i => { if (i.sku === p.sku) acc += (i.quantidade || i.qtd || 0); });
                return acc;
            }, 0);
            const giroDiario = vendasQtd > 0 ? vendasQtd / 30 : 0;
            const diasCobertura = giroDiario > 0 ? Math.round(estoqueAtual / giroDiario) : estoqueAtual > 0 ? 999 : 0;
            const giroMensal = giroDiario * 30;
            const estoqueIdeal = Math.ceil(giroDiario * 45);
            const classificacao = giroDiario > 2 ? 'A' : giroDiario > 0.5 ? 'B' : 'C';

            return {
                sku: p.sku,
                nome: p.nome,
                estoqueAtual,
                giroDiario: giroDiario.toFixed(1),
                giroMensal: Math.round(giroMensal),
                diasCobertura,
                estoqueIdeal,
                classificacao,
                situacao: diasCobertura === 0 ? 'RUPTURA' : diasCobertura < 15 ? 'CRÍTICO' : diasCobertura < 30 ? 'ATENÇÃO' : 'OK'
            };
        }).sort((a, b) => a.diasCobertura - b.diasCobertura);

        const rupturas = analise.filter(a => a.situacao === 'RUPTURA').length;
        const criticos = analise.filter(a => a.situacao === 'CRÍTICO').length;
        const cobMedia = analise.filter(a => a.diasCobertura < 999).reduce((s, a) => s + a.diasCobertura, 0) / Math.max(1, analise.filter(a => a.diasCobertura < 999).length);

        el.innerHTML = `
        <div class="view-header-bar">
            <h2><span class="material-icons-round">autorenew</span> Giro / Cobertura de Estoque</h2>
        </div>
        <div style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;">
            <div class="card" style="flex:1;min-width:150px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Rupturas</div>
                <div style="font-size:1.8rem;font-weight:700;color:var(--danger-color)">${rupturas}</div>
            </div>
            <div class="card" style="flex:1;min-width:150px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Críticos (&lt;15d)</div>
                <div style="font-size:1.8rem;font-weight:700;color:#f59e0b">${criticos}</div>
            </div>
            <div class="card" style="flex:1;min-width:150px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Cob. Média</div>
                <div style="font-size:1.8rem;font-weight:700;color:var(--primary-color)">${Math.round(cobMedia)}d</div>
            </div>
            <div class="card" style="flex:1;min-width:150px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Curva A</div>
                <div style="font-size:1.8rem;font-weight:700;">${analise.filter(a => a.classificacao === 'A').length}</div>
            </div>
        </div>
        <div class="card" style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="border-bottom:1px solid var(--border-color);">
                        <th style="text-align:left;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">SKU</th>
                        <th style="text-align:left;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Produto</th>
                        <th style="text-align:center;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">ABC</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Estoque</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Giro/Dia</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Giro/Mês</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Dias Cob.</th>
                        <th style="text-align:right;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Ideal</th>
                        <th style="text-align:center;padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary)">Situação</th>
                    </tr>
                </thead>
                <tbody>
                    ${analise.map(a => {
            const sitColor = a.situacao === 'RUPTURA' ? 'status-overdue' : a.situacao === 'CRÍTICO' ? 'status-overdue' : a.situacao === 'ATENÇÃO' ? 'status-pending' : 'status-shipped';
            const abcColor = a.classificacao === 'A' ? 'var(--primary-color)' : a.classificacao === 'B' ? '#f59e0b' : 'var(--text-secondary)';
            return `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                            <td style="padding:0.6rem 0.5rem;font-weight:600;font-size:0.85rem;">${a.sku}</td>
                            <td style="padding:0.6rem 0.5rem;font-size:0.85rem;">${a.nome}</td>
                            <td style="text-align:center;padding:0.6rem 0.5rem;">
                                <span style="font-weight:700;color:${abcColor};">${a.classificacao}</span>
                            </td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;">${a.estoqueAtual}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;">${a.giroDiario}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;">${a.giroMensal}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;font-weight:700;">${a.diasCobertura > 900 ? '∞' : a.diasCobertura + 'd'}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;">${a.estoqueIdeal}</td>
                            <td style="text-align:center;padding:0.6rem 0.5rem;">
                                <span class="status-badge ${sitColor}">${a.situacao}</span>
                            </td>
                        </tr>`;
        }).join('')}
                    ${analise.length === 0 ? '<tr><td colspan="9" style="text-align:center;padding:2rem;color:var(--text-secondary)">Nenhum produto cadastrado.</td></tr>' : ''}
                </tbody>
            </table>
        </div>`;
    }

    // ═════════════════════════════════════════════════════
    // VIEW HOOKS
    // ═════════════════════════════════════════════════════
    const VIEW_MAP = {
        posicaoEstoque: renderPosicaoEstoque,
        ajusteEstoque: renderAjusteEstoque,
        transferenciaEstoque: renderTransferenciaEstoque,
        inventario: renderInventario,
        giroEstoque: renderGiroEstoque
    };

    window._viewHooks = window._viewHooks || [];
    window._viewHooks.push(viewId => {
        if (VIEW_MAP[viewId]) VIEW_MAP[viewId]();
    });

    console.log('📦 Módulo de Estoque inicializado (5 telas)');

    return {
        renderPosicaoEstoque,
        renderAjusteEstoque,
        renderTransferenciaEstoque,
        renderInventario,
        renderGiroEstoque,
        filtrarPosicao,
        salvarAjuste,
        executarTransferencia,
        novoInventario
    };
})();
