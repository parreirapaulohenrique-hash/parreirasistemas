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
            print(f"\n=== Tenant: {tenant} ===")
            col_ref = db.collection("tenants").document(tenant).collection("legacy_store")
            for doc_id in ["clients", "freight_tables", "app_users", "app_sellers"]:
                doc = col_ref.document(doc_id).get()
                if doc.exists:
                    d = doc.to_dict()
                    content = d.get('content', '[]')
                    try:
                        count = len(json.loads(content))
                    except:
                        count = "N/A"
                    print(f"  Doc: {doc_id}")
                    print(f"    updatedAt: {d.get('updatedAt')}")
                    print(f"    count: {count}")
                else:
                    print(f"  Doc: {doc_id} (not found)")
                    
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
