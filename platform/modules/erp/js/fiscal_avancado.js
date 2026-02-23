/* ═══════════════════════════════════════════════════════════
   Fiscal Avançado — Parreira ERP (Fase 6)
   CT-e, Apuração ICMS/IPI, SPED Fiscal, SPED Contribuições, Livros
   ═══════════════════════════════════════════════════════════ */
'use strict';

const FiscalAvancado = (() => {
    const fmtMoney = v => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fmtDate = d => d ? new Date(d).toLocaleDateString('pt-BR') : '-';

    function getVendasFaturadas() {
        return JSON.parse(localStorage.getItem('erp_vendas' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '[]')
            .filter(v => ['faturado', 'venda', 'despachado'].includes(v.status));
    }
    function getEntradas() {
        return JSON.parse(localStorage.getItem('erp_entradas_nf') || '[]');
    }

    // ═════════════════════════════════════════════════════
    // 1. CT-e
    // ═════════════════════════════════════════════════════
    function renderCte() {
        const el = document.getElementById('view-cte');
        if (!el) return;

        const vendas = getVendasFaturadas();

        el.innerHTML = `
        <div class="view-header-bar">
            <h2><span class="material-icons-round">local_shipping</span> CT-e — Conhecimento de Transporte</h2>
        </div>
        <div class="card" style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="border-bottom:1px solid var(--border-color);">
                        <th style="padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:left">NF-e</th>
                        <th style="padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:left">Data</th>
                        <th style="padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:left">Cliente/Destino</th>
                        <th style="padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:left">Transportadora</th>
                        <th style="padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:right">Valor NF</th>
                        <th style="padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:right">Frete</th>
                        <th style="padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:center">CT-e</th>
                    </tr>
                </thead>
                <tbody>
                    ${vendas.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-secondary)">Nenhuma NF-e faturada para gerar CT-e.</td></tr>' : ''}
                    ${vendas.map(v => `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                            <td style="padding:0.6rem 0.5rem;font-weight:600;">${v.nfe || v.numero}</td>
                            <td style="padding:0.6rem 0.5rem;">${fmtDate(v.data)}</td>
                            <td style="padding:0.6rem 0.5rem;">${v.cliente?.razaoSocial || '-'}</td>
                            <td style="padding:0.6rem 0.5rem;">${v.transporte?.transportadora?.razaoSocial || 'Própria'}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;font-weight:600;">${fmtMoney(v.totais?.totalNF)}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;">${fmtMoney(v.totais?.frete || 0)}</td>
                            <td style="text-align:center;padding:0.6rem 0.5rem;">
                                <span class="status-badge status-pending">PENDENTE</span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
    }

    // ═════════════════════════════════════════════════════
    // 2. APURAÇÃO ICMS / IPI
    // ═════════════════════════════════════════════════════
    function renderApuracaoIcms() {
        const el = document.getElementById('view-apuracaoIcms');
        if (!el) return;

        const vendas = getVendasFaturadas();
        const entradas = getEntradas();

        // Débitos (saídas)
        const totalSaidas = vendas.reduce((s, v) => s + (v.totais?.totalNF || 0), 0);
        const icmsDebito = totalSaidas * 0.18;
        const ipiDebito = vendas.reduce((s, v) => s + (v.totais?.valorIPI || 0), 0);

        // Créditos (entradas)
        const totalEntradas = entradas.reduce((s, e) => s + (e.valorNF || 0), 0);
        const icmsCredito = totalEntradas * 0.18;
        const ipiCredito = totalEntradas * 0.05;

        const icmsAPagar = Math.max(0, icmsDebito - icmsCredito);
        const ipiAPagar = Math.max(0, ipiDebito - ipiCredito);

        el.innerHTML = `
        <div class="view-header-bar">
            <h2><span class="material-icons-round">calculate</span> Apuração ICMS / IPI</h2>
        </div>
        <div style="display:flex;gap:1.5rem;flex-wrap:wrap;">
            <div class="card" style="flex:1;min-width:300px;padding:1.5rem;">
                <h3 style="margin-bottom:1rem;font-size:0.95rem;color:var(--primary-color)">ICMS — Período Atual</h3>
                <div style="display:grid;gap:0.5rem;">
                    <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                        <span style="color:var(--text-secondary);">Débito (Saídas)</span>
                        <span style="font-weight:700;color:var(--danger-color);">${fmtMoney(icmsDebito)}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                        <span style="color:var(--text-secondary);">Crédito (Entradas)</span>
                        <span style="font-weight:700;color:var(--success-color);">${fmtMoney(icmsCredito)}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:0.75rem 0;font-size:1.1rem;">
                        <span style="font-weight:700;">ICMS a Recolher</span>
                        <span style="font-weight:700;color:${icmsAPagar > 0 ? 'var(--danger-color)' : 'var(--success-color)'};">${fmtMoney(icmsAPagar)}</span>
                    </div>
                    <div style="font-size:0.75rem;color:var(--text-secondary);text-align:center;">
                        Base Saídas: ${fmtMoney(totalSaidas)} × 18% | Base Entradas: ${fmtMoney(totalEntradas)} × 18%
                    </div>
                </div>
            </div>
            <div class="card" style="flex:1;min-width:300px;padding:1.5rem;">
                <h3 style="margin-bottom:1rem;font-size:0.95rem;color:#f59e0b">IPI — Período Atual</h3>
                <div style="display:grid;gap:0.5rem;">
                    <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                        <span style="color:var(--text-secondary);">Débito (Saídas)</span>
                        <span style="font-weight:700;color:var(--danger-color);">${fmtMoney(ipiDebito)}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                        <span style="color:var(--text-secondary);">Crédito (Entradas)</span>
                        <span style="font-weight:700;color:var(--success-color);">${fmtMoney(ipiCredito)}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:0.75rem 0;font-size:1.1rem;">
                        <span style="font-weight:700;">IPI a Recolher</span>
                        <span style="font-weight:700;color:${ipiAPagar > 0 ? 'var(--danger-color)' : 'var(--success-color)'};">${fmtMoney(ipiAPagar)}</span>
                    </div>
                </div>
            </div>
        </div>`;
    }

    // ═════════════════════════════════════════════════════
    // 3. SPED FISCAL
    // ═════════════════════════════════════════════════════
    function renderSpedFiscal() {
        const el = document.getElementById('view-spedFiscal');
        if (!el) return;

        const vendas = getVendasFaturadas();
        const entradas = getEntradas();

        el.innerHTML = `
        <div class="view-header-bar">
            <h2><span class="material-icons-round">description</span> SPED Fiscal (EFD ICMS/IPI)</h2>
        </div>
        <div style="display:flex;gap:1.5rem;flex-wrap:wrap;">
            <div class="card" style="flex:1;min-width:320px;padding:1.5rem;">
                <h3 style="margin-bottom:1rem;font-size:0.95rem;">Gerar Arquivo SPED</h3>
                <div style="display:grid;gap:0.75rem;">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;">
                        <div>
                            <label style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;">Período Início</label>
                            <input type="month" id="spedInicio" value="${new Date().toISOString().slice(0, 7)}"
                                style="width:100%;background:var(--surface-darker);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:0.5rem;color:var(--text-primary);" />
                        </div>
                        <div>
                            <label style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;">Período Fim</label>
                            <input type="month" id="spedFim" value="${new Date().toISOString().slice(0, 7)}"
                                style="width:100%;background:var(--surface-darker);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:0.5rem;color:var(--text-primary);" />
                        </div>
                    </div>
                    <button class="btn btn-primary" onclick="FiscalAvancado.gerarSped('fiscal')">
                        <span class="material-icons-round" style="font-size:1rem;">file_download</span> Gerar SPED Fiscal
                    </button>
                </div>
            </div>
            <div class="card" style="flex:1;min-width:300px;padding:1.5rem;">
                <h3 style="margin-bottom:1rem;font-size:0.9rem;color:var(--text-secondary);">Dados para o SPED</h3>
                <div style="display:grid;gap:0.5rem;">
                    <div style="display:flex;justify-content:space-between;padding:0.4rem 0;">
                        <span style="font-size:0.85rem;">NF-e Saída</span>
                        <span style="font-weight:700;">${vendas.length}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:0.4rem 0;">
                        <span style="font-size:0.85rem;">NF-e Entrada</span>
                        <span style="font-weight:700;">${entradas.length}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:0.4rem 0;">
                        <span style="font-size:0.85rem;">Valor Saídas</span>
                        <span style="font-weight:700;">${fmtMoney(vendas.reduce((s, v) => s + (v.totais?.totalNF || 0), 0))}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:0.4rem 0;">
                        <span style="font-size:0.85rem;">Valor Entradas</span>
                        <span style="font-weight:700;">${fmtMoney(entradas.reduce((s, e) => s + (e.valorNF || 0), 0))}</span>
                    </div>
                </div>
            </div>
        </div>`;
    }

    // ═════════════════════════════════════════════════════
    // 4. SPED CONTRIBUIÇÕES
    // ═════════════════════════════════════════════════════
    function renderSpedContribuicoes() {
        const el = document.getElementById('view-spedContribuicoes');
        if (!el) return;

        const vendas = getVendasFaturadas();
        const totalVendas = vendas.reduce((s, v) => s + (v.totais?.totalNF || 0), 0);
        const pis = totalVendas * 0.0165;
        const cofins = totalVendas * 0.076;

        el.innerHTML = `
        <div class="view-header-bar">
            <h2><span class="material-icons-round">description</span> SPED Contribuições (EFD PIS/COFINS)</h2>
        </div>
        <div style="display:flex;gap:1.5rem;flex-wrap:wrap;">
            <div class="card" style="flex:1;min-width:300px;padding:1.5rem;">
                <h3 style="margin-bottom:1rem;font-size:0.95rem;">PIS — Período Atual</h3>
                <div style="display:grid;gap:0.5rem;">
                    <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                        <span style="color:var(--text-secondary);">Base de Cálculo</span>
                        <span style="font-weight:600;">${fmtMoney(totalVendas)}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                        <span style="color:var(--text-secondary);">Alíquota</span>
                        <span style="font-weight:600;">1,65%</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:0.75rem 0;font-size:1.1rem;">
                        <span style="font-weight:700;">PIS a Recolher</span>
                        <span style="font-weight:700;color:var(--danger-color);">${fmtMoney(pis)}</span>
                    </div>
                </div>
            </div>
            <div class="card" style="flex:1;min-width:300px;padding:1.5rem;">
                <h3 style="margin-bottom:1rem;font-size:0.95rem;">COFINS — Período Atual</h3>
                <div style="display:grid;gap:0.5rem;">
                    <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                        <span style="color:var(--text-secondary);">Base de Cálculo</span>
                        <span style="font-weight:600;">${fmtMoney(totalVendas)}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                        <span style="color:var(--text-secondary);">Alíquota</span>
                        <span style="font-weight:600;">7,60%</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:0.75rem 0;font-size:1.1rem;">
                        <span style="font-weight:700;">COFINS a Recolher</span>
                        <span style="font-weight:700;color:var(--danger-color);">${fmtMoney(cofins)}</span>
                    </div>
                </div>
            </div>
        </div>
        <div class="card" style="padding:1.5rem;margin-top:1rem;max-width:400px;">
            <button class="btn btn-primary" onclick="FiscalAvancado.gerarSped('contribuicoes')">
                <span class="material-icons-round" style="font-size:1rem;">file_download</span> Gerar SPED Contribuições
            </button>
        </div>`;
    }

    function gerarSped(tipo) {
        const label = tipo === 'fiscal' ? 'SPED Fiscal (EFD ICMS/IPI)' : 'SPED Contribuições (EFD PIS/COFINS)';
        alert(`📄 ${label}\n\nArquivo gerado com sucesso!\n\nEm produção, o sistema geraria o arquivo .txt no layout oficial da EFD para importação no validador SPED.\n\nRegistro 0000 — Abertura\nRegistro 0100 — Contador\nRegistro C100 — Documentos Fiscais\nRegistro E110 — Apuração ICMS\n...`);
    }

    // ═════════════════════════════════════════════════════
    // 5. LIVROS FISCAIS
    // ═════════════════════════════════════════════════════
    function renderLivrosFiscais() {
        const el = document.getElementById('view-livrosFiscais');
        if (!el) return;

        const vendas = getVendasFaturadas();
        const entradas = getEntradas();

        const livros = [
            { nome: 'Livro de Entrada', icon: 'move_to_inbox', registros: entradas.length, descr: 'Registro de NFs de compra e devoluções recebidas' },
            { nome: 'Livro de Saída', icon: 'outbox', registros: vendas.length, descr: 'Registro de NFs de venda emitidas' },
            { nome: 'Livro de Apuração ICMS', icon: 'calculate', registros: 1, descr: 'Demonstrativo mensal de débitos e créditos de ICMS' },
            { nome: 'Livro de Apuração IPI', icon: 'calculate', registros: 1, descr: 'Demonstrativo mensal de débitos e créditos de IPI' },
            { nome: 'Livro de Inventário', icon: 'fact_check', registros: JSON.parse(localStorage.getItem('erp_inventarios') || '[]').length, descr: 'Posição de estoque valorizado no encerramento do período' }
        ];

        el.innerHTML = `
        <div class="view-header-bar">
            <h2><span class="material-icons-round">menu_book</span> Livros Fiscais</h2>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:1rem;">
            ${livros.map(l => `
                <div class="card" style="padding:1.5rem;display:flex;flex-direction:column;gap:0.75rem;">
                    <div style="display:flex;align-items:center;gap:0.75rem;">
                        <span class="material-icons-round" style="font-size:2rem;color:var(--primary-color);opacity:0.7;">${l.icon}</span>
                        <div>
                            <div style="font-weight:700;font-size:0.95rem;">${l.nome}</div>
                            <div style="font-size:0.75rem;color:var(--text-secondary);">${l.descr}</div>
                        </div>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;padding-top:0.5rem;border-top:1px solid rgba(255,255,255,0.05);">
                        <span style="font-size:0.8rem;color:var(--text-secondary);">${l.registros} registro(s)</span>
                        <button class="btn btn-secondary btn-sm" style="padding:0.3rem 0.6rem;font-size:0.75rem;" onclick="alert('📖 ${l.nome}\\n\\nEm produção, o sistema geraria o relatório fiscal completo para impressão.')">
                            <span class="material-icons-round" style="font-size:0.85rem;">print</span> Imprimir
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>`;
    }

    // ═════════════════════════════════════════════════════
    // VIEW HOOKS
    // ═════════════════════════════════════════════════════
    const VIEW_MAP = {
        cte: renderCte,
        apuracaoIcms: renderApuracaoIcms,
        spedFiscal: renderSpedFiscal,
        spedContribuicoes: renderSpedContribuicoes,
        livrosFiscais: renderLivrosFiscais
    };

    window._viewHooks = window._viewHooks || [];
    window._viewHooks.push(viewId => {
        if (VIEW_MAP[viewId]) VIEW_MAP[viewId]();
    });

    console.log('📋 Módulo Fiscal Avançado inicializado (5 telas)');

    return {
        renderCte, renderApuracaoIcms,
        renderSpedFiscal, renderSpedContribuicoes, gerarSped,
        renderLivrosFiscais
    };
})();
