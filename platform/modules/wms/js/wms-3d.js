// =============================================================================
// WMS 3D Warehouse Viewer — Three.js
// Lê endereços de wms_mock_data + config de wms_armazem_config
// =============================================================================

window.WMS3D = (function () {

    let _renderer, _camera, _scene, _controls, _animId;
    let _objects = [], _resizeObs = null;

    const C = {
        LIVRE:     0x10b981,
        OCUPADO:   0x3b82f6,
        BLOQUEADO: 0xf59e0b,
        BEAM:      0x334155,
        RAIL:      0x475569,
        FLOOR:     0x0f172a,
    };

    function _cfg() {
        const d = { posLargura:1.2, posAltura:2.0, profundidade:0.8, corridorWidth:2.5 };
        return Object.assign(d, JSON.parse(localStorage.getItem('wms_armazem_config') || '{}'));
    }

    function _addresses() {
        const key = 'wms_mock_data' + (window.getTenantSuffix ? window.getTenantSuffix() : '');
        return JSON.parse(localStorage.getItem(key) || '[]');
    }

    function destroy() {
        if (_animId) cancelAnimationFrame(_animId);
        if (_resizeObs) _resizeObs.disconnect();
        if (_renderer) { _renderer.dispose(); if (_renderer.domElement.parentNode) _renderer.domElement.remove(); }
        if (_controls) _controls.dispose();
        _renderer = _camera = _scene = _controls = _animId = _resizeObs = null;
        _objects = [];
    }

    function init(container) {
        destroy();
        const cfg      = _cfg();
        const addrs    = _addresses();
        const PW       = cfg.posLargura;
        const PH       = cfg.posAltura;
        const RD       = cfg.profundidade;
        const CW       = cfg.corridorWidth;
        const ZONE_W   = RD * 2 + CW;

        // ── Scene ──────────────────────────────────────────────────────────
        _scene = new THREE.Scene();
        _scene.background = new THREE.Color(0x0f172a);
        _scene.fog = new THREE.FogExp2(0x0f172a, 0.012);

        // ── Camera ─────────────────────────────────────────────────────────
        const W = container.clientWidth  || 800;
        const H = container.clientHeight || 500;
        _camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 600);

        // ── Renderer ───────────────────────────────────────────────────────
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'width:100%;height:100%;display:block;border-radius:12px;';
        container.appendChild(canvas);
        _renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        _renderer.setSize(W, H);
        _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        _renderer.shadowMap.enabled = true;

        // ── Lights ─────────────────────────────────────────────────────────
        _scene.add(new THREE.AmbientLight(0xffffff, 0.5));
        const sun = new THREE.DirectionalLight(0xffffff, 0.9);
        sun.position.set(30, 60, 30); sun.castShadow = true;
        _scene.add(sun);
        const fill = new THREE.DirectionalLight(0x6366f1, 0.4);
        fill.position.set(-15, 20, -15);
        _scene.add(fill);

        // ── Empty state ────────────────────────────────────────────────────
        if (addrs.length === 0) {
            _scene.add(new THREE.GridHelper(40, 20, 0x1e293b, 0x1e293b));
            _camera.position.set(0, 20, 30); _camera.lookAt(0, 0, 0);
            _setupControls(canvas);
            _animate();
            const msg = document.createElement('div');
            msg.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:#64748b;pointer-events:none;';
            msg.innerHTML = '<span class="material-icons-round" style="font-size:2.5rem;display:block;opacity:.3;">warehouse</span><div style="font-size:.9rem;margin-top:.5rem;">Nenhum endereço cadastrado</div>';
            container.appendChild(msg);
            return;
        }

        // ── Build world ────────────────────────────────────────────────────
        const ruas = [...new Set(addrs.map(a => a.rua))].sort();
        const allPredios = [...new Set(addrs.map(a => a.predio))].sort((a, b) => +a - +b);
        const maxNiv = Math.max(...addrs.map(a => +a.nivel));

        const WW = ruas.length * ZONE_W;
        const WL = allPredios.length * (PW + 0.12);

        // Floor
        const floorMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(WW + 10, WL + 10),
            new THREE.MeshLambertMaterial({ color: C.FLOOR })
        );
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.position.set(WW / 2, 0, WL / 2);
        floorMesh.receiveShadow = true;
        _scene.add(floorMesh);

        const grid = new THREE.GridHelper(Math.max(WW, WL) + 12, 24, 0x1e293b, 0x1e293b);
        grid.position.set(WW / 2, 0.01, WL / 2);
        _scene.add(grid);

        // Aisle markers
        ruas.forEach((_, ri) => {
            const cx = ri * ZONE_W + ZONE_W / 2;
            const aisleGeo = new THREE.PlaneGeometry(CW - 0.1, WL);
            const aisleMat = new THREE.MeshLambertMaterial({ color: 0x1e3a5f, opacity: 0.6, transparent: true });
            const aisle = new THREE.Mesh(aisleGeo, aisleMat);
            aisle.rotation.x = -Math.PI / 2;
            aisle.position.set(cx, 0.02, WL / 2);
            _scene.add(aisle);
        });

        // Rack cells
        ruas.forEach((rua, ruaIdx) => {
            const ruaAddrs = addrs.filter(a => a.rua === rua);
            const ruaPredios = [...new Set(ruaAddrs.map(a => a.predio))].sort((a, b) => +a - +b);

            ruaPredios.forEach((predio, pi) => {
                const pa = ruaAddrs.filter(a => a.predio === predio);
                const isEven = +predio % 2 === 0;
                const sideX = ruaIdx * ZONE_W + (isEven ? RD / 2 + CW / 2 : -(RD / 2 + CW / 2) + ZONE_W);
                const posZ = pi * (PW + 0.12) + PW / 2;
                const maxPNiv = Math.max(...pa.map(a => +a.nivel));

                // Uprights
                const beamGeo = new THREE.BoxGeometry(0.07, maxPNiv * PH, 0.07);
                const beamMat = new THREE.MeshLambertMaterial({ color: C.BEAM });
                [[-PW / 2 + 0.04, -RD / 2 + 0.04], [-PW / 2 + 0.04, RD / 2 - 0.04],
                 [PW / 2 - 0.04, -RD / 2 + 0.04],  [PW / 2 - 0.04, RD / 2 - 0.04]].forEach(([dx, dz]) => {
                    const b = new THREE.Mesh(beamGeo, beamMat);
                    b.position.set(sideX + dx, maxPNiv * PH / 2, posZ + dz);
                    b.castShadow = true; _scene.add(b);
                });

                // Rails & cells
                pa.forEach(loc => {
                    const nv = +loc.nivel;
                    const railY = nv * PH;
                    const rail = new THREE.Mesh(
                        new THREE.BoxGeometry(PW, 0.06, RD),
                        new THREE.MeshLambertMaterial({ color: C.RAIL })
                    );
                    rail.position.set(sideX, railY, posZ);
                    _scene.add(rail);

                    const col = new THREE.Color(C[loc.status] || C.LIVRE);
                    if (loc.status === 'LIVRE') col.multiplyScalar(0.55);
                    const cellMat = new THREE.MeshLambertMaterial({
                        color: col,
                        transparent: loc.status === 'LIVRE',
                        opacity: loc.status === 'LIVRE' ? 0.65 : 1.0,
                    });
                    if (loc.status === 'OCUPADO') cellMat.emissive = new THREE.Color(0x0d2040);

                    const cell = new THREE.Mesh(
                        new THREE.BoxGeometry(PW - 0.14, PH - 0.18, RD - 0.12),
                        cellMat
                    );
                    cell.position.set(sideX, (nv - 0.5) * PH + 0.07, posZ);
                    cell.castShadow = true;
                    cell.userData = { loc };
                    _scene.add(cell);
                    _objects.push(cell);
                });
            });
        });

        // Camera initial position
        _camera.position.set(WW / 2, maxNiv * PH * 1.4, WL * 1.8);
        _camera.lookAt(WW / 2, (maxNiv * PH) / 2, WL / 2);

        _setupControls(canvas);
        _setupRaycaster(canvas, container);
        _setupResize(container);
        _animate();
    }

    function _setupControls(canvas) {
        if (window.THREE && THREE.OrbitControls) {
            _controls = new THREE.OrbitControls(_camera, canvas);
            _controls.enableDamping = true;
            _controls.dampingFactor = 0.06;
            _controls.maxPolarAngle = Math.PI / 2.05;
            canvas.style.cursor = 'grab';
        }
    }

    function _setupResize(container) {
        _resizeObs = new ResizeObserver(() => {
            const w = container.clientWidth, h = container.clientHeight;
            if (!w || !h) return;
            _camera.aspect = w / h;
            _camera.updateProjectionMatrix();
            _renderer.setSize(w, h);
        });
        _resizeObs.observe(container);
    }

    function _setupRaycaster(canvas, container) {
        const rc = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        let hov = null;

        const tip = document.createElement('div');
        tip.id = 'wms3d-tip';
        tip.style.cssText = 'position:absolute;pointer-events:none;display:none;z-index:50;' +
            'background:rgba(15,23,42,.96);color:#f8fafc;border:1px solid #3b82f644;' +
            'border-radius:8px;padding:.5rem .75rem;font-size:.77rem;font-family:Inter,sans-serif;' +
            'line-height:1.6;backdrop-filter:blur(8px);box-shadow:0 8px 32px rgba(0,0,0,.6);';
        container.appendChild(tip);

        canvas.addEventListener('mousemove', e => {
            const rect = canvas.getBoundingClientRect();
            mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
            mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
            rc.setFromCamera(mouse, _camera);
            const hits = rc.intersectObjects(_objects);
            if (hits.length > 0) {
                const obj = hits[0].object;
                if (hov !== obj) {
                    if (hov) hov.material.emissive && hov.material.emissive.set(0x000000);
                    hov = obj;
                    obj.material.emissive && obj.material.emissive.set(0x223355);
                }
                const { loc } = obj.userData;
                const badge = { LIVRE:'🟢', OCUPADO:'🔵', BLOQUEADO:'🟡' }[loc.status] || '⚪';
                tip.innerHTML = `<div style="font-weight:700;font-family:monospace;color:#818cf8">${loc.id}</div>
                    <div>Rua <b>${loc.rua}</b> · Prédio <b>${loc.predio}</b> · Nível <b>${loc.nivel}</b></div>
                    <div>${badge} <b>${loc.status}</b>${loc.tipo ? ' · ' + loc.tipo : ''}</div>
                    ${loc.product ? `<div style="color:#94a3b8;font-size:.7rem">${loc.product}</div>` : ''}`;
                const cRect = container.getBoundingClientRect();
                tip.style.left = (e.clientX - cRect.left + 14) + 'px';
                tip.style.top  = (e.clientY - cRect.top  - 10) + 'px';
                tip.style.display = 'block';
                canvas.style.cursor = 'pointer';
            } else {
                if (hov) { hov.material.emissive && hov.material.emissive.set(0x000000); hov = null; }
                tip.style.display = 'none';
                canvas.style.cursor = 'grab';
            }
        });

        canvas.addEventListener('mouseleave', () => {
            if (hov) { hov.material.emissive && hov.material.emissive.set(0x000000); hov = null; }
            tip.style.display = 'none';
        });

        canvas.addEventListener('click', e => {
            rc.setFromCamera(mouse, _camera);
            const hits = rc.intersectObjects(_objects);
            if (hits.length > 0) wms3dShowDetail(hits[0].object.userData.loc);
        });
    }

    function _animate() {
        _animId = requestAnimationFrame(_animate);
        if (_controls) _controls.update();
        _renderer.render(_scene, _camera);
    }

    return { init, destroy };
})();

