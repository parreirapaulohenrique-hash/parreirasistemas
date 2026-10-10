import os, glob, re, sys
sys.stdout.reconfigure(encoding='utf-8')

wms_dir = r"z:\antigravity\scratch\platform\modules\wms"
coletor_dir = r"z:\antigravity\scratch\platform\modules\wms-coletor"

print("==========================================================================")
print("     VARREDURA E AUDITORIA COMPLETA DE FALHAS: WMS & WMS COLETOR         ")
print("==========================================================================")

# --- 1. AUDITORIA ESPECÍFICA DO RECEBIMENTO / BIPAGEM DE NF-E ---
print("\n>>> [1] DIAGNÓSTICO DO FLUXO DE RECEBIMENTO & BIPAGEM DE CHAVE NF-E <<<")

# Checar Coletor Inbound
coletor_inb_file = os.path.join(coletor_dir, "js", "coletor-inbound.js")
coletor_screens_file = os.path.join(coletor_dir, "js", "coletor-screens.js")
coletor_html_file = os.path.join(coletor_dir, "index.html")

with open(coletor_html_file, 'r', encoding='utf-8', errors='ignore') as f:
    c_html = f.read()

with open(coletor_inb_file, 'r', encoding='utf-8', errors='ignore') as f:
    c_inb = f.read()

# Procura campos de chave de NF no coletor
inb_inputs = re.findall(r'<input[^>]+id=["\']([^"\']+)["\'][^>]*>', c_html)
print(f"Inputs no index.html do Coletor: {inb_inputs}")

# Checar como o coletor lida com bipagem de 44 dígitos
print("\nVerificando detecção de 44 dígitos no Coletor:")
matches_44 = re.findall(r'.{0,60}44.{0,60}', c_inb)
for m in matches_44:
    print(f"  * {m.strip()}")

# Checar Desktop Inbound
desktop_inb_file = os.path.join(wms_dir, "js", "inbound.js")
desktop_ent_file = os.path.join(wms_dir, "js", "entrada.js")
desktop_proc_file = os.path.join(wms_dir, "js", "wms-procedures.js")
desktop_html_file = os.path.join(wms_dir, "index.html")

with open(desktop_inb_file, 'r', encoding='utf-8', errors='ignore') as f:
    d_inb = f.read()

with open(desktop_proc_file, 'r', encoding='utf-8', errors='ignore') as f:
    d_proc = f.read()

with open(desktop_html_file, 'r', encoding='utf-8', errors='ignore') as f:
    d_html = f.read()

print("\nVerificando captura de NF-e no WMS Desktop (inbound.js / wms-procedures.js):")
matches_d44 = re.findall(r'.{0,60}44.{0,60}', d_inb + d_proc)
for m in matches_d44[:5]:
    print(f"  * {m.strip()}")

# --- 2. AUDITORIA DE BOTÕES E ONCLICK (FUNÇÕES AUSENTES) ---
print("\n>>> [2] AUDITORIA DE BOTÕES E ONCLICK (DESKTOP & COLETOR) <<<")

# Carregar todo o código JS em memória
all_desktop_js = ""
for js_path in glob.glob(os.path.join(wms_dir, "**", "*.js"), recursive=True):
    with open(js_path, 'r', encoding='utf-8', errors='ignore') as f:
        all_desktop_js += f"\n// FILE: {js_path}\n" + f.read()

all_coletor_js = ""
for js_path in glob.glob(os.path.join(coletor_dir, "**", "*.js"), recursive=True):
    with open(js_path, 'r', encoding='utf-8', errors='ignore') as f:
        all_coletor_js += f"\n// FILE: {js_path}\n" + f.read()

# Extrair chamadas onclick do Desktop
d_onclicks = re.findall(r'onclick=["\']([^"\']+)["\']', d_html)
missing_d_funcs = set()
for click in d_onclicks:
    # extrair nome da funcao antes do (
    fn_match = re.search(r'([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)?)\s*\(', click)
    if fn_match:
        fn_name = fn_match.group(1)
        # ignora funcoes nativas ou de auth conhecidas
        if fn_name in ['alert', 'confirm', 'prompt', 'event.stopPropagation', 'console.log']:
            continue
        base_fn = fn_name.split('.')[-1]
        if base_fn not in all_desktop_js and fn_name not in all_desktop_js and base_fn not in d_html:
            missing_d_funcs.add((fn_name, click))

