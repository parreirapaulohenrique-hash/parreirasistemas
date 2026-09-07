/**
 * CNPJ LOOKUP MODULE - Consulta de dados de empresas via CNPJ
 * Usa a BrasilAPI (gratuita e sem cadastro)
 * Version: 1.0.0
 * Created: 2026-01-21
 */

const CNPJLookup = {
    /**
     * Remove caracteres não numéricos do documento (CNPJ/CPF)
     */
    cleanCNPJ(cnpj) {
        return (cnpj || '').replace(/\D/g, '');
    },

    /**
     * Valida formato do documento (11 para CPF, 14 para CNPJ)
     */
    isValidFormat(cnpj) {
        const cleaned = this.cleanCNPJ(cnpj);
        return cleaned.length === 11 || cleaned.length === 14;
    },

    /**
     * Formata documento para exibição
     */
    formatCNPJ(cnpj) {
        const cleaned = this.cleanCNPJ(cnpj);
        if (cleaned.length === 11) {
            return cleaned.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
        }
        if (cleaned.length === 14) {
            return cleaned.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
        }
        return cnpj;
    },

    /**
     * Busca dados da empresa pelo CNPJ na BrasilAPI
     */
    async lookup(cnpj) {
        const cleaned = this.cleanCNPJ(cnpj);

        if (cleaned.length !== 14) {
            throw new Error('Consulta automática via API disponível apenas para CNPJ (14 dígitos).');
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
                cnpj: this.formatCNPJ(data.cnpj),
                razaoSocial: data.razao_social || '',
                nomeFantasia: data.nome_fantasia || data.razao_social || '',
                situacao: data.descricao_situacao_cadastral || '',
                dataSituacao: data.data_situacao_cadastral || '',
                logradouro: data.descricao_tipo_de_logradouro ?
                    `${data.descricao_tipo_de_logradouro} ${data.logradouro}` :
                    data.logradouro || '',
                numero: data.numero || '',
                complemento: data.complemento || '',
                bairro: data.bairro || '',
                cidade: data.municipio || '',
                uf: data.uf || '',
                cep: data.cep || '',
                telefone: data.ddd_telefone_1 ?
                    `(${data.ddd_telefone_1.substring(0, 2)}) ${data.ddd_telefone_1.substring(2)}` : '',
                telefone2: data.ddd_telefone_2 ?
                    `(${data.ddd_telefone_2.substring(0, 2)}) ${data.ddd_telefone_2.substring(2)}` : '',
                email: data.email || '',
                atividadePrincipal: data.cnae_fiscal_descricao || '',
                codigoCNAE: data.cnae_fiscal || '',
                naturezaJuridica: data.natureza_juridica || '',
                porte: data.porte || '',
                capitalSocial: data.capital_social || 0,
                socios: (data.qsa || []).map(s => ({
                    nome: s.nome_socio,
                    qualificacao: s.qualificacao_socio,
                    dataEntrada: s.data_entrada_sociedade
                })),
                optanteSimples: data.opcao_pelo_simples,
                optanteMEI: data.opcao_pelo_mei,
                dataAbertura: data.data_inicio_atividade || '',
                _raw: data
            };
        } catch (error) {
            console.error('[CNPJLookup] Erro:', error);
            throw error;
        }
    },

    fillForm(data, fieldMap) {
        Object.entries(fieldMap).forEach(([dataKey, inputId]) => {
            const input = document.getElementById(inputId);
            if (input && data[dataKey] !== undefined) {
                input.value = data[dataKey];
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    },

    showLookupModal(onSelect, title = 'Buscar Cliente por CNPJ/CPF') {
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
                        <input type="text" id="cnpj-lookup-input" placeholder="Digite o CNPJ ou CPF" 
                            style="flex: 1; padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border-color, #334155); 
                                   background: var(--bg-primary, #0f172a); color: var(--text-primary, white); font-size: 16px;"
                            maxlength="18">
                        <button id="cnpj-lookup-btn" 
                            style="padding: 12px 24px; background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; 
                                   border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">
                            🔍 Buscar
                        </button>
                    </div>
                    
                    <div id="cnpj-lookup-result" style="display: none;"></div>
                    
                    <div id="cnpj-lookup-loading" style="display: none; text-align: center; padding: 40px; color: var(--text-secondary, #94a3b8);">
                        <div style="font-size: 32px; margin-bottom: 10px;">⏳</div>
                        <div>Consultando...</div>
                    </div>
                    
                    <div id="cnpj-lookup-error" style="display: none; text-align: center; padding: 20px; color: #ef4444; background: rgba(239,68,68,0.1); border-radius: 8px;"></div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const input = document.getElementById('cnpj-lookup-input');
        const btn = document.getElementById('cnpj-lookup-btn');
        const resultDiv = document.getElementById('cnpj-lookup-result');
        const loadingDiv = document.getElementById('cnpj-lookup-loading');
        const errorDiv = document.getElementById('cnpj-lookup-error');

        // Formatação dinâmica CNPJ ou CPF
        input.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length > 14) value = value.substring(0, 14);

            if (value.length > 11) {
                // Formato CNPJ
                value = value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, '$1.$2.$3/$4-$5');
            } else {
                // Formato CPF
                if (value.length > 9) {
                    value = value.replace(/^(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4');
                } else if (value.length > 6) {
                    value = value.replace(/^(\d{3})(\d{3})(\d{0,3})/, '$1.$2.$3');
                } else if (value.length > 3) {
                    value = value.replace(/^(\d{3})(\d{0,3})/, '$1.$2');
                }
            }
            e.target.value = value;
        });

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') btn.click();
        });

        btn.addEventListener('click', async () => {
            const rawValue = input.value;
            const docLimpo = this.cleanCNPJ(rawValue);

            if (!this.isValidFormat(rawValue)) {
                errorDiv.innerHTML = '❌ Documento inválido. Digite 11 números (CPF) ou 14 números (CNPJ).';
                errorDiv.style.display = 'block';
                resultDiv.style.display = 'none';
                return;
            }

            loadingDiv.style.display = 'block';
            resultDiv.style.display = 'none';
            errorDiv.style.display = 'none';
            btn.disabled = true;

            if (docLimpo.length === 11) {
                // É um CPF. Não tem API pública
                setTimeout(() => {
                    const formattedCpf = this.formatCNPJ(docLimpo);
                    resultDiv.innerHTML = `
                        <div style="background: rgba(234,179,8,0.1); border: 1px solid #eab308; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                            <div style="display:flex; gap: 8px; align-items:center; color: #eab308; font-weight: 700; margin-bottom: 8px;">
                                ⚠️ Consulta Restrita
                            </div>
                            <div style="font-size: 0.9rem; color: var(--text-primary, white); margin-bottom: 8px;">
                                CPF: <strong>${formattedCpf}</strong>
                            </div>
                            <div style="font-size: 0.85rem; color: var(--text-secondary, #94a3b8); line-height: 1.4;">
                                Por determinação da <strong>LGPD</strong>, a Receita Federal não disponibiliza consulta pública gratuita para dados de Pessoas Físicas (CPF).
                                <br><br>Você pode utilizar o CPF informado no seu cadastro, preenchendo os demais dados manualmente.
                            </div>
                        </div>
                        <button id="cnpj-select-btn" 
                            style="width: 100%; padding: 14px; background: linear-gradient(135deg, #eab308, #ca8a04); 
                                   color: white; border: none; border-radius: 8px; font-weight: 700; font-size: 1rem; 
                                   cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
                            📋 UTILIZAR ESTE CPF
                        </button>
                    `;
                    loadingDiv.style.display = 'none';
                    resultDiv.style.display = 'block';
                    btn.disabled = false;

                    document.getElementById('cnpj-select-btn').addEventListener('click', () => {
                        modal.remove();
                        if (onSelect) onSelect({
                            cnpj: formattedCpf,
                            razaoSocial: '',
                            nomeFantasia: ''
                        });
                    });
                }, 500);
                return;
            }

            // É um CNPJ, prosseguir com consulta na BrasilAPI
            try {
                const data = await this.lookup(docLimpo);

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

        setTimeout(() => input.focus(), 100);
    }
};

window.CNPJLookup = CNPJLookup;
console.log('✅ CNPJ/CPF Lookup Module loaded');
