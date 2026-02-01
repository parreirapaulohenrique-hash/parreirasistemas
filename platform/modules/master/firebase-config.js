// Firebase Configuration & Initialization
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

try {
    if (typeof firebase !== 'undefined') {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
            console.log("🔥 [Master] Firebase conectado com sucesso!");
        }

        // Initialize Firestore
        db = firebase.firestore();
        window.db = db; // Force Global Accessibility

        // Enable offline persistence if possible
        db.enablePersistence()
            .catch((err) => {
                if (err.code == 'failed-precondition') {
                    console.warn('Persistência falhou: Múltiplas abas abertas.');
                } else if (err.code == 'unimplemented') {
                    console.warn('Persistência não suportada neste navegador.');
                }
            });

        // Simple Anonymous Auth for Security Rules
        firebase.auth().signInAnonymously().catch((error) => {
            console.error("❌ Erro Auth:", error);
        });

        firebase.auth().onAuthStateChanged((user) => {
            if (user) console.log("🔒 [Master] Conexão segura estabelecida (ID: " + user.uid.substr(0, 5) + "...)");
        });

    } else {
        console.error("❌ SDK do Firebase não encontrado!");
    }
} catch (error) {
    console.error("❌ Erro ao inicializar Firebase:", error);
}
