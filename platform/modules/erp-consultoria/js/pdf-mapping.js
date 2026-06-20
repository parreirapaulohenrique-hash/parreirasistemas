/**
 * PdfMapper — Motor de Mapeamento por Valor
 * Calibração: compara valores consolidados do PDF com coluna C do Excel
 * Vincula: PDF código → chave do MASTER_ACCOUNTS
 */
window.PdfMapper = {

    savedMapping: null, // { pdfCodigo: masterKey }

    // ─────────────────────────────────────────────────────────────
    // LEITURA DO EXCEL (via SheetJS)
    // ─────────────────────────────────────────────────────────────

    /**
     * Lê um arquivo .xlsx e retorna as linhas da primeira aba com:
     *   { rowNum, descricao, value }
     * onde descricao = coluna B e value = coluna C (valor calculado)
     */
    async readExcel(file) {
        return new Promise((resolve, reject) => {
            if (typeof XLSX === 'undefined') {
                reject(new Error('SheetJS não carregado. Recarregue a página.'));
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const wb   = XLSX.read(data, { type: 'array', cellDates: true });

                    // Pega a primeira aba de dados (ignora abas de resumo)
                    const sheetName = wb.SheetNames[0];
                    const ws = wb.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

                    const excelRows = [];
                    rows.forEach((row, idx) => {
                        const descricao = (row[1] || '').toString().trim(); // coluna B
                        const rawC      = row[2];                            // coluna C
                        const value     = typeof rawC === 'number' ? rawC : null;

                        if (descricao && value !== null && Math.abs(value) > 0.001) {
                            excelRows.push({
                                rowNum:    idx + 1,     // linha no Excel (1-indexed)
                                descricao: descricao,
                                value:     value,       // pode ser negativo (despesas com sinal)
                                absValue:  Math.abs(value)
                            });
                        }
                    });
                    resolve(excelRows);
                } catch (err) {
                    reject(new Error('Erro ao ler o arquivo Excel: ' + err.message));
                }
            };
            reader.onerror = () => reject(new Error('Erro ao ler o arquivo.'));
            reader.readAsArrayBuffer(file);
        });
    },

    // ─────────────────────────────────────────────────────────────
    // CALIBRAÇÃO por valor
    // ─────────────────────────────────────────────────────────────

    /**
     * Compara valores consolidados do PDF com valores da coluna C do Excel.
     * Quando os valores batem (dentro de tolerância de R$ 0,05), víncula.
     *
     * pdfAccounts: [{codigo, descricao, a_pagar, a_receber}]  — consolidado por CC
     * excelRows:   [{rowNum, descricao, value, absValue}]      — da coluna C do Excel
     *
     * Retorna: { matched, unmatched, conflicts }
     */
    calibrate(pdfAccounts, excelRows) {
        const matched   = [];
        const unmatched = [];
        const conflicts = [];
        const usedRows  = new Set();

        for (const pdf of pdfAccounts) {
            // Valor a usar: preferência para a_pagar (maior), depois a_receber
            const pdfVal = Math.max(pdf.a_pagar || 0, pdf.a_receber || 0);
            if (pdfVal < 0.01) continue;

            // Busca no Excel linhas com o mesmo valor absoluto (tolerância R$ 0,05)
            const candidates = excelRows.filter(row =>
                Math.abs(row.absValue - pdfVal) <= 0.05 &&
                !usedRows.has(row.rowNum)
            );

            if (candidates.length === 1) {
                usedRows.add(candidates[0].rowNum);
                // Tenta encontrar a entrada no MASTER_ACCOUNTS pela descrição do Excel
                const master = this._findMasterByDesc(candidates[0].descricao);
                matched.push({
                    pdf:       { codigo: pdf.codigo, descricao: pdf.descricao, valor: pdfVal },
                    excel:     candidates[0],
                    master:    master,
                    masterKey: master ? this._buildKey(master) : null,
                    autoKey:   master ? true : false
                });
            } else if (candidates.length > 1) {
                conflicts.push({ pdf, candidates });
            } else {
                unmatched.push(pdf);
            }
        }

        return { matched, unmatched, conflicts };
    },

    /**
     * Constrói o mapeamento definitivo {pdfCodigo → masterKey} após calibração.
     * manualResolutions: { pdfCodigo: masterKey } — para conflitos e não-mapeados
     */
    buildMapping(calibResult, manualResolutions = {}) {
        const mapping = {};
        for (const m of calibResult.matched) {
            if (m.masterKey) {
                mapping[m.pdf.codigo] = m.masterKey;
            }
        }
        Object.assign(mapping, manualResolutions);
        return mapping;
    },

    /**
     * Aplica o mapeamento salvo a novos accounts do PDF.
     * Retorna os accounts enriquecidos com { masterKey, mapped }
     */
    applyMapping(pdfAccounts, mapping) {
        const mp = mapping || this.savedMapping || {};
        return pdfAccounts.map(acc => ({
            ...acc,
            masterKey: mp[acc.codigo] || null,
            mapped:    !!mp[acc.codigo]
        }));
    },

    // ─────────────────────────────────────────────────────────────
    // PERSISTÊNCIA no Firestore
    // ─────────────────────────────────────────────────────────────

    async saveMapping(clientId, mapping) {
        try {
            const db     = window.db || firebase.firestore();
            const tenant = localStorage.getItem('app_tenant_id') || 'default';
            await db.collection('tenants').doc(tenant)
                    .collection('fc_pdf_mapping').doc(clientId)
                    .set({
                        mapping,
                        updatedAt: new Date().toISOString(),
                        version:   1
                    }, { merge: true });
            this.savedMapping = mapping;
            console.log('[PdfMapper] Mapeamento salvo:', Object.keys(mapping).length, 'vínculos');
            return true;
        } catch (err) {
            console.error('[PdfMapper] Erro ao salvar mapeamento:', err);
            return false;
        }
    },

    async loadMapping(clientId) {
        try {
            const db     = window.db || firebase.firestore();
            const tenant = localStorage.getItem('app_tenant_id') || 'default';
            const doc    = await db.collection('tenants').doc(tenant)
                                   .collection('fc_pdf_mapping').doc(clientId).get();
            this.savedMapping = doc.exists ? (doc.data().mapping || {}) : {};
            console.log('[PdfMapper] Mapeamento carregado:', Object.keys(this.savedMapping).length, 'vínculos');
            return this.savedMapping;
        } catch (err) {
            console.warn('[PdfMapper] Mapeamento não encontrado (primeiro uso):', err.message);
            this.savedMapping = {};
            return {};
        }
    },

    hasMappingFor(clientId) {
        return this.savedMapping && Object.keys(this.savedMapping).length > 0;
    },

    // ─────────────────────────────────────────────────────────────
    // HELPERS internos
    // ─────────────────────────────────────────────────────────────

    // Normaliza string para comparação (sem acentos, minúsculas, sem pontuação)
    _normalize(str) {
        return (str || '').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ').trim();
    },

    // Similaridade por palavras comuns (0 a 1)
    _similarity(a, b) {
        const wa = this._normalize(a).split(' ').filter(Boolean);
        const wb = this._normalize(b).split(' ').filter(Boolean);
        if (!wa.length || !wb.length) return 0;
        const common = wa.filter(w => wb.includes(w)).length;
        return common / Math.max(wa.length, wb.length);
    },

    // Busca a entrada mais similar no MASTER_ACCOUNTS pela descrição do Excel
    _findMasterByDesc(excelDesc) {
        if (!window.MASTER_ACCOUNTS) return null;
        let bestScore = 0, bestMatch = null, currentGroup = null;

        for (const m of window.MASTER_ACCOUNTS) {
            if (m.codigo === 'HEADER') { currentGroup = m.descricao; continue; }
            const score = this._similarity(excelDesc, m.descricao);
            if (score > bestScore && score >= 0.45) {
                bestScore = score;
                bestMatch = { ...m, group: currentGroup };
            }
        }
        return bestMatch;
    },

    // Monta a chave no formato: "Grupo::codigo-descricao" (padrão do FinancialEngine)
    _buildKey(masterEntry) {
        if (!masterEntry || !masterEntry.group) return null;
        return `${masterEntry.group}::${masterEntry.codigo}-${masterEntry.descricao}`;
    }
};
