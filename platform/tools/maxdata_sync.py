"""
maxdata_sync.py — Sincronizacao Local: Maxdata → Firestore
============================================================
Roda dentro da rede da empresa, onde o Maxdata e acessivel.
Busca clientes e produtos do Maxdata e salva no Firestore.

INSTALACAO (uma vez):
    pip install requests firebase-admin

CONFIGURACAO:
    1. Baixe a chave de servico do Firebase:
       Console Firebase → Configuracoes do Projeto → Contas de Servico
       → Gerar nova chave privada → salvar como serviceAccountKey.json
    2. Coloque o serviceAccountKey.json na mesma pasta deste script
    3. Execute: python maxdata_sync.py

AGENDAMENTO (Windows):
    Agendador de Tarefas → Acao: python maxdata_sync.py
"""

import sys
import io
import json
import datetime
import re
import requests
import os
import math

# UTF-8 no Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# ─── CONFIGURACAO ──────────────────────────────────────────────────────────────
BASE_URL  = "http://rds.skytins.com.br:8720/v2"
EMP_ID    = 1
TERMINAL  = "364F64E6539974C1D75C8A46C14B2D3D"
TENANT_ID = "centralpecas"

# Caminho para o serviceAccountKey.json
KEY_FILE  = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")

# ─── AUTENTICACAO MAXDATA ──────────────────────────────────────────────────────
_token_cache = {}

def get_token():
    now = datetime.datetime.now().timestamp()
    if _token_cache.get("value") and _token_cache.get("expires", 0) > now + 120:
        return _token_cache["value"]

    print(f"[MaxData] Autenticando (empId={EMP_ID})...")
    r = requests.post(
        f"{BASE_URL}/auth",
        json={"empId": EMP_ID, "terminal": TERMINAL},
        timeout=30
    )
    r.raise_for_status()
    data = r.json()
    token = data.get("token")
    if not token:
        raise ValueError(f"Token nao retornado. Resposta: {data}")

    _token_cache["value"]   = token
    _token_cache["expires"] = now + 86400
    print("[MaxData] Autenticado OK.")
    return token


def headers():
    return {
        "Content-Type":  "application/json",
        "Authorization": f"Bearer {get_token()}"
    }


