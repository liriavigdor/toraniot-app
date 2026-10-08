import { db } from './src/firebase/firebase.js';
import { doc, deleteDoc } from 'firebase/firestore';

deleteDoc(doc(db, 'activeDepartments', 'אג"ם')).then(() => {
  console.log('Agam department deleted from activeDepartments');
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
