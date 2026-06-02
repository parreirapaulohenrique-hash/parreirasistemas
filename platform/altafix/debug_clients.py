import sys, xlrd, json
sys.stdout.reconfigure(encoding='utf-8')

wb = xlrd.open_workbook(r'C:\Users\Paulo H Parreira\.gemini\antigravity\scratch\platform\altafix\cadast cliente.xls')
ws = wb.sheet_by_index(0)

clientes = []
ids_vistos = {}
duplicatas = 0
vazios = 0

for row in range(1, ws.nrows):
    codigo    = ws.cell_value(row, 0)
    descricao = ws.cell_value(row, 1)
    cnpj      = ws.cell_value(row, 2)
    cidade    = ws.cell_value(row, 3)
    telefone  = ws.cell_value(row, 4)

    id_str = str(int(codigo)) if isinstance(codigo, float) else str(codigo).strip()
    nome   = str(descricao).strip()

    if not id_str or id_str == '0':
        vazios += 1
        continue

    if id_str in ids_vistos:
        duplicatas += 1
    else:
        ids_vistos[id_str] = nome

    clientes.append({
        'id':     id_str,
        'name':   nome,
        'cnpj':   str(cnpj).strip(),
        'city':   str(cidade).strip(),
        'phone':  str(telefone).strip(),
        'active': True,
    })

print(f"Total linhas (sem cabecalho): {ws.nrows - 1}")
print(f"Registros validos: {len(clientes)}")
print(f"IDs unicos: {len(ids_vistos)}")
print(f"Duplicatas de ID: {duplicatas}")
print(f"Linhas vazias/codigo 0: {vazios}")

payload = json.dumps(clientes, ensure_ascii=False)
size_kb = len(payload.encode('utf-8')) / 1024
print(f"Tamanho total JSON: {size_kb:.1f} KB")
print(f"localStorage limite tipico: 5120 KB")
print(f"Cabe no localStorage: {'SIM' if size_kb < 5120 else 'NAO - MUITO GRANDE'}")

# Verifica se o nome 'name' usa a chave correta que o app espera
print("\nPrimeiros 5:")
for c in clientes[:5]:
    print(" ", c)
