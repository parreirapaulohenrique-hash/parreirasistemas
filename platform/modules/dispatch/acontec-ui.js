/**
 * ACONTEC INTEGRATION UI HANDLERS
 * Conecta a interface HTML com o módulo de integração
 */

// Inicializar UI da Acontec quando a página carregar
document.addEventListener('DOMContentLoaded', function () {
    initAcontecUI();
});

function initAcontecUI() {
    console.log('🔌 Inicializando UI Integração Acontec...');

    // Carregar configurações salvas
    loadAcontecConfig();

    // Carregar e exibir estatísticas
    refreshAcontecStats();

    // Carregar logs
    refreshAcontecLogs();

    // Event Listeners
    setupAcontecEventListeners();

    // Atualizar info de última sincronização
    updateLastSyncInfo();
}

function setupAcontecEventListeners() {
    // Form de configuração
    const formConfig = document.getElementById('formAcontecConfig');
    if (formConfig) {
        formConfig.addEventListener('submit', (e) => {
            e.preventDefault();
            saveAcontecConfig();
        });
    }

    // Checkbox de auto-sync (mostrar/ocultar intervalo)
    const autoSyncCheckbox = document.getElementById('acontecAutoSync');
    if (autoSyncCheckbox) {
        autoSyncCheckbox.addEventListener('change', (e) => {
            const intervalGroup = document.getElementById('acontecSyncIntervalGroup');
            if (intervalGroup) {
                intervalGroup.style.display = e.target.checked ? 'block' : 'none';
            }
        });
    }

    // Botão testar conexão
    const btnTest = document.getElementById('btnTestAcontecConnection');
    if (btnTest) {
        btnTest.addEventListener('click', testAcontecConnection);
    }

    // Botão sincronizar
    const btnSync = document.getElementById('btnSyncAcontec');
    if (btnSync) {
        btnSync.addEventListener('click', executeAcontecSync);
    }

    // Botão resetar estatísticas
    const btnResetStats = document.getElementById('btnResetAcontecStats');
    if (btnResetStats) {
        btnResetStats.addEventListener('click', () => {
            if (confirm('Deseja realmente resetar todas as estatísticas de sincronização?')) {
                window.AcontecIntegration.resetStats();
                refreshAcontecStats();
                showToast('📊 Estatísticas resetadas!');
            }
        });
    }

    // Botão limpar logs
    const btnClearLogs = document.getElementById('btnClearAcontecLogs');
    if (btnClearLogs) {
        btnClearLogs.addEventListener('click', () => {
            if (confirm('Deseja realmente limpar todos os logs de sincronização?')) {
                window.AcontecIntegration.clearLogs();
                refreshAcontecLogs();
                showToast('🗑️ Logs limpos!');
            }
        });
    }
}

function loadAcontecConfig() {
    if (!window.AcontecIntegration) return;

    const config = window.AcontecIntegration.config;

    const urlInput = document.getElementById('acontecApiUrl');
    const tokenInput = document.getElementById('acontecApiToken');
    const autoSyncCheckbox = document.getElementById('acontecAutoSync');
    const intervalInput = document.getElementById('acontecSyncInterval');
    const intervalGroup = document.getElementById('acontecSyncIntervalGroup');

    if (urlInput) urlInput.value = config.apiUrl || '';
    if (tokenInput) tokenInput.value = config.apiToken || '';
    if (autoSyncCheckbox) {
        autoSyncCheckbox.checked = config.autoSync || false;
        if (intervalGroup) {
            intervalGroup.style.display = config.autoSync ? 'block' : 'none';
        }
    }
    if (intervalInput) intervalInput.value = config.syncInterval || 60;
}