// ── Detail Popup ────────────────────────────────────────────────────────────
window.wms3dShowDetail = function(loc) {
    let modal = document.getElementById('wms3d-detail');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'wms3d-detail';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.7);z-index:9000;display:flex;align-items:center;justify-content:center;';
        modal.onclick = e => { if (e.target === modal) modal.style.display = 'none'; };
        document.body.appendChild(modal);
    }
    const statusColor = { LIVRE:'#10b981', OCUPADO:'#3b82f6', BLOQUEADO:'#f59e0b' }[loc.status] || '#94a3b8';
    modal.innerHTML = `
    <div class="card" style="width:360px;animation:slideUp .25s ease;">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
            <h3 style="font-family:monospace;font-size:1rem;color:#818cf8;">${loc.id}</h3>
            <span class="material-icons-round" style="cursor:pointer;" onclick="document.getElementById('wms3d-detail').style.display='none'">close</span>
        </div>
        <div style="padding:1.25rem;display:flex;flex-direction:column;gap:.75rem;">
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.5rem;text-align:center;">
                ${[['Rua',loc.rua],['Prédio',loc.predio],['Nível',loc.nivel]].map(([l,v])=>`
                <div style="background:rgba(99,102,241,.1);border-radius:8px;padding:.5rem;">
                    <div style="font-size:.65rem;color:#94a3b8;text-transform:uppercase;">${l}</div>
                    <div style="font-weight:700;font-size:1.1rem;">${v}</div>
                </div>`).join('')}
            </div>
            <div style="display:flex;align-items:center;gap:.5rem;">
                <span style="background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}44;
                    border-radius:6px;padding:.2rem .65rem;font-size:.8rem;font-weight:700;">${loc.status}</span>
                ${loc.tipo ? `<span style="font-size:.8rem;color:#64748b;">${loc.tipo}</span>` : ''}
            </div>
            ${loc.product ? `<div><div style="font-size:.7rem;color:#64748b;margin-bottom:.2rem;">PRODUTO</div>
                <div style="font-weight:600;">${loc.product}</div>
                ${loc.sku ? `<div style="font-family:monospace;font-size:.8rem;color:#94a3b8;">${loc.sku}</div>` : ''}</div>` : ''}
            ${loc.qty ? `<div style="display:flex;gap:.5rem;">
                <div style="background:rgba(59,130,246,.1);border-radius:6px;padding:.4rem .75rem;">
                    <div style="font-size:.65rem;color:#94a3b8;">QTD</div>
                    <div style="font-weight:700;color:#3b82f6;">${loc.qty} ${loc.unit||'UN'}</div>
                </div></div>` : ''}
        </div>
        <div style="padding:.75rem 1.25rem;border-top:1px solid var(--border-color);text-align:right;">
            <button class="btn btn-primary btn-sm" onclick="document.getElementById('wms3d-detail').style.display='none'">Fechar</button>
        </div>
    </div>`;
    modal.style.display = 'flex';
};


