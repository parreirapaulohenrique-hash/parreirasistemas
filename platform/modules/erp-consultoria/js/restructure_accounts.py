import re
import json
import os

filepath = r"C:\Users\Paulo H Parreira\.gemini\antigravity\scratch\platform\modules\erp-consultoria\js\master-accounts.js"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Strip js variable wrapper
match = re.search(r"window\.MASTER_ACCOUNTS\s*=\s*(.*);", content, re.DOTALL)
if not match:
    print("Could not find MASTER_ACCOUNTS in file!")
    exit(1)

raw_json = match.group(1).strip()
accounts = json.loads(raw_json)

restructured = []

# Current section tracker
current_sec = 0

# Helper to normalize description: uppercase for sections/subgroups, title case for leaves
def clean_desc(desc, level):
    desc = re.sub(r"^[\s.\-]+", "", desc).strip()
    if level in [1, 2]:
        return desc.upper()
    else:
        # Title case for details
        return desc.title()

# Map from old code to new code (for category 1 and others)
code_map = {}

# Map category 1 codes (Disponiveis inicial)
cat1_original_codes = ["1.0", "1.1", "1.2", "1.3", "1.4", "1.5", "1.5.03", "1.9", "2.1", "2.4", "2.9", "4.0", "4.1", "4.4", "4.9", "91"]
cat1_new_codes = ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.6.01", "1.7", "1.8", "1.9", "1.10", "1.11", "1.12", "1.13", "1.14", "1.15"]
for o, n in zip(cat1_original_codes, cat1_new_codes):
    code_map[("CAT1", o)] = n

# Map category 7 codes (Disponiveis final)
for o, n in zip(cat1_original_codes, cat1_new_codes):
    code_map[("CAT7", o)] = "7" + n[1:]

# Category 2 mapping
# 1.1 -> 2.1
# 1.1.01 (7 times) -> 2.1.01 to 2.1.07
# 1.1.02 -> 2.1.08
# 1.5 -> 2.2
# 1.2.01 -> 2.2.01
# 1.2.02 -> 2.2.02

# Category 3 mapping
# 2.1 -> 3.1
# 2.1.xx -> 3.1.xx
# 2.2 -> 3.2
# 2.2.xx -> 3.2.xx
# 2.3 -> 3.3
# 2.3.xx -> 3.3.xx

# Section index counter for sequential sub-items
receitas_1_1_01_count = 0