function saveAcontecConfig() {
    if (!window.AcontecIntegration) return;

    const urlInput = document.getElementById('acontecApiUrl');
    const tokenInput = document.getElementById('acontecApiToken');
    const autoSyncCheckbox = document.getElementById('acontecAutoSync');
    const intervalInput = document.getElementById('acontecSyncInterval');

    // Validação básica
    if (!urlInput || !urlInput.value.trim()) {
        alert('⚠️ Por favor, informe a URL da API Acontec');
        return;
    }

    if (!tokenInput || !tokenInput.value.trim()) {
        alert('⚠️ Por favor, informe o Token de autenticação');
        return;
    }

    // Atualizar configuração
    window.AcontecIntegration.config = {
        apiUrl: urlInput.value.trim(),
        apiToken: tokenInput.value.trim(),
        autoSync: autoSyncCheckbox ? autoSyncCheckbox.checked : false,
        syncInterval: intervalInput ? parseInt(intervalInput.value) || 60 : 60,
        enabled: true,
        lastSync: window.AcontecIntegration.config.lastSync
    };

    // Salvar
    window.AcontecIntegration.saveConfig();

    // Reiniciar auto-sync se necessário
    if (window.AcontecIntegration.config.autoSync) {
        window.AcontecIntegration.startAutoSync();
    } else {
        window.AcontecIntegration.stopAutoSync();
    }

    showToast('✅ Configurações salvas com sucesso!');
}

async function testAcontecConnection() {
    if (!window.AcontecIntegration) return;

    const btn = document.getElementById('btnTestAcontecConnection');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-round" style="font-size: 1rem; animation: spin 1s linear infinite;">sync</span> Testando...';
    }

    try {
        const result = await window.AcontecIntegration.testConnection();
        showToast('✅ Conexão estabelecida com sucesso!');
        alert(`✅ Conexão bem-sucedida!\n\nAPI respondeu corretamente.${result.data ? '\n\nDetalhes: ' + JSON.stringify(result.data, null, 2) : ''}`);
    } catch (error) {
        showToast('❌ Falha ao conectar com API Acontec');
        alert(`❌ Erro ao conectar:\n\n${error.message}\n\nVerifique a URL e o Token de autenticação.`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span class="material-icons-round" style="font-size: 1rem;">wifi_find</span> Testar Conexão';
        }
    }
}

async function executeAcontecSync() {
    if (!window.AcontecIntegration) return;

    const btn = document.getElementById('btnSyncAcontec');
    const progressDiv = document.getElementById('acontecSyncProgress');
    const progressBar = document.getElementById('acontecProgressBar');
    const progressText = document.getElementById('acontecProgressText');

    // Validar configuração
    if (!window.AcontecIntegration.config.apiUrl || !window.AcontecIntegration.config.apiToken) {
        alert('⚠️ Configure a URL da API e o Token de autenticação antes de sincronizar.');
        return;
    }

    if (btn) btn.disabled = true;
    if (progressDiv) progressDiv.style.display = 'block';
    if (progressBar) progressBar.style.width = '0%';

    // Callback para atualizar progresso
    window.updateAcontecProgress = (text) => {
        if (progressText) progressText.textContent = text;
        // Simular progresso visual
        if (progressBar) {
            const currentWidth = parseInt(progressBar.style.width) || 0;
            progressBar.style.width = Math.min(currentWidth + 10, 90) + '%';
        }
    };

    try {
        const result = await window.AcontecIntegration.syncClients(true);

        if (progressBar) progressBar.style.width = '100%';
        if (progressText) progressText.textContent = 'Concluído!';

        setTimeout(() => {
            if (progressDiv) progressDiv.style.display = 'none';

            // Atualizar estatísticas e última sync
            refreshAcontecStats();
            updateLastSyncInfo();
            refreshAcontecLogs();

            showToast(`✅ Sincronização concluída: ${result.totalAdded} novos, ${result.totalUpdated} atualizados`);
            alert(`✅ Sincronização concluída!\n\n📊 Estatísticas:\n• Total processado: ${result.totalFetched}\n• Novos clientes: ${result.totalAdded}\n• Clientes atualizados: ${result.totalUpdated}\n• Erros: ${result.errors}\n• Duração: ${result.duration}s`);
        }, 1000);

    } catch (error) {
        if (progressDiv) progressDiv.style.display = 'none';
        showToast('❌ Erro na sincronização');
        alert(`❌ Erro durante a sincronização:\n\n${error.message}\n\nVerifique os logs para mais detalhes.`);

        // Atualizar logs mesmo em caso de erro
        refreshAcontecLogs();
    } finally {
        if (btn) btn.disabled = false;
    }
}

