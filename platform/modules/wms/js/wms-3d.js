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
        return Object.assign(d, JSON.parse(localStorage.getItem('wms_armazem_config' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '{}'));
    }

    function _addresses() {
        if (window.locationsState && window.locationsState.gridData && window.locationsState.gridData.length > 0) {
            return window.locationsState.gridData;
        }
        const suf = window.getTenantSuffix ? window.getTenantSuffix() : '';
        return JSON.parse(localStorage.getItem('wms_mock_data' + suf) || '[]');
    }

    // Merge addresses with stock and task data to produce display status
    function _mergeStatus(addrs) {
        const suf = window.getTenantSuffix ? window.getTenantSuffix() : '';
        const estoque = JSON.parse(localStorage.getItem('wms_estoque' + suf) || '[]');
        const tarefas = JSON.parse(localStorage.getItem('wms_tarefas' + suf) || '[]');
        const stockMap = {};
        estoque.forEach(s => stockMap[s.enderecoId] = s);
        const taskSet = new Set(tarefas.filter(t => t.status === 'pendente').map(t => t.enderecoId));

        return addrs.map(a => {
            let st = a.status || 'LIVRE';
            const s = stockMap[a.id];
            if (st === 'BLOQUEADO') return { ...a, _status: 'BLOQUEADO', _stock: s };
            if (taskSet.has(a.id))  return { ...a, _status: 'TAREFA',    _stock: s };
            if (s) {
                if (s.qtdMin > 0 && s.qtd < s.qtdMin) return { ...a, _status: 'DESABASTECIDO', _stock: s };
                return { ...a, _status: 'OCUPADO', _stock: s };
            }
            // Se o endereço foi importado como OCUPADO (ex: tem produto_vinculado) mas ainda não tem estoque
            if (st === 'OCUPADO') return { ...a, _status: 'OCUPADO', _stock: null };
            
            return { ...a, _status: 'LIVRE', _stock: null };
        });
    }

    // Status colors
    const SC = {
        LIVRE:         new THREE.Color(0x10b981).multiplyScalar(0.35),
        OCUPADO:       new THREE.Color(0x3b82f6),
        DESABASTECIDO: new THREE.Color(0xef4444),
        TAREFA:        new THREE.Color(0xf59e0b),
        BLOQUEADO:     new THREE.Color(0x6b7280),
    };

    function getStats() {
        const merged = _mergeStatus(_addresses());
        const r = { total: merged.length, LIVRE:0, OCUPADO:0, DESABASTECIDO:0, TAREFA:0, BLOQUEADO:0 };
        merged.forEach(a => r[a._status] = (r[a._status]||0) + 1);
        return r;
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
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;gap:.75rem;color:#64748b;font-size:.9rem;"><span class="material-icons-round" style="animation:spin 1s linear infinite;font-size:1.5rem">refresh</span>Carregando 3D...</div>';
        setTimeout(() => _build(container), 60);
    }

    let _cellInstMesh = null;   // InstancedMesh for cells (raycasting target)
    let _addrList     = [];     // parallel array: addrList[i] = merged addr for cell instance i

    function _build(container) {
        container.innerHTML = '';
        const cfg   = _cfg();
        const raw   = _addresses();
        const addrs = _mergeStatus(raw);
        const PW = cfg.posLargura, PH = cfg.posAltura, RD = cfg.profundidade, CW = cfg.corridorWidth;
        const ZONE_W = RD * 2 + CW;

        _scene = new THREE.Scene();
        _scene.background = new THREE.Color(0x0f172a);
        _scene.fog = new THREE.FogExp2(0x0f172a, 0.008);

        const W = container.clientWidth || 800, H = container.clientHeight || 500;
        // Camera far plane will be updated after WL is computed
        _camera = new THREE.PerspectiveCamera(50, W/H, 0.1, 2000);

        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'width:100%;height:100%;display:block;';
        container.appendChild(canvas);
        _renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        _renderer.setSize(W, H);
        _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

        _scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const sun = new THREE.DirectionalLight(0xffffff, 0.8);
        sun.position.set(40, 80, 40);
        _scene.add(sun);

        if (addrs.length === 0) {
            _scene.add(new THREE.GridHelper(40, 20, 0x1e293b, 0x1e293b));
            _camera.position.set(0, 20, 30); _camera.lookAt(0,0,0);
            _setupControls(canvas); _animate();
            const m = document.createElement('div');
            m.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:#64748b;pointer-events:none;';
            m.innerHTML = '<span class="material-icons-round" style="font-size:2.5rem;opacity:.3">warehouse</span><div style="font-size:.9rem;margin-top:.5rem">Nenhum endereço cadastrado</div>';
            container.appendChild(m);
            return;
        }

        // ── Layout helpers ──────────────────────────────────────────────────
        // Odd predios = LEFT side, Even predios = RIGHT side
        const ruas = [...new Set(addrs.map(a => a.rua))].sort();
        
        // Sentido dos prédios
        const descPredios = (cfg.ordemPredios === 'descendente');

        // Mapear largura configurada dos corredores
        const cwCfg = cfg.corredores || [];
        const getCW = (ruaNome) => {
            const rnPad = String(ruaNome).padStart(2, '0');
            const rnNum = String(parseInt(ruaNome, 10));
            const c = cwCfg.find(x => {
                if (!x) return false;
                const n = String(x.nome || '').trim();
                const i = String(x.id || '').trim();
                return n === ruaNome || i === ruaNome || 
                       n.padStart(2, '0') === rnPad || i.padStart(2, '0') === rnPad ||
                       n === rnNum || i === rnNum;
            });
            return c && c.largura ? +c.largura : CW;
        };

        // Acumular X baseando-se nas larguras individuais de cada rua
        const ruaXLeft = {};
        const ruaXRight = {};
        const ruaAisleX = {}; // Center of the aisle for floor stripes
        let currentX = 0;
        
        ruas.forEach((rua) => {
            const ruaCW = getCW(rua);
            // Each aisle zone is Rack Left + Corridor + Rack Right
            ruaXLeft[rua] = currentX + RD / 2;
            ruaAisleX[rua] = currentX + RD + ruaCW / 2;
            ruaXRight[rua] = currentX + RD + ruaCW + RD / 2;
            currentX += (RD * 2 + ruaCW);
        });
        const WW = currentX;

        // ── Tipos de Endereço → dimensões por tipo ──────────────────────────
        const cadSuf   = window.getTenantSuffix ? window.getTenantSuffix() : '';
        const cadData  = JSON.parse(localStorage.getItem('wms_cadastros' + cadSuf) || '{}');
        const tiposCad = cadData.enderecoTipo || [];
        // Normalize (remove accents, uppercase) for matching addr.tipo strings
        const _norm = s => (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
        const tipoMap = {};
        tiposCad.forEach(t => {
            const key = _norm(t.nome || t.categoria || t.codigo);
            tipoMap[key] = {
                PW: +(t.larguraCelula   || cfg.posLargura),
                PH: +(t.alturaCelula    || cfg.posAltura),
                RD: +(t.profundidadeCelula || cfg.profundidade),
            };
        });
        const getDims = (addr) => tipoMap[_norm(addr.tipo)] || { PW, PH, RD };

        // Calcular limites globais de pares para alinhar corredores
        const validPredios = addrs.map(a => +a.predio).filter(p => !isNaN(p));
        const maxPredioN = Math.max(...validPredios, 1);
        const numPairs = Math.ceil(maxPredioN / 2);

        // Calculate physical width of each GLOBAL pair based on its largest cell configuration anywhere in the warehouse
        const globalPairWidths = [];
        for (let pairVal = 0; pairVal < numPairs; pairVal++) {
            let maxW = 0;
            // The predios in this pair are (pairVal*2 + 1) and (pairVal*2 + 2)
            const p1 = String(pairVal * 2 + 1).padStart(2, '0');
            const p2 = String(pairVal * 2 + 2).padStart(2, '0');
            const addrsInPair = addrs.filter(a => String(a.predio).padStart(2, '0') === p1 || String(a.predio).padStart(2, '0') === p2);
            
            if (addrsInPair.length > 0) {
                const ruasInPair = [...new Set(addrsInPair.map(a => a.rua))];
                ruasInPair.forEach(r => {
                    [p1, p2].forEach(p => {
                        const pa = addrsInPair.filter(a => a.rua === r && String(a.predio).padStart(2, '0') === p);
                        if (pa.length === 0) return;
                        
                        const niveis = [...new Set(pa.map(a => a.nivel))];
                        niveis.forEach(nv => {
                            const paNiv = pa.filter(a => a.nivel === nv);
                            const maxPos = Math.max(...paNiv.map(a => +a.posicao));
                            const dims = getDims(paNiv[0]);
                            const w = maxPos * dims.PW;
                            if (w > maxW) maxW = w;
                        });
                    });
                });
            }
            globalPairWidths[pairVal] = maxW > 0 ? maxW : PW; // fallback
        }

        // Compute Z start for each global pair
        const globalPairZStarts = [];
        let currentZ = 0;
        if (descPredios) {
            for (let pairVal = numPairs - 1; pairVal >= 0; pairVal--) {
                globalPairZStarts[pairVal] = currentZ;
                currentZ += globalPairWidths[pairVal] + 0.3; // + gap
            }
        } else {
            for (let pairVal = 0; pairVal < numPairs; pairVal++) {
                globalPairZStarts[pairVal] = currentZ;
                currentZ += globalPairWidths[pairVal] + 0.3; // + gap
            }
        }
        const maxWL = currentZ;

        const predioList = [];
        ruas.forEach((rua, ri) => {
            const ruaA = addrs.filter(a => a.rua === rua);
            const rp = [...new Set(ruaA.map(a => String(a.predio).padStart(2, '0')))].sort((a,b)=>+a-+b);
            rp.forEach(p => predioList.push({ rua, predio: p, ri }));
        });

        const WL = maxWL > 0 ? maxWL : 20; // Fallback if no addrs
        const validNiveis = addrs.map(a => +a.nivel).filter(n => !isNaN(n));
        const maxNiv = Math.max(...validNiveis, 1);

        // Floor + grid
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(WW+12, WL+12), new THREE.MeshLambertMaterial({ color: 0x0a1122 }));
        floor.rotation.x = -Math.PI/2; floor.position.set(WW/2, 0, WL/2);
        _scene.add(floor);
        const grid = new THREE.GridHelper(Math.max(WW,WL)+14, 28, 0x1e293b, 0x1e293b);
        grid.position.set(WW/2, 0.01, WL/2); _scene.add(grid);

        // Aisle stripes — using the precise aisle center mapped earlier
        ruas.forEach((rua) => {
            const aisleX = ruaAisleX[rua];
            const ruaCW = getCW(rua);
            const m = new THREE.Mesh(new THREE.PlaneGeometry(ruaCW-0.1, WL), new THREE.MeshLambertMaterial({ color:0x1e3a5f, transparent:true, opacity:0.5 }));
            m.rotation.x = -Math.PI/2; m.position.set(aisleX, 0.02, WL/2);
            _scene.add(m);
        });

        // ── InstancedMesh: CELLS (unit cube — scaled per instance) ────────────
        const cellGeo  = new THREE.BoxGeometry(1, 1, 1);
        const cellMat  = new THREE.MeshLambertMaterial();
        _cellInstMesh  = new THREE.InstancedMesh(cellGeo, cellMat, addrs.length);
        _cellInstMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        _addrList = [];

        // ── InstancedMesh: RAILS ────────────────────────────────────────────
        const railGeo = new THREE.BoxGeometry(1, 0.06, 1);
        const railMat = new THREE.MeshLambertMaterial({ color: 0x475569 });
        const railMesh = new THREE.InstancedMesh(railGeo, railMat, addrs.length);

        // ── InstancedMesh: BEAMS — 2 per predio (start and end of Z span) ──
        const beamGeo = new THREE.BoxGeometry(0.07, maxNiv*PH, 0.07);
        const beamMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
        const beamMesh = new THREE.InstancedMesh(beamGeo, beamMat, predioList.length * 4);

        const dummy = new THREE.Object3D();
        let iCell = 0, iRail = 0, iBeam = 0;

        ruas.forEach((rua) => {
            const ruaA = addrs.filter(a => a.rua === rua);
            const rp = [...new Set(ruaA.map(a => a.predio))].sort((a,b)=>+a-+b);

            rp.forEach(predio => {
                const pa = ruaA.filter(a => a.predio === predio);
                const isEven = +predio % 2 === 0;

                // ── X: odd=left, even=right ─────────────────────────────────
                const sX = isEven ? ruaXRight[rua] : ruaXLeft[rua];

                // ── Base Z for this Predio ──────────────────────────────────
                const pairVal = Math.floor((+predio - 1) / 2);
                const zBase = globalPairZStarts[pairVal];

                // Determine the maximum Z span of this predio for placing beams
                let predioZMaxSpan = 0;
                pa.forEach(loc => {
                    const dims = getDims(loc);
                    const posSpan = (+loc.posicao) * dims.PW;
                    if (posSpan > predioZMaxSpan) predioZMaxSpan = posSpan;
                });

                // ── Uprights at start & end of this predio's Z span ─────────
                const zStart = zBase;
                const zEnd = zBase + predioZMaxSpan;
                
                [[zStart,-RD/2+0.04],[zStart,RD/2-0.04],[zEnd,-RD/2+0.04],[zEnd,RD/2-0.04]].forEach(([bz,dz]) => {
                    dummy.position.set(sX, maxNiv*PH/2, bz+dz);
                    dummy.updateMatrix(); beamMesh.setMatrixAt(iBeam++, dummy.matrix);
                });

                pa.forEach(loc => {
                    const nv   = +loc.nivel;
                    const pos  = +loc.posicao;
                    const dims = getDims(loc);
                    
                    // Center Z of this specific cell block
                    const cz = zBase + (pos - 1) * dims.PW + dims.PW / 2;
                    
                    // Rail
                    dummy.scale.set(dims.PW, 1, dims.RD);
                    dummy.position.set(sX, nv*dims.PH, cz);
                    dummy.updateMatrix(); railMesh.setMatrixAt(iRail++, dummy.matrix);
                    
                    // Cell — scaled by tipo dimensions
                    dummy.scale.set(dims.PW - 0.14, dims.PH - 0.18, dims.RD - 0.12);
                    dummy.position.set(sX, (nv-0.5)*dims.PH + 0.07, cz);
                    dummy.updateMatrix(); _cellInstMesh.setMatrixAt(iCell, dummy.matrix);
                    
                    dummy.scale.set(1, 1, 1); // reset for beams
                    _cellInstMesh.setColorAt(iCell, SC[loc._status] || SC.LIVRE);
                    _addrList[iCell] = loc;
                    iCell++;
                });
            });
        });

        _cellInstMesh.instanceMatrix.needsUpdate = true;
        _cellInstMesh.instanceColor.needsUpdate  = true;
        railMesh.instanceMatrix.needsUpdate      = true;
        beamMesh.instanceMatrix.needsUpdate      = true;
        _scene.add(_cellInstMesh); _scene.add(railMesh); _scene.add(beamMesh);

        // Dynamic far plane based on scene diagonal
        const sceneDiag = Math.sqrt(WW*WW + WL*WL + (maxNiv*PH)*(maxNiv*PH));
        _camera.far = Math.max(2000, sceneDiag * 3);
        _camera.updateProjectionMatrix();

        _camera.position.set(WW/2, maxNiv*PH*1.5, WL*1.6);
        _camera.lookAt(WW/2, (maxNiv*PH)/2, WL/2);


        _setupControls(canvas, WW/2, (maxNiv*PH)/2, WL/2);
        _setupRaycaster(canvas, container);
        _setupResize(container);
        _animate();
    }

    function _setupControls(canvas, targetX, targetY, targetZ) {
        if (window.THREE && THREE.OrbitControls) {
            _controls = new THREE.OrbitControls(_camera, canvas);
            _controls.enableDamping = true;
            _controls.dampingFactor = 0.06;
            _controls.maxPolarAngle = Math.PI / 2.05;
            if (targetX !== undefined) {
                _controls.target.set(targetX, targetY, targetZ);
                _controls.update();
            }
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
            const hits = _cellInstMesh ? rc.intersectObject(_cellInstMesh) : [];
            if (hits.length > 0) {
                const iid = hits[0].instanceId;
                const loc = _addrList[iid];
                if (!loc) return;
                const badge = { LIVRE:'🟢', OCUPADO:'🔵', DESABASTECIDO:'🔴', TAREFA:'🟡', BLOQUEADO:'⛔' }[loc._status] || '⚪';
                const s = loc._stock;
                tip.innerHTML = `<div style="font-weight:700;font-family:monospace;color:#818cf8">${loc.id}</div>
                    <div>Rua <b>${loc.rua}</b> · Prédio <b>${loc.predio}</b> · Nível <b>${loc.nivel}</b></div>
                    <div>${badge} <b>${loc._status}</b>${loc.tipo ? ' · ' + loc.tipo : ''}</div>
                    ${s ? `<div style="color:#94a3b8;font-size:.72rem;margin-top:2px">${s.produto||s.sku||''} · Qtd: <b>${s.qtd}</b>${s.qtdMin?` / Mín: ${s.qtdMin}`:''}</div>` : ''}`;
                const cRect = container.getBoundingClientRect();
                tip.style.left = (e.clientX - cRect.left + 14) + 'px';
                tip.style.top  = (e.clientY - cRect.top  - 10) + 'px';
                tip.style.display = 'block';
                canvas.style.cursor = 'pointer';
            } else {
                tip.style.display = 'none';
                canvas.style.cursor = 'grab';
            }
        });

        canvas.addEventListener('mouseleave', () => {
            tip.style.display = 'none';
        });

        canvas.addEventListener('click', e => {
            const rect = canvas.getBoundingClientRect();
            const m = new THREE.Vector2(
                ((e.clientX - rect.left) / rect.width)  * 2 - 1,
               -((e.clientY - rect.top)  / rect.height) * 2 + 1
            );
            rc.setFromCamera(m, _camera);
            const hits = _cellInstMesh ? rc.intersectObject(_cellInstMesh) : [];
            if (hits.length > 0) {
                const loc = _addrList[hits[0].instanceId];
                if (loc && window.wms3dShowDetail) wms3dShowDetail(loc);
            }
        });
    }

    function _animate() {
        if (!_renderer || !_scene || !_camera) return;
        _animId = requestAnimationFrame(_animate);
        if (_controls) _controls.update();
        _renderer.render(_scene, _camera);
    }

    function reload() {
        // Rebuild the 3D scene in-place if a container is already visible
        const wrap = document.querySelector('#view-dashboard [data-wms3d-wrap]');
        if (wrap) { destroy(); init(wrap); }
    }

    return { init, destroy, getStats, reload };
})();

