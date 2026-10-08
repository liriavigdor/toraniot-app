import { generateSchedule } from './src/utils/algorithm.js';
import fs from 'fs';
const d = JSON.parse(fs.readFileSync('./departmentsData.json'));
const k = { activeDays: { "א'": 'full', "ב'": 'full', "ג'": 'full', "ד'": 'full', "ה'": 'full', "ו'": 'full', "ש'": 'full', "א' (יציאה)": 'full' }, midweek: { plasam: 2 } };
const o = {};
const overrides = {
  "א'_morning_plasam": 0, "א'_evening_plasam": 2,
  "ב'_morning_plasam": 2, "ב'_evening_plasam": 2,
  "ג'_morning_plasam": 2, "ג'_evening_plasam": 2,
  "ד'_morning_plasam": 2, "ד'_evening_plasam": 2,
  "ה'_morning_plasam": 2, "ה'_evening_plasam": 2,
  "ו'_morning_plasam": 2, "ו'_evening_plasam": 2,
  "ש'_morning_plasam": 1, "ש'_evening_plasam": 0,
  "א' (יציאה)_morning_plasam": 2
};
const result = generateSchedule(k, d, o, overrides);
console.log(result.soldiersState.find(s => s.name === 'שוהם פאר'));
