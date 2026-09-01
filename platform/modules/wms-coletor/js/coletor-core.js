// WMS Coletor Ã¢â‚¬â€ Core Logic
// Navigation, Auth, Scanner, Shared Data Access

const COLETOR_VERSION = '3.18.3';

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

    updateHomeStats();

    // Exibe versão no badge da home (lê do version.json para refletir deploys automaticamente)
    fetch('/platform/version.json?t=' + Date.now())
        .then(r => r.json())
        .then(v => {
            const el = document.getElementById('coletor-version-badge');
            if (el) el.textContent = `WMS Coletor v${v.version} ⚙️`;
            const elCard = document.getElementById('coletor-version-badge-card');
            if (elCard) elCard.textContent = `v${v.version}`;
        })
        .catch(() => {
            const el = document.getElementById('coletor-version-badge');
            if (el) el.textContent = `WMS Coletor v${COLETOR_VERSION} ⚙️`;
            const elCard = document.getElementById('coletor-version-badge-card');
            if (elCard) elCard.textContent = `v${COLETOR_VERSION}`;
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
// LEITOR DE CÂMERA (MOBILE / WEBCAM)
// ===================================
window._cameraScannerInstance = null;
window._cameraTargetInputId   = null;

window.startCameraScanner = function(targetInputId = null) {
    window._cameraTargetInputId = targetInputId;

    let modal = document.getElementById('cameraScannerModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'cameraScannerModal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(15,23,42,0.96); z-index: 9999;
            display: flex; flex-direction: column; align-items: center; justify-content: space-between;
            padding: 1rem; color: white; box-sizing: border-box;
        `;
        modal.innerHTML = `
            <div style="width:100%;max-width:480px;display:flex;justify-content:space-between;align-items:center;padding:.5rem 0;">
                <span style="font-weight:700;font-size:1rem;display:flex;align-items:center;gap:.4rem;">
                    <span class="material-icons-round" style="color:#0ea5e9;">photo_camera</span>
                    Leitor de Código de Barras
                </span>
                <button onclick="stopCameraScanner()" style="background:rgba(255,255,255,.15);border:none;color:white;width:36px;height:36px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                    <span class="material-icons-round">close</span>
                </button>
            </div>

            <div style="width:100%;max-width:420px;position:relative;border-radius:12px;overflow:hidden;border:2px solid rgba(14,165,233,.6);box-shadow:0 0 30px rgba(14,165,233,.25);background:#000;">
                <div id="cameraScannerReader" style="width:100%;min-height:260px;"></div>
                <div style="position:absolute;top:50%;left:5%;right:5%;height:2px;background:#ef4444;box-shadow:0 0 10px #ef4444;z-index:10;pointer-events:none;"></div>
            </div>

            <div style="width:100%;max-width:480px;text-align:center;padding:.5rem 0;">
                <p style="font-size:.82rem;color:#94a3b8;margin-bottom:1rem;line-height:1.35;">
                    Aproxime a <strong>Chave NF-e (Código de Barras ou QR Code)</strong> do quadro vermelho.
                </p>
                <div style="display:flex;gap:.75rem;justify-content:center;">
                    <button id="btnTorchToggle" onclick="toggleCameraTorch()" style="background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);color:white;padding:.6rem 1rem;border-radius:20px;font-size:.8rem;font-weight:600;display:flex;align-items:center;gap:.4rem;cursor:pointer;">
                        <span class="material-icons-round" style="font-size:1.1rem;color:#f59e0b;">flash_on</span> Lanterna
                    </button>
                    <button onclick="stopCameraScanner()" style="background:#ef4444;border:none;color:white;padding:.6rem 1.25rem;border-radius:20px;font-size:.8rem;font-weight:700;cursor:pointer;">
                        Cancelar
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    modal.style.display = 'flex';

    if (typeof Html5Qrcode === 'undefined') {
        alert('Carregando leitor de câmera... Tente novamente em 2 segundos.');
        return;
    }

    if (window._cameraScannerInstance) {
        try { window._cameraScannerInstance.stop().catch(() => {}); } catch(_) {}
    }

    const html5QrCode = new Html5Qrcode("cameraScannerReader");
    window._cameraScannerInstance = html5QrCode;

    const config = {
        fps: 15,
        qrbox: { width: 320, height: 180 },
        formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.CODE_39
        ]
    };

    html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText) => { onCameraCodeDetected(decodedText); },
        () => {}
    ).catch(err => {
        console.warn('Câmera traseira falhou, tentando fallback:', err);
        html5QrCode.start(
            { facingMode: "user" },
            config,
            (decodedText) => { onCameraCodeDetected(decodedText); },
            () => {}
        ).catch(e2 => {
            alert('Permissão de câmera negada ou câmera não suportada no navegador.');
            stopCameraScanner();
        });
    });
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
    const numericOnly = cleanCode.replace(/\D/g, '');
    if (numericOnly.length === 44) {
        cleanCode = numericOnly;
    }

    const targetId = window._cameraTargetInputId;
    if (targetId) {
        const inp = document.getElementById(targetId);
        if (inp) {
            inp.value = cleanCode;
            if (targetId === 'rec-chave-inp' && window.recConsultarChaveManual) {
                window.recConsultarChaveManual();
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
            alert('Lanterna não disponível nesta câmera.');
        }
    } catch(e) { console.warn('Torch error:', e); }
};
// force deploy

