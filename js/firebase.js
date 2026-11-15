// Firebase configuration
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDdIGc1QsG4YfOFXNA2-tQdtTlgrkyICug",
    authDomain: "lujain-flowers.firebaseapp.com",
    projectId: "lujain-flowers",
    storageBucket: "lujain-flowers.firebasestorage.app",
    messagingSenderId: "401697386083",
    appId: "1:401697386083:web:483f0638b8566004c95256"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig); 

// Initialize services
const auth = getAuth(app);
const db = getFirestore(app);
console.log("Firebase App Name:", app.name);
console.log("Firestore Database:", db._databaseId);
export { app, auth, db };