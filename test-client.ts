import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import fs from 'fs';

async function test() {
  try {
    const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
    const app = initializeApp(config);
    const db = getFirestore(app, config.firestoreDatabaseId);
    
    await setDoc(doc(db, 'test', 'ping'), { time: Date.now() });
    console.log('Client SDK success!');
  } catch (e) {
    console.error('Client SDK error:', e);
  }
}
test();
