// =============================================================================
// wms-etiquetas.js — Gerador de Etiquetas Logísticas (ZPL II / Impressão Térmica)
// Módulo WMS — Parreira Sistemas
// =============================================================================
// Gera comandos ZPL II nativos para impressoras térmicas Zebra/Elgin/Argox
// e visualização HTML para impressão direta via navegador.
// =============================================================================

window.WmsEtiquetas = (function () {
    'use strict';

    /**
     * Gera comando ZPL II para etiqueta de endereço de vão (Rack / Prateleira)
     * Dimensão padrão: 100mm x 50mm (800 x 400 dots em 203 DPI)
     */
    function gerarZplEndereco(endereco, tipo = 'PICKING') {
        const endNorm = (endereco || '').trim().toUpperCase();
        return `^XA
^PW800
^LL400
^PON
^LH30,30
^FO20,20^A0N,32,32^FDWMS PARREIRALOG - LOCALIZACAO^FS
^FO20,65^GB740,2,2^FS
^FO40,90^BY3,3,110^BCN,110,Y,N,N^FD${endNorm}^FS
^FO40,240^A0N,65,65^FD${endNorm}^FS
^FO40,315^A0N,28,28^FDTIPO: ${tipo.toUpperCase()}  |  SISTEMA LOGISTICO^FS
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

        // GS1-128 barcode format: >8(01)GTIN>8(10)LOTE>8(17)VALIDADE
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
        const w = window.open('', '_blank', 'width=550,height=600');
        if (!w) return alert('Por favor, permita popups para imprimir etiquetas.');

        let bodyHtml = '';

        if (tipo === 'ENDERECO') {
            const end = dados.endereco || dados.id || 'A-01-01-01';
            bodyHtml = `
                <div style="width:100mm; height:50mm; padding:5mm; box-sizing:border-box; border:2px solid #000; font-family:Arial, sans-serif; display:flex; flex-direction:column; justify-content:space-between;">
                    <div style="display:flex; justify-content:space-between; border-bottom:1.5px solid #000; padding-bottom:2mm;">
                        <strong style="font-size:12pt; letter-spacing:0.5px;">WMS PARREIRALOG</strong>
                        <span style="font-size:10pt; font-weight:bold;">${dados.tipo || 'PICKING'}</span>
                    </div>
                    <div style="text-align:center; padding:3mm 0;">
                        <div style="font-family:'Courier New', monospace; font-size:26pt; font-weight:900; letter-spacing:2px; margin-bottom:2mm;">
                            ${end}
                        </div>
                        <div style="display:inline-block; border:1px solid #000; padding:3px 15px; font-size:10pt; font-family:monospace; background:#eee;">
                            *${end}*
                        </div>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:8pt; border-top:1px solid #000; padding-top:1.5mm;">
                        <span>IDENTIFICADOR DE VÃO</span>
                        <span>IMPRESSO: ${new Date().toLocaleDateString('pt-BR')}</span>
                    </div>
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
                    @page { size: auto; margin: 0; }
                    body { margin: 10px; display: flex; align-items: center; justify-content: center; }
                </style>
            </head>
            <body>
                ${bodyHtml}
                <script>
                    window.onload = function() {
                        window.print();
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
        gerarZplEndereco,
        gerarZplPaleteGs1,
        imprimirEtiquetaHtml,
        copiarZpl
    };
})();
