window.getTenantSuffix = function () {
    try {
        const sess = JSON.parse(sessionStorage.getItem('parreira_session') || 'null');
        const tid  = sess?.tenant || sess?.tenantId || (window.ParreiraAuth?.getSessao?.()?.tenant) || '';
        if (tid) return '_' + tid.replace('_hml', '');
        return '_centralpecas';
    } catch (e) { return '_centralpecas'; }
};

window.getWmsConfig = function () {
    try {
        const suf = window.getTenantSuffix ? window.getTenantSuffix() : '';
        const raw = (suf && localStorage.getItem('wms_config' + suf)) || localStorage.getItem('wms_config');
        return raw ? JSON.parse(raw) : {};
    } catch(e) {
        return {};
    }
};

window.saveWmsConfig = function (cfg) {
    try {
        const suf = window.getTenantSuffix ? window.getTenantSuffix() : '';
        const val = JSON.stringify(cfg || {});
        if (suf) localStorage.setItem('wms_config' + suf, val);
        localStorage.setItem('wms_config', val);
    } catch(e) {
        console.warn('[WMS Coletor] saveWmsConfig erro:', e);
    }
};
// WMS Coletor Ã¢â‚¬â€ Core Logic
// Navigation, Auth, Scanner, Shared Data Access

const COLETOR_VERSION = '3.23.2';

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
    fetch('./version.json?t=' + Date.now())
        .then(r => r.json())
        .then(v => {
            const servVer = v.version || COLETOR_VERSION;
            const el = document.getElementById('coletor-version-badge');
            if (el) el.textContent = `WMS Coletor v${servVer} ⚙️`;
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
                        const banner = document.getElementById('coletor-update-banner');
            if (banner) banner.style.display = 'none';
        });
});


// ===== Navigation =====
let currentScreen = 'home';

window.navigateTo = navigateTo;
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
        if (screenId === 'inventario') {
            if (window.ColetorInventario && window.ColetorInventario.render) {
                window.ColetorInventario.render(target);
            } else if (window.initInventarioScreen) {
                window.initInventarioScreen(target);
            }
        }

        // Inject placeholder content if screen is empty
        if (target.innerHTML.trim() === '' && screenId !== 'home') {
            injectPlaceholder(screenId, target);
        }

        // Update bottom nav
        document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
        const tabs = document.querySelectorAll('.nav-tab');
        const tabMap = ['home', 'conferir', 'recebimento', 'armazenar', 'separar', 'inventario', 'config'];
        const idx = tabMap.indexOf(screenId);
        if (idx >= 0 && tabs[idx]) tabs[idx].classList.add('active');

        // Update top bar title
        const titles = {
            home: 'WMS Coletor',
            conferir: 'Recebimento Docas',
            recebimento: 'Conferência de Carga',
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
function processScan(overrideCode) {
    const input = document.getElementById('scannerInput');
    let code = (typeof overrideCode === 'string' ? overrideCode : (input ? input.value : '')).trim();
    if (!code) return;

    // Se for URL SEFAZ ou tiver 44 dígitos contínuos, extrai a chave NF-e limpa
    const match44 = code.match(/\d{44}/);
    const clean44 = match44 ? match44[0] : code.replace(/\D/g, '');
    const isChaveNfe = clean44.length === 44;

    console.log(`⚡ [SCAN] Screen: ${currentScreen}, Code: ${code} (isChaveNfe: ${isChaveNfe})`);

    // Dispatch to active screen handler
    switch (currentScreen) {
        case 'conferir':
        case 'recebimento':
            // Se for chave NF de 44 dígitos ou se a conferência de itens não estiver aberta na tela, busca NF
            if (isChaveNfe || (clean44.length >= 1 && clean44.length <= 9 && !window._confRecAtivo && !window._recNovaNF)) {
                if (window.handleScanConferir) {
                    window.handleScanConferir(isChaveNfe ? clean44 : code);
                } else if (window.handleScanRecebimento) {
                    window.handleScanRecebimento(isChaveNfe ? clean44 : code);
                }
            } else {
                // Conferência de itens por SKU/EAN
                if (window.handleScanConferenciaItens) {
                    window.handleScanConferenciaItens(code);
                } else if (window.handleScanConferir) {
                    window.handleScanConferir(code);
                }
            }
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
    if (input) {
        input.value = '';
        input.focus();
    }
}

// Handle Enter key on scanner input + Escape para fechar camera
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.activeElement?.id === 'scannerInput') {
        e.preventDefault();
        processScan();
    }
    if (e.key === 'Escape') {
        const camModal = document.getElementById('cameraScannerModal');
        if (camModal) { e.preventDefault(); window.stopCameraScanner && window.stopCameraScanner(); }
    }
});

