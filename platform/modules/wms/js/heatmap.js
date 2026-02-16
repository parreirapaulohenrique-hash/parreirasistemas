// ===========================================
// WMS HEATMAP - MAPA DE CALOR
// ===========================================

window.HeatmapManager = {

    // Config
    colors: {
        low: '#3b82f6',    // Blue (0-20%)
        medium: '#10b981', // Green (20-50%)
        high: '#f59e0b',   // Orange (50-80%)
        hot: '#ef4444'     // Red (>80%)
    },

    getHeatData: function () {
        const tasks = JSON.parse(localStorage.getItem('wms_picking') || '[]');
        const locs = [];

        // Count frequency per location
        const freq = {};
        let max = 0;

        tasks.forEach(t => {
            // Address format: RUA-PREDIO-NIVEL+POS
            // We want to map to strict ID if possible
            const addr = t.endereco;
            if (addr) {
                freq[addr] = (freq[addr] || 0) + 1;
                if (freq[addr] > max) max = freq[addr];
            }
        });

        // Add mock data if empty (to demonstrate)
        if (tasks.length === 0) {
            // Generate some fake "hot spots"
            const allLocs = JSON.parse(localStorage.getItem('wms_mock_data') || '[]');
            allLocs.forEach(l => {
                if (Math.random() > 0.7) {
                    const count = Math.floor(Math.random() * 50);
                    freq[l.id] = count;
                    if (count > max) max = count;
                }
            });
        }

        return { freq, max };
    },

    render: function (containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const { freq, max } = this.getHeatData();
        const allLocs = JSON.parse(localStorage.getItem('wms_mock_data') || '[]');

        // Group hierarchy (same as locations.js)
        const hierarchy = {};
        allLocs.forEach(loc => {
            if (!hierarchy[loc.rua]) hierarchy[loc.rua] = {};
            if (!hierarchy[loc.rua][loc.predio]) hierarchy[loc.rua][loc.predio] = [];
            hierarchy[loc.rua][loc.predio].push(loc);
        });

        let html = `
            <div class="card" style="margin-bottom:1rem; padding:1rem;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h3>Mapa de Calor (Giro de Estoque)</h3>
                    <div style="display:flex; gap:1rem; font-size:0.8rem;">
                        <span style="display:flex; align-items:center; gap:0.3rem;"><span style="width:12px; height:12px; background:${this.colors.low}; border-radius:2px;"></span> Baixo Giro</span>
                        <span style="display:flex; align-items:center; gap:0.3rem;"><span style="width:12px; height:12px; background:${this.colors.medium}; border-radius:2px;"></span> Médio</span>
                        <span style="display:flex; align-items:center; gap:0.3rem;"><span style="width:12px; height:12px; background:${this.colors.high}; border-radius:2px;"></span> Alto</span>
                        <span style="display:flex; align-items:center; gap:0.3rem;"><span style="width:12px; height:12px; background:${this.colors.hot}; border-radius:2px;"></span> Crítico</span>
                    </div>
                </div>
            </div>
        `;

        // Render Map
        Object.keys(hierarchy).sort().forEach(rua => {
            html += `<div class="card" style="margin-bottom:1.5rem; padding:1rem;">
                <h4 style="margin-bottom:1rem; border-bottom:1px solid var(--border-color); padding-bottom:0.5rem;">Rua ${rua}</h4>
                <div style="display:flex; gap:1.5rem; overflow-x:auto; padding-bottom:0.5rem;">`;

            Object.keys(hierarchy[rua]).sort().forEach(predio => {
                const locs = hierarchy[rua][predio];
                const maxNivel = Math.max(...locs.map(l => parseInt(l.nivel)));
                const maxPos = Math.max(...locs.map(l => parseInt(l.posicao)));

                html += `<div style="min-width:fit-content; border:1px solid var(--border-color); border-radius:8px; padding:0.75rem; background:var(--bg-body);">
                    <div style="text-align:center; font-weight:600; margin-bottom:0.5rem; font-size:0.85rem;">Prédio ${predio}</div>
                    <div style="display:grid; grid-template-rows:repeat(${maxNivel}, 1fr); grid-template-columns:repeat(${maxPos}, 24px); gap:4px;">`;

                for (let n = maxNivel; n >= 1; n--) {
                    for (let p = 1; p <= maxPos; p++) {
                        const loc = locs.find(l => parseInt(l.nivel) === n && parseInt(l.posicao) === p);
                        if (loc) {
                            const val = freq[loc.id] || 0;
                            const pct = max > 0 ? val / max : 0;
                            let color = this.colors.low;
                            if (pct > 0.8) color = this.colors.hot;
                            else if (pct > 0.5) color = this.colors.high;
                            else if (pct > 0.2) color = this.colors.medium;
                            if (val === 0) color = '#1e293b'; // Empty/No Data

                            html += `<div style="width:24px; height:24px; border-radius:3px; background:${color}; cursor:pointer;" title="End: ${loc.id}\nAcessos: ${val}"></div>`;
                        } else {
                            html += `<div style="width:24px; height:24px; border:1px dashed var(--border-color);"></div>`;
                        }
                    }
                }

                html += `</div></div>`;
            });

            html += `</div></div>`;
        });

        container.innerHTML = html;
    }
};
