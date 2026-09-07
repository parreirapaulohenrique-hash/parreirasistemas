/* demanda-app.js — Controlador Principal | Inteligência de Demanda v1.1.0
 * Parreira Sistemas
 * Fase 2: salvarDemanda, filterDemandas, addItemGrade, clienteDropdown, toast
 */
"use strict";

const DemandaApp = (function() {

    // ── Mapeamento views → nav-item IDs ──────────────────────
    var _VIEWS = {
        captura:       "nav-captura",
        lista:         "nav-lista",
        pesquisa:      "nav-pesquisa",
        compras:       "nav-compras",
        dashboard:     "nav-dashboard",
        orcamento:     "nav-orcamento",
        concorrente:   "nav-concorrente",
        base:          "nav-base",
        integracaoErp: "nav-integracaoErp"
    };

    // ── Estado global ─────────────────────────────────────────
    var _itens             = [];      // Itens da demanda em andamento
    var _clienteAtual      = null;    // { id, nome, cnpj } | null
    var _sessao            = null;    // Cache ParreiraAuth.getSessao()
    var _demandaAtual      = null;    // { id, data, itens } — demanda aberta no modal de detalhe
    var _erpInitialized    = false;
    var _searchTimeout     = null;
    var _filterAtual       = "todas";
    var _clientesCache     = [];      // Lista de clientes para o dropdown
    var _importItensTemp   = [];      // Itens parsed aguardando conferência
    var _excelItensTemp    = [];      // Itens do Excel antes de confirmar

    // ════════════════════════════════════════════════════════
    // NAVEGAÇÃO DE VIEWS
    // ════════════════════════════════════════════════════════

    function switchView(v) {
        if (!_VIEWS[v]) { console.warn("[DemandaApp] View desconhecida:", v); return; }
        document.querySelectorAll("[id^='view-']").forEach(function(el) { el.style.display = "none"; });
        document.querySelectorAll(".nav-item").forEach(function(el) { el.classList.remove("active"); });
        var ve = document.getElementById("view-" + v); if (ve) ve.style.display = "";
        var ne = document.getElementById(_VIEWS[v]); if (ne) ne.classList.add("active");
        if (v === "integracaoErp") _initErpUI();
        if (v === "lista")         loadDemandasLista(_filterAtual);
        if (v === "dashboard")     loadDashboard();
        if (v === "compras")       loadFilaCompras();
        if (v === "orcamento")     loadOrcamento();
        if (v === "concorrente")   loadConcorrente();
    }

    // ════════════════════════════════════════════════════════
    // ERP UI (Integração)
    // ════════════════════════════════════════════════════════

    function _initErpUI() {
        if (_erpInitialized) return;
        if (typeof ErpUI === "undefined") {
            var c = document.getElementById("erp-config-container");
            if (c) c.innerHTML = "<div style='padding:2rem;text-align:center;color:var(--text-secondary)'><p>ErpUI nao carregado. Verifique os scripts.</p></div>";
            return;
        }
        ErpUI.init("demanda");
        _erpInitialized = true;
        console.log("[DemandaApp] ErpUI inicializado.");
    }

    // ════════════════════════════════════════════════════════
    // PESQUISA UNIVERSAL (coluna esquerda)
    // ════════════════════════════════════════════════════════

    function onSearchInput(value) {
        clearTimeout(_searchTimeout);
        var b = document.getElementById("searchClear");
        if (b) b.style.display = value.length > 0 ? "flex" : "none";
        var r = document.getElementById("searchResults");
        if (!r) return;
        if (value.length < 3) {
            // Restaura placeholder
            r.innerHTML = "";
            var ph = document.getElementById("searchPlaceholder");
            if (ph) r.appendChild(ph);
            return;
        }
        _searchTimeout = setTimeout(function() {
            // TODO Fase 3: integrar DemandaSearch com ERP
            r.innerHTML = "<div style='padding:2rem;text-align:center;color:var(--text-secondary)'>" +
                "<span class='material-icons-round' style='font-size:2rem;opacity:.4'>manage_search</span>" +
                "<p style='margin-top:.5rem;font-size:.85rem'>Pesquisa no ERP em implementação.<br>Use a entrada rápida (→) para adicionar itens manualmente.</p>" +
                "</div>";
        }, 350);
    }

    function clearSearch() {
        var i = document.getElementById("searchInput"); if (i) { i.value = ""; i.focus(); }
        var b = document.getElementById("searchClear"); if (b) b.style.display = "none";
        var r = document.getElementById("searchResults");
        if (r) {
            r.innerHTML = "";
            var ph = document.getElementById("searchPlaceholder");
            if (ph) r.appendChild(ph);
        }
    }

    function selectSearchResult(id) {
        // TODO Fase 3: adicionar item do ERP direto
        console.log("[DemandaApp] selectSearchResult:", id);
    }

    // ════════════════════════════════════════════════════════
    // GRADE DE ENTRADA RÁPIDA (painel direito)
    // ════════════════════════════════════════════════════════

    function addItemGrade() {
        var refEl  = document.getElementById("gradeRef");
        var qtdeEl = document.getElementById("gradeQtde");
        if (!refEl || !refEl.value.trim()) { if (refEl) refEl.focus(); return; }

        var ref  = refEl.value.trim();
        var qtde = Math.max(1, parseInt((qtdeEl && qtdeEl.value) || "1", 10) || 1);

        _itens.push({ refOriginal: ref, descOriginal: "", qtdeSolicitada: qtde });
        renderItens();

        refEl.value = "";
        if (qtdeEl) qtdeEl.value = "1";
        refEl.focus();
        _toast("Item adicionado", "success");
    }

    function onGradeKeydown(ev) {
        if (ev.key === "Enter") { ev.preventDefault(); addItemGrade(); }
    }

    function removeItem(idx) {
        if (idx < 0 || idx >= _itens.length) return;
        _itens.splice(idx, 1);
        renderItens();
    }

    function renderItens() {
        var tbody  = document.getElementById("itensTbody");
        var trEmpty = document.getElementById("trEmptyState");
        if (!tbody) return;

        if (_itens.length === 0) {
            tbody.innerHTML = "";
            if (trEmpty) tbody.appendChild(trEmpty);
            var ct = document.getElementById("demandaCodigoTopbar"); if (ct) ct.textContent = "";
            return;
        }

        var html = _itens.map(function(item, i) {
            return "<tr>" +
                "<td style='color:var(--text-secondary);font-size:.8rem'>" + (i + 1) + "</td>" +
                "<td style='font-weight:600;font-size:.83rem'>" + _esc(item.refOriginal) + "</td>" +
                "<td style='font-size:.8rem;color:var(--text-secondary)'>" + (_esc(item.descOriginal) || "—") + "</td>" +
                "<td style='text-align:center'>" + item.qtdeSolicitada + "</td>" +
                "<td><span style='font-size:.72rem;padding:.15rem .5rem;border-radius:10px;" +
                    "background:rgba(99,102,241,.15);color:#6366f1'>Recebida</span></td>" +
                "<td><button onclick='DemandaApp.removeItem(" + i + ")' title='Remover' " +
                    "style='background:none;border:none;color:var(--accent-danger);cursor:pointer;padding:.2rem'>" +
                    "<span class='material-icons-round' style='font-size:1rem'>close</span></button></td>" +
                "</tr>";
        }).join("");
        tbody.innerHTML = html;

        var ct = document.getElementById("demandaCodigoTopbar");
        if (ct) ct.textContent = "— " + _itens.length + (_itens.length === 1 ? " item" : " itens");
    }

    function limparDemanda() {
        if (_itens.length > 0 && !confirm("Limpar todos os itens da demanda?")) return;
        _itens = [];
        _clienteAtual = null;
        var cl = document.getElementById("clienteLabel"); if (cl) cl.textContent = "Selecionar cliente";
        var si = document.getElementById("selectOrigem"); if (si) si.value = "whatsapp";
        renderItens();
    }

    // ════════════════════════════════════════════════════════
    // SELEÇÃO DE CLIENTE
    // ════════════════════════════════════════════════════════

    function toggleClienteDropdown() {
        var dd  = document.getElementById("clienteDropdown");
        if (!dd) return;
        var open = dd.style.display === "block";
        dd.style.display = open ? "none" : "block";
        if (!open) {
            var inp = document.getElementById("clienteSearchInput");
            if (inp) { inp.value = ""; inp.focus(); }
            _renderClienteDropdownList("");
        }
    }

    function searchCliente(q) { _renderClienteDropdownList(q); }

    function _renderClienteDropdownList(q) {
        var list = document.getElementById("clienteDropdownList");
        if (!list) return;

        var todos = _getClientesLocalCache();
        var filtrados = q.length > 1
            ? todos.filter(function(c) {
                var hay = ((c.nome || c.razaoSocial || "") + " " + (c.cnpj || "") + " " + (c.codigo || "")).toLowerCase();
                return hay.indexOf(q.toLowerCase()) >= 0;
              })
            : todos.slice(0, 25);

        _clientesCache = filtrados;

        if (filtrados.length === 0) {
            list.innerHTML = "<div style='padding:.75rem 1rem;color:var(--text-secondary);font-size:.82rem'>" +
                (todos.length === 0 ? "Nenhum cliente em cache. Sincronize o ERP." : "Nenhum resultado para \"" + _esc(q) + "\".") +
                "</div>";
            return;
        }

        list.innerHTML = filtrados.map(function(c, i) {
            var nome = c.nome || c.razaoSocial || "Cliente " + i;
            var detalhe = c.cnpj || c.cpf || c.codigo || "";
            return "<div onclick='DemandaApp.selectClienteIdx(" + i + ")'" +
                   " style='padding:.5rem 1rem;cursor:pointer;font-size:.83rem;border-bottom:1px solid var(--border);" +
                   "display:flex;flex-direction:column;gap:.1rem;transition:background .15s'" +
                   " onmouseover='this.style.background=\"rgba(59,130,246,.08)\"'" +
                   " onmouseout='this.style.background=\"\"'>" +
                   "<span style='font-weight:600;color:var(--text-primary)'>" + _esc(nome) + "</span>" +
                   (detalhe ? "<span style='color:var(--text-secondary);font-size:.75rem'>" + _esc(detalhe) + "</span>" : "") +
                   "</div>";
        }).join("");
    }

    function selectClienteIdx(i) {
        if (i < 0 || i >= _clientesCache.length) return;
        var c = _clientesCache[i];
        _clienteAtual = { id: c.id || c.codigo || null, nome: c.nome || c.razaoSocial || "", cnpj: c.cnpj || c.cpf || "" };
        var lbl = document.getElementById("clienteLabel"); if (lbl) lbl.textContent = _clienteAtual.nome;
        var dd  = document.getElementById("clienteDropdown"); if (dd) dd.style.display = "none";
    }

    function _getClientesLocalCache() {
        try {
            var key = "centralpecas_clients";
            var raw = localStorage.getItem(key);
            if (raw) return JSON.parse(raw);
        } catch(e) {}
        return [];
    }

    // ════════════════════════════════════════════════════════
    // IMPORTAÇÃO
    // ════════════════════════════════════════════════════════

    function _openModal(id) {
        var el = document.getElementById(id); if (el) el.style.display = "flex";
    }

    function openImportModal(type) {
        if (type === "texto") {
            var ta = document.getElementById("textareaImport"); if (ta) ta.value = "";
            _openModal("modalTexto");
        } else if (type === "excel") {
            var prev = document.getElementById("excelPreviewArea"); if (prev) prev.style.display = "none";
            var btn  = document.getElementById("btnConfirmExcel");  if (btn) btn.style.display = "none";
            var up   = document.getElementById("excelUploadArea");  if (up)  up.style.display = "";
            _openModal("modalExcel");
        } else if (type === "pdf") {
            _abrirImportPDF();
        } else if (type === "foto") {
            _abrirImportFoto();
        }
    }

    // ════════════════════════════════════════════════════════
    // IMPORT PDF (iframe nativo do browser)
    // ════════════════════════════════════════════════════════

    var _pdfBlobUrl = null;

    function _abrirImportPDF() {
        var inp = document.createElement("input");
        inp.type = "file";
        inp.accept = ".pdf,application/pdf";
        inp.style.display = "none";
        document.body.appendChild(inp);
        inp.onchange = function() {
            var file = inp.files[0];
            document.body.removeChild(inp);
            if (!file) return;
            // Revoga URL anterior se existir
            if (_pdfBlobUrl) { try { URL.revokeObjectURL(_pdfBlobUrl); } catch(_) {} }
            _pdfBlobUrl = URL.createObjectURL(file);
            // Mostra modal com botão para abrir em nova aba
            var modal = document.getElementById("modalImportPDF");
            var fname = document.getElementById("pdfFileName");
            var ta    = document.getElementById("pdfTextoColar");
            var btn   = document.getElementById("btnAbrirPdfNovaAba");
            if (!modal) { _toast("Modal PDF nao encontrado.", "error"); return; }
            if (fname) fname.textContent = file.name;
            if (ta)    ta.value = "";
            // Atualiza o href do botão âncora diretamente (não abre automaticamente)
            if (btn) { btn.href = _pdfBlobUrl; }
            modal.style.display = "flex";
        };
        inp.click();
    }

    function _fecharImportPDF() {
        var modal = document.getElementById("modalImportPDF");
        if (modal) modal.style.display = "none";
    }

    function _copiarDoPDF() {
        var ta = document.getElementById("pdfTextoColar");
        if (!ta || !ta.value.trim()) { _toast("Cole o texto do PDF antes de processar.", "warning"); return; }
        var texto = ta.value.trim();
        _fecharImportPDF();
        var taImport = document.getElementById("textareaImport");
        if (taImport) taImport.value = texto;
        _openModal("modalTexto");
        _toast("Texto do PDF carregado! Clique em Processar.", "info");
    }


    // ════════════════════════════════════════════════════════
    // IMPORT FOTO / PRINT (camera ou galeria + transcricao)
    // ════════════════════════════════════════════════════════

    function _abrirImportFoto() {
        var inp = document.createElement("input");
        inp.type = "file";
        inp.accept = "image/*";
        inp.style.display = "none";
        document.body.appendChild(inp);
        inp.onchange = function() {
            var file = inp.files[0];
            document.body.removeChild(inp);
            if (!file) return;
            var modal  = document.getElementById("modalImportFoto");
            var imgEl  = document.getElementById("fotoPreview");
            var ta     = document.getElementById("fotoTranscricao");
            var status = document.getElementById("fotoOcrStatus");
            var msg    = document.getElementById("fotoOcrMsg");
            var pct    = document.getElementById("fotoOcrPct");
            if (!modal || !imgEl) { _toast("Modal Foto nao encontrado.", "error"); return; }
            if (ta) { ta.value = ""; ta.placeholder = "Aguardando leitura OCR..."; }
            modal.style.display = "flex";
            if (status) { status.style.display = "flex"; }
            if (msg) msg.textContent = "Lendo imagem via OCR...";
            if (pct) pct.textContent = "";

            // Comprime imagem via Canvas (max 1200px) antes de enviar
            var reader = new FileReader();
            reader.onerror = function() { _toast("Erro ao ler arquivo.", "error"); };
            reader.onload = function(ev) {
                var dataUrl = ev.target.result;
                imgEl.src = dataUrl;
                imgEl.onload = function() {
                    var maxDim = 1200;
                    var w = imgEl.naturalWidth || 800, h = imgEl.naturalHeight || 600;
                    var ratio = Math.min(maxDim / w, maxDim / h, 1);
                    var cv = document.createElement("canvas");
                    cv.width  = Math.round(w * ratio);
                    cv.height = Math.round(h * ratio);
                    cv.getContext("2d").drawImage(imgEl, 0, 0, cv.width, cv.height);
                    var base64 = cv.toDataURL("image/jpeg", 0.85);

                    // Envia para proxy local /api/ocr (resolve CORS)
                    fetch("/api/ocr", {
                        method:  "POST",
                        headers: { "Content-Type": "application/json" },
                        body:    JSON.stringify({ base64: base64 })
                    }).then(function(r) { return r.json(); }).then(function(data) {
                        if (status) status.style.display = "none";
                        if (data.error) throw new Error(data.error);
                        var texto = (data.text || "").trim();
                        if (ta) { ta.value = texto; ta.placeholder = ""; }
                        _toast(texto.length > 5 ? "\u2713 Texto extraido! Revise e clique em Processar." : "Pouco texto reconhecido. Revise.", texto.length > 5 ? "success" : "warning");
                    }).catch(function(err) {
                        console.error("[OCR]", err);
                        if (status) status.style.display = "none";
                        if (ta) { ta.value = ""; ta.placeholder = "Falha no OCR. Digite o texto manualmente."; }
                        _toast("Falha OCR: " + (err.message || "verifique a conexao"), "error");
                    });
                };
                imgEl.onerror = function() { _toast("Imagem invalida.", "error"); };
            };
            reader.readAsDataURL(file);
        };
        inp.click();
    }
    function _fecharImportFoto() {
        var modal  = document.getElementById("modalImportFoto");
        var img    = document.getElementById("fotoPreview");
        var status = document.getElementById("fotoOcrStatus");
        if (img)    { try { URL.revokeObjectURL(img.src); } catch(_) {} img.src = ""; }
        if (status) status.style.display = "none";
        if (modal)  modal.style.display = "none";
    }

    function _processarFotoTranscricao() {
        var ta = document.getElementById("fotoTranscricao");
        if (!ta || !ta.value.trim()) { _toast("Aguarde o OCR ou edite o texto antes de processar.", "warning"); return; }
        var texto = ta.value.trim();
        _fecharImportFoto();
        var taImport = document.getElementById("textareaImport");
        if (taImport) taImport.value = texto;
        _openModal("modalTexto");
        _toast("Texto carregado! Revise e clique em Processar.", "info");
    }


    function closeModal(id) { var el = document.getElementById(id); if (el) el.style.display = "none"; }
    function addItemFromDetails() { closeModal("modalItemDetalhes"); }

    // ════════════════════════════════════════════════════════
    // IMPORTAÇÃO TEXTO / WHATSAPP
    // ════════════════════════════════════════════════════════

    function processImportTexto() {
        var ta = document.getElementById("textareaImport");
        if (!ta || !ta.value.trim()) { _toast("Cole um texto antes de processar.", "error"); return; }
        if (typeof DemandaImport === "undefined") { _toast("DemandaImport não disponível.", "error"); return; }
        var parsed    = DemandaImport.parseText(ta.value);
        var validados = DemandaImport.validateItens(parsed);
        if (validados.length === 0) { _toast("Nenhum item encontrado no texto.", "error"); return; }
        closeModal("modalTexto");
        _showConferencia(validados);
    }

    // ════════════════════════════════════════════════════════
    // IMPORTAÇÃO EXCEL / CSV
    // ════════════════════════════════════════════════════════

    function onExcelDrop(ev) {
        ev.preventDefault();
        var area = document.getElementById("excelUploadArea"); if (area) area.style.borderColor = "var(--border)";
        var file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
        if (file) onExcelFileSelected(file);
    }

    function onExcelFileSelected(file) {
        if (!file) return;
        if (typeof DemandaImport === "undefined" || typeof XLSX === "undefined") {
            _toast("SheetJS não carregado. Importe via texto por enquanto.", "error"); return;
        }
        var area = document.getElementById("excelUploadArea"); if (area) area.style.display = "none";
        var prev = document.getElementById("excelPreviewArea");
        if (prev) {
            prev.style.display = "";
            prev.innerHTML = "<div style='text-align:center;padding:1.5rem;color:var(--text-secondary)'>" +
                "<span class='material-icons-round' style='animation:spin 1s linear infinite;font-size:2rem'>sync</span>" +
                "<p style='margin-top:.5rem'>Lendo arquivo...</p></div>";
        }
        DemandaImport.parseExcel(file).then(function(result) {
            _excelItensTemp = result.itens;
            var validados = DemandaImport.validateItens(result.itens);
            var ok  = validados.filter(function(i) { return !i._erros || i._erros.length === 0; }).length;
            var err = validados.length - ok;
            if (prev) prev.innerHTML =
                "<div style='padding:.75rem 1rem;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);border-radius:8px;display:flex;gap:.75rem;align-items:center'>" +
                "<span class='material-icons-round' style='color:var(--accent-success)'>check_circle</span>" +
                "<div><strong>" + validados.length + " itens detectados</strong>" +
                (err > 0 ? " <span style='color:var(--accent-danger)'>(" + err + " com alerta)</span>" : "") +
                "<div style='font-size:.78rem;color:var(--text-secondary);margin-top:.15rem'>" + _esc(file.name) + "</div></div></div>";
            var btn = document.getElementById("btnConfirmExcel"); if (btn) btn.style.display = "";
        }).catch(function(err) {
            if (prev) prev.innerHTML = "<div style='color:var(--accent-danger);padding:1rem'>Erro: " + _esc(err.message) + "</div>";
            var area2 = document.getElementById("excelUploadArea"); if (area2) area2.style.display = "";
        });
    }

    function confirmExcelImport() {
        if (_excelItensTemp.length === 0) { _toast("Nenhum item para importar.", "error"); return; }
        closeModal("modalExcel");
        _showConferencia(DemandaImport.validateItens(_excelItensTemp));
    }

    // ════════════════════════════════════════════════════════
    // MODAL DE CONFERÊNCIA — revisão antes de adicionar
    // ════════════════════════════════════════════════════════

    function _showConferencia(itens) {
        _importItensTemp = itens;
        var tbody  = document.getElementById("conferenciaTbody");
        var stats  = document.getElementById("conferenciaStats");
        var chkAll = document.getElementById("chkAllConf");
        if (!tbody) return;

        var ok  = itens.filter(function(i) { return !i._erros || i._erros.length === 0; }).length;
        var err = itens.length - ok;
        if (stats) stats.innerHTML =
            "<span style='color:var(--accent-success)'><strong>" + ok + "</strong> ok</span>" +
            (err > 0 ? " &nbsp;·&nbsp; <span style='color:var(--accent-warning)'><strong>" + err + "</strong> com alerta</span>" : "") +
            " &nbsp;·&nbsp; " + itens.length + " total";
        if (chkAll) chkAll.checked = true;

        tbody.innerHTML = itens.map(function(item, i) {
            var hasErr = item._erros && item._erros.length > 0;
            var incert = item.incerteza;
            var rowStyle = hasErr ? "opacity:.75" : "";
            var statusHtml = hasErr
                ? "<span style='color:var(--accent-danger);font-size:.72rem' title='" + _esc((item._erros || []).join(", ")) + "'>&#9888; Alerta</span>"
                : incert
                    ? "<span style='color:var(--accent-warning);font-size:.72rem'>? Incerto</span>"
                    : "<span style='color:var(--accent-success);font-size:.72rem'>&#10003; Ok</span>";
            return "<tr style='" + rowStyle + "'>" +
                "<td><input type='checkbox' class='conf-chk' data-idx='" + i + "' " + (!hasErr ? "checked" : "") + "></td>" +
                "<td style='color:var(--text-secondary);font-size:.78rem'>" + (i + 1) + "</td>" +
                "<td><input type='text' value='" + _esc(item.refOriginal) + "' " +
                    "style='background:transparent;border:1px solid var(--border);border-radius:4px;padding:.2rem .5rem;color:var(--text-primary);width:100%;font-size:.82rem' " +
                    "onchange=\"DemandaApp.updateConferenciaItem(" + i + ",'ref',this.value)\"></td>" +
                "<td><input type='text' value='" + _esc(item.descOriginal) + "' " +
                    "style='background:transparent;border:1px solid var(--border);border-radius:4px;padding:.2rem .5rem;color:var(--text-primary);width:100%;font-size:.82rem' " +
                    "onchange=\"DemandaApp.updateConferenciaItem(" + i + ",'desc',this.value)\"></td>" +
                "<td style='text-align:center'><input type='number' value='" + (item.qtdeSolicitada || 1) + "' min='1' " +
                    "style='background:transparent;border:1px solid var(--border);border-radius:4px;padding:.2rem .4rem;color:var(--text-primary);width:56px;text-align:center;font-size:.82rem' " +
                    "onchange=\"DemandaApp.updateConferenciaItem(" + i + ",'qtde',+this.value)\"></td>" +
                "<td style='font-size:.78rem;color:var(--text-secondary)'>" + _esc(item.obs || "") + "</td>" +
                "<td>" + statusHtml + "</td></tr>";
        }).join("");

        _openModal("modalConferencia");
    }

    function updateConferenciaItem(idx, field, value) {
        if (!_importItensTemp[idx]) return;
        if (field === "ref")  _importItensTemp[idx].refOriginal    = value;
        if (field === "desc") _importItensTemp[idx].descOriginal   = value;
        if (field === "qtde") _importItensTemp[idx].qtdeSolicitada = Math.max(1, value || 1);
    }

    function selectAllConferencia() {
        document.querySelectorAll(".conf-chk").forEach(function(c) { c.checked = true; });
        var chkAll = document.getElementById("chkAllConf"); if (chkAll) chkAll.checked = true;
    }

    function toggleAllConferencia(checked) {
        document.querySelectorAll(".conf-chk").forEach(function(c) { c.checked = checked; });
    }

    function confirmConferencia() {
        var selecionados = [];
        document.querySelectorAll(".conf-chk").forEach(function(chk) {
            if (chk.checked) {
                var idx = parseInt(chk.getAttribute("data-idx"), 10);
                if (_importItensTemp[idx]) selecionados.push(_importItensTemp[idx]);
            }
        });
        if (selecionados.length === 0) { _toast("Selecione ao menos um item.", "error"); return; }
        selecionados.forEach(function(item) {
            _itens.push({ refOriginal: item.refOriginal, descOriginal: item.descOriginal, qtdeSolicitada: item.qtdeSolicitada || 1 });
        });
        renderItens();
        closeModal("modalConferencia");
        _toast(selecionados.length + " " + (selecionados.length === 1 ? "item adicionado" : "itens adicionados") + " à demanda.", "success");
        _importItensTemp = [];
    }

    // ════════════════════════════════════════════════════════
    // SALVAR DEMANDA → FIRESTORE
    // ════════════════════════════════════════════════════════

    function salvarDemanda() {
        if (_itens.length === 0) {
            _toast("Adicione ao menos um item antes de salvar.", "error"); return;
        }
        if (typeof DemandaDB === "undefined") {
            _toast("Erro: DemandaDB não disponível.", "error"); return;
        }

        var s = _sessao;
        var origemEl = document.getElementById("selectOrigem");

        var data = {
            origem:       origemEl ? origemEl.value : "manual",
            canalOrigem:  origemEl ? origemEl.value : "manual",
            clienteId:    _clienteAtual ? _clienteAtual.id    : null,
            clienteNome:  _clienteAtual ? _clienteAtual.nome  : "",
            clienteCnpj:  _clienteAtual ? _clienteAtual.cnpj  : "",
            vendedorId:   s ? (s.login || s.email || null)     : null,
            vendedorNome: s ? (s.nome  || s.name  || "")       : "",
            filialId:     s ? (s.filialId    || 1)             : 1,
            filialNome:   s ? (s.filial || s.tenantNome || "") : "",
            criadoPor:    s ? (s.login || s.email || "sistema"): "sistema"
        };

        // Feedback visual: desabilita ambos os botões salvar
        var btnSalvar  = document.getElementById("btnSalvarDemanda");
        var btnSalvar2 = document.getElementById("btnSalvarDemandaPanel");
        function _setBtnSaving(saving) {
            [btnSalvar, btnSalvar2].forEach(function(b) {
                if (!b) return;
                b.disabled = saving;
                if (saving) { b.textContent = "Salvando..."; }
                else { b.innerHTML = "<span class='material-icons-round'>save</span> Salvar Demanda"; }
            });
        }
        _setBtnSaving(true);

        DemandaDB.createDemanda(data, _itens.slice())
            .then(function(demandaId) {
                console.log("[DemandaApp] Demanda criada:", demandaId);
                _toast("Demanda salva com sucesso!", "success");
                limparDemanda();
                setTimeout(function() { switchView("lista"); }, 800);
            })
            .catch(function(err) {
                console.error("[DemandaApp] Erro ao salvar:", err);
                _toast("Erro ao salvar: " + (err.message || err), "error");
            })
            .finally(function() { _setBtnSaving(false); });
    }

    // ════════════════════════════════════════════════════════
    // LISTA DE DEMANDAS (view-lista)
    // ════════════════════════════════════════════════════════

    function filterDemandas(filtro, el) {
        _filterAtual = filtro;
        document.querySelectorAll(".filter-chip").forEach(function(c) { c.classList.remove("active"); });
        if (el) el.classList.add("active");
        loadDemandasLista(filtro);
    }

    function loadDemandasLista(filtro) {
        var container = document.getElementById("listaDemandasContainer");
        if (!container) return;

        container.innerHTML = "<div style='padding:3rem;text-align:center;color:var(--text-secondary)'>" +
            "<span class='material-icons-round' style='font-size:2rem;display:block;animation:spin 1s linear infinite'>sync</span>" +
            "<p style='margin-top:.5rem;font-size:.85rem'>Carregando demandas...</p></div>";

        if (typeof DemandaDB === "undefined") {
            container.innerHTML = "<div style='padding:2rem;text-align:center;color:var(--accent-danger)'>DemandaDB não disponível.</div>";
            return;
        }

        var filters = {};
        if (filtro === "aberta")         filters.status = "aberta";
        if (filtro === "em_atendimento") filters.status = "em_atendimento";
        if (filtro === "encerrada")      filters.status = "encerrada";

        DemandaDB.listDemandas(filters)
            .then(function(demandas) {
                if (demandas.length === 0) {
                    container.innerHTML =
                        "<div style='padding:3rem;text-align:center;color:var(--text-secondary)'>" +
                        "<span class='material-icons-round' style='font-size:3rem;opacity:.3'>inbox</span>" +
                        "<h4 style='margin:.75rem 0 .25rem;color:var(--text-primary)'>Nenhuma demanda encontrada</h4>" +
                        "<p style='font-size:.85rem'>Crie uma nova na Central de Captura.</p>" +
                        "<button class='btn btn-primary btn-sm' style='margin-top:1rem' onclick='DemandaApp.switchView(\"captura\")'>" +
                        "<span class='material-icons-round'>add</span> Nova Demanda</button></div>";
                    return;
                }
                container.innerHTML = "<div style='padding:1rem 1.5rem'>" +
                    demandas.map(_renderDemandaCard).join("") + "</div>";
            })
            .catch(function(err) {
                console.error("[DemandaApp] Erro ao listar:", err);
                container.innerHTML = "<div style='padding:2rem;text-align:center;color:var(--accent-danger)'>" +
                    "<span class='material-icons-round'>error</span><p>Erro ao carregar: " + _esc(err.message || String(err)) + "</p></div>";
            });
    }

    function _renderDemandaCard(d) {
        var STATUS_COLOR = { aberta: "#6366f1", em_atendimento: "#f59e0b", encerrada: "#10b981", cancelada: "#6b7280" };
        var STATUS_LABEL = { aberta: "Aberta", em_atendimento: "Em Atendimento", encerrada: "Encerrada", cancelada: "Cancelada" };
        var cor = STATUS_COLOR[d.status] || "#6366f1";
        var lbl = STATUS_LABEL[d.status] || d.status;
        var dt  = d.criadoEm && d.criadoEm.toDate
            ? d.criadoEm.toDate().toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" })
            : "—";

        return "<div onclick='DemandaApp.abrirDemanda(\"" + _esc(d.id) + "\")'" +
            " style='background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-lg);" +
            "padding:1rem 1.25rem;margin-bottom:.75rem;display:flex;align-items:center;gap:1rem;" +
            "cursor:pointer;transition:border-color var(--transition)'" +
            " onmouseover='this.style.borderColor=\"var(--primary-color)\"'" +
            " onmouseout='this.style.borderColor=\"var(--border-color)\"'>" +
            // Info principal
            "<div style='flex:1;min-width:0'>" +
            "<div style='display:flex;align-items:center;gap:.5rem;margin-bottom:.25rem'>" +
            "<span style='font-weight:700;font-size:.9rem'>" + _esc(d.codigo || "—") + "</span>" +
            "<span style='font-size:.7rem;padding:.1rem .5rem;border-radius:10px;background:" + cor + "22;color:" + cor + ";font-weight:600'>" + lbl + "</span>" +
            "</div>" +
            "<div style='font-size:.78rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>" +
            (d.clienteNome ? "<span style='color:var(--text-primary)'>" + _esc(d.clienteNome) + "</span> · " : "") +
            (d.vendedorNome ? "Vend.: " + _esc(d.vendedorNome) + " · " : "") +
            dt +
            "</div>" +
            "</div>" +
            // Contadores
            "<div style='display:flex;gap:1.25rem;text-align:center;flex-shrink:0'>" +
            _miniStat("Itens",   d.totalItens      || 0, "var(--text-primary)") +
            _miniStat("Estoque", d.totalComEstoque  || 0, "var(--accent-success)") +
            _miniStat("Faltam",  d.totalSemEstoque  || 0, (d.totalSemEstoque || 0) > 0 ? "var(--accent-danger)" : "var(--text-secondary)") +
            "</div>" +
            "<span class='material-icons-round' style='color:var(--text-secondary);font-size:1.1rem'>chevron_right</span>" +
            "</div>";
    }

    function _miniStat(label, val, color) {
        return "<div style='min-width:44px'>" +
            "<div style='font-size:1rem;font-weight:700;color:" + color + "'>" + val + "</div>" +
            "<div style='font-size:.62rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.06em'>" + label + "</div>" +
            "</div>";
    }

    function abrirDemanda(id) {
        if (!id) return;
        var body = document.getElementById("modalDemandaDetalheBody");
        if (body) body.innerHTML = "<div class='search-loading'><div class='spinner'></div><span>Carregando...</span></div>";
        _openModal("modalDemandaDetalhe");
        if (typeof DemandaDB === "undefined") {
            if (body) body.innerHTML = "<p style='color:var(--accent-danger)'>DemandaDB indisponível.</p>"; return;
        }
        Promise.all([ DemandaDB.getDemanda(id), DemandaDB.getItens(id) ])
            .then(function(res) {
                _demandaAtual = { id: id, data: res[0], itens: res[1] };
                _renderDemandaDetalheBody();
            })
            .catch(function(err) {
                if (body) body.innerHTML = "<p style='color:var(--accent-danger);padding:1rem'>Erro: " + _esc(err.message || String(err)) + "</p>";
            });
    }

    // ════════════════════════════════════════════════════════
    // DETALHE DA DEMANDA — RENDERIZAÇÃO COM GESTÃO DE ESTADOS
    // ════════════════════════════════════════════════════════

    function _renderDemandaDetalheBody() {
        if (!_demandaAtual) return;
        var body = document.getElementById("modalDemandaDetalheBody");
        if (!body) return;

        var d     = _demandaAtual.data;
        var itens = _demandaAtual.itens;
        var SC = { aberta:"#6366f1", em_atendimento:"#f59e0b", encerrada:"#10b981", cancelada:"#6b7280" };
        var SL = { aberta:"Aberta", em_atendimento:"Em Atendimento", encerrada:"Encerrada", cancelada:"Cancelada" };
        var cor = SC[d.status] || "#6366f1";
        var lbl = SL[d.status] || d.status;
        var dt  = d.criadoEm && d.criadoEm.toDate ? d.criadoEm.toDate().toLocaleDateString("pt-BR") : "—";

        // Contadores do progresso
        var total    = itens.length;
        var terminal = itens.filter(function(i) { return typeof DemandaStates !== "undefined" && DemandaStates.isTerminal(i.status); }).length;
        var pct      = total > 0 ? Math.round((terminal / total) * 100) : 0;

        var itensHtml = total === 0
            ? "<tr><td colspan='6' style='text-align:center;padding:2rem;color:var(--text-secondary)'>Nenhum item registrado.</td></tr>"
            : itens.map(function(item, i) { return _renderItemRow(item, i); }).join("");

        body.innerHTML =
            // Cabeçalho com código + status + data
            "<div style='display:flex;align-items:center;gap:.75rem;margin-bottom:1rem;flex-wrap:wrap'>" +
            "<span style='font-size:1.05rem;font-weight:700'>" + _esc(d.codigo) + "</span>" +
            "<span style='font-size:.7rem;padding:.15rem .55rem;border-radius:10px;background:" + cor + "22;color:" + cor + "'>" + lbl + "</span>" +
            "<span style='color:var(--text-secondary);font-size:.78rem;margin-left:auto'>" + dt + "</span>" +
            "</div>" +
            // Info cliente / vendedor
            (d.clienteNome ? "<div style='font-size:.82rem;margin-bottom:.75rem;color:var(--text-secondary)'>" +
                "<strong style='color:var(--text-primary)'>Cliente:</strong> " + _esc(d.clienteNome) +
                (d.vendedorNome ? " &nbsp;·&nbsp; <strong style='color:var(--text-primary)'>Vendedor:</strong> " + _esc(d.vendedorNome) : "") +
                "</div>" : "") +
            // Barra de progresso dos itens
            (total > 0 ? "<div style='margin-bottom:1rem'>" +
                "<div style='display:flex;justify-content:space-between;font-size:.75rem;color:var(--text-secondary);margin-bottom:.3rem'>" +
                "<span>Progresso dos itens</span><span>" + terminal + "/" + total + " concluídos (" + pct + "%)</span></div>" +
                "<div style='height:4px;background:var(--border-color);border-radius:4px;overflow:hidden'>" +
                "<div style='height:100%;width:" + pct + "%;background:var(--accent-success);transition:width .4s'></div></div>" +
                "</div>" : "") +
            // Tabela de itens
            "<div style='overflow-x:auto'>" +
            "<table style='width:100%;border-collapse:collapse;font-size:.82rem'>" +
            "<thead><tr style='border-bottom:1px solid var(--border-color)'>" +
            ["#","Referência","Descrição","Qtd","Status","Ação"].map(function(h) {
                return "<th style='padding:.4rem .6rem;text-align:left;color:var(--text-secondary);font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em'>" + h + "</th>";
            }).join("") +
            "</tr></thead><tbody id='detalheItemsTbody'>" + itensHtml + "</tbody></table></div>";
    }

    function _renderItemRow(item, i) {
        var sc     = (typeof DemandaStates !== "undefined") ? DemandaStates.get(item.status) : { label: item.status, color: "#6366f1" };
        var nexts  = (typeof DemandaStates !== "undefined") ? DemandaStates.nextStates(item.status) : [];
        var isEnd  = (typeof DemandaStates !== "undefined") && DemandaStates.isTerminal(item.status);
        var needsId = (item.status === "demanda_recebida" || item.status === "em_identificacao") && !item.erpProdutoId;

        var acaoHtml;
        if (isEnd) {
            acaoHtml = "<span style='font-size:.72rem;color:var(--text-secondary)'>Conclu\u00eddo</span>";
        } else if (nexts.length === 0) {
            acaoHtml = "<span style='font-size:.72rem;color:var(--text-secondary)'>\u2014</span>";
        } else {
            acaoHtml = "<select onchange=\"DemandaApp.avancarItemStatus('" + _esc(item.id) + "',this.value,this)\" " +
                "style='background:var(--bg-dark);border:1px solid var(--border);border-radius:6px;padding:.2rem .5rem;" +
                "color:var(--text-primary);font-size:.75rem;cursor:pointer;max-width:150px'>" +
                "<option value=''>Avan\u00e7ar para...</option>" +
                nexts.map(function(n) { return "<option value='" + n.key + "' style='color:" + n.color + "'>" + n.label + "</option>"; }).join("") +
                "</select>";
        }

        var identificarBtn = needsId
            ? "<br><button onclick=\"DemandaApp._abrirBuscaERP('" + _esc(item.id) + "')\" " +
              "style='margin-top:.3rem;background:transparent;border:1px solid var(--accent-primary);border-radius:4px;" +
              "padding:.15rem .5rem;color:var(--accent-primary);font-size:.7rem;cursor:pointer'>" +
              "<span class='material-icons-round' style='font-size:.8rem;vertical-align:middle'>search</span> Identificar</button>"
            : "";

        var tlBtn = "<button id='btnTimeline_" + _esc(item.id) + "' title='Hist\u00f3rico' onclick=\"DemandaApp.toggleItemTimeline('" + _esc(item.id) + "')\" " +
            "style='background:transparent;border:none;color:var(--text-secondary);cursor:pointer;padding:.1rem;vertical-align:middle'>" +
            "<span class='material-icons-round' style='font-size:.95rem'>history</span></button>";

        var timelineRow = "<tr id='timeline_" + _esc(item.id) + "' style='display:none'>" +
            "<td colspan='6' style='padding:.5rem .6rem 1rem 2.5rem;border-bottom:1px solid rgba(255,255,255,.06)'>" +
            "<div style='font-size:.7rem;font-weight:600;color:var(--text-secondary);margin-bottom:.5rem;text-transform:uppercase;letter-spacing:.05em'>Hist\u00f3rico do Item</div>" +
            _renderTimeline(item) + "</td></tr>";

        var mainRow = "<tr style='border-bottom:1px solid rgba(255,255,255,.04)'>" +
            "<td style='color:var(--text-secondary);font-size:.75rem;padding:.5rem .6rem'>" + (i + 1) + " " + tlBtn + "</td>" +
            "<td style='font-weight:600;font-size:.82rem;padding:.5rem .6rem'>" + _esc(item.refOriginal || item.erpProdutoId || "\u2014") + "</td>" +
            "<td style='font-size:.79rem;color:var(--text-secondary);padding:.5rem .6rem;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>" +
                _esc(item.descOriginal || item.erpProdutoDesc || "\u2014") + "</td>" +
            "<td style='text-align:center;padding:.5rem .6rem'>" + (item.qtdeSolicitada || 1) + "</td>" +
            "<td style='padding:.5rem .6rem'><span style='font-size:.7rem;padding:.15rem .5rem;border-radius:10px;background:" +
                sc.color + "22;color:" + sc.color + ";white-space:nowrap'>" + _esc(sc.label) + "</span></td>" +
            "<td style='padding:.5rem .6rem'>" + acaoHtml + identificarBtn + "</td>" +
            "</tr>";

        return mainRow + timelineRow;
    }

    // ════════════════════════════════════════════════════════
    // AVANÇAR ESTADO DO ITEM → FIRESTORE
    // ════════════════════════════════════════════════════════

    function avancarItemStatus(itemId, novoStatus, selectEl) {
        if (!novoStatus || !_demandaAtual) return;
        if (selectEl) selectEl.value = ""; // reset imediatamente

        // Encontra o item na memória
        var item = null;
        for (var i = 0; i < _demandaAtual.itens.length; i++) {
            if (_demandaAtual.itens[i].id === itemId) { item = _demandaAtual.itens[i]; break; }
        }
        if (!item) { _toast("Item não encontrado.", "error"); return; }

        // Valida transição
        if (typeof DemandaStates !== "undefined") {
            var check = DemandaStates.canTransition(item.status, novoStatus);
            if (!check.valid) { _toast(check.reason, "error"); return; }
        }

        // Caso especial: venda_perdida → pede motivo
        if (novoStatus === "venda_perdida") {
            _confirmarVendaPerdida(itemId, item.status); return;
        }

        // Caso especial: estoque_disponivel ou estoque_parcial → verifica quantidade
        if ((novoStatus === "estoque_disponivel" || novoStatus === "estoque_parcial") && (item.qtdeSolicitada || 1) > 1) {
            _confirmarQuantidadeParcial(itemId, item.status, novoStatus); return;
        }

        // Persiste
        _persistirTransicao(itemId, item.status, novoStatus, "");
    }

    function _persistirTransicao(itemId, deStatus, paraStatus, obs) {
        if (typeof DemandaDB === "undefined") { _toast("DemandaDB indisponível.", "error"); return; }

        var s = _sessao;
        var por = s ? (s.login || s.nome || "sistema") : "sistema";

        var timelineEntry = { evento: "status_changed", de: deStatus, para: paraStatus, por: por, obs: obs };

        DemandaDB.updateItem(_demandaAtual.id, itemId, { status: paraStatus }, timelineEntry)
            .then(function() {
                // Atualiza memória local
                for (var i = 0; i < _demandaAtual.itens.length; i++) {
                    if (_demandaAtual.itens[i].id === itemId) {
                        _demandaAtual.itens[i].status = paraStatus;
                        break;
                    }
                }
                var sc  = (typeof DemandaStates !== "undefined") ? DemandaStates.get(paraStatus) : { label: paraStatus };
                _toast("Status avançado para: " + sc.label, "success");
                _renderDemandaDetalheBody();
                // Atualiza a lista de demandas em background
                loadDemandasLista(_filterAtual);
            })
            .catch(function(err) {
                _toast("Erro ao avançar: " + (err.message || err), "error");
            });
    }

    function _confirmarVendaPerdida(itemId, deStatus) {
        if (typeof DemandaStates === "undefined") { _persistirTransicao(itemId, deStatus, "venda_perdida", ""); return; }
        var motivos = DemandaStates.MOTIVOS_PERDA;
        var opts = motivos.map(function(m) { return "<option value='" + m.key + "'>" + m.label + "</option>"; }).join("");

        // Pequeno modal inline via confirm-like approach usando div overlay temporário
        var overlay = document.createElement("div");
        overlay.style.cssText = "position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center";
        overlay.innerHTML =
            "<div style='background:var(--bg-sidebar);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.5rem;width:360px;max-width:90vw'>" +
            "<h4 style='margin:0 0 1rem;display:flex;align-items:center;gap:.5rem'>" +
            "<span class='material-icons-round' style='color:var(--accent-danger)'>cancel</span>Registrar Venda Perdida</h4>" +
            "<label style='font-size:.82rem;color:var(--text-secondary);display:block;margin-bottom:.4rem'>Motivo da perda:</label>" +
            "<select id='_motivoPerdaSelect' style='width:100%;background:var(--bg-dark);border:1px solid var(--border);border-radius:6px;padding:.45rem .7rem;color:var(--text-primary);margin-bottom:.75rem'>" +
            opts + "</select>" +
            "<label style='font-size:.82rem;color:var(--text-secondary);display:block;margin-bottom:.4rem'>Observação (opcional):</label>" +
            "<input id='_motivoPerdaObs' type='text' placeholder='Detalhes...' " +
            "style='width:100%;background:var(--bg-dark);border:1px solid var(--border);border-radius:6px;padding:.45rem .7rem;color:var(--text-primary);box-sizing:border-box;margin-bottom:1rem'>" +
            "<div style='display:flex;gap:.5rem;justify-content:flex-end'>" +
            "<button onclick='this.closest(\"div[style*=inset]\").remove()' " +
            "style='background:var(--bg-dark);border:1px solid var(--border);border-radius:6px;padding:.4rem .9rem;color:var(--text-secondary);cursor:pointer'>Cancelar</button>" +
            "<button id='_btnConfirmarPerda' " +
            "style='background:var(--accent-danger);border:none;border-radius:6px;padding:.4rem 1rem;color:#fff;cursor:pointer;font-weight:600'>Confirmar Perda</button>" +
            "</div></div>";
        document.body.appendChild(overlay);

        document.getElementById("_btnConfirmarPerda").onclick = function() {
            var motivo = document.getElementById("_motivoPerdaSelect").value;
            var obs    = (document.getElementById("_motivoPerdaObs").value || "").trim();
            var obsStr = "Motivo: " + motivo + (obs ? " — " + obs : "");
            overlay.remove();
            _persistirTransicao(itemId, deStatus, "venda_perdida", obsStr);
        };
    }


    // ════════════════════════════════════════════════════════
    // VIEW: DASHBOARD — KPIs DE INTELIGÊNCIA
    // ════════════════════════════════════════════════════════

    function loadDashboard() {
        var container = document.getElementById("dashboardContainer");
        if (!container) return;
        container.innerHTML = "<div style='padding:3rem;text-align:center;color:var(--text-secondary)'>" +
            "<span class='material-icons-round' style='font-size:2rem;animation:spin 1s linear infinite'>sync</span>" +
            "<p style='margin-top:.5rem;font-size:.85rem'>Carregando KPIs...</p></div>";

        if (typeof DemandaDB === "undefined") {
            container.innerHTML = "<p style='padding:2rem;color:var(--accent-danger)'>DemandaDB indisponível.</p>"; return;
        }

        DemandaDB.getDashboardStats()
            .then(function(s) {
                var SL = { aberta: "Abertas", em_atendimento: "Em Atendimento", encerrada: "Encerradas", cancelada: "Canceladas" };
                var SC = { aberta: "#6366f1", em_atendimento: "#f59e0b", encerrada: "#10b981", cancelada: "#6b7280" };

                // KPI cards
                var kpis = [
                    { icon: "receipt_long",  label: "Total Demandas",    val: s.totalDemandas,      color: "#6366f1" },
                    { icon: "inventory",     label: "Itens Recebidos",   val: s.totalItens,         color: "#3b82f6" },
                    { icon: "manage_search", label: "Identificados",     val: s.totalIdentificados, color: "#f59e0b" },
                    { icon: "check_circle",  label: "Com Estoque",       val: s.totalComEstoque,    color: "#10b981" },
                    { icon: "inventory_2",   label: "Sem Estoque",       val: s.totalSemEstoque,    color: "#ef4444" },
                    { icon: "cancel",        label: "Venda Perdida",     val: s.totalPerdidos,      color: "#6b7280" },
                ];

                var kpiHtml = "<div style='display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1rem;margin-bottom:2rem'>" +
                    kpis.map(function(k) {
                        return "<div style='background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:1.1rem 1.25rem;display:flex;flex-direction:column;gap:.4rem'>" +
                            "<div style='display:flex;align-items:center;gap:.5rem;margin-bottom:.2rem'>" +
                            "<span class='material-icons-round' style='font-size:1.1rem;color:" + k.color + "'>" + k.icon + "</span>" +
                            "<span style='font-size:.72rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em'>" + k.label + "</span>" +
                            "</div>" +
                            "<span style='font-size:1.75rem;font-weight:800;color:" + k.color + "'>" + k.val + "</span>" +
                            "</div>";
                    }).join("") + "</div>";

                // Taxas como barras de progresso
                var taxas = [
                    { label: "Taxa de Identificação", val: s.taxaIdentificacao, color: "#f59e0b", desc: s.totalIdentificados + " de " + s.totalItens + " itens identificados" },
                    { label: "Taxa de Estoque",       val: s.taxaEstoque,       color: "#10b981", desc: s.totalComEstoque + " de " + s.totalIdentificados + " têm estoque disponível" },
                    { label: "Taxa de Venda Perdida", val: s.taxaPerda,         color: "#ef4444", desc: s.totalPerdidos + " de " + s.totalItens + " itens perdidos" },
                ];

                var taxasHtml = "<div style='background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:1.25rem;margin-bottom:2rem'>" +
                    "<h4 style='margin:0 0 1.25rem;font-size:.9rem;color:var(--text-primary)'>Indicadores de Performance</h4>" +
                    taxas.map(function(t) {
                        return "<div style='margin-bottom:1.1rem'>" +
                            "<div style='display:flex;justify-content:space-between;margin-bottom:.3rem'>" +
                            "<span style='font-size:.82rem;color:var(--text-secondary)'>" + t.label + "</span>" +
                            "<span style='font-size:.82rem;font-weight:700;color:" + t.color + "'>" + t.val + "%</span>" +
                            "</div>" +
                            "<div style='height:6px;background:var(--border-color);border-radius:4px;overflow:hidden'>" +
                            "<div style='height:100%;width:" + t.val + "%;background:" + t.color + ";border-radius:4px;transition:width .5s'></div></div>" +
                            "<div style='font-size:.72rem;color:var(--text-secondary);margin-top:.2rem'>" + t.desc + "</div>" +
                            "</div>";
                    }).join("") + "</div>";

                // Demandas por status
                var statusKeys = Object.keys(s.porStatus);
                var statusHtml = statusKeys.length === 0 ? "" :
                    "<div style='background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:1.25rem'>" +
                    "<h4 style='margin:0 0 1.25rem;font-size:.9rem;color:var(--text-primary)'>Demandas por Status</h4>" +
                    "<div style='display:flex;flex-direction:column;gap:.5rem'>" +
                    statusKeys.map(function(sk) {
                        var cnt = s.porStatus[sk] || 0;
                        var pct = s.totalDemandas > 0 ? Math.round((cnt / s.totalDemandas) * 100) : 0;
                        var cor = SC[sk] || "#6b7280";
                        var lbl = SL[sk] || sk;
                        return "<div>" +
                            "<div style='display:flex;justify-content:space-between;margin-bottom:.25rem'>" +
                            "<span style='font-size:.82rem;color:var(--text-secondary)'>" + lbl + "</span>" +
                            "<span style='font-size:.82rem;font-weight:700;color:" + cor + "'>" + cnt + " (" + pct + "%)</span></div>" +
                            "<div style='height:5px;background:var(--border-color);border-radius:4px;overflow:hidden'>" +
                            "<div style='height:100%;width:" + pct + "%;background:" + cor + ";border-radius:4px'></div></div>" +
                            "</div>";
                    }).join("") + "</div></div>";

                container.innerHTML = kpiHtml + taxasHtml + statusHtml;
            })
            .catch(function(err) {
                container.innerHTML = "<p style='padding:2rem;color:var(--accent-danger)'>Erro ao carregar: " + _esc(err.message || err) + "</p>";
            });
    }

    // ════════════════════════════════════════════════════════
    // VIEW: FILA DE COMPRAS
    // ════════════════════════════════════════════════════════

    function loadFilaCompras() {
        var container = document.getElementById("comprasContainer");
        if (!container) return;
        container.innerHTML = "<div style='padding:3rem;text-align:center;color:var(--text-secondary)'>" +
            "<span class='material-icons-round' style='font-size:2rem;animation:spin 1s linear infinite'>sync</span>" +
            "<p style='margin-top:.5rem;font-size:.85rem'>Carregando fila...</p></div>";

        if (typeof DemandaDB === "undefined") {
            container.innerHTML = "<p style='padding:2rem;color:var(--accent-danger)'>DemandaDB indisponível.</p>"; return;
        }

        DemandaDB.listItensFila(80)
            .then(function(itens) {
                if (itens.length === 0) {
                    container.innerHTML =
                        "<div style='padding:3rem;text-align:center;color:var(--text-secondary)'>" +
                        "<span class='material-icons-round' style='font-size:3rem;opacity:.3'>shopping_cart</span>" +
                        "<h4 style='margin:.75rem 0 .25rem;color:var(--text-primary)'>Fila vazia</h4>" +
                        "<p style='font-size:.85rem'>Nenhum item aguardando compra no momento.</p></div>";
                    return;
                }

                var SLBL = { sem_estoque:"Sem Estoque", encaminhado_compras:"Em Compras", cotacao_fornecedor:"Cotando", compra_possivel:"Compra Possível" };
                var SCOR = { sem_estoque:"#ef4444", encaminhado_compras:"#8b5cf6", cotacao_fornecedor:"#f97316", compra_possivel:"#10b981" };

                // Agrupa por status
                var grupos = {};
                itens.forEach(function(item) {
                    if (!grupos[item.status]) grupos[item.status] = [];
                    grupos[item.status].push(item);
                });

                var html = "<div style='padding:1rem 1.5rem'>" +
                    "<div style='display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;flex-wrap:wrap'>" +
                    "<span style='font-size:.88rem;font-weight:700'>" + itens.length + " " + (itens.length === 1 ? "item" : "itens") + " na fila</span>" +
                    "<button class='btn btn-secondary btn-sm' onclick='DemandaApp.loadFilaCompras()' style='margin-left:auto'>" +
                    "<span class='material-icons-round'>refresh</span> Atualizar</button>" +
                    "</div>";

                Object.keys(grupos).forEach(function(status) {
                    var grpItens = grupos[status];
                    var cor = SCOR[status] || "#6366f1";
                    var lbl = SLBL[status] || status;

                    html += "<div style='margin-bottom:1.5rem'>" +
                        "<div style='display:flex;align-items:center;gap:.5rem;margin-bottom:.75rem;padding-bottom:.5rem;border-bottom:1px solid var(--border-color)'>" +
                        "<span class='material-icons-round' style='color:" + cor + ";font-size:1rem'>shopping_cart</span>" +
                        "<span style='font-weight:700;color:" + cor + "'>" + lbl + "</span>" +
                        "<span style='font-size:.75rem;color:var(--text-secondary);margin-left:.25rem'>(" + grpItens.length + ")</span></div>" +
                        "<div style='overflow-x:auto'><table style='width:100%;border-collapse:collapse;font-size:.82rem'>" +
                        "<thead><tr style='border-bottom:1px solid var(--border-color)'>" +
                        ["Referência","Descrição","Qtd Solicitada","Demanda","Ação"].map(function(h) {
                            return "<th style='padding:.35rem .6rem;text-align:left;color:var(--text-secondary);font-size:.7rem;font-weight:600;text-transform:uppercase'>" + h + "</th>";
                        }).join("") + "</tr></thead><tbody>" +
                        grpItens.map(function(item) {
                            var nexts = (typeof DemandaStates !== "undefined") ? DemandaStates.nextStates(item.status) : [];
                            var acaoHtml = nexts.length === 0 ? "—" :
                                "<select onchange=\"DemandaApp.avancarItemFilaCompras('" + _esc(item.id) + "','" + _esc(item.demandaId) + "',this.value,this)\" " +
                                "style='background:var(--bg-dark);border:1px solid var(--border);border-radius:5px;padding:.2rem .4rem;color:var(--text-primary);font-size:.73rem;cursor:pointer'>" +
                                "<option value=''>Avançar...</option>" +
                                nexts.map(function(n) { return "<option value='" + n.key + "'>" + n.label + "</option>"; }).join("") +
                                "</select>";
                            return "<tr style='border-bottom:1px solid rgba(255,255,255,.04)'>" +
                                "<td style='padding:.4rem .6rem;font-weight:600'>" + _esc(item.refOriginal || "—") + "</td>" +
                                "<td style='padding:.4rem .6rem;color:var(--text-secondary);max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>" + _esc(item.descOriginal || "—") + "</td>" +
                                "<td style='padding:.4rem .6rem;text-align:center'>" + (item.qtdeSolicitada || 1) + "</td>" +
                                "<td style='padding:.4rem .6rem'>" +
                                "<a onclick=\"DemandaApp.abrirDemanda('" + _esc(item.demandaId) + "')\" style='color:var(--primary-color);cursor:pointer;font-size:.78rem;text-decoration:underline'>" +
                                (item.demandaId ? item.demandaId.substring(0, 8) + "..." : "—") + "</a></td>" +
                                "<td style='padding:.4rem .6rem'>" + acaoHtml + "</td>" +
                                "</tr>";
                        }).join("") +
                        "</tbody></table></div></div>";
                });
                html += "</div>";
                container.innerHTML = html;
            })
            .catch(function(err) {
                container.innerHTML = "<p style='padding:2rem;color:var(--accent-danger)'>Erro: " + _esc(err.message || err) + "</p>";
            });
    }

    // Avança estado de item direto pela fila de compras (sem _demandaAtual)
    function avancarItemFilaCompras(itemId, demandaId, novoStatus, selectEl) {
        if (!novoStatus || !demandaId) return;
        if (selectEl) selectEl.value = "";
        if (typeof DemandaDB === "undefined") { _toast("DemandaDB indisponível.", "error"); return; }
        var s = _sessao;
        var por = s ? (s.login || s.nome || "sistema") : "sistema";
        DemandaDB.updateItem(demandaId, itemId, { status: novoStatus }, { evento: "status_changed", por: por, obs: "" })
            .then(function() {
                var sc = (typeof DemandaStates !== "undefined") ? DemandaStates.get(novoStatus) : { label: novoStatus };
                _toast("Status avançado: " + sc.label, "success");
                setTimeout(function() { loadFilaCompras(); }, 300);
            })
            .catch(function(err) { _toast("Erro: " + (err.message || err), "error"); });
    }

    // ════════════════════════════════════════════════════════
    // AUTOSAVE DE RASCUNHO
    // ════════════════════════════════════════════════════════

    var _RASCUNHO_KEY = "demanda_rascunho";

    function _autosave() {
        try {
            var tid = _sessao ? (_sessao.tenantId || "default") : "default";
            sessionStorage.setItem(_RASCUNHO_KEY + "_" + tid, JSON.stringify({
                itens: _itens, cliente: _clienteAtual, ts: Date.now()
            }));
        } catch(e) {}
    }

    function _restoreRascunho() {
        try {
            var tid = _sessao ? (_sessao.tenantId || "default") : "default";
            var raw = sessionStorage.getItem(_RASCUNHO_KEY + "_" + tid);
            if (!raw) return;
            var data = JSON.parse(raw);
            if (!data || !data.itens || data.itens.length === 0) return;
            if (Date.now() - data.ts > 24 * 60 * 60 * 1000) return;
            if (confirm("H\u00e1 um rascunho salvo com " + data.itens.length + " item(s). Deseja restaurar?")) {
                _itens = data.itens;
                if (data.cliente) {
                    _clienteAtual = data.cliente;
                    var elNome = document.getElementById("clienteNome");
                    if (elNome) elNome.value = data.cliente.nome || "";
                }
                renderItens();
                _toast("Rascunho restaurado com " + _itens.length + " item(s).", "success");
            }
        } catch(e) {}
    }

    function _limparRascunho() {
        try {
            var tid = _sessao ? (_sessao.tenantId || "default") : "default";
            sessionStorage.removeItem(_RASCUNHO_KEY + "_" + tid);
        } catch(e) {}
    }

    // ════════════════════════════════════════════════════════
    // TIMELINE VISUAL POR ITEM
    // ════════════════════════════════════════════════════════

    function _renderTimeline(item) {
        var tl = item.timeline || [];
        if (tl.length === 0) return "<p style='color:var(--text-secondary);font-size:.8rem;padding:.3rem 0'>Nenhum evento registrado.</p>";
        var html = "<div style='position:relative;padding-left:1.1rem;border-left:2px solid var(--border-color)'>";
        tl.slice().reverse().forEach(function(e) {
            var sc = (typeof DemandaStates !== "undefined" && e.para) ? DemandaStates.get(e.para) : { label: e.para || "?", color: "#6366f1" };
            var dt = e.em ? new Date(e.em).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" }) : "";
            html += "<div style='position:relative;margin-bottom:.65rem'>" +
                "<div style='position:absolute;left:-1.32rem;top:.3rem;width:.55rem;height:.55rem;border-radius:50%;background:" + sc.color + "'></div>" +
                "<div style='font-size:.72rem;color:var(--text-secondary)'>" + _esc(dt) + (e.por ? " \u00b7 " + _esc(e.por) : "") + "</div>" +
                "<div style='font-size:.78rem;font-weight:600;color:" + sc.color + "'>" + _esc(sc.label || e.para || "?") + "</div>" +
                (e.obs ? "<div style='font-size:.75rem;color:var(--text-secondary);margin-top:.1rem'>" + _esc(e.obs) + "</div>" : "") +
                "</div>";
        });
        return html + "</div>";
    }

    function toggleItemTimeline(itemId) {
        var el  = document.getElementById("timeline_" + itemId);
        if (!el) return;
        var open = el.style.display !== "none";
        el.style.display = open ? "none" : "";
        var btn = document.getElementById("btnTimeline_" + itemId);
        if (btn) btn.querySelector(".material-icons-round").textContent = open ? "history" : "expand_less";
    }

    // ════════════════════════════════════════════════════════
    // IDENTIFICAR ITEM VIA ERP
    // ════════════════════════════════════════════════════════

    var _buscaErpItemId = null;

    function _abrirBuscaERP(itemId) {
        _buscaErpItemId = itemId;
        var modal = document.getElementById("modalBuscaERP");
        if (!modal) { _toast("Modal ERP n\u00e3o encontrado.", "error"); return; }
        var inp = document.getElementById("inpBuscaERP");
        if (inp) { inp.value = ""; setTimeout(function(){ inp.focus(); }, 100); }
        var res = document.getElementById("buscaERPResultados");
        if (res) res.innerHTML = "<p style='color:var(--text-secondary);font-size:.83rem;padding:.5rem 0'>Digite uma refer\u00eancia ou descri\u00e7\u00e3o para buscar.</p>";
        modal.style.display = "flex";
    }

    function _fecharBuscaERP() {
        var modal = document.getElementById("modalBuscaERP");
        if (modal) modal.style.display = "none";
        _buscaErpItemId = null;
    }

    function _executarBuscaERP() {
        var inp = document.getElementById("inpBuscaERP");
        var q   = inp ? inp.value.trim() : "";
        if (q.length < 2) { _toast("Digite ao menos 2 caracteres.", "warning"); return; }
        var res = document.getElementById("buscaERPResultados");
        if (res) res.innerHTML = "<div style='padding:1.5rem;text-align:center;color:var(--text-secondary)'>" +
            "<span class='material-icons-round' style='animation:spin 1s linear infinite'>sync</span>" +
            "<br><small>Buscando no ERP...</small></div>";
        if (typeof DemandaSearch === "undefined") {
            if (res) res.innerHTML = "<p style='color:var(--accent-danger);font-size:.83rem'>DemandaSearch n\u00e3o dispon\u00edvel. Configure a integra\u00e7\u00e3o ERP.</p>";
            return;
        }
        DemandaSearch.search(q)
            .then(function(resultados) {
                if (!resultados || resultados.length === 0) {
                    if (res) res.innerHTML = "<p style='color:var(--text-secondary);font-size:.83rem;padding:.5rem'>Nenhum produto encontrado para \"" + _esc(q) + "\".</p>";
                    return;
                }
                var html = resultados.slice(0, 15).map(function(p) {
                    var estoque = p.estoqueFilial !== undefined ? p.estoqueFilial : (p.saldo !== undefined ? p.saldo : null);
                    var badge   = (estoque !== null && estoque > 0) ? "#10b981" : "#ef4444";
                    var estoqTxt = estoque !== null ? (estoque > 0 ? "Estoque: " + estoque : "Sem estoque") : "";
                    var pid = JSON.stringify({ erpId: p.erpId || p.referencia || p.codigo || "", desc: p.descricao || p.nome || "", fabricante: p.fabricante || "", estoque: estoque, preco: p.preco || 0 });
                    return "<div style='border:1px solid var(--border-color);border-radius:8px;padding:.7rem;margin-bottom:.5rem'>" +
                        "<div style='display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem'>" +
                        "<div><div style='font-weight:700;font-size:.84rem'>" + _esc(p.referencia || p.codigo || p.erpId || "?") + "</div>" +
                        "<div style='font-size:.77rem;color:var(--text-secondary)'>" + _esc(p.descricao || p.nome || "\u2014") + "</div>" +
                        (p.fabricante ? "<div style='font-size:.7rem;color:var(--text-secondary)'>" + _esc(p.fabricante) + "</div>" : "") + "</div>" +
                        "<div style='text-align:right;flex-shrink:0'>" +
                        (estoqTxt ? "<span style='font-size:.7rem;padding:.12rem .4rem;border-radius:6px;background:" + badge + "22;color:" + badge + "'>" + estoqTxt + "</span>" : "") +
                        (p.preco ? "<div style='font-size:.72rem;color:var(--text-secondary);margin-top:.2rem'>R$ " + Number(p.preco).toFixed(2).replace(".",",") + "</div>" : "") +
                        "</div></div>" +
                        "<button onclick=\"DemandaApp._vincularProduto(" + pid.replace(/\"/g, "&quot;") + ")\" " +
                        "style='margin-top:.45rem;background:var(--accent-primary);color:#fff;border:none;border-radius:5px;padding:.28rem .75rem;font-size:.75rem;cursor:pointer;width:100%'>Vincular este produto</button>" +
                        "</div>";
                }).join("");
                if (res) res.innerHTML = html;
            })
            .catch(function(err) {
                if (res) res.innerHTML = "<p style='color:var(--accent-danger);font-size:.83rem'>Erro: " + _esc(err.message || String(err)) + "</p>";
            });
    }

    function _vincularProduto(produto) {
        if (!_buscaErpItemId || !_demandaAtual) { _toast("Contexto perdido. Reabra a demanda.", "error"); return; }
        if (typeof produto === "string") { try { produto = JSON.parse(produto); } catch(e) { _toast("Erro ao processar produto.", "error"); return; } }
        var itemId = _buscaErpItemId;
        var por    = _sessao ? (_sessao.login || _sessao.nome || "sistema") : "sistema";
        var fields = {
            erpProdutoId:   produto.erpId || "",
            erpProdutoDesc: produto.desc  || "",
            fabricante:     produto.fabricante || "",
            estoqueFilial:  produto.estoque !== undefined ? produto.estoque : null,
            preco:          produto.preco  || null,
            status:         "identificado"
        };
        var tl = { evento: "produto_vinculado", para: "identificado", por: por, obs: "ERP: " + (produto.erpId || "") };
        DemandaDB.updateItem(_demandaAtual.id, itemId, fields, tl)
            .then(function() {
                for (var i = 0; i < _demandaAtual.itens.length; i++) {
                    if (_demandaAtual.itens[i].id === itemId) { Object.assign(_demandaAtual.itens[i], fields); break; }
                }
                _fecharBuscaERP();
                _renderDemandaDetalheBody();
                loadDemandasLista(_filterAtual);
                _toast("Produto " + (produto.erpId || "") + " vinculado!", "success");
            })
            .catch(function(err) { _toast("Erro ao vincular: " + (err.message || err), "error"); });
    }

    // ════════════════════════════════════════════════════════
    // QUANTIDADE PARCIAL — SPLIT DE ITEM
    // ════════════════════════════════════════════════════════

    function _confirmarQuantidadeParcial(itemId, deStatus, paraStatus) {
        var item = null;
        for (var i = 0; i < _demandaAtual.itens.length; i++) {
            if (_demandaAtual.itens[i].id === itemId) { item = _demandaAtual.itens[i]; break; }
        }
        var qtdeSol = item ? (item.qtdeSolicitada || 1) : 1;
        var overlay = document.createElement("div");
        overlay.style.cssText = "position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center";
        overlay.innerHTML =
            "<div style='background:var(--bg-sidebar);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.5rem;width:360px;max-width:90vw'>" +
            "<h4 style='margin:0 0 .75rem;display:flex;align-items:center;gap:.5rem'>" +
            "<span class='material-icons-round' style='color:var(--accent-primary)'>call_split</span>Quantidade Dispon\u00edvel</h4>" +
            "<p style='font-size:.83rem;color:var(--text-secondary);margin-bottom:1rem'>Qtde solicitada: <strong style='color:var(--text-primary)'>" + qtdeSol + "</strong></p>" +
            "<label style='font-size:.82rem;color:var(--text-secondary);display:block;margin-bottom:.4rem'>Qtde atendida pelo estoque:</label>" +
            "<input id='_qtdeAtendidaInp' type='number' min='1' max='" + qtdeSol + "' value='" + qtdeSol + "' " +
            "style='width:100%;background:var(--bg-dark);border:1px solid var(--border);border-radius:6px;padding:.45rem .7rem;color:var(--text-primary);box-sizing:border-box;margin-bottom:.5rem'>" +
            "<p style='font-size:.74rem;color:var(--text-secondary);margin-bottom:1rem'>Se menor que " + qtdeSol + ", a qtde faltante retorna como nova demanda pendente.</p>" +
            "<div style='display:flex;gap:.5rem;justify-content:flex-end'>" +
            "<button onclick='this.closest(\"div[style*=inset]\").remove()' style='background:var(--bg-dark);border:1px solid var(--border);border-radius:6px;padding:.4rem .9rem;color:var(--text-secondary);cursor:pointer'>Cancelar</button>" +
            "<button id='_btnConfirmarQtde' style='background:var(--accent-success);border:none;border-radius:6px;padding:.4rem 1rem;color:#fff;cursor:pointer;font-weight:600'>Confirmar</button>" +
            "</div></div>";
        document.body.appendChild(overlay);
        document.getElementById("_btnConfirmarQtde").onclick = function() {
            var qtdeAtendida = parseInt(document.getElementById("_qtdeAtendidaInp").value, 10) || qtdeSol;
            overlay.remove();
            _persistirTransicao(itemId, deStatus, paraStatus, "");
            if (qtdeAtendida < qtdeSol && typeof DemandaDB !== "undefined" && DemandaDB.splitItem) {
                var faltante = qtdeSol - qtdeAtendida;
                DemandaDB.splitItem(_demandaAtual.id, itemId, qtdeAtendida, faltante)
                    .then(function() {
                        _toast(qtdeAtendida + " atendidos; " + faltante + " retornam como nova demanda.", "info");
                        abrirDemanda(_demandaAtual.id);
                    })
                    .catch(function(e) { _toast("Erro no split: " + e.message, "error"); });
            }
        };
    }

    // ════════════════════════════════════════════════════════
    // DEVOLUTIVA DE COMPRAS
    // ════════════════════════════════════════════════════════

    function _abrirDevolutivaCompras(itemId, demandaId) {
        var old = document.getElementById("overlayDevolutiva"); if (old) old.remove();
        var overlay = document.createElement("div");
        overlay.id = "overlayDevolutiva";
        overlay.style.cssText = "position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center";
        var fi = function(lbl, id, type, ph) {
            return "<div><label style='font-size:.78rem;color:var(--text-secondary);display:block;margin-bottom:.25rem'>" + lbl + "</label>" +
                "<input id='" + id + "' type='" + type + "' placeholder='" + ph + "' " +
                "style='width:100%;background:var(--bg-dark);border:1px solid var(--border);border-radius:6px;padding:.4rem .65rem;color:var(--text-primary);box-sizing:border-box'></div>";
        };
        overlay.innerHTML =
            "<div style='background:var(--bg-sidebar);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.5rem;width:400px;max-width:90vw;max-height:90vh;overflow-y:auto'>" +
            "<h4 style='margin:0 0 1rem;display:flex;align-items:center;gap:.5rem'>" +
            "<span class='material-icons-round' style='color:var(--accent-primary)'>local_shipping</span>Devolutiva de Compras</h4>" +
            "<div style='display:grid;gap:.6rem'>" +
            fi("Fornecedor *", "_devFornecedor", "text", "Ex: Rolamentos Irm\u00e3os") +
            fi("Marca / Fabricante", "_devMarca", "text", "Ex: SKF, NSK, FAG") +
            fi("Custo unit\u00e1rio (R$)", "_devCusto", "number", "0.00") +
            fi("Qtde dispon\u00edvel", "_devQtde", "number", "1") +
            fi("Prazo estimado (dias)", "_devPrazo", "number", "7") +
            fi("Observa\u00e7\u00e3o", "_devObs", "text", "Opcional") +
            "</div>" +
            "<div style='display:flex;gap:.5rem;justify-content:flex-end;margin-top:1rem'>" +
            "<button onclick=\"document.getElementById('overlayDevolutiva').remove()\" " +
            "style='background:var(--bg-dark);border:1px solid var(--border);border-radius:6px;padding:.4rem .9rem;color:var(--text-secondary);cursor:pointer'>Cancelar</button>" +
            "<button onclick=\"DemandaApp._confirmarDevolutiva('" + itemId + "','" + demandaId + "')\" " +
            "style='background:var(--accent-primary);border:none;border-radius:6px;padding:.4rem 1rem;color:#fff;cursor:pointer;font-weight:600'>Confirmar</button>" +
            "</div></div>";
        document.body.appendChild(overlay);
    }

    function _confirmarDevolutiva(itemId, demandaId) {
        var g = function(id) { return (document.getElementById(id) || {}).value || ""; };
        var fornecedor = g("_devFornecedor");
        if (!fornecedor) { _toast("Informe o fornecedor.", "warning"); return; }
        var por = _sessao ? (_sessao.login || _sessao.nome || "sistema") : "sistema";
        var fields = {
            compraFornecedor: fornecedor, compraMarca: g("_devMarca"),
            compraCusto: parseFloat(g("_devCusto")) || 0,
            compraQtde:  parseInt(g("_devQtde"), 10) || 1,
            compraPrazo: parseInt(g("_devPrazo"), 10) || 0,
            status: "cotacao_fornecedor"
        };
        var tl = { evento: "devolutiva_compras", para: "cotacao_fornecedor", por: por,
            obs: "Forn.: " + fornecedor + (g("_devObs") ? " \u2014 " + g("_devObs") : "") };
        DemandaDB.updateItem(demandaId, itemId, fields, tl)
            .then(function() {
                var el = document.getElementById("overlayDevolutiva"); if (el) el.remove();
                _toast("Devolutiva registrada: " + fornecedor, "success");
                loadFilaCompras();
            })
            .catch(function(err) { _toast("Erro: " + (err.message || err), "error"); });
    }

    // ════════════════════════════════════════════════════════
    // VIEW: OR\u00c7AMENTO B\u00c1SICO
    // ════════════════════════════════════════════════════════

    function loadOrcamento() {
        var container = document.getElementById("orcamentoContainer");
        if (!container) return;
        container.innerHTML = "<div style='padding:3rem;text-align:center;color:var(--text-secondary)'>" +
            "<span class='material-icons-round' style='font-size:2rem;animation:spin 1s linear infinite'>sync</span>" +
            "<p style='margin-top:.5rem;font-size:.85rem'>Carregando or\u00e7amentos...</p></div>";
        if (typeof DemandaDB === "undefined") { container.innerHTML = "<p style='padding:2rem;color:var(--accent-danger)'>DemandaDB indispon\u00edvel.</p>"; return; }
        var STATUS_ORC = ["proposta_enviada", "aguardando_cliente", "venda_aprovada"];
        DemandaDB.listDemandas({ status: "todas", limit: 60 })
            .then(function(demandas) {
                return Promise.all(demandas.map(function(d) {
                    return DemandaDB.getItens(d.id).then(function(itens) { return { demanda: d, itens: itens }; });
                }));
            })
            .then(function(todos) {
                var comItens = todos.filter(function(t) {
                    return t.itens.some(function(i) { return STATUS_ORC.indexOf(i.status) >= 0; });
                });
                if (comItens.length === 0) {
                    container.innerHTML = "<div style='padding:3rem;text-align:center;color:var(--text-secondary)'>" +
                        "<span class='material-icons-round' style='font-size:2.5rem;opacity:.4'>description</span>" +
                        "<p style='margin-top:.75rem'>Nenhum item em or\u00e7amento.</p>" +
                        "<small>Itens em Proposta Enviada, Aguardando Cliente ou Venda Aprovada aparecem aqui.</small></div>";
                    return;
                }
                var html = comItens.map(function(t) {
                    var d = t.demanda;
                    var itensOrc = t.itens.filter(function(i) { return STATUS_ORC.indexOf(i.status) >= 0; });
                    var total = itensOrc.reduce(function(acc, i) { return acc + ((i.preco || 0) * (i.qtdeSolicitada || 1)); }, 0);
                    var dt = d.criadoEm && d.criadoEm.toDate ? d.criadoEm.toDate().toLocaleDateString("pt-BR") : "\u2014";
                    var rows = itensOrc.map(function(item) {
                        var sc = (typeof DemandaStates !== "undefined") ? DemandaStates.get(item.status) : { label: item.status, color: "#6366f1" };
                        var btnAprovar = item.status !== "venda_aprovada"
                            ? "<button onclick=\"DemandaApp._aprovarItemOrcamento('" + d.id + "','" + item.id + "')\" " +
                              "style='background:var(--accent-success);color:#fff;border:none;border-radius:4px;padding:.2rem .55rem;font-size:.72rem;cursor:pointer;margin-right:.3rem'>Aprovar</button>" : "";
                        var btnPerder = "<button onclick=\"DemandaApp._perderItemOrcamento('" + d.id + "','" + item.id + "','" + item.status + "')\" " +
                            "style='background:var(--accent-danger);color:#fff;border:none;border-radius:4px;padding:.2rem .55rem;font-size:.72rem;cursor:pointer'>Perder</button>";
                        return "<tr style='border-bottom:1px solid rgba(255,255,255,.04)'>" +
                            "<td style='padding:.38rem .5rem;font-weight:600;font-size:.8rem'>" + _esc(item.refOriginal || item.erpProdutoId || "\u2014") + "</td>" +
                            "<td style='padding:.38rem .5rem;color:var(--text-secondary);font-size:.78rem;max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>" + _esc(item.descOriginal || item.erpProdutoDesc || "\u2014") + "</td>" +
                            "<td style='padding:.38rem .5rem;text-align:center'>" + (item.qtdeSolicitada || 1) + "</td>" +
                            "<td style='padding:.38rem .5rem'><span style='font-size:.7rem;padding:.12rem .45rem;border-radius:8px;background:" + sc.color + "22;color:" + sc.color + "'>" + _esc(sc.label) + "</span></td>" +
                            "<td style='padding:.38rem .5rem'>" + (item.preco ? "R$ " + Number(item.preco).toFixed(2).replace(".",",") : "\u2014") + "</td>" +
                            "<td style='padding:.38rem .5rem'>" + btnAprovar + btnPerder + "</td></tr>";
                    }).join("");
                    return "<div style='background:var(--bg-sidebar);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:1.25rem;margin-bottom:1rem'>" +
                        "<div style='display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.75rem;flex-wrap:wrap;gap:.5rem'>" +
                        "<div><div style='font-weight:700;font-size:.95rem'>" + _esc(d.codigo) + "</div>" +
                        "<div style='font-size:.8rem;color:var(--text-secondary)'>" + _esc(d.clienteNome || "\u2014") + " \u00b7 " + dt + "</div></div>" +
                        (total > 0 ? "<div style='text-align:right'><div style='font-size:.7rem;color:var(--text-secondary)'>Total estimado</div>" +
                            "<div style='font-weight:700;color:var(--accent-success)'>R$ " + total.toFixed(2).replace(".",",") + "</div></div>" : "") + "</div>" +
                        "<div style='overflow-x:auto'><table style='width:100%;border-collapse:collapse;font-size:.8rem'>" +
                        "<thead><tr style='border-bottom:1px solid var(--border-color)'>" +
                        ["Refer\u00eancia","Descri\u00e7\u00e3o","Qtd","Status","Pre\u00e7o","A\u00e7\u00e3o"].map(function(h) {
                            return "<th style='padding:.35rem .5rem;text-align:left;color:var(--text-secondary);font-size:.7rem;font-weight:600;text-transform:uppercase'>" + h + "</th>";
                        }).join("") + "</tr></thead><tbody>" + rows + "</tbody></table></div>" +
                        "<div style='margin-top:.75rem;text-align:right'>" +
                        "<button onclick='window.print()' style='background:var(--bg-dark);border:1px solid var(--border-color);border-radius:6px;padding:.3rem .8rem;color:var(--text-secondary);cursor:pointer;font-size:.78rem'>" +
                        "<span class='material-icons-round' style='font-size:.9rem;vertical-align:middle'>print</span> Imprimir</button></div></div>";
                }).join("");
                container.innerHTML = html;
            })
            .catch(function(err) { container.innerHTML = "<p style='padding:2rem;color:var(--accent-danger)'>Erro: " + _esc(err.message || String(err)) + "</p>"; });
    }

    function _aprovarItemOrcamento(demandaId, itemId) {
        var por = _sessao ? (_sessao.login || _sessao.nome || "sistema") : "sistema";
        DemandaDB.updateItem(demandaId, itemId, { status: "venda_aprovada" },
            { evento: "status_changed", para: "venda_aprovada", por: por, obs: "Aprovado no or\u00e7amento" })
            .then(function() { _toast("Venda aprovada!", "success"); loadOrcamento(); })
            .catch(function(e) { _toast("Erro: " + e.message, "error"); });
    }

    function _perderItemOrcamento(demandaId, itemId, deStatus) {
        _demandaAtual = { id: demandaId, data: {}, itens: [{ id: itemId, status: deStatus }] };
        _confirmarVendaPerdida(itemId, deStatus);
    }

    // ════════════════════════════════════════════════════════
    // VIEW: COTAÇÃO DO CONCORRENTE
    // ════════════════════════════════════════════════════════

    var _concItens = [];
    var _CONC_INP  = "width:100%;background:var(--bg-dark);border:1px solid var(--border-color);border-radius:5px;padding:.3rem .55rem;color:var(--text-primary);font-size:.8rem;box-sizing:border-box";

    function _concDB() {
        if (typeof firebase === "undefined" || typeof DemandaDB === "undefined") return null;
        return firebase.firestore().collection("tenants").doc(DemandaDB.TENANT_ID).collection("cotacoes_concorrente");
    }

    function loadConcorrente() {
        if (_concItens.length === 0) _concAddItem();
        _renderConcorrenteForm();
        _loadHistoricoConcorrente();
    }

    function _renderConcorrenteForm() {
        var fc = document.getElementById("concFormContainer");
        if (!fc) return;
        fc.innerHTML =
            "<div style='background:var(--bg-sidebar);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:1.25rem'>" +
            "<h3 style='margin:0 0 1rem;font-size:.95rem;display:flex;align-items:center;gap:.5rem'>" +
            "<span class='material-icons-round' style='color:#f59e0b'>trending_up</span>Nova Cota\u00e7\u00e3o do Concorrente</h3>" +
            "<div style='display:grid;grid-template-columns:1fr 1fr 1fr;gap:.75rem;margin-bottom:.75rem'>" +
            _concField("concNome", "Concorrente *", "text", "Ex: Distribuidora ABC", "list='concNomeSugestoes'") +
            _concField("concCliente", "Cliente (refer\u00eancia)", "text", "Quem trouxe a cota\u00e7\u00e3o", "") +
            _concField("concObs", "Observa\u00e7\u00e3o", "text", "Contexto opcional", "") +
            "</div>" +
            "<datalist id='concNomeSugestoes'></datalist>" +
            "<div style='overflow-x:auto;margin-bottom:.75rem'>" +
            "<table style='width:100%;border-collapse:collapse;font-size:.8rem'>" +
            "<thead><tr style='border-bottom:1px solid var(--border-color)'>" +
            ["#","Refer\u00eancia","Descri\u00e7\u00e3o","Qtde","Pre\u00e7o Concorrente","Pre\u00e7o Nosso","Diferen\u00e7a",""].map(function(h) {
                return "<th style='padding:.35rem .4rem;text-align:left;color:var(--text-secondary);font-size:.7rem;font-weight:600;text-transform:uppercase;white-space:nowrap'>" + h + "</th>";
            }).join("") +
            "</tr></thead>" +
            "<tbody id='concTbody'></tbody>" +
            "</table></div>" +
            "<div style='display:flex;gap:.5rem;align-items:center;flex-wrap:wrap'>" +
            "<button onclick='DemandaApp._concAddItem()' style='background:transparent;border:1px dashed var(--border-color);border-radius:6px;padding:.3rem .75rem;color:var(--text-secondary);cursor:pointer;font-size:.8rem'>" +
            "<span class='material-icons-round' style='font-size:.9rem;vertical-align:middle'>add</span> Adicionar item</button>" +
            "<button onclick='DemandaApp._salvarCotacaoConcorrente()' style='margin-left:auto;background:var(--accent-primary);color:#fff;border:none;border-radius:6px;padding:.4rem 1.1rem;font-size:.85rem;cursor:pointer;font-weight:600'>" +
            "<span class='material-icons-round' style='font-size:.9rem;vertical-align:middle'>save</span> Salvar Cota\u00e7\u00e3o</button>" +
            "</div></div>";
        _renderConcTbody();
        _populateConcSugestoes();
    }

    function _concField(id, label, type, ph, extra) {
        return "<div><label style='font-size:.78rem;color:var(--text-secondary);display:block;margin-bottom:.3rem'>" + label + "</label>" +
            "<input id='" + id + "' type='" + type + "' placeholder='" + ph + "' " + (extra||'') + " style='" + _CONC_INP + "'></div>";
    }

    function _renderConcTbody() {
        var tbody = document.getElementById("concTbody");
        if (!tbody) return;
        tbody.innerHTML = _concItens.map(function(item, i) {
            var pc  = parseFloat(item.precoConcorrente) || 0;
            var pm  = parseFloat(item.precoMeu) || 0;
            var d   = (pc && pm) ? (pm - pc) : null;
            var pct = (pc && d !== null) ? ((d / pc) * 100).toFixed(1) : null;
            var cor = d !== null ? (d > 0 ? "#10b981" : d < 0 ? "#ef4444" : "var(--text-secondary)") : "var(--text-secondary)";
            var dTxt = d !== null
                ? "R$ " + d.toFixed(2).replace(".",",") + (pct ? " <span style='font-size:.7rem;opacity:.8'>(" + (d>0?"+":"") + pct + "%)</span>" : "")
                : "\u2014";
            return "<tr style='border-bottom:1px solid rgba(255,255,255,.04)'>" +
                "<td style='padding:.3rem .4rem;color:var(--text-secondary);font-size:.72rem'>" + (i+1) + "</td>" +
                "<td style='padding:.3rem .4rem'><input value='" + _escAttr(item.ref||'') + "' oninput=\"DemandaApp._concUpdateItem(" + i + ",'ref',this.value)\" placeholder='Ref.' style='" + _CONC_INP + "min-width:90px'></td>" +
                "<td style='padding:.3rem .4rem'><input value='" + _escAttr(item.desc||'') + "' oninput=\"DemandaApp._concUpdateItem(" + i + ",'desc',this.value)\" placeholder='Descri\u00e7\u00e3o' style='" + _CONC_INP + "min-width:140px'></td>" +
                "<td style='padding:.3rem .4rem'><input type='number' min='1' value='" + (item.qtde||1) + "' oninput=\"DemandaApp._concUpdateItem(" + i + ",'qtde',this.value)\" style='" + _CONC_INP + "width:55px;text-align:center'></td>" +
                "<td style='padding:.3rem .4rem'><input type='number' step='0.01' min='0' value='" + (item.precoConcorrente||'') + "' oninput=\"DemandaApp._concUpdateItem(" + i + ",'precoConcorrente',this.value)\" placeholder='0,00' style='" + _CONC_INP + "width:90px'></td>" +
                "<td style='padding:.3rem .4rem'><input type='number' step='0.01' min='0' value='" + (item.precoMeu||'') + "' oninput=\"DemandaApp._concUpdateItem(" + i + ",'precoMeu',this.value)\" placeholder='0,00' style='" + _CONC_INP + "width:90px'></td>" +
                "<td style='padding:.3rem .4rem;font-size:.78rem;font-weight:700;color:" + cor + ";white-space:nowrap'>" + dTxt + "</td>" +
                "<td style='padding:.3rem .4rem'><button onclick=\"DemandaApp._concRemoveItem(" + i + ")\" style='background:transparent;border:none;color:var(--accent-danger);cursor:pointer;padding:.1rem'><span class='material-icons-round' style='font-size:1rem'>close</span></button></td>" +
                "</tr>";
        }).join("");
    }

    function _escAttr(str) {
        if (!str) return "";
        return String(str).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    }

    function _concAddItem() {
        _concItens.push({ id: Date.now(), ref:"", desc:"", qtde:1, precoConcorrente:"", precoMeu:"" });
        _renderConcTbody();
    }

    function _concRemoveItem(idx) {
        _concItens.splice(idx, 1);
        if (_concItens.length === 0) _concAddItem();
        else _renderConcTbody();
    }

    function _concUpdateItem(idx, field, value) {
        if (!_concItens[idx]) return;
        _concItens[idx][field] = value;
        // Atualiza somente a coluna diferença sem re-renderizar tudo
        var tbody = document.getElementById("concTbody");
        if (tbody) _renderConcTbody();
    }

    function _salvarCotacaoConcorrente() {
        var db = _concDB();
        if (!db) { _toast("Firebase n\u00e3o dispon\u00edvel.", "error"); return; }
        var concNome = (document.getElementById("concNome") || {}).value || "";
        if (!concNome.trim()) { _toast("Informe o nome do concorrente.", "warning"); return; }
        var itens = _concItens.filter(function(it) { return it.ref || it.desc; });
        if (itens.length === 0) { _toast("Adicione ao menos um item.", "warning"); return; }
        var por = _sessao ? (_sessao.login || _sessao.nome || "sistema") : "sistema";
        var doc = {
            concorrente:  concNome.trim(),
            clienteRef:   (document.getElementById("concCliente") || {}).value || "",
            obs:          (document.getElementById("concObs") || {}).value || "",
            vendedorNome: por,
            criadoEm:     firebase.firestore.FieldValue.serverTimestamp(),
            status:       "ativa",
            itens:        itens.map(function(it) {
                return { id: String(it.id), ref: it.ref||'', desc: it.desc||'',
                    qtde: parseFloat(it.qtde)||1,
                    precoConcorrente: parseFloat(it.precoConcorrente)||0,
                    precoMeu:         parseFloat(it.precoMeu)||0 };
            })
        };
        db.add(doc)
            .then(function(ref) {
                return ref.update({ id: ref.id });
            })
            .then(function() {
                _toast("Cota\u00e7\u00e3o de " + concNome + " salva!", "success");
                _concItens = [];
                _concAddItem();
                _renderConcorrenteForm();
                _loadHistoricoConcorrente();
            })
            .catch(function(e) { _toast("Erro ao salvar: " + (e.message||e), "error"); });
    }

    function _loadHistoricoConcorrente() {
        var hc = document.getElementById("concHistoricoContainer");
        if (!hc) return;
        hc.innerHTML = "<div style='text-align:center;padding:1.5rem;color:var(--text-secondary)'>" +
            "<span class='material-icons-round' style='animation:spin 1s linear infinite'>sync</span></div>";
        var db = _concDB();
        if (!db) { hc.innerHTML = "<p style='color:var(--accent-danger);font-size:.83rem'>Firebase n\u00e3o dispon\u00edvel.</p>"; return; }
        db.where("status","==","ativa").orderBy("criadoEm","desc").limit(40).get()
            .then(function(snap) { _renderHistoricoConcorrente(snap.docs.map(function(d){return d.data();})); })
            .catch(function(err) {
                hc.innerHTML = "<p style='color:var(--accent-danger);font-size:.83rem'>Erro: " + _esc(err.message||String(err)) + "</p>";
            });
    }

    function _renderHistoricoConcorrente(cotacoes) {
        var hc = document.getElementById("concHistoricoContainer");
        if (!hc) return;
        if (cotacoes.length === 0) {
            hc.innerHTML = "<div style='text-align:center;padding:2rem;color:var(--text-secondary)'>" +
                "<span class='material-icons-round' style='font-size:2rem;opacity:.4'>trending_up</span>" +
                "<p style='margin-top:.5rem;font-size:.85rem'>Nenhuma cota\u00e7\u00e3o registrada ainda.</p></div>";
            return;
        }
        var header = "<div style='display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem'>" +
            "<h3 style='margin:0;font-size:.88rem;color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:.04em'>Hist\u00f3rico (" + cotacoes.length + ") cota\u00e7\u00f5es</h3>" +
            "<button onclick='DemandaApp._loadHistoricoConcorrente()' title='Atualizar' style='background:transparent;border:none;color:var(--accent-primary);cursor:pointer'>" +
            "<span class='material-icons-round' style='font-size:1rem'>refresh</span></button></div>";
        var cards = cotacoes.map(function(c) {
            var dt = c.criadoEm && c.criadoEm.toDate
                ? c.criadoEm.toDate().toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"})
                : "\u2014";
            var itens = c.itens || [];
            var totalC = itens.reduce(function(a,it){return a+((it.precoConcorrente||0)*(it.qtde||1));},0);
            var totalM = itens.reduce(function(a,it){return a+((it.precoMeu||0)*(it.qtde||1));},0);
            var diff   = totalM - totalC;
            var bCor   = diff > 0 ? "#ef4444" : diff < 0 ? "#10b981" : "#6366f1";
            var bTxt   = (totalC && totalM) ? (diff > 0 ? "Concorrente mais barato" : diff < 0 ? "N\u00f3s somos mais baratos" : "Mesmo pre\u00e7o") : "";
            var rows = itens.map(function(it,i) {
                var pc = it.precoConcorrente||0; var pm = it.precoMeu||0;
                var d  = (pc && pm) ? (pm - pc) : null;
                var pct= (pc && d!==null) ? ((d/pc)*100).toFixed(1) : null;
                var cor= d!==null ? (d>0?"#10b981":d<0?"#ef4444":"var(--text-secondary)") : "var(--text-secondary)";
                return "<tr style='border-bottom:1px solid rgba(255,255,255,.04)'>" +
                    "<td style='padding:.28rem .5rem;font-size:.72rem;color:var(--text-secondary)'>" + (i+1) + "</td>" +
                    "<td style='padding:.28rem .5rem;font-weight:600;font-size:.8rem'>" + _esc(it.ref||"\u2014") + "</td>" +
                    "<td style='padding:.28rem .5rem;font-size:.78rem;color:var(--text-secondary);max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'>" + _esc(it.desc||"\u2014") + "</td>" +
                    "<td style='padding:.28rem .5rem;text-align:center;font-size:.8rem'>" + (it.qtde||1) + "</td>" +
                    "<td style='padding:.28rem .5rem;font-size:.8rem'>" + (pc?"R$ "+pc.toFixed(2).replace(".",","):"\u2014") + "</td>" +
                    "<td style='padding:.28rem .5rem;font-size:.8rem'>" + (pm?"R$ "+pm.toFixed(2).replace(".",","):"\u2014") + "</td>" +
                    "<td style='padding:.28rem .5rem;font-size:.78rem;font-weight:700;color:"+cor+"'>" +
                        (d!==null?"R$ "+d.toFixed(2).replace(".",",")+(pct?" ("+(d>0?"+":"")+pct+"%)":""):"\u2014")+
                    "</td></tr>";
            }).join("");
            var cid = _esc(c.id||"");
            return "<div style='background:var(--bg-sidebar);border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:1.1rem;margin-bottom:.75rem'>" +
                "<div style='display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem;cursor:pointer' onclick=\"DemandaApp._toggleConcCard('" + cid + "')\">" +
                "<div><div style='font-weight:700;font-size:.93rem;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap'>" +
                "<span class='material-icons-round' style='font-size:1rem;color:#f59e0b'>trending_up</span>" + _esc(c.concorrente) +
                (bTxt?"<span style='font-size:.68rem;padding:.12rem .4rem;border-radius:6px;background:"+bCor+"22;color:"+bCor+"'>"+bTxt+"</span>":"") +
                "</div><div style='font-size:.77rem;color:var(--text-secondary);margin-top:.2rem'>" + dt +
                (c.clienteRef?" \u00b7 "+_esc(c.clienteRef):"") + " \u00b7 " + _esc(c.vendedorNome||"") + "</div></div>" +
                "<div style='display:flex;align-items:center;gap:.75rem'>" +
                (totalC?"<div style='text-align:right'><div style='font-size:.68rem;color:var(--text-secondary)'>Total concorrente</div><div style='font-weight:700;font-size:.88rem'>R$ "+totalC.toFixed(2).replace(".",",")+"</div></div>":"") +
                "<span class='material-icons-round' id='concCardIcon_"+cid+"' style='color:var(--text-secondary);font-size:1.1rem'>expand_more</span>" +
                "</div></div>" +
                "<div id='concCardBody_"+cid+"' style='display:none;margin-top:.75rem'>" +
                (c.obs?"<div style='font-size:.78rem;color:var(--text-secondary);margin-bottom:.5rem;font-style:italic'>"+_esc(c.obs)+"</div>":"") +
                "<div style='overflow-x:auto'><table style='width:100%;border-collapse:collapse;font-size:.8rem'>" +
                "<thead><tr style='border-bottom:1px solid var(--border-color)'>" +
                ["#","Ref.","Descri\u00e7\u00e3o","Qtde","Pre\u00e7o Concorrente","Pre\u00e7o Nosso","Diferen\u00e7a"].map(function(h){
                    return "<th style='padding:.28rem .5rem;text-align:left;color:var(--text-secondary);font-size:.7rem;font-weight:600;text-transform:uppercase'>" + h + "</th>";
                }).join("") + "</tr></thead><tbody>" + rows + "</tbody></table></div>" +
                "<div style='margin-top:.75rem;text-align:right'>" +
                "<button onclick=\"DemandaApp._arquivarCotacaoConcorrente('" + cid + "')\" style='background:transparent;border:1px solid var(--border-color);border-radius:6px;padding:.25rem .65rem;color:var(--text-secondary);cursor:pointer;font-size:.75rem'>Arquivar</button>" +
                "</div></div></div>";
        }).join("");
        hc.innerHTML = header + cards;
    }

    function _toggleConcCard(id) {
        var body = document.getElementById("concCardBody_" + id);
        var icon = document.getElementById("concCardIcon_" + id);
        if (!body) return;
        var open = body.style.display !== "none";
        body.style.display = open ? "none" : "";
        if (icon) icon.textContent = open ? "expand_more" : "expand_less";
    }

    function _arquivarCotacaoConcorrente(id) {
        if (!id || !confirm("Arquivar esta cota\u00e7\u00e3o do concorrente?")) return;
        var db = _concDB();
        if (!db) return;
        db.doc(id).update({ status: "arquivada" })
            .then(function() { _toast("Cota\u00e7\u00e3o arquivada.", "info"); _loadHistoricoConcorrente(); })
            .catch(function(e) { _toast("Erro: " + e.message, "error"); });
    }

    function _populateConcSugestoes() {
        var dl = document.getElementById("concNomeSugestoes");
        if (!dl) return;
        var db = _concDB(); if (!db) return;
        db.orderBy("criadoEm","desc").limit(30).get()
            .then(function(snap) {
                var nomes = snap.docs.map(function(d){return d.data().concorrente;}).filter(Boolean);
                var uniq  = nomes.filter(function(v,i,a){return a.indexOf(v)===i;});
                dl.innerHTML = uniq.map(function(n){return "<option value='" + _escAttr(n) + "'>";}).join("");
            }).catch(function(){});
    }

    // ════════════════════════════════════════════════════════
    // TOAST / NOTIFICAÇÕES
    // ════════════════════════════════════════════════════════

    function _toast(msg, type) {
        var COLORS = { success: "#10b981", error: "#ef4444", info: "#3b82f6", warning: "#f59e0b" };
        var ICONS  = { success: "check_circle", error: "error", info: "info", warning: "warning" };
        var cor    = COLORS[type] || COLORS.info;
        var icon   = ICONS[type]  || "info";
        var el = document.createElement("div");
        el.style.cssText =
            "position:fixed;bottom:80px;right:1.5rem;z-index:99999;" +
            "background:var(--bg-sidebar);border:1px solid " + cor + ";" +
            "color:var(--text-primary);padding:.7rem 1.1rem;border-radius:var(--radius-lg);" +
            "display:flex;align-items:center;gap:.6rem;font-size:.85rem;font-weight:500;" +
            "box-shadow:0 8px 24px rgba(0,0,0,.4);transition:opacity .35s;max-width:360px;";
        el.innerHTML =
            "<span class='material-icons-round' style='color:" + cor + ";font-size:1.1rem;flex-shrink:0'>" + icon + "</span>" +
            "<span>" + _esc(msg) + "</span>";
        document.body.appendChild(el);
        setTimeout(function() {
            el.style.opacity = "0";
            setTimeout(function() { el.remove(); }, 350);
        }, 3200);
    }

    // ════════════════════════════════════════════════════════
    // UTILITÁRIOS
    // ════════════════════════════════════════════════════════

    function _esc(str) {
        if (!str && str !== 0) return "";
        return String(str)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    // ════════════════════════════════════════════════════════
    // AUTH / SIDEBAR
    // ════════════════════════════════════════════════════════

    function _updateUser(s) {
        var n = (s && (s.nome || s.name || s.email)) || "Usuario";
        var f = (s && (s.filial || s.tenantNome || s.empresa)) || "Plataforma";
        var r = (s && s.role) || "";
        var en = document.getElementById("sidebarUserName"); if (en) en.textContent = n;
        var ef = document.getElementById("sidebarFilial");   if (ef) ef.textContent = f;
        var er = document.getElementById("sidebarRole");     if (er) er.textContent = r || f;
        var ea = document.getElementById("sidebarAvatarLetter"); if (ea) ea.textContent = n.charAt(0).toUpperCase();
    }

    function logout() {
        if (typeof ParreiraAuth !== "undefined" && ParreiraAuth.logout) { ParreiraAuth.logout(); }
        else { window.location.href = "/platform/index.html"; }
    }

    // ════════════════════════════════════════════════════════
    // BOOTSTRAP
    // ════════════════════════════════════════════════════════

    function init() {
        console.log("[DemandaApp] Inicializando v1.1.0...");

        // Guard de autenticação
        if (typeof ParreiraAuth !== "undefined") {
            if (!ParreiraAuth.isLogado()) {
                // ✅ Redireciona para login.html com module=demanda e redirect correto
                // (antes ia para index.html do portal, que perdia o contexto e abria o despacho)
                var destPath = encodeURIComponent("modules/demanda/index.html");
                window.location.href = "/platform/login.html?module=demanda&redirect=" + destPath;
                return;
            }
            try {
                _sessao = ParreiraAuth.getSessao ? ParreiraAuth.getSessao() : null;
                var mods   = (_sessao && _sessao.modulos) ? _sessao.modulos : [];
                var role   = _sessao ? (_sessao.role || "") : "";
                var tenant = _sessao ? (_sessao.tenantId || "") : "";
                // Admin/master sempre têm acesso a todos os módulos
                var isAdmin = (role === "admin" || role === "master");
                // Tenant centralpecas tem acesso ao módulo (configuração pendente no Firestore)
                var isCentralPecas = (tenant === "centralpecas");
                if (!isAdmin && !isCentralPecas && mods.length > 0 && mods.indexOf("demanda") === -1) {
                    alert("Voce nao tem acesso ao modulo Inteligencia de Demanda.\nContate o administrador.");
                    history.back(); return;
                }
            } catch(e) { console.warn("[DemandaApp] Erro ao verificar modulos:", e); }
        }

        // Preenche sidebar
        try { _updateUser(_sessao || { nome: "Demo", filial: "Demo" }); } catch(e) {}

        // Versão no footer
        fetch("version.json?v=" + Date.now())
            .then(function(r) { return r.json(); })
            .then(function(d) {
                var el = document.getElementById("demandaFooterVersion");
                if (el) el.textContent = "v" + (d.version || "1.1.0");
            })
            .catch(function() {});

        // Fecha dropdown de cliente ao clicar fora
        document.addEventListener("click", function(ev) {
            var dd  = document.getElementById("clienteDropdown");
            var btn = document.getElementById("btnSelectCliente");
            if (!dd || dd.style.display !== "block") return;
            if (btn && (ev.target === btn || btn.contains(ev.target))) return;
            if (!dd.contains(ev.target)) dd.style.display = "none";
        });

        // Exibe shell e vai para captura
        var sh = document.getElementById("appShell");
        if (sh) sh.style.display = "flex";
        switchView("captura");
        console.log("[DemandaApp] Pronto v1.1.0.");
    }

    // ════════════════════════════════════════════════════════
    // API PÚBLICA
    // ════════════════════════════════════════════════════════

    return {
        init:                   init,
        logout:                 logout,
        switchView:             switchView,
        // Pesquisa
        onSearchInput:          onSearchInput,
        clearSearch:            clearSearch,
        selectSearchResult:     selectSearchResult,
        // Importação
        openImportModal:        openImportModal,
        closeModal:             closeModal,
        addItemFromDetails:     addItemFromDetails,
        processImportTexto:     processImportTexto,
        // Import PDF
        _abrirImportPDF:        _abrirImportPDF,
        _fecharImportPDF:       _fecharImportPDF,
        _copiarDoPDF:           _copiarDoPDF,
        // Import Foto
        _abrirImportFoto:       _abrirImportFoto,
        _fecharImportFoto:      _fecharImportFoto,
        _processarFotoTranscricao: _processarFotoTranscricao,
        onExcelDrop:            onExcelDrop,
        onExcelFileSelected:    onExcelFileSelected,
        confirmExcelImport:     confirmExcelImport,
        updateConferenciaItem:  updateConferenciaItem,
        selectAllConferencia:   selectAllConferencia,
        toggleAllConferencia:   toggleAllConferencia,
        confirmConferencia:     confirmConferencia,
        // Grade de entrada
        addItemGrade:           addItemGrade,
        onGradeKeydown:         onGradeKeydown,
        removeItem:             removeItem,
        renderItens:            renderItens,
        limparDemanda:          limparDemanda,
        // Salvar
        salvarDemanda:          salvarDemanda,
        // Cliente
        toggleClienteDropdown:  toggleClienteDropdown,
        searchCliente:          searchCliente,
        selectClienteIdx:       selectClienteIdx,
        // Lista
        filterDemandas:         filterDemandas,
        loadDemandasLista:      loadDemandasLista,
        abrirDemanda:           abrirDemanda,
        avancarItemStatus:      avancarItemStatus,
        toggleItemTimeline:     toggleItemTimeline,
        // Dashboard e Compras
        loadDashboard:          loadDashboard,
        loadFilaCompras:        loadFilaCompras,
        avancarItemFilaCompras: avancarItemFilaCompras,
        // Orçamento
        loadOrcamento:          loadOrcamento,
        _aprovarItemOrcamento:  _aprovarItemOrcamento,
        _perderItemOrcamento:   _perderItemOrcamento,
        // Busca ERP
        _abrirBuscaERP:         _abrirBuscaERP,
        _fecharBuscaERP:        _fecharBuscaERP,
        _executarBuscaERP:      _executarBuscaERP,
        _vincularProduto:       _vincularProduto,
        // Devolutiva Compras
        _abrirDevolutivaCompras:  _abrirDevolutivaCompras,
        _confirmarDevolutiva:     _confirmarDevolutiva,
        // Cota\u00e7\u00e3o Concorrente
        loadConcorrente:              loadConcorrente,
        _concAddItem:                 _concAddItem,
        _concRemoveItem:              _concRemoveItem,
        _concUpdateItem:              _concUpdateItem,
        _salvarCotacaoConcorrente:    _salvarCotacaoConcorrente,
        _loadHistoricoConcorrente:    _loadHistoricoConcorrente,
        _toggleConcCard:              _toggleConcCard,
        _arquivarCotacaoConcorrente:  _arquivarCotacaoConcorrente
    };

})();

// ── Bootstrap: aguarda ParreiraAuth antes de inicializar ─────
document.addEventListener("DOMContentLoaded", function() {
    var attempts = 0;
    var t = setInterval(function() {
        attempts++;
        if (typeof ParreiraAuth !== "undefined") { clearInterval(t); DemandaApp.init(); return; }
        if (attempts >= 40) {
            clearInterval(t);
            console.warn("[DemandaApp] ParreiraAuth indisponivel — iniciando sem auth guard.");
            DemandaApp.init();
        }
    }, 100);
});
