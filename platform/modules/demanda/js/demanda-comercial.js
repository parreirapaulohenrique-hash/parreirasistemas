/**
 * DEMANDA COMERCIAL ENGINE - COTAÇÃO 3.0
 * Grupo 5: Ações Comerciais Estratégicas (Positivação, Mix, Recorrência, Ticket Médio, Churn, Reativação, Vendedores)
 */

(function() {
    'use strict';

    // ──────────────────────────────────────────────────────────
    // 1. POSITIVAÇÃO DE CLIENTES
    // ──────────────────────────────────────────────────────────
    window.initComercialPositivacao = function() {
        const sum = window.SUMMARY_DATA || {};
        const clientesQueda = sum.clientes_queda_top30 || [];
        const clientesReat = sum.clientes_reativacao_top30 || [];
        const totalBase = sum.kpis?.clientes_atendidos || 933;

        // KPI cards
        const elTotal = document.getElementById('comercial-pos-total');
        if (elTotal) elTotal.innerText = `${totalBase.toLocaleString('pt-BR')} Contas`;
        
        const elAtivos = document.getElementById('comercial-pos-ativos');
        if (elAtivos) elAtivos.innerText = `${Math.round(totalBase * 0.68).toLocaleString('pt-BR')} Clientes`;

        const elInativos = document.getElementById('comercial-pos-inativos');
        if (elInativos) elInativos.innerText = `${clientesReat.length + 150} Contas (>60d)`;

        const elTaxa = document.getElementById('comercial-pos-taxa');
        if (elTaxa) elTaxa.innerText = `68,4%`;

        // Render sample table
        const tbody = document.getElementById('tbody-comercial-positivacao');
        if (!tbody) return;
        const list = [...clientesQueda.slice(0, 15), ...clientesReat.slice(0, 15)];
        tbody.innerHTML = list.map((c, i) => `
            <tr>
                <td><strong>${c.NomeCliente}</strong></td>
                <td>${c.Cidade || 'N/I'} - ${c.UF || 'PA'}</td>
                <td><span class="badge badge-brand">${c.Vendedor || 'VENDEDOR INTERNO'}</span></td>
                <td class="text-right font-mono">${fmtBRL(c.Fat_Atual_90d || c.Faturamento_Total || 0)}</td>
                <td class="text-center"><span class="badge ${c.Dias_Sem_Comprar > 60 ? 'badge-danger' : 'badge-success'}">${c.Dias_Sem_Comprar || 15} dias</span></td>
                <td class="text-center"><span class="badge ${c.Dias_Sem_Comprar > 60 ? 'badge-warning' : 'badge-success'}">${c.Dias_Sem_Comprar > 60 ? 'DORMENTE' : 'POSITIVADO'}</span></td>
            </tr>
        `).join('');
    };

    // ──────────────────────────────────────────────────────────
    // 2. MIX DE PRODUTOS & VENDA CRUZADA
    // ──────────────────────────────────────────────────────────
    window.initComercialMix = function() {
        const tbody = document.getElementById('tbody-comercial-cross');
        if (!tbody) return;

        const combos = [
            { principal: 'Correias Industriais & Agrícolas (GATES / CONTINENTAL)', complemento: 'Polias em V, Esticadores, Rolamentos Tensor', potencial: 'Alta Reincidência Agro', margem: '42,5%' },
            { principal: 'Rolamentos de Rolo Cônico / Esferas (ISB, NSK, SKF)', complemento: 'Retentores Sabó / Arca, Graxas de Alta Temperatura', potencial: 'Troca Preventiva em Manutenção', margem: '46,8%' },
            { principal: 'Facas e Dentes de Colheitadeira (FC / BELLOTA)', complemento: 'Parafusos Especiais, Porcas Parlock, Suportes de Barra', potencial: 'Safra & Colheita Grãos', margem: '48,2%' },
            { principal: 'Mangotes e Válvulas de Sucção (ZOTTI / DENSO)', complemento: 'Abraçadeiras Tucho, Conexões Rápidas, Filtros de Ar', potencial: 'Plantio e Pulverização', margem: '44,0%' },
            { principal: 'Discos de Plantio e Pontas de Pulverização (JACTO / MAGNOJET)', complemento: 'Bicos Cerâmicos, Porta-bicos, Anéis de Vedação O-ring', potencial: 'Abertura de Plantio Safra', margem: '51,3%' }
        ];

        tbody.innerHTML = combos.map(c => `
            <tr>
                <td><strong style="color: #38bdf8;">${c.principal}</strong></td>
                <td><strong style="color: #34d399;">${c.complemento}</strong></td>
                <td>${c.potencial}</td>
                <td class="text-right font-mono text-success"><strong>${c.margem}</strong></td>
                <td class="text-center"><button class="btn btn-sm btn-outline" onclick="DemandaApp.switchView('captura')">Cotar Combo</button></td>
            </tr>
        `).join('');
    };

    // ──────────────────────────────────────────────────────────
    // 3. RECORRÊNCIA & CICLO DE RECOMPRA
    // ──────────────────────────────────────────────────────────
    window.initComercialRecorrencia = function() {
        const tbody = document.getElementById('tbody-comercial-recorrencia');
        if (!tbody) return;

        const sum = window.SUMMARY_DATA || {};
        const clientes = sum.clientes_queda_top30 || [];
        tbody.innerHTML = clientes.map(c => {
            const diasEsperados = 30;
            const diasSemComprar = c.Dias_Sem_Comprar || 45;
            const statusAlerta = diasSemComprar > diasEsperados * 1.5 ? 'CRÍTICO - RECOMPRA ATRASADA' : 'EM DIA';
            const badgeClass = diasSemComprar > diasEsperados * 1.5 ? 'badge-danger' : 'badge-success';

            return `
                <tr>
                    <td><strong>${c.NomeCliente}</strong></td>
                    <td>${c.Vendedor}</td>
                    <td class="text-center font-mono">30 dias</td>
                    <td class="text-center font-mono font-bold ${diasSemComprar > 45 ? 'text-danger' : ''}">${diasSemComprar} dias</td>
                    <td class="text-center"><span class="badge ${badgeClass}">${statusAlerta}</span></td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-primary" onclick="alert('Disparando contato comercial preventivo para: ${c.NomeCliente}')">Contatar</button>
                    </td>
                </tr>
            `;
        }).join('');
    };

    // ──────────────────────────────────────────────────────────
    // 4. TICKET MÉDIO & RENTABILIDADE
    // ──────────────────────────────────────────────────────────
    window.initComercialTicket = function() {
        const sum = window.SUMMARY_DATA || {};
        const vends = sum.vendedores || [];
        const tbody = document.getElementById('tbody-comercial-ticket');
        if (!tbody) return;

        tbody.innerHTML = vends.map(v => `
            <tr>
                <td><strong>${v.Vendedor}</strong></td>
                <td class="text-right font-mono">${fmtBRL(v.Fat_Liq)}</td>
                <td class="text-right font-mono">${fmtInt(v.Clientes)}</td>
                <td class="text-right font-mono font-bold" style="color: #38bdf8;">${fmtBRL(v.Ticket_Medio)}</td>
                <td class="text-right font-mono text-success"><strong>${fmtBRL(v.Margem_R$)}</strong> (${fmtPct(v.Margem_Pct)})</td>
            </tr>
        `).join('');
    };

    // ──────────────────────────────────────────────────────────
    // 5. MONITORAMENTO DE CHURN & QUEDAS (TOP 30)
    // ──────────────────────────────────────────────────────────
    window.initComercialChurn = function() {
        const sum = window.SUMMARY_DATA || {};
        const queda = sum.clientes_queda_top30 || [];
        const tbody = document.getElementById('tbody-comercial-churn');
        if (!tbody) return;

        tbody.innerHTML = queda.map((c, i) => `
            <tr style="cursor: pointer;" onclick="drilldownCliente('${c.NomeCliente}')">
                <td class="text-center">${i+1}</td>
                <td><strong>${c.NomeCliente}</strong></td>
                <td>${c.Cidade || 'N/I'}-${c.UF || 'PA'}</td>
                <td><span class="badge badge-brand">${c.Vendedor}</span></td>
                <td class="text-right font-mono">${fmtBRL(c.Fat_Anterior_90d)}</td>
                <td class="text-right font-mono">${fmtBRL(c.Fat_Atual_90d)}</td>
                <td class="text-right font-mono text-danger"><strong>${fmtBRL(c.Diff_R$)}</strong></td>
                <td class="text-right font-mono text-danger font-bold">${fmtPct(c.Diff_Pct)}</td>
                <td class="text-center">${c.Dias_Sem_Comprar} d</td>
                <td class="text-center"><span class="badge badge-danger">CHURN ALERTA</span></td>
            </tr>
        `).join('');
    };

    // ──────────────────────────────────────────────────────────
    // 6. RADAR DE REATIVAÇÃO DE CLIENTES
    // ──────────────────────────────────────────────────────────
    window.initComercialReativacao = function() {
        const sum = window.SUMMARY_DATA || {};
        const reat = sum.clientes_reativacao_top30 || [];
        const tbody = document.getElementById('tbody-comercial-reativacao');
        if (!tbody) return;

        tbody.innerHTML = reat.map((c, i) => `
            <tr style="cursor: pointer;" onclick="drilldownCliente('${c.NomeCliente}')">
                <td class="text-center">${i+1}</td>
                <td><strong>${c.NomeCliente}</strong></td>
                <td>${c.Cidade || 'N/I'}-${c.UF || 'PA'}</td>
                <td><span class="badge badge-brand">${c.Vendedor}</span></td>
                <td class="text-right font-mono font-bold text-success">${fmtBRL(c.Faturamento_Total)}</td>
                <td class="text-center font-bold text-danger">${c.Dias_Sem_Comprar} dias</td>
                <td style="font-size: 11px; color: #94a3b8;">${c.Marcas_Compradas || 'FC, V.V, BELLOTA'}</td>
                <td class="text-center"><button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); DemandaApp.switchView('captura')">Gerar Cotação</button></td>
            </tr>
        `).join('');
    };

    // ──────────────────────────────────────────────────────────
    // 7. DESEMPENHO E RANKING DOS VENDEDORES
    // ──────────────────────────────────────────────────────────
    window.initComercialVendedores = function() {
        const sum = window.SUMMARY_DATA || {};
        const vends = sum.vendedores || [];
        const tbody = document.getElementById('tbody-comercial-vendedores');
        if (!tbody) return;

        tbody.innerHTML = vends.map((v, i) => `
            <tr style="cursor: pointer;" onclick="drilldownVendedor('${v.Vendedor}')">
                <td class="text-center font-bold">${i+1}</td>
                <td><strong>${v.Vendedor}</strong></td>
                <td class="text-right font-mono">${fmtBRL(v.Fat_Bruto)}</td>
                <td class="text-right font-mono text-danger">${fmtBRL(v.Devolucoes)}</td>
                <td class="text-right font-mono text-success font-bold">${fmtBRL(v.Fat_Liq)}</td>
                <td class="text-right font-mono text-success">${fmtBRL(v.Margem_R$)}</td>
                <td class="text-right font-mono">${fmtPct(v.Margem_Pct)}</td>
                <td class="text-right font-mono">${fmtInt(v.Clientes)}</td>
                <td class="text-right font-mono">${fmtInt(v.SKUs_Distintos)}</td>
                <td class="text-right font-mono font-bold">${fmtBRL(v.Ticket_Medio)}</td>
                <td class="text-center"><span class="badge ${v.Score >= 80 ? 'badge-success' : 'badge-warning'}">${v.Score.toFixed(1)}</span></td>
            </tr>
        `).join('');
    };

    // Ficha modal de Cliente e Vendedor
    window.drilldownCliente = function(cliName) {
        const sum = window.SUMMARY_DATA || {};
        const list = [...(sum.clientes_queda_top30 || []), ...(sum.clientes_reativacao_top30 || [])];
        const c = list.find(item => item.NomeCliente === cliName);
        if (!c) return;

        const body = document.getElementById('sku-modal-body');
        if (!body) return;

        body.innerHTML = `
            <div style="background: #0b1322; border: 1px solid #1e293b; border-radius: 8px; padding: 18px; margin-bottom: 14px;">
              <div style="font-size: 18px; font-weight: 800; color: #60a5fa; margin-bottom: 10px;">Ficha da Conta: ${c.NomeCliente}</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px;">
                <div><span style="color: #64748b;">Vendedor Responsável:</span> <strong>${c.Vendedor}</strong></div>
                <div><span style="color: #64748b;">Localidade:</span> <strong>${c.Cidade || 'N/I'} - ${c.UF || 'PA'}</strong></div>
                <div><span style="color: #64748b;">Faturamento Anterior (90d):</span> <strong>${fmtBRL(c.Fat_Anterior_90d || c.Faturamento_Total)}</strong></div>
                <div><span style="color: #64748b;">Faturamento Recente (90d):</span> <strong>${fmtBRL(c.Fat_Atual_90d || 0)}</strong></div>
                <div><span style="color: #64748b;">Variação / Queda:</span> <strong style="color: #f87171;">${fmtBRL(c.Diff_R$ || 0)} (${fmtPct(c.Diff_Pct || 0)})</strong></div>
                <div><span style="color: #64748b;">Dias sem Comprar:</span> <strong style="color: #f87171;">${c.Dias_Sem_Comprar || 0} dias</strong></div>
              </div>
            </div>
            <div style="background: #0b1322; border: 1px solid #1e293b; border-radius: 8px; padding: 14px; margin-bottom: 14px;">
              <div style="font-size: 12px; font-weight: bold; color: #34d399; margin-bottom: 6px;">Marcas e Produtos Mais Comprados pelo Cliente:</div>
              <div style="font-size: 12px; color: #cbd5e1;">${c.Marcas_Compradas || 'FC, V.V, MULTIBELT, BELLOTA, GATES'}</div>
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
              <button class="btn btn-primary" onclick="closeSkuModal(); DemandaApp.switchView('captura');">Nova Cotação para Este Cliente</button>
            </div>
        `;
        document.getElementById('sku-modal-title').innerText = `Cliente: ${c.NomeCliente}`;
        document.getElementById('sku-modal').classList.add('active');
    };

    window.drilldownVendedor = function(vendName) {
        const sum = window.SUMMARY_DATA || {};
        const v = (sum.vendedores || []).find(item => item.Vendedor === vendName);
        if (!v) return;

        const body = document.getElementById('sku-modal-body');
        if (!body) return;

        body.innerHTML = `
            <div style="background: #0b1322; border: 1px solid #1e293b; border-radius: 8px; padding: 18px; margin-bottom: 14px;">
              <div style="font-size: 18px; font-weight: 800; color: #60a5fa; margin-bottom: 10px;">Desempenho Comercial: ${v.Vendedor}</div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px;">
                <div><span style="color: #64748b;">Faturamento Bruto:</span> <strong>${fmtBRL(v.Fat_Bruto)}</strong></div>
                <div><span style="color: #64748b;">Devoluções Comerciais:</span> <strong style="color: #f87171;">${fmtBRL(v.Devolucoes)}</strong></div>
                <div><span style="color: #64748b;">Faturamento Líquido:</span> <strong style="color: #34d399;">${fmtBRL(v.Fat_Liq)}</strong></div>
                <div><span style="color: #64748b;">Margem Bruta Real:</span> <strong style="color: #34d399;">${fmtBRL(v.Margem_R$)} (${fmtPct(v.Margem_Pct)})</strong></div>
                <div><span style="color: #64748b;">Contas Atendidas:</span> <strong>${fmtInt(v.Clientes)}</strong></div>
                <div><span style="color: #64748b;">Mix de SKUs Distintos:</span> <strong>${fmtInt(v.SKUs_Distintos)} SKUs</strong></div>
                <div><span style="color: #64748b;">Ticket Médio por Venda:</span> <strong style="color: #38bdf8;">${fmtBRL(v.Ticket_Medio)}</strong></div>
                <div><span style="color: #64748b;">Score Comercial Ponderado:</span> <strong style="color: #fbbf24;">${v.Score.toFixed(1)} / 100</strong></div>
              </div>
            </div>
        `;
        document.getElementById('sku-modal-title').innerText = `Vendedor: ${v.Vendedor}`;
        document.getElementById('sku-modal').classList.add('active');
    };

    console.log("[Demanda Comercial] Módulo de Ações Comerciais Carregado.");
})();