// Spin animation for loading indicator
if (!document.getElementById('wms3d-spin-style')) {
    const s = document.createElement('style');
    s.id = 'wms3d-spin-style';
    s.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(s);
}


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
    const cfg      = JSON.parse(localStorage.getItem('wms_armazem_config' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '{}');
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

            <!-- Ordem Corredores -->
            <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.35rem;flex-wrap:wrap;">
                <span style="font-size:.7rem;color:var(--text-secondary);">Corredores:</span>
                <button id="btn-ordem-ed" onclick="wms3dSetOrdem('esquerda_direita')"
                    class="btn ${ordem==='esquerda_direita'?'btn-primary':'btn-secondary'}"
                    style="font-size:.7rem;padding:.22rem .5rem;">&#8678; Esq &rarr; Dir</button>
                <button id="btn-ordem-de" onclick="wms3dSetOrdem('direita_esquerda')"
                    class="btn ${ordem==='direita_esquerda'?'btn-primary':'btn-secondary'}"
                    style="font-size:.7rem;padding:.22rem .5rem;">&#8680; Dir &rarr; Esq</button>
            </div>
            <!-- Ordem Prédios -->
            <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;flex-wrap:wrap;">
                <span style="font-size:.7rem;color:var(--text-secondary);">Prédios:</span>
                <button id="btn-predio-asc" onclick="wms3dSetOrdemPredios('ascendente')"
                    class="btn ${(cfg.ordemPredios||'ascendente')==='ascendente'?'btn-primary':'btn-secondary'}"
                    style="font-size:.7rem;padding:.22rem .5rem;">&#8593; Asc (1&rarr;N frente)</button>
                <button id="btn-predio-desc" onclick="wms3dSetOrdemPredios('descendente')"
                    class="btn ${cfg.ordemPredios==='descendente'?'btn-primary':'btn-secondary'}"
                    style="font-size:.7rem;padding:.22rem .5rem;">&#8595; Desc (N&rarr;1 frente)</button>
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
                    <span class="material-icons-round" style="font-size:.8rem;">add</span> Adicionar Manualmente
                </button>
            </div>

            <!-- Ferramenta de Auto-detectar -->
            <div style="background:rgba(129,140,248,.07);border:1px solid rgba(129,140,248,.3);border-radius:8px;padding:.85rem;margin-bottom:1rem;">
                <div style="display:flex;align-items:center;gap:.65rem;margin-bottom:.75rem;">
                    <div style="background:rgba(129,140,248,.15);border-radius:8px;padding:.4rem;display:flex;">
                        <span class="material-icons-round" style="color:#818cf8;font-size:1.4rem;">auto_fix_high</span>
                    </div>
                    <div>
                        <label style="font-size:.8rem;font-weight:700;color:#818cf8;display:block;">
                            Gerador Automático de Tipos de Endereço
                        </label>
                        <div style="font-size:.7rem;color:var(--text-secondary);margin-top:.1rem;line-height:1.4;">
                            Informe a largura física do prédio para calcular a largura de cada posição (célula).<br>
                            Se houver prédios com tamanhos diferentes, use os campos opcionais abaixo para focar em uma área específica.
                        </div>
                    </div>
                </div>

                <div style="margin-bottom:.75rem;">
                    <label class="cfg-lbl" style="font-weight:700;color:#e2e8f0;font-size:.75rem;margin-bottom:.3rem;">
                        📏 Largura do Prédio / Rack Inteiro (m) <span style="color:#ef4444">*</span>
                    </label>
                    <input id="wms3d-cfg-predio-larg" type="number" class="form-input" 
                        style="width:100%;border:1px solid #818cf8;background:rgba(15,23,42,.6);font-size:.9rem;padding:.5rem;" 
                        value="${cfg.predioLargura||''}" step="0.1" placeholder="Ex: 5.0 (Obrigatório)">
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:.5rem;margin-bottom:.85rem;">
                    <div><label class="cfg-lbl">Rua Inicial</label>
                        <input id="wms3d-cfg-rua-ini" type="number" class="form-input" style="width:100%;" placeholder="Opcional"></div>
                    <div><label class="cfg-lbl">Rua Final</label>
                        <input id="wms3d-cfg-rua-fim" type="number" class="form-input" style="width:100%;" placeholder="Opcional"></div>
                    <div><label class="cfg-lbl">Prédio Inicial</label>
                        <input id="wms3d-cfg-pre-ini" type="number" class="form-input" style="width:100%;" placeholder="Opcional"></div>
                    <div><label class="cfg-lbl">Prédio Final</label>
                        <input id="wms3d-cfg-pre-fim" type="number" class="form-input" style="width:100%;" placeholder="Opcional"></div>
                </div>

                <button class="btn btn-primary" style="width:100%;padding:.5rem;background:#4f46e5;border:none;font-weight:600;font-size:.8rem;justify-content:center;" 
                    onclick="wms3dAutoDetectTipos()">
                    <span class="material-icons-round" style="font-size:1.1rem;margin-right:.3rem;">bolt</span>
                    Lançar Auto-detecção e Gerar Tipos
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

window.wms3dSetOrdemPredios = function(ordem) {
    const asc  = document.getElementById('btn-predio-asc');
    const desc = document.getElementById('btn-predio-desc');
    if (!asc || !desc) return;
    asc.className  = 'btn ' + (ordem === 'ascendente'  ? 'btn-primary' : 'btn-secondary');
    desc.className = 'btn ' + (ordem === 'descendente' ? 'btn-primary' : 'btn-secondary');
    asc.style.cssText  = 'font-size:.7rem;padding:.22rem .5rem;';
    desc.style.cssText = 'font-size:.7rem;padding:.22rem .5rem;';
};

// ── Auto-detectar Tipos de Endereço (INTELIGÊNCIA FÍSICA) ───────────────────
// Lê os endereços cadastrados e agrupa por Prédio e Nível para descobrir
// a quantidade real de posições (apartamentos) lado a lado.
// Cria os tipos dinamicamente (ex: RACK-8-POS) e sugere atualizar o banco.
window.wms3dAutoDetectTipos = function() {
    const predioLarg = +(document.getElementById('wms3d-cfg-predio-larg')?.value) || 0;
    const ruaIni = parseInt(document.getElementById('wms3d-cfg-rua-ini')?.value);
    const ruaFim = parseInt(document.getElementById('wms3d-cfg-rua-fim')?.value);
    const preIni = parseInt(document.getElementById('wms3d-cfg-pre-ini')?.value);
    const preFim = parseInt(document.getElementById('wms3d-cfg-pre-fim')?.value);

    if (predioLarg <= 0) {
        alert('⚠️ Informe primeiro a Largura do Prédio (m) no campo acima.');
        return;
    }

    const suf   = window.getTenantSuffix ? window.getTenantSuffix() : '';
    let addrs = [];
    if (window.locationsState && window.locationsState.gridData && window.locationsState.gridData.length > 0) {
        addrs = window.locationsState.gridData;
    } else {
        addrs = JSON.parse(localStorage.getItem('wms_mock_data' + suf) || '[]');
    }

    let filtrados = addrs;
    if (!isNaN(ruaIni)) filtrados = filtrados.filter(a => parseInt(a.rua) >= ruaIni);
    if (!isNaN(ruaFim)) filtrados = filtrados.filter(a => parseInt(a.rua) <= ruaFim);
    if (!isNaN(preIni)) filtrados = filtrados.filter(a => parseInt(a.predio) >= preIni);
    if (!isNaN(preFim)) filtrados = filtrados.filter(a => parseInt(a.predio) <= preFim);

    if (filtrados.length === 0) {
        alert('⚠️ Nenhum endereço foi encontrado para este intervalo.');
        return;
    }

    // Agrupa por Rua_Prédio_Nivel
    const gruposNivel = {};
    filtrados.forEach(a => {
        const chave = `${a.rua}_${a.predio}_${a.nivel}`;
        if (!gruposNivel[chave]) gruposNivel[chave] = [];
        gruposNivel[chave].push(a);
    });

    // Conta quantas vezes cada configuração (QTD de posições) aparece
    const confFisicas = {}; 
    Object.values(gruposNivel).forEach(listaAddrs => {
        const qtd = listaAddrs.length;
        if (!confFisicas[qtd]) {
            confFisicas[qtd] = { totalNiveis: 0, totalEnderecos: 0, enderecos: [] };
        }
        confFisicas[qtd].totalNiveis++;
        confFisicas[qtd].totalEnderecos += qtd;
        confFisicas[qtd].enderecos.push(...listaAddrs);
    });

    const tbody = document.getElementById('wms3d-tipos-tbody');
    if (!tbody) return;
    if (tbody.querySelector('td[colspan]')) tbody.innerHTML = ''; 

    const cfgAtual = JSON.parse(localStorage.getItem('wms_armazem_config' + suf) || '{}');
    const tiposCfg = {};
    (cfgAtual.tiposEndereco || []).forEach(t => { tiposCfg[t.codigo] = t; });

    const linhasExistentes = Array.from(tbody.querySelectorAll('tr'));
    const rowsMap = {};
    linhasExistentes.forEach(tr => {
        const cod = tr.querySelector('.tipo-cod')?.value?.trim().toUpperCase();
        if (cod) rowsMap[cod] = tr;
    });

    let msg = [];
    Object.entries(confFisicas).forEach(([qtd, data]) => {
        const q = parseInt(qtd);
        const nomeTipo = `RACK-${q}-POS`;
        const largCalc = Math.round((predioLarg / q) * 100) / 100;
        
        msg.push(`• ${nomeTipo}: ${data.totalEnderecos} end. em ${data.totalNiveis} níveis → larg. ${largCalc}m`);

        if (rowsMap[nomeTipo]) {
            const inputLarg = rowsMap[nomeTipo].querySelector('.tipo-larg');
            if (inputLarg) inputLarg.value = largCalc;
        } else {
            const cfg = tiposCfg[nomeTipo] || { alturaProxNivel: 2.0, profundidade: 0.8, capacidadeKg: 500 };
            tbody.insertAdjacentHTML('beforeend', _tipoRow({
                codigo: nomeTipo,
                descricao: `Rack detectado com ${q} posições`,
                largura: largCalc,
                profundidade: cfg.profundidade,
                alturaProxNivel: cfg.alturaProxNivel,
                capacidadeKg: cfg.capacidadeKg
            }));
        }
    });

    const confirmAtualizar = confirm(
        `🕵️ Auto-detecção Física Concluída!\n\nForam encontradas as seguintes estruturas:\n${msg.join('\n')}\n\n` +
        `⚠️ IMPORTANTE: Para que o 3D renderize essas metragens corretamente, os endereços no sistema precisam ter o campo "Tipo" igual a esses novos nomes.\n\n` +
        `Deseja que o sistema ATUALIZE AUTOMATICAMENTE o campo 'Tipo' de todos os ${filtrados.length} endereços analisados para esses novos nomes sugeridos?`
    );

    if (confirmAtualizar) {
        let changed = 0;
        const updateMap = {};
        Object.entries(confFisicas).forEach(([qtd, data]) => {
            const nomeTipo = `RACK-${parseInt(qtd)}-POS`;
            data.enderecos.forEach(a => { updateMap[a.id] = nomeTipo; });
        });

        addrs.forEach(a => {
            if (updateMap[a.id] && a.tipo !== updateMap[a.id]) {
                a.tipo = updateMap[a.id];
                changed++;
            }
        });

        if (changed > 0) {
            if (window.locationsState) window.locationsState.gridData = addrs;
            try { localStorage.setItem('wms_mock_data' + suf, JSON.stringify(addrs)); } catch(e) {}
            if (window.WmsStore) WmsStore.salvarEnderecosBatch(addrs.filter(a => updateMap[a.id])).catch(e => console.warn(e));
            alert(`✅ Sucesso! O campo 'Tipo' de ${changed} endereços foi atualizado.`);
        } else {
            alert('Nenhum endereço precisou ser atualizado (já estavam com os tipos corretos).');
        }
    }
    
    alert(`Os tipos foram adicionados/atualizados na tabela abaixo.\n\nPreencha as alturas e profundidades se necessário e clique em "Salvar e Recarregar 3D".`);
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

    const ordemBtn    = document.getElementById('btn-ordem-ed');
    const ordem        = ordemBtn?.classList.contains('btn-primary') ? 'esquerda_direita' : 'direita_esquerda';
    const predioAscBtn = document.getElementById('btn-predio-asc');
    const ordemPredios = predioAscBtn?.classList.contains('btn-primary') ? 'ascendente' : 'descendente';

    const cfg = {
        nomeArmazem:    document.getElementById('wms3d-cfg-nome')?.value  || 'CD',
        comprimento:   +document.getElementById('wms3d-cfg-comp')?.value  || 0,
        larguraTotal:  +document.getElementById('wms3d-cfg-lt')?.value    || 0,
        peDir:         +document.getElementById('wms3d-cfg-pe')?.value    || 0,
        predioLargura: +document.getElementById('wms3d-cfg-predio-larg')?.value || 0,
        posLargura:    +document.getElementById('wms3d-cfg-pw')?.value    || 1.2,
        posAltura:     +document.getElementById('wms3d-cfg-ph')?.value    || 2.0,
        profundidade:  +document.getElementById('wms3d-cfg-rd')?.value    || 0.8,
        corridorWidth: +document.getElementById('wms3d-cfg-cw')?.value    || 2.5,
        ordemCorredores: ordem,
        ordemPredios,
        corredores,
        tiposEndereco,
    };

    localStorage.setItem('wms_armazem_config' + (window.getTenantSuffix ? window.getTenantSuffix() : ''), JSON.stringify(cfg));

    const wrap = document.getElementById('wms3d-canvas-wrap');
    if (wrap && window.WMS3D) { wrap.innerHTML = ''; WMS3D.init(wrap); }
    document.getElementById('wms3d-cfg-panel').style.display = 'none';
    alert(`✅ Configuração salva!\n${corredores.length} corredor(es) · ${tiposEndereco.length} tipo(s) de endereço`);
};

// Export tipos helper (used by locations.js)
window.wms3dGetTiposEndereco = function() {
    const cfg = JSON.parse(localStorage.getItem('wms_armazem_config' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '{}');
    return cfg.tiposEndereco || [];
};

console.log('📦 WMS 3D Viewer carregado');

