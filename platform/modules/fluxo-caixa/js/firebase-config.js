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
            console.log("🔥 [Fluxo Caixa] Firebase conectado com sucesso!");
        }

        db = firebase.firestore();
        window.db = db;

        db.enablePersistence().catch((err) => {
            console.warn('Persistência offline falhou:', err.code);
        });

        firebase.auth().signInAnonymously().catch((error) => {
            console.error("❌ Erro Auth:", error);
        });

        firebase.auth().onAuthStateChanged((user) => {
            if (user) console.log("🔒 [Fluxo Caixa] Conexão segura na Nuvem estabelecida.");
        });

    } else {
        console.error("❌ SDK do Firebase não encontrado!");
    }
} catch (error) {
    console.error("❌ Erro ao inicializar Firebase:", error);
}
