import os
from google.cloud import firestore

def main():
    service_account_path = "c:\\Users\\Paulo H Parreira\\.gemini\\antigravity\\scratch\\platform\\parreiralog-91904-firebase-adminsdk-fbsvc-dd618d33b5.json"
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = service_account_path
    
    try:
        db = firestore.Client(project="parreiralog-91904")
        print("Connected to Firestore!")
        
        doc_ref = db.collection("tenants").document("centralpecas").collection("legacy_store").document("clients")
        doc = doc_ref.get()
        if doc.exists:
            data = doc.to_dict()
            print("Document 'clients' exists.")
            print(f"isChunked: {data.get('isChunked')}")
            print(f"updatedAt: {data.get('updatedAt')}")
            content = data.get('content', '')
            print(f"Content length: {len(content)} characters")
            if len(content) > 100:
                print(f"Sample content: {content[:200]}...")
        else:
            print("Document 'clients' does not exist under legacy_store.")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
