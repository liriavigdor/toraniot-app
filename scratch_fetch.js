import fs from 'fs';
import { generateSchedule } from './src/utils/algorithm.js';

async function run() {
  const res = await fetch('https://firestore.googleapis.com/v1/projects/toraniot-app/databases/(default)/documents/activeDepartments');
  const data = await res.json();
  
  // Parse firestore JSON
  const parseFirestoreValue = (val) => {
    if (!val) return null;
    if (val.stringValue !== undefined) return val.stringValue;
    if (val.booleanValue !== undefined) return val.booleanValue;
    if (val.integerValue !== undefined) return parseInt(val.integerValue);
    if (val.doubleValue !== undefined) return val.doubleValue;
    if (val.arrayValue !== undefined) {
      return (val.arrayValue.values || []).map(parseFirestoreValue);
    }
    if (val.mapValue !== undefined) {
      const obj = {};
      for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
        obj[k] = parseFirestoreValue(v);
      }
      return obj;
    }
    return null;
  };

  const departmentsData = data.documents.map(doc => {
    const fields = doc.fields;
    return {
      departmentName: parseFirestoreValue(fields.departmentName),
      soldiers: parseFirestoreValue(fields.soldiers) || []
    };
  });

  const kitchenData = {
    activeDays: { "א'": "full", "ב'": "full", "ג'": "full", "ד'": "full", "ה'": "full", "ו'": "full", "ש'": "full", "א' (יציאה)": "full" },
    midweek: { plasam: 1, agam: 1 },
    weekend: { plasam: 2, agam: 1 }
  };

  const kitchenOverrides = {
    "א'_morning_plasam": 0, "א'_evening_plasam": 0,
    "ב'_morning_plasam": 0, "ב'_evening_plasam": 0,
    "ג'_morning_plasam": 0, "ג'_evening_plasam": 0,
    "ד'_morning_plasam": 0, "ד'_evening_plasam": 0,
    "ה'_morning_plasam": 2, "ה'_evening_plasam": 2,
    "ו'_morning_plasam": 2, "ו'_evening_plasam": 2,
    "ש'_morning_plasam": 1, "ש'_evening_plasam": 0,
    "א' (יציאה)_morning_plasam": 2
  };

  fs.writeFileSync('departmentsData.json', JSON.stringify(departmentsData, null, 2));

  const sched = generateSchedule(kitchenData, departmentsData, {}, kitchenOverrides);

  for (const day of sched.schedule) {
    if (["ה'", "ו'", "ש'", "א' (יציאה)"].includes(day.shortName)) {
      console.log(day.dayName + ": Morn=" + day.morning.join(', ') + " | Eve=" + day.evening.join(', '));
    }
  }
}

run();
