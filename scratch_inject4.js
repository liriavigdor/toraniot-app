import fs from 'fs';

const origFile = fs.readFileSync('./src/utils/algorithm.js', 'utf-8');

let hacked = origFile.replace(
  'const shift = shiftsToSchedule.shift();',
  `const shift = shiftsToSchedule.shift();
    console.log("PICKING SHIFT: " + shift.day.key + " " + (shift.isMorning ? "Morn" : "Eve") + " " + (shift.isAgamReq ? "Agam" : "Plasam") + " (Available: " + shift.availableCount + ")");`
);

fs.writeFileSync('./algorithm_hacked.js', hacked);