// ===== Home Stats =====
function updateHomeStats() {
    const rawLocs = JSON.parse(localStorage.getItem('wms_mock_data' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '[]');
    const locations = Array.isArray(rawLocs) ? rawLocs : (rawLocs.addresses || []);

    const el = (id) => document.getElementById(id);
    if (el('statEnderecos')) el('statEnderecos').textContent = locations.length;
    if (el('statOcupados')) el('statOcupados').textContent = locations.filter(l => l.status === 'OCUPADO').length;

    // Badges assíncronas do WmsStore (Firestore) com fallback
    if (window.WmsStore && window.WmsStore.listarRecebimentos) {
        WmsStore.listarRecebimentos({ status: 'AGUARDANDO_CONFERENCIA' }).then(recs => {
            const count = recs.length;
            if (el('badgeConferir')) {
                el('badgeConferir').textContent = count;
                el('badgeConferir').style.display = count > 0 ? 'inline-block' : 'none';
            }
        }).catch(() => {});

        WmsStore.listarRecebimentos({ status: 'CONFERENCIA_ITENS_PENDENTE' }).then(confRecs => {
            const count = confRecs.length;
            if (el('badgeReceber')) {
                el('badgeReceber').textContent = count;
                el('badgeReceber').style.display = count > 0 ? 'flex' : 'none';
            }
            if (el('statPendentes')) el('statPendentes').textContent = count;
        }).catch(() => {});

        if (window.WmsStore.listarPutaway) {
            WmsStore.listarPutaway({ status: 'PENDENTE' }).then(tasks => {
                const count = tasks.length;
                if (el('badgeArmazenar')) {
                    el('badgeArmazenar').textContent = count;
                    el('badgeArmazenar').style.display = count > 0 ? 'inline-block' : 'none';
                }
            }).catch(() => {});
        }
    } else {
        const receipts = JSON.parse(localStorage.getItem('wms_receipts') || '[]');
        if (el('statPendentes')) el('statPendentes').textContent = receipts.filter(r => r.status === 'AGUARDANDO').length;

        const confReceipts = JSON.parse(localStorage.getItem('wms_receipts_v2') || '[]');
        const confPending = confReceipts.filter(r => r.status === 'AGUARDANDO_CONFERENCIA').length;
        if (el('badgeConferir')) {
            el('badgeConferir').textContent = confPending;
            el('badgeConferir').style.display = confPending > 0 ? 'inline-block' : 'none';
        }

        const pendingReceipts = receipts.filter(r => r.status === 'AGUARDANDO' || r.status === 'CONFERENCIA').length;
        if (el('badgeReceber')) {
            el('badgeReceber').textContent = pendingReceipts;
            el('badgeReceber').style.display = pendingReceipts > 0 ? 'flex' : 'none';
        }
    }
}

// ===== Shared Data Helpers =====
window.wmsData = {
    getLocations: () => {
        const raw = JSON.parse(localStorage.getItem('wms_mock_data' + (window.getTenantSuffix ? window.getTenantSuffix() : '')) || '[]');
        return Array.isArray(raw) ? raw : (raw.addresses || []);
    },
    saveLocations: (data) => {
        const suf = window.getTenantSuffix ? window.getTenantSuffix() : '';
        const addrs = Array.isArray(data) ? data : (data && Array.isArray(data.addresses) ? data.addresses : []);
        localStorage.setItem('wms_mock_data' + suf, JSON.stringify(addrs));
    },
    getReceipts: () => JSON.parse(localStorage.getItem('wms_receipts') || '[]'),
    saveReceipts: (data) => localStorage.setItem('wms_receipts', JSON.stringify(data)),
    findLocation: (id) => {
        const locs = window.wmsData.getLocations();
        return locs.find(l => (l.id || l.address) === id);
    }
};

// ===== Feedback Manager Industrial =====
window.Feedback = {
    audioCtx: null,

    _getAudioCtx: function () {
        if (!this.audioCtx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) this.audioCtx = new AudioCtx();
        }
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
        return this.audioCtx;
    },

    beep: function (type = 'success') {
        try {
            const ctx = this._getAudioCtx();
            if (!ctx) return;

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            if (type === 'success') {
                // Tom duplo agudo industrial (alta penetração sonora em galpão)
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1400, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(2200, ctx.currentTime + 0.08);
                gain.gain.setValueAtTime(0.25, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.12);
            } else if (type === 'warning') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(800, ctx.currentTime);
                gain.gain.setValueAtTime(0.25, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.18);
            } else {
                // Alerta grave e dissonante de erro / bloqueio
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(280, ctx.currentTime);
                osc.frequency.setValueAtTime(160, ctx.currentTime + 0.12);
                gain.gain.setValueAtTime(0.35, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.35);
            }
        } catch (_) {}
    },

    vibrateSuccess: function () {
        if (navigator.vibrate) navigator.vibrate([80]);
    },

    vibrateWarning: function () {
        if (navigator.vibrate) navigator.vibrate([100, 80, 100]);
    },

    vibrateError: function () {
        if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 400]);
    },

    flash: function (type = 'success') {
        const isSuccess = type === 'success';
        const color = isSuccess ? '#10b981' : '#ef4444';

        const div = document.createElement('div');
        div.className = `flash-${type}`;
        div.style.cssText = `position:fixed; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:99999; box-shadow: inset 0 0 0 8px ${color}; background: ${isSuccess ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.15)'}; transition: opacity 0.3s;`;
        document.body.appendChild(div);
        setTimeout(() => {
            div.style.opacity = '0';
            setTimeout(() => div.remove(), 250);
        }, 200);

        if (isSuccess) this.vibrateSuccess();
        else this.vibrateError();
    }
};