// ── Config Panel Renderer ────────────────────────────────────────────────────

function _corrRow(c) {
    return `<tr style="border-top:1px solid var(--border-color)44;">
        <td style="padding:.3rem .4rem"><input class="form-input corr-id" style="width:48px;padding:.25rem .35rem;font-size:.74rem;font-weight:700;text-transform:uppercase;" value="${c.id||''}"></td>
        <td style="padding:.3rem .4rem"><input class="form-input corr-nome" style="width:100%;padding:.25rem .35rem;font-size:.74rem;" value="${c.nome||''}"></td>
        <td style="padding:.3rem .4rem"><input class="form-input corr-larg" type="number" step="0.1" style="width:60px;padding:.25rem .35rem;font-size:.74rem;" value="${c.largura||2.5}"></td>
        <td style="padding:.3rem .4rem"><input class="form-input corr-comp" type="number" step="1" style="width:60px;padding:.25rem .35rem;font-size:.74rem;" value="${c.comprimento||0}"></td>
        <td style="padding:.3rem .2rem;text-align:center"><button onclick="this.closest('tr').remove()" style="background:none;border:none;cursor:pointer;color:#ef4444;padding:0"><span class="material-icons-round" style="font-size:.95rem">delete</span></button></td>
    </tr>`;
}