# ─── BUSCA DE CLIENTES ─────────────────────────────────────────────────────────
def fetch_clients(page_size=500):
    """Formato real: { docs: [...], total: N, limit: L, page: P, pages: N }"""
    clientes = []
    page = 1
    while True:
        print(f"  Pagina {page} de clientes...", flush=True)
        try:
            r = requests.get(
                f"{BASE_URL}/client",
                headers=headers(),
                params={"limit": page_size, "page": page},
                timeout=60
            )
            r.raise_for_status()
        except requests.RequestException as e:
            print(f"  ERRO na pagina {page}: {e}")
            break

        data = r.json()
        items = data.get("docs", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
        if not items:
            break

        clientes.extend(items)
        total_pages = data.get("pages", 1) if isinstance(data, dict) else 1
        print(f"  {len(clientes)}/{data.get('total','?')} clientes ({page}/{total_pages} paginas)", flush=True)

        if page >= total_pages:
            break
        page += 1

    return clientes


# ─── BUSCA DE PRODUTOS ─────────────────────────────────────────────────────────
def fetch_products(page_size=200):
    """Formato real: { docs: [...], total: N, limit: L, page: P, pages: N }"""
    produtos = []
    page = 1
    while True:
        print(f"  Pagina {page} de produtos...", flush=True)
        try:
            r = requests.get(
                f"{BASE_URL}/product",
                headers=headers(),
                params={"limit": page_size, "page": page},
                timeout=60
            )
            r.raise_for_status()
        except requests.RequestException as e:
            print(f"  ERRO na pagina {page}: {e}")
            break

        data = r.json()
        items = data.get("docs", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
        if not items:
            break

        produtos.extend(items)
        total_pages = data.get("pages", 1) if isinstance(data, dict) else 1
        print(f"  {len(produtos)}/{data.get('total','?')} produtos ({page}/{total_pages} paginas)", flush=True)

        if page >= total_pages:
            break
        page += 1

    return produtos


# ─── NORMALIZAR CLIENTE ─────────────────────────────────────────────────────────
def map_client(raw):
    nome = (raw.get("nomeFantasia") or raw.get("razaoSocial") or raw.get("nome") or "").strip()
    return {
        "nome":      nome,
        "documento": (raw.get("cnpj") or raw.get("cpf") or raw.get("documento") or "").replace(".", "").replace("/", "").replace("-", ""),
        "telefone":  (raw.get("telefone") or raw.get("fone") or raw.get("celular") or "").replace("(","").replace(")","").replace("-","").replace(" ",""),
        "email":     (raw.get("email") or "").strip().lower(),
        "cidade":    (raw.get("cidade") or raw.get("municipio") or "").strip(),
        "estado":    (raw.get("estado") or raw.get("uf") or "").strip().upper(),
        "codigo":    str(raw.get("id") or raw.get("codigo") or raw.get("clienteId") or ""),
        "origemErp": True,
        "ativo":     True,
        "updatedAt": datetime.datetime.utcnow().isoformat() + "Z",
    }


# ─── NORMALIZAR PRODUTO ─────────────────────────────────────────────────────────
def map_product(raw):
    codBarras = raw.get("codBarras", [])
    if isinstance(codBarras, list) and codBarras:
        barcode = codBarras[0]
    else:
        barcode = str(codBarras)

    embalagens = raw.get("embalagemVenda", []) or []
    preco = 0.0
    if embalagens:
        preco = embalagens[0].get("precoVenda", 0) or 0

    return {
        "referencia":  (raw.get("codigoFab") or raw.get("codigoOriginal") or raw.get("descricao") or "")[:50],
        "descricao":   (raw.get("descricao") or "").strip(),
        "descPdv":     (raw.get("descPdv") or raw.get("descricao") or "")[:40],
        "codigoErp":   str(raw.get("id") or ""),
        "barcode":     barcode,
        "preco":       float(preco),
        "estoque":     float(raw.get("estoque") or 0),
        "aplicacao":   (raw.get("aplicacao") or ""),
        "grupo":       (raw.get("grupo") or ""),
        "fabricante":  (raw.get("fabricante") or ""),
        "empId":       raw.get("empId", EMP_ID),
        "origemErp":   True,
        "ativo":       not raw.get("desativado", False),
        "updatedAt":   datetime.datetime.utcnow().isoformat() + "Z",
    }


# ─── GRAVAR NO FIRESTORE ───────────────────────────────────────────────────────
def sanitize_id(s, max_len=60):
    """Remove caracteres invalidos para Firestore document IDs. Nao pode conter /"""
    s = str(s).strip().upper()
    s = re.sub(r'[^A-Z0-9_\-]', '_', s)  # mantem apenas alfanumericos, _ e -
    s = re.sub(r'_+', '_', s).strip('_')   # colapsa __ multiplos
    return (s[:max_len] or 'doc')


def gen_id_cliente(cliente):
    doc = cliente["documento"]
    if doc and len(doc) >= 5:
        return doc[:14]
    nome = sanitize_id(cliente["nome"])[:30]
    return (nome or "cli") + "_" + str(int(datetime.datetime.now().timestamp()))


def gen_id_produto(produto):
    ref = sanitize_id(produto["referencia"])[:30]
    cod = str(produto["codigoErp"]).strip()
    return (f"{ref}_{cod}" if ref else f"cod_{cod}")


def salvar_no_firestore(db, collection_path, docs_map):
    """Salva em batches de 499."""
    col = db.collection(collection_path)
    items = list(docs_map.items())
    total = len(items)
    salvo = 0
    BATCH_SIZE = 499

    for i in range(0, total, BATCH_SIZE):
        batch = db.batch()
        slice_ = items[i:i + BATCH_SIZE]
        for doc_id, data in slice_:
            ref = col.document(doc_id)
            batch.set(ref, data, merge=True)
        batch.commit()
        salvo += len(slice_)
        pct = int(salvo / total * 100)
        print(f"  [{pct:3d}%] {salvo}/{total} salvos no Firestore")

    return salvo


# ─── MAIN ──────────────────────────────────────────────────────────────────────
def main():
    import firebase_admin
    from firebase_admin import credentials, firestore

    # Verifica chave
    if not os.path.exists(KEY_FILE):
        print(f"""
ERRO: Arquivo de chave NAO encontrado em:
  {KEY_FILE}

Como obter:
  1. Acesse: https://console.firebase.google.com/project/parreirasistemas/settings/serviceaccounts/adminsdk
  2. Clique em "Gerar nova chave privada"
  3. Salve como: serviceAccountKey.json
  4. Coloque na mesma pasta deste script
""")
        sys.exit(1)

    # Inicializa Firebase Admin
    if not firebase_admin._apps:
        cred = credentials.Certificate(KEY_FILE)
        firebase_admin.initialize_app(cred)
    db = firestore.client()

    print("=" * 60)
    print("  MAXDATA → FIRESTORE  Sincronizacao Local")
    print("=" * 60)
    print(f"  Tenant:   {TENANT_ID}")
    print(f"  Maxdata:  {BASE_URL}")
    print(f"  EmpId:    {EMP_ID}")
    print()

    # ── CLIENTES ──────────────────────────────────────────────────
    print("Passo 1/2: Buscando CLIENTES no Maxdata...")
    try:
        raw_clients = fetch_clients()
        print(f"  {len(raw_clients)} clientes recebidos.")
        if raw_clients:
            clients_map = {}
            for raw in raw_clients:
                c = map_client(raw)
                if not c["nome"]:
                    continue
                doc_id = gen_id_cliente(c)
                clients_map[doc_id] = c

            col_path = f"tenants/{TENANT_ID}/demanda/data/clientes"
            print(f"  Salvando {len(clients_map)} clientes em {col_path}...")
            saved = salvar_no_firestore(db, col_path, clients_map)
            print(f"  CLIENTES: {saved} salvos com sucesso! ✓")
    except Exception as e:
        print(f"  ERRO nos clientes: {e}")

    print()

    # ── PRODUTOS ───────────────────────────────────────────────────
    print("Passo 2/2: Buscando PRODUTOS no Maxdata...")
    try:
        raw_products = fetch_products()
        print(f"  {len(raw_products)} produtos recebidos.")
        if raw_products:
            prods_map = {}
            for raw in raw_products:
                p = map_product(raw)
                if not p["descricao"]:
                    continue
                doc_id = gen_id_produto(p)
                prods_map[doc_id] = p

            col_path = f"tenants/{TENANT_ID}/demanda/techbase/products"
            print(f"  Salvando {len(prods_map)} produtos em {col_path}...")
            saved = salvar_no_firestore(db, col_path, prods_map)
            print(f"  PRODUTOS: {saved} salvos com sucesso! ✓")
    except Exception as e:
        print(f"  ERRO nos produtos: {e}")

    print()
    print("=" * 60)
    print("  Sincronizacao concluida!")
    print("  Acesse o modulo de Demanda — os dados estarao disponiveis.")
    print("=" * 60)


if __name__ == "__main__":
    main()