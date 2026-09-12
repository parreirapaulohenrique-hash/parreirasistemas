/**
 * maxcrm-import.js — Motor e Interface de Importação de Clientes/Empresas
 * =========================================================================
 * Lê arquivos .xlsx, .xls e .csv (via SheetJS) e mapeia as 20 colunas
 * padrão da base de prospecção territorial para Firestore e IndexedDB.
 *
 * Parreira Sistemas — MAXCRM v1.2.0
 */

const MaxCRMImport = (() => {

    const TENANT_ID = 'parreira';

    // Mapeamento flexível de sinônimos de colunas para as 20 propriedades
    const COLUMN_ALIASES = {
        ordem:           ['#', 'ordem', 'seq', 'numero_seq', 'id_seq'],
        razaoSocial:     ['razao social', 'razão social', 'razaosocial', 'nome_razao', 'empresa'],
        nomeFantasia:    ['nome fantasia', 'fantasia', 'nomefantasia', 'nome comercial'],
        cnpj:            ['cnpj', 'documento', 'cgc'],
        segmento:        ['segmento', 'ramo', 'setor', 'categoria'],
        cnae:            ['cnae', 'atividade principal', 'descricao cnae'],
        dataFundacao:    ['fundacao', 'fundação', 'abertura', 'data abertura', 'data fundacao'],
        anosAtividade:   ['anos de atividade', 'anos atividade', 'tempo atividade', 'anos'],
        porte:           ['porte', 'porte (funcionarios)', 'porte (funcionários)', 'faixa funcionários'],
        numFuncionarios: ['nº funcionarios', 'nº funcionários', 'num funcionarios', 'qtd funcionarios', 'funcionarios'],
        capitalSocial:   ['capital social (r$)', 'capital social', 'capital', 'capitalsocial'],
        telefone:        ['telefone 1', 'telefone', 'fone 1', 'fone', 'tel 1', 'tel'],
        telefone2:       ['telefone 2', 'fone 2', 'tel 2', 'celular', 'whatsapp'],
        email:           ['e-mail', 'email', 'correio eletronico'],
        logradouro:      ['logradouro', 'rua', 'avenida', 'endereco', 'endereço'],
        numero:          ['numero', 'número', 'num', 'nº'],
        bairro:          ['bairro', 'distrito'],
        cep:             ['cep', 'codigo postal'],
        cidade:          ['cidade', 'municipio', 'município'],
        uf:              ['uf', 'estado', 'sigla uf']
    };

    function _normalizeHeader(h) {
        return (h || '')
            .toString()
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    function _matchField(headerStr) {
        const norm = _normalizeHeader(headerStr);
        for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
            for (const a of aliases) {
                if (norm === a || norm.replace(/\s+/g, '') === a.replace(/\s+/g, '')) {
                    return field;
                }
            }
        }
        return null;
    }

    function _parseDate(val) {
        if (!val) return '';
        if (val instanceof Date) {
            return val.toISOString().split('T')[0];
        }
        if (typeof val === 'number') {
            // Excel serial date (1899-12-30 origin)
            try {
                const date = new Date(Math.round((val - 25569) * 86400 * 1000));
                return date.toISOString().split('T')[0];
            } catch (e) {
                return String(val);
            }
        }
        return String(val).trim();
    }

    function _parseNum(val) {
        if (val === null || val === undefined || val === '') return null;
        if (typeof val === 'number') return val;
        const cleaned = String(val).replace(/[^\d.,-]/g, '').replace(',', '.');
        const n = parseFloat(cleaned);
        return isNaN(n) ? null : n;
    }

    function _cleanStr(val) {
        if (val === null || val === undefined) return '';
        const s = String(val).trim();
        return s === 'None' || s === 'null' ? '' : s;
    }

    // Processa o workbook do SheetJS
    function parseWorkbook(workbook) {
        const sheetName = workbook.SheetNames.includes('Base de Dados') ? 'Base de Dados' : workbook.SheetNames[0];
        const ws = workbook.Sheets[sheetName];
        if (!ws) throw new Error('Aba da planilha não encontrada');

        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
        if (!rows || rows.length === 0) throw new Error('Planilha vazia');

        // Encontra a linha de cabeçalho (pode estar na linha 1, 2, 3 ou 4)
        let headerRowIndex = -1;
        let colMapping = {};

        for (let r = 0; r < Math.min(10, rows.length); r++) {
            const row = rows[r];
            if (!Array.isArray(row)) continue;
            let matches = 0;
            const tempMapping = {};

            row.forEach((cell, colIdx) => {
                if (cell) {
                    const matchedField = _matchField(cell);
                    if (matchedField) {
                        tempMapping[colIdx] = matchedField;
                        matches++;
                    }
                }
            });

            // Se encontrou ao menos 4 colunas chave (ex: CNPJ, Razao, Cidade, Segmento), achou o cabeçalho
            if (matches >= 4) {
                headerRowIndex = r;
                colMapping = tempMapping;
                break;
            }
        }

        if (headerRowIndex === -1) {
            throw new Error('Cabeçalhos da planilha não identificados. Certifique-se de que a planilha possui as colunas da base territorial (Razão Social, CNPJ, Cidade, etc.).');
        }

        // Lê os dados a partir da linha seguinte ao cabeçalho
        const empresas = [];
        const agora = new Date().toISOString();

        for (let r = headerRowIndex + 1; r < rows.length; r++) {
            const row = rows[r];
            if (!Array.isArray(row) || !row.some(c => c !== null && c !== '')) continue;

            const emp = {
                tenantId:   TENANT_ID,
                status:     'prospecto',
                syncStatus: 'synced',
                leadScore:  0,
                origem:     'importado_planilha',
                criadoEm:   agora,
                atualizadoEm: agora
            };

            Object.entries(colMapping).forEach(([colIdx, field]) => {
                const val = row[parseInt(colIdx)];
                if (field === 'dataFundacao') {
                    emp[field] = _parseDate(val);
                } else if (field === 'capitalSocial' || field === 'numFuncionarios' || field === 'anosAtividade' || field === 'ordem') {
                    emp[field] = _parseNum(val);
                } else {
                    emp[field] = _cleanStr(val);
                }
            });

            // Normalização obrigatória
            emp.razaoSocial = emp.razaoSocial || emp.nomeFantasia || '';
            emp.nomeFantasia = emp.nomeFantasia || emp.razaoSocial;
            if (!emp.razaoSocial && !emp.cnpj) continue;

            // Formatação de endereço consolidado
            const endParts = [emp.logradouro, emp.numero, emp.bairro].filter(Boolean);
            emp.endereco = endParts.join(', ');

            // Gera ID estável
            const cnpjDigits = (emp.cnpj || '').replace(/\D/g, '');
            if (cnpjDigits && cnpjDigits.length === 14) {
                emp.id = `lead_cnpj_${cnpjDigits}`;
            } else if (emp.ordem) {
                emp.id = `lead_seq_${String(emp.ordem).padStart(4, '0')}`;
            } else {
                emp.id = `lead_row_${r}_${Math.random().toString(36).substring(2, 7)}`;
            }

            empresas.push(emp);
        }

        return {
            sheetName,
            totalLinhas: rows.length,
            headerRow: headerRowIndex + 1,
            colunasMapeadas: Object.values(colMapping),
            empresas
        };
    }

    // Modal de Importação com Drag-and-Drop e Barra de Progresso
    function abrirModalImportacao(onConcluido) {
        const modalId = 'maxcrmModalImport';
        let modal = document.getElementById(modalId);
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = modalId;
        modal.style.cssText = `
            position: fixed; inset: 0; z-index: 10000;
            background: rgba(0,0,0,0.85); backdrop-filter: blur(8px);
            display: flex; align-items: center; justify-content: center; padding: 16px;
        `;

        modal.innerHTML = `
            <div style="
                background: #18181b; border: 1px solid rgba(225,29,72,0.35); border-radius: 16px;
                max-width: 680px; width: 100%; max-height: 90vh; display: flex; flex-direction: column;
                box-shadow: 0 25px 60px rgba(0,0,0,0.9), 0 0 40px rgba(225,29,72,0.25); overflow: hidden;
            ">
                <!-- Header -->
                <div style="padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between; background: rgba(225,29,72,0.06)">
                    <div style="display:flex;align-items:center;gap:10px">
                        <span class="material-icons-round" style="color:#fb7185;font-size:1.5rem">upload_file</span>
                        <div>
                            <div style="font-weight: 800; font-size: 1.05rem; color: #fff;">Importar Base de Clientes</div>
                            <div style="font-size: 0.72rem; color: #a1a1aa;">Planilha territorial (.xlsx, .xls ou .csv) — 20 colunas</div>
                        </div>
                    </div>
                    <button id="btnFecharModalImport" style="background:none;border:none;color:#a1a1aa;cursor:pointer;padding:4px;border-radius:6px">
                        <span class="material-icons-round">close</span>
                    </button>
                </div>

                <!-- Body -->
                <div style="padding: 20px; overflow-y: auto; flex: 1;">
                    <!-- Dropzone -->
                    <div id="importDropzone" style="
                        border: 2px dashed rgba(225,29,72,0.4); border-radius: 12px; padding: 30px 20px;
                        text-align: center; cursor: pointer; transition: all 0.2s; background: rgba(24,24,27,0.6);
                    ">
                        <span class="material-icons-round" style="font-size: 3rem; color: #fb7185; opacity: 0.9; margin-bottom: 8px;">cloud_upload</span>
                        <div style="font-size: 0.95rem; font-weight: 700; color: #fff; margin-bottom: 4px;">Arraste a planilha aqui ou clique para selecionar</div>
                        <div style="font-size: 0.75rem; color: #71717a;">Compatível com a planilha prospeccao_redencao_pa (.xlsx)</div>
                        <input type="file" id="importFileInput" accept=".xlsx,.xls,.csv" style="display:none">
                    </div>

                    <!-- Feedback de Carregamento -->
                    <div id="importLoading" style="display:none; text-align:center; padding: 25px 10px;">
                        <div style="display:inline-block;width:32px;height:32px;border:3px solid rgba(225,29,72,0.2);border-top-color:#e11d48;border-radius:50%;animation:spin 0.8s linear infinite;margin-bottom:10px"></div>
                        <div id="importLoadingMsg" style="font-size:0.85rem;color:#f4f4f5;font-weight:600">Lendo arquivo...</div>
                    </div>

                    <!-- Preview -->
                    <div id="importPreviewArea" style="display:none; margin-top: 16px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px;">
                            <span style="font-size:0.82rem; font-weight:700; color:#34d399;" id="importPreviewCount">0 empresas identificadas</span>
                            <span style="font-size:0.72rem; color:#a1a1aa;" id="importPreviewCols">20 colunas</span>
                        </div>
                        <div style="max-height: 180px; overflow: auto; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; background:#0f0f12;">
                            <table style="width:100%; border-collapse:collapse; font-size:0.75rem; text-align:left;">
                                <thead>
                                    <tr style="background:rgba(255,255,255,0.04); color:#a1a1aa; position:sticky; top:0;">
                                        <th style="padding:6px 10px;">Razão Social</th>
                                        <th style="padding:6px 10px;">Fantasia</th>
                                        <th style="padding:6px 10px;">CNPJ</th>
                                        <th style="padding:6px 10px;">Segmento</th>
                                        <th style="padding:6px 10px;">Cidade/UF</th>
                                    </tr>
                                </thead>
                                <tbody id="importPreviewTbody"></tbody>
                            </table>
                        </div>

                        <!-- Barra de Progresso da Gravação -->
                        <div id="importProgressBarWrap" style="display:none; margin-top:16px;">
                            <div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-bottom:6px; color:#f4f4f5;">
                                <span id="importProgressLabel">Gravando registros...</span>
                                <span id="importProgressPct">0%</span>
                            </div>
                            <div style="height:8px; background:rgba(255,255,255,0.1); border-radius:4px; overflow:hidden;">
                                <div id="importProgressFill" style="height:100%; width:0%; background:linear-gradient(90deg, #e11d48, #10b981); transition:width 0.2s"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div style="padding: 14px 20px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: flex-end; gap: 10px; background: rgba(0,0,0,0.2);">
                    <button id="btnCancelarImport" style="padding: 8px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: transparent; color: #a1a1aa; font-weight: 600; font-size: 0.82rem; cursor: pointer;">Cancelar</button>
                    <button id="btnConfirmarImport" style="display:none; padding: 8px 20px; border-radius: 8px; border: none; background: linear-gradient(135deg, #10b981, #059669); color: white; font-weight: 700; font-size: 0.85rem; cursor: pointer; box-shadow: 0 4px 14px rgba(16,185,129,0.3);">
                        <span class="material-icons-round" style="font-size:1.05rem; vertical-align:middle; margin-right:4px;">save</span>
                        Confirmar e Gravar (<span id="btnImportQtd">0</span>)
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Estilo de animação
        if (!document.getElementById('keyframesSpin')) {
            const st = document.createElement('style');
            st.id = 'keyframesSpin';
            st.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
            document.head.appendChild(st);
        }

        const dropzone = modal.querySelector('#importDropzone');
        const fileInput = modal.querySelector('#importFileInput');
        const previewArea = modal.querySelector('#importPreviewArea');
        const previewCount = modal.querySelector('#importPreviewCount');
        const previewCols = modal.querySelector('#importPreviewCols');
        const previewTbody = modal.querySelector('#importPreviewTbody');
        const btnConfirmar = modal.querySelector('#btnConfirmarImport');
        const btnImportQtd = modal.querySelector('#btnImportQtd');
        const loadingDiv = modal.querySelector('#importLoading');
        const loadingMsg = modal.querySelector('#importLoadingMsg');
        const progressWrap = modal.querySelector('#importProgressBarWrap');
        const progressLabel = modal.querySelector('#importProgressLabel');
        const progressPct = modal.querySelector('#importProgressPct');
        const progressFill = modal.querySelector('#importProgressFill');

        let parsedEmpresas = [];

        const fechar = () => modal.remove();
        modal.querySelector('#btnFecharModalImport').onclick = fechar;
        modal.querySelector('#btnCancelarImport').onclick = fechar;

        dropzone.onclick = () => fileInput.click();
        dropzone.ondragover = (e) => { e.preventDefault(); dropzone.style.borderColor = '#10b981'; };
        dropzone.ondragleave = () => { dropzone.style.borderColor = 'rgba(225,29,72,0.4)'; };
        dropzone.ondrop = (e) => {
            e.preventDefault();
            dropzone.style.borderColor = 'rgba(225,29,72,0.4)';
            if (e.dataTransfer.files.length) processarArquivo(e.dataTransfer.files[0]);
        };
        fileInput.onchange = (e) => {
            if (e.target.files.length) processarArquivo(e.target.files[0]);
        };

        function processarArquivo(file) {
            if (typeof XLSX === 'undefined') {
                alert('A biblioteca SheetJS (XLSX) está carregando. Aguarde alguns instantes e tente novamente.');
                return;
            }

            dropzone.style.display = 'none';
            loadingDiv.style.display = 'block';
            loadingMsg.textContent = `Lendo "${file.name}"...`;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const res = parseWorkbook(workbook);

                    parsedEmpresas = res.empresas;
                    loadingDiv.style.display = 'none';
                    previewArea.style.display = 'block';

                    previewCount.textContent = `✅ ${parsedEmpresas.length} empresas identificadas com sucesso`;
                    previewCols.textContent = `${res.colunasMapeadas.length} colunas mapeadas (aba "${res.sheetName}")`;
                    btnImportQtd.textContent = parsedEmpresas.length;
                    btnConfirmar.style.display = 'inline-flex';

                    previewTbody.innerHTML = parsedEmpresas.slice(0, 10).map(emp => `
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                            <td style="padding:6px 10px; font-weight:600; color:#fff;">${emp.razaoSocial || '—'}</td>
                            <td style="padding:6px 10px; color:#a1a1aa;">${emp.nomeFantasia || '—'}</td>
                            <td style="padding:6px 10px; color:#38bdf8;">${emp.cnpj || '—'}</td>
                            <td style="padding:6px 10px; color:#fb7185;">${emp.segmento || '—'}</td>
                            <td style="padding:6px 10px; color:#a1a1aa;">${[emp.cidade, emp.uf].filter(Boolean).join('/')}</td>
                        </tr>
                    `).join('');
                } catch (err) {
                    loadingDiv.style.display = 'none';
                    dropzone.style.display = 'block';
                    alert('Erro ao processar planilha: ' + err.message);
                }
            };
            reader.readAsArrayBuffer(file);
        }

        btnConfirmar.onclick = async () => {
            if (parsedEmpresas.length === 0) return;
            btnConfirmar.disabled = true;
            btnConfirmar.style.opacity = '0.5';
            progressWrap.style.display = 'block';

            try {
                const total = parsedEmpresas.length;
                let gravados = 0;

                // 1. Gravar em lotes no Firestore se disponível
                if (typeof firebase !== 'undefined' && firebase.firestore) {
                    const db = firebase.firestore();
                    const batchLimit = 350;

                    for (let i = 0; i < total; i += batchLimit) {
                        const chunk = parsedEmpresas.slice(i, i + batchLimit);
                        const batch = db.batch();

                        chunk.forEach(emp => {
                            const ref = db.doc(`tenants/${TENANT_ID}/empresas/${emp.id}`);
                            batch.set(ref, {
                                ...emp,
                                atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
                                sincronizadoEm: firebase.firestore.FieldValue.serverTimestamp()
                            }, { merge: true });
                        });

                        await batch.commit();
                        gravados += chunk.length;
                        const pct = Math.round((gravados / total) * 100);
                        progressFill.style.width = `${pct}%`;
                        progressPct.textContent = `${pct}%`;
                        progressLabel.textContent = `Gravando nuvem: ${gravados} de ${total}...`;
                    }
                }

                // 2. Gravar no IndexedDB local para uso instantâneo
                progressLabel.textContent = `Atualizando base local (IndexedDB)...`;
                if (typeof MaxCRMDB !== 'undefined' && MaxCRMDB.salvarEmpresasEmLote) {
                    await MaxCRMDB.salvarEmpresasEmLote(parsedEmpresas);
                }

                progressFill.style.width = '100%';
                progressPct.textContent = '100%';
                progressLabel.textContent = `🎉 Concluído! ${total} empresas importadas.`;

                setTimeout(() => {
                    modal.remove();
                    if (typeof onConcluido === 'function') onConcluido(parsedEmpresas);
                    if (typeof window.showToast === 'function') {
                        window.showToast(`Importação concluída: ${total} empresas gravadas com sucesso!`, 'success');
                    } else {
                        alert(`Sucesso! ${total} empresas importadas e sincronizadas.`);
                    }
                }, 800);

            } catch (err) {
                console.error('[MaxCRMImport] Erro ao gravar:', err);
                alert('Erro na gravação: ' + err.message);
                btnConfirmar.disabled = false;
                btnConfirmar.style.opacity = '1';
            }
        };
    }

    return {
        parseWorkbook,
        abrirModalImportacao
    };

})();

window.MaxCRMImport = MaxCRMImport;
console.log('✅ MaxCRMImport (Planilha Territorial) carregado');
