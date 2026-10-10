import os, re, sys
sys.stdout.reconfigure(encoding='utf-8')

wms_dir = r"z:\antigravity\scratch\platform\modules\wms"
coletor_dir = r"z:\antigravity\scratch\platform\modules\wms-coletor"

# 1. Desktop Navigation Items
with open(os.path.join(wms_dir, "index.html"), "r", encoding="utf-8", errors="ignore") as f:
    html = f.read()

# Sidebar items
nav_links = re.findall(r'<a[^>]*data-view=["\']([^"\']+)["\'][^>]*>(.*?)</a>', html, re.DOTALL)
print("=== MENU / VISÕES DO WMS DESKTOP ===")
for view, content in nav_links:
    text = re.sub(r'<[^>]+>', ' ', content).strip()
    text = re.sub(r'\s+', ' ', text)
    print(f"  * {text} (data-view='{view}')")

# Submenus ou outros links
other_links = re.findall(r'onclick=["\'](navigate\([^\)]+\)|load[A-Za-z0-9_]+\([^\)]*\))["\']', html)
print(f"\nTotal de gatilhos de navegação encontrados: {len(other_links)}")

# 2. Coletor Screens / Menus
with open(os.path.join(coletor_dir, "index.html"), "r", encoding="utf-8", errors="ignore") as f:
    c_html = f.read()

coletor_nav = re.findall(r'navigateTo\(["\']([^"\']+)["\']\)', c_html)
print("\n=== NAVEGAÇÃO DO WMS COLETOR (TELAS OPERACIONAIS) ===")
for screen in set(coletor_nav):
    print(f"  * Tela: '{screen}'")

# 3. WmsStore Métodos reais (fim do arquivo)
with open(os.path.join(wms_dir, "js", "wms-store.js"), "r", encoding="utf-8", errors="ignore") as f:
    store_code = f.read()

lines = store_code.split('\n')
# Pegar as últimas 60 linhas onde fica o return {...}
tail = lines[-60:]
print("\n=== MÉTODOS PÚBLICOS WmsStore (FIRESTORE CLOUD API) ===")
for l in tail:
    l_strip = l.strip()
    if l_strip.startswith('//'):
        print(f"\n  [{l_strip.replace('//', '').strip()}]")
    elif l_strip and not l_strip.startswith('return') and not l_strip.startswith('}') and not l_strip.startswith('('):
        item = l_strip.replace(',', '').strip()
        if item:
            print(f"    -> {item}")
