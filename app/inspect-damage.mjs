import fs from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) acc[m[1].trim()] = m[2].trim();
  return acc;
}, {});

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
});
const db = getFirestore(app);

const snap = await getDocs(query(collection(db, 'damage_records'), orderBy('createdAt', 'desc'), limit(3)));
for (const d of snap.docs) {
  const data = d.data();
  const topPhotos = data.photos || [];
  for (const u of topPhotos) {
    const s = String(u);
    if (s.startsWith('data:')) {
      const m = s.match(/^data:([^;]+);base64,(.*)$/s);
      if (m) {
        fs.writeFileSync(`C:/Users/mphoj/AppData/Local/Temp/opencode/test-${d.id}.jpg`, Buffer.from(m[2], 'base64'));
        console.log(d.id, '-> decoded mime:', m[1], 'bytes:', Buffer.from(m[2], 'base64').length);
      }
    }
  }
  for (const it of data.items || []) {
    const u = it.photoUrl || it.photo;
    if (u) console.log(d.id, 'item url:', String(u).slice(0, 80));
  }
}