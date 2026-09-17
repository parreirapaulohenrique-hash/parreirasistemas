window.getTenantSuffix = function () {
    try {
        const sess = JSON.parse(sessionStorage.getItem('parreira_session') || 'null');
        const tid  = sess?.tenant || sess?.tenantId || (window.ParreiraAuth?.getSessao?.()?.tenant) || '';
        if (tid) return '_' + tid.replace('_hml', '');
        return '_centralpecas';
    } catch (e) { return '_centralpecas'; }
};
// WMS Coletor Ã¢â‚¬â€ Core Logic
// Navigation, Auth, Scanner, Shared Data Access

const COLETOR_VERSION = '3.21.41';

// ===== Auth Check =====
document.addEventListener('DOMContentLoaded', async () => {

    // Usa sessão real do ParreiraAuth (compartilhada com o WMS)
    if (typeof ParreiraAuth === 'undefined' || !ParreiraAuth.isLogado()) {
        window.location.href = 'login.html';
        return;
    }

    // Aguarda Firebase Auth restaurar a sessão anônima do IndexedDB.
    // Sem isso, WmsStore faz chamadas Firestore com request.auth=null
    // e as regras de segurança bloqueiam tudo.
    try {
        await new Promise((resolve) => {
            const unsub = firebase.auth().onAuthStateChanged(user => {
                unsub();
                if (user) {
                    resolve(); // Sessão anônima já ativa
                } else {
                    // Re-autentica anonimamente se a sessão expirou
                    firebase.auth().signInAnonymously()
                        .then(resolve)
                        .catch(resolve); // Continua mesmo em erro (rede offline etc.)
                }
            });
        });
    } catch (e) {
        console.warn('[COLETOR] Firebase Auth wait failed:', e.message);
    }

    const sessao   = ParreiraAuth.getSessao();
    const nome     = sessao.nome || sessao.login || 'OP';
    const initials = nome.substring(0, 2).toUpperCase();

    const badge = document.getElementById('userBadge');
    if (badge) badge.textContent = initials;

    // Mantém compatibilidade com código legado que lê logged_user
    localStorage.setItem('logged_user', JSON.stringify({
        name:     sessao.nome,
        login:    sessao.login,
        role:     sessao.role,
        pin:      sessao.pin || '',
        tenantId: sessao.tenantId
    }));

    // Carrega configuração ERP do Firestore para o Coletor
    try {
        const tenantId = sessao.tenantId || 'centralpecas';
        const _ts = (window.getTenantSuffix ? window.getTenantSuffix() : `_${tenantId}`);
        const db = firebase.firestore();
        const [erpDoc, wmsIntDoc] = await Promise.all([
            db.doc(`tenants/${tenantId}/erp_config/settings`).get().catch(() => null),
            db.collection('tenants').doc(tenantId).collection('wms_config').doc('integration').get().catch(() => null)
        ]);

        let intConfig = null;
        if (erpDoc && erpDoc.exists && erpDoc.data()?.enabled) {
            const ed = erpDoc.data();
            intConfig = {
                connectorId: ed.provider || 'maxdata',
                connectorConfig: {
                    baseUrl: ed.apiUrl || ed.baseUrl || 'http://rds.skytins.com.br:8720/v2',
                    empId: ed.empId || 1,
                    terminal: ed.terminal || '364F64E6539974C1D75C8A46C14B2D3D'
                },
                updatedAt: ed.updatedAt || new Date().toISOString()
            };
        } else if (wmsIntDoc && wmsIntDoc.exists) {
            const wd = wmsIntDoc.data();
            intConfig = {
                connectorId: wd.connectorId || 'maxdata',
                connectorConfig: {
                    baseUrl: wd.baseUrl || 'http://rds.skytins.com.br:8720/v2',
                    empId: wd.empId || 1,
                    terminal: wd.terminal || '364F64E6539974C1D75C8A46C14B2D3D'
                },
                updatedAt: wd.updatedAt || new Date().toISOString()
            };
        } else if (tenantId && tenantId.startsWith('centralpecas')) {
            intConfig = {
                connectorId: 'maxdata',
                connectorConfig: {
                    baseUrl: 'http://rds.skytins.com.br:8720/v2',
                    empId: 1,
                    terminal: '364F64E6539974C1D75C8A46C14B2D3D'
                },
                updatedAt: new Date().toISOString()
            };
        }
        if (intConfig) {
            localStorage.setItem('wms_integration_config' + _ts, JSON.stringify(intConfig));
            console.log('📦 [COLETOR] Configuração ERP inicializada com sucesso:', intConfig.connectorId);
        }
    } catch(e) {
        console.warn('⚠️ [COLETOR] Falha ao sincronizar config ERP:', e.message);
    }

    // Carrega configuração ERP do Firestore para o Coletor
    try {
        const tenantId = sessao.tenantId || 'centralpecas';
        const _ts = (window.getTenantSuffix ? window.getTenantSuffix() : `_${tenantId}`);
        const db = firebase.firestore();
        const [erpDoc, wmsIntDoc] = await Promise.all([
            db.doc(`tenants/${tenantId}/erp_config/settings`).get().catch(() => null),
            db.collection('tenants').doc(tenantId).collection('wms_config').doc('integration').get().catch(() => null)
        ]);

        let intConfig = null;
        if (erpDoc && erpDoc.exists && erpDoc.data()?.enabled) {
            const ed = erpDoc.data();
            intConfig = {
                connectorId: ed.provider || 'maxdata',
                connectorConfig: {
                    baseUrl: ed.apiUrl || ed.baseUrl || 'http://rds.skytins.com.br:8720/v2',
                    empId: ed.empId || 1,
                    terminal: ed.terminal || '364F64E6539974C1D75C8A46C14B2D3D'
                },
                updatedAt: ed.updatedAt || new Date().toISOString()
            };
        } else if (wmsIntDoc && wmsIntDoc.exists) {
            const wd = wmsIntDoc.data();
            intConfig = {
                connectorId: wd.connectorId || 'maxdata',
                connectorConfig: {
                    baseUrl: wd.baseUrl || 'http://rds.skytins.com.br:8720/v2',
                    empId: wd.empId || 1,
                    terminal: wd.terminal || '364F64E6539974C1D75C8A46C14B2D3D'
                },
                updatedAt: wd.updatedAt || new Date().toISOString()
            };
        } else if (tenantId && tenantId.startsWith('centralpecas')) {
            intConfig = {
                connectorId: 'maxdata',
                connectorConfig: {
                    baseUrl: 'http://rds.skytins.com.br:8720/v2',
                    empId: 1,
                    terminal: '364F64E6539974C1D75C8A46C14B2D3D'
                },
                updatedAt: new Date().toISOString()
            };
        }
        if (intConfig) {
            localStorage.setItem('wms_integration_config' + _ts, JSON.stringify(intConfig));
            console.log('📦 [COLETOR] Configuração ERP inicializada com sucesso:', intConfig.connectorId);
        }
    } catch(e) {
        console.warn('⚠️ [COLETOR] Falha ao sincronizar config ERP:', e.message);
    }

    updateHomeStats();

    // Exibe versão no badge da home (lê do version.json para refletir deploys automaticamente)
    // Exibe versão no badge da home e controla o banner de atualização
    fetch('/platform/version.json?t=' + Date.now())
        .then(r => r.json())
        .then(v => {
            const servVer = v.version || COLETOR_VERSION;
            const el = document.getElementById('coletor-version-badge');
            if (el) el.textContent = `WMS Coletor v${servVer} ⚙️`;
            const elCard = document.getElementById('coletor-version-badge-card');
            if (elCard) elCard.textContent = `v${servVer}`;
            const banner = document.getElementById('coletor-update-banner');
            if (banner) {
                // Banner só aparece se houver versão mais nova no servidor do que o código em execução
                if (servVer && servVer !== COLETOR_VERSION) {
                    banner.style.display = 'flex';
                    const elTop = document.getElementById('coletor-top-v-badge');
                    if (elTop) elTop.textContent = `v${servVer}`;
                } else {
                    banner.style.display = 'none'; // Já está na versão mais recente!
                }
            }
        })
        .catch(() => {
            const el = document.getElementById('coletor-version-badge');
            if (el) el.textContent = `WMS Coletor v${COLETOR_VERSION} ⚙️`;
            const elCard = document.getElementById('coletor-version-badge-card');
            if (elCard) elCard.textContent = `v${COLETOR_VERSION}`;
            const banner = document.getElementById('coletor-update-banner');
            if (banner) banner.style.display = 'none';
        });
});


