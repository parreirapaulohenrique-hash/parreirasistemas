/**
 * demanda-enrichment.js - Enriquecimento de Produtos via Planilha Excel/CSV
 * =========================================================================
 * Permite importar planilhas tecnicas de catalogo (ex: ACHADOS_TODAS_AS_MARCAS_PESQUISADAS.xlsx
 * ou CADASTRO PRODUTOS.xlsx) para enriquecer a base de produtos no Firestore (techbase/products)
 * com: Equipamento, Similar Genuino (OEM), Similares 1..4, Ref. Fornecedor, Fonte e Status.
 *
 * Utiliza gravacao em lote (batches de 400 com { merge: true }), preservando estoques e
 * precos ja sincronizados pelo ERP Maxdata.
 *
 * Parreira Sistemas - Modulo de Inteligencia de Demanda v3.0.4
 */

const DemandaEnrichment = (() => {
    const TENANT_ID = 'centralpecas';
    const COLLECTION_PATH = 'tenants/' + TENANT_ID + '/demanda/techbase/products';

    let _parsedRows = [];
    let _isImporting = false;
    let _abortController = false;

    function _normalizeHeader(h) {
        if (!h) return '';
        return String(h).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '').trim();
    }

    function _normalizeRef(ref) {
        return (ref || '').toString().toUpperCase().replace(/[\s\-\.\/]/g, '').trim();
    }

    function _extractCrossReferences(aplicacao, descricao, codigoFab, extras) {
        const cross = new Set();
        if (codigoFab) {
            const c = _normalizeRef(codigoFab);
            if (c.length >= 3) cross.add(c);
        }
        if (Array.isArray(extras)) {
            for (const item of extras) {
                if (item) {
                    const c = _normalizeRef(item);
                    if (c.length >= 3) cross.add(c);
                }
            }
        }
        const text = ((aplicacao || '') + ' ' + (descricao || '')).toUpperCase();
        const tokens = text.split(/[\s,;\/\+\|]+/);
        for (const tok of tokens) {
            const clean = _normalizeRef(tok);
            if (clean.length >= 3 && /\d/.test(clean)) {
                cross.add(clean);
            }
        }
        return Array.from(cross);
    }

    function abrirModal() {
        let modal = document.getElementById('modalEnriquecimentoProdutos');
        if (!modal) {
            _criarModalHtml();
            modal = document.getElementById('modalEnriquecimentoProdutos');
        }
        if (modal) {
            modal.style.display = 'flex';
            _resetarEstadoModal();
        }
    }

    function fecharModal() {
        const modal = document.getElementById('modalEnriquecimentoProdutos');
        if (modal) {
            if (_isImporting) {
                if (!confirm('A importação está em andamento. Deseja realmente cancelar?')) return;
                _abortController = true;
            }
            modal.style.display = 'none';
        }
    }

    function _resetarEstadoModal() {
        _parsedRows = [];
        _isImporting = false;
        _abortController = false;

        const fileInput = document.getElementById('enrichFileInput');
        if (fileInput) fileInput.value = '';

        const dropArea = document.getElementById('enrichDropArea');
        if (dropArea) dropArea.style.display = 'block';

        const previewArea = document.getElementById('enrichPreviewArea');
        if (previewArea) previewArea.style.display = 'none';

        const progressArea = document.getElementById('enrichProgressArea');
        if (progressArea) progressArea.style.display = 'none';

        const btnConfirmar = document.getElementById('enrichBtnConfirmar');
        if (btnConfirmar) {
            btnConfirmar.style.display = 'none';
            btnConfirmar.disabled = false;
            btnConfirmar.innerHTML = '<span class="material-icons-round" style="font-size:1rem">cloud_upload</span> Iniciar Gravação no Firestore';
        }
    }

    function _criarModalHtml() {
        const div = document.createElement('div');
        div.id = 'modalEnriquecimentoProdutos';
        div.className = 'modal-backdrop';
        div.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,.75);backdrop-filter:blur(6px);z-index:99999;align-items:center;justify-content:center;padding:1rem';

        div.innerHTML = `
            <div class="modal-box" style="background:#0f172a;border:1px solid rgba(255,255,255,.12);border-radius:12px;width:100%;max-width:820px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 25px 50px -12px rgba(0,0,0,.6);overflow:hidden">
                <!-- Header -->
                <div style="padding:1.1rem 1.4rem;border-bottom:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:space-between;background:linear-gradient(180deg,rgba(30,41,59,.6) 0%,rgba(15,23,42,.6) 100%)">
                    <div style="display:flex;align-items:center;gap:.6rem">
                        <span class="material-icons-round" style="color:#10b981;font-size:1.5rem">auto_awesome</span>
                        <div>
                            <h3 style="margin:0;font-size:1.05rem;font-weight:700;color:#f8fafc">Importar Enriquecimento Técnico de Produtos</h3>
                            <p style="margin:2px 0 0;font-size:.75rem;color:#94a3b8">Alimente Equipamentos, Similares Genuínos (OEM), Similares de Mercado e Ref. Fornecedor via Excel ou CSV</p>
                        </div>
                    </div>
                    <button onclick="DemandaEnrichment.fecharModal()" style="background:none;border:none;color:#94a3b8;cursor:pointer;padding:.3rem;border-radius:6px;display:flex;align-items:center;justify-content:center" onmouseover="this.style.color='#fff'" onmouseout="this.style.color='#94a3b8'">
                        <span class="material-icons-round" style="font-size:1.4rem">close</span>
                    </button>
                </div>

                <!-- Body -->
                <div style="padding:1.4rem;overflow-y:auto;flex:1">
                    <!-- Info Banner -->
                    <div style="background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.25);border-radius:8px;padding:.75rem 1rem;margin-bottom:1.2rem;display:flex;align-items:flex-start;gap:.65rem">
                        <span class="material-icons-round" style="color:#10b981;font-size:1.2rem;margin-top:2px">verified</span>
                        <div style="font-size:.78rem;color:#cbd5e1;line-height:1.4">
                            <strong>Integração Segura em Lote ({ merge: true }):</strong> Esta importação vincula os novos campos técnicos usando o <code>CODIGO</code> do ERP como chave. Preços de venda, custos e saldos de estoque atuais <strong>NÃO</strong> serão sobrescritos ou perdidos.
                        </div>
                    </div>

                    <!-- Drop Zone -->
                    <div id="enrichDropArea" style="border:2px dashed rgba(255,255,255,.2);border-radius:10px;padding:2.5rem 1.5rem;text-align:center;cursor:pointer;background:rgba(255,255,255,.02);transition:all .2s ease"
                        onclick="document.getElementById('enrichFileInput').click()"
                        ondragover="event.preventDefault();this.style.borderColor='#10b981';this.style.background='rgba(16,185,129,.05)'"
                        ondragleave="this.style.borderColor='rgba(255,255,255,.2)';this.style.background='rgba(255,255,255,.02)'"
                        ondrop="event.preventDefault();this.style.borderColor='rgba(255,255,255,.2)';this.style.background='rgba(255,255,255,.02)';DemandaEnrichment.onFileDrop(event)">
                        <input type="file" id="enrichFileInput" accept=".xlsx,.xls,.csv" style="display:none" onchange="DemandaEnrichment.onFileSelect(event)">
                        <span class="material-icons-round" style="font-size:3rem;color:#10b981;margin-bottom:.5rem">file_present</span>
                        <h4 style="margin:0 0 .35rem;font-size:1rem;color:#f1f5f9">Arraste ou clique para selecionar a planilha (.xlsx, .csv)</h4>
                        <p style="margin:0;font-size:.78rem;color:#64748b">Compatível com planilhas de <em>ACHADOS_TODAS_AS_MARCAS_PESQUISADAS</em> e <em>CADASTRO PRODUTOS</em></p>
                    </div>

                    <!-- Preview Area -->
                    <div id="enrichPreviewArea" style="display:none;margin-top:1rem">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem">
                            <div id="enrichPreviewTitle" style="font-size:.85rem;font-weight:700;color:#f8fafc"></div>
                            <button onclick="DemandaEnrichment._resetarEstadoModal()" class="btn btn-secondary btn-sm" style="font-size:.72rem;padding:.2rem .6rem">
                                <span class="material-icons-round" style="font-size:.85rem">swap_horiz</span> Trocar Arquivo
                            </button>
                        </div>
                        <div id="enrichPreviewStats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:.6rem;margin-bottom:1rem"></div>
                        <div style="max-height:220px;overflow:auto;border:1px solid rgba(255,255,255,.08);border-radius:6px;background:rgba(0,0,0,.25)">
                            <table id="enrichPreviewTable" style="width:100%;font-size:.74rem;border-collapse:collapse;color:#cbd5e1"></table>
                        </div>
                    </div>

                    <!-- Progress Area -->
                    <div id="enrichProgressArea" style="display:none;margin-top:1.2rem">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.4rem;font-size:.82rem">
                            <span id="enrichProgressLabel" style="color:#f1f5f9;font-weight:600">Gravando dados no Firestore...</span>
                            <span id="enrichProgressPct" style="color:#10b981;font-weight:700;font-family:monospace">0%</span>
                        </div>
                        <div style="width:100%;height:10px;background:rgba(255,255,255,.1);border-radius:5px;overflow:hidden;margin-bottom:.75rem">
                            <div id="enrichProgressBar" style="width:0%;height:100%;background:linear-gradient(90deg,#059669,#10b981);transition:width .15s ease"></div>
                        </div>
                        <div id="enrichProgressDetails" style="font-size:.75rem;color:#94a3b8;display:flex;justify-content:space-between"></div>
                    </div>
                </div>

                <!-- Footer -->
                <div style="padding:.9rem 1.4rem;border-top:1px solid rgba(255,255,255,.08);background:rgba(15,23,42,.9);display:flex;align-items:center;justify-content:flex-end;gap:.6rem">
                    <button onclick="DemandaEnrichment.fecharModal()" class="btn btn-secondary btn-sm" style="padding:.4rem .9rem;font-size:.82rem">Fechar</button>
                    <button id="enrichBtnConfirmar" onclick="DemandaEnrichment.iniciarGravacao()" class="btn btn-primary btn-sm" style="display:none;padding:.4rem 1.1rem;font-size:.82rem;background:linear-gradient(135deg,#059669,#10b981);border:none;font-weight:700;color:#fff">
                        <span class="material-icons-round" style="font-size:1rem">cloud_upload</span> Iniciar Gravação no Firestore
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(div);
    }

    function onFileDrop(e) {
        const files = e.dataTransfer ? e.dataTransfer.files : [];
        if (files && files.length > 0) _processarArquivo(files[0]);
    }

    function onFileSelect(e) {
        const files = e.target.files;
        if (files && files.length > 0) _processarArquivo(files[0]);
    }

    async function _garantirXLSX() {
        if (typeof XLSX !== 'undefined') return true;
        const urls = [
            'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
            'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
            'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
        ];
        for (const u of urls) {
            try {
                await new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = u;
                    s.onload = resolve;
                    s.onerror = reject;
                    document.head.appendChild(s);
                });
                if (typeof XLSX !== 'undefined') return true;
            } catch (_) {}
        }
        return typeof XLSX !== 'undefined';
    }

    async function _processarArquivo(file) {
        if (!file) return;
        const carregou = await _garantirXLSX();
        if (!carregou || typeof XLSX === 'undefined') {
            alert('Não foi possível carregar a biblioteca SheetJS (XLSX). Por favor verifique sua conexão ou recarregue a página.');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

                if (!rawJson || rawJson.length === 0) {
                    alert('Nenhuma linha de dados encontrada na planilha selecionada.');
                    return;
                }

                _interpretarLinhas(rawJson, file.name);
            } catch (err) {
                console.error('[DemandaEnrichment] Erro ao ler planilha:', err);
                alert('Erro ao processar o arquivo: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function _interpretarLinhas(rawRows, filename) {
        const first = rawRows[0];
        const headerMap = {};
        Object.keys(first).forEach(k => {
            const norm = _normalizeHeader(k);
            if (norm === 'CODIGO' || norm === 'COD' || norm === 'ID' || norm === 'PRODUTO' || norm === 'CODPRODUTO') headerMap.codigo = k;
            else if (norm.includes('REFERENCIA') || norm === 'REFFABRICA' || norm === 'CODFAB') headerMap.referencia = k;
            else if (norm.includes('DESC') || norm === 'DESCRICAO') headerMap.descricao = k;
            else if (norm === 'UN' || norm === 'UND' || norm === 'UNIDADE') headerMap.unidade = k;
            else if (norm === 'MARCA' || norm === 'FABRICANTE') headerMap.marca = k;
            else if (norm.includes('EQUIPAMENTO') || norm.includes('MAQUINA')) headerMap.equipamento = k;
            else if (norm.includes('APLICACAO') || norm.includes('APLICACO')) headerMap.aplicacao = k;
            else if (norm.includes('GENUINO') || norm.includes('OEM')) headerMap.similarGenuino = k;
            else if (norm.includes('SIMILARES1') || norm === 'SIMILAR1') headerMap.similar1 = k;
            else if (norm.includes('SIMILARES2') || norm === 'SIMILAR2') headerMap.similar2 = k;
            else if (norm.includes('SIMILARES3') || norm === 'SIMILAR3') headerMap.similar3 = k;
            else if (norm.includes('SIMILARES4') || norm === 'SIMILAR4') headerMap.similar4 = k;
            else if (norm.includes('REFFORNECEDOR') || norm.includes('FORNECEDOR')) headerMap.refFornecedor = k;
            else if (norm.includes('FOTO') || norm.includes('IMAGEM')) headerMap.fotoProduto = k;
            else if (norm === 'FONTE' || norm.includes('FONTE')) headerMap.fonte = k;
            else if (norm.includes('STATUS')) headerMap.statusPesquisa = k;
        });

        if (!headerMap.codigo) {
            alert('Coluna CODIGO não identificada na planilha. Verifique se o cabeçalho possui uma coluna com CODIGO ou ID.');
            return;
        }

        const produtos = [];
        let comEquip = 0, comGenuino = 0, comSimilares = 0, comForn = 0;

        rawRows.forEach(row => {
            const rawCod = row[headerMap.codigo];
            if (!rawCod && rawCod !== 0) return;
            const codigo = String(rawCod).trim();
            if (!codigo) return;

            const refFab = headerMap.referencia ? String(row[headerMap.referencia] || '').trim() : '';
            const desc = headerMap.descricao ? String(row[headerMap.descricao] || '').trim() : '';
            const un = headerMap.unidade ? String(row[headerMap.unidade] || 'UN').trim() : 'UN';
            const marca = headerMap.marca ? String(row[headerMap.marca] || '').trim() : '';
            const equip = headerMap.equipamento ? String(row[headerMap.equipamento] || '').trim() : '';
            const aplic = headerMap.aplicacao ? String(row[headerMap.aplicacao] || '').trim() : '';
            const simGen = headerMap.similarGenuino ? String(row[headerMap.similarGenuino] || '').trim() : '';
            const sim1 = headerMap.similar1 ? String(row[headerMap.similar1] || '').trim() : '';
            const sim2 = headerMap.similar2 ? String(row[headerMap.similar2] || '').trim() : '';
            const sim3 = headerMap.similar3 ? String(row[headerMap.similar3] || '').trim() : '';
            const sim4 = headerMap.similar4 ? String(row[headerMap.similar4] || '').trim() : '';
            const refForn = headerMap.refFornecedor ? String(row[headerMap.refFornecedor] || '').trim() : '';
            const foto = headerMap.fotoProduto ? String(row[headerMap.fotoProduto] || '').trim() : '';
            const fonte = headerMap.fonte ? String(row[headerMap.fonte] || '').trim() : '';
            const status = headerMap.statusPesquisa ? String(row[headerMap.statusPesquisa] || '').trim() : '';

            if (equip) comEquip++;
            if (simGen) comGenuino++;
            if (sim1 || sim2 || sim3 || sim4) comSimilares++;
            if (refForn) comForn++;

            const cross = _extractCrossReferences(aplic, desc, refFab, [simGen, sim1, sim2, sim3, sim4, refForn]);

            produtos.push({
                codigo,
                refFab,
                desc,
                un,
                marca,
                equip,
                aplic,
                simGen,
                sim1,
                sim2,
                sim3,
                sim4,
                refForn,
                foto,
                fonte,
                status,
                cross
            });
        });

        _parsedRows = produtos;

        // Renderiza Preview
        document.getElementById('enrichDropArea').style.display = 'none';
        const previewArea = document.getElementById('enrichPreviewArea');
        previewArea.style.display = 'block';

        document.getElementById('enrichPreviewTitle').innerHTML = 
            '<strong>' + filename + '</strong>: ' + produtos.length.toLocaleString('pt-BR') + ' produtos identificados';

        const statsHtml = `
            <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:6px;padding:.5rem;text-align:center">
                <div style="font-size:.65rem;color:#94a3b8;text-transform:uppercase">Equipamento</div>
                <div style="font-size:1.1rem;font-weight:700;color:#60a5fa">${comEquip}</div>
            </div>
            <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:6px;padding:.5rem;text-align:center">
                <div style="font-size:.65rem;color:#94a3b8;text-transform:uppercase">Similar OEM</div>
                <div style="font-size:1.1rem;font-weight:700;color:#fbbf24">${comGenuino}</div>
            </div>
            <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:6px;padding:.5rem;text-align:center">
                <div style="font-size:.65rem;color:#94a3b8;text-transform:uppercase">Similares 1..4</div>
                <div style="font-size:1.1rem;font-weight:700;color:#34d399">${comSimilares}</div>
            </div>
            <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:6px;padding:.5rem;text-align:center">
                <div style="font-size:.65rem;color:#94a3b8;text-transform:uppercase">Ref. Fornec.</div>
                <div style="font-size:1.1rem;font-weight:700;color:#c084fc">${comForn}</div>
            </div>
        `;
        document.getElementById('enrichPreviewStats').innerHTML = statsHtml;

        // Tabela de Preview (primeiros 5 itens)
        let tableHtml = `
            <thead>
                <tr style="background:rgba(255,255,255,.05);border-bottom:1px solid rgba(255,255,255,.08);text-align:left">
                    <th style="padding:.45rem .6rem">Código</th>
                    <th style="padding:.45rem .6rem">Referência</th>
                    <th style="padding:.45rem .6rem">Descrição</th>
                    <th style="padding:.45rem .6rem">Marca</th>
                    <th style="padding:.45rem .6rem">Equipamento</th>
                    <th style="padding:.45rem .6rem">Similar OEM</th>
                    <th style="padding:.45rem .6rem">Ref. Fornecedor</th>
                </tr>
            </thead>
            <tbody>
        `;
        produtos.slice(0, 5).forEach(p => {
            tableHtml += `
                <tr style="border-bottom:1px solid rgba(255,255,255,.03)">
                    <td style="padding:.45rem .6rem;font-family:monospace;color:#38bdf8;font-weight:700">${p.codigo}</td>
                    <td style="padding:.45rem .6rem;font-weight:600">${p.refFab || '-'}</td>
                    <td style="padding:.45rem .6rem;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.desc || '-'}</td>
                    <td style="padding:.45rem .6rem">${p.marca || '-'}</td>
                    <td style="padding:.45rem .6rem;color:#60a5fa">${p.equip || '-'}</td>
                    <td style="padding:.45rem .6rem;color:#fbbf24;font-family:monospace">${p.simGen || '-'}</td>
                    <td style="padding:.45rem .6rem;color:#c084fc;font-family:monospace">${p.refForn || '-'}</td>
                </tr>
            `;
        });
        tableHtml += '</tbody>';
        document.getElementById('enrichPreviewTable').innerHTML = tableHtml;

        // Habilita Botão Confirmar
        const btnConfirmar = document.getElementById('enrichBtnConfirmar');
        btnConfirmar.style.display = 'inline-flex';
        btnConfirmar.innerHTML = '<span class="material-icons-round" style="font-size:1rem">cloud_upload</span> Gravar ' + produtos.length.toLocaleString('pt-BR') + ' Produtos no Firestore';
    }

    async function iniciarGravacao() {
        if (!_parsedRows || _parsedRows.length === 0) return;
        if (typeof firebase === 'undefined') {
            alert('Firebase não está inicializado nesta página.');
            return;
        }

        const db = firebase.firestore();
        _isImporting = true;
        _abortController = false;

        const btnConfirmar = document.getElementById('enrichBtnConfirmar');
        if (btnConfirmar) btnConfirmar.disabled = true;

        const progressArea = document.getElementById('enrichProgressArea');
        progressArea.style.display = 'block';

        const total = _parsedRows.length;
        let processados = 0;
        let batchErrors = 0;
        const BATCH_SIZE = 400;

        const tStart = Date.now();

        for (let i = 0; i < total; i += BATCH_SIZE) {
            if (_abortController) {
                alert('Importação cancelada pelo usuário.');
                break;
            }

            const chunk = _parsedRows.slice(i, i + BATCH_SIZE);
            const batch = db.batch();

            chunk.forEach(p => {
                const docRef = db.collection(COLLECTION_PATH).doc(p.codigo);
                const payload = {
                    id: p.codigo,
                    codigoErp: p.codigo,
                    ativo: true
                };

                if (p.refFab) {
                    payload.referencia = p.refFab.toUpperCase();
                    payload.codigoFab = p.refFab;
                    payload.codigoNorm = _normalizeRef(p.refFab);
                }
                if (p.desc) {
                    payload.descricao = p.desc;
                    payload.descNorm = p.desc.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                }
                if (p.un) {
                    payload.unidade = p.un;
                    payload.un = p.un;
                }
                if (p.marca) {
                    payload.marca = p.marca.toUpperCase().trim();
                    payload.fabricante = p.marca.toUpperCase().trim();
                }
                if (p.equip) payload.equipamento = p.equip;
                if (p.aplic) {
                    payload.aplicacao = p.aplic;
                    payload.aplicacaoNorm = p.aplic.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                }
                if (p.simGen) payload.similarGenuino = p.simGen;
                if (p.sim1) payload.similar1 = p.sim1;
                if (p.sim2) payload.similar2 = p.sim2;
                if (p.sim3) payload.similar3 = p.sim3;
                if (p.sim4) payload.similar4 = p.sim4;
                if (p.refForn) payload.refFornecedor = p.refForn;
                if (p.foto) payload.fotoProduto = p.foto;
                if (p.fonte) payload.fonte = p.fonte;
                if (p.status) payload.statusPesquisa = p.status;
                if (p.cross && p.cross.length > 0) payload.referenciasCruzadas = p.cross;

                payload.enriquecidoEm = new Date().toISOString();
                payload.enriquecidoPor = 'planilha_importacao';
                payload._source = 'firestore_enriquecido';

                batch.set(docRef, payload, { merge: true });
            });

            try {
                await batch.commit();
                processados += chunk.length;
            } catch (bErr) {
                console.error('[DemandaEnrichment] Erro no lote:', bErr);
                batchErrors += chunk.length;
                processados += chunk.length;
            }

            // Atualiza Barra de Progresso
            const pct = Math.min(100, Math.round((processados / total) * 100));
            document.getElementById('enrichProgressPct').textContent = pct + '%';
            document.getElementById('enrichProgressBar').style.width = pct + '%';
            document.getElementById('enrichProgressLabel').textContent = 
                'Processados ' + processados.toLocaleString('pt-BR') + ' de ' + total.toLocaleString('pt-BR') + ' produtos...';

            const elapsedSec = ((Date.now() - tStart) / 1000).toFixed(1);
            document.getElementById('enrichProgressDetails').innerHTML = 
                '<span>Tempo decorrido: ' + elapsedSec + 's</span><span>Erros: ' + batchErrors + '</span>';
        }

        _isImporting = false;

        // Finalização com Sucesso
        document.getElementById('enrichProgressLabel').textContent = 'Concluído com sucesso!';
        document.getElementById('enrichProgressPct').textContent = '100%';
        document.getElementById('enrichProgressBar').style.background = '#10b981';

        // Atualiza a memória do DemandaApp se estiver aberto
        if (typeof DemandaApp !== 'undefined' && DemandaApp.atualizarAposEnriquecimento) {
            DemandaApp.atualizarAposEnriquecimento(_parsedRows);
        } else if (typeof DemandaApp !== 'undefined' && DemandaApp.loadProdutosErp) {
            DemandaApp.loadProdutosErp(true);
        }

        alert('Sucesso! ' + (total - batchErrors).toLocaleString('pt-BR') + ' produtos foram enriquecidos e salvos no Firestore.');
        fecharModal();
    }

    return {
        abrirModal,
        fecharModal,
        onFileDrop,
        onFileSelect,
        iniciarGravacao,
        _resetarEstadoModal
    };
})();

window.DemandaEnrichment = DemandaEnrichment;