function refreshAcontecStats() {
    if (!window.AcontecIntegration) return;

    const stats = window.AcontecIntegration.stats;

    const totalEl = document.getElementById('acontecStatTotal');
    const addedEl = document.getElementById('acontecStatAdded');
    const updatedEl = document.getElementById('acontecStatUpdated');
    const errorsEl = document.getElementById('acontecStatErrors');

    if (totalEl) totalEl.textContent = stats.totalSynced || 0;
    if (addedEl) addedEl.textContent = stats.clientsAdded || 0;
    if (updatedEl) updatedEl.textContent = stats.clientsUpdated || 0;
    if (errorsEl) errorsEl.textContent = stats.totalErrors || 0;
}

function updateLastSyncInfo() {
    if (!window.AcontecIntegration) return;

    const lastSyncEl = document.getElementById('acontecLastSyncInfo');
    if (!lastSyncEl) return;

    const lastSync = window.AcontecIntegration.config.lastSync;

    if (!lastSync) {
        lastSyncEl.textContent = 'Última sincronização: Nunca';
        return;
    }

    const date = new Date(lastSync);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    let timeAgo = '';
    if (diffMins < 1) timeAgo = 'Agora mesmo';
    else if (diffMins < 60) timeAgo = `Há ${diffMins} minuto${diffMins > 1 ? 's' : ''}`;
    else if (diffHours < 24) timeAgo = `Há ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
    else timeAgo = `Há ${diffDays} dia${diffDays > 1 ? 's' : ''}`;

    lastSyncEl.textContent = `Última sincronização: ${date.toLocaleString('pt-BR')} (${timeAgo})`;
}

function refreshAcontecLogs() {
    if (!window.AcontecIntegration) return;

    const logsContainer = document.getElementById('acontecLogsList');
    if (!logsContainer) return;

    const logs = window.AcontecIntegration.logs;

    if (!logs || logs.length === 0) {
        logsContainer.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: var(--text-secondary);">
                <span class="material-icons-round" style="font-size: 3rem; opacity: 0.3;">history</span>
                <p>Nenhum log disponível</p>
            </div>
        `;
        return;
    }

    // Exibir logs em ordem reversa (mais recente primeiro)
    const reversedLogs = [...logs].reverse();

    const logTypeIcons = {
        success: 'check_circle',
        error: 'error',
        warning: 'warning',
        info: 'info'
    };

    const logTypeColors = {
        success: 'var(--accent-success)',
        error: 'var(--accent-danger)',
        warning: 'var(--accent-warning)',
        info: 'var(--primary-color)'
    };

    const logsHtml = reversedLogs.map(log => {
        const date = new Date(log.timestamp);
        const icon = logTypeIcons[log.type] || 'info';
        const color = logTypeColors[log.type] || 'var(--text-secondary)';

        return `
            <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); display: flex; gap: 1rem; align-items: flex-start;">
                <span class="material-icons-round" style="color: ${color}; font-size: 1.2rem;">${icon}</span>
                <div style="flex: 1;">
                    <div style="font-size: 0.9rem; margin-bottom: 0.25rem;">${log.message}</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary);">
                        ${date.toLocaleString('pt-BR')}
                    </div>
                    ${log.details ? `<div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem; font-family: monospace; max-width: 100%; overflow: hidden; text-overflow: ellipsis;">${typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');

    logsContainer.innerHTML = logsHtml;
}

// Callback para quando logs são atualizados
window.onAcontecLogUpdate = function (newLog) {
    refreshAcontecLogs();
};

// Adicionar animação de spin para ícone de sync
const style = document.createElement('style');
style.textContent = `
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);

console.log('✅ Acontec Integration UI initialized');
