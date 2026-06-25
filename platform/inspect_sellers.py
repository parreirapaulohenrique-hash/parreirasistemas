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
            
            # app_users
            users_ref = db.collection("tenants").document(tenant).collection("legacy_store").document("app_users")
            users_doc = users_ref.get()
            if users_doc.exists:
                users = json.loads(users_doc.to_dict().get('content', '[]'))
                print(f"  Users: {[u.get('login') for u in users]}")
            else:
                print("  app_users not found")
                
            # app_sellers
            sellers_ref = db.collection("tenants").document(tenant).collection("legacy_store").document("app_sellers")
            sellers_doc = sellers_ref.get()
            if sellers_doc.exists:
                sellers = json.loads(sellers_doc.to_dict().get('content', '[]'))
                print(f"  Sellers: {[s.get('name') for s in sellers]}")
            else:
                print("  app_sellers not found")
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
