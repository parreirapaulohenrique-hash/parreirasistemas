/* ═══════════════════════════════════════════════════════════
   Gerencial — Parreira ERP (Fase 12.7)
   Dashboard Executivo, Curva ABC, Análise de Margem, KPIs
   ═══════════════════════════════════════════════════════════ */
'use strict';

const Gerencial = (() => {
    const VIEWS = {
        dashboardExecutivo: { title: 'Dashboard Executivo', icon: 'speed', desc: 'Visão consolidada de faturamento, margem, inadimplência e metas' },
        curvaAbc: { title: 'Curva ABC', icon: 'stacked_bar_chart', desc: 'Classificação ABC de produtos, clientes e fornecedores' },
        analiseMargem: { title: 'Análise de Margem', icon: 'pie_chart', desc: 'Margem por produto, marca, vendedor e região' },
        indicadores: { title: 'Indicadores KPIs', icon: 'dashboard_customize', desc: 'Painéis customizáveis com indicadores de performance' }
    };

    function renderPlaceholder(viewId) {
        const v = VIEWS[viewId]; if (!v) return;
        const c = document.getElementById(`${viewId}-container`); if (!c) return;
        c.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;color:var(--text-secondary)">
            <span class="material-icons-round" style="font-size:4rem;opacity:.2;margin-bottom:1rem">${v.icon}</span>
            <h3 style="margin-bottom:.5rem;color:var(--text-primary)">${v.title}</h3>
            <p style="font-size:.9rem;max-width:400px;text-align:center">${v.desc}</p>
            <span style="margin-top:1rem;font-size:.75rem;padding:.4rem .8rem;background:rgba(236,72,153,.1);border-radius:var(--radius-md);color:#ec4899">Fase 12.7 — Em desenvolvimento</span>
        </div>`;
    }

    window._viewHooks = window._viewHooks || [];
    window._viewHooks.push(viewId => { if (VIEWS[viewId]) renderPlaceholder(viewId); });

    return { renderPlaceholder };
})();
