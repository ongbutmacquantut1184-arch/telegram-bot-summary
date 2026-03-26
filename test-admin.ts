import admin from 'firebase-admin';
import fs from 'fs';

async function test() {
  try {
    const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
    admin.initializeApp({
      projectId: config.projectId,
    });
    
    // Try to access the named database
    const db = admin.firestore(admin.app(), config.firestoreDatabaseId);
    await db.collection('test').doc('ping').set({ time: Date.now() });
    console.log('Admin SDK success!');
  } catch (e) {
    console.error('Admin SDK error:', e);
  }
}
test();
