// =============================================================================
// wms-etiquetas.js — Gerador de Etiquetas Logísticas (ZPL II / Impressão Térmica)
// Módulo WMS — Parreira Sistemas
// =============================================================================
// Gera comandos ZPL II nativos para impressoras térmicas Zebra/Elgin/Argox
// e visualização HTML para impressão direta via navegador.
// Padrão Físico Oficial: RUA | PRÉDIO | APTO (Invertido) + QR CODE + ID
// Suporte a rótulos customizáveis e campos adicionais por cliente.
// =============================================================================

window.WmsEtiquetas = (function () {
    'use strict';

    /**
     * Helper para extrair componentes do endereço e configurações personalizadas
     */
    function _extrairDadosEndereco(dados, tipo = 'PICKING') {
        let raw = (typeof dados === 'string') ? { endereco: dados, id: dados } : (dados || {});
        let id = raw.id || raw.endereco || raw.codigo || '';
        let rua = raw.rua != null ? String(raw.rua) : '';
        let predio = raw.predio != null ? String(raw.predio) : '';
        let apto = raw.apto != null ? String(raw.apto) : (raw.posicao != null ? String(raw.posicao) : '');

        // Se rua, predio ou apto não foram informados explicitamente, tentar extrair do ID
        if (!rua || !predio || !apto) {
            const parts = String(id).replace(/[^a-zA-Z0-9-]/g, '').split('-').filter(Boolean);
            if (parts.length >= 3) {
                if (!rua) rua = parts[0].replace(/^[A-Za-z]+/, '');
                if (!predio) predio = parts[1].replace(/^[A-Za-z]+/, '');
                if (!apto) apto = parts.slice(2).join('').replace(/^[A-Za-z]+/, '');
            } else if (parts.length === 2) {
                if (!rua) rua = parts[0];
                if (!predio) predio = parts[1];
            }
        }

        // Configuração de nomenclatura personalizada do tenant
        let cfg = { labels: { rua: 'RUA', predio: 'PRÉDIO', apto: 'APTO' }, camposCustomizados: [] };
        if (typeof window.getEnderecamentoConfig === 'function') {
            try { cfg = window.getEnderecamentoConfig(); } catch (_) {}
        } else {
            try {
                const suf = window.getTenantSuffix ? window.getTenantSuffix() : '';
                const rawCfg = localStorage.getItem('wms_enderecamento_config' + suf);
                if (rawCfg) cfg = JSON.parse(rawCfg);
            } catch (_) {}
        }

        const lblRua = (cfg.labels?.rua || 'RUA').toUpperCase();
        const lblPredio = (cfg.labels?.predio || 'PRÉDIO').toUpperCase();
        const lblApto = (cfg.labels?.apto || 'APTO').toUpperCase();

        let qrData = id || `${rua}-${predio}-${apto}`;
        let idNum = raw.numeroId || raw.codeNumber || id.replace(/[^\d]/g, '') || id;

        // Campos adicionais com naEtiqueta: true
        const camposEtiqueta = [];
        if (Array.isArray(cfg.camposCustomizados)) {
            cfg.camposCustomizados.forEach(c => {
                if (c.naEtiqueta && raw[c.key]) {
                    camposEtiqueta.push({ label: c.label || c.key, valor: raw[c.key] });
                }
            });
        }

        return {
            id: id || `${rua}-${predio}-${apto}`,
            rua: rua || '1',
            predio: predio || '1',
            apto: apto || '101',
            tipo: raw.tipo || tipo || 'PICKING',
            lblRua,
            lblPredio,
            lblApto,
            qrData,
            idNum,
            camposEtiqueta
        };
    }

    /**
     * Gera comando ZPL II para etiqueta de endereço física (Padrão: RUA | PRÉDIO | APTO + QR)
     * Dimensão padrão: 100mm x 38mm (800 x 304 dots em 203 DPI)
     */
    function gerarZplEndereco(dados, tipo = 'PICKING') {
        const d = _extrairDadosEndereco(dados, tipo);
        return `^XA
^PW800
^LL320
^PON
^LH20,15
^FO25,20^A0N,22,22^FD${d.lblRua}^FS
^FO25,48^A0N,76,76^FD${d.rua}^FS
^FO170,20^A0N,22,22^FD${d.lblPredio}^FS
^FO170,48^A0N,76,76^FD${d.predio}^FS
^FO320,12^GB170,140,140^FS
^FO385,20^FR^A0N,20,20^FD${d.lblApto}^FS
^FO335,52^FR^A0N,76,76^FD${d.apto}^FS
^FO530,12^BQN,2,5^FDQA,${d.qrData}^FS
^FO550,140^A0N,22,22^FD${d.idNum}^FS
^XZ`;
    }

    /**
     * Gera comando ZPL II para etiqueta Master de Palete / Caixa com GS1-128
     * Dimensão padrão: 100mm x 150mm (800 x 1200 dots em 203 DPI)
     */
    function gerarZplPaleteGs1({ sku, descricao, lote, validade, qtd, gtin, pesoKg }) {
        const sNorm = (sku || '').trim().toUpperCase();
        const dNorm = (descricao || sNorm).slice(0, 35);
        const lNorm = (lote || 'L' + new Date().getFullYear()).trim();
        const vNorm = (validade || '').replace(/[^\d]/g, '').slice(0, 6) || '271231';
        const gNorm = (gtin || '0789' + String(Math.floor(Math.random() * 10000000000)).padStart(10, '0')).slice(0, 14);
        const qNum  = Number(qtd) || 1;

        return `^XA
^PW800
^LL1000
^PON
^LH30,30
^FO20,20^A0N,36,36^FDETIQUETA LOGISTICA MASTER^FS
^FO20,65^GB740,3,3^FS
^FO20,85^A0N,26,26^FDSKU / CODIGO:^FS
^FO20,115^A0N,55,55^FD${sNorm}^FS
^FO20,180^A0N,30,30^FD${dNorm}^FS
^FO20,225^GB740,1,1^FS

^FO20,245^A0N,24,24^FDLOTE:^FS
^FO20,275^A0N,38,38^FD${lNorm}^FS

^FO380,245^A0N,24,24^FDVALIDADE:^FS
^FO380,275^A0N,38,38^FD${vNorm}^FS

^FO20,335^A0N,24,24^FDQUANTIDADE:^FS
^FO20,365^A0N,50,50^FD${qNum} UN^FS

${pesoKg ? `^FO380,335^A0N,24,24^FDPESO LIQ:^FS
^FO380,365^A0N,45,45^FD${Number(pesoKg).toFixed(2)} KG^FS` : ''}

^FO20,440^GB740,2,2^FS
^FO40,470^BY3,3,130^BCN,130,Y,N,N^FD(01)${gNorm}(10)${lNorm}^FS
^FO40,650^A0N,24,24^FD(01) ${gNorm}  (10) ${lNorm}^FS
^XZ`;
    }

    /**
     * Abre janela de impressão HTML de alta fidelidade
     */
    function imprimirEtiquetaHtml(dados, tipo = 'ENDERECO') {
        const w = window.open('', '_blank', 'width=600,height=500');
        if (!w) return alert('Por favor, permita popups para imprimir etiquetas.');

        let bodyHtml = '';

        if (tipo === 'ENDERECO') {
            const d = _extrairDadosEndereco(dados, tipo);
            const extrasHtml = (d.camposEtiqueta && d.camposEtiqueta.length > 0)
                ? `<div style="width:100%;font-size:7.5pt;color:#333;margin-top:2px;display:flex;gap:8px;justify-content:center;border-top:1px dashed #ccc;padding-top:2px;">
                    ${d.camposEtiqueta.map(c => `<span><strong>${c.label}:</strong> ${c.valor}</span>`).join(' • ')}
                   </div>`
                : '';

            bodyHtml = `
                <div class="etiqueta-wrapper" style="
                    width: 105mm;
                    height: 38mm;
                    padding: 3mm 4mm;
                    box-sizing: border-box;
                    border: 1.5px solid #000;
                    border-radius: 8px;
                    background: #ffffff;
                    font-family: 'Inter', Arial, sans-serif;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    page-break-inside: avoid;
                    margin: 0 auto;
                ">
                    <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                        <!-- Bloco 1: RUA -->
                        <div style="flex: 1; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                            <span style="font-size: 11pt; font-weight: 700; color: #111; letter-spacing: 0.5px; text-transform: uppercase;">${d.lblRua}</span>
                            <span style="font-size: 38pt; font-weight: 900; line-height: 1.05; color: #000; margin-top: 2px;">${d.rua}</span>
                        </div>

                        <!-- Bloco 2: PRÉDIO -->
                        <div style="flex: 1; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                            <span style="font-size: 11pt; font-weight: 700; color: #111; letter-spacing: 0.5px; text-transform: uppercase;">${d.lblPredio}</span>
                            <span style="font-size: 38pt; font-weight: 900; line-height: 1.05; color: #000; margin-top: 2px;">${d.predio}</span>
                        </div>

                        <!-- Bloco 3: APTO (Bloco Preto Invertido) -->
                        <div style="
                            background: #000;
                            color: #fff;
                            border-radius: 4px;
                            padding: 2mm 3.5mm;
                            min-width: 27mm;
                            display: flex;
                            flex-direction: column;
                            justify-content: space-between;
                            align-items: center;
                            box-sizing: border-box;
                            height: 29mm;
                        ">
                            <div style="width: 100%; text-align: right; font-size: 9pt; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; color: #fff; line-height: 1;">
                                ${d.lblApto}
                            </div>
                            <div style="font-size: 35pt; font-weight: 900; line-height: 1; color: #fff; text-align: center; width: 100%; margin-top: auto; margin-bottom: auto;">
                                ${d.apto}
                            </div>
                        </div>

                        <!-- Bloco 4: QR CODE + ID -->
                        <div style="margin-left: 3mm; display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 24mm;">
                            <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(d.qrData)}" 
                                 style="width: 21mm; height: 21mm; display: block;" alt="QR Code" />
                            <span style="font-family: 'Courier New', monospace; font-size: 10pt; font-weight: 700; color: #222; margin-top: 1.5mm; letter-spacing: 0.5px;">
                                ${d.idNum}
                            </span>
                        </div>
                    </div>
                    ${extrasHtml}
                </div>
            `;
        } else {
            // Master SKU / Caixa
            bodyHtml = `
                <div style="width:100mm; height:100mm; padding:5mm; box-sizing:border-box; border:2px solid #000; font-family:Arial, sans-serif; display:flex; flex-direction:column; justify-content:space-between;">
                    <div style="border-bottom:2px solid #000; padding-bottom:2mm;">
                        <div style="font-size:10pt; font-weight:bold; color:#444;">ETIQUETA LOGÍSTICA MASTER</div>
                        <div style="font-size:20pt; font-weight:900; margin-top:1mm;">${dados.sku}</div>
                        <div style="font-size:11pt; color:#222; margin-top:1mm;">${dados.descricao || dados.desc || ''}</div>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:3mm; padding:2mm 0; border-bottom:1.5px solid #000;">
                        <div>
                            <div style="font-size:8pt; color:#555;">LOTE:</div>
                            <div style="font-size:12pt; font-weight:bold;">${dados.lote || 'L2026-001'}</div>
                        </div>
                        <div>
                            <div style="font-size:8pt; color:#555;">QUANTIDADE:</div>
                            <div style="font-size:16pt; font-weight:900;">${dados.qtd || 1} UN</div>
                        </div>
                    </div>
                    <div style="text-align:center; padding:3mm 0;">
                        <div style="font-size:11pt; font-family:monospace; font-weight:bold;">(01)${dados.gtin || '07891234567890'} (10)${dados.lote || 'L2026-001'}</div>
                        <div style="display:inline-block; border:1px solid #000; padding:6px 20px; font-size:11pt; font-family:monospace; background:#eee; margin-top:2mm;">
                            *${dados.sku}*
                        </div>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:8pt; border-top:1px solid #000; padding-top:1mm;">
                        <span>GS1-128 STANDARD</span>
                        <span>${new Date().toLocaleDateString('pt-BR')}</span>
                    </div>
                </div>
            `;
        }

        w.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Impressão de Etiqueta Logística</title>
                <style>
                    @page { size: auto; margin: 5mm; }
                    body { margin: 0; padding: 10px; display: flex; align-items: center; justify-content: center; background: #fff; }
                </style>
            </head>
            <body>
                ${bodyHtml}
                <script>
                    window.onload = function() {
                        setTimeout(() => window.print(), 300);
                    };
                </script>
            </body>
            </html>
        `);
        w.document.close();
    }

    /**
     * Copia comando ZPL para a área de transferência
     */
    function copiarZpl(zpl) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(zpl).then(() => {
                alert('Código ZPL II copiado para a área de transferência! Cole no Zebra Designer ou envie direto para a impressora.');
            });
        } else {
            prompt('Copie o código ZPL abaixo:', zpl);
        }
    }

    return {
        _extrairDadosEndereco,
        gerarZplEndereco,
        gerarZplPaleteGs1,
        imprimirEtiquetaHtml,
        copiarZpl
    };
})();