function _tipoRow(t) {
    return `<tr style="border-top:1px solid var(--border-color)44;">
        <td style="padding:.3rem .4rem"><input class="form-input tipo-cod" style="width:52px;padding:.25rem .35rem;font-size:.74rem;font-weight:700;text-transform:uppercase;" value="${t.codigo||''}"></td>
        <td style="padding:.3rem .4rem"><input class="form-input tipo-desc" style="width:100%;padding:.25rem .35rem;font-size:.74rem;" value="${t.descricao||''}"></td>
        <td style="padding:.3rem .4rem"><input class="form-input tipo-larg" type="number" step="0.1" style="width:52px;padding:.25rem .35rem;font-size:.74rem;" value="${t.largura||1.2}"></td>
        <td style="padding:.3rem .4rem"><input class="form-input tipo-prof" type="number" step="0.1" style="width:52px;padding:.25rem .35rem;font-size:.74rem;" value="${t.profundidade||0.8}"></td>
        <td style="padding:.3rem .4rem"><input class="form-input tipo-alt" type="number" step="0.1" style="width:52px;padding:.25rem .35rem;font-size:.74rem;" value="${t.alturaProxNivel||2.0}"></td>
        <td style="padding:.3rem .4rem"><input class="form-input tipo-cap" type="number" step="50" style="width:58px;padding:.25rem .35rem;font-size:.74rem;" value="${t.capacidadeKg||500}"></td>
        <td style="padding:.3rem .2rem;text-align:center"><button onclick="this.closest('tr').remove()" style="background:none;border:none;cursor:pointer;color:#ef4444;padding:0"><span class="material-icons-round" style="font-size:.95rem">delete</span></button></td>
    </tr>`;
}

