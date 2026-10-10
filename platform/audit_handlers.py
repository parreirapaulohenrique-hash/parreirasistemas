import os, re, sys
sys.stdout.reconfigure(encoding='utf-8')

wms_dir = r"z:\antigravity\scratch\platform\modules\wms"
coletor_dir = r"z:\antigravity\scratch\platform\modules\wms-coletor"

print("==========================================================================")
print("     ANÁLISE DE TODAS AS TELAS E FLUXOS DO WMS & COLETOR                 ")
print("==========================================================================")

# 1. Auditoria de handlers por tela no Coletor
coletor_core = os.path.join(coletor_dir, "js", "coletor-core.js")
with open(coletor_core, 'r', encoding='utf-8') as f:
    core_src = f.read()

screens = ['home', 'recebimento', 'conferir', 'armazenar', 'separar', 'inventario', 'config']
print("\n[COLETOR] Mapeamento de telas no navigateTo:")
for sc in screens:
    in_nav = f"'{sc}'" in core_src or f'"{sc}"' in core_src
    print(f"  * Tela '{sc}': {'Tratada no navigateTo' if in_nav else 'NÃO encontrada no navigateTo'}")

# 2. Auditoria dos handlers de scan por tela
print("\n[COLETOR] Handlers de scan no processScan:")
switch_block = re.search(r'switch\s*\(currentScreen\)\s*\{([\s\S]*?)\}', core_src)
if switch_block:
    cases = re.findall(r'case\s+["\']([^"\']+)["\']:\s*([\s\S]*?)break;', switch_block.group(1))
    for c, code in cases:
        handler = re.search(r'([A-Za-z0-9_.]+)\s*\(', code)
        print(f"  * case '{c}': chama -> {handler.group(1) if handler else 'Nenhum'}")

# 3. Auditoria do Desktop: Telas Inbound, Picking, Estoque, Locais
print("\n[DESKTOP] Verificação de carregamento das telas principais:")
desktop_js_files = {
    'inbound': os.path.join(wms_dir, 'js', 'inbound.js'),
    'picking': os.path.join(wms_dir, 'js', 'picking.js'),
    'estoque': os.path.join(wms_dir, 'js', 'estoque.js'),
    'locations': os.path.join(wms_dir, 'js', 'locations.js'),
    'divergencias': os.path.join(wms_dir, 'js', 'divergencias.js'),
    'etiquetas': os.path.join(wms_dir, 'js', 'wms-etiquetas.js')
}

for name, path in desktop_js_files.items():
    if not os.path.exists(path):
        print(f"  ! ERRO: Arquivo {path} não existe!")
    else:
        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            src = f.read()
        # checar se tem funcoes window.load... ou init...
        loaders = re.findall(r'window\.(load[A-Za-z0-9_]+|render[A-Za-z0-9_]+|init[A-Za-z0-9_]+)\s*=', src)
        print(f"  * Módulo '{name}': {len(loaders)} inicializadores encontrados ({', '.join(loaders[:3])}...)")

# 4. Auditoria de chamadas a APIs inexistentes ou variáveis globais indefinidas
print("\n[AUDITORIA DE VARIÁVEIS GLOBAIS]")
# Procura chamadas a window.XYZ que não existem
globals_called = set(re.findall(r'window\.([A-Z][A-Za-z0-9_]+)\.', core_src))
print(f"Objetos globais chamados no Coletor: {globals_called}")

# 5. Auditoria no wms-core.js do Desktop
wms_core_file = os.path.join(wms_dir, 'js', 'wms-core.js')
with open(wms_core_file, 'r', encoding='utf-8') as f:
    d_core = f.read()

d_globals = set(re.findall(r'window\.([A-Z][A-Za-z0-9_]+)\.', d_core))
print(f"Objetos globais chamados no Desktop wms-core.js: {d_globals}")
