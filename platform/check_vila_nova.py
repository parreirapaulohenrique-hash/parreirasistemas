import os
import json
from google.cloud import firestore

def main():
    service_account_path = "c:\\Users\\Paulo H Parreira\\.gemini\\antigravity\\scratch\\platform\\parreiralog-91904-firebase-adminsdk-fbsvc-dd618d33b5.json"
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = service_account_path
    
    try:
        db = firestore.Client(project="parreiralog-91904")
        print("Connected to Firestore!")
        
        tables_ref = db.collection("tenants").document("ltdistribuidora").collection("legacy_store").document("freight_tables")
        tables_doc = tables_ref.get()
        if tables_doc.exists:
            tables = json.loads(tables_doc.to_dict().get('content', '[]'))
            
            # Find rules where cidade is VILA NOVA
            vila_nova_rules = [r for r in tables if r.get('cidade', '').upper() == 'VILA NOVA']
            print(f"Rules with cidade == VILA NOVA: {len(vila_nova_rules)}")
            for r in vil_nova_rules:
                print(f"  Carrier: {r.get('transportadora')}, Cidade: {r.get('cidade')}, CidadeRedespacho: {r.get('cidadeRedespacho')}")
                
            # Find rules where cidadeRedespacho is VILA NOVA
            redesp_rules = [r for r in tables if r.get('cidadeRedespacho', '').upper() == 'VILA NOVA']
            print(f"\nRules with cidadeRedespacho == VILA NOVA: {len(redesp_rules)}")
            for r in redesp_rules:
                print(f"  Carrier: {r.get('transportadora')}, Cidade: {r.get('cidade')}, CidadeRedespacho: {r.get('cidadeRedespacho')}")
        else:
            print("ltdistribuidora freight tables not found.")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
