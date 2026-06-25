import os
import json
from google.cloud import firestore

def main():
    service_account_path = "c:\\Users\\Paulo H Parreira\\.gemini\\antigravity\\scratch\\platform\\parreiralog-91904-firebase-adminsdk-fbsvc-dd618d33b5.json"
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = service_account_path
    
    try:
        db = firestore.Client(project="parreiralog-91904")
        print("Connected to Firestore!")
        
        for tenant in ["centralpecas", "ltdistribuidora"]:
            ref = db.collection("tenants").document(tenant).collection("legacy_store").document("clients")
            doc = ref.get()
            if doc.exists:
                clients = json.loads(doc.to_dict().get('content', '[]'))
                print(f"\nTenant: {tenant}")
                print(f"  Total clients: {len(clients)}")
                c_1051 = [c for c in clients if c.get('codigo') == '1051']
                print(f"  Client 1051: {c_1051}")
            else:
                print(f"\nTenant: {tenant} - clients not found")
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
