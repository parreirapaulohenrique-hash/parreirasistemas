console.log("Central Peças Loaded:", window.COMPACT_SKUS.length, "SKUs");

    function switchModule(modId) {
      document.querySelectorAll('.module-section').forEach(sec => sec.classList.remove('active'));
      document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));

      const target = document.getElementById(modId);
      if (target) target.classList.add('active');

      const activeLink = Array.from(document.querySelectorAll('.nav-link')).find(l => l.getAttribute('onclick')?.includes(modId));
      if (activeLink) {
        activeLink.classList.add('active');
        const titleText = activeLink.textContent.trim();
        document.getElementById('page-title').innerText = titleText;
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });

      if (modId === 'mod-inventario') {
        renderInventoryPage();
      renderProdutosCatalog();
      }
    }

    function fmtBRL(val) {
      if (val === null || val === undefined || isNaN(val)) return 'R$ 0,00';
      return 'R$ ' + Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function fmtNum(val) {
      if (val === null || val === undefined || isNaN(val)) return '0,00';
      return Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function fmtInt(val) {
      if (val === null || val === undefined || isNaN(val)) return '0';
      return Math.round(Number(val)).toLocaleString('pt-BR');
    }
    function fmtPct(val) {
      if (val === null || val === undefined || isNaN(val)) return '0,00%';
      return Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    }

    // ========================================================
    // SISTEMA UNIVERSAL DE ORDENAÇÃO INTERATIVA (SEÇÕES 81-87)
    // ========================================================
    const CURVA_ORDER = { 'A': 1, 'B': 2, 'C': 3, 'X': 4, 'NOVO': 5, 'INATIVAR': 6 };
    const PRIO_ORDER = { 'CRÍTICO': 1, 'CRITICO': 1, 'ATENÇÃO': 2, 'ATENCAO': 2, 'PROGRAMADO': 3, 'SEM REPOSIÇÃO': 4, 'NORMAL': 5 };
    const START_ORDER = { 'AGORA': 1, 'ATRASADO': 1, 'START AGORA': 1, 'PROGRAMADO': 2, 'PRÓXIMO': 2, 'FUTURO': 3, 'ABASTECIDO': 4, 'OK': 4, 'EM DIA': 4, 'SUSPENSO': 5 };

    function parseRealValue(val) {
      if (val === null || val === undefined) return -Infinity;
      if (typeof val === 'number') return isNaN(val) ? -Infinity : val;
      let str = String(val).trim();
      if (!str || str === '-' || str === 'N/A' || str === 'NÃO INFORMADO') return -Infinity;

      if (CURVA_ORDER[str.toUpperCase()]) return CURVA_ORDER[str.toUpperCase()];
      if (PRIO_ORDER[str.toUpperCase()]) return PRIO_ORDER[str.toUpperCase()];
      if (START_ORDER[str.toUpperCase()]) return START_ORDER[str.toUpperCase()];
      if (str.toUpperCase().includes('SEM GIRO')) return 999999999;

      if (str.includes('R$')) {
        const c = str.replace(/[R$\s\.]/g, '').replace(',', '.');
        const num = parseFloat(c);
        if (!isNaN(num)) return num;
      }
      if (str.includes('%')) {
        const c = str.replace(/[%\s\.]/g, '').replace(',', '.');
        const num = parseFloat(c);
        if (!isNaN(num)) return num;
      }
      const dt = str.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})/);
      if (dt) {
        return new Date(parseInt(dt[3], 10), parseInt(dt[2], 10) - 1, parseInt(dt[1], 10)).getTime();
      }
      const numClean = str.replace(/[^\d,\.\-]/g, '').trim();
      if (numClean !== '') {
        if (numClean.includes(',') && !numClean.includes('.')) {
          const num = parseFloat(numClean.replace(',', '.'));
          if (!isNaN(num)) return num;
        } else if (numClean.includes('.') && numClean.includes(',')) {
          const num = parseFloat(numClean.replace(/\./g, '').replace(',', '.'));
          if (!isNaN(num)) return num;
        } else if (!numClean.includes(',')) {
          const num = parseFloat(numClean);
          if (!isNaN(num)) return num;
        }
      }
      return str.toLowerCase();
    }

    const tableSortStates = new Map();

    function initUniversalSorting(tableElem) {
      if (!tableElem) return;
      const ths = tableElem.querySelectorAll('thead th');
      const tableId = tableElem.id || ('table_' + Math.random().toString(36).substr(2, 9));
      tableElem.id = tableId;

      if (!tableSortStates.has(tableId)) {
        tableSortStates.set(tableId, { specs: [], initialRows: null });
      }

      ths.forEach((th, colIdx) => {
        if (th.classList.contains('no-sort')) return;
        if (!th.querySelector('.sort-indicator')) {
          const ind = document.createElement('span');
          ind.className = 'sort-indicator';
          ind.innerHTML = '↕';
          th.appendChild(ind);
        }

        th.onclick = function(e) {
          e.preventDefault();
          const isShift = e.shiftKey;
          handleTableSort(tableElem, colIdx, isShift);
        };
      });
    }

    function handleTableSort(tableElem, colIdx, isShift) {
      const tableId = tableElem.id;
      const state = tableSortStates.get(tableId);
      const tbody = tableElem.querySelector('tbody');
      if (!tbody) return;

      if (!state.initialRows) {
        state.initialRows = Array.from(tbody.querySelectorAll('tr'));
      }

      let specs = state.specs;
      const existingIdx = specs.findIndex(s => s.col === colIdx);

      if (!isShift) {
        if (existingIdx === -1) {
          specs = [{ col: colIdx, dir: 'asc' }];
        } else if (specs[existingIdx].dir === 'asc') {
          specs = [{ col: colIdx, dir: 'desc' }];
        } else {
          specs = [];
        }
      } else {
        if (existingIdx === -1) {
          specs.push({ col: colIdx, dir: 'asc' });
        } else if (specs[existingIdx].dir === 'asc') {
          specs[existingIdx].dir = 'desc';
        } else {
          specs.splice(existingIdx, 1);
        }
      }
      state.specs = specs;

      const ths = tableElem.querySelectorAll('thead th');
      ths.forEach((th, idx) => {
        th.classList.remove('sorted-asc', 'sorted-desc');
        const ind = th.querySelector('.sort-indicator');
        const specIdx = specs.findIndex(s => s.col === idx);
        if (specIdx !== -1) {
          const sp = specs[specIdx];
          th.classList.add(sp.dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
          const badge = specs.length > 1 ? `<span class="sort-priority-badge">${specIdx + 1}</span>` : '';
          const arrow = sp.dir === 'asc' ? '▲' : '▼';
          if (ind) ind.innerHTML = badge + arrow;
        } else {
          if (ind) ind.innerHTML = '↕';
        }
      });

      if (specs.length === 0) {
        tbody.innerHTML = '';
        state.initialRows.forEach(r => tbody.appendChild(r));
        return;
      }

      const rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort((rowA, rowB) => {
        for (let i = 0; i < specs.length; i++) {
          const sp = specs[i];
          const cellA = rowA.cells[sp.col] ? rowA.cells[sp.col].innerText.trim() : '';
          const cellB = rowB.cells[sp.col] ? rowB.cells[sp.col].innerText.trim() : '';
          const valA = parseRealValue(cellA);
          const valB = parseRealValue(cellB);

          if (valA === valB) continue;

          let res = 0;
          if (typeof valA === 'number' && typeof valB === 'number') {
            res = valA - valB;
          } else {
            res = String(valA).localeCompare(String(valB), 'pt-BR', { numeric: true });
          }
          return sp.dir === 'asc' ? res : -res;
        }
        return 0;
      });

      tbody.innerHTML = '';
      rows.forEach(r => tbody.appendChild(r));
    }

    // ========================================================
    // DRILL-DOWN MODAL ENGINE COM FILTRO INTEGRADO
    // ========================================================
    let currentDrilldownList = [];
    let currentFilteredDrilldownList = [];
    let currentDrilldownFilterContext = null;

    function renderDrilldownRows(list) {
      const tbody = document.getElementById('drilldown-tbody');
      if (!tbody) return;
      tbody.innerHTML = '';

      const maxRows = Math.min(list.length, 500);
      for (let i = 0; i < maxRows; i++) {
        const s = list[i];
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.title = 'Clique para ver a ficha técnica deste SKU';
        tr.onclick = function() { showSkuDetail(s[0]); };

        const prioBadge = s[18] === 'CRÍTICO' ? 'badge-danger' : (s[18] === 'ATENÇÃO' ? 'badge-warning' : 'badge-outline');
        const startBadge = s[35] === 'AGORA' || s[35] === 'ATRASADO' ? 'badge-danger' : (s[35] === 'PROGRAMADO' || s[35] === 'PRÓXIMO' ? 'badge-warning' : 'badge-outline');

        const cVal = (s[5] || 'C').toUpperCase();
        let badgeClass = 'badge-outline';
        if (cVal === 'A') badgeClass = 'badge-success';
        else if (cVal === 'B') badgeClass = 'badge-info';
        else if (cVal === 'C') badgeClass = 'badge-warning';
        else if (cVal === 'X') badgeClass = 'badge-danger';

        const estDisp = typeof s[10] === 'number' ? s[10] : parseFloat(s[10] || 0);
        const estColor = estDisp <= 0 ? 'text-danger font-bold' : '';

        const cobTxt = (typeof s[14] === 'number' && s[14] > 0) ? (fmtInt(s[14]) + ' d') : (s[14] || 'Sem giro');

        const capExcVal = parseFloat(s[19]) || 0;
        const capExcHtml = capExcVal > 0 
          ? `<strong style="color: #fbbf24; font-family: var(--font-mono); font-size: 12px;">${fmtBRL(capExcVal)}</strong>` 
          : `<span style="color: var(--text-dim);">-</span>`;

        tr.innerHTML = `
          <td><strong>${s[0]}</strong></td>
          <td><span style="font-family: var(--font-mono); font-weight: 700; color: #38bdf8; font-size: 11px;">${s[38] || '-'}</span></td>
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
        trMore.innerHTML = `<td colspan="13" class="text-center" style="color: var(--text-dim); padding: 12px;">+ ${list.length - 500} SKUs adicionais conciliados no totalizador acima. Clique no botão abaixo para ver todos no Módulo 20.</td>`;
        tbody.appendChild(trMore);
      }
    }

    function openDrilldownModal(title, subtitle, skuList, recLabel, filterContext) {
      currentDrilldownList = skuList || [];
      currentFilteredDrilldownList = currentDrilldownList;
      currentDrilldownFilterContext = filterContext || null;

      const elTitle = document.getElementById('modal-drilldown-title');
      if (elTitle) elTitle.innerText = title;
      const elSub = document.getElementById('modal-drilldown-sub');
      if (elSub) elSub.innerText = subtitle;
      const elCounter = document.getElementById('drilldown-counter');
      if (elCounter) elCounter.innerText = currentDrilldownList.length.toLocaleString('pt-BR') + ' registros';
      const elFooter = document.getElementById('drilldown-footer-reconciliation');
      if (elFooter) elFooter.innerText = recLabel || '';
      
      const searchInput = document.getElementById('drilldown-search-input');
      if (searchInput) searchInput.value = '';

      // Popular Dropdown de Marcas Dinamico
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

      const btnInv = document.getElementById('btn-drilldown-inv-filter');
      if (btnInv) {
        if (filterContext) {
          btnInv.style.display = 'inline-flex';
          btnInv.innerText = `🔍 Ver no Inventário Completo (${currentDrilldownList.length.toLocaleString('pt-BR')} SKUs)`;
        } else {
          btnInv.style.display = 'none';
        }
      }

      renderDrilldownRows(currentDrilldownList);
      
      const dm = document.getElementById('drilldown-modal');
      if (dm) {
        dm.classList.add('active');
        dm.style.display = 'flex';
      }

      const tbl = document.getElementById('table-drilldown');
      if (tbl && typeof initUniversalSorting === 'function') {
        initUniversalSorting(tbl);
      }
    }

    function closeDrilldownModal() {
      var el = document.getElementById('drilldown-modal');
      if (el) { el.classList.remove('active'); el.style.display = 'none'; }
    }

    function applyDrilldownAsInventoryFilter() {
      const list = currentFilteredDrilldownList || currentDrilldownList || [];
      if (!list.length) {
        closeDrilldownModal();
        switchModule('mod-inventario');
        return;
      }
      const ids = list.map(s => s[0]);
      resetGlobalFilters(false);
      activeFilters.customIds = ids;
      activeFilters.customIdsSet = new Set(ids);
      updateFilterTags();
      filteredInvList = getFilteredSkus();
      currentInvPage = 1;
      renderInventoryPage();
      closeDrilldownModal();
      switchModule('mod-inventario');
    }

    function toggleDrilldownFullscreen() {
      const box = document.getElementById('drilldown-modal-box');
      const btn = document.getElementById('btn-toggle-drilldown-fs');
      if (!box) return;
      if (box.classList.contains('fullscreen')) {
        box.classList.remove('fullscreen');
        box.style.width = '98vw';
        box.style.maxWidth = '1820px';
        box.style.height = '95vh';
        box.style.maxHeight = '95vh';
        box.style.borderRadius = '14px';
        if (btn) btn.innerHTML = '⛶ Tela Cheia';
      } else {
        box.classList.add('fullscreen');
        box.style.width = '100vw';
        box.style.maxWidth = '100vw';
        box.style.height = '100vh';
        box.style.maxHeight = '100vh';
        box.style.borderRadius = '0';
        if (btn) btn.innerHTML = '🗗 Restaurar';
      }
    }

    function applyDrilldownMultiFilter() {
      const term = (document.getElementById('drilldown-search-input')?.value || '').toLowerCase().trim();
      const selMarca = document.getElementById('drilldown-filter-marca')?.value || '';
      const selCurva = document.getElementById('drilldown-filter-curva')?.value || '';

      let filtered = currentDrilldownList || [];
      if (selMarca) {
        filtered = filtered.filter(s => s[2] === selMarca);
      }
      if (selCurva) {
        filtered = filtered.filter(s => (s[5] || '').toUpperCase() === selCurva.toUpperCase());
      }
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
      const totalQtd = filtered.reduce((acc, s) => acc + (parseFloat(s[16]) || 0), 0);
      const recEl = document.getElementById('drilldown-footer-reconciliation');
      if (recEl) {
        recEl.innerHTML = `Filtrados: <strong>${filtered.length.toLocaleString('pt-BR')} SKUs</strong> | Itens a Comprar: <strong>${fmtNum(totalQtd)}</strong> | Investimento: <strong style="color: #34d399;">${fmtBRL(totalInvest)}</strong>`;
      }
    }

    function resetDrilldownFilters() {
      if (document.getElementById('drilldown-search-input')) document.getElementById('drilldown-search-input').value = '';
      if (document.getElementById('drilldown-filter-marca')) document.getElementById('drilldown-filter-marca').value = '';
      if (document.getElementById('drilldown-filter-curva')) document.getElementById('drilldown-filter-curva').value = '';
      applyDrilldownMultiFilter();
    }

    function exportDrilldownToCSV() {
      const list = currentFilteredDrilldownList || currentDrilldownList || [];
      if (!list.length) {
        alert('Nenhum registro para exportar.');
        return;
      }

      const rawTitle = document.getElementById('modal-drilldown-title')?.innerText || 'analise_skus';
      const cleanTitle = rawTitle.replace(/[^a-zA-Z0-9_-]/g, '_');
      
      const headers = [
        'ID', 'Ref_Fabrica', 'Descricao', 'Marca_Fabricante', 'Equipamento',
        'Curva_Qtd', 'Estoque_Fisico', 'Estoque_Disponivel', 'Custo_Medio', 'Valor_Estoque',
        'Valor_Excedente_R$', 'DMD_Ajustada', 'Dias_Estoque', 'Compra_Sugerida', 'Investimento_Compra',
        'Prioridade', 'Start_Status', 'Data_Start', 'Faturamento_Liquido', 'Margem_Bruta', 'Aplicacao'
      ];

      const rows = [headers.join(';')];

      list.forEach(s => {
        const row = [
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
          `"${s[35]}"`,
          `"${s[33]}"`,
          String(s[24] || 0).replace('.', ','),
          String(s[25] || 0).replace('.', ','),
          `"${String(s[39] || '').replace(/"/g, '""')}"`
        ];
        rows.push(row.join(';'));
      });

      const csvContent = '﻿' + rows.join(String.fromCharCode(13, 10));
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${cleanTitle}_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    function printDrilldown() {
      const list = currentFilteredDrilldownList || currentDrilldownList || [];
      if (!list.length) {
        alert('Nenhum registro para imprimir.');
        return;
      }

      const title = document.getElementById('modal-drilldown-title')?.innerText || 'Auditoria Analítica';
      const subtitle = document.getElementById('modal-drilldown-sub')?.innerText || '';
      const recInfo = document.getElementById('drilldown-footer-reconciliation')?.innerText || '';
      const selMarca = document.getElementById('drilldown-filter-marca')?.value;
      const filterInfo = selMarca ? `Filtro Marca: ${selMarca}` : 'Todas as Marcas';

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
            h2 { margin: 0 0 4px 0; color: #0f172a; }
            p { margin: 2px 0; color: #475569; font-size: 12px; }
            .header-box { border-bottom: 2px solid #0284c7; padding-bottom: 10px; margin-bottom: 12px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10px; }
            th, td { border: 1px solid #cbd5e1; padding: 5px 7px; }
            th { background: #f1f5f9; font-weight: 700; text-align: left; }
            tr:nth-child(even) { background: #f8fafc; }
            @media print {
              @page { size: landscape; margin: 10mm; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header-box">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <h2>CENTRAL PEÇAS — ${title}</h2>
                <p>${subtitle}</p>
                <p style="font-weight: 600; margin-top: 4px;">${recInfo} | ${filterInfo} | Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
              </div>
              <button onclick="window.print()" style="padding: 8px 18px; background: #0284c7; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">Imprimir Agora</button>
            </div>
          </div>
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
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </body>
        </html>
      `);
      printWin.document.close();
    }

    function filterDrilldownTable(term) {
      applyDrilldownMultiFilter();
    }

    // ========================================================
    // HANDLERS ESPECÍFICOS DE DRILL-DOWN COM RECONCILIAÇÃO
    // ========================================================
    function drilldownPerfil(codePrefix) {
      codePrefix = codePrefix.split(' ')[0].trim(); // 'S1', 'S2', 'S3', 'S4', 'S5', 'S7', 'S8'
      const skus = window.COMPACT_SKUS.filter(s => s[37] && s[37].startsWith(codePrefix));
      const totalEst = skus.reduce((sum, s) => sum + (s[12] || 0), 0);
      const totalFat = skus.reduce((sum, s) => sum + (s[24] || 0), 0);
      const totalComp = skus.reduce((sum, s) => sum + (s[17] || 0), 0);

      const profileNames = {
        'S1': 'S1 — PLANTIO (28 SKUs)',
        'S2': 'S2 — PULVERIZAÇÃO / TRATOS (161 SKUs)',
        'S3': 'S3 — COLHEITA (596 SKUs)',
        'S4': 'S4 — PREPARO / IMPLEMENTOS (128 SKUs)',
        'S5': 'S5 — TRATOR / USO CONTÍNUO (541 SKUs)',
        'S7': 'S7 — CONSUMO RECORRENTE (4.320 SKUs)',
        'S8': 'S8 — NÃO IDENTIFICADO (4.881 SKUs)'
      };

      const fullName = profileNames[codePrefix] || codePrefix;

      openDrilldownModal(
        `🌾 Perfil Sazonal: ${fullName}`,
        `Detalhamento exclusivo dos produtos classificados nesta categoria sazonal.`,
        skus,
        `Reconciliação Exata: ${skus.length.toLocaleString('pt-BR')} SKUs | Estoque: ${fmtBRL(totalEst)} | Fat. 3 Anos: ${fmtBRL(totalFat)} | Compra Sugerida: ${fmtBRL(totalComp)}`,
        { type: 'perfil', value: codePrefix, label: `PERFIL: ${codePrefix}` }
      );
    }

    function drilldownStartHorizonte(hz) {
      const baseList = typeof getFilteredSkus === 'function' ? getFilteredSkus() : window.COMPACT_SKUS;
      let skus = baseList.filter(s => s[40] === hz);
      if (hz === 'START AGORA') {
        skus = skus.filter(s => (parseFloat(s[13]) > 0 || parseFloat(s[24]) > 0) && (parseFloat(s[16]) > 0 || parseFloat(s[17]) > 0));
      }
      const totalInv = skus.reduce((sum, s) => sum + (parseFloat(s[17]) || 0), 0);
      const totalQtd = skus.reduce((sum, s) => sum + (parseFloat(s[16]) || 0), 0);

      openDrilldownModal(
        `⚡ Horizonte de Compra: ${hz}`,
        `Cronograma de abastecimento da janela ${hz}.`,
        skus,
        `Total Auditado: ${skus.length.toLocaleString('pt-BR')} SKUs | Itens a Comprar: ${fmtNum(totalQtd)} | Investimento: ${fmtBRL(totalInv)}`,
        { type: 'start', value: hz, label: `START: ${hz}` }
      );
    }

    function drilldownStartAgora() {
      drilldownStartHorizonte('START AGORA');
    }

    function drilldownRupturas() {
      const baseList = typeof getFilteredSkus === 'function' ? getFilteredSkus() : window.COMPACT_SKUS;
      const skus = baseList.filter(s => (s[28] === 1 || parseFloat(s[10]) <= 0) && (parseFloat(s[13]) > 0 || parseFloat(s[16]) > 0));
      const ids = skus.map(s => s[0]);
      openDrilldownModal(
        "⚠️ Rupturas Comerciais Reais (Demanda Ativa com Estoque &le; 0)",
        "Itens com saída comercial recente e falta de produto imediata no centro de distribuição.",
        skus,
        `Total Auditado: ${skus.length.toLocaleString('pt-BR')} SKUs em ruptura confirmada com giro`,
        { type: 'customIds', value: ids, label: 'RUPTURAS REAIS' }
      );
    }

    function drilldownZerados() {
      const baseList = typeof getFilteredSkus === 'function' ? getFilteredSkus() : window.COMPACT_SKUS;
      const skus = baseList.filter(s => s[29] === 1 || parseFloat(s[9]) === 0);
      const ids = skus.map(s => s[0]);
      openDrilldownModal(
        "0️⃣ Produtos Fisicamente Zerados (Estoque = 0)",
        "SKUs com saldo de estoque físico nulo no cadastro.",
        skus,
        `Total Auditado: ${skus.length.toLocaleString('pt-BR')} SKUs com saldo zero`,
        { type: 'customIds', value: ids, label: 'ZERADOS' }
      );
    }

    function drilldownCurvaX() {
      const baseList = typeof getFilteredSkus === 'function' ? getFilteredSkus() : window.COMPACT_SKUS;
      const skus = baseList.filter(s => s[5] === 'X' || (parseFloat(s[20]) || 0) > 0).sort((a, b) => (parseFloat(b[20]) || 0) - (parseFloat(a[20]) || 0));
      const totalX = skus.reduce((sum, s) => sum + (parseFloat(s[20]) || 0), 0);
      openDrilldownModal(
        "🛑 Curva X: Capital Sem Giro (&gt; 90 dias sem vendas)",
        "Itens com estoque positivo e nenhuma saída nos últimos 90 dias.",
        skus,
        `Total Auditado: ${skus.length.toLocaleString('pt-BR')} SKUs X | Capital Sem Giro: ${fmtBRL(totalX)}`,
        { type: 'curva', value: 'X', label: 'CURVA: X' }
      );
    }

    function drilldownExcesso() {
      const baseList = typeof getFilteredSkus === 'function' ? getFilteredSkus() : window.COMPACT_SKUS;
      // Filtra estritamente os SKUs com Capital Excedente > 0 para coincidir 100% com o valor do card
      const skus = baseList.filter(s => (parseFloat(s[19]) || 0) > 0).sort((a, b) => (parseFloat(b[19]) || 0) - (parseFloat(a[19]) || 0));
      const totalExc = skus.reduce((sum, s) => sum + (parseFloat(s[19]) || 0), 0);
      const ids = skus.map(s => s[0]);
      openDrilldownModal(
        "🔺 Capital Excedente (A/B/C)",
        "SKUs com estoque acima de 2x o alvo da curva (capital excedente em depósito).",
        skus,
        `Total Auditado: ${skus.length.toLocaleString('pt-BR')} SKUs com excesso | Capital Excedente: ${fmtBRL(totalExc)}`,
        { type: 'customIds', value: ids, label: 'EXCESSO DE ESTOQUE' }
      );
    }

    function drilldownSugestaoCompra() {
      const baseList = typeof getFilteredSkus === 'function' ? getFilteredSkus() : window.COMPACT_SKUS;
      const skus = baseList.filter(s => (parseFloat(s[17]) || 0) > 0 || (parseFloat(s[16]) || 0) > 0).sort((a, b) => (parseFloat(b[17]) || 0) - (parseFloat(a[17]) || 0));
      const totalComp = skus.reduce((sum, s) => sum + (parseFloat(s[17]) || 0), 0);
      const ids = skus.map(s => s[0]);
      openDrilldownModal(
        "🛒 Sugestão Consolidada de Compras",
        "Itens que necessitam de reposição para atendimento da demanda e segurança.",
        skus,
        `Total Auditado: ${skus.length.toLocaleString('pt-BR')} SKUs | Investimento Sugerido: ${fmtBRL(totalComp)}`,
        { type: 'customIds', value: ids, label: 'COMPRA SUGERIDA' }
      );
    }

    function drilldownEstoqueTotal() {
      const baseList = typeof getFilteredSkus === 'function' ? getFilteredSkus() : window.COMPACT_SKUS;
      const totalVal = baseList.reduce((sum, s) => sum + (parseFloat(s[12]) || 0), 0);
      openDrilldownModal(
        "🏬 Estoque Físico Consolidado",
        "Auditoria dos SKUs em estoque.",
        baseList,
        `Total: ${baseList.length.toLocaleString('pt-BR')} SKUs | Valor Total: ${fmtBRL(totalVal)}`
      );
    }

    function drilldownAllSales() {
      const baseList = typeof getFilteredSkus === 'function' ? getFilteredSkus() : window.COMPACT_SKUS;
      const skus = baseList.filter(s => (parseFloat(s[24]) || 0) > 0);
      const totalFat = skus.reduce((sum, s) => sum + (parseFloat(s[24]) || 0), 0);
      const ids = skus.map(s => s[0]);
      openDrilldownModal(
        "💰 Faturamento Líquido de Produtos",
        "SKUs com saídas comerciais nos 3 anos analisados.",
        skus,
        `Total Auditado: ${skus.length.toLocaleString('pt-BR')} SKUs faturados | Total Líquido: ${fmtBRL(totalFat)}`,
        { type: 'customIds', value: ids, label: 'FATURAMENTO ATIVO' }
      );
    }

    function drilldownMargem() {
      const baseList = typeof getFilteredSkus === 'function' ? getFilteredSkus() : window.COMPACT_SKUS;
      const skus = baseList.filter(s => (parseFloat(s[25]) || 0) > 0);
      const totalMargem = skus.reduce((sum, s) => sum + (parseFloat(s[25]) || 0), 0);
      const ids = skus.map(s => s[0]);
      openDrilldownModal(
        "📈 Margem Bruta Consolidada",
        "SKUs geradores de margem positiva.",
        skus,
        `Total Auditado: ${skus.length.toLocaleString('pt-BR')} SKUs | Margem Total: ${fmtBRL(totalMargem)}`,
        { type: 'customIds', value: ids, label: 'MARGEM POSITIVA' }
      );
    }

    function drilldownMarca(marca) {
      const skus = window.COMPACT_SKUS.filter(s => s[2] === marca);
      const val = skus.reduce((sum, s) => sum + (s[12] || 0), 0);
      openDrilldownModal(
        `🏷️ Marca: ${marca}`,
        `Detalhamento completo dos produtos do fabricante ${marca}.`,
        skus,
        `Total: ${skus.length.toLocaleString('pt-BR')} SKUs | Estoque da Marca: ${fmtBRL(val)}`,
        { type: 'marca', value: marca, label: `MARCA: ${marca}` }
      );
    }

    function drilldownMarcaXByIndex(idx) {
      const m = window.SUMMARY_DATA.marcas_x_top30[idx];
      if (!m) return;
      const idsSet = new Set(m.SKU_IDs || []);
      const skus = window.COMPACT_SKUS.filter(s => idsSet.has(s[0]));
      openDrilldownModal(
        `🛑 Curva X - Marca: ${m.Marca}`,
        `Produtos sem giro há mais de 90 dias da marca ${m.Marca}.`,
        skus,
        `Total: ${skus.length.toLocaleString('pt-BR')} SKUs X | Capital Sem Giro: ${fmtBRL(m.Capital_X)}`,
        { type: 'customIds', value: m.SKU_IDs, label: `CURVA X: ${m.Marca}` }
      );
    }

    function drilldownCurva(curva) {
      const cleanCurva = curva.startsWith('X') ? 'X' : curva;
      const skus = window.COMPACT_SKUS.filter(s => {
        if (cleanCurva === 'X') return s[5] === 'X' || s[20] > 0;
        return s[5] === cleanCurva;
      });
      openDrilldownModal(
        `🔤 Produtos Curva ${cleanCurva}`,
        `Auditoria dos SKUs enquadrados na Curva ${cleanCurva}.`,
        skus,
        `Total: ${skus.length.toLocaleString('pt-BR')} SKUs na Curva ${cleanCurva}`,
        { type: 'curva', value: cleanCurva, label: `CURVA: ${cleanCurva}` }
      );
    }

    function drilldownEquipamento(eq) {
      const skus = window.COMPACT_SKUS.filter(s => {
        const peq = (s[36] || '').split(' / ')[0];
        return peq === eq || (s[36] || '').startsWith(eq);
      });
      openDrilldownModal(
        `🚜 Equipamento: ${eq}`,
        `Peças e componentes utilizados em ${eq}.`,
        skus,
        `Total: ${skus.length.toLocaleString('pt-BR')} SKUs vinculados a ${eq}`,
        { type: 'equip', value: eq, label: `EQUIPAMENTO: ${eq}` }
      );
    }

    function drilldownAplicacaoByIndex(idx) {
      const ap = window.SUMMARY_DATA.aplicacoes_top30[idx];
      if (!ap) return;
      const idsSet = new Set(ap.SKU_IDs || []);
      const skus = window.COMPACT_SKUS.filter(s => idsSet.has(s[0]));
      openDrilldownModal(
        `⚙️ Aplicação: ${ap.Aplicacao.substr(0, 45)}`,
        `SKUs compatíveis com a aplicação selecionada.`,
        skus,
        `Total: ${skus.length.toLocaleString('pt-BR')} SKUs compatíveis | Estoque: ${fmtBRL(ap.Estoque_Valor)}`,
        { type: 'customIds', value: ap.SKU_IDs, label: `APLICAÇÃO: ${ap.Aplicacao.substr(0, 20)}` }
      );
    }

    function drilldownVendedor(vendName) {
      const v = (window.SUMMARY_DATA.vendedores || []).find(item => item.Vendedor === vendName);
      if (!v) return;

      const clientsQueda = (window.SUMMARY_DATA.clientes_queda_top30 || []).filter(c => c.Vendedor === vendName);
      const clientsReativ = (window.SUMMARY_DATA.clientes_reativacao_top30 || []).filter(c => c.Vendedor === vendName);

      let clientListHtml = '';
      [...clientsQueda, ...clientsReativ].slice(0, 10).forEach(c => {
        clientListHtml += `<li><strong>${c.NomeCliente}</strong> (${c.Cidade || ''}-${c.UF || ''}) — Fat: ${fmtBRL(c.Fat_Atual_90d || c.Faturamento_Total)}</li>`;
      });

      const body = document.getElementById('sku-modal-body');
      body.innerHTML = `
        <div class="panel" style="margin-bottom: 12px;">
          <div class="panel-title" style="color: #60a5fa; margin-bottom: 8px;">Desempenho Comercial: ${v.Vendedor}</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px;">
            <p><strong>Faturamento Bruto:</strong> ${fmtBRL(v.Fat_Bruto)}</p>
            <p><strong>Devoluções:</strong> <span class="text-danger">${fmtBRL(v.Devolucoes)}</span></p>
            <p><strong>Faturamento Líquido:</strong> <strong class="text-success">${fmtBRL(v.Fat_Liq)}</strong></p>
            <p><strong>Margem Bruta:</strong> ${fmtBRL(v.Margem_R$)} (${fmtPct(v.Margem_Pct)})</p>
            <p><strong>Clientes Atendidos:</strong> ${fmtInt(v.Clientes)}</p>
            <p><strong>Mix de SKUs Distintos:</strong> ${fmtInt(v.SKUs_Distintos)}</p>
            <p><strong>Ticket Médio:</strong> ${fmtBRL(v.Ticket_Medio)}</p>
            <p><strong>Score Ponderado:</strong> <span class="score-badge score-high">${v.Score.toFixed(1)} / 100</span></p>
          </div>
        </div>

        <div class="panel" style="margin-bottom: 0;">
          <div class="panel-title" style="color: #fbbf24; margin-bottom: 8px;">Clientes em Monitoramento deste Vendedor</div>
          ${ clientListHtml ? `<ul style="margin-left: 20px; font-size: 12px; line-height: 1.6;">${clientListHtml}</ul>` : '<p style="color: var(--text-dim);">Nenhum cliente crítico deste vendedor na lista de churn.</p>' }
        </div>
      `;

      document.getElementById('sku-modal-title').innerText = `Vendedor: ${v.Vendedor}`;
      var sm = document.getElementById('sku-modal');
      if (sm) {
        sm.style.removeProperty('display');
        sm.style.setProperty('display', 'flex', 'important');
        sm.style.setProperty('z-index', '1060', 'important');
        sm.classList.add('active');
      }
    }

    function drilldownCliente(cliName) {
      const c = [...(window.SUMMARY_DATA.clientes_queda_top30 || []), ...(window.SUMMARY_DATA.clientes_reativacao_top30 || [])].find(item => item.NomeCliente === cliName);
      if (!c) return;

      const body = document.getElementById('sku-modal-body');
      body.innerHTML = `
        <div class="panel" style="margin-bottom: 12px;">
          <div class="panel-title" style="color: #60a5fa; margin-bottom: 8px;">Ficha do Cliente: ${c.NomeCliente}</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px;">
            <p><strong>Vendedor Responsável:</strong> ${c.Vendedor}</p>
            <p><strong>Localidade:</strong> ${c.Cidade || 'N/I'} - ${c.UF || 'N/I'}</p>
            <p><strong>Faturamento Anterior (90d):</strong> ${fmtBRL(c.Fat_Anterior_90d)}</p>
            <p><strong>Faturamento Recente (90d):</strong> ${fmtBRL(c.Fat_Atual_90d)}</p>
            <p><strong>Variação / Queda:</strong> <span class="text-danger"><strong>${fmtBRL(c.Diff_R$)} (${fmtPct(c.Diff_Pct)})</strong></span></p>
            <p><strong>Dias sem Comprar:</strong> ${c.Dias_Sem_Comprar} dias</p>
            <p><strong>Última Compra:</strong> ${c.Ultima_Compra}</p>
            <p><strong>Status da Conta:</strong> <span class="badge badge-warning">${c.Status_Cliente || 'MONITORAMENTO'}</span></p>
          </div>
        </div>

        <div class="panel" style="margin-bottom: 0;">
          <div class="panel-title" style="color: #34d399; margin-bottom: 8px;">Marcas Compradas & Histórico</div>
          <p style="font-size: 12px;">${c.Marcas_Compradas || 'FC, V.V, MULTIBELT, BELLOTA'}</p>
          <div style="margin-top: 10px;">
            <button class="btn btn-primary btn-sm" onclick="closeSkuModal(); switchModule('mod-inventario');">Ver Produtos no Inventário</button>
          </div>
        </div>
      `;

      document.getElementById('sku-modal-title').innerText = `Cliente: ${c.NomeCliente}`;
      var sm = document.getElementById('sku-modal');
      if (sm) {
        sm.style.removeProperty('display');
        sm.style.setProperty('display', 'flex', 'important');
        sm.style.setProperty('z-index', '1060', 'important');
        sm.classList.add('active');
      }
    }

    function drilldownClientesGeral() {
      const clients = [...(window.SUMMARY_DATA.clientes_queda_top30 || []), ...(window.SUMMARY_DATA.clientes_reativacao_top30 || [])];
      let html = `<table class="data-table"><thead><tr><th>Cliente</th><th>Vendedor</th><th>Fat. Recente</th><th>Queda R$</th><th>Última Compra</th><th>Ação</th></tr></thead><tbody>`;
      clients.forEach(c => {
        html += `<tr>
          <td><strong>${c.NomeCliente}</strong></td>
          <td>${c.Vendedor}</td>
          <td class="text-right">${fmtBRL(c.Fat_Atual_90d || c.Faturamento_Total)}</td>
          <td class="text-right text-danger">${fmtBRL(c.Diff_R$ || 0)}</td>
          <td class="text-center">${c.Ultima_Compra}</td>
          <td class="text-center"><button class="btn btn-sm btn-outline" onclick="drilldownCliente('${c.NomeCliente.replace("'", "\\'") }')">Ver Detalhe</button></td>
        </tr>`;
      });
      html += `</tbody></table>`;

      const body = document.getElementById('sku-modal-body');
      body.innerHTML = html;
      document.getElementById('sku-modal-title').innerText = "Carteira de Clientes Prioritários";
      var sm = document.getElementById('sku-modal');
      if (sm) {
        sm.style.removeProperty('display');
        sm.style.setProperty('display', 'flex', 'important');
        sm.style.setProperty('z-index', '1060', 'important');
        sm.classList.add('active');
      }
    }

    function drilldownDevolucaoMotivo(motivo) {
      const m = (window.SUMMARY_DATA.devolucoes_motivos || []).find(item => item.Operacao === motivo);
      if (!m) return;

      const body = document.getElementById('sku-modal-body');
      body.innerHTML = `
        <div class="panel">
          <div class="panel-title" style="color: #f87171; margin-bottom: 8px;">Motivo: ${m.Operacao}</div>
          <p><strong>Total de Ocorrências:</strong> ${fmtInt(m.Ocorrencias)}</p>
          <p><strong>Volume Devolvido:</strong> ${fmtNum(m.Qtd)} itens</p>
          <p><strong>Valor Financeiro Devolvido:</strong> <span class="text-danger"><strong>${fmtBRL(m.Valor)}</strong></span></p>
          <p style="margin-top: 10px; font-size: 12px; color: var(--text-muted);">
            Esta operação abateu diretamente o faturamento comercial e o estoque líquido da Central Peças.
          </p>
        </div>
      `;
      document.getElementById('sku-modal-title').innerText = `Devolução: ${m.Operacao}`;
      var sm = document.getElementById('sku-modal');
      if (sm) {
        sm.style.removeProperty('display');
        sm.style.setProperty('display', 'flex', 'important');
        sm.style.setProperty('z-index', '1060', 'important');
        sm.classList.add('active');
      }
    }

    function drilldownDevolucaoVendedor(vend) {
      const v = (window.SUMMARY_DATA.devolucoes_vendedores || []).find(item => item.Vendedor === vend);
      if (!v) return;

      const body = document.getElementById('sku-modal-body');
      body.innerHTML = `
        <div class="panel">
          <div class="panel-title" style="color: #f87171; margin-bottom: 8px;">Devoluções de: ${v.Vendedor}</div>
          <p><strong>Faturamento Bruto:</strong> ${fmtBRL(v.FatBruto)}</p>
          <p><strong>Valor Devolvido:</strong> <span class="text-danger"><strong>${fmtBRL(v.ValorDevolvido)}</strong></span></p>
          <p><strong>Taxa de Devolução (% Fat):</strong> <span class="text-danger"><strong>${fmtPct(v.Pct_Devolucao)}</strong></span></p>
          <p><strong>Ocorrências Registradas:</strong> ${fmtInt(v.Ocorrencias)}</p>
        </div>
      `;
      document.getElementById('sku-modal-title').innerText = `Devoluções de ${v.Vendedor}`;
      var sm = document.getElementById('sku-modal');
      if (sm) {
        sm.style.removeProperty('display');
        sm.style.setProperty('display', 'flex', 'important');
        sm.style.setProperty('z-index', '1060', 'important');
        sm.classList.add('active');
      }
    }

    // ========================================================
    // FICHA TÉCNICA COMPLETA DO SKU (SEÇÃO 93)
    // ========================================================
    function showSkuDetail(skuId) {
      const s = window.COMPACT_SKUS.find(item => String(item[0]) === String(skuId));
      if (!s) return;

      // Color and badge for Curva
      const cVal = (s[5] || 'C').toUpperCase();
      let curvaStyle = 'background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); color: #34d399;';
      if (cVal === 'B') {
        curvaStyle = 'background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.35); color: #38bdf8;';
      } else if (cVal === 'C') {
        curvaStyle = 'background: rgba(251, 191, 36, 0.15); border: 1px solid rgba(251, 191, 36, 0.35); color: #fbbf24;';
      } else if (cVal === 'X') {
        curvaStyle = 'background: rgba(248, 113, 113, 0.15); border: 1px solid rgba(248, 113, 113, 0.35); color: #f87171;';
      }
      const curvaBadge = `<span style="display: inline-block; padding: 2px 10px; border-radius: 9999px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; ${curvaStyle}">CURVA ${cVal}</span>`;

      // Status of Estoque Disponivel
      const estDispVal = typeof s[10] === 'number' ? s[10] : parseFloat(s[10] || 0);
      const estDispColor = estDispVal <= 0 ? '#f87171' : '#ffffff';

      // Status of Cobertura de Estoque
      let cobTxt = 'Sem giro';
      if (typeof s[14] === 'number' && s[14] > 0) {
        cobTxt = fmtInt(s[14]) + ' dias';
      } else if (s[14] && s[14] !== 'SEM GIRO' && s[14] !== 'Sem giro') {
        cobTxt = String(s[14]);
      }

      // Sugestão de Compra
      const sugQtd = typeof s[16] === 'number' ? s[16] : parseFloat(s[16] || 0);
      const sugInv = typeof s[17] === 'number' ? s[17] : parseFloat(s[17] || 0);
      const sugTxt = `${fmtNum(sugQtd)} un (${fmtBRL(sugInv)})`;

      // Capital Excedente e Sem Giro
      const capExc = typeof s[19] === 'number' ? s[19] : parseFloat(s[19] || 0);
      const capX = typeof s[20] === 'number' ? s[20] : parseFloat(s[20] || 0);

      const body = document.getElementById('sku-modal-body');
      body.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 12px;">
          <!-- 1: MARCA / FABRICANTE -->
          <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 8px; padding: 12px 14px;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 6px;">MARCA / FABRICANTE</div>
            <div style="font-size: 15px; font-weight: 800; color: #ffffff;">${s[2] || 'NÃO INFORMADO'}</div>
          </div>

          <!-- 2: CURVA QUANTIDADE -->
          <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 8px; padding: 12px 14px;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 6px;">CURVA QUANTIDADE</div>
            <div>${curvaBadge}</div>
          </div>

          <!-- 3: ESTOQUE DISPONÍVEL -->
          <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 8px; padding: 12px 14px;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 6px;">ESTOQUE DISPONÍVEL</div>
            <div style="font-size: 15px; font-weight: 800; color: ${estDispColor};">${fmtNum(s[10])} un</div>
          </div>

          <!-- 4: CUSTO MÉDIO REAL -->
          <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 8px; padding: 12px 14px;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 6px;">CUSTO MÉDIO REAL</div>
            <div style="font-size: 15px; font-weight: 800; color: #ffffff;">${fmtBRL(s[11])}</div>
          </div>

          <!-- 5: VALOR EM ESTOQUE -->
          <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 8px; padding: 12px 14px;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 6px;">VALOR EM ESTOQUE</div>
            <div style="font-size: 15px; font-weight: 800; color: #ffffff;">${fmtBRL(s[12])}</div>
          </div>

                    <!-- 6: DEMANDA DIÁRIA (DMD) - INTERATIVO AUDITÁVEL -->
          <div onclick="event.stopPropagation(); openDmdDetailModal(\'${s[0]}\')" 
               style="background: #111a2e; border: 1px solid #2563eb; border-radius: 8px; padding: 12px 14px; cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); position: relative; box-shadow: 0 0 12px rgba(37, 99, 235, 0.15);"
               onmouseover="this.style.background='#162544'; this.style.borderColor='#38bdf8'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 16px rgba(56, 189, 248, 0.3)';"
               onmouseout="this.style.background='#111a2e'; this.style.borderColor='#2563eb'; this.style.transform='none'; this.style.boxShadow='0 0 12px rgba(37, 99, 235, 0.15)';"
               title="Clique para abrir a memória de cálculo e os dados completos que compõem a Demanda Diária">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #38bdf8; letter-spacing: 0.5px;">DEMANDA DIÁRIA (DMD)</span>
              <span style="font-size: 9px; background: rgba(56, 189, 248, 0.18); color: #38bdf8; padding: 2px 6px; border-radius: 4px; font-weight: 800; border: 1px solid rgba(56, 189, 248, 0.4); display: flex; align-items: center; gap: 3px;">
                <span>🔍</span><span>VER CÁLCULO</span>
              </span>
            </div>
            <div style="display: flex; align-items: baseline; justify-content: space-between;">
              <div style="font-size: 16px; font-weight: 800; color: #ffffff;">${fmtNum(s[13])} <span style="font-size: 12px; color: #94a3b8; font-weight: 500;">un/dia</span></div>
              <span style="font-size: 11px; color: #38bdf8; font-weight: 600;">90 dias ➔</span>
            </div>
          </div>

          <!-- 7: COBERTURA DE ESTOQUE -->
          <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 8px; padding: 12px 14px;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 6px;">COBERTURA DE ESTOQUE</div>
            <div style="font-size: 15px; font-weight: 800; color: #ffffff;">${cobTxt}</div>
          </div>

          <!-- 8: SUGESTÃO DE COMPRA -->
          <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 8px; padding: 12px 14px;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 6px;">SUGESTÃO DE COMPRA</div>
            <div style="font-size: 15px; font-weight: 800; color: #38bdf8;">${sugTxt}</div>
          </div>

          <!-- 9: CAPITAL EXCEDENTE -->
          <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 8px; padding: 12px 14px;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 6px;">CAPITAL EXCEDENTE</div>
            <div style="font-size: 15px; font-weight: 800; color: #fbbf24;">${fmtBRL(capExc)}</div>
          </div>

          <!-- 10: CAPITAL SEM GIRO (X) -->
          <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 8px; padding: 12px 14px;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 6px;">CAPITAL SEM GIRO (X)</div>
            <div style="font-size: 15px; font-weight: 800; color: #f87171;">${fmtBRL(capX)}</div>
          </div>

          <!-- 11: FATURAMENTO LÍQUIDO -->
          <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 8px; padding: 12px 14px;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 6px;">FATURAMENTO LÍQUIDO</div>
            <div style="font-size: 15px; font-weight: 800; color: #ffffff;">${fmtBRL(s[24])}</div>
          </div>

          <!-- 12: MARGEM BRUTA (R$) -->
          <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 8px; padding: 12px 14px;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 6px;">MARGEM BRUTA (R$)</div>
            <div style="font-size: 15px; font-weight: 800; color: #34d399;">${fmtBRL(s[25])}</div>
          </div>
        </div>

        <!-- DETALHES TÉCNICOS & APLICAÇÃO -->
        <div style="background: #0e1628; border: 1px solid #1a253e; border-radius: 8px; padding: 10px 14px; font-size: 11px; color: #94a3b8; display: flex; flex-direction: column; gap: 6px;">
          <div style="display: flex; flex-wrap: wrap; gap: 16px; justify-content: space-between;">
            <div><span style="color: #64748b; font-weight: 700; text-transform: uppercase;">Cód. Fabricante:</span> <strong style="color: #e2e8f0;">${s[38] || '-'}</strong></div>
            <div><span style="color: #64748b; font-weight: 700; text-transform: uppercase;">Equipamento:</span> <strong style="color: #e2e8f0;">${s[36] || '-'}</strong></div>
            <div><span style="color: #64748b; font-weight: 700; text-transform: uppercase;">Perfil Sazonal:</span> <strong style="color: #e2e8f0;">${s[37] || '-'}</strong></div>
            <div><span style="color: #64748b; font-weight: 700; text-transform: uppercase;">Status Reposição:</span> <strong style="color: #38bdf8;">${s[35] || '-'}</strong></div>
          </div>
          <div style="border-top: 1px solid #1a253e; padding-top: 6px;"><span style="color: #64748b; font-weight: 700; text-transform: uppercase;">Aplicação:</span> <span style="color: #cbd5e1;">${s[39] || 'Consulte catálogo técnico'}</span></div>
        </div>
      `;

      document.getElementById('sku-modal-title').innerText = `[${s[0]}] ${s[1]}`;
      
      const footerEl = document.getElementById('sku-modal-footer');
      if (footerEl) {
        footerEl.innerHTML = `
          <span style="color: #64748b; font-size: 12px; font-weight: 500;">Dados Genuínos CENTRAL PEÇAS</span>
          <button class="btn" style="background-color: #0ea5e9; color: #fff; border-radius: 8px; font-weight: 700; padding: 8px 24px; border: none; font-size: 13px; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.backgroundColor='#0284c7'" onmouseout="this.style.backgroundColor='#0ea5e9'" onclick="closeSkuModal()">Fechar</button>
        `;
      }

      var sm = document.getElementById('sku-modal');
      if (sm) {
        sm.style.removeProperty('display');
        sm.style.setProperty('display', 'flex', 'important');
        sm.style.setProperty('z-index', '1060', 'important');
        sm.classList.add('active');
      }
    }

    
    // ========================================================
    // MEMÓRIA DE CÁLCULO E DADOS DA DEMANDA DIÁRIA (DMD)
    // ========================================================
    function openDmdDetailModal(skuId) {
      const s = window.COMPACT_SKUS.find(item => String(item[0]) === String(skuId));
      if (!s) return;

      const dmdInfo = (window.DMD_MAP && window.DMD_MAP[Number(skuId)]) || { txs: [], tot_qtd: 0.0, tot_val: 0.0 };
      const dmdFinal = typeof s[13] === 'number' ? s[13] : parseFloat(s[13] || 0);
      const totQtd90 = dmdInfo.tot_qtd > 0 ? dmdInfo.tot_qtd : (dmdFinal > 0 ? Math.round(dmdFinal * 90 * 100) / 100 : 0.0);
      const totVal90 = dmdInfo.tot_val > 0 ? dmdInfo.tot_val : 0.0;
      const dmdBase = totQtd90 / 90.0;
      const fatorSazonal = 1.00;
      const mediaMensal = dmdFinal * 30.0;
      const projAnual = dmdFinal * 365.0;

      // Badges
      const curvaBadge = `<span style="padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 800; background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.35);">CURVA ${s[5] || 'C'}</span>`;
      const statusBadge = `<span style="padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 800; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35);">${s[35] || 'ABASTECIDO'}</span>`;

      // Transactions Table Rows
      let txsTableHtml = '';
      if (dmdInfo.txs && dmdInfo.txs.length > 0) {
        let rowsHtml = '';
        dmdInfo.txs.forEach(t => {
          const isDev = t[5] === 'Devolução';
          const badgeClass = isDev 
            ? 'background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3);'
            : 'background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3);';
          rowsHtml += `
            <tr style="border-bottom: 1px solid #1e293b;">
              <td style="padding: 8px 12px; font-size: 12px; color: #cbd5e1; font-weight: 600;">${t[0]}</td>
              <td style="padding: 8px 12px; font-size: 11px;"><span style="padding: 2px 6px; border-radius: 4px; font-weight: 700; ${badgeClass}">${t[5]}</span></td>
              <td style="padding: 8px 12px; font-size: 12px; color: #94a3b8;">${t[3]}</td>
              <td style="padding: 8px 12px; font-size: 12px; color: #cbd5e1;">${t[4]}</td>
              <td style="padding: 8px 12px; font-size: 12px; text-align: right; font-weight: 700; color: ${isDev ? '#f87171' : '#ffffff'};">${fmtNum(t[1])} un</td>
              <td style="padding: 8px 12px; font-size: 12px; text-align: right; font-weight: 700; color: ${isDev ? '#f87171' : '#34d399'};">${fmtBRL(t[2])}</td>
            </tr>
          `;
        });

        txsTableHtml = `
          <div style="background: #0e1628; border: 1px solid #1e293b; border-radius: 10px; overflow: hidden; margin-bottom: 16px;">
            <div style="background: #111c33; padding: 10px 16px; border-bottom: 1px solid #1e293b; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #38bdf8; letter-spacing: 0.5px;">📦 Vendas & Movimentações na Janela de 90 Dias (${dmdInfo.txs.length} registros)</span>
              <span style="font-size: 11px; color: #94a3b8;">Período: 03/06/2026 a 31/08/2026</span>
            </div>
            <div style="max-height: 220px; overflow-y: auto;">
              <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <thead style="background: #090e1a; position: sticky; top: 0; z-index: 2;">
                  <tr style="border-bottom: 1px solid #1e293b;">
                    <th style="padding: 8px 12px; font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700;">Data</th>
                    <th style="padding: 8px 12px; font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700;">Tipo</th>
                    <th style="padding: 8px 12px; font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700;">Filial / Unidade</th>
                    <th style="padding: 8px 12px; font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700;">Operação</th>
                    <th style="padding: 8px 12px; font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; text-align: right;">Quantidade</th>
                    <th style="padding: 8px 12px; font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; text-align: right;">Valor Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
                <tfoot style="background: #111c33; border-top: 2px solid #1e293b; font-weight: 800;">
                  <tr>
                    <td colspan="4" style="padding: 10px 12px; font-size: 12px; color: #e2e8f0; text-transform: uppercase;">Total Líquido Apurado no Período (90d):</td>
                    <td style="padding: 10px 12px; font-size: 13px; text-align: right; color: #38bdf8;">${fmtNum(totQtd90)} un</td>
                    <td style="padding: 10px 12px; font-size: 13px; text-align: right; color: #34d399;">${fmtBRL(totVal90)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        `;
      } else {
        txsTableHtml = `
          <div style="background: rgba(30, 41, 59, 0.4); border: 1px dashed #334155; border-radius: 10px; padding: 16px 20px; margin-bottom: 16px; display: flex; align-items: center; gap: 14px;">
            <div style="font-size: 28px;">ℹ️</div>
            <div>
              <div style="font-size: 13px; font-weight: 700; color: #f1f5f9; margin-bottom: 2px;">Nenhuma movimentação de saída nos últimos 90 dias</div>
              <div style="font-size: 12px; color: #94a3b8; line-height: 1.4;">
                O produto não teve vendas registradas na janela recente (03/06/2026 a 31/08/2026). Por isso, o <strong>Consumo Líquido = 0,00 un</strong> e a <strong>Demanda Diária é 0,00 un/dia</strong> (Classificado como Sem Giro / Curva X).
              </div>
            </div>
          </div>
        `;
      }

      const body = document.getElementById('dmd-modal-body');
      body.innerHTML = `
        <!-- CABEÇALHO DO PRODUTO -->
        <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 10px; padding: 12px 18px; margin-bottom: 16px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px;">
          <div>
            <div style="font-size: 11px; color: #64748b; font-weight: 700; text-transform: uppercase;">Fabricante / Marca: <strong style="color: #e2e8f0;">${s[2] || 'NÃO INFORMADO'}</strong> | Cód. Fab: <strong style="color: #e2e8f0;">${s[38] || '-'}</strong></div>
            <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">Equipamento: <strong style="color: #cbd5e1;">${s[36] || '-'}</strong> | Perfil: <strong style="color: #cbd5e1;">${s[37] || '-'}</strong></div>
          </div>
          <div style="display: flex; gap: 8px;">
            ${curvaBadge}
            ${statusBadge}
          </div>
        </div>

        <!-- 4 CARDS PRINCIPAIS DA DEMANDA -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px;">
          <div style="background: #0d172b; border: 1px solid #1e2c4f; border-radius: 8px; padding: 12px 14px;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 4px;">Volume Líquido (90d)</div>
            <div style="font-size: 18px; font-weight: 800; color: #ffffff;">${fmtNum(totQtd90)} <span style="font-size: 12px; color: #94a3b8;">un</span></div>
            <div style="font-size: 11px; color: #38bdf8; margin-top: 2px;">Vendas líquidas apuradas</div>
          </div>

          <div style="background: #0d172b; border: 1px solid #1e2c4f; border-radius: 8px; padding: 12px 14px;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 4px;">Janela de Análise</div>
            <div style="font-size: 18px; font-weight: 800; color: #ffffff;">90 <span style="font-size: 12px; color: #94a3b8;">dias</span></div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">03/06/2026 a 31/08/2026</div>
          </div>

          <div style="background: #0d172b; border: 1px solid #1e2c4f; border-radius: 8px; padding: 12px 14px;">
            <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 4px;">Fator Sazonal</div>
            <div style="font-size: 18px; font-weight: 800; color: #ffffff;">${fatorSazonal.toFixed(2)}x</div>
            <div style="font-size: 11px; color: #10b981; margin-top: 2px;">Consumo regular / ativo</div>
          </div>

          <div style="background: linear-gradient(135deg, rgba(37, 99, 235, 0.2), rgba(14, 165, 233, 0.2)); border: 1px solid #2563eb; border-radius: 8px; padding: 12px 14px; box-shadow: 0 0 15px rgba(37, 99, 235, 0.2);">
            <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #38bdf8; margin-bottom: 4px;">Demanda Diária (DMD)</div>
            <div style="font-size: 20px; font-weight: 900; color: #38bdf8;">${fmtNum(dmdFinal)} <span style="font-size: 12px; color: #bae6fd;">un/dia</span></div>
            <div style="font-size: 11px; color: #e0f2fe; margin-top: 2px;">${fmtNum(mediaMensal)} un/mês (30d)</div>
          </div>
        </div>

        <!-- QUADRO DE FÓRMULA MATEMÁTICA PASSO A PASSO -->
        <div style="background: #0a1120; border: 1px solid #1e2c4f; border-radius: 10px; padding: 16px 20px; margin-bottom: 16px;">
          <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #fbbf24; letter-spacing: 0.5px; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
            <span>🧮</span><span>Fórmula Matemática Passo a Passo</span>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-family: var(--font-mono, monospace);">
            <div style="background: #111a2e; border: 1px solid #1e293b; border-radius: 8px; padding: 12px 16px;">
              <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px; font-family: var(--font-main);">1. Demanda Diária Base:</div>
              <div style="font-size: 13px; color: #e2e8f0; font-weight: 600;">DMD Base = Volume 90d ÷ 90 dias</div>
              <div style="font-size: 13px; color: #38bdf8; font-weight: 700; margin-top: 4px;">DMD Base = ${fmtNum(totQtd90)} ÷ 90 = ${fmtNum(dmdBase)} un/dia</div>
            </div>

            <div style="background: #111a2e; border: 1px solid #1e293b; border-radius: 8px; padding: 12px 16px;">
              <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px; font-family: var(--font-main);">2. Demanda Diária Final (com Sazonalidade):</div>
              <div style="font-size: 13px; color: #e2e8f0; font-weight: 600;">DMD Final = DMD Base × Fator Sazonal</div>
              <div style="font-size: 13px; color: #34d399; font-weight: 700; margin-top: 4px;">DMD Final = ${fmtNum(dmdBase)} × ${fatorSazonal.toFixed(2)} = ${fmtNum(dmdFinal)} un/dia</div>
            </div>
          </div>
          <div style="margin-top: 10px; font-size: 11px; color: #64748b; display: flex; gap: 20px;">
            <span>Projeção Mensal (30d): <strong style="color: #cbd5e1;">${fmtNum(mediaMensal)} un/mês</strong></span>
            <span>Projeção Anualizada (365d): <strong style="color: #cbd5e1;">${fmtNum(projAnual)} un/ano</strong></span>
            <span>Custo da Demanda Mensal: <strong style="color: #34d399;">${fmtBRL(mediaMensal * s[11])}</strong></span>
          </div>
        </div>

        <!-- TABELA DE TRANSAÇÕES AUDITÁVEIS -->
        ${txsTableHtml}

        <!-- DESDOBRAMENTO NO ESTOQUE E GESTÃO DE COMPRAS -->
        <div style="background: #0e1628; border: 1px solid #1e293b; border-radius: 10px; padding: 14px 18px;">
          <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #38bdf8; letter-spacing: 0.5px; margin-bottom: 12px;">
            🎯 Impacto da DMD no Dimensionamento do Estoque
          </div>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
            <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 8px; padding: 10px 12px;">
              <div style="font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase;">Estoque Disponível</div>
              <div style="font-size: 14px; font-weight: 800; color: #ffffff; margin-top: 2px;">${fmtNum(s[10])} un</div>
              <div style="font-size: 11px; color: #94a3b8;">${fmtBRL(s[12])}</div>
            </div>

            <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 8px; padding: 10px 12px;">
              <div style="font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase;">Cobertura Atual</div>
              <div style="font-size: 14px; font-weight: 800; color: #ffffff; margin-top: 2px;">${typeof s[14] === 'number' ? fmtInt(s[14]) + ' dias' : (s[14] || 'Sem giro')}</div>
              <div style="font-size: 11px; color: #94a3b8;">Estoque ÷ DMD</div>
            </div>

            <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 8px; padding: 10px 12px;">
              <div style="font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase;">Estoque Alvo (Meta)</div>
              <div style="font-size: 14px; font-weight: 800; color: #38bdf8; margin-top: 2px;">${fmtNum(s[15])} un</div>
              <div style="font-size: 11px; color: #94a3b8;">DMD × Cobertura Alvo</div>
            </div>

            <div style="background: #111a2e; border: 1px solid #1e2c4f; border-radius: 8px; padding: 10px 12px;">
              <div style="font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase;">Sugestão de Compra</div>
              <div style="font-size: 14px; font-weight: 800; color: #10b981; margin-top: 2px;">${fmtNum(s[16])} un</div>
              <div style="font-size: 11px; color: #34d399;">${fmtBRL(s[17])}</div>
            </div>
          </div>
        </div>
      `;

      const elTitle = document.getElementById('dmd-modal-title');
      if (elTitle) elTitle.innerText = `[${s[0]}] ${s[1]}`;
      const dmdModal = document.getElementById('dmd-modal');
      if (dmdModal) {
        dmdModal.style.removeProperty('display');
        dmdModal.style.setProperty('display', 'flex', 'important');
        dmdModal.classList.add('active');
      }
    }

    function closeDmdModal() {
      const dmdModal = document.getElementById('dmd-modal');
      if (dmdModal) {
        dmdModal.classList.remove('active');
        dmdModal.style.setProperty('display', 'none', 'important');
      }
    }

    function closeSkuModal() {
      var el = document.getElementById('sku-modal');
      if (el) {
        el.classList.remove('active');
        el.style.setProperty('display', 'none', 'important');
      }
    }

    // Fecha modal clicando no fundo ou tecla ESC
    document.addEventListener('DOMContentLoaded', function() {
      const sm = document.getElementById('sku-modal');
      if (sm) {
        sm.addEventListener('click', function(e) {
          if (e.target === sm) closeSkuModal();
        });
      }
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
          closeSkuModal();
          if (typeof closeDrilldown === 'function') closeDrilldown();
        }
      });
    });

    // ========================================================
    // MOTOR DE FILTROS GLOBAIS INTEGRADOS E UNIVERSAIS
    // ========================================================
    let activeFilters = {
      marca: '',
      curva: '',
      equip: '',
      perfil: '',
      prio: '',
      start: '',
      aplicacao: '',
      search: '',
      customIds: null,
      customIdsSet: null
    };

    // Helper seguro para obter valor de filtro de qualquer origem (id, classe, elemento ativo)
    function getFilterValue(filterKey) {
      const cls = 'global-filter-' + filterKey;
      const byId = document.getElementById(cls);
      if (byId && byId.value !== undefined && byId.value !== '') return byId.value;

      // Busca na secao ativa/visivel primeiro
      const visibleView = document.querySelector(
        '#view-estoque-visao:not([style*="display: none"]):not([style*="display:none"]), ' +
        'div[id^="view-"]:not([style*="display: none"]):not([style*="display:none"]), ' +
        '#mod-visao'
      );
      if (visibleView) {
        const sel = visibleView.querySelector('.' + cls);
        if (sel && sel.value !== undefined && sel.value !== '') return sel.value;
      }

      // Procura em qualquer select com a classe que tenha valor preenchido
      const all = document.querySelectorAll('.' + cls);
      for (let i = 0; i < all.length; i++) {
        if (all[i] && all[i].value !== undefined && all[i].value !== '') return all[i].value;
      }
      return (all[0] && all[0].value) ? all[0].value : '';
    }

    // Sincroniza todos os selects em todas as barras de filtros (todas as abas)
    function syncAllFilterInputs(sourceEl) {
      if (sourceEl && sourceEl.classList) {
        const cls = Array.from(sourceEl.classList).find(c => c.startsWith('global-filter-'));
        if (cls) {
          const val = sourceEl.value || '';
          document.querySelectorAll('.' + cls).forEach(el => {
            if (el !== sourceEl) el.value = val;
          });
          const elId = document.getElementById(cls);
          if (elId && elId !== sourceEl) elId.value = val;
          return;
        }
      }
      ['marca', 'curva', 'equip', 'perfil', 'prio', 'start'].forEach(key => {
        const val = activeFilters[key] || '';
        document.querySelectorAll('.global-filter-' + key).forEach(el => {
          el.value = val;
        });
        const elId = document.getElementById('global-filter-' + key);
        if (elId) elId.value = val;
      });
    }

    // Atualiza chips visuais de filtros ativos com remocao individual
    function updateFilterTags() {
      const boxes = document.querySelectorAll('.active-filters-box');
      const tagsContainers = document.querySelectorAll('.active-filter-tags');
      const boxId = document.getElementById('active-filters-box');
      const tagsId = document.getElementById('active-filter-tags');

      const allContainers = Array.from(tagsContainers);
      if (tagsId && !allContainers.includes(tagsId)) allContainers.push(tagsId);

      const allBoxes = Array.from(boxes);
      if (boxId && !allBoxes.includes(boxId)) allBoxes.push(boxId);

      let count = 0;
      const tagsHtml = [];
      const labelsMap = {
        marca: 'Marca',
        curva: 'Curva ABC',
        equip: 'Equipamento',
        perfil: 'Perfil',
        prio: 'Prioridade',
        start: 'Status Start',
        search: 'Busca',
        aplicacao: 'Aplicação'
      };

      for (const [key, val] of Object.entries(activeFilters)) {
        if (val && key !== 'customIdsSet') {
          count++;
          let displayVal = val;
          if (Array.isArray(val)) displayVal = `${val.length} SKUs filtrados`;
          const label = labelsMap[key] || key.toUpperCase();
          tagsHtml.push(`
            <span class="filter-tag" style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:rgba(14,165,233,0.18);border:1px solid #0ea5e9;border-radius:20px;font-size:12px;color:#38bdf8;font-weight:600;margin:2px 4px 2px 0;">
              <span>${label}: <strong>${displayVal}</strong></span>
              <span class="remove" onclick="removeSingleFilter('${key}')" style="cursor:pointer;font-weight:800;font-size:14px;color:#f87171;margin-left:4px;padding:0 2px;" title="Remover filtro">&times;</span>
            </span>
          `);
        }
      }

      const html = tagsHtml.join('');
      allContainers.forEach(c => {
        if (c) c.innerHTML = html;
      });
      allBoxes.forEach(b => {
        if (b) b.style.display = count > 0 ? 'flex' : 'none';
      });
    }

    function removeSingleFilter(key) {
      activeFilters[key] = '';
      if (key === 'customIds') {
        activeFilters.customIds = null;
        activeFilters.customIdsSet = null;
      }
      document.querySelectorAll('.global-filter-' + key).forEach(el => { el.value = ''; });
      const elem = document.getElementById('global-filter-' + key);
      if (elem) elem.value = '';

      if (key === 'search') {
        const invSearch = document.getElementById('inv-search-input');
        if (invSearch) invSearch.value = '';
        const prodSearch = document.getElementById('input-prod-search');
        if (prodSearch) prodSearch.value = '';
      }
      applyGlobalFilters();
    }

    function resetGlobalFilters(doRender = true) {
      activeFilters = {
        marca: '',
        curva: '',
        equip: '',
        perfil: '',
        prio: '',
        start: '',
        aplicacao: '',
        search: '',
        customIds: null,
        customIdsSet: null
      };
      ['marca', 'curva', 'equip', 'perfil', 'prio', 'start'].forEach(key => {
        document.querySelectorAll('.global-filter-' + key).forEach(el => { el.value = ''; });
        const el = document.getElementById('global-filter-' + key);
        if (el) el.value = '';
      });
      const invSearch = document.getElementById('inv-search-input');
      if (invSearch) invSearch.value = '';
      const prodSearch = document.getElementById('input-prod-search');
      if (prodSearch) prodSearch.value = '';

      updateFilterTags();
      const allSkus = window.COMPACT_SKUS || [];
      updateExecutiveKPIs(allSkus);
      updateFilteredTables(allSkus);

      if (typeof renderProdutosCatalog === 'function') {
        try { renderProdutosCatalog(); } catch (e) { console.warn(e); }
      }
      if (doRender && typeof renderInventoryPage === 'function') {
        try { renderInventoryPage(); } catch (e) { console.warn(e); }
      }
    }

    // Recalcula dinamicamente todos os 8 Cards Executivos do Modulo 01
    function updateExecutiveKPIs(list) {
      if (!list) list = getFilteredSkus();

      // 1. Start Agora (Horizonte == 'START AGORA' ou status AGORA/ATRASADO com demanda ou reposicao)
      const startAgoraSkus = list.filter(s => (s[40] === 'START AGORA' || s[35] === 'AGORA' || s[35] === 'ATRASADO') && ((s[16] || 0) > 0 || (s[13] || 0) > 0));
      const startAgoraCount = startAgoraSkus.length;
      const startAgoraInvest = startAgoraSkus.reduce((sum, s) => sum + (parseFloat(s[17]) || 0), 0);

      const elStartCount = document.getElementById('kpi-start-agora-count');
      if (elStartCount) elStartCount.innerText = `${startAgoraCount.toLocaleString('pt-BR')} SKUs`;
      const elStartVal = document.getElementById('kpi-start-agora-val');
      if (elStartVal) elStartVal.innerText = fmtBRL(startAgoraInvest);
      const elStartBtn = document.getElementById('kpi-start-agora-btn');
      if (elStartBtn) elStartBtn.innerText = `Auditar ${startAgoraCount.toLocaleString('pt-BR')} SKUs →`;

      // 2. Faturamento Liquido
      const skusComVenda = list.filter(s => (s[24] || 0) > 0);
      const totFat = list.reduce((sum, s) => sum + (parseFloat(s[24]) || 0), 0);
      const elFatVal = document.getElementById('kpi-fat-val');
      if (elFatVal) elFatVal.innerText = fmtBRL(totFat);
      const elFatSub = document.getElementById('kpi-fat-sub');
      if (elFatSub) elFatSub.innerText = `Vendas 3 Anos • ${skusComVenda.length.toLocaleString('pt-BR')} SKUs com giro`;

      // 3. Margem Bruta Liquida
      const totMargem = list.reduce((sum, s) => sum + (parseFloat(s[25]) || 0), 0);
      const pctMargem = totFat > 0 ? (totMargem / totFat * 100) : 0;
      const elMargemVal = document.getElementById('kpi-margem-val');
      if (elMargemVal) elMargemVal.innerText = fmtBRL(totMargem);
      const elMargemSub = document.getElementById('kpi-margem-sub');
      if (elMargemSub) elMargemSub.innerText = `${fmtPct(pctMargem)} sobre faturamento líquido`;

      // 4. Estoque Fisico Total
      const totValEst = list.reduce((sum, s) => sum + (parseFloat(s[12]) || 0), 0);
      const totQtdEst = list.reduce((sum, s) => sum + (parseFloat(s[9]) || 0), 0);
      const elEstVal = document.getElementById('kpi-est-val');
      if (elEstVal) elEstVal.innerText = fmtBRL(totValEst);
      const elEstSub = document.getElementById('kpi-est-sub');
      if (elEstSub) elEstSub.innerText = `${list.length.toLocaleString('pt-BR')} SKUs • ${fmtNum(totQtdEst)} unidades`;

      // 5. Rupturas Imediatas
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

      // 7. Curva X (Sem Giro)
      const curvaXSkus = list.filter(s => s[5] === 'X' || (parseFloat(s[20]) || 0) > 0);
      const totX = list.reduce((sum, s) => sum + (parseFloat(s[20]) || 0), 0);
      const elXVal = document.getElementById('kpi-x-val');
      if (elXVal) elXVal.innerText = fmtBRL(totX);
      const elXSub = document.getElementById('kpi-x-sub');
      if (elXSub) elXSub.innerText = `${curvaXSkus.length.toLocaleString('pt-BR')} SKUs sem vendas há mais de 90 dias`;

      // 8. Sugestao de Compras
      const skusComprar = list.filter(s => (parseFloat(s[17]) || 0) > 0 || (parseFloat(s[16]) || 0) > 0);
      const totCompra = list.reduce((sum, s) => sum + (parseFloat(s[17]) || 0), 0);
      const elSugVal = document.getElementById('kpi-sug-val');
      if (elSugVal) elSugVal.innerText = fmtBRL(totCompra);
      const elSugSub = document.getElementById('kpi-sug-sub');
      if (elSugSub) elSugSub.innerText = `${skusComprar.length.toLocaleString('pt-BR')} SKUs • Reposição de segurança`;
    }

    // Atualiza tabelas relacionadas em outras views (Marcas, Curvas, Equipamentos)
    function updateFilteredTables(filteredList) {
      // 1. Tabela de Marcas
      const tblMarcas = document.getElementById('table-marcas');
      if (tblMarcas) {
        tblMarcas.querySelectorAll('tbody tr').forEach(tr => {
          if (!activeFilters.marca) {
            tr.style.display = '';
          } else {
            const brandBadge = tr.querySelector('.badge-brand');
            const brandName = brandBadge ? brandBadge.innerText.trim() : tr.cells[0]?.innerText.trim();
            tr.style.display = (brandName === activeFilters.marca) ? '' : 'none';
          }
        });
      }

      // 2. Tabela de Curva X por Marca
      const tblMarcasX = document.getElementById('table-marcas-x');
      if (tblMarcasX) {
        tblMarcasX.querySelectorAll('tbody tr').forEach(tr => {
          if (!activeFilters.marca) {
            tr.style.display = '';
          } else {
            const brandBadge = tr.querySelector('.badge-brand');
            const brandName = brandBadge ? brandBadge.innerText.trim() : tr.cells[0]?.innerText.trim();
            tr.style.display = (brandName === activeFilters.marca) ? '' : 'none';
          }
        });
      }

      // 3. Tabela de Cobertura ABC
      const tblCobertura = document.getElementById('table-cobertura-abc');
      if (tblCobertura) {
        tblCobertura.querySelectorAll('tbody tr').forEach(tr => {
          if (!activeFilters.curva) {
            tr.style.display = '';
          } else {
            const curvaCell = tr.cells[0]?.innerText.trim();
            tr.style.display = (curvaCell && (curvaCell === activeFilters.curva || curvaCell.startsWith('Curva ' + activeFilters.curva) || curvaCell.includes(activeFilters.curva))) ? '' : 'none';
          }
        });
      }

      // 4. Tabela de Equipamentos
      const tblEquip = document.getElementById('table-equipamentos');
      if (tblEquip) {
        tblEquip.querySelectorAll('tbody tr').forEach(tr => {
          if (!activeFilters.equip) {
            tr.style.display = '';
          } else {
            const equipCell = tr.cells[0]?.innerText.trim();
            tr.style.display = (equipCell && (equipCell.includes(activeFilters.equip) || activeFilters.equip.includes(equipCell))) ? '' : 'none';
          }
        });
      }
    }

    // Funcao mestre que aplica filtros globais e re-renderiza componentes
    function applyGlobalFilters(sourceEl) {
      if (sourceEl && sourceEl.tagName === 'SELECT') {
        syncAllFilterInputs(sourceEl);
      }

      activeFilters.marca = getFilterValue('marca');
      activeFilters.curva = getFilterValue('curva');
      activeFilters.equip = getFilterValue('equip');
      activeFilters.perfil = getFilterValue('perfil');
      activeFilters.prio = getFilterValue('prio');
      activeFilters.start = getFilterValue('start');

      syncAllFilterInputs();
      updateFilterTags();

      const filteredList = getFilteredSkus();
      updateExecutiveKPIs(filteredList);
      updateFilteredTables(filteredList);

      if (typeof renderProdutosCatalog === 'function') {
        try { renderProdutosCatalog(); } catch (e) { console.warn(e); }
      }
      if (typeof renderInventoryPage === 'function') {
        try { renderInventoryPage(); } catch (e) { console.warn(e); }
      }
    }

    // ========================================================
    // INVENTARIO COMPLETO (10.655 SKUs COM FILTRAGEM PRECISA)
    // ========================================================
    let currentInvPage = 1;
    const invPageSize = 50;
    let filteredInvList = window.COMPACT_SKUS || [];

    function getFilteredSkus() {
      if (!window.COMPACT_SKUS || !window.COMPACT_SKUS.length) return [];
      return window.COMPACT_SKUS.filter(s => {
        if (activeFilters.customIdsSet) {
          if (!activeFilters.customIdsSet.has(s[0])) return false;
        }
        // 1. Marca
        if (activeFilters.marca && s[2] !== activeFilters.marca) return false;

        // 2. Curva ABC
        if (activeFilters.curva) {
          if (activeFilters.curva === 'X' || activeFilters.curva.startsWith('X')) {
            if (s[5] !== 'X' && (parseFloat(s[20]) || 0) <= 0) return false;
          } else if (s[5] !== activeFilters.curva) {
            return false;
          }
        }

        // 3. Equipamento
        if (activeFilters.equip) {
          const equipStr = String(s[36] || '');
          const equipPrefix = equipStr.split(' / ')[0].trim();
          if (equipPrefix !== activeFilters.equip &&
              !equipStr.startsWith(activeFilters.equip) &&
              !equipStr.toLowerCase().includes(activeFilters.equip.toLowerCase())) {
            return false;
          }
        }

        // 4. Perfil Sazonal
        if (activeFilters.perfil) {
          const perfStr = String(s[37] || '');
          if (!perfStr.startsWith(activeFilters.perfil)) return false;
        }

        // 5. Prioridade Compra (normalizado sem acentos)
        if (activeFilters.prio) {
          const sPrio = String(s[18] || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
          const fPrio = String(activeFilters.prio).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
          if (sPrio !== fPrio && !String(s[18] || '').includes(activeFilters.prio)) return false;
        }

        // 6. Status do Start
        if (activeFilters.start) {
          const sVal = activeFilters.start.toLowerCase();
          const h40 = String(s[40] || '').toLowerCase();
          const st35 = String(s[35] || '').toLowerCase();
          if (activeFilters.start === 'START AGORA') {
            if (st35 !== 'agora' && st35 !== 'atrasado' && !h40.includes('start agora')) return false;
          } else if (activeFilters.start.includes('30 dias')) {
            if (!h40.includes('30') && !st35.includes('30') && st35 !== 'programado') return false;
          } else if (activeFilters.start.includes('60 dias')) {
            if (!h40.includes('60') && !st35.includes('60')) return false;
          } else if (activeFilters.start.includes('90 dias')) {
            if (!h40.includes('90') && !st35.includes('90')) return false;
          } else if (activeFilters.start.includes('Suspenso') || activeFilters.start.includes('Sem Giro')) {
            if (!h40.includes('suspenso') && !h40.includes('sem giro') && st35 !== 'sem giro' && s[5] !== 'X') return false;
          } else {
            if (!h40.includes(sVal) && !st35.includes(sVal) && s[40] !== activeFilters.start && s[35] !== activeFilters.start) {
              return false;
            }
          }
        }

        // 7. Aplicacao
        if (activeFilters.aplicacao) {
          if (!s[39] || !s[39].toLowerCase().includes(activeFilters.aplicacao.toLowerCase())) return false;
        }

        // 8. Busca Livre
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

    function renderInventoryPage() {
      filteredInvList = getFilteredSkus();
      const total = filteredInvList.length;
      const totalPages = Math.max(1, Math.ceil(total / invPageSize));
      if (currentInvPage > totalPages) currentInvPage = totalPages;
      if (currentInvPage < 1) currentInvPage = 1;

      const elCount = document.getElementById('inv-count-label'); if (elCount) elCount.innerText = `Exibindo ${total.toLocaleString('pt-BR')} SKUs filtrados`;
      const elPag = document.getElementById('pagination-label'); if (elPag) elPag.innerText = `Página ${currentInvPage} de ${totalPages}`;
      const btnPrev = document.getElementById('btn-prev-page'); if (btnPrev) btnPrev.disabled = currentInvPage <= 1;
      const btnNext = document.getElementById('btn-next-page'); if (btnNext) btnNext.disabled = currentInvPage >= totalPages;

      const tbody = document.getElementById('inventory-tbody'); if (!tbody) return; tbody.innerHTML = '';

      const startIdx = (currentInvPage - 1) * invPageSize;
      const pageItems = filteredInvList.slice(startIdx, startIdx + invPageSize);

      pageItems.forEach(s => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.onclick = function() { showSkuDetail(s[0]); };

        const prioBadge = s[18] === 'CRÍTICO' ? 'badge-danger' : (s[18] === 'ATENÇÃO' ? 'badge-warning' : 'badge-outline');
        const startBadge = s[35] === 'AGORA' || s[35] === 'ATRASADO' ? 'badge-danger' : (s[35] === 'PROGRAMADO' || s[35] === 'PRÓXIMO' ? 'badge-warning' : 'badge-outline');

        tr.innerHTML = `
          <td><strong>${s[0]}</strong></td>
          <td><span style="font-family: var(--font-mono); font-weight: 700; color: #38bdf8; font-size: 11px;">${s[38] || '-'}</span></td>
          <td title="${s[1]}">${s[1].length > 35 ? s[1].substr(0, 35) + '...' : s[1]}</td>
          <td><span class="badge badge-brand">${s[2]}</span></td>
          <td>${s[36]}</td>
          <td><span class="badge badge-outline">${s[5]}</span></td>
          <td class="text-right">${fmtNum(s[9])}</td>
          <td class="text-right ${ s[10] <= 0 ? 'text-danger' : '' }">${fmtNum(s[10])}</td>
          <td class="text-right">${fmtBRL(s[11])}</td>
          <td class="text-right"><strong>${fmtBRL(s[12])}</strong></td>
          <td class="text-right">${parseFloat(s[19]) > 0 ? `<strong style="color: #fbbf24; font-family: var(--font-mono); font-size: 11px;">${fmtBRL(s[19])}</strong>` : `<span style="color: var(--text-dim);">-</span>`}</td>
          <td class="text-right">${fmtNum(s[13])}</td>
          <td class="text-right">${typeof s[14] === 'number' ? fmtInt(s[14]) : s[14]}</td>
          <td class="text-right">${fmtNum(s[16])}</td>
          <td class="text-right text-success"><strong>${fmtBRL(s[17])}</strong></td>
          <td class="text-center"><span class="badge ${prioBadge}">${s[18]}</span></td>
          <td class="text-center"><span class="badge ${startBadge}">${s[35]}</span></td>
          <td class="text-center"><button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); showSkuDetail('${s[0]}')">Ficha</button></td>
        `;
        tbody.appendChild(tr);
      });

      initUniversalSorting(document.getElementById('table-inventory'));
    }

    function prevInvPage() {
      if (currentInvPage > 1) {
        currentInvPage--;
        renderInventoryPage();
      }
    }
    function nextInvPage() {
      currentInvPage++;
      renderInventoryPage();
    }

    function searchInventoryLive(query) {
      activeFilters.search = query.trim();
      currentInvPage = 1;
      updateFilterTags();
      renderInventoryPage();
    }

    function clearInventorySearch() {
      const input = document.getElementById('inv-search-input');
      if (input) input.value = '';
      activeFilters.search = '';
      currentInvPage = 1;
      updateFilterTags();
      renderInventoryPage();
    }

    
    // ========================================================
    // ========================================================
    // MOTOR DO CATÁLOGO DE PRODUTOS (MÓDULO 11)
    // ========================================================
    let currentProdPage = 1;
    let prodPageSize = 100;
    let filteredProdList = null;

    function getFilteredProdList() {
      const inputEl = document.getElementById('input-prod-search');
      const term = (inputEl ? inputEl.value : '').toLowerCase().trim();
      if (!term) {
        return window.COMPACT_SKUS || [];
      }
      return (window.COMPACT_SKUS || []).filter(s =>
        String(s[0]).toLowerCase().includes(term) ||
        String(s[1]).toLowerCase().includes(term) ||
        String(s[2]).toLowerCase().includes(term) ||
        String(s[38] || '').toLowerCase().includes(term) ||
        String(s[36] || '').toLowerCase().includes(term) ||
        String(s[39] || '').toLowerCase().includes(term)
      );
    }

    function renderProdutosCatalog() {
      filteredProdList = getFilteredProdList();
      const total = filteredProdList.length;
      const totalPages = Math.max(1, Math.ceil(total / prodPageSize));
      if (currentProdPage > totalPages) currentProdPage = totalPages;
      if (currentProdPage < 1) currentProdPage = 1;

      const countLabel = document.getElementById('prod-catalog-count-label');
      if (countLabel) countLabel.innerText = `Exibindo ${total.toLocaleString('pt-BR')} produtos cadastrados`;

      const pagText = `Página ${currentProdPage} de ${totalPages}`;
      const topLabel = document.getElementById('prod-pagination-label-top');
      if (topLabel) topLabel.innerText = pagText;
      const bottomLabel = document.getElementById('prod-pagination-label');
      if (bottomLabel) bottomLabel.innerText = pagText;

      const btnPrevTop = document.getElementById('btn-prod-prev-top');
      if (btnPrevTop) btnPrevTop.disabled = currentProdPage <= 1;
      const btnNextTop = document.getElementById('btn-prod-next-top');
      if (btnNextTop) btnNextTop.disabled = currentProdPage >= totalPages;

      const btnPrev = document.getElementById('btn-prod-prev');
      if (btnPrev) btnPrev.disabled = currentProdPage <= 1;
      const btnNext = document.getElementById('btn-prod-next');
      if (btnNext) btnNext.disabled = currentProdPage >= totalPages;

      const tbody = document.getElementById('produtos-catalog-tbody');
      if (!tbody) return;
      tbody.innerHTML = '';

      const startIdx = (currentProdPage - 1) * prodPageSize;
      const pageItems = filteredProdList.slice(startIdx, startIdx + prodPageSize);

      pageItems.forEach(s => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.title = 'Clique para abrir o card com a ficha técnica completa deste produto';
        tr.onclick = function() { showSkuDetail(s[0]); };

        const cVal = (s[5] || 'C').toUpperCase();
        let badgeClass = 'badge-outline';
        if (cVal === 'A') badgeClass = 'badge-success';
        else if (cVal === 'B') badgeClass = 'badge-info';
        else if (cVal === 'C') badgeClass = 'badge-warning';
        else if (cVal === 'X') badgeClass = 'badge-danger';

        const estDisp = typeof s[10] === 'number' ? s[10] : parseFloat(s[10] || 0);
        const estColor = estDisp <= 0 ? 'text-danger font-bold' : '';

        const cobTxt = (typeof s[14] === 'number' && s[14] > 0) ? (fmtInt(s[14]) + ' d') : 'Sem giro';

        const excVal = parseFloat(s[19]) || 0;
        const excHtml = excVal > 0 
          ? `<strong style="color: #fbbf24; font-family: var(--font-mono); font-size: 11px;">${fmtBRL(excVal)}</strong>` 
          : `<span style="color: var(--text-dim);">-</span>`;

        tr.innerHTML = `
          <td><strong>${s[0]}</strong></td>
          <td><span style="font-family: var(--font-mono); font-weight: 700; color: #38bdf8; font-size: 11px;">${s[38] || '-'}</span></td>
          <td title="${s[1]}">${s[1].length > 40 ? s[1].substr(0, 40) + '...' : s[1]}</td>
          <td><span class="badge badge-brand">${s[2]}</span></td>
          <td>${s[36]}</td>
          <td class="text-center"><span class="badge ${badgeClass}">CURVA ${cVal}</span></td>
          <td class="text-right ${estColor}">${fmtNum(s[10])}</td>
          <td class="text-right">${fmtBRL(s[11])}</td>
          <td class="text-right">${excHtml}</td>
          <td class="text-right">${fmtNum(s[13])}</td>
          <td class="text-right">${cobTxt}</td>
          <td class="text-right ${s[16] > 0 ? 'text-info font-bold' : ''}">${fmtNum(s[16])}</td>
          <td class="text-right">${fmtBRL(s[24])}</td>
          <td class="text-right ${s[25] > 0 ? 'text-success font-bold' : ''}">${fmtBRL(s[25])}</td>
          <td class="text-center">
            <button class="btn btn-sm btn-outline" style="border-radius: 6px; padding: 3px 8px;" onclick="event.stopPropagation(); showSkuDetail('${s[0]}')">Ver Ficha</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    function prevProdPage() {
      if (currentProdPage > 1) {
        currentProdPage--;
        renderProdutosCatalog();
        document.getElementById('table-produtos-catalog')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    function nextProdPage() {
      const totalPages = Math.ceil(getFilteredProdList().length / prodPageSize);
      if (currentProdPage < totalPages) {
        currentProdPage++;
        renderProdutosCatalog();
        document.getElementById('table-produtos-catalog')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    function changeProdPageSize(newSize) {
      prodPageSize = parseInt(newSize, 10) || 100;
      currentProdPage = 1;
      renderProdutosCatalog();
    }

    let prodSearchTimeout = null;
    function searchProdutosLive(term) {
      clearTimeout(prodSearchTimeout);
      prodSearchTimeout = setTimeout(() => {
        currentProdPage = 1;
        renderProdutosCatalog();
      }, 150);
    }

    function clearProdutosSearch() {
      const input = document.getElementById('input-prod-search');
      if (input) input.value = '';
      currentProdPage = 1;
      renderProdutosCatalog();
    }


    function exportInventoryToCSV() {
      const items = getFilteredSkus();
      let csv = "ID;Ref_Fabrica;Descricao;Marca;Equipamento;Perfil_Sazonal;Curva;EstoqueFisico;EstoqueDisponivel;CustoMedio;ValorEstoque;DMD;DiasEstoque;CompraSugerida;InvestimentoCompra;Prioridade;StartStatus\n";
      items.forEach(s => {
        const desc = (s[1] || '').replace(/;/g, ',');
        csv += `${s[0]};"${desc}";"${s[38]}";"${s[2]}";"${s[36]}";"${s[37]}";${s[5]};${s[9]};${s[10]};${s[11]};${s[12]};${s[13]};${s[14]};${s[16]};${s[17]};${s[18]};${s[35]}\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventario_central_pecas_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    window.onload = function() {
      const selectMarca = document.getElementById('global-filter-marca');
      const uniqueMarcas = [...new Set(window.COMPACT_SKUS.map(s => s[2]))].filter(Boolean).sort();
      uniqueMarcas.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.innerText = m;
        selectMarca.appendChild(opt);
      });

      document.querySelectorAll('.sortable-table').forEach(tbl => {
        initUniversalSorting(tbl);
      });

      renderInventoryPage();
    };



// ========================================================
// ATTACH EVENT LISTENERS & INICIALIZACAO UNIVERSAL
// ========================================================
window.applyGlobalFilters = applyGlobalFilters;
window.resetGlobalFilters = resetGlobalFilters;
window.updateFilterTags = updateFilterTags;
window.removeSingleFilter = removeSingleFilter;
window.getFilteredSkus = getFilteredSkus;
window.updateExecutiveKPIs = updateExecutiveKPIs;

function attachFilterListeners() {
  const filterClasses = [
    'global-filter-marca',
    'global-filter-curva',
    'global-filter-equip',
    'global-filter-perfil',
    'global-filter-prio',
    'global-filter-start'
  ];
  filterClasses.forEach(cls => {
    document.querySelectorAll('.' + cls).forEach(sel => {
      if (!sel.dataset.filterBound) {
        sel.dataset.filterBound = 'true';
        sel.addEventListener('change', function() {
          applyGlobalFilters(this);
        });
      }
    });
  });
}

window.initEstoqueVisao = function() {
  if (window.COMPACT_SKUS && window.COMPACT_SKUS.length) {
    const uniqueMarcas = [...new Set(window.COMPACT_SKUS.map(s => s[2]))].filter(Boolean).sort();
    document.querySelectorAll('.global-filter-marca').forEach(selectMarca => {
      if (selectMarca.options.length <= 1) {
        uniqueMarcas.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m;
          opt.innerText = m;
          selectMarca.appendChild(opt);
        });
      }
    });
    attachFilterListeners();
    document.querySelectorAll('.sortable-table').forEach(tbl => {
      if (typeof initUniversalSorting === 'function') initUniversalSorting(tbl);
    });
    updateExecutiveKPIs(getFilteredSkus());
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', window.initEstoqueVisao);
} else {
  setTimeout(window.initEstoqueVisao, 50);
}

// Global Drilldown Exposes
window.drilldownStartHorizonte = drilldownStartHorizonte;
window.drilldownStartAgora = drilldownStartAgora;
window.drilldownAllSales = drilldownAllSales;
window.drilldownMargem = drilldownMargem;
window.drilldownEstoqueTotal = drilldownEstoqueTotal;
window.drilldownRupturas = drilldownRupturas;
window.drilldownExcesso = drilldownExcesso;
window.drilldownCurvaX = drilldownCurvaX;
window.drilldownSugestaoCompra = drilldownSugestaoCompra;
window.drilldownClientesGeral = drilldownClientesGeral;
window.openDrilldownModal = openDrilldownModal;
window.closeDrilldownModal = closeDrilldownModal;
window.showSkuDetail = showSkuDetail;
window.closeSkuModal = closeSkuModal;

window.openDmdDetailModal = openDmdDetailModal;
window.closeDmdModal = closeDmdModal;
