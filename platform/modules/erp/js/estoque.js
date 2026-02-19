/* ═══════════════════════════════════════════════════════════
   Estoque — Parreira ERP (Fase 12.3)
   Posição, Ajuste, Transferência, Inventário, Giro, Local., Reclassif.
   ═══════════════════════════════════════════════════════════ */
'use strict';

const Estoque = (() => {
    const VIEWS = {
        posicaoEstoque: { title: 'Posição de Estoque', icon: 'assessment', desc: 'Consulta de saldo em estoque por produto, filial e localização' },
        ajusteEstoque: { title: 'Ajuste de Estoque', icon: 'tune', desc: 'Lançamento de ajustes de inventário (entrada/saída/perda)' },
        transferenciaEstoque: { title: 'Transferência de Estoque', icon: 'swap_horiz', desc: 'Movimentação entre filiais ou localizações internas' },
        inventario: { title: 'Inventário', icon: 'fact_check', desc: 'Contagem física e conciliação com saldo do sistema' },
        giroEstoque: { title: 'Giro / Cobertura', icon: 'autorenew', desc: 'Análise de giro diário, cobertura e dias de estoque' },
        localizacao: { title: 'Localização / WMS', icon: 'pin_drop', desc: 'Endereçamento de produtos por rua/prédio/nível/apt' },
        reclassificacao: { title: 'Reclassificação', icon: 'drive_file_rename_outline', desc: 'Alteração de grupo, marca ou classificação fiscal em lote' }
    };

    function renderPlaceholder(viewId) {
        const v = VIEWS[viewId]; if (!v) return;
        const c = document.getElementById(`${viewId}-container`); if (!c) return;
        c.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;color:var(--text-secondary)">
            <span class="material-icons-round" style="font-size:4rem;opacity:.2;margin-bottom:1rem">${v.icon}</span>
            <h3 style="margin-bottom:.5rem;color:var(--text-primary)">${v.title}</h3>
            <p style="font-size:.9rem;max-width:400px;text-align:center">${v.desc}</p>
            <span style="margin-top:1rem;font-size:.75rem;padding:.4rem .8rem;background:rgba(16,185,129,.1);border-radius:var(--radius-md);color:var(--accent-success)">Fase 12.3 — Em desenvolvimento</span>
        </div>`;
    }

    window._viewHooks = window._viewHooks || [];
    window._viewHooks.push(viewId => { if (VIEWS[viewId]) renderPlaceholder(viewId); });

    return { renderPlaceholder };
})();
