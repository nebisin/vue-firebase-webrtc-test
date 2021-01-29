import firebase from "firebase/app";

import "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBoJH3p8jPpUPlT-3UnahCUoCsZaWdrZzk",
  authDomain: "fir-webrtc-3122c.firebaseapp.com",
  projectId: "fir-webrtc-3122c",
  storageBucket: "fir-webrtc-3122c.appspot.com",
  messagingSenderId: "874112718235",
  appId: "1:874112718235:web:556db3693102df8abe3d3e",
};

firebase.initializeApp(firebaseConfig);

const firestore = firebase.firestore();

const timestamp = firebase.firestore.FieldValue.serverTimestamp;

export { firestore, timestamp };