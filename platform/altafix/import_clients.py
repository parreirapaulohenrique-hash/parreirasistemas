import firebase_admin
from firebase_admin import credentials, firestore
import xlrd
import json
import sys
import math

sys.stdout.reconfigure(encoding='utf-8')

# -- Configuracao ---------------------------------------------------------------
CRED_PATH  = r"C:\Users\Paulo H Parreira\.gemini\antigravity\scratch\platform\parreiralog-91904-firebase-adminsdk-fbsvc-dd618d33b5.json"
XLS_PATH   = r"C:\Users\Paulo H Parreira\.gemini\antigravity\scratch\platform\altafix\cadast cliente.xls"
TENANT_ID  = "altafix"
STORE_KEY  = "clients"
CHUNK_SIZE = 2500

# -- Init Firebase --------------------------------------------------------------
print("[1/4] Conectando ao Firebase...")
cred = credentials.Certificate(CRED_PATH)
if not firebase_admin._apps:
    firebase_admin.initialize_app(cred)
db = firestore.client()
print("      Conectado!")

# -- Le o XLS ------------------------------------------------------------------
print("[2/4] Lendo arquivo XLS...")
wb = xlrd.open_workbook(XLS_PATH)
ws = wb.sheet_by_index(0)

clientes = []
for row in range(1, ws.nrows):
    codigo    = ws.cell_value(row, 0)
    descricao = ws.cell_value(row, 1)
    cnpj      = ws.cell_value(row, 2)
    cidade    = ws.cell_value(row, 3)
    telefone  = ws.cell_value(row, 4)

    codigo_str = str(int(codigo)) if isinstance(codigo, float) else str(codigo).strip()
    nome_str   = str(descricao).strip().upper()

    if not codigo_str or codigo_str == '0' or not nome_str:
        continue

    # Campos exatamente como o app espera:
    # c.codigo, c.nome, c.cidade, c.bairro, c.telefone
    clientes.append({
        "codigo":   codigo_str,
        "nome":     nome_str,
        "cidade":   str(cidade).strip().upper(),
        "bairro":   "",            # nao ha bairro na planilha
        "telefone": str(telefone).strip().replace(".0", ""),
        # cnpj como bonus (app nao usa mas util para busca)
        "cnpj":     str(cnpj).strip(),
    })

print(f"      {len(clientes)} clientes lidos.")
payload_size = len(json.dumps(clientes, ensure_ascii=False).encode('utf-8')) / 1024
print(f"      Tamanho total: {payload_size:.1f} KB")

# -- Remove chunks antigos -----------------------------------------------------
print("[3/4] Limpando dados antigos...")
legacy_ref = db.collection("tenants").document(TENANT_ID).collection("legacy_store")

for i in range(10):
    ref = legacy_ref.document(f"{STORE_KEY}__{i}")
    if ref.get().exists:
        ref.delete()
        print(f"      Chunk antigo {i} removido.")

meta_ref = legacy_ref.document(f"{STORE_KEY}__meta")
if meta_ref.get().exists:
    meta_ref.delete()
    print("      Meta antigo removido.")

# Remove doc unico antigo se houver
single_ref = legacy_ref.document(STORE_KEY)
if single_ref.get().exists:
    single_ref.delete()
    print("      Doc unico antigo removido.")

# -- Grava novos chunks --------------------------------------------------------
total_chunks = math.ceil(len(clientes) / CHUNK_SIZE)
print(f"[4/4] Gravando {total_chunks} chunk(s)...")

for i in range(total_chunks):
    start = i * CHUNK_SIZE
    end   = start + CHUNK_SIZE
    chunk = clientes[start:end]
    payload = json.dumps(chunk, ensure_ascii=False)
    size_kb = len(payload.encode('utf-8')) / 1024

    legacy_ref.document(f"{STORE_KEY}__{i}").set({
        "content":   payload,
        "chunk":     i,
        "total":     total_chunks,
        "count":     len(chunk),
        "updatedAt": firestore.SERVER_TIMESTAMP,
    })
    print(f"      Chunk {i+1}/{total_chunks}: {len(chunk)} clientes ({size_kb:.1f} KB)")

# Grava meta
legacy_ref.document(f"{STORE_KEY}__meta").set({
    "chunked":     True,
    "totalChunks": total_chunks,
    "totalCount":  len(clientes),
    "key":         STORE_KEY,
    "updatedAt":   firestore.SERVER_TIMESTAMP,
})

print(f"\nCONCLUIDO! {len(clientes)} clientes gravados em {total_chunks} chunks.")
print(f"Campos: codigo, nome, cidade, bairro, telefone, cnpj")
