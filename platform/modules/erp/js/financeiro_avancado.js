/* ═══════════════════════════════════════════════════════════
   Financeiro Avançado — Parreira ERP (Fase 12.5)
   Fluxo de Caixa, Boletos, Conciliação, Inadimplência
   ═══════════════════════════════════════════════════════════ */
'use strict';

const FinanceiroAvancado = (() => {
    const VIEWS = {
        fluxoCaixa: { title: 'Fluxo de Caixa', icon: 'waterfall_chart', desc: 'Projeção de entradas e saídas por período com gráfico' },
        boletos: { title: 'Boletos', icon: 'confirmation_number', desc: 'Geração, remessa e retorno de boletos bancários' },
        conciliacao: { title: 'Conciliação Bancária', icon: 'sync_alt', desc: 'Importação de extrato OFX e conciliação automatizada' },
        inadimplencia: { title: 'Inadimplência', icon: 'warning', desc: 'Consulta de títulos vencidos, aging e ações de cobrança' }
    };

    function renderPlaceholder(viewId) {
        const v = VIEWS[viewId]; if (!v) return;
        const c = document.getElementById(`${viewId}-container`); if (!c) return;
        c.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;color:var(--text-secondary)">
            <span class="material-icons-round" style="font-size:4rem;opacity:.2;margin-bottom:1rem">${v.icon}</span>
            <h3 style="margin-bottom:.5rem;color:var(--text-primary)">${v.title}</h3>
            <p style="font-size:.9rem;max-width:400px;text-align:center">${v.desc}</p>
            <span style="margin-top:1rem;font-size:.75rem;padding:.4rem .8rem;background:rgba(239,68,68,.1);border-radius:var(--radius-md);color:var(--accent-danger)">Fase 12.5 — Em desenvolvimento</span>
        </div>`;
    }

    window._viewHooks = window._viewHooks || [];
    window._viewHooks.push(viewId => { if (VIEWS[viewId]) renderPlaceholder(viewId); });

    return { renderPlaceholder };
})();
