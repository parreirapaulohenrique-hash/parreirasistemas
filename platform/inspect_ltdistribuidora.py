import os
import json
from google.cloud import firestore

def main():
    service_account_path = "c:\\Users\\Paulo H Parreira\\.gemini\\antigravity\\scratch\\platform\\parreiralog-91904-firebase-adminsdk-fbsvc-dd618d33b5.json"
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = service_account_path
    
    try:
        db = firestore.Client(project="parreiralog-91904")
        print("Connected to Firestore!")
        
        # Load ltdistribuidora freight tables
        tables_ref = db.collection("tenants").document("ltdistribuidora").collection("legacy_store").document("freight_tables")
        tables_doc = tables_ref.get()
        if tables_doc.exists:
            tables = json.loads(tables_doc.to_dict().get('content', '[]'))
            print(f"ltdistribuidora total rules: {len(tables)}")
            carriers = set(r.get('transportadora') for r in tables)
            print(f"ltdistribuidora carriers: {sorted(list(carriers))}")
            
            # Print rules matching SAO JOAO DA PONTA
            sao_joao_rules = [r for r in tables if "SAO JOAO DA PONTA" in r.get('cidade', '').upper() or "SAO JOAO DA PONTA" in r.get('cidadeRedespacho', '').upper()]
            print("\n--- ltdistribuidora rules for SAO JOAO DA PONTA ---")
            print(json.dumps(sao_joao_rules, indent=2))
        else:
            print("ltdistribuidora freight tables not found.")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
