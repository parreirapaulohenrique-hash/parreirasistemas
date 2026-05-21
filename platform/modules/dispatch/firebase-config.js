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
        firebase.initializeApp(firebaseConfig);
        console.log("🔥 Firebase conectado com sucesso!");

        // Initialize Firestore
        db = firebase.firestore();
        window.db = db; // Force Global Accessibility

        // Enable offline persistence (synchronizeTabs=true: suporta múltiplas abas abertas)
        db.enablePersistence({ synchronizeTabs: true })
            .catch((err) => {
                if (err.code === 'failed-precondition') {
                    console.warn('⚠️ Persistência: conflito de abas. Usando cache em memória.');
                } else if (err.code === 'unimplemented') {
                    console.warn('⚠️ Persistência offline não suportada neste navegador.');
                }
            });

        // Simple Anonymous Auth for Security Rules
        firebase.auth().signInAnonymously().catch((error) => {
            console.error("❌ Erro Auth:", error);
        });

        firebase.auth().onAuthStateChanged((user) => {
            if (user) console.log("🔒 Conexão segura estabelecida (ID: " + user.uid.substr(0, 5) + "...)");
        });

    } else {
        console.error("❌ SDK do Firebase não encontrado!");
    }
} catch (error) {
    console.error("❌ Erro ao inicializar Firebase:", error);
}