// ===== Navigation =====
let currentScreen = 'home';

function navigateTo(screenId) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));

    // Show target
    const target = document.getElementById(`screen-${screenId}`);
    if (target) {
        target.classList.add('active');
        currentScreen = screenId;

        // Init custom screens
        if (screenId === 'conferir'    && window.initConferirScreen)          window.initConferirScreen(target);
        if (screenId === 'config'      && window.initConfigScreen)            window.initConfigScreen(target);
        if (screenId === 'recebimento' && window.initConferenciaItensScreen)  window.initConferenciaItensScreen(target);
        if (screenId === 'armazenar'   && window.initArmazenagemScreen)       window.initArmazenagemScreen(target);

        // Inject placeholder content if screen is empty
        if (target.innerHTML.trim() === '' && screenId !== 'home') {
            injectPlaceholder(screenId, target);
        }

        // Update bottom nav
        document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
        const tabs = document.querySelectorAll('.nav-tab');
        const tabMap = ['home', 'recebimento', 'armazenar', 'separar', 'inventario', 'config'];
        const idx = tabMap.indexOf(screenId);
        if (idx >= 0 && tabs[idx]) tabs[idx].classList.add('active');

        // Update top bar title
        const titles = {
            home: 'WMS Coletor',
            recebimento: 'Conferir',
            conferir: 'Recebimento Docas',
            armazenar: 'Armazenagem',
            separar: 'Separação',
            inventario: 'Inventário',
            config: 'Parâmetros'
        };
        document.getElementById('screenTitle').textContent = titles[screenId] || 'WMS Coletor';

        // Show/hide scanner bar (hide on home)
        document.getElementById('scannerBar').style.display = screenId === 'home' ? 'none' : 'flex';

        // Focus scanner input automatically
        if (screenId !== 'home') {
            setTimeout(() => {
                const input = document.getElementById('scannerInput');
                if (input) input.focus();
            }, 200);
        }

        // Dispatch Event for modules
        document.dispatchEvent(new CustomEvent('navigateTo', { detail: { screen: screenId } }));
    }
}

