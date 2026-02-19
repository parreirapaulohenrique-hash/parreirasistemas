/* ═══════════════════════════════════════════════════════════
   Fiscal Avançado — Parreira ERP (Fase 12.6)
   CT-e, Apuração ICMS/IPI, SPED Fiscal, SPED Contribuições, Livros
   ═══════════════════════════════════════════════════════════ */
'use strict';

const FiscalAvancado = (() => {
    const VIEWS = {
        cte: { title: 'CT-e — Conhec. de Transporte', icon: 'local_shipping', desc: 'Emissão e consulta de CT-e (Conhecimento de Transporte Eletrônico)' },
        apuracaoIcms: { title: 'Apuração ICMS / IPI', icon: 'calculate', desc: 'Cálculo de apuração mensal de ICMS e IPI com créditos e débitos' },
        spedFiscal: { title: 'SPED Fiscal', icon: 'description', desc: 'Geração do arquivo digital SPED Fiscal (EFD ICMS/IPI)' },
        spedContribuicoes: { title: 'SPED Contribuições', icon: 'description', desc: 'Geração do arquivo SPED Contribuições (EFD PIS/COFINS)' },
        livrosFiscais: { title: 'Livros Fiscais', icon: 'menu_book', desc: 'Impressão dos livros de entrada, saída e apuração' }
    };

    function renderPlaceholder(viewId) {
        const v = VIEWS[viewId]; if (!v) return;
        const c = document.getElementById(`${viewId}-container`); if (!c) return;
        c.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;color:var(--text-secondary)">
            <span class="material-icons-round" style="font-size:4rem;opacity:.2;margin-bottom:1rem">${v.icon}</span>
            <h3 style="margin-bottom:.5rem;color:var(--text-primary)">${v.title}</h3>
            <p style="font-size:.9rem;max-width:400px;text-align:center">${v.desc}</p>
            <span style="margin-top:1rem;font-size:.75rem;padding:.4rem .8rem;background:rgba(139,92,246,.1);border-radius:var(--radius-md);color:#8b5cf6">Fase 12.6 — Em desenvolvimento</span>
        </div>`;
    }

    window._viewHooks = window._viewHooks || [];
    window._viewHooks.push(viewId => { if (VIEWS[viewId]) renderPlaceholder(viewId); });

    return { renderPlaceholder };
})();