print(f"Total de onclicks no WMS Desktop: {len(d_onclicks)}")
if missing_d_funcs:
    print(f"  ALERTA: {len(missing_d_funcs)} funções chamadas em onclick NÃO foram encontradas no JS do Desktop:")
    for fn, clk in sorted(missing_d_funcs):
        print(f"    - Função '{fn}' chamada em: onclick=\"{clk}\"")
else:
    print("  -> OK: Todas as funções de onclick do Desktop possuem declaração no código JS!")

# Extrair chamadas onclick do Coletor
c_onclicks = re.findall(r'onclick=["\']([^"\']+)["\']', c_html)
missing_c_funcs = set()
for click in c_onclicks:
    fn_match = re.search(r'([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)?)\s*\(', click)
    if fn_match:
        fn_name = fn_match.group(1)
        if fn_name in ['alert', 'confirm', 'prompt', 'event.stopPropagation', 'console.log']:
            continue
        base_fn = fn_name.split('.')[-1]
        if base_fn not in all_coletor_js and fn_name not in all_coletor_js and base_fn not in c_html and base_fn not in all_desktop_js:
            missing_c_funcs.add((fn_name, click))

print(f"\nTotal de onclicks no WMS Coletor: {len(c_onclicks)}")
if missing_c_funcs:
    print(f"  ALERTA: {len(missing_c_funcs)} funções chamadas em onclick NÃO foram encontradas no Coletor:")
    for fn, clk in sorted(missing_c_funcs):
        print(f"    - Função '{fn}' chamada em: onclick=\"{clk}\"")
else:
    print("  -> OK: Todas as funções de onclick do Coletor possuem declaração no código JS!")

# --- 3. AUDITORIA DE VIEWS (SWITCHVIEW NO DESKTOP) ---
print("\n>>> [3] AUDITORIA DE TELAS (SWITCHVIEW NO WMS DESKTOP) <<<")
switch_views = set(re.findall(r'switchView\(["\']([^"\']+)["\']\)', d_html + all_desktop_js))
print(f"Total de rotas switchView chamadas no sistema: {len(switch_views)}")

# Verificar como switchView trata cada uma
with open(os.path.join(wms_dir, "js", "wms-core.js"), 'r', encoding='utf-8', errors='ignore') as f:
    wms_core = f.read()

unhandled_views = []
for sv in sorted(switch_views):
    # Checar se existe container no HTML ou tratamento no switchView
    has_div = f'id="view-{sv}"' in d_html or f"id='view-{sv}'" in d_html
    has_handler = f"'{sv}'" in wms_core or f'"{sv}"' in wms_core
    if not has_div and not has_handler:
        unhandled_views.append(sv)

if unhandled_views:
    print(f"  ALERTA: {len(unhandled_views)} views chamadas via switchView não possuem div direta nem handler no wms-core.js:")
    for uv in unhandled_views:
        print(f"    - View sem destino: '{uv}'")
else:
    print("  -> OK: Todas as rotas de switchView são tratadas ou possuem view-container!")

# --- 4. AUDITORIA DE IDs REFERENCIADOS NO JS MAS INEXISTENTES NO HTML ---
print("\n>>> [4] AUDITORIA DE GETELEMENTBYID (DESKTOP) <<<")
js_dom_ids = set(re.findall(r'document\.getElementById\(["\']([^"\']+)["\']\)', all_desktop_js))
html_ids = set(re.findall(r'id=["\']([^"\']+)["\']', d_html))

missing_ids = []
for gid in sorted(js_dom_ids):
    # Se não está no index.html e não é criado dinamicamente
    if gid not in html_ids and not re.search(r'innerHTML\s*=\s*[\s\S]{0,500}id=["\']' + re.escape(gid) + r'["\']', all_desktop_js):
        missing_ids.append(gid)

print(f"Total de IDs buscados via getElementById no Desktop: {len(js_dom_ids)}")
print(f"IDs potencialmente ausentes (podem gerar TypeError se não tratados defensivamente): {len(missing_ids)}")
for mid in missing_ids[:20]:
    print(f"  ? id='{mid}'")
