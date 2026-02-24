/* ═══════════════════════════════════════════════════════════
   Gerencial — Parreira ERP (Fase 7)
   Dashboard Executivo, Curva ABC, Análise de Margem, KPIs
   ═══════════════════════════════════════════════════════════ */
'use strict';

const Gerencial = (() => {

    const fmtMoney = v => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fmtNum = v => parseFloat(v || 0).toLocaleString('pt-BR');

    // Obter vendas faturadas para gerar dados reais se possível
    function getVendas() {
        return JSON.parse(localStorage.getItem('erp_vendas' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '[]')
            .filter(v => v.status === 'faturado' || v.status === 'despachado' || v.status === 'entregue' || v.status === 'venda');
    }

    // ─────────────────────────────────────────────────────────
    // 1. DASHBOARD EXECUTIVO
    // ─────────────────────────────────────────────────────────
    function renderDashboardExecutivo() {
        const el = document.getElementById('dashboardExecutivo-container');
        if (!el) return;

        const vendas = getVendas();
        const faturamentoTotal = vendas.reduce((sum, v) => sum + (v.totais?.totalNF || 0), 0) || 1250430.50; // Mock se vazio
        const numPedidos = vendas.length || 342;
        const ticketMedio = faturamentoTotal / numPedidos;

        // Mock chart bars
        const bars = [40, 60, 45, 80, 55, 90, 75, 40, 65, 85, 100, 70];
        const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

        el.innerHTML = `
            <div style="display:flex; gap:1.5rem; flex-wrap:wrap; margin-bottom:1.5rem;">
                <!-- Cards Principais -->
                <div class="card" style="flex:1; min-width:220px; padding:1.5rem; border-left: 4px solid var(--primary-color);">
                    <div style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:0.5rem; display:flex; justify-content:space-between;">
                        Faturamento Mês <span class="material-icons-round" style="font-size:1.1rem;color:var(--primary-color)">trending_up</span>
                    </div>
                    <div style="font-size:1.8rem; font-weight:700;">${fmtMoney(faturamentoTotal)}</div>
                    <div style="font-size:0.75rem; color:var(--success-color); margin-top:0.5rem;">+12.5% vs mês anterior</div>
                </div>
                
                <div class="card" style="flex:1; min-width:220px; padding:1.5rem; border-left: 4px solid var(--warning-color);">
                    <div style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:0.5rem; display:flex; justify-content:space-between;">
                        Ticket Médio <span class="material-icons-round" style="font-size:1.1rem;color:var(--warning-color)">receipt_long</span>
                    </div>
                    <div style="font-size:1.8rem; font-weight:700;">${fmtMoney(ticketMedio)}</div>
                    <div style="font-size:0.75rem; color:var(--danger-color); margin-top:0.5rem;">-2.1% vs mês anterior</div>
                </div>

                <div class="card" style="flex:1; min-width:220px; padding:1.5rem; border-left: 4px solid var(--success-color);">
                    <div style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:0.5rem; display:flex; justify-content:space-between;">
                        Pedidos Concluídos <span class="material-icons-round" style="font-size:1.1rem;color:var(--success-color)">local_shipping</span>
                    </div>
                    <div style="font-size:1.8rem; font-weight:700;">${fmtNum(numPedidos)}</div>
                    <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.5rem;">Em toda a base logada</div>
                </div>
            </div>

            <div style="display:flex; gap:1.5rem; flex-wrap:wrap;">
                <!-- Gráfico de Faturamento Mês a Mês (Mock visual) -->
                <div class="card" style="flex:2; min-width:400px; padding:1.5rem;">
                    <h3 style="margin-bottom:1.5rem; font-size:1rem;">Faturamento Anual Previsto vs Realizado</h3>
                    <div style="display:flex; align-items:flex-end; gap:0.5rem; height:200px; padding-bottom:1rem; border-bottom:1px solid rgba(255,255,255,0.05);">
                        ${bars.map((b, i) => `
                            <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; gap:0.5rem;">
                                <div style="width:100%; max-width:40px; background:var(--primary-color); height:${b}%; border-radius:4px 4px 0 0; transition: height 0.5s ease; position:relative;" title="${meses[i]}: R$ ${b}k">
                                </div>
                                <span style="font-size:0.7rem; color:var(--text-secondary);">${meses[i]}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Top Produtos Ranking -->
                <div class="card" style="flex:1; min-width:300px; padding:1.5rem;">
                    <h3 style="margin-bottom:1.5rem; font-size:1rem;">Top 5 Produtos Vendidos</h3>
                    <div style="display:flex; flex-direction:column; gap:1rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:0.5rem; border-bottom:1px solid rgba(255,255,255,0.05);">
                            <div>
                                <div style="font-weight:600; font-size:0.9rem;">Óleo de Soja Liza 900ml</div>
                                <div style="font-size:0.75rem; color:var(--text-secondary);">1.250 caixas</div>
                            </div>
                            <div style="font-weight:700; color:var(--success-color);">${fmtMoney(75000)}</div>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:0.5rem; border-bottom:1px solid rgba(255,255,255,0.05);">
                            <div>
                                <div style="font-weight:600; font-size:0.9rem;">Feijão Carioca Kicaldo 1kg</div>
                                <div style="font-size:0.75rem; color:var(--text-secondary);">840 fardos</div>
                            </div>
                            <div style="font-weight:700; color:var(--success-color);">${fmtMoney(42000)}</div>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:0.5rem; border-bottom:1px solid rgba(255,255,255,0.05);">
                            <div>
                                <div style="font-weight:600; font-size:0.9rem;">Arroz Tio João 5kg</div>
                                <div style="font-size:0.75rem; color:var(--text-secondary);">610 fardos</div>
                            </div>
                            <div style="font-weight:700; color:var(--success-color);">${fmtMoney(38000)}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // ─────────────────────────────────────────────────────────
    // 2. CURVA ABC (Pareto)
    // ─────────────────────────────────────────────────────────
    function renderCurvaAbc() {
        const el = document.getElementById('curvaAbc-container');
        if (!el) return;

        // Dados simulados de clientes para ABC
        const clientesABC = [
            { nome: 'SUPERMERCADO CENTRAL', compras: 450000, perc: 45, class: 'A' },
            { nome: 'MERCADINHO SAO JOSE', compras: 250000, perc: 25, class: 'A' },
            { nome: 'PADARIA ESPERANCA', compras: 100000, perc: 10, class: 'A' },
            { nome: 'RESTAURANTE BOA VISTA', compras: 80000, perc: 8, class: 'B' },
            { nome: 'LANCHONETE DA PRACA', compras: 50000, perc: 5, class: 'B' },
            { nome: 'BAR DO ZE', compras: 20000, perc: 2, class: 'B' },
            { nome: 'CANTINA ESCOLAR', compras: 15000, perc: 1.5, class: 'C' },
            { nome: 'MINI MERCADO SILVA', compras: 10000, perc: 1, class: 'C' }
        ];

        el.innerHTML = `
            <div class="card" style="margin-bottom:1.5rem; padding:1.5rem;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0;">Curva ABC de Clientes</h3>
                    <div style="display:flex; gap:1rem;">
                        <span style="padding:0.25rem 0.75rem; background:rgba(16, 185, 129, 0.2); color:#10b981; border-radius:1rem; font-size:0.8rem; font-weight:600;">Classe A: 80%</span>
                        <span style="padding:0.25rem 0.75rem; background:rgba(245, 158, 11, 0.2); color:#f59e0b; border-radius:1rem; font-size:0.8rem; font-weight:600;">Classe B: 15%</span>
                        <span style="padding:0.25rem 0.75rem; background:rgba(239, 68, 68, 0.2); color:#ef4444; border-radius:1rem; font-size:0.8rem; font-weight:600;">Classe C: 5%</span>
                    </div>
                </div>
            </div>

            <div class="card" style="overflow-x:auto;">
                <table class="data-table" style="width:100%">
                    <thead>
                        <tr>
                            <th>Cliente</th>
                            <th style="text-align:right;">Total Comprado (R$)</th>
                            <th style="text-align:right;">% Participação</th>
                            <th style="text-align:center;">Curva ABC</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${clientesABC.map(c => {
            let badgeClass = c.class === 'A' ? 'status-shipped' : (c.class === 'B' ? 'status-pending' : 'status-cancelled');
            return `
                            <tr>
                                <td style="font-weight:600;">${c.nome}</td>
                                <td style="text-align:right;">${fmtMoney(c.compras)}</td>
                                <td style="text-align:right;">${c.perc.toFixed(2)}%</td>
                                <td style="text-align:center;">
                                    <span class="status-badge ${badgeClass}" style="width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;font-size:1rem;">${c.class}</span>
                                </td>
                                <td>
                                    <button class="btn btn-secondary btn-sm" onclick="alert('Histórico de Vendas de ${c.nome}')">Acessar CRM</button>
                                </td>
                            </tr>`;
        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // ─────────────────────────────────────────────────────────
    // 3. ANÁLISE DE MARGEM E RENTABILIDADE
    // ─────────────────────────────────────────────────────────
    function renderAnaliseMargem() {
        const el = document.getElementById('analiseMargem-container');
        if (!el) return;

        const produtos = [
            { id: '10214', desc: 'Óleo de Soja Liza 900ml', custo: 4.80, imposto: 0.86, frete: 0.15, preco: 7.90 },
            { id: '20541', desc: 'Feijão Carioca Kicaldo 1kg', custo: 3.50, imposto: 0.63, frete: 0.20, preco: 5.80 },
            { id: '31980', desc: 'Arroz Tio João 5kg', custo: 18.00, imposto: 3.24, frete: 1.50, preco: 27.50 },
            { id: '40112', desc: 'Margarina Qualy 500g', custo: 6.20, imposto: 1.11, frete: 0.30, preco: 9.90 }
        ];

        el.innerHTML = `
            <div class="card" style="margin-bottom:1.5rem; padding:1.5rem; display:flex; justify-content:space-between;">
                <div>
                    <h3 style="margin:0 0 0.5rem 0;">Apurador de Markup / Margem de Contribuição</h3>
                    <p style="margin:0; font-size:0.85rem; color:var(--text-secondary);">Análise de (Preço Venda - Custos de Aquisição - Impostos - Fretes)</p>
                </div>
                <button class="btn btn-primary" onclick="alert('Planilha Exportada.')"><span class="material-icons-round">download</span> Exportar Análise</button>
            </div>

            <div class="card" style="overflow-x:auto;">
                <table class="data-table" style="width:100%">
                    <thead>
                        <tr>
                            <th>Cód / Descrição</th>
                            <th style="text-align:right;">CPV (Custo)</th>
                            <th style="text-align:right;">Impostos(18%)</th>
                            <th style="text-align:right;">Frete Médio</th>
                            <th style="text-align:right; font-weight:bold;">Custo Total</th>
                            <th style="text-align:right; color:var(--primary-color);">Preço Praticado</th>
                            <th style="text-align:right;">Margem Líquida ($)</th>
                            <th style="text-align:right;">Markup (%)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${produtos.map(p => {
            const custoTotal = p.custo + p.imposto + p.frete;
            const lucroLq = p.preco - custoTotal;
            const markup = (lucroLq / custoTotal) * 100;
            const colorClass = markup < 20 ? 'color:var(--danger-color)' : (markup < 40 ? 'color:var(--warning-color)' : 'color:var(--success-color)');

            return `
                            <tr>
                                <td>
                                    <div style="font-size:0.75rem; color:var(--text-secondary);">${p.id}</div>
                                    <div style="font-weight:600;">${p.desc}</div>
                                </td>
                                <td style="text-align:right;">${fmtMoney(p.custo)}</td>
                                <td style="text-align:right; color:var(--danger-color);">${fmtMoney(p.imposto)}</td>
                                <td style="text-align:right; color:var(--danger-color);">${fmtMoney(p.frete)}</td>
                                <td style="text-align:right; font-weight:bold;">${fmtMoney(custoTotal)}</td>
                                <td style="text-align:right; color:var(--primary-color); font-weight:bold;">${fmtMoney(p.preco)}</td>
                                <td style="text-align:right; font-weight:700;">${fmtMoney(lucroLq)}</td>
                                <td style="text-align:right; font-weight:900; ${colorClass}">${markup.toFixed(2)}%</td>
                            </tr>`;
        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // ─────────────────────────────────────────────────────────
    // 4. INDICADORES KPIS
    // ─────────────────────────────────────────────────────────
    function renderIndicadores() {
        const el = document.getElementById('indicadores-container');
        if (!el) return;

        el.innerHTML = `
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:1.5rem;">
                
                <!-- KPI 1 -->
                <div class="card" style="padding:1.5rem;">
                    <h3 style="margin:0 0 1rem 0; font-size:1rem; display:flex; align-items:center; gap:0.5rem;"><span class="material-icons-round" style="color:var(--primary-color);">track_changes</span> Cumprimento de Meta (Vendas)</h3>
                    <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
                        <span style="font-size:0.85rem; color:var(--text-secondary);">Realizado R$ 1.25M</span>
                        <span style="font-size:0.85rem; color:var(--text-secondary);">Meta R$ 1.5M</span>
                    </div>
                    <div style="width:100%; height:12px; background:rgba(255,255,255,0.1); border-radius:6px; overflow:hidden;">
                        <div style="width:83%; height:100%; background:var(--primary-color);"></div>
                    </div>
                    <div style="text-align:right; margin-top:0.5rem; font-weight:700; font-size:1.2rem; color:var(--primary-color);">83.3%</div>
                </div>

                <!-- KPI 2 -->
                <div class="card" style="padding:1.5rem;">
                    <h3 style="margin:0 0 1rem 0; font-size:1rem; display:flex; align-items:center; gap:0.5rem;"><span class="material-icons-round" style="color:var(--warning-color);">warehouse</span> Nível de Ruptura (WMS)</h3>
                    <div style="display:flex; align-items:center; justify-content:center; height:60px;">
                        <div style="font-size:3rem; font-weight:900; color:var(--success-color);">2.4%</div>
                    </div>
                    <div style="text-align:center; font-size:0.8rem; color:var(--text-secondary); margin-top:1rem;">Índice considerado excelente (< 5%)</div>
                </div>

                <!-- KPI 3 -->
                <div class="card" style="padding:1.5rem;">
                    <h3 style="margin:0 0 1rem 0; font-size:1rem; display:flex; align-items:center; gap:0.5rem;"><span class="material-icons-round" style="color:var(--danger-color);">money_off</span> Taxa de Inadimplência</h3>
                    <div style="display:flex; align-items:center; justify-content:center; height:60px;">
                        <div style="font-size:3rem; font-weight:900; color:var(--danger-color);">11.2%</div>
                    </div>
                    <div style="text-align:center; font-size:0.8rem; color:var(--text-secondary); margin-top:1rem;">Acima da meta (Tolerância: 5%)</div>
                </div>

                <!-- KPI 4 -->
                <div class="card" style="padding:1.5rem;">
                    <h3 style="margin:0 0 1rem 0; font-size:1rem; display:flex; align-items:center; gap:0.5rem;"><span class="material-icons-round" style="color:#0ea5e9;">all_inbox</span> Cobertura de Estoque (Dias)</h3>
                    <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
                        <span style="font-size:0.85rem; color:var(--text-secondary);">Média Geral de SKU</span>
                        <span style="font-weight:700; color:#0ea5e9; font-size:1.2rem;">45 Dias</span>
                    </div>
                    <div style="width:100%; height:12px; background:rgba(255,255,255,0.1); border-radius:6px; overflow:hidden;">
                        <div style="width:45%; height:100%; background:#0ea5e9;"></div>
                    </div>
                    <div style="text-align:right; margin-top:0.5rem; font-size:0.75rem; color:var(--text-secondary);">Estoque valorado em R$ 3.2M</div>
                </div>
            </div>
        `;
    }

    // ─────────────────────────────────────────────────────────
    // REGISTRO DOS HOOKS E TÍTULOS
    // ─────────────────────────────────────────────────────────
    window._viewHooks = window._viewHooks || [];
    window._viewHooks.push(viewId => {
        if (viewId === 'dashboardExecutivo') renderDashboardExecutivo();
        if (viewId === 'curvaAbc') renderCurvaAbc();
        if (viewId === 'analiseMargem') renderAnaliseMargem();
        if (viewId === 'indicadores') renderIndicadores();
    });

    console.log('📈 Módulo Gerencial (Fase 7) Inicializado.');

    return {
        renderDashboardExecutivo,
        renderCurvaAbc,
        renderAnaliseMargem,
        renderIndicadores
    };
})();
