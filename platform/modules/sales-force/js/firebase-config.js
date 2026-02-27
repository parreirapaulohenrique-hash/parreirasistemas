// Firebase Configuration & Initialization for Sales Force
const firebaseConfig = {
    apiKey: "AIzaSyDzatCQ8zmH4aQftznf7Y5wdYPwFYSiARc",
    authDomain: "parreiralog-91904.firebaseapp.com",
    projectId: "parreiralog-91904",
    messagingSenderId: "527633267616",
    appId: "1:527633267616:web:3567e883b31f7fa02882c5",
    measurementId: "G-CQC6HKZ4V1"
};

// Initialize Firebase (Global Scope)
let db;
// Hardcoded tenant ID for Sales Force
const FV_TENANT = "01";

try {
    if (typeof firebase !== 'undefined') {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
            console.log("🔥 [Força de Vendas] Firebase conectado com sucesso!");
        }

        // Initialize Firestore
        db = firebase.firestore();
        window.db = db; // Force Global Accessibility
        window.getTenantSuffix = () => '_' + FV_TENANT; // Helper callback for some shared fv-core logic

        // Enable offline persistence to allow salesmen to work without internet
        db.enablePersistence()
            .catch((err) => {
                if (err.code == 'failed-precondition') {
                    console.warn('[FV] Persistência falhou: Múltiplas abas abertas.');
                } else if (err.code == 'unimplemented') {
                    console.warn('[FV] Persistência não suportada neste navegador.');
                }
            });

        // Simple Anonymous Auth for Security Rules
        firebase.auth().signInAnonymously().catch((error) => {
            console.error("❌ [FV] Erro Auth:", error);
        });

        firebase.auth().onAuthStateChanged((user) => {
            if (user) console.log("🔒 [FV] Conexão segura estabelecida (ID: " + user.uid.substr(0, 5) + "...)");
        });

    } else {
        console.error("❌ [FV] SDK do Firebase não encontrado!");
    }
} catch (error) {
    console.error("❌ [FV] Erro ao inicializar Firebase:", error);
}