function _thStyle() { return 'padding:.3rem .4rem;text-align:left;color:var(--text-secondary);font-size:.7rem;font-weight:600;white-space:nowrap;border-bottom:1px solid var(--border-color);'; }

window.wms3dRenderConfig = function(panel) {
    if (!panel) return;
    const cfg      = JSON.parse(localStorage.getItem('wms_armazem_config') || '{}');
    const corredores = cfg.corredores || [];
    const tipos    = cfg.tiposEndereco || [];
    const ordem    = cfg.ordemCorredores || 'esquerda_direita';

    if (!document.getElementById('_wms3d-cfg-css')) {
        const s = document.createElement('style'); s.id = '_wms3d-cfg-css';
        s.textContent = '.cfg-sec{font-size:.7rem;font-weight:700;color:#818cf8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.5rem;display:flex;justify-content:space-between;align-items:center;}.cfg-lbl{font-size:.7rem;color:var(--text-secondary);display:block;margin-bottom:.2rem;}';
        document.head.appendChild(s);
    }

    panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.85rem;">
        <strong style="font-size:.88rem;display:flex;align-items:center;gap:.4rem;">
            <span class="material-icons-round" style="font-size:1rem;color:#818cf8;">tune</span>
            Configuração do Armazém
        </strong>
        <span class="material-icons-round" style="cursor:pointer;color:var(--text-secondary);"
            onclick="document.getElementById('wms3d-cfg-panel').style.display='none'">close</span>
    </div>

    <div style="display:flex;flex-direction:column;gap:1rem;font-size:.82rem;">

        <!-- 1. Identificação -->
        <div>
            <div class="cfg-sec">🏷️ Identificação</div>
            <label class="cfg-lbl">Nome do Armazém / CD</label>
            <input id="wms3d-cfg-nome" class="form-input" style="width:100%;" value="${cfg.nomeArmazem||''}">
        </div>

        <!-- 2. Galpão -->
        <div>
            <div class="cfg-sec">📐 Dimensões do Galpão</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.4rem;">
                <div><label class="cfg-lbl">Comprimento (m)</label>
                    <input id="wms3d-cfg-comp" type="number" class="form-input" style="width:100%;" value="${cfg.comprimento||0}" step="1"></div>
                <div><label class="cfg-lbl">Largura Total (m)</label>
                    <input id="wms3d-cfg-lt" type="number" class="form-input" style="width:100%;" value="${cfg.larguraTotal||0}" step="1"></div>
                <div><label class="cfg-lbl">Pé Direito (m)</label>
                    <input id="wms3d-cfg-pe" type="number" class="form-input" style="width:100%;" value="${cfg.peDir||0}" step="0.5"></div>
            </div>
        </div>

        <!-- 3. Corredores -->
        <div>
            <div class="cfg-sec">
                <span>🚶 Corredores</span>
                <button class="btn btn-secondary" style="font-size:.7rem;padding:.2rem .5rem;"
                    onclick="wms3dAddCorredor()">
                    <span class="material-icons-round" style="font-size:.8rem;">add</span> Adicionar
                </button>
            </div>

            <!-- Ordem -->
            <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;flex-wrap:wrap;">
                <span style="font-size:.7rem;color:var(--text-secondary);">Ordem:</span>
                <button id="btn-ordem-ed" onclick="wms3dSetOrdem('esquerda_direita')"
                    class="btn ${ordem==='esquerda_direita'?'btn-primary':'btn-secondary'}"
                    style="font-size:.7rem;padding:.22rem .5rem;">⬅ Esquerda → Direita</button>
                <button id="btn-ordem-de" onclick="wms3dSetOrdem('direita_esquerda')"
                    class="btn ${ordem==='direita_esquerda'?'btn-primary':'btn-secondary'}"
                    style="font-size:.7rem;padding:.22rem .5rem;">➡ Direita → Esquerda</button>
            </div>

            <div style="overflow-x:auto;border:1px solid var(--border-color);border-radius:8px;">
                <table style="width:100%;border-collapse:collapse;">
                    <thead><tr style="background:var(--bg-dark);">
                        <th style="${_thStyle()}">ID</th>
                        <th style="${_thStyle()}">Nome/Rua</th>
                        <th style="${_thStyle()}">Larg.(m)</th>
                        <th style="${_thStyle()}">Comp.(m)</th>
                        <th style="${_thStyle()}width:24px;"></th>
                    </tr></thead>
                    <tbody id="wms3d-corredores-tbody">
                        ${corredores.map(_corrRow).join('')}
                        ${corredores.length===0?'<tr><td colspan="5" style="text-align:center;padding:.75rem;color:var(--text-secondary);font-size:.75rem;">Nenhum corredor. Clique em Adicionar.</td></tr>':''}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- 4. Tipos de Endereço -->
        <div>
            <div class="cfg-sec">
                <span>📦 Tipos de Endereço</span>
                <button class="btn btn-secondary" style="font-size:.7rem;padding:.2rem .5rem;"
                    onclick="wms3dAddTipoEndereco()">
                    <span class="material-icons-round" style="font-size:.8rem;">add</span> Adicionar
                </button>
            </div>
            <div style="overflow-x:auto;border:1px solid var(--border-color);border-radius:8px;">
                <table style="width:100%;border-collapse:collapse;min-width:460px;">
                    <thead><tr style="background:var(--bg-dark);">
                        <th style="${_thStyle()}">Cód.</th>
                        <th style="${_thStyle()}">Descrição</th>
                        <th style="${_thStyle()}">Larg.(m)</th>
                        <th style="${_thStyle()}">Prof.(m)</th>
                        <th style="${_thStyle()}">Alt.Nív.(m)</th>
                        <th style="${_thStyle()}">Cap.(kg)</th>
                        <th style="${_thStyle()}width:24px;"></th>
                    </tr></thead>
                    <tbody id="wms3d-tipos-tbody">
                        ${tipos.map(_tipoRow).join('')}
                        ${tipos.length===0?'<tr><td colspan="7" style="text-align:center;padding:.75rem;color:var(--text-secondary);font-size:.75rem;">Nenhum tipo cadastrado.</td></tr>':''}
                    </tbody>
                </table>
            </div>
            <div style="font-size:.68rem;color:var(--text-secondary);margin-top:.35rem;">
                💡 Os tipos serão selecionáveis no cadastro de endereços e no gerador em massa.
            </div>
        </div>

        <!-- 5. Dimensões 3D (fallback) -->
        <div>
            <div class="cfg-sec">🎨 Dimensões Padrão 3D (fallback)</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem;">
                <div><label class="cfg-lbl">Largura Vaga (m)</label>
                    <input id="wms3d-cfg-pw" type="number" class="form-input" style="width:100%;" value="${cfg.posLargura||1.2}" step="0.1"></div>
                <div><label class="cfg-lbl">Altura por Nível (m)</label>
                    <input id="wms3d-cfg-ph" type="number" class="form-input" style="width:100%;" value="${cfg.posAltura||2.0}" step="0.1"></div>
                <div><label class="cfg-lbl">Profundidade Rack (m)</label>
                    <input id="wms3d-cfg-rd" type="number" class="form-input" style="width:100%;" value="${cfg.profundidade||0.8}" step="0.1"></div>
                <div><label class="cfg-lbl">Largura Corredor (m)</label>
                    <input id="wms3d-cfg-cw" type="number" class="form-input" style="width:100%;" value="${cfg.corridorWidth||2.5}" step="0.1"></div>
            </div>
        </div>

        <button class="btn btn-primary" style="width:100%;" onclick="wms3dSaveConfig()">
            <span class="material-icons-round" style="font-size:1rem;vertical-align:middle;">save</span>
            Salvar e Recarregar 3D
        </button>
    </div>`;
};

window.wms3dAddCorredor = function() {
    const tbody = document.getElementById('wms3d-corredores-tbody');
    if (!tbody) return;
    const n = tbody.querySelectorAll('tr').length + 1;
    // Remove empty state row if present
    if (tbody.querySelector('td[colspan]')) tbody.innerHTML = '';
    tbody.insertAdjacentHTML('beforeend', _corrRow({ id: `C${n}`, nome: `Corredor ${n}`, largura: 2.5, comprimento: 0 }));
};

window.wms3dAddTipoEndereco = function() {
    const tbody = document.getElementById('wms3d-tipos-tbody');
    if (!tbody) return;
    if (tbody.querySelector('td[colspan]')) tbody.innerHTML = '';
    tbody.insertAdjacentHTML('beforeend', _tipoRow({ codigo: 'TIPO', descricao: 'Novo Tipo', largura: 1.2, profundidade: 0.8, alturaProxNivel: 2.0, capacidadeKg: 500 }));
};

window.wms3dSetOrdem = function(ordem) {
    const ed = document.getElementById('btn-ordem-ed');
    const de = document.getElementById('btn-ordem-de');
    if (!ed || !de) return;
    ed.className = 'btn ' + (ordem === 'esquerda_direita' ? 'btn-primary' : 'btn-secondary');
    de.className = 'btn ' + (ordem === 'direita_esquerda' ? 'btn-primary' : 'btn-secondary');
    ed.style.cssText = 'font-size:.7rem;padding:.22rem .5rem;';
    de.style.cssText = 'font-size:.7rem;padding:.22rem .5rem;';
};

window.wms3dSaveConfig = function() {
    // Corredores
    const corredores = [];
    document.querySelectorAll('#wms3d-corredores-tbody tr').forEach(tr => {
        const id = tr.querySelector('.corr-id')?.value?.trim().toUpperCase();
        if (!id) return;
        corredores.push({
            id, nome: tr.querySelector('.corr-nome')?.value?.trim() || id,
            largura:     +(tr.querySelector('.corr-larg')?.value) || 2.5,
            comprimento: +(tr.querySelector('.corr-comp')?.value) || 0,
        });
    });

    // Tipos
    const tiposEndereco = [];
    document.querySelectorAll('#wms3d-tipos-tbody tr').forEach(tr => {
        const codigo = tr.querySelector('.tipo-cod')?.value?.trim().toUpperCase();
        if (!codigo) return;
        tiposEndereco.push({
            codigo, descricao: tr.querySelector('.tipo-desc')?.value?.trim() || codigo,
            largura:         +(tr.querySelector('.tipo-larg')?.value) || 1.2,
            profundidade:    +(tr.querySelector('.tipo-prof')?.value) || 0.8,
            alturaProxNivel: +(tr.querySelector('.tipo-alt')?.value)  || 2.0,
            capacidadeKg:    +(tr.querySelector('.tipo-cap')?.value)  || 500,
        });
    });

    const ordemBtn = document.getElementById('btn-ordem-ed');
    const ordem = ordemBtn?.classList.contains('btn-primary') ? 'esquerda_direita' : 'direita_esquerda';

    const cfg = {
        nomeArmazem:    document.getElementById('wms3d-cfg-nome')?.value  || 'CD',
        comprimento:   +document.getElementById('wms3d-cfg-comp')?.value  || 0,
        larguraTotal:  +document.getElementById('wms3d-cfg-lt')?.value    || 0,
        peDir:         +document.getElementById('wms3d-cfg-pe')?.value    || 0,
        posLargura:    +document.getElementById('wms3d-cfg-pw')?.value    || 1.2,
        posAltura:     +document.getElementById('wms3d-cfg-ph')?.value    || 2.0,
        profundidade:  +document.getElementById('wms3d-cfg-rd')?.value    || 0.8,
        corridorWidth: +document.getElementById('wms3d-cfg-cw')?.value    || 2.5,
        ordemCorredores: ordem,
        corredores,
        tiposEndereco,
    };

    localStorage.setItem('wms_armazem_config', JSON.stringify(cfg));

    const wrap = document.getElementById('wms3d-canvas-wrap');
    if (wrap && window.WMS3D) { wrap.innerHTML = ''; WMS3D.init(wrap); }
    document.getElementById('wms3d-cfg-panel').style.display = 'none';
    alert(`✅ Configuração salva!\n${corredores.length} corredor(es) · ${tiposEndereco.length} tipo(s) de endereço`);
};

// Export tipos helper (used by locations.js)
window.wms3dGetTiposEndereco = function() {
    const cfg = JSON.parse(localStorage.getItem('wms_armazem_config') || '{}');
    return cfg.tiposEndereco || [];
};

console.log('📦 WMS 3D Viewer carregado');
