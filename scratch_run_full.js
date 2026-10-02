import fs from 'fs';
import path from 'path';
import { generateSchedule } from './src/utils/algorithm.js';

const kitchenData = {
  activeDays: {
    "א'": "full", "ב'": "full", "ג'": "full", "ד'": "full", "ה'": "full", "ו'": "full", "ש'": "full", "א' (יציאה)": "full"
  }
};

const departmentsData = [
  {
    departmentName: 'תקשוב',
    soldiers: [
      { name: 'מעיין', isAgam: false, blockedDays: ["ג'", "ד'", "ה'"], closesWeekend: true, active: true },
      { name: 'הדס', isAgam: false, blockedDays: [], closesWeekend: false, active: true }
    ]
  },
  {
    departmentName: 'לוגיסטיקה',
    soldiers: [
      { name: 'עדן', isAgam: false, blockedDays: [], closesWeekend: true, active: true },
      { name: 'עידו ב', isAgam: false, blockedDays: [], closesWeekend: false, active: true }
    ]
  },
  {
    departmentName: 'טנ"א',
    soldiers: [
      { name: 'ירין', isAgam: false, blockedDays: [], closesWeekend: true, active: true },
      { name: 'קורן', isAgam: false, blockedDays: [], closesWeekend: false, active: true }
    ]
  },
  {
    departmentName: 'משא"ן',
    soldiers: [
      { name: 'בן', isAgam: false, blockedDays: [], closesWeekend: true, active: true }
    ]
  },
  {
    departmentName: 'אג"ם',
    soldiers: [
      { name: 'מיכאל אגם', isAgam: true, blockedDays: [], closesWeekend: false, active: true }
    ]
  }
];

const kitchenOverrides = {
  "א'_morning_plasam": 1, "א'_evening_plasam": 1,
  "ב'_morning_plasam": 1, "ב'_evening_plasam": 1,
  "ג'_morning_plasam": 1, "ג'_evening_plasam": 1,
  "ד'_morning_plasam": 1, "ד'_evening_plasam": 1,
  "ה'_morning_plasam": 2, "ה'_evening_plasam": 2,
  "ו'_morning_plasam": 2, "ו'_evening_plasam": 2,
  "ש'_morning_plasam": 1, "ש'_evening_plasam": 0,
  "א' (יציאה)_morning_plasam": 2
};

const managerOverrides = {};

try {
  const result = generateSchedule(kitchenData, departmentsData, managerOverrides, kitchenOverrides);
  console.log(JSON.stringify(result.schedule, null, 2));
} catch(e) {
  console.error(e);
}
