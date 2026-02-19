/* ═══════════════════════════════════════════════════════════
   Vendas Avançado — Parreira ERP (Fase 12.4)
   Orçamento, Faturamento, Liberação Crédito, Romaneio, Comissões
   ═══════════════════════════════════════════════════════════ */
'use strict';

const VendasAvancado = (() => {
    const VIEWS = {
        orcamento: { title: 'Orçamento', icon: 'request_quote', desc: 'Emissão de orçamentos com validade e conversão em pedido' },
        faturamento: { title: 'Faturamento / NF-e', icon: 'task_alt', desc: 'Processamento de faturamento e geração de NF-e em lote' },
        liberacaoCredito: { title: 'Liberação de Crédito', icon: 'verified', desc: 'Aprovação de pedidos bloqueados por limite de crédito' },
        romaneio: { title: 'Romaneio de Carga', icon: 'local_shipping', desc: 'Montagem e separação de cargas por rota e transportadora' },
        comissoes: { title: 'Comissões', icon: 'paid', desc: 'Cálculo e consulta de comissões por vendedor/período' }
    };

    function renderPlaceholder(viewId) {
        const v = VIEWS[viewId]; if (!v) return;
        const c = document.getElementById(`${viewId}-container`); if (!c) return;
        c.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;color:var(--text-secondary)">
            <span class="material-icons-round" style="font-size:4rem;opacity:.2;margin-bottom:1rem">${v.icon}</span>
            <h3 style="margin-bottom:.5rem;color:var(--text-primary)">${v.title}</h3>
            <p style="font-size:.9rem;max-width:400px;text-align:center">${v.desc}</p>
            <span style="margin-top:1rem;font-size:.75rem;padding:.4rem .8rem;background:rgba(245,158,11,.1);border-radius:var(--radius-md);color:var(--accent-warning)">Fase 12.4 — Em desenvolvimento</span>
        </div>`;
    }

    window._viewHooks = window._viewHooks || [];
    window._viewHooks.push(viewId => { if (VIEWS[viewId]) renderPlaceholder(viewId); });

    return { renderPlaceholder };
})();