for item in accounts:
    code = item.get("codigo", "")
    desc = item.get("descricao", "")
    
    if code == "HEADER":
        # Check description to identify section transitions
        desc_upper = desc.upper()
        if "DISPONÍVEIS NAS CONTAS MOVIMENTO INICIAL" in desc_upper or "DISPONIVEIS NAS CONTAS MOVIMENTO INICIAL" in desc_upper:
            current_sec = 1
            restructured.append({"codigo": "HEADER", "descricao": "1. DISPONÍVEIS NAS CONTAS MOVIMENTO INICIAL"})
        elif "TOTAL RECEITAS OPERACIONAIS / VENDAS" in desc_upper:
            current_sec = 2
            restructured.append({"codigo": "HEADER", "descricao": "2. TOTAL RECEITAS OPERACIONAIS / VENDAS"})
        elif "TOTAL DOS CUSTOS" in desc_upper or "CUSTO" in desc_upper:
            current_sec = 3
            restructured.append({"codigo": "HEADER", "descricao": "3. CUSTO"})
        elif "RECEITA OPERACIONAL BRUTA" in desc_upper:
            restructured.append({"codigo": "HEADER", "descricao": "RECEITA OPERACIONAL BRUTA"})
        elif "TOTAL DAS DESPESAS OPERACIONAIS" in desc_upper:
            restructured.append({"codigo": "HEADER", "descricao": "TOTAL DAS DESPESAS OPERACIONAIS"})
        elif "SALDO OPERACIONAL LIQUIDO" in desc_upper or "SALDO OPERACIONAL LÍQUIDO" in desc_upper:
            restructured.append({"codigo": "HEADER", "descricao": "SALDO OPERACIONAL LIQUIDO"})
        elif "RECEITAS NÃO OPERACIONAIS TOTAIS" in desc_upper or "RECEITAS NAO OPERACIONAIS TOTAIS" in desc_upper:
            current_sec = 5
            restructured.append({"codigo": "HEADER", "descricao": "5. RECEITAS NÃO OPERACIONAIS TOTAIS"})
        elif "DESPESAS NÃO OPERACIONAL" in desc_upper or "DESPESAS NAO OPERACIONAL" in desc_upper:
            current_sec = 6
            restructured.append({"codigo": "HEADER", "descricao": "6. DESPESAS NÃO OPERACIONAL"})
        elif "TOTAL DAS DESPESAS NÃO OPERACIONAL" in desc_upper or "TOTAL DAS DESPESAS NAO OPERACIONAL" in desc_upper:
            restructured.append({"codigo": "HEADER", "descricao": "TOTAL DAS DESPESAS NÃO OPERACIONAL"})
        elif "SALDO INICIAL CONTA MOVIMENTO" in desc_upper:
            restructured.append({"codigo": "HEADER", "descricao": "SALDO INICIAL CONTA MOVIMENTO"})
        elif "TOTAL RECEITAS OPERAC. E NÃO OPERAC." in desc_upper or "TOTAL RECEITAS OPERAC. E NAO OPERAC." in desc_upper:
            restructured.append({"codigo": "HEADER", "descricao": "TOTAL RECEITAS OPERAC. E NÃO OPERAC."})
        elif "TOTAL DESPESAS OPERAC. E NÃO OPERAC." in desc_upper or "TOTAL DESPESAS OPERAC. E NAO OPERAC." in desc_upper:
            restructured.append({"codigo": "HEADER", "descricao": "TOTAL DESPESAS OPERAC. E NÃO OPERAC."})
        elif "SALDO LIQUIDO FINAL" in desc_upper or "SALDO LÍQUIDO FINAL" in desc_upper:
            restructured.append({"codigo": "HEADER", "descricao": "SALDO LIQUIDO FINAL"})
        elif "SALDO LIQUIDO AJUSTADO" in desc_upper or "SALDO LÍQUIDO AJUSTADO" in desc_upper:
            restructured.append({"codigo": "HEADER", "descricao": "SALDO LIQUIDO AJUSTADO"})
        elif "DISPONÍVEIS NAS CONTAS MOVIMENTO FINAL" in desc_upper or "DISPONIVEIS NAS CONTAS MOVIMENTO FINAL" in desc_upper or ("DISPONÍVEIS NAS CONTAS MOVIMENTO" in desc_upper and current_sec >= 6) or ("DISPONIVEIS NAS CONTAS MOVIMENTO" in desc_upper and current_sec >= 6):
            current_sec = 7
            restructured.append({"codigo": "HEADER", "descricao": "7. DISPONÍVEIS NAS CONTAS MOVIMENTO FINAL"})
        else:
            restructured.append({"codigo": "HEADER", "descricao": desc.upper()})
        continue

    # Identify transition to section 4: "300" Despesas Operac. Fixas e Variáveis
    if code == "300" and "DESPESAS OPERAC" in desc.upper():
        current_sec = 4
        restructured.append({"codigo": "HEADER", "descricao": "4. DESPESAS OPERAC. FIXAS E VARIÁVEIS"})
        continue

    # Level of current item
    dots = code.count(".")
    level = 3 if dots >= 2 else 2

    # Map code and aliases based on section
    new_code = ""
    aliases = [code]

    if current_sec == 1:
        new_code = code_map.get(("CAT1", code), code)
        desc_clean = clean_desc(desc, level)
        restructured.append({"codigo": new_code, "descricao": desc_clean, "aliases": aliases})

    elif current_sec == 2:
        if code == "1.1":
            new_code = "2.1"
        elif code == "1.1.01":
            receitas_1_1_01_count += 1
            new_code = f"2.1.0{receitas_1_1_01_count}"
        elif code == "1.1.02":
            new_code = "2.1.08"
        elif code == "1.5":
            new_code = "2.2"
        elif code == "1.2.01":
            new_code = "2.2.01"
        elif code == "1.2.02":
            new_code = "2.2.02"
        else:
            new_code = code
        desc_clean = clean_desc(desc, level)
        restructured.append({"codigo": new_code, "descricao": desc_clean, "aliases": aliases})

    elif current_sec == 3:
        # Custo: replace first digit with '3'
        new_code = "3" + code[1:]
        desc_clean = clean_desc(desc, level)
        restructured.append({"codigo": new_code, "descricao": desc_clean, "aliases": aliases})

    elif current_sec == 4:
        # Despesas: replace first digit with '4'
        new_code = "4" + code[1:]
        desc_clean = clean_desc(desc, level)
        restructured.append({"codigo": new_code, "descricao": desc_clean, "aliases": aliases})

    elif current_sec == 5:
        # Receitas nao operacionais: replace first digit with '5'
        new_code = "5" + code[1:]
        desc_clean = clean_desc(desc, level)
        restructured.append({"codigo": new_code, "descricao": desc_clean, "aliases": aliases})

    elif current_sec == 6:
        # Despesas nao operacionais: replace first digit with '6'
        new_code = "6" + code[1:]
        desc_clean = clean_desc(desc, level)
        restructured.append({"codigo": new_code, "descricao": desc_clean, "aliases": aliases})

    elif current_sec == 7:
        new_code = code_map.get(("CAT7", code), code)
        desc_clean = clean_desc(desc, level)
        restructured.append({"codigo": new_code, "descricao": desc_clean, "aliases": aliases})

    else:
        desc_clean = clean_desc(desc, level)
        restructured.append({"codigo": code, "descricao": desc_clean})

# Write restructured master-accounts.js
new_content = "window.MASTER_ACCOUNTS = " + json.dumps(restructured, indent=2, ensure_ascii=False) + ";\n"

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(new_content)

# Also write to platform/modules/fluxo-caixa/js/master-accounts.js
filepath_fc = r"C:\Users\Paulo H Parreira\.gemini\antigravity\scratch\platform\modules\fluxo-caixa\js\master-accounts.js"
with open(filepath_fc, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Successfully restructured master accounts!")