// ===== GS1-128 & Industrial Barcode Parser =====
window.WmsBarcodeParser = {
    parse: function (raw) {
        if (!raw) return { raw: '', sku: '', isGs1: false };
        let str = String(raw).trim();

        // 1. Limpeza de caracteres invisíveis e prefixos de scanner
        str = str.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');

        // 2. Chave NF-e (44 dígitos)
        if (/^\d{44}$/.test(str)) {
            return {
                raw: str,
                tipo: 'NFE_CHAVE',
                chave: str,
                nfNumero: String(parseInt(str.substring(25, 34), 10)),
                isGs1: false
            };
        }

        // 3. GS1-128 com parênteses: (01)07891234567890(10)LOTE123(17)261231(21)SER12345
        const result = {
            raw: str,
            sku: str,
            gtin: null,
            lote: null,
            validade: null,
            serial: null,
            peso: null,
            isGs1: false
        };

        if (str.includes('(') && str.includes(')')) {
            result.isGs1 = true;
            const aiRegex = /\((\d{2,4})\)([^\(]+)/g;
            let match;
            while ((match = aiRegex.exec(str)) !== null) {
                const ai = match[1];
                const val = match[2].trim();
                if (ai === '01') { result.gtin = val; result.sku = val; }
                else if (ai === '10') { result.lote = val; }
                else if (ai === '17') {
                    if (val.length === 6) {
                        result.validade = `20${val.substring(0, 2)}-${val.substring(2, 4)}-${val.substring(4, 6)}`;
                    } else {
                        result.validade = val;
                    }
                }
                else if (ai === '21') { result.serial = val; }
                else if (ai.startsWith('310')) {
                    const decimals = parseInt(ai[3], 10) || 2;
                    result.peso = (parseFloat(val) / Math.pow(10, decimals)).toFixed(2);
                }
            }
            return result;
        }

        // 4. DUN-14 (14 dígitos)
        if (/^\d{14}$/.test(str)) {
            result.isGs1 = true;
            result.gtin = str;
            result.sku = str;
            return result;
        }

        // 5. EAN-13 (13 dígitos)
        if (/^\d{13}$/.test(str)) {
            result.gtin = str;
            result.sku = str;
            return result;
        }

        return result;
    }
};

// ===== Zebra DataWedge & Laser / Bluetooth Fast Cadence Listener =====
(function initLaserCadence() {
    let keyBuffer = '';
    let lastKeyTime = 0;

    window.addEventListener('keydown', function (e) {
        const now = Date.now();
        const interval = now - lastKeyTime;
        lastKeyTime = now;

        if (e.key === 'Enter') {
            // Aceita cadência de coletores industriais e scanners Bluetooth em Android (até 240ms por caractere)
            if (keyBuffer.length >= 3 && interval < 240) {
                const scannedCode = keyBuffer.trim();
                keyBuffer = '';
                console.log(`⚡ [Laser / Bluetooth] Bipagem capturada em cadência: ${scannedCode}`);

                const parsed = window.WmsBarcodeParser.parse(scannedCode);
                if (window.Feedback) {
                    window.Feedback.vibrateSuccess();
                    window.Feedback.beep('success');
                }

                if (typeof window.currentScanCallback === 'function') {
                    window.currentScanCallback(parsed.sku || parsed.raw, parsed);
                } else {
                    const scInput = document.getElementById('scannerInput');
                    if (scInput) scInput.value = parsed.raw || scannedCode;
                    const activeInput = document.activeElement;
                    if (activeInput && activeInput.tagName === 'INPUT' && activeInput.id !== 'scannerInput') {
                        activeInput.value = parsed.raw || scannedCode;
                        activeInput.dispatchEvent(new Event('input', { bubbles: true }));
                        activeInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                    } else {
                        processScan(parsed.raw || scannedCode);
                    }
                    window.dispatchEvent(new CustomEvent('wms:barcode-scanned', { detail: parsed }));
                }
            } else {
                keyBuffer = '';
            }
            return;
        }

        if (e.key.length === 1) {
            if (interval > 280) {
                keyBuffer = e.key;
            } else {
                keyBuffer += e.key;
            }
        }
    });

    // Suporte universal a Colar (Paste) em celulares Android e Desktop
    window.addEventListener('paste', function(e) {
        const pasted = (e.clipboardData || window.clipboardData)?.getData('text') || '';
        if (!pasted) return;
        const match44 = pasted.match(/\d{44}/);
        if (match44) {
            const chave44 = match44[0];
            console.log('📋 [PASTE] Chave NF-e 44 dígitos detectada via colar:', chave44);
            const buscaInp = document.getElementById('coletor-busca-nf-input');
            if (buscaInp) buscaInp.value = chave44;
            const scInput = document.getElementById('scannerInput');
            if (scInput) scInput.value = chave44;

            if (window.Feedback) {
                window.Feedback.vibrateSuccess();
                window.Feedback.beep('success');
            }

            if (currentScreen === 'conferir' && window.handleScanConferir) {
                window.handleScanConferir(chave44);
            } else if (currentScreen === 'recebimento' && window.handleScanRecebimento) {
                window.handleScanRecebimento(chave44);
            } else {
                processScan(chave44);
            }
        }
    });

    window.addEventListener('message', function (event) {
        if (!event.data) return;
        const data = event.data;
        const barcode = data['com.symbol.datawedge.data_string'] || data.barcode || data.scanData;
        if (barcode) {
            console.log(`🦓 [Zebra DataWedge] Broadcast recebido: ${barcode}`);
            const parsed = window.WmsBarcodeParser.parse(barcode);
            if (window.Feedback) {
                window.Feedback.vibrateSuccess();
                window.Feedback.beep('success');
            }
            if (typeof window.currentScanCallback === 'function') {
                window.currentScanCallback(parsed.sku || parsed.raw, parsed);
            } else {
                const scInput = document.getElementById('scannerInput');
                if (scInput) scInput.value = parsed.raw || barcode;
                const activeInput = document.activeElement;
                if (activeInput && activeInput.tagName === 'INPUT' && activeInput.id !== 'scannerInput') {
                    activeInput.value = parsed.raw || barcode;
                    activeInput.dispatchEvent(new Event('input', { bubbles: true }));
                    activeInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                } else {
                    processScan(parsed.raw || barcode);
                }
                window.dispatchEvent(new CustomEvent('wms:barcode-scanned', { detail: parsed }));
            }
        }
    });
})();


// ===================================
// LEITOR DE CÂMERA ROBUSTO (MOBILE / WEBCAM)
// ===================================
window._cameraScannerInstance = null;
window._cameraTargetInputId   = null;
window._cameraDevicesList     = [];
window._cameraCurrentIndex    = 0;

window.startCameraScanner = function(targetInputId = null) {
    window._cameraTargetInputId = targetInputId;

    // Remove qualquer modal pré-existente para não acumular nem travar
    let existingModal = document.getElementById('cameraScannerModal');
    if (existingModal) {
        try { existingModal.remove(); } catch(_) {}
    }

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
                    Aponte para o <strong>Código de Barras (44 dígitos)</strong> ou <strong>QR Code da NF-e</strong>.<br>
                    <span style="font-size:.74rem;color:#38bdf8;">💡 Dica: Em celulares, você pode ler tanto o código longo quanto o QR Code da DANFE.</span>
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

    // Ativa BarcodeDetector acelerado por hardware no Android (Chrome 84+)
    const html5QrCode = new Html5Qrcode("cameraScannerReader", {
        experimentalFeatures: {
            useBarCodeDetectorIfSupported: true
        },
        verbose: false
    });
    window._cameraScannerInstance = html5QrCode;

    // Configuração com caixa retangular panorâmica ideal para Código 128 longo (44 dígitos da DANFE) e QR Code
    const config = {
        fps: 22,
        qrbox: function(viewfinderWidth, viewfinderHeight) {
            const w = Math.floor(Math.min(viewfinderWidth * 0.96, 400));
            const h = Math.floor(Math.min(viewfinderHeight * 0.58, 200));
            return { width: Math.max(w, 240), height: Math.max(h, 110) };
        }
    };

    _updateCameraStatus('Acessando câmera em alta resolução...');

    // 1. Tenta alta definição (1080p/720p) com foco contínuo para leitura nítida das barras finas da DANFE no Android
    const hdConstraints = {
        facingMode: "environment",
        width: { min: 1024, ideal: 1920 },
        height: { min: 720, ideal: 1080 }
    };

    html5QrCode.start(
        hdConstraints,
        config,
        (decodedText) => { onCameraCodeDetected(decodedText); },
        () => {}
    ).catch(() => {
        // Fallback para câmera environment padrão sem restrição de resolução (aparelhos básicos)
        return html5QrCode.start(
            { facingMode: "environment" },
            config,
            (decodedText) => { onCameraCodeDetected(decodedText); },
            () => {}
        );
    }).then(() => {
        _onCameraStartedSuccess();
        Html5Qrcode.getCameras().then(devs => {
            if (devs && devs.length) window._cameraDevicesList = devs;
        }).catch(() => {});
    }).catch(err => {
        console.warn('[Camera] Falha facingMode environment:', err);
        const errName = err?.name || '';
        const errMsg  = err?.message || String(err);

        // Se falhou mas não foi bloqueio de permissão, tenta câmera frontal/user
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

    // Fecha o modal IMEDIATAMENTE (sem alert() bloqueante que impedia o X de funcionar)
    stopCameraScanner();

    let msg = 'Nao foi possivel acessar a camera.';
    if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        msg = '\u26a0 Camera bloqueada. Va em Configuracoes do navegador > Permissoes > Camera > Permitir, e tente novamente.';
    } else if (errName) {
        msg = '\u26a0 Erro na camera (' + errName + '). Verifique se outro app esta usando a camera.';
    }

    // Toast nao-bloqueante em vez de alert()
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1e293b;color:#f87171;border:1px solid #ef4444;padding:.75rem 1.2rem;border-radius:12px;font-size:.85rem;z-index:999999;max-width:90vw;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.5);line-height:1.4;';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { try { t.remove(); } catch(_) {} }, 7000);
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
        aspectRatio: 1.777778
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
    if (window._cameraInitTimeout) clearTimeout(window._cameraInitTimeout);

    // 1. Fecha o modal IMEDIATAMENTE (sincrono) -- independente do estado do scanner
    const modal = document.getElementById('cameraScannerModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.cssText += ';display:none!important;pointer-events:none!important;';
        try { modal.remove(); } catch(_) {}
    }

    // 2. Para o scanner em background (assincrono -- nao bloqueia o fechamento)
    const inst = window._cameraScannerInstance;
    window._cameraScannerInstance = null;
    if (inst) {
        setTimeout(() => {
            try {
                if (inst.isScanning) {
                    inst.stop().catch(() => {}).finally(() => { try { inst.clear(); } catch(_) {} });
                } else {
                    try { inst.clear(); } catch(_) {}
                }
            } catch(_) {}
        }, 0);
    }
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


// Alias para garantir que bipagem de câmera ou scanner funcione na conferência
window.handleScanRecebimento = function(code) {
    const raw = (code || '').trim();
    const match44 = raw.match(/\d{44}/);
    if (match44 && !window._confSessao?.ativo && window.handleScanConferir) {
        window.handleScanConferir(match44[0]);
    } else if (window.handleScanConferenciaItens) {
        window.handleScanConferenciaItens(raw);
    } else if (window.handleScanConferir) {
        window.handleScanConferir(raw);
    }
};


window.initInventarioScreen = function(target) {
    const el = target || document.getElementById('screen-inventario');
    if (window.ColetorInventario && window.ColetorInventario.render) {
        window.ColetorInventario.render(el);
    }
};
