/* ═══════════════════════════════════════════════════════════
   Compras — Parreira ERP (Fase 12.2)
   Sugestão, Pedido, Cotação, Entrada NF/XML, Consulta
   ═══════════════════════════════════════════════════════════ */
'use strict';

const Compras = (() => {
    const VIEWS = {
        sugestaoCompra: { title: 'Sugestão de Compra', icon: 'auto_awesome', desc: 'Motor de sugestão baseado em giro, estoque ideal e histórico de vendas' },
        pedidoCompra: { title: 'Pedido de Compra', icon: 'description', desc: 'Emissão e consulta de pedidos de compra por fornecedor' },
        cotacao: { title: 'Cotação', icon: 'compare_arrows', desc: 'Comparação de preços entre fornecedores' },
        entradaNf: { title: 'Entrada NF / XML', icon: 'move_to_inbox', desc: 'Lançamento de notas fiscais de entrada e importação XML' },
        consultaEntradas: { title: 'Consulta de Entradas', icon: 'search', desc: 'Pesquisa e detalhamento de entradas realizadas' }
    };

    function renderPlaceholder(viewId) {
        const v = VIEWS[viewId]; if (!v) return;
        const c = document.getElementById(`${viewId}-container`); if (!c) return;
        c.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;color:var(--text-secondary)">
            <span class="material-icons-round" style="font-size:4rem;opacity:.2;margin-bottom:1rem">${v.icon}</span>
            <h3 style="margin-bottom:.5rem;color:var(--text-primary)">${v.title}</h3>
            <p style="font-size:.9rem;max-width:400px;text-align:center">${v.desc}</p>
            <span style="margin-top:1rem;font-size:.75rem;padding:.4rem .8rem;background:rgba(14,165,233,.1);border-radius:var(--radius-md);color:var(--primary-color)">Fase 12.2 — Em desenvolvimento</span>
        </div>`;
    }

    // Register hook
    window._viewHooks = window._viewHooks || [];
    window._viewHooks.push(viewId => { if (VIEWS[viewId]) renderPlaceholder(viewId); });

    return { renderPlaceholder };
})();
