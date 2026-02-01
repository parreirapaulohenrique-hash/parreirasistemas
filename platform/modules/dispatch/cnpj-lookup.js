/**
 * CNPJ LOOKUP MODULE - Consulta de dados de empresas via CNPJ
 * Usa a BrasilAPI (gratuita e sem cadastro)
 * Version: 1.0.0
 * Created: 2026-01-21
 */

const CNPJLookup = {
    /**
     * Remove caracteres não numéricos do CNPJ
     */
    cleanCNPJ(cnpj) {
        return (cnpj || '').replace(/\D/g, '');
    },

    /**
     * Valida formato do CNPJ (apenas quantidade de dígitos)
     */
    isValidFormat(cnpj) {
        const cleaned = this.cleanCNPJ(cnpj);
        return cleaned.length === 14;
    },

    /**
     * Formata CNPJ para exibição: XX.XXX.XXX/XXXX-XX
     */
    formatCNPJ(cnpj) {
        const cleaned = this.cleanCNPJ(cnpj);
        if (cleaned.length !== 14) return cnpj;
        return cleaned.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    },

    /**
     * Busca dados da empresa pelo CNPJ na BrasilAPI
     * @param {string} cnpj - CNPJ com ou sem formatação
     * @returns {Promise<Object>} Dados da empresa ou erro
     */
    async lookup(cnpj) {
        const cleaned = this.cleanCNPJ(cnpj);

        if (!this.isValidFormat(cleaned)) {
            throw new Error('CNPJ deve conter 14 dígitos');
        }

        try {
            const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleaned}`);

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('CNPJ não encontrado na base da Receita Federal');
                }
                throw new Error(`Erro na consulta: ${response.status}`);
            }

            const data = await response.json();

            // Normalizar dados para nosso formato
            return {
                // Identificação
                cnpj: this.formatCNPJ(data.cnpj),
                razaoSocial: data.razao_social || '',
                nomeFantasia: data.nome_fantasia || data.razao_social || '',

                // Situação
                situacao: data.descricao_situacao_cadastral || '',
                dataSituacao: data.data_situacao_cadastral || '',

                // Endereço
                logradouro: data.descricao_tipo_de_logradouro ?
                    `${data.descricao_tipo_de_logradouro} ${data.logradouro}` :
                    data.logradouro || '',
                numero: data.numero || '',
                complemento: data.complemento || '',
                bairro: data.bairro || '',
                cidade: data.municipio || '',
                uf: data.uf || '',
                cep: data.cep || '',

                // Contato
                telefone: data.ddd_telefone_1 ?
                    `(${data.ddd_telefone_1.substring(0, 2)}) ${data.ddd_telefone_1.substring(2)}` : '',
                telefone2: data.ddd_telefone_2 ?
                    `(${data.ddd_telefone_2.substring(0, 2)}) ${data.ddd_telefone_2.substring(2)}` : '',
                email: data.email || '',

                // Atividade
                atividadePrincipal: data.cnae_fiscal_descricao || '',
                codigoCNAE: data.cnae_fiscal || '',

                // Jurídico
                naturezaJuridica: data.natureza_juridica || '',
                porte: data.porte || '',
                capitalSocial: data.capital_social || 0,

                // Sócios
                socios: (data.qsa || []).map(s => ({
                    nome: s.nome_socio,
                    qualificacao: s.qualificacao_socio,
                    dataEntrada: s.data_entrada_sociedade
                })),

                // Simples Nacional
                optanteSimples: data.opcao_pelo_simples,
                optanteMEI: data.opcao_pelo_mei,

                // Metadados
                dataAbertura: data.data_inicio_atividade || '',

                // Dados brutos para debug
                _raw: data
            };
        } catch (error) {
            console.error('[CNPJLookup] Erro:', error);
            throw error;
        }
    },

    /**
     * Preenche campos de formulário com dados da empresa
     * @param {Object} data - Dados retornados pelo lookup
     * @param {Object} fieldMap - Mapeamento campo -> id do input
     */
    fillForm(data, fieldMap) {
        Object.entries(fieldMap).forEach(([dataKey, inputId]) => {
            const input = document.getElementById(inputId);
            if (input && data[dataKey] !== undefined) {
                input.value = data[dataKey];
                // Trigger change event para validações
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    },

    /**
     * Cria um modal de busca de CNPJ
     * @param {Function} onSelect - Callback quando empresa é selecionada
     */
    showLookupModal(onSelect, title = 'Buscar Empresa por CNPJ') {
        // Remover modal anterior se existir
        const existingModal = document.getElementById('cnpj-lookup-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'cnpj-lookup-modal';
        modal.innerHTML = `
            <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000;">
                <div style="background: var(--bg-secondary, #1e293b); border-radius: 16px; padding: 24px; width: 90%; max-width: 600px; max-height: 80vh; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                        <h2 style="margin: 0; color: var(--text-primary, white);">${title}</h2>
                        <button onclick="document.getElementById('cnpj-lookup-modal').remove()" 
                            style="background: none; border: none; color: var(--text-secondary, #94a3b8); font-size: 24px; cursor: pointer;">×</button>
                    </div>
                    
                    <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                        <input type="text" id="cnpj-lookup-input" placeholder="Digite o CNPJ (apenas números)" 
                            style="flex: 1; padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border-color, #334155); 
                                   background: var(--bg-primary, #0f172a); color: var(--text-primary, white); font-size: 16px;"
                            maxlength="18">
                        <button id="cnpj-lookup-btn" 
                            style="padding: 12px 24px; background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; 
                                   border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">
                            🔍 Buscar
                        </button>
                    </div>
                    
                    <div id="cnpj-lookup-result" style="display: none;">
                        <!-- Resultado será inserido aqui -->
                    </div>
                    
                    <div id="cnpj-lookup-loading" style="display: none; text-align: center; padding: 40px; color: var(--text-secondary, #94a3b8);">
                        <div style="font-size: 32px; margin-bottom: 10px;">⏳</div>
                        <div>Consultando Receita Federal...</div>
                    </div>
                    
                    <div id="cnpj-lookup-error" style="display: none; text-align: center; padding: 20px; color: #ef4444; background: rgba(239,68,68,0.1); border-radius: 8px;">
                        <!-- Erro será inserido aqui -->
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const input = document.getElementById('cnpj-lookup-input');
        const btn = document.getElementById('cnpj-lookup-btn');
        const resultDiv = document.getElementById('cnpj-lookup-result');
        const loadingDiv = document.getElementById('cnpj-lookup-loading');
        const errorDiv = document.getElementById('cnpj-lookup-error');

        // Formatação automática do CNPJ
        input.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length > 14) value = value.substring(0, 14);

            // Formatar
            if (value.length > 12) {
                value = value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, '$1.$2.$3/$4-$5');
            } else if (value.length > 8) {
                value = value.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4})/, '$1.$2.$3/$4');
            } else if (value.length > 5) {
                value = value.replace(/^(\d{2})(\d{3})(\d{0,3})/, '$1.$2.$3');
            } else if (value.length > 2) {
                value = value.replace(/^(\d{2})(\d{0,3})/, '$1.$2');
            }
            e.target.value = value;
        });

        // Buscar ao pressionar Enter
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') btn.click();
        });

        // Botão de busca
        btn.addEventListener('click', async () => {
            const cnpj = input.value;

            if (!this.isValidFormat(cnpj)) {
                errorDiv.innerHTML = '❌ CNPJ inválido. Digite 14 números.';
                errorDiv.style.display = 'block';
                resultDiv.style.display = 'none';
                return;
            }

            // Loading
            loadingDiv.style.display = 'block';
            resultDiv.style.display = 'none';
            errorDiv.style.display = 'none';
            btn.disabled = true;

            try {
                const data = await this.lookup(cnpj);

                // Mostrar resultado
                resultDiv.innerHTML = `
                    <div style="background: var(--bg-primary, #0f172a); border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                        <div style="font-size: 1.2rem; font-weight: 700; color: var(--text-primary, white); margin-bottom: 8px;">
                            ${data.nomeFantasia || data.razaoSocial}
                        </div>
                        <div style="font-size: 0.9rem; color: var(--text-secondary, #94a3b8); margin-bottom: 4px;">
                            ${data.razaoSocial}
                        </div>
                        <div style="font-size: 0.85rem; color: var(--text-secondary, #94a3b8);">
                            CNPJ: ${data.cnpj} | 
                            <span style="color: ${data.situacao === 'ATIVA' ? '#22c55e' : '#ef4444'}; font-weight: 600;">
                                ${data.situacao}
                            </span>
                        </div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 16px;">
                        <div style="background: var(--bg-primary, #0f172a); padding: 12px; border-radius: 8px;">
                            <div style="font-size: 0.75rem; color: var(--text-secondary, #94a3b8); margin-bottom: 4px;">📍 Endereço</div>
                            <div style="color: var(--text-primary, white); font-size: 0.9rem;">
                                ${data.logradouro}${data.numero ? ', ' + data.numero : ''}
                                ${data.complemento ? ' - ' + data.complemento : ''}<br>
                                ${data.bairro} - ${data.cidade}/${data.uf}<br>
                                CEP: ${data.cep}
                            </div>
                        </div>
                        
                        <div style="background: var(--bg-primary, #0f172a); padding: 12px; border-radius: 8px;">
                            <div style="font-size: 0.75rem; color: var(--text-secondary, #94a3b8); margin-bottom: 4px;">📞 Contato</div>
                            <div style="color: var(--text-primary, white); font-size: 0.9rem;">
                                ${data.telefone || 'Não informado'}<br>
                                ${data.email || 'Email não informado'}
                            </div>
                        </div>
                        
                        <div style="background: var(--bg-primary, #0f172a); padding: 12px; border-radius: 8px;">
                            <div style="font-size: 0.75rem; color: var(--text-secondary, #94a3b8); margin-bottom: 4px;">🏢 Atividade</div>
                            <div style="color: var(--text-primary, white); font-size: 0.9rem;">
                                ${data.atividadePrincipal || 'Não informada'}
                            </div>
                        </div>
                    </div>
                    
                    <button id="cnpj-select-btn" 
                        style="width: 100%; padding: 14px; background: linear-gradient(135deg, #22c55e, #16a34a); 
                               color: white; border: none; border-radius: 8px; font-weight: 700; font-size: 1rem; 
                               cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        ✅ USAR ESTES DADOS
                    </button>
                `;

                resultDiv.style.display = 'block';

                // Botão de seleção
                document.getElementById('cnpj-select-btn').addEventListener('click', () => {
                    modal.remove();
                    if (onSelect) onSelect(data);
                });

            } catch (error) {
                errorDiv.innerHTML = `❌ ${error.message}`;
                errorDiv.style.display = 'block';
            } finally {
                loadingDiv.style.display = 'none';
                btn.disabled = false;
            }
        });

        // Focar no input
        setTimeout(() => input.focus(), 100);
    }
};

// Expor globalmente
window.CNPJLookup = CNPJLookup;

console.log('✅ CNPJ Lookup Module loaded');
