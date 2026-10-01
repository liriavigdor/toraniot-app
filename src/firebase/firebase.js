import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyA8ldHR6zD_RWuESduXn9J-LOVVq_mobSg",
  authDomain: "toraniot-app.firebaseapp.com",
  projectId: "toraniot-app",
  storageBucket: "toraniot-app.firebasestorage.app",
  messagingSenderId: "50464983785",
  appId: "1:50464983785:web:3aa782e9efef537d11fe78"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Services
export const db = getFirestore(app);
export const auth = getAuth(app);
export default app;
