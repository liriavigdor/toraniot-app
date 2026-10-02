
import { generateSchedule } from './scratch_algorithm_hacked2.js';

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