// ===== Placeholder Injection =====
function injectPlaceholder(screenId, container) {
    const icons = {
        recebimento: 'move_to_inbox',
        armazenar: 'system_update_alt',
        separar: 'shopping_basket',
        inventario: 'inventory_2'
    };
    const labels = {
        recebimento: 'Conferência de Produtos',
        armazenar: 'Armazenagem',
        separar: 'Separação',
        inventario: 'Inventário'
    };

    container.innerHTML = `
        <div class="screen-placeholder">
            <span class="material-icons-round">${icons[screenId] || 'info'}</span>
            <h3 style="margin-bottom:0.5rem;">${labels[screenId] || screenId}</h3>
            <p style="font-size:0.85rem;">Tela vazia (aguardando bip).</p>
        </div>
    `;
}

// ===== Scanner =====
function processScan() {
    const input = document.getElementById('scannerInput');
    const code = input.value.trim();
    if (!code) return;

    console.log(`[SCAN] Screen: ${currentScreen}, Code: ${code}`);

    // Dispatch to active screen handler
    switch (currentScreen) {
        case 'conferir':
            if (window.handleScanConferir) window.handleScanConferir(code);
            break;
        case 'recebimento':
            if (window.handleScanConferenciaItens) window.handleScanConferenciaItens(code);
            break;
        case 'armazenar':
            if (window.handleScanArmazenar) window.handleScanArmazenar(code);
            break;
        case 'separar':
            if (window.handleScanSeparar) window.handleScanSeparar(code);
            break;
        case 'inventario':
            if (window.handleScanInventario) window.handleScanInventario(code);
            break;
    }

    // Clear input for next scan
    input.value = '';
    input.focus();
}

