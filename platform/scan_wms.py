import os
import glob
import re
import json

wms_dir = r"z:\antigravity\scratch\platform\modules\wms"
coletor_dir = r"z:\antigravity\scratch\platform\modules\wms-coletor"

print("===================================================================")
print("       AUDITORIA E MAPEAMENTO EM LOTE: BÚSSOLA WMS & COLETOR       ")
print("===================================================================")

# 1. Varredura de arquivos
all_wms_js = glob.glob(os.path.join(wms_dir, "**", "*.js"), recursive=True)
all_coletor_js = glob.glob(os.path.join(coletor_dir, "**", "*.js"), recursive=True)

print(f"\n[1] ARQUIVOS DO PROJETO:")
print(f"  * WMS Desktop: {len(all_wms_js)} arquivos JS")
for f in all_wms_js:
    print(f"    - {os.path.relpath(f, wms_dir)} ({os.path.getsize(f):,} bytes)")

print(f"  * WMS Coletor: {len(all_coletor_js)} arquivos JS")
for f in all_coletor_js:
    print(f"    - {os.path.relpath(f, coletor_dir)} ({os.path.getsize(f):,} bytes)")

# 2. Views Desktop
with open(os.path.join(wms_dir, "index.html"), "r", encoding="utf-8", errors="ignore") as f:
    html = f.read()

views = re.findall(r'id=["\']view-([^"\']+)["\']', html)
print(f"\n[2] WMS DESKTOP — VIEWS DISPONÍVEIS ({len(views)} telas):")
for v in views:
    print(f"  * view-{v}")

# 3. Scripts carregados no desktop
scripts = re.findall(r'<script\s+src=["\']([^"\']+)["\']', html)
print(f"\n[3] WMS DESKTOP — SCRIPTS CARREGADOS NO HTML ({len(scripts)} scripts):")
for s in scripts:
    print(f"  * {s}")

# 4. Views Coletor
with open(os.path.join(coletor_dir, "index.html"), "r", encoding="utf-8", errors="ignore") as f:
    c_html = f.read()

c_views = re.findall(r'id=["\']view-([^"\']+)["\']', c_html)
print(f"\n[4] WMS COLETOR — MODOS/TELAS ({len(c_views)} modos):")
for cv in c_views:
    print(f"  * view-{cv}")

# 5. Scripts Coletor
c_scripts = re.findall(r'<script\s+src=["\']([^"\']+)["\']', c_html)
print(f"\n[5] WMS COLETOR — SCRIPTS CARREGADOS NO HTML ({len(c_scripts)} scripts):")
for cs in c_scripts:
    print(f"  * {cs}")

# 6. Funcionalidades WmsStore
wms_store_path = os.path.join(wms_dir, "js", "wms-store.js")
if os.path.exists(wms_store_path):
    with open(wms_store_path, "r", encoding="utf-8", errors="ignore") as f:
        store_code = f.read()
    print("\n[6] MÉTODOS EXPORTADOS WmsStore (NÚCLEO DE DADOS & FIRESTORE):")
    return_block = re.search(r"return\s*\{([^}]+)\};", store_code, re.DOTALL)
    if return_block:
        exports = [e.strip() for e in return_block.group(1).split(",") if e.strip() and not e.strip().startswith("//")]
        for exp in exports:
            print(f"  - {exp}")
