const admin = require('firebase-admin');

// We need a service account key to bypass security rules if we are running locally, 
// OR we can use the regular firebase client SDK to test as the app would do.
// I will just use the REST API via fetch since we don't have the admin key here.

(async () => {
    try {
        const projectId = "parreiralog-91904";
        const tenantId = "01";
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/tenants/${tenantId}/fv_clientes?pageSize=10`;

        console.log("Fetching from:", url);
        const res = await fetch(url);

        if (!res.ok) {
            console.error("HTTP Error:", res.status, res.statusText);
            const text = await res.text();
            console.error("Body:", text);
            return;
        }

        const data = await res.json();
        console.log("Response JSON:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Script error:", e);
    }
})();