// Handle Enter key on scanner input
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement?.id === 'scannerInput') {
        e.preventDefault();
        processScan();
    }
});

// ===== Home Stats =====
function updateHomeStats() {
    const locations = JSON.parse(localStorage.getItem('wms_mock_data' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '[]');
    const receipts = JSON.parse(localStorage.getItem('wms_receipts') || '[]');

    // Stats
    const el = (id) => document.getElementById(id);
    if (el('statEnderecos')) el('statEnderecos').textContent = locations.length;
    if (el('statOcupados')) el('statOcupados').textContent = locations.filter(l => l.status === 'OCUPADO').length;
    if (el('statPendentes')) el('statPendentes').textContent = receipts.filter(r => r.status === 'AGUARDANDO').length;

    // Badges V2
    const confReceipts = JSON.parse(localStorage.getItem('wms_receipts_v2') || '[]');
    const confPending = confReceipts.filter(r => r.status === 'AGUARDANDO_CONFERENCIA').length;
    if (el('badgeConferir')) {
        el('badgeConferir').textContent = confPending;
        el('badgeConferir').style.display = confPending > 0 ? 'inline-block' : 'none';
    }

    // Badges
    const pendingReceipts = receipts.filter(r => r.status === 'AGUARDANDO' || r.status === 'CONFERENCIA').length;
    if (el('badgeReceber')) {
        el('badgeReceber').textContent = pendingReceipts;
        el('badgeReceber').style.display = pendingReceipts > 0 ? 'flex' : 'none';
    }

    // Hide other badges for now (no data yet)
    ['badgeArmazenar', 'badgeSeparar', 'badgeInventario'].forEach(id => {
        if (el(id)) el(id).style.display = 'none';
    });
}

// ===== Shared Data Helpers =====
window.wmsData = {
    getLocations: () => JSON.parse(localStorage.getItem('wms_mock_data' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '[]'),
    saveLocations: (data) => localStorage.setItem('wms_mock_data' + (window.getTenantSuffix ? window.getTenantSuffix() : ''), JSON.stringify(data)),
    getReceipts: () => JSON.parse(localStorage.getItem('wms_receipts') || '[]'),
    saveReceipts: (data) => localStorage.setItem('wms_receipts', JSON.stringify(data)),
    findLocation: (id) => {
        const locs = JSON.parse(localStorage.getItem('wms_mock_data' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '[]');
        return locs.find(l => l.id === id);
    }
};

// ===== Feedback Manager =====
window.Feedback = {
    audioCtx: new (window.AudioContext || window.webkitAudioContext)(),

    beep: function (type = 'success') {
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        if (type === 'success') {
            osc.frequency.setValueAtTime(880, this.audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1760, this.audioCtx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.1);
            osc.start();
            osc.stop(this.audioCtx.currentTime + 0.1);
        } else {
            // Error buzzer
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, this.audioCtx.currentTime);
            gain.gain.setValueAtTime(0.2, this.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.3);
            osc.start();
            osc.stop(this.audioCtx.currentTime + 0.3);
        }
    },

    flash: function (type = 'success') {
        const div = document.createElement('div');
        div.className = `flash-${type}`;
        div.style.position = 'fixed';
        div.style.top = '0'; div.style.left = '0';
        div.style.width = '100%'; div.style.height = '100%';
        div.style.pointerEvents = 'none';
        div.style.zIndex = '9999';
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 500);

        if (navigator.vibrate) navigator.vibrate(type === 'success' ? 50 : 300);
    }
};

// ===================================
// LEITOR DE CÂMERA ROBUSTO (MOBILE / WEBCAM)
// ===================================
window._cameraScannerInstance = null;
window._cameraTargetInputId   = null;
window._cameraDevicesList     = [];
window._cameraCurrentIndex    = 0;

window.startCameraScanner = function(targetInputId = null) {
    window._cameraTargetInputId = targetInputId;

    let modal = document.getElementById('cameraScannerModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'cameraScannerModal';
        modal.innerHTML = `
            <div style="width:100%;max-width:480px;display:flex;justify-content:space-between;align-items:center;padding:.5rem 0;">
                <span style="font-weight:700;font-size:1rem;display:flex;align-items:center;gap:.4rem;">
                    <span class="material-icons-round" style="color:#0ea5e9;">photo_camera</span>
                    Leitor de Código de Barras / NF-e
                </span>
                <button onclick="stopCameraScanner()" style="background:rgba(255,255,255,.15);border:none;color:white;width:36px;height:36px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                    <span class="material-icons-round">close</span>
                </button>
            </div>

            <div style="width:100%;max-width:440px;position:relative;border-radius:12px;overflow:hidden;border:2px solid rgba(14,165,233,.6);box-shadow:0 0 30px rgba(14,165,233,.25);background:#000;">
                <div id="cameraScannerReader" style="width:100%;min-height:280px;background:#000;"></div>
                <div style="position:absolute;top:50%;left:4%;right:4%;height:2px;background:#ef4444;box-shadow:0 0 12px #ef4444;z-index:10;pointer-events:none;"></div>
                <div id="cameraStatusBadge" style="position:absolute;bottom:8px;left:8px;right:8px;text-align:center;font-size:.72rem;background:rgba(0,0,0,.65);padding:4px 8px;border-radius:6px;color:#93c5fd;z-index:11;">
                    Iniciando câmera...
                </div>
            </div>

            <div style="width:100%;max-width:480px;text-align:center;padding:.5rem 0;">
                <p style="font-size:.82rem;color:#94a3b8;margin-bottom:1rem;line-height:1.35;">
                    Aponte para o <strong>Código de Barras (44 dígitos)</strong> ou <strong>QR Code da NF-e</strong>.
                </p>
                <div style="display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap;">
                    <button id="btnSwitchCamera" onclick="cycleCameraDevice()" style="background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);color:white;padding:.55rem .9rem;border-radius:20px;font-size:.8rem;font-weight:600;display:flex;align-items:center;gap:.35rem;cursor:pointer;">
                        <span class="material-icons-round" style="font-size:1.05rem;color:#38bdf8;">cameraswitch</span> Trocar Lente
                    </button>
                    <button id="btnTorchToggle" onclick="toggleCameraTorch()" style="background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);color:white;padding:.55rem .9rem;border-radius:20px;font-size:.8rem;font-weight:600;display:flex;align-items:center;gap:.35rem;cursor:pointer;">
                        <span class="material-icons-round" style="font-size:1.05rem;color:#f59e0b;">flash_on</span> Lanterna
                    </button>
                    <button onclick="promptManualChaveInput()" style="background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);color:white;padding:.55rem .9rem;border-radius:20px;font-size:.8rem;font-weight:600;display:flex;align-items:center;gap:.35rem;cursor:pointer;">
                        <span class="material-icons-round" style="font-size:1.05rem;color:#a855f7;">edit</span> Digitar
                    </button>
                    <button onclick="stopCameraScanner()" style="background:#ef4444;border:none;color:white;padding:.55rem 1.1rem;border-radius:20px;font-size:.8rem;font-weight:700;cursor:pointer;">
                        Cancelar
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    modal.style.display = 'flex';

    if (typeof Html5Qrcode === 'undefined') {
        alert('Carregando biblioteca do leitor... Tente novamente em 2 segundos.');
        return;
    }

    _initCameraInstance();
};

function _updateCameraStatus(text) {
    const b = document.getElementById('cameraStatusBadge');
    if (b) b.textContent = text;
}

function _initCameraInstance() {
    if (window._cameraScannerInstance) {
        try { window._cameraScannerInstance.stop().catch(() => {}); } catch(_) {}
    }

    const html5QrCode = new Html5Qrcode("cameraScannerReader");
    window._cameraScannerInstance = html5QrCode;

    // Config universal sem aspectRatio forcado (evita OverconstrainedError no Android)
    const config = {
        fps: 15,
        qrbox: function(viewfinderWidth, viewfinderHeight) {
            const w = Math.floor(Math.min(viewfinderWidth * 0.92, 360));
            const h = Math.floor(Math.min(viewfinderHeight * 0.55, 180));
            return { width: Math.max(w, 200), height: Math.max(h, 80) };
        },
        formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.CODE_39
        ]
    };

    _updateCameraStatus('Solicitando acesso à câmera...');

    // 1. Tenta facingMode environment diretamente para disparar o prompt nativo do Chrome
    html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText) => { onCameraCodeDetected(decodedText); },
        () => {}
    ).then(() => {
        _onCameraStartedSuccess();
        // Apos permissao concedida, enumera cameras para o botao de trocar lente
        Html5Qrcode.getCameras().then(devs => {
            if (devs && devs.length) window._cameraDevicesList = devs;
        }).catch(() => {});
    }).catch(err => {
        console.warn('[Camera] Falha facingMode environment:', err);
        const errName = err?.name || '';
        const errMsg  = err?.message || String(err);

        // Se falhou mas nao foi bloqueio de permissao, tenta enumerar dispositivos ou usar camera user
        if (errName !== 'NotAllowedError' && errName !== 'PermissionDeniedError') {
            _updateCameraStatus('Tentando câmera alternativa...');
            html5QrCode.start(
                { facingMode: "user" },
                config,
                (decodedText) => { onCameraCodeDetected(decodedText); },
                () => {}
            ).then(() => {
                _onCameraStartedSuccess();
            }).catch(e2 => {
                _exibirErroPermissao(e2);
            });
        } else {
            _exibirErroPermissao(err);
        }
    });
}

function _exibirErroPermissao(err) {
    const errName = err?.name || '';
    _updateCameraStatus('Câmera não autorizada');

    let msg = 'Não foi possível acessar a câmera.';
    if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        msg = 'A permissão da câmera está bloqueada no seu navegador.

Como desbloquear no Chrome:
1. Toque no ícone de configurações ao lado do endereço do site (cadeado ou opções);
2. Vá em "Permissões" -> "Câmera";
3. Selecione "Permitir" e tente novamente.';
    } else {
        msg = `Erro na câmera (${errName || 'Falha de hardware'}). Verifique se outro aplicativo está usando a câmera.`;
    }
    alert(msg);
    stopCameraScanner();
}

function _onCameraStartedSuccess() {
    _updateCameraStatus('Câmera ativa — centralize a Chave NF-e na linha vermelha');
    // Forçar atributos essenciais de reprodução no elemento video para evitar tela preta
    setTimeout(() => {
        const videoElem = document.querySelector('#cameraScannerReader video');
        if (videoElem) {
            videoElem.setAttribute('playsinline', 'true');
            videoElem.setAttribute('webkit-playsinline', 'true');
            videoElem.style.width = '100%';
            videoElem.style.height = '100%';
            videoElem.style.objectFit = 'cover';
            videoElem.style.display = 'block';
            videoElem.play().catch(() => {});
        }
    }, 150);
}

window.cycleCameraDevice = function() {
    if (!window._cameraDevicesList || window._cameraDevicesList.length <= 1) {
        alert('Este dispositivo possui apenas 1 câmera disponível.');
        return;
    }
    window._cameraCurrentIndex = (window._cameraCurrentIndex + 1) % window._cameraDevicesList.length;
    const nextDev = window._cameraDevicesList[window._cameraCurrentIndex];
    _updateCameraStatus(`Alternando para: ${nextDev.label || 'Lente ' + (window._cameraCurrentIndex + 1)}...`);

    const config = {
        fps: 20,
        qrbox: function(viewfinderWidth, viewfinderHeight) {
            const w = Math.floor(Math.min(viewfinderWidth * 0.94, 380));
            const h = Math.floor(Math.min(viewfinderHeight * 0.48, 180));
            return { width: Math.max(w, 200), height: Math.max(h, 80) };
        },
        aspectRatio: 1.777778,
        formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.CODE_39
        ]
    };

    if (window._cameraScannerInstance) {
        window._cameraScannerInstance.stop().then(() => {
            _startCameraWithDevice(nextDev.id, config);
        }).catch(() => {
            _startCameraWithDevice(nextDev.id, config);
        });
    }
};

window.promptManualChaveInput = function() {
    const raw = prompt('Digite ou cole os 44 dígitos da Chave da NF-e ou o número da NF:');
    if (raw && raw.trim()) {
        onCameraCodeDetected(raw.trim());
    }
};

window.stopCameraScanner = function() {
    if (window._cameraScannerInstance) {
        window._cameraScannerInstance.stop().then(() => {
            window._cameraScannerInstance.clear();
            window._cameraScannerInstance = null;
        }).catch(() => {
            window._cameraScannerInstance = null;
        });
    }
    const modal = document.getElementById('cameraScannerModal');
    if (modal) modal.style.display = 'none';
};

window.onCameraCodeDetected = function(rawCode) {
    if (window.Feedback) {
        window.Feedback.beep('success');
        window.Feedback.flash('success');
    }
    stopCameraScanner();

    let cleanCode = (rawCode || '').trim();

    // 1. Suporte a QR Code da SEFAZ (extrair os 44 dígitos da URL da NF-e) ou código de barras direto
    const match44 = cleanCode.match(/\d{44}/) || cleanCode.match(/\d{44}/);
    if (match44) {
        cleanCode = match44[0];
    } else {
        const numericOnly = cleanCode.replace(/\D/g, '');
        if (numericOnly.length === 44) {
            cleanCode = numericOnly;
        }
    }

    const targetId = window._cameraTargetInputId;
    if (targetId) {
        const inp = document.getElementById(targetId);
        if (inp) {
            inp.value = cleanCode;
            if (targetId === 'rec-chave-inp') {
                if (typeof recMascaraChave === 'function') recMascaraChave(inp);
                if (window.recConsultarChaveManual) window.recConsultarChaveManual();
            } else if (targetId === 'coletor-busca-nf-input') {
                if (window.consultarNfColetorManual) window.consultarNfColetorManual();
            } else if (targetId === 'scannerInput') {
                processScan();
            } else {
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            }
            return;
        }
    }

    const scInput = document.getElementById('scannerInput');
    if (scInput) scInput.value = cleanCode;

    if (currentScreen === 'conferir' && window.handleScanConferir) {
        window.handleScanConferir(cleanCode);
    } else if (currentScreen === 'recebimento' && window.handleScanRecebimento) {
        window.handleScanRecebimento(cleanCode);
    } else {
        processScan();
    }
};

window.toggleCameraTorch = function() {
    if (!window._cameraScannerInstance) return;
    try {
        const track = window._cameraScannerInstance.getRunningTrack();
        if (track && track.getCapabilities && track.getCapabilities().torch) {
            const current = track.getSettings().torch || false;
            track.applyConstraints({ advanced: [{ torch: !current }] });
        } else {
            alert('Lanterna não disponível nesta lente. Tente trocar de lente.');
        }
    } catch(e) { console.warn('Torch error:', e); }
};

// force deploy


// Alias para garantir que bipagem de câmera funcione na tela de itens
window.handleScanRecebimento = function(code) {
    if (window.handleScanConferenciaItens) window.handleScanConferenciaItens(code);
    else if (window.handleScanConferir) window.handleScanConferir(code);
};
