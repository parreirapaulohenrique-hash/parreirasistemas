/**
 * PdfMapper — Motor de Mapeamento por Valor (Multi-Mês)
 * Calibração: PDF Tela 834 (jan-mai) × Excel (uma aba por mês)
 * Vínculo: se valor bater em QUALQUER mês → código PDF → chave MASTER_ACCOUNTS
 */
window.PdfMapper = {

    savedMapping: null,  // { pdfCodigo: masterKey }
    isLocked:     false, // true quando mapeamento foi travado pelo usuário

    // Mapa de meses (aba do Excel → monthKey)
    EXCEL_TABS: {
        'JANEIRO':   '2026-01',
        'FEVEREIRO': '2026-02',
        'MARÇO':     '2026-03',
        'MARCO':     '2026-03',  // sem acento
        'ABRIL':     '2026-04',
        'MAIO':      '2026-05',
        'JUNHO':     '2026-06',
        'JULHO':     '2026-07',
        'AGOSTO':    '2026-08',
        'SETEMBRO':  '2026-09',
        'OUTUBRO':   '2026-10',
        'NOVEMBRO':  '2026-11',
        'DEZEMBRO':  '2026-12',
    },

    // ─────────────────────────────────────────────────────────────
    // LEITURA DO EXCEL (SheetJS) — todas as abas de meses
    // ─────────────────────────────────────────────────────────────

    /**
     * Lê o Excel e retorna um mapa por mês:
     * { '2026-01': [{rowNum, descricao, value, absValue}], '2026-02': [...], ... }
     */
    async readExcelMultiMonth(file) {
        return new Promise((resolve, reject) => {
            if (typeof XLSX === 'undefined') {
                reject(new Error('SheetJS não carregado. Recarregue a página.'));
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const wb   = XLSX.read(data, { type: 'array' });
                    const byMonth = {};

                    for (const sheetName of wb.SheetNames) {
                        // Normaliza nome da aba (remove acentos, maiúsculas)
                        const nameNorm = sheetName.toUpperCase()
                            .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

                        const monthKey = this.EXCEL_TABS[sheetName.toUpperCase()] ||
                                         this.EXCEL_TABS[nameNorm];
                        if (!monthKey) continue; // pula abas de resumo

                        const ws   = wb.Sheets[sheetName];
                        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
                        const monthRows = [];

                        rows.forEach((row, idx) => {
                            const descricao = (row[1] || '').toString().trim(); // coluna B
                            const rawC      = row[2];                            // coluna C
                            const value     = typeof rawC === 'number' ? rawC : null;

                            if (descricao && value !== null && Math.abs(value) > 0.001) {
                                monthRows.push({
                                    rowNum:    idx + 1,
                                    descricao: descricao,
                                    value:     value,
                                    absValue:  Math.abs(value)
                                });
                            }
                        });

                        if (monthRows.length > 0) byMonth[monthKey] = monthRows;
                    }

                    if (Object.keys(byMonth).length === 0) {
                        reject(new Error(
                            'Nenhuma aba de mês reconhecida no Excel.\n' +
                            'As abas devem se chamar JANEIRO, FEVEREIRO, etc.'
                        ));
                        return;
                    }

                    resolve(byMonth);
                } catch (err) {
                    reject(new Error('Erro ao ler Excel: ' + err.message));
                }
            };
            reader.onerror = () => reject(new Error('Erro ao ler o arquivo.'));
            reader.readAsArrayBuffer(file);
        });
    },

    // Backward compat: single sheet
    async readExcel(file) {
        const byMonth = await this.readExcelMultiMonth(file);
        const firstMonth = Object.values(byMonth)[0] || [];
        return firstMonth;
    },

    // ─────────────────────────────────────────────────────────────
    // CALIBRAÇÃO multi-mês
    // ─────────────────────────────────────────────────────────────

    /**
     * Calibra usando todos os meses disponíveis.
     * Para cada conta do PDF: itera os meses — primeiro que bater → vínculo.
     *
     * pdfContas:   [{codigo, descricao, meses: {'2026-01': val, ...}, total}]
     * excelByMonth: {'2026-01': [{rowNum, descricao, value, absValue}], ...}
     */
    calibrateMultiMonth(pdfContas, excelByMonth) {
        const matched   = [];
        const unmatched = [];
        const conflicts = [];

        // Rastreia linhas do Excel já usadas por mês
        const usedByMonth = {};
        for (const mk of Object.keys(excelByMonth)) usedByMonth[mk] = new Set();

        for (const pdf of pdfContas) {
            let bestMatch = null;

            // Itera os meses em que a conta tem valor
            const sortedMonths = Object.entries(pdf.meses || {}).sort(([a],[b]) => a.localeCompare(b));

            for (const [monthKey, pdfVal] of sortedMonths) {
                if (!pdfVal || Math.abs(pdfVal) < 0.01) continue;
                const excelRows = excelByMonth[monthKey];
                if (!excelRows) continue;

                const absPdfVal = Math.abs(pdfVal);
                const candidates = excelRows.filter(row =>
                    Math.abs(row.absValue - absPdfVal) <= 0.10 &&
                    !usedByMonth[monthKey].has(row.rowNum)
                );

                if (candidates.length === 1) {
                    // Vínculo único neste mês
                    usedByMonth[monthKey].add(candidates[0].rowNum);
                    const master = this._findMasterByDesc(candidates[0].descricao);
                    bestMatch = {
                        pdf:       { codigo: pdf.codigo, descricao: pdf.descricao },
                        excel:     candidates[0],
                        monthKey,
                        master,
                        masterKey: master ? this._buildKey(master) : null
                    };
                    break; // primeiro mês que bateu → encerra busca para esta conta
                } else if (candidates.length > 1 && !bestMatch) {
                    conflicts.push({ pdf, monthKey, candidates });
                }
            }

            if (bestMatch) {
                matched.push(bestMatch);
            } else if (!conflicts.find(c => c.pdf.codigo === pdf.codigo)) {
                unmatched.push(pdf);
            }
        }

        return { matched, unmatched, conflicts };
    },

    // Backward compat: single month calibrate
    calibrate(pdfAccounts, excelRows) {
        // Monta excelByMonth simulado com um único mês
        const fakeByMonth = { '__single__': excelRows };
        const fakePdf = pdfAccounts.map(a => ({
            ...a,
            meses: { '__single__': Math.max(a.a_pagar || 0, a.a_receber || 0) }
        }));
        return this.calibrateMultiMonth(fakePdf, fakeByMonth);
    },

    // ─────────────────────────────────────────────────────────────
    // MAPEAMENTO
    // ─────────────────────────────────────────────────────────────

    buildMapping(calibResult, manualResolutions = {}) {
        const mapping = {};
        for (const m of calibResult.matched) {
            if (m.masterKey) mapping[m.pdf.codigo] = m.masterKey;
        }
        Object.assign(mapping, manualResolutions);
        return mapping;
    },

    applyMapping(pdfContas, mapping) {
        const mp = mapping || this.savedMapping || {};
        return pdfContas.map(acc => ({
            ...acc,
            masterKey: mp[acc.codigo] || null,
            mapped:    !!mp[acc.codigo]
        }));
    },

    // ─────────────────────────────────────────────────────────────
    // PERSISTÊNCIA no Firestore
    // ─────────────────────────────────────────────────────────────

    async saveMapping(clientId, mapping, lock = false) {
        try {
            const db     = window.db || firebase.firestore();
            const tenant = localStorage.getItem('app_tenant_id') || 'default';
            await db.collection('tenants').doc(tenant)
                    .collection('fc_pdf_mapping').doc(clientId)
                    .set({
                        mapping,
                        locked:    lock,
                        updatedAt: new Date().toISOString(),
                        version:   2
                    }, { merge: true });
            this.savedMapping = mapping;
            this.isLocked     = lock;
            console.log('[PdfMapper] Mapeamento salvo:', Object.keys(mapping).length, 'vínculos | locked:', lock);
            return true;
        } catch (err) {
            console.error('[PdfMapper] Erro ao salvar:', err);
            return false;
        }
    },

    async loadMapping(clientId) {
        try {
            const db     = window.db || firebase.firestore();
            const tenant = localStorage.getItem('app_tenant_id') || 'default';
            const doc    = await db.collection('tenants').doc(tenant)
                                   .collection('fc_pdf_mapping').doc(clientId).get();
            if (doc.exists) {
                this.savedMapping = doc.data().mapping || {};
                this.isLocked     = doc.data().locked  || false;
            } else {
                this.savedMapping = {};
                this.isLocked     = false;
            }
            console.log('[PdfMapper] Carregado:', Object.keys(this.savedMapping).length, 'vínculos | locked:', this.isLocked);
            return this.savedMapping;
        } catch (err) {
            console.warn('[PdfMapper] Não encontrado (primeiro uso):', err.message);
            this.savedMapping = {};
            this.isLocked     = false;
            return {};
        }
    },

    hasMappingFor() {
        return this.savedMapping && Object.keys(this.savedMapping).length > 0;
    },

    // ─────────────────────────────────────────────────────────────
    // HELPERS internos
    // ─────────────────────────────────────────────────────────────

    _normalize(str) {
        return (str || '').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ').trim();
    },

    _similarity(a, b) {
        const wa = this._normalize(a).split(' ').filter(Boolean);
        const wb = this._normalize(b).split(' ').filter(Boolean);
        if (!wa.length || !wb.length) return 0;
        const common = wa.filter(w => wb.includes(w)).length;
        return common / Math.max(wa.length, wb.length);
    },

    _findMasterByDesc(excelDesc) {
        if (!window.MASTER_ACCOUNTS) return null;
        let best = 0, match = null, group = null;
        for (const m of window.MASTER_ACCOUNTS) {
            if (m.codigo === 'HEADER') { group = m.descricao; continue; }
            const score = this._similarity(excelDesc, m.descricao);
            if (score > best && score >= 0.45) { best = score; match = { ...m, group }; }
        }
        return match;
    },

    _buildKey(m) {
        if (!m?.group) return null;
        return `${m.group}::${m.codigo}-${m.descricao}`;
    }
};
