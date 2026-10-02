import fs from 'fs';
import path from 'path';
import { generateSchedule } from './src/utils/algorithm.js';

// read algorithm.js and inject logging
let code = fs.readFileSync('./src/utils/algorithm.js', 'utf8');

// Inject console.log before candidates.sort
code = code.replace(
  'candidates.sort((a, b) => {',
  `if (dayInfo.key === "ש'") {
     console.log("Saturday candidates BEFORE sort:");
     console.log(candidates.map(c => ({ id: c.name, assigned: c.assignedDays, weekend: c.weekendShifts, total: c.totalShifts })));
   }
   candidates.sort((a, b) => {`
);

// Inject console.log after sort
code = code.replace(
  'if (candidates.length === 0) break;',
  `if (dayInfo.key === "ש'") {
     console.log("Saturday candidates AFTER sort:");
     console.log(candidates.map(c => ({ id: c.name })));
   }
   if (candidates.length === 0) break;`
);

fs.writeFileSync('./scratch_algorithm_hacked.js', code);

// Create a wrapper script to run the hacked algorithm
const wrapperCode = `
import { generateSchedule } from './scratch_algorithm_hacked.js';

const kitchenData = {
  activeDays: { "א'": "full", "ב'": "full", "ג'": "full", "ד'": "full", "ה'": "full", "ו'": "full", "ש'": "full", "א' (יציאה)": "full" }
};

const departmentsData = [
  { departmentName: 'תקשוב', soldiers: [{ name: 'מעיין', isAgam: false, blockedDays: ["ג'", "ד'", "ה'"], closesWeekend: true, active: true }] },
  { departmentName: 'לוגיסטיקה', soldiers: [{ name: 'עדן', isAgam: false, blockedDays: [], closesWeekend: true, active: true }] },
  { departmentName: 'טנ"א', soldiers: [{ name: 'ירין', isAgam: false, blockedDays: [], closesWeekend: true, active: true }] },
  { departmentName: 'משא"ן', soldiers: [{ name: 'בן', isAgam: false, blockedDays: [], closesWeekend: true, active: true }] }
];

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

generateSchedule(kitchenData, departmentsData, {}, kitchenOverrides);
`;

fs.writeFileSync('./scratch_run_hacked.js', wrapperCode);
