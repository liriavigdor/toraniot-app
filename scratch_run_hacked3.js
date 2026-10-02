import fs from 'fs';
import { generateSchedule } from './algorithm_hacked.js';

async function run() {
  const departmentsData = JSON.parse(fs.readFileSync('departmentsData.json', 'utf-8'));

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

  const sched = generateSchedule(kitchenData, departmentsData, {}, kitchenOverrides);

  for (const day of sched.schedule) {
    if (["ה'", "ו'", "ש'", "א' (יציאה)"].includes(day.shortName)) {
      console.log(day.dayName + ": Morn=" + day.morning.join(', ') + " | Eve=" + day.evening.join(', '));
    }
  }
}

run();
