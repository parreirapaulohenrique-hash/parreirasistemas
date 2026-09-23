/**
 * DEMANDA ANALYTICS ENGINE - COTAÇÃO 3.0
 * Integração Analítica Completa: Estoque, Compras, Sazonalidade e Ações Gerenciais
 */

(function() {
    'use strict';

    // Utilitários de Formatação
    const fmtBRL = (v) => {
        if (typeof v !== 'number' || isNaN(v)) v = parseFloat(v) || 0;
        return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };
    const fmtNum = (v) => {
        if (typeof v !== 'number' || isNaN(v)) v = parseFloat(v) || 0;
        return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };
    const fmtInt = (v) => {
        if (typeof v !== 'number' || isNaN(v)) v = parseInt(v) || 0;
        return v.toLocaleString('pt-BR');
    };
    const fmtPct = (v) => {
        if (typeof v !== 'number' || isNaN(v)) v = parseFloat(v) || 0;
        return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    };

    window.fmtBRL = fmtBRL;
    window.fmtNum = fmtNum;
    window.fmtInt = fmtInt;
    window.fmtPct = fmtPct;

    // Estado dos Filtros Globais Analíticos
    let activeFilters = {
        marca: '',
        curva: '',
        equip: '',
        perfil: '',
        prio: '',
        start: '',
        search: '',
        customIdsSet: null
    };

    window.activeAnalyticsFilters = activeFilters;

    function getFilteredSkus() {
        const list = window.COMPACT_SKUS || [];
        return list.filter(s => {
            if (activeFilters.customIdsSet && !activeFilters.customIdsSet.has(s[0])) return false;
            if (activeFilters.marca && s[2] !== activeFilters.marca) return false;
            if (activeFilters.curva) {
                if (activeFilters.curva === 'X' || activeFilters.curva.startsWith('X')) {
                    if (s[5] !== 'X' && (parseFloat(s[20]) || 0) <= 0) return false;
                } else if (s[5] !== activeFilters.curva) {
                    return false;
                }
            }
            if (activeFilters.equip) {
                const peq = (s[36] || '').split(' / ')[0];
                if (peq !== activeFilters.equip && !(s[36] || '').startsWith(activeFilters.equip)) return false;
            }
            if (activeFilters.perfil && (!s[37] || !s[37].startsWith(activeFilters.perfil))) return false;
            if (activeFilters.prio && s[18] !== activeFilters.prio) return false;
            if (activeFilters.start && (s[40] !== activeFilters.start && s[35] !== activeFilters.start)) return false;
            if (activeFilters.search) {
                const q = activeFilters.search.toLowerCase();
                const match = String(s[0]).toLowerCase().includes(q) ||
                              String(s[1]).toLowerCase().includes(q) ||
                              String(s[2]).toLowerCase().includes(q) ||
                              String(s[36] || '').toLowerCase().includes(q) ||
                              String(s[38] || '').toLowerCase().includes(q) ||
                              String(s[39] || '').toLowerCase().includes(q);
                if (!match) return false;
            }
            return true;
        });
    }
    window.getFilteredSkus = getFilteredSkus;

    function applyAnalyticsFilters() {
        const selM = document.getElementById('global-filter-marca'); if (selM) activeFilters.marca = selM.value;
        const selC = document.getElementById('global-filter-curva'); if (selC) activeFilters.curva = selC.value;
        const selE = document.getElementById('global-filter-equip'); if (selE) activeFilters.equip = selE.value;
        const selP = document.getElementById('global-filter-perfil'); if (selP) activeFilters.perfil = selP.value;
        const selPr = document.getElementById('global-filter-prio'); if (selPr) activeFilters.prio = selPr.value;
        const selS = document.getElementById('global-filter-start'); if (selS) activeFilters.start = selS.value;

        updateFilterTags();
        const filtered = getFilteredSkus();
        updateExecutiveKPIs(filtered);
    }
    window.applyAnalyticsFilters = applyAnalyticsFilters;

    function resetAnalyticsFilters() {
        activeFilters = { marca: '', curva: '', equip: '', perfil: '', prio: '', start: '', search: '', customIdsSet: null };
        ['marca', 'curva', 'equip', 'perfil', 'prio', 'start'].forEach(k => {
            const el = document.getElementById('global-filter-' + k);
            if (el) el.value = '';
        });
        updateFilterTags();
        updateExecutiveKPIs(window.COMPACT_SKUS || []);
    }
    window.resetAnalyticsFilters = resetAnalyticsFilters;

    function updateFilterTags() {
        const box = document.getElementById('active-filters-box');
        const container = document.getElementById('active-filter-tags');
        if (!box || !container) return;

        container.innerHTML = '';
        let count = 0;
        for (const [k, v] of Object.entries(activeFilters)) {
            if (v && k !== 'customIdsSet') {
                count++;
                const span = document.createElement('span');
                span.className = 'filter-tag';
                span.style.cssText = 'background: rgba(14, 165, 233, 0.15); border: 1px solid rgba(14, 165, 233, 0.35); color: #38bdf8; padding: 3px 8px; border-radius: 4px; font-size: 11px; margin-right: 6px; display: inline-flex; align-items: center; gap: 4px;';
                span.innerHTML = `<strong>${k.toUpperCase()}:</strong> ${v} <span style="cursor: pointer; font-weight: bold; margin-left: 4px;" onclick="removeSingleFilter('${k}')">&times;</span>`;
                container.appendChild(span);
            }
        }
        box.style.display = count > 0 ? 'flex' : 'none';
    }

    window.removeSingleFilter = function(key) {
        activeFilters[key] = '';
        const el = document.getElementById('global-filter-' + key);
        if (el) el.value = '';
        applyAnalyticsFilters();
    };

    function updateExecutiveKPIs(list) {
        if (!list) list = getFilteredSkus();

        // 1. Highlight START AGORA
        const startAgoraSkus = list.filter(s => s[40] === 'START AGORA' && (parseFloat(s[13]) > 0 || parseFloat(s[24]) > 0) && (parseFloat(s[16]) > 0 || parseFloat(s[17]) > 0));
        const startAgoraInvest = startAgoraSkus.reduce((sum, s) => sum + (parseFloat(s[17]) || 0), 0);
        
        const elStartCount = document.getElementById('kpi-start-agora-count');
        if (elStartCount) elStartCount.innerText = `${startAgoraSkus.length.toLocaleString('pt-BR')} SKUs`;
        const elStartVal = document.getElementById('kpi-start-agora-val');
        if (elStartVal) elStartVal.innerText = fmtBRL(startAgoraInvest);
        const elStartBtn = document.getElementById('kpi-start-agora-btn');
        if (elStartBtn) elStartBtn.innerText = `Auditar ${startAgoraSkus.length.toLocaleString('pt-BR')} SKUs →`;

        // 2. Faturamento Líquido
        const skusComVenda = list.filter(s => (parseFloat(s[24]) || 0) > 0);
        const totFat = list.reduce((sum, s) => sum + (parseFloat(s[24]) || 0), 0);
        const elFatVal = document.getElementById('kpi-fat-val');
        if (elFatVal) elFatVal.innerText = fmtBRL(totFat);
        const elFatSub = document.getElementById('kpi-fat-sub');
        if (elFatSub) elFatSub.innerText = `Vendas 3 Anos • ${skusComVenda.length.toLocaleString('pt-BR')} SKUs com giro`;

        // 3. Margem Bruta
        const totMargem = list.reduce((sum, s) => sum + (parseFloat(s[25]) || 0), 0);
        const pctMargem = totFat > 0 ? (totMargem / totFat * 100) : 0;
        const elMargemVal = document.getElementById('kpi-margem-val');
        if (elMargemVal) elMargemVal.innerText = fmtBRL(totMargem);
        const elMargemSub = document.getElementById('kpi-margem-sub');
        if (elMargemSub) elMargemSub.innerText = `${fmtPct(pctMargem)} sobre faturamento líquido`;

        // 4. Estoque Físico
        const totValEst = list.reduce((sum, s) => sum + (parseFloat(s[12]) || 0), 0);
        const totQtdEst = list.reduce((sum, s) => sum + (parseFloat(s[9]) || 0), 0);
        const elEstVal = document.getElementById('kpi-est-val');
        if (elEstVal) elEstVal.innerText = fmtBRL(totValEst);
        const elEstSub = document.getElementById('kpi-est-sub');
        if (elEstSub) elEstSub.innerText = `${list.length.toLocaleString('pt-BR')} SKUs • ${fmtNum(totQtdEst)} unidades`;

        // 5. Rupturas
        const rupturas = list.filter(s => (s[28] === 1 || parseFloat(s[10]) <= 0) && (parseFloat(s[13]) > 0 || parseFloat(s[16]) > 0));
        const elRupVal = document.getElementById('kpi-rup-val');
        if (elRupVal) elRupVal.innerText = `${rupturas.length.toLocaleString('pt-BR')} SKUs`;

        // 6. Capital Excedente
        const skusExcesso = list.filter(s => (parseFloat(s[19]) || 0) > 0);
        const totExc = skusExcesso.reduce((sum, s) => sum + (parseFloat(s[19]) || 0), 0);
        const elExcVal = document.getElementById('kpi-exc-val');
        if (elExcVal) elExcVal.innerText = fmtBRL(totExc);
        const elExcCount = document.getElementById('kpi-exc-sku-count');
        if (elExcCount) elExcCount.innerText = `${skusExcesso.length.toLocaleString('pt-BR')} SKUs`;
        const elExcSub = document.getElementById('kpi-exc-sub');
        if (elExcSub) elExcSub.innerText = `${skusExcesso.length.toLocaleString('pt-BR')} SKUs com estoque acima do alvo`;

        // 7. Curva X
        const curvaXSkus = list.filter(s => s[5] === 'X' || (parseFloat(s[20]) || 0) > 0);
        const totX = curvaXSkus.reduce((sum, s) => sum + (parseFloat(s[20]) || 0), 0);
        const elXVal = document.getElementById('kpi-x-val');
        if (elXVal) elXVal.innerText = fmtBRL(totX);
        const elXCount = document.getElementById('kpi-x-sku-count');
        if (elXCount) elXCount.innerText = `${curvaXSkus.length.toLocaleString('pt-BR')} SKUs`;
        const elXSub = document.getElementById('kpi-x-sub');
        if (elXSub) elXSub.innerText = `${curvaXSkus.length.toLocaleString('pt-BR')} SKUs sem vendas há mais de 90 dias`;

        // 8. Sugestão de Compras
        const skusComprar = list.filter(s => (parseFloat(s[17]) || 0) > 0 || (parseFloat(s[16]) || 0) > 0);
        const totCompra = skusComprar.reduce((sum, s) => sum + (parseFloat(s[17]) || 0), 0);
        const elSugVal = document.getElementById('kpi-sug-val');
        if (elSugVal) elSugVal.innerText = fmtBRL(totCompra);
        const elSugCount = document.getElementById('kpi-sug-sku-count');
        if (elSugCount) elSugCount.innerText = `${skusComprar.length.toLocaleString('pt-BR')} SKUs`;
        const elSugSub = document.getElementById('kpi-sug-sub');
        if (elSugSub) elSugSub.innerText = `${skusComprar.length.toLocaleString('pt-BR')} SKUs • Reposição de segurança`;
    }
    window.updateExecutiveKPIs = updateExecutiveKPIs;

    // ──────────────────────────────────────────────────────────
    // FICHA TÉCNICA COMPLETA DO SKU (CARD ESCURO COM 12 MÉTRICAS)
    // ──────────────────────────────────────────────────────────
    function showSkuDetail(skuId) {
        const list = window.COMPACT_SKUS || [];
        const s = list.find(item => String(item[0]) === String(skuId));
        if (!s) return;

        const cVal = (s[5] || 'C').toUpperCase();
        let curvaStyle = 'background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); color: #34d399;';
        if (cVal === 'B') curvaStyle = 'background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.35); color: #38bdf8;';
        else if (cVal === 'C') curvaStyle = 'background: rgba(251, 191, 36, 0.15); border: 1px solid rgba(251, 191, 36, 0.35); color: #fbbf24;';
        else if (cVal === 'X') curvaStyle = 'background: rgba(248, 113, 113, 0.15); border: 1px solid rgba(248, 113, 113, 0.35); color: #f87171;';
        const curvaBadge = `<span style="display: inline-block; padding: 2px 10px; border-radius: 9999px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; ${curvaStyle}">CURVA ${cVal}</span>`;

        const estDispVal = parseFloat(s[10]) || 0;
        const estDispColor = estDispVal <= 0 ? '#f87171' : '#ffffff';

        const cobDias = parseFloat(s[14]) || 0;
        const cobTxt = (cobDias > 0) ? `${fmtInt(cobDias)} dias` : (s[14] || 'Sem giro');

        const sugQtd = parseFloat(s[16]) || 0;
        const sugInv = parseFloat(s[17]) || 0;
        const sugTxt = `${fmtNum(sugQtd)} un (${fmtBRL(sugInv)})`;

        const capExc = parseFloat(s[19]) || 0;
        const capX = parseFloat(s[20]) || 0;

        const body = document.getElementById('sku-modal-body');
        if (!body) return;

        body.innerHTML = `
            <div style="background: #0b1322; border-radius: 10px; padding: 18px; margin-bottom: 20px; border: 1px solid #1e293b;">
              <div style="font-size: 12px; color: #38bdf8; font-family: monospace; font-weight: 700; margin-bottom: 4px;">
                CÓDIGO INTERNO (ID): #${s[0]} &nbsp;|&nbsp; REF. FÁBRICA: <strong style="color: #67e8f9; font-size: 13px;">${s[38] || 'NÃO INFORMADA'}</strong>
              </div>
              <div style="font-size: 20px; font-weight: 800; color: #ffffff; line-height: 1.3;">${s[1]}</div>
              <div style="margin-top: 8px; font-size: 13px; color: #94a3b8;">
                Aplicação Oficial: <strong style="color: #f1f5f9;">${s[39] || 'Consulte o catálogo da montadora'}</strong>
              </div>
            </div>

            <!-- GRID COM 12 CARDS ESCUROS DE MÉTRICAS -->
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px;">
              <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 8px; padding: 12px 14px;">
                <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 6px;">MARCA / FABRICANTE</div>
                <div style="font-size: 15px; font-weight: 800; color: #ffffff;">${s[2] || '-'}</div>
              </div>
              <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 8px; padding: 12px 14px;">
                <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 6px;">CLASSIFICAÇÃO ABC</div>
                <div>${curvaBadge}</div>
              </div>
              <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 8px; padding: 12px 14px;">
                <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 6px;">ESTOQUE DISPONÍVEL</div>
                <div style="font-size: 15px; font-weight: 800; color: ${estDispColor}; font-family: monospace;">${fmtNum(estDispVal)} ${s[4] || 'UN'}</div>
              </div>
              <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 8px; padding: 12px 14px;">
                <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 6px;">CUSTO MÉDIO REAL</div>
                <div style="font-size: 15px; font-weight: 800; color: #ffffff; font-family: monospace;">${fmtBRL(s[11])}</div>
              </div>
              <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 8px; padding: 12px 14px;">
                <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 6px;">VALOR EM ESTOQUE</div>
                <div style="font-size: 15px; font-weight: 800; color: #ffffff; font-family: monospace;">${fmtBRL(s[12])}</div>
              </div>
              <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 8px; padding: 12px 14px;">
                <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 6px;">DEMANDA MÉDIA DIÁRIA</div>
                <div style="font-size: 15px; font-weight: 800; color: #38bdf8; font-family: monospace;">${fmtNum(s[13])} un/dia</div>
              </div>
              <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 8px; padding: 12px 14px;">
                <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 6px;">COBERTURA ESTIMADA</div>
                <div style="font-size: 15px; font-weight: 800; color: #ffffff;">${cobTxt}</div>
              </div>
              <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 8px; padding: 12px 14px;">
                <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 6px;">SUGESTÃO DE COMPRA</div>
                <div style="font-size: 15px; font-weight: 800; color: #38bdf8;">${sugTxt}</div>
              </div>
              <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 8px; padding: 12px 14px;">
                <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 6px;">CAPITAL EXCEDENTE</div>
                <div style="font-size: 15px; font-weight: 800; color: #fbbf24;">${fmtBRL(capExc)}</div>
              </div>
              <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 8px; padding: 12px 14px;">
                <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 6px;">CAPITAL SEM GIRO (X)</div>
                <div style="font-size: 15px; font-weight: 800; color: #f87171;">${fmtBRL(capX)}</div>
              </div>
              <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 8px; padding: 12px 14px;">
                <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 6px;">FATURAMENTO LÍQUIDO</div>
                <div style="font-size: 15px; font-weight: 800; color: #ffffff; font-family: monospace;">${fmtBRL(s[24])}</div>
              </div>
              <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 8px; padding: 12px 14px;">
                <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 6px;">MARGEM BRUTA (LÍQ)</div>
                <div style="font-size: 15px; font-weight: 800; color: #34d399; font-family: monospace;">${fmtBRL(s[25])} (${fmtPct(s[26])})</div>
              </div>
            </div>

            <!-- PAINEL DE DIRETRIZES TÉCNICAS E SAZONALIDADE -->
            <div style="background: #0b1322; border: 1px solid #1e293b; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
              <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #38bdf8; margin-bottom: 12px; letter-spacing: 0.5px;">DIRETRIZES OPERACIONAIS DE COMPRA & SAZONALIDADE</div>
              <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; font-size: 12px;">
                <div><span style="color: #64748b; display: block; margin-bottom: 2px;">Equipamento / Máquina:</span> <strong style="color: #f1f5f9;">${s[36] || 'Não Identificado'}</strong></div>
                <div><span style="color: #64748b; display: block; margin-bottom: 2px;">Perfil Sazonal:</span> <strong style="color: #f1f5f9;">${s[37] || 'S8 — Não Identificado'}</strong></div>
                <div><span style="color: #64748b; display: block; margin-bottom: 2px;">Horizonte de Compra:</span> <strong style="color: #38bdf8;">${s[40] || 'START AGORA'}</strong></div>
                <div><span style="color: #64748b; display: block; margin-bottom: 2px;">Prioridade / Status:</span> <strong style="color: #fbbf24;">${s[18] || 'NORMAL'} / ${s[35] || 'OK'}</strong></div>
              </div>
            </div>
        `;

        document.getElementById('sku-modal-title').innerText = `Ficha Técnica: #${s[0]} — ${s[1].substr(0, 35)}`;
        document.getElementById('sku-modal').classList.add('active');
    }
    window.showSkuDetail = showSkuDetail;

    window.closeSkuModal = function() {
        const m = document.getElementById('sku-modal');
        if (m) m.classList.remove('active');
    };

    // ──────────────────────────────────────────────────────────
    // DRILL-DOWN MODAL ENGINE AMPLIADO
    // ──────────────────────────────────────────────────────────
    let currentDrilldownList = [];
    let currentFilteredDrilldownList = [];

    function renderDrilldownRows(list) {
        const tbody = document.getElementById('drilldown-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const maxRows = Math.min(list.length, 500);
        for (let i = 0; i < maxRows; i++) {
            const s = list[i];
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.onclick = function() { showSkuDetail(s[0]); };

            const prioBadge = s[18] === 'CRÍTICO' ? 'badge-danger' : (s[18] === 'ATENÇÃO' ? 'badge-warning' : 'badge-outline');
            const startBadge = s[35] === 'AGORA' || s[35] === 'ATRASADO' ? 'badge-danger' : (s[35] === 'PROGRAMADO' || s[35] === 'PRÓXIMO' ? 'badge-warning' : 'badge-outline');

            const cVal = (s[5] || 'C').toUpperCase();
            let badgeClass = 'badge-outline';
            if (cVal === 'A') badgeClass = 'badge-success';
            else if (cVal === 'B') badgeClass = 'badge-info';
            else if (cVal === 'C') badgeClass = 'badge-warning';
            else if (cVal === 'X') badgeClass = 'badge-danger';

            const estDisp = parseFloat(s[10]) || 0;
            const estColor = estDisp <= 0 ? 'text-danger font-bold' : '';
            const cobTxt = (parseFloat(s[14]) > 0) ? (fmtInt(s[14]) + ' d') : (s[14] || 'Sem giro');

            const capExcVal = parseFloat(s[19]) || 0;
            const capExcHtml = capExcVal > 0 
                ? `<strong style="color: #fbbf24; font-family: monospace; font-size: 12px;">${fmtBRL(capExcVal)}</strong>` 
                : `<span style="color: var(--text-dim);">-</span>`;

            tr.innerHTML = `
              <td><strong>${s[0]}</strong></td>
              <td><span style="font-family: monospace; font-weight: 700; color: #38bdf8; font-size: 11px;">${s[38] || '-'}</span></td>
              <td title="${s[1]}">${s[1].length > 40 ? s[1].substr(0, 40) + '...' : s[1]}</td>
              <td><span class="badge badge-brand">${s[2]}</span></td>
              <td>${s[36]}</td>
              <td class="text-center"><span class="badge ${badgeClass}">${s[5]}</span></td>
              <td class="text-right ${estColor}">${fmtNum(s[10])}</td>
              <td class="text-right">${cobTxt}</td>
              <td class="text-right">${capExcHtml}</td>
              <td class="text-right ${s[16] > 0 ? 'text-info font-bold' : ''}">${fmtNum(s[16])}</td>
              <td class="text-right text-success"><strong>${fmtBRL(s[17])}</strong></td>
              <td class="text-center"><span class="badge ${prioBadge}">${s[18]}</span></td>
              <td class="text-center"><span class="badge ${startBadge}">${s[35]}</span></td>
              <td class="text-center"><button class="btn btn-sm btn-outline" style="border-radius: 6px; padding: 2px 8px;" onclick="event.stopPropagation(); showSkuDetail('${s[0]}')">Ficha</button></td>
            `;
            tbody.appendChild(tr);
        }

        if (list.length > 500) {
            const trMore = document.createElement('tr');
            trMore.innerHTML = `<td colspan="14" class="text-center" style="color: var(--text-dim); padding: 12px;">+ ${list.length - 500} SKUs adicionais conciliados no totalizador acima.</td>`;
            tbody.appendChild(trMore);
        }
    }
    window.renderDrilldownRows = renderDrilldownRows;

    function openDrilldownModal(title, subtitle, skuList, recLabel) {
        currentDrilldownList = skuList || [];
        currentFilteredDrilldownList = currentDrilldownList;

        document.getElementById('modal-drilldown-title').innerText = title;
        document.getElementById('modal-drilldown-sub').innerText = subtitle;
        document.getElementById('drilldown-counter').innerText = currentDrilldownList.length.toLocaleString('pt-BR') + ' registros';
        document.getElementById('drilldown-footer-reconciliation').innerText = recLabel;
        
        const searchInput = document.getElementById('drilldown-search-input');
        if (searchInput) searchInput.value = '';

        // Dropdown de marcas
        const marcasMap = {};
        currentDrilldownList.forEach(s => {
            const m = s[2] || 'OUTROS';
            marcasMap[m] = (marcasMap[m] || 0) + 1;
        });
        const sortedMarcas = Object.keys(marcasMap).sort();
        const selMarca = document.getElementById('drilldown-filter-marca');
        if (selMarca) {
            selMarca.innerHTML = `<option value="">Todas as Marcas (${sortedMarcas.length} marcas)</option>` +
                sortedMarcas.map(m => `<option value="${m}">${m} (${marcasMap[m]})</option>`).join('');
            selMarca.value = '';
        }

        const selCurva = document.getElementById('drilldown-filter-curva');
        if (selCurva) selCurva.value = '';

        renderDrilldownRows(currentDrilldownList);
        document.getElementById('drilldown-modal').classList.add('active');
    }
    window.openDrilldownModal = openDrilldownModal;

    window.closeDrilldownModal = function() {
        const m = document.getElementById('drilldown-modal');
        if (m) m.classList.remove('active');
    };

    window.toggleDrilldownFullscreen = function() {
        const box = document.getElementById('drilldown-modal-box');
        const btn = document.getElementById('btn-toggle-drilldown-fs');
        if (!box) return;
        if (box.classList.contains('fullscreen')) {
            box.classList.remove('fullscreen');
            box.style.width = '98vw';
            box.style.height = '95vh';
            if (btn) btn.innerHTML = '⛶ Tela Cheia';
        } else {
            box.classList.add('fullscreen');
            box.style.width = '100vw';
            box.style.height = '100vh';
            if (btn) btn.innerHTML = '🗗 Restaurar';
        }
    };

    window.applyDrilldownMultiFilter = function() {
        const term = (document.getElementById('drilldown-search-input')?.value || '').toLowerCase().trim();
        const selMarca = document.getElementById('drilldown-filter-marca')?.value || '';
        const selCurva = document.getElementById('drilldown-filter-curva')?.value || '';

        let filtered = currentDrilldownList || [];
        if (selMarca) filtered = filtered.filter(s => s[2] === selMarca);
        if (selCurva) filtered = filtered.filter(s => (s[5] || '').toUpperCase() === selCurva.toUpperCase());
        if (term) {
            filtered = filtered.filter(s =>
                String(s[0]).toLowerCase().includes(term) ||
                String(s[1]).toLowerCase().includes(term) ||
                String(s[2]).toLowerCase().includes(term) ||
                String(s[36] || '').toLowerCase().includes(term) ||
                String(s[38] || '').toLowerCase().includes(term)
            );
        }

        currentFilteredDrilldownList = filtered;
        renderDrilldownRows(filtered);

        document.getElementById('drilldown-counter').innerText = `${filtered.length.toLocaleString('pt-BR')} registros`;

        const totalInvest = filtered.reduce((acc, s) => acc + (parseFloat(s[17]) || 0), 0);
        const totalExcesso = filtered.reduce((acc, s) => acc + (parseFloat(s[19]) || 0), 0);
        const recEl = document.getElementById('drilldown-footer-reconciliation');
        if (recEl) {
            if (totalExcesso > 0 && totalInvest === 0) {
                recEl.innerHTML = `Filtrados: <strong>${filtered.length.toLocaleString('pt-BR')} SKUs</strong> | Capital Excedente: <strong style="color: #fbbf24;">${fmtBRL(totalExcesso)}</strong>`;
            } else {
                recEl.innerHTML = `Filtrados: <strong>${filtered.length.toLocaleString('pt-BR')} SKUs</strong> | Investimento: <strong style="color: #34d399;">${fmtBRL(totalInvest)}</strong>`;
            }
        }
    };

    window.exportDrilldownToCSV = function() {
        const list = currentFilteredDrilldownList || currentDrilldownList || [];
        if (!list.length) return alert('Nenhum registro para exportar.');
        const rawTitle = document.getElementById('modal-drilldown-title')?.innerText || 'analise_skus';
        const cleanTitle = rawTitle.replace(/[^a-zA-Z0-9_-]/g, '_');
        
        const headers = ['ID', 'Ref_Fabrica', 'Descricao', 'Marca_Fabricante', 'Equipamento', 'Curva_Qtd', 'Estoque_Fisico', 'Estoque_Disponivel', 'Custo_Medio', 'Valor_Estoque', 'Valor_Excedente_R$', 'DMD_Ajustada', 'Dias_Estoque', 'Compra_Sugerida', 'Investimento_Compra', 'Prioridade', 'Start_Status'];
        const rows = [headers.join(';')];
        list.forEach(s => {
            rows.push([
                s[0],
                `"${String(s[38] || '').replace(/"/g, '""')}"`,
                `"${String(s[1] || '').replace(/"/g, '""')}"`,
                `"${String(s[2] || '').replace(/"/g, '""')}"`,
                `"${String(s[36] || '').replace(/"/g, '""')}"`,
                s[5],
                String(s[9] || 0).replace('.', ','),
                String(s[10] || 0).replace('.', ','),
                String(s[11] || 0).replace('.', ','),
                String(s[12] || 0).replace('.', ','),
                String(s[19] || 0).replace('.', ','),
                String(s[13] || 0).replace('.', ','),
                `"${s[14]}"`,
                String(s[16] || 0).replace('.', ','),
                String(s[17] || 0).replace('.', ','),
                `"${s[18]}"`,
                `"${s[35]}"`
            ].join(';'));
        });

        const csvContent = '\uFEFF' + rows.join(String.fromCharCode(13, 10));
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `${cleanTitle}_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    window.printDrilldown = function() {
        const list = currentFilteredDrilldownList || currentDrilldownList || [];
        if (!list.length) return alert('Nenhum registro para imprimir.');

        const title = document.getElementById('modal-drilldown-title')?.innerText || 'Auditoria Analítica';
        const subtitle = document.getElementById('modal-drilldown-sub')?.innerText || '';
        const recInfo = document.getElementById('drilldown-footer-reconciliation')?.innerText || '';

        let printWin = window.open('', '_blank', 'width=1150,height=850');
        let rowsHtml = '';
        list.slice(0, 1500).forEach(s => {
            rowsHtml += `
              <tr>
                <td><strong>${s[0]}</strong></td>
                <td><strong style="color: #0284c7;">${s[38] || '-'}</strong></td>
                <td>${s[1]}</td>
                <td>${s[2]}</td>
                <td>${s[36]}</td>
                <td align="center">${s[5]}</td>
                <td align="right">${fmtNum(s[10])}</td>
                <td align="right">${typeof s[14] === 'number' ? fmtInt(s[14]) : s[14]}</td>
                <td align="right"><strong style="color: #b45309;">${s[19] > 0 ? fmtBRL(s[19]) : '-'}</strong></td>
                <td align="right">${fmtNum(s[16])}</td>
                <td align="right"><strong>${fmtBRL(s[17])}</strong></td>
                <td align="center">${s[18]}</td>
                <td align="center">${s[35]}</td>
              </tr>
            `;
        });

        printWin.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>${title} - Central Peças</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 11px; margin: 20px; color: #111; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10px; }
                th, td { border: 1px solid #cbd5e1; padding: 5px 7px; }
                th { background: #f1f5f9; font-weight: 700; text-align: left; }
                tr:nth-child(even) { background: #f8fafc; }
                @media print { @page { size: landscape; margin: 10mm; } button { display: none; } }
              </style>
            </head>
            <body>
              <h2>CENTRAL PEÇAS — ${title}</h2>
              <p>${subtitle}</p>
              <p><strong>${recInfo}</strong> | Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
              <button onclick="window.print()" style="padding: 6px 14px; background: #0284c7; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; margin-bottom: 8px;">Imprimir Agora</button>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Ref. Fábrica</th>
                    <th>Descrição</th>
                    <th>Marca</th>
                    <th>Equipamento</th>
                    <th style="text-align: center;">Curva</th>
                    <th style="text-align: right;">Est. Disp.</th>
                    <th style="text-align: right;">Cobertura</th>
                    <th style="text-align: right;">Valor Excedente</th>
                    <th style="text-align: right;">Sug. Compra</th>
                    <th style="text-align: right;">Investimento</th>
                    <th style="text-align: center;">Prioridade</th>
                    <th style="text-align: center;">Start</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>
            </body>
            </html>
        `);
        printWin.document.close();
    };

    // ──────────────────────────────────────────────────────────
    // DRILL-DOWNS ESPECÍFICOS (TODOS RECONCILIADOS COM FILTROS)
    // ──────────────────────────────────────────────────────────
    window.drilldownStartAgora = function() {
        const baseList = getFilteredSkus();
        const skus = baseList.filter(s => s[40] === 'START AGORA' && (parseFloat(s[13]) > 0 || parseFloat(s[24]) > 0) && (parseFloat(s[16]) > 0 || parseFloat(s[17]) > 0));
        const totalInv = skus.reduce((sum, s) => sum + (parseFloat(s[17]) || 0), 0);
        const totalQtd = skus.reduce((sum, s) => sum + (parseFloat(s[16]) || 0), 0);
        openDrilldownModal(
            "⚡ START DE COMPRA — AGORA (Imediato & Atrasado)",
            "Apenas SKUs com demanda ativa comprovada em ruptura ou com cobertura < Lead Time (15 dias).",
            skus,
            `Total: ${skus.length.toLocaleString('pt-BR')} SKUs ativos | Qtd a Pedir: ${fmtNum(totalQtd)} un | Investimento: ${fmtBRL(totalInv)}`
        );
    };

    window.drilldownExcesso = function() {
        const baseList = getFilteredSkus();
        const skus = baseList.filter(s => (parseFloat(s[19]) || 0) > 0).sort((a, b) => (parseFloat(b[19]) || 0) - (parseFloat(a[19]) || 0));
        const totalExc = skus.reduce((sum, s) => sum + (parseFloat(s[19]) || 0), 0);
        openDrilldownModal(
            "🔺 Capital Excedente (A/B/C)",
            "SKUs com estoque acima de 2x o alvo da curva (capital parado excedente).",
            skus,
            `Total: ${skus.length.toLocaleString('pt-BR')} SKUs com excesso | Capital Excedente: ${fmtBRL(totalExc)}`
        );
    };

    window.drilldownCurvaX = function() {
        const baseList = getFilteredSkus();
        const skus = baseList.filter(s => s[5] === 'X' || (parseFloat(s[20]) || 0) > 0).sort((a, b) => (parseFloat(b[20]) || 0) - (parseFloat(a[20]) || 0));
        const totalX = skus.reduce((sum, s) => sum + (parseFloat(s[20]) || 0), 0);
        openDrilldownModal(
            "🛑 Curva X: Capital Sem Giro (> 90 dias sem vendas)",
            "Itens com estoque positivo e nenhuma saída nos últimos 90 dias.",
            skus,
            `Total: ${skus.length.toLocaleString('pt-BR')} SKUs X | Capital Sem Giro: ${fmtBRL(totalX)}`
        );
    };

    window.drilldownRupturas = function() {
        const baseList = getFilteredSkus();
        const skus = baseList.filter(s => (s[28] === 1 || parseFloat(s[10]) <= 0) && (parseFloat(s[13]) > 0 || parseFloat(s[16]) > 0));
        openDrilldownModal(
            "⚠️ Rupturas Comerciais Reais (Demanda Ativa com Estoque ≤ 0)",
            "Itens com saída recente e falta imediata no centro de distribuição.",
            skus,
            `Total: ${skus.length.toLocaleString('pt-BR')} SKUs em ruptura confirmada com giro`
        );
    };

    window.drilldownSugestaoCompra = function() {
        const baseList = getFilteredSkus();
        const skus = baseList.filter(s => (parseFloat(s[17]) || 0) > 0 || (parseFloat(s[16]) || 0) > 0).sort((a, b) => (parseFloat(b[17]) || 0) - (parseFloat(a[17]) || 0));
        const totalComp = skus.reduce((sum, s) => sum + (parseFloat(s[17]) || 0), 0);
        openDrilldownModal(
            "🛒 Sugestão Consolidada de Compras",
            "Itens que necessitam de reposição para atendimento da demanda e estoque de segurança.",
            skus,
            `Total: ${skus.length.toLocaleString('pt-BR')} SKUs | Investimento: ${fmtBRL(totalComp)}`
        );
    };

    window.drilldownEstoqueTotal = function() {
        const baseList = getFilteredSkus();
        const totalVal = baseList.reduce((sum, s) => sum + (parseFloat(s[12]) || 0), 0);
        openDrilldownModal(
            "🏬 Estoque Físico Consolidado",
            "Auditoria dos SKUs cadastrados na base.",
            baseList,
            `Total: ${baseList.length.toLocaleString('pt-BR')} SKUs | Valor Total: ${fmtBRL(totalVal)}`
        );
    };

    window.drilldownAllSales = function() {
        const baseList = getFilteredSkus();
        const skus = baseList.filter(s => (parseFloat(s[24]) || 0) > 0);
        const totalFat = skus.reduce((sum, s) => sum + (parseFloat(s[24]) || 0), 0);
        openDrilldownModal(
            "💰 Faturamento Líquido de Produtos",
            "SKUs com saídas comerciais nos 3 anos analisados.",
            skus,
            `Total: ${skus.length.toLocaleString('pt-BR')} SKUs faturados | Total Líquido: ${fmtBRL(totalFat)}`
        );
    };

    window.drilldownMargem = function() {
        const baseList = getFilteredSkus();
        const skus = baseList.filter(s => (parseFloat(s[25]) || 0) > 0);
        const totalMargem = skus.reduce((sum, s) => sum + (parseFloat(s[25]) || 0), 0);
        openDrilldownModal(
            "📈 Margem Bruta Consolidada",
            "SKUs geradores de margem bruta positiva.",
            skus,
            `Total: ${skus.length.toLocaleString('pt-BR')} SKUs | Margem Total: ${fmtBRL(totalMargem)}`
        );
    };

    // ──────────────────────────────────────────────────────────
    // INITIALIZERS PARA AS VISÕES DOS GRUPOS 2, 3 E 4
    // ──────────────────────────────────────────────────────────
    window.initEstoqueVisao = function() {
        updateExecutiveKPIs(getFilteredSkus());
    };

    window.initEstoqueAbc = function() {
        const tbody = document.getElementById('tbody-curva-abc');
        if (!tbody) return;
        const matrix = window.SUMMARY_DATA?.curva_abc_matrix || [];
        tbody.innerHTML = matrix.map(r => `
            <tr>
                <td><strong>Curva ${r.Curva}</strong></td>
                <td class="text-right">${fmtInt(r.Total_SKUs)}</td>
                <td class="text-right">${fmtPct(r.Pct_SKUs)}</td>
                <td class="text-right font-mono">${fmtBRL(r.Faturamento)}</td>
                <td class="text-right">${fmtPct(r.Pct_Faturamento)}</td>
                <td class="text-right font-mono text-success">${fmtBRL(r.Margem)}</td>
                <td class="text-right">${fmtPct(r.Pct_Margem)}</td>
            </tr>
        `).join('');
    };

    window.initEstoqueCobertura = function() {
        const tbody = document.getElementById('tbody-cobertura');
        if (!tbody) return;
        const faixas = window.SUMMARY_DATA?.cobertura_faixas || [];
        tbody.innerHTML = faixas.map(f => `
            <tr>
                <td><strong>${f.Faixa}</strong></td>
                <td class="text-right">${fmtInt(f.Total_SKUs)}</td>
                <td class="text-right font-mono">${fmtBRL(f.Valor_Estoque)}</td>
                <td class="text-right">${fmtPct(f.Pct_Estoque)}</td>
            </tr>
        `).join('');
    };

    window.initEstoqueSazonalidade = function() {
        const tbody = document.getElementById('tbody-sazonalidade');
        if (!tbody) return;
        const perfis = window.SUMMARY_DATA?.perfis_sazonais_resumo || [];
        tbody.innerHTML = perfis.map(p => `
            <tr>
                <td><strong>${p.Perfil}</strong></td>
                <td class="text-right">${fmtInt(p.Total_SKUs)}</td>
                <td class="text-right font-mono">${fmtBRL(p.Estoque_Valor)}</td>
                <td class="text-right font-mono">${fmtBRL(p.Faturamento)}</td>
                <td class="text-right font-mono text-info">${fmtBRL(p.Compra_Sugerida)}</td>
            </tr>
        `).join('');
    };

    window.initAcoesRupturas = function() {
        drilldownRupturas();
    };

    window.initAcoesExcesso = function() {
        drilldownExcesso();
    };

    window.initAcoesCurvaX = function() {
        drilldownCurvaX();
    };

    window.initAcoesDevolucoes = function() {
        const tbody = document.getElementById('tbody-devolucoes-motivos');
        if (!tbody) return;
        const motivos = window.SUMMARY_DATA?.devolucoes_motivos || [];
        tbody.innerHTML = motivos.map(m => `
            <tr>
                <td><strong>${m.Operacao}</strong></td>
                <td class="text-right">${fmtInt(m.Ocorrencias)}</td>
                <td class="text-right">${fmtNum(m.Qtd)} un</td>
                <td class="text-right font-mono text-danger">${fmtBRL(m.Valor)}</td>
            </tr>
        `).join('');
    };

    window.initComprasStart = function() {
        drilldownStartAgora();
    };

    window.initComprasSugestao = function() {
        drilldownSugestaoCompra();
    };

    window.initComprasFornecedores = function() {
        const tbody = document.getElementById('tbody-fornecedores-top');
        if (!tbody) return;
        const forns = window.SUMMARY_DATA?.fornecedores_top30 || [];
        tbody.innerHTML = forns.map(f => `
            <tr>
                <td><strong>${f.Fornecedor}</strong></td>
                <td class="text-right">${fmtInt(f.Total_SKUs)}</td>
                <td class="text-right font-mono">${fmtBRL(f.Estoque_Valor)}</td>
                <td class="text-right font-mono">${fmtBRL(f.Faturamento)}</td>
                <td class="text-right font-mono text-info">${fmtBRL(f.Compra_Sugerida)}</td>
            </tr>
        `).join('');
    };

    console.log("[Demanda Analytics] Módulo Analítico Carregado com Sucesso.");
})();
