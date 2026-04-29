/* ═══════════════════════════════════════════════════════════
   Financeiro Avançado — Parreira ERP (Fase 5)
   Fluxo de Caixa, Boletos, Conciliação, Inadimplência
   ═══════════════════════════════════════════════════════════ */
'use strict';

const FinanceiroAvancado = (() => {
    const KEYS = {
        titulos: 'erp_titulos',
        boletos: 'erp_boletos',
        vendas: 'erp_vendas'
    };

    const fmtMoney = v => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fmtDate = d => d ? new Date(d).toLocaleDateString('pt-BR') : '-';

    function ensureTitulos() {
        let tit = JSON.parse(localStorage.getItem(KEYS.titulos) || 'null');
        if (tit) return tit;

        // Gerar títulos mock a partir de vendas faturadas
        const vendas = JSON.parse(localStorage.getItem(KEYS.vendas) || '[]');
        tit = [];
        vendas.filter(v => ['faturado', 'venda', 'despachado'].includes(v.status)).forEach(v => {
            const parcelas = v.condicaoPagamento?.parcelas || 1;
            const valorParc = (v.totais?.totalNF || 0) / parcelas;
            for (let i = 0; i < parcelas; i++) {
                const venc = new Date(v.data || Date.now());
                venc.setDate(venc.getDate() + 30 * (i + 1));
                const hoje = new Date();
                const diasAtraso = venc < hoje ? Math.floor((hoje - venc) / 86400000) : 0;
                tit.push({
                    id: `TIT-${v.numero}-${i + 1}`,
                    pedido: v.numero,
                    clienteCod: v.cliente?.codigo || '',
                    clienteNome: v.cliente?.razaoSocial || v.cliente?.fantasia || '-',
                    parcela: `${i + 1}/${parcelas}`,
                    valor: valorParc,
                    vencimento: venc.toISOString().slice(0, 10),
                    diasAtraso,
                    status: diasAtraso > 0 ? 'vencido' : 'aberto',
                    pago: false
                });
            }
        });

        // Adicionar exemplos fixos se não houver vendas
        if (tit.length === 0) {
            const hoje = new Date();
            const exemplos = [
                { cli: 'ABC DISTRIBUIDORA LTDA', valor: 1500, dias: -15 },
                { cli: 'XYZ COMÉRCIO S/A', valor: 3200, dias: -5 },
                { cli: 'SUPERMERCADO BOM PREÇO', valor: 800, dias: 10 },
                { cli: 'FARMÁCIA POPULAR', valor: 2100, dias: 25 },
                { cli: 'LOJA CENTRAL', valor: 950, dias: 45 },
                { cli: 'PADARIA DO JOSE', valor: 420, dias: -30 }
            ];
            exemplos.forEach((ex, idx) => {
                const venc = new Date(hoje);
                venc.setDate(venc.getDate() + ex.dias);
                const diasAtraso = venc < hoje ? Math.floor((hoje - venc) / 86400000) : 0;
                tit.push({
                    id: `TIT-EX-${idx + 1}`,
                    pedido: `PV-${1000 + idx}`,
                    clienteCod: String(idx + 1),
                    clienteNome: ex.cli,
                    parcela: '1/1',
                    valor: ex.valor,
                    vencimento: venc.toISOString().slice(0, 10),
                    diasAtraso,
                    status: diasAtraso > 0 ? 'vencido' : 'aberto',
                    pago: false
                });
            });
        }
        localStorage.setItem(KEYS.titulos, JSON.stringify(tit));
        return tit;
    }

    // ═════════════════════════════════════════════════════
    // 1. FLUXO DE CAIXA
    // ═════════════════════════════════════════════════════
    function renderFluxoCaixa() {
        const el = document.getElementById('view-fluxoCaixa');
        if (!el) return;

        const titulos = ensureTitulos();
        const entradasNf = JSON.parse(localStorage.getItem('erp_entradas_nf') || '[]');
        const hoje = new Date();

        // Próximos 6 meses
        const meses = [];
        for (let i = 0; i < 6; i++) {
            const m = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
            const mesKey = m.toISOString().slice(0, 7); // YYYY-MM
            const label = m.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });

            const receber = titulos.filter(t => !t.pago && t.vencimento.startsWith(mesKey)).reduce((s, t) => s + t.valor, 0);
            const pagar = entradasNf.filter(e => (e.data || '').startsWith(mesKey)).reduce((s, e) => s + (e.valorNF || 0) * 0.8, 0)
                + titulos.filter(t => t.pago && t.vencimento.startsWith(mesKey)).reduce((s, t) => s + t.valor * 0.1, 0);
            const saldo = receber - pagar;

            meses.push({ label, mesKey, receber, pagar, saldo });
        }

        const totalReceber = titulos.filter(t => !t.pago).reduce((s, t) => s + t.valor, 0);
        const totalVencidos = titulos.filter(t => t.status === 'vencido' && !t.pago).reduce((s, t) => s + t.valor, 0);

        const maxBar = Math.max(...meses.map(m => Math.max(m.receber, m.pagar)), 1);

        el.innerHTML = `
        <div class="view-header-bar">
            <h2><span class="material-icons-round">waterfall_chart</span> Fluxo de Caixa Projetado</h2>
        </div>
        <div style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;">
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Total a Receber</div>
                <div style="font-size:1.5rem;font-weight:700;color:var(--success-color)">${fmtMoney(totalReceber)}</div>
            </div>
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Em Atraso</div>
                <div style="font-size:1.5rem;font-weight:700;color:var(--danger-color)">${fmtMoney(totalVencidos)}</div>
            </div>
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Títulos Ativos</div>
                <div style="font-size:1.8rem;font-weight:700;color:var(--primary-color)">${titulos.filter(t => !t.pago).length}</div>
            </div>
        </div>
        <div class="card" style="padding:1.5rem;">
            <h3 style="margin-bottom:1rem;font-size:0.9rem;">Projeção 6 Meses</h3>
            <div style="display:flex;gap:0.5rem;align-items:flex-end;height:200px;">
                ${meses.map(m => {
            const hReceber = Math.max(4, (m.receber / maxBar) * 160);
            const hPagar = Math.max(4, (m.pagar / maxBar) * 160);
            return `
                    <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:0.25rem;">
                        <div style="display:flex;gap:2px;align-items:flex-end;height:180px;">
                            <div style="width:18px;height:${hReceber}px;background:var(--success-color);border-radius:3px 3px 0 0;opacity:0.8;" title="Receber: ${fmtMoney(m.receber)}"></div>
                            <div style="width:18px;height:${hPagar}px;background:var(--danger-color);border-radius:3px 3px 0 0;opacity:0.8;" title="Pagar: ${fmtMoney(m.pagar)}"></div>
                        </div>
                        <div style="font-size:0.7rem;color:var(--text-secondary);text-transform:uppercase;font-weight:600;">${m.label}</div>
                        <div style="font-size:0.7rem;font-weight:700;color:${m.saldo >= 0 ? 'var(--success-color)' : 'var(--danger-color)'}">${fmtMoney(m.saldo)}</div>
                    </div>`;
        }).join('')}
            </div>
            <div style="display:flex;gap:1rem;margin-top:0.75rem;justify-content:center;">
                <div style="display:flex;align-items:center;gap:0.3rem;font-size:0.75rem;color:var(--text-secondary);">
                    <div style="width:10px;height:10px;background:var(--success-color);border-radius:2px;"></div> Receber
                </div>
                <div style="display:flex;align-items:center;gap:0.3rem;font-size:0.75rem;color:var(--text-secondary);">
                    <div style="width:10px;height:10px;background:var(--danger-color);border-radius:2px;"></div> Pagar
                </div>
            </div>
        </div>`;
    }

    // ═════════════════════════════════════════════════════
    // 2. BOLETOS
    // ═════════════════════════════════════════════════════
    function renderBoletos() {
        const el = document.getElementById('view-boletos');
        if (!el) return;

        const titulos = ensureTitulos();
        const boletos = JSON.parse(localStorage.getItem(KEYS.boletos) || '[]');

        el.innerHTML = `
        <div class="view-header-bar">
            <h2><span class="material-icons-round">confirmation_number</span> Boletos</h2>
            <button class="btn btn-primary btn-sm" onclick="FinanceiroAvancado.gerarBoletos()">
                <span class="material-icons-round" style="font-size:1rem">print</span> Gerar Boletos
            </button>
        </div>
        <div class="card" style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="border-bottom:1px solid var(--border-color);">
                        <th style="padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:left">Título</th>
                        <th style="padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:left">Cliente</th>
                        <th style="padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:center">Parcela</th>
                        <th style="padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:right">Valor</th>
                        <th style="padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:center">Vencimento</th>
                        <th style="padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:center">Boleto</th>
                        <th style="padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:right">Ação</th>
                    </tr>
                </thead>
                <tbody>
                    ${titulos.filter(t => !t.pago).length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-secondary)">Nenhum título pendente.</td></tr>' : ''}
                    ${titulos.filter(t => !t.pago).map(t => {
            const temBoleto = boletos.some(b => b.tituloId === t.id);
            return `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                            <td style="padding:0.6rem 0.5rem;font-weight:600;font-size:0.85rem;">${t.id}</td>
                            <td style="padding:0.6rem 0.5rem;">${t.clienteNome}</td>
                            <td style="text-align:center;padding:0.6rem 0.5rem;">${t.parcela}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;font-weight:600;">${fmtMoney(t.valor)}</td>
                            <td style="text-align:center;padding:0.6rem 0.5rem;">
                                <span style="color:${t.status === 'vencido' ? 'var(--danger-color)' : 'inherit'}">${fmtDate(t.vencimento)}</span>
                            </td>
                            <td style="text-align:center;padding:0.6rem 0.5rem;">
                                ${temBoleto ? '<span class="status-badge status-shipped">GERADO</span>' : '<span class="status-badge status-pending">PENDENTE</span>'}
                            </td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;">
                                <button class="btn btn-sm btn-secondary" style="padding:0.3rem 0.5rem;font-size:0.75rem;" onclick="FinanceiroAvancado.baixarTitulo('${t.id}')">Baixar</button>
                            </td>
                        </tr>`;
        }).join('')}
                </tbody>
            </table>
        </div>`;
    }

    function gerarBoletos() {
        const titulos = ensureTitulos();
        const boletos = JSON.parse(localStorage.getItem(KEYS.boletos) || '[]');
        let gerados = 0;
        titulos.filter(t => !t.pago).forEach(t => {
            if (!boletos.some(b => b.tituloId === t.id)) {
                boletos.push({
                    tituloId: t.id,
                    nossoNumero: String(Date.now()).slice(-10) + String(gerados),
                    banco: '341 - Itaú',
                    geradoEm: new Date().toISOString()
                });
                gerados++;
            }
        });
        localStorage.setItem(KEYS.boletos, JSON.stringify(boletos));
        alert(`✅ ${gerados} boleto(s) gerado(s)!\nTotal de boletos: ${boletos.length}`);
        renderBoletos();
    }

    function baixarTitulo(id) {
        const titulos = ensureTitulos();
        const t = titulos.find(x => x.id === id);
        if (!t) return;
        if (!confirm(`Baixar (liquidar) o título ${id}?\nCliente: ${t.clienteNome}\nValor: ${fmtMoney(t.valor)}`)) return;
        t.pago = true;
        t.status = 'pago';
        t.dataPagamento = new Date().toISOString();
        localStorage.setItem(KEYS.titulos, JSON.stringify(titulos));
        alert(`✅ Título ${id} liquidado!`);
        renderBoletos();
    }

    // ═════════════════════════════════════════════════════
    // 3. CONCILIAÇÃO BANCÁRIA
    // ═════════════════════════════════════════════════════
    function renderConciliacao() {
        const el = document.getElementById('view-conciliacao');
        if (!el) return;

        const titulos = ensureTitulos();
        const pagos = titulos.filter(t => t.pago);
        const pendentes = titulos.filter(t => !t.pago);

        el.innerHTML = `
        <div class="view-header-bar">
            <h2><span class="material-icons-round">sync_alt</span> Conciliação Bancária</h2>
        </div>
        <div style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;">
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Conciliados</div>
                <div style="font-size:1.8rem;font-weight:700;color:var(--success-color)">${pagos.length}</div>
            </div>
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Pendentes</div>
                <div style="font-size:1.8rem;font-weight:700;color:#f59e0b">${pendentes.length}</div>
            </div>
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Valor Pendente</div>
                <div style="font-size:1.5rem;font-weight:700;">${fmtMoney(pendentes.reduce((s, t) => s + t.valor, 0))}</div>
            </div>
        </div>
        <div class="card" style="padding:1.5rem;max-width:500px;">
            <h3 style="margin-bottom:1rem;font-size:0.95rem;">
                <span class="material-icons-round" style="font-size:1.1rem;vertical-align:middle;">upload_file</span> Importar Extrato OFX
            </h3>
            <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:1rem;">
                Em produção, aqui o sistema importaria o extrato bancário (OFX) e faria a conciliação automática com os títulos a receber.
            </p>
            <button class="btn btn-secondary" onclick="FinanceiroAvancado.simularConciliacao()">
                <span class="material-icons-round" style="font-size:1rem;">sync</span> Simular Conciliação
            </button>
        </div>`;
    }

    function simularConciliacao() {
        const titulos = ensureTitulos();
        let conciliados = 0;
        titulos.forEach(t => {
            if (!t.pago && t.status === 'aberto' && Math.random() < 0.3) {
                t.pago = true;
                t.status = 'pago';
                t.dataPagamento = new Date().toISOString();
                t.conciliadoAuto = true;
                conciliados++;
            }
        });
        localStorage.setItem(KEYS.titulos, JSON.stringify(titulos));
        alert(`✅ Conciliação simulada!\n${conciliados} título(s) conciliado(s) automaticamente.`);
        renderConciliacao();
    }

    // ═════════════════════════════════════════════════════
    // 4. INADIMPLÊNCIA
    // ═════════════════════════════════════════════════════
    function renderInadimplencia() {
        const el = document.getElementById('view-inadimplencia');
        if (!el) return;

        const titulos = ensureTitulos();
        const vencidos = titulos.filter(t => t.status === 'vencido' && !t.pago)
            .sort((a, b) => b.diasAtraso - a.diasAtraso);

        // Aging
        const faixas = [
            { label: '1-15 dias', min: 1, max: 15, valor: 0, count: 0 },
            { label: '16-30 dias', min: 16, max: 30, valor: 0, count: 0 },
            { label: '31-60 dias', min: 31, max: 60, valor: 0, count: 0 },
            { label: '61-90 dias', min: 61, max: 90, valor: 0, count: 0 },
            { label: '+90 dias', min: 91, max: 9999, valor: 0, count: 0 }
        ];
        vencidos.forEach(t => {
            const f = faixas.find(fx => t.diasAtraso >= fx.min && t.diasAtraso <= fx.max);
            if (f) { f.valor += t.valor; f.count++; }
        });

        const totalInadimplencia = vencidos.reduce((s, t) => s + t.valor, 0);
        const maxFaixa = Math.max(...faixas.map(f => f.valor), 1);

        el.innerHTML = `
        <div class="view-header-bar">
            <h2><span class="material-icons-round">warning</span> Inadimplência</h2>
        </div>
        <div style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap;">
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Títulos Vencidos</div>
                <div style="font-size:1.8rem;font-weight:700;color:var(--danger-color)">${vencidos.length}</div>
            </div>
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Valor Total</div>
                <div style="font-size:1.5rem;font-weight:700;color:var(--danger-color)">${fmtMoney(totalInadimplencia)}</div>
            </div>
            <div class="card" style="flex:1;min-width:180px;padding:1rem;text-align:center;">
                <div style="font-size:0.75rem;color:var(--text-secondary)">Clientes Inadimplentes</div>
                <div style="font-size:1.8rem;font-weight:700;">${new Set(vencidos.map(t => t.clienteNome)).size}</div>
            </div>
        </div>
        <div class="card" style="padding:1.5rem;margin-bottom:1rem;">
            <h3 style="margin-bottom:1rem;font-size:0.9rem;">Aging — Faixas de Atraso</h3>
            <div style="display:grid;gap:0.5rem;">
                ${faixas.map(f => `
                    <div style="display:flex;align-items:center;gap:0.75rem;">
                        <div style="width:80px;font-size:0.8rem;color:var(--text-secondary);text-align:right;flex-shrink:0;">${f.label}</div>
                        <div style="flex:1;height:24px;background:var(--surface-darker);border-radius:var(--radius-md);overflow:hidden;">
                            <div style="height:100%;width:${(f.valor / maxFaixa * 100).toFixed(1)}%;background:linear-gradient(90deg,var(--danger-color),#ef4444);border-radius:var(--radius-md);display:flex;align-items:center;padding:0 0.5rem;min-width:${f.valor > 0 ? '20px' : '0'};">
                                <span style="font-size:0.7rem;font-weight:600;color:#fff;white-space:nowrap;">${f.count > 0 ? f.count + ' títulos' : ''}</span>
                            </div>
                        </div>
                        <div style="width:100px;font-size:0.85rem;font-weight:600;text-align:right;">${fmtMoney(f.valor)}</div>
                    </div>
                `).join('')}
            </div>
        </div>
        <div class="card" style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="border-bottom:1px solid var(--border-color);">
                        <th style="padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:left">Título</th>
                        <th style="padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:left">Cliente</th>
                        <th style="padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:right">Valor</th>
                        <th style="padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:center">Vencimento</th>
                        <th style="padding:0.75rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);text-align:center">Dias Atraso</th>
                    </tr>
                </thead>
                <tbody>
                    ${vencidos.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-secondary)">Nenhum título vencido. ✅</td></tr>' : ''}
                    ${vencidos.map(t => `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.03);">
                            <td style="padding:0.6rem 0.5rem;font-weight:600;font-size:0.85rem;">${t.id}</td>
                            <td style="padding:0.6rem 0.5rem;">${t.clienteNome}</td>
                            <td style="text-align:right;padding:0.6rem 0.5rem;font-weight:600;">${fmtMoney(t.valor)}</td>
                            <td style="text-align:center;padding:0.6rem 0.5rem;color:var(--danger-color);">${fmtDate(t.vencimento)}</td>
                            <td style="text-align:center;padding:0.6rem 0.5rem;">
                                <span class="status-badge status-overdue">${t.diasAtraso}d</span>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
    }

    // ═════════════════════════════════════════════════════
    // VIEW HOOKS
    // ═════════════════════════════════════════════════════
    const VIEW_MAP = {
        fluxoCaixa: renderFluxoCaixa,
        boletos: renderBoletos,
        conciliacao: renderConciliacao,
        inadimplencia: renderInadimplencia
    };

    window._viewHooks = window._viewHooks || [];
    window._viewHooks.push(viewId => {
        if (VIEW_MAP[viewId]) VIEW_MAP[viewId]();
    });

    console.log('💰 Módulo Financeiro Avançado inicializado (4 telas)');

    return {
        renderFluxoCaixa,
        renderBoletos, gerarBoletos, baixarTitulo,
        renderConciliacao, simularConciliacao,
        renderInadimplencia
    };
})();
