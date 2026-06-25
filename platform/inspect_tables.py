import os
import json
from google.cloud import firestore

def main():
    service_account_path = "c:\\Users\\Paulo H Parreira\\.gemini\\antigravity\\scratch\\platform\\parreiralog-91904-firebase-adminsdk-fbsvc-dd618d33b5.json"
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = service_account_path
    
    try:
        db = firestore.Client(project="parreiralog-91904")
        print("Connected to Firestore!")
        
        # Load clients
        clients_ref = db.collection("tenants").document("centralpecas").collection("legacy_store").document("clients")
        clients_doc = clients_ref.get()
        if clients_doc.exists:
            clients = json.loads(clients_doc.to_dict().get('content', '[]'))
            client_1051 = [c for c in clients if c.get('codigo') == '1051']
            print("\n--- Client 1051 ---")
            print(json.dumps(client_1051, indent=2))
        else:
            print("Clients doc not found.")
            
        # Load freight tables
        tables_ref = db.collection("tenants").document("centralpecas").collection("legacy_store").document("freight_tables")
        tables_doc = tables_ref.get()
        if tables_doc.exists:
            tables = json.loads(tables_doc.to_dict().get('content', '[]'))
            print(f"\nTotal freight table rules: {len(tables)}")
            
            boa_esperanca_rules = [r for r in tables if "BOA ESPERANCA" in r.get('transportadora', '').upper()]
            print(f"Total BOA ESPERANCA rules: {len(boa_esperanca_rules)}")
            
            # Print rules matching SAO JOAO DA PONTA
            sao_joao_rules = [r for r in boa_esperanca_rules if "SAO JOAO DA PONTA" in r.get('cidade', '').upper() or "SAO JOAO DA PONTA" in r.get('cidadeRedespacho', '').upper()]
            print("\n--- BOA ESPERANCA rules for SAO JOAO DA PONTA ---")
            print(json.dumps(sao_joao_rules, indent=2))
            
            # Print rules for TNORTE matching SAO JOAO DA PONTA
            tnorte_rules = [r for r in tables if "TNORTE" in r.get('transportadora', '').upper()]
            sao_joao_tnorte = [r for r in tnorte_rules if "SAO JOAO DA PONTA" in r.get('cidade', '').upper() or "SAO JOAO DA PONTA" in r.get('cidadeRedespacho', '').upper()]
            print("\n--- TNORTE rules for SAO JOAO DA PONTA ---")
            print(json.dumps(sao_joao_tnorte, indent=2))
            
        else:
            print("Freight tables doc not found.")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
