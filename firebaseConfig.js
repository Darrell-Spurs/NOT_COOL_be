// firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyCjU6Bbb8A-UIBMQtylZdO_-I8krIaC3E0",
    authDomain: "notcool-7a0c2.firebaseapp.com",
    projectId: "notcool-7a0c2",
    storageBucket: "notcool-7a0c2.appspot.com",
    messagingSenderId: "373326509868",
    appId: "1:373326509868:web:0c27c5da948cd366879e89",
    measurementId: "G-LQZ47ZXC0D"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);  // 初始化 Firestore

export { app, db };
