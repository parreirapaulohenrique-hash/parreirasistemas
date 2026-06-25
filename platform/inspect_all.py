import os
import json
from google.cloud import firestore

def main():
    service_account_path = "c:\\Users\\Paulo H Parreira\\.gemini\\antigravity\\scratch\\platform\\parreiralog-91904-firebase-adminsdk-fbsvc-dd618d33b5.json"
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = service_account_path
    
    try:
        db = firestore.Client(project="parreiralog-91904")
        print("Connected to Firestore!")
        
        # List all docs under legacy_store
        col_ref = db.collection("tenants").document("centralpecas").collection("legacy_store")
        docs = col_ref.list_documents()
        
        print("\n--- Documents under tenants/centralpecas/legacy_store ---")
        for doc in docs:
            d = doc.get()
            if d.exists:
                data = d.to_dict()
                is_chunked = data.get('isChunked', False)
                content = data.get('content', '')
                print(f"Doc ID: {doc.id}")
                print(f"  isChunked: {is_chunked}")
                print(f"  updatedAt: {data.get('updatedAt')}")
                if is_chunked:
                    print(f"  chunkCount: {data.get('chunkCount')}")
                    print(f"  totalCount: {data.get('totalCount')}")
                else:
                    print(f"  Content length: {len(content)}")
                    if len(content) > 0:
                        print(f"  Sample: {content[:150]}")
            else:
                print(f"Doc ID: {doc.id} (not exists)")
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
