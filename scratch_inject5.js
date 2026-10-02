import fs from 'fs';

const origFile = fs.readFileSync('./src/utils/algorithm.js', 'utf-8');

let hacked = origFile.replace(
  'shift.availableCount = eligibleSoldiers.filter(s => {',
  `shift.availableCount = eligibleSoldiers.filter(s => {
    let debug = false;
    if (shift.day.key === "ש'" && !shift.isAgamReq) debug = true;`
).replace(
  'return true;',
  `if (debug) console.log("SAT AVAIL: " + s.name);
  return true;`
).replace(
  'if (isWeekendShift && (!s.closesWeekend || s.isWeekendExempt)) return false;',
  `if (isWeekendShift && (!s.closesWeekend || s.isWeekendExempt)) {
      if (debug) console.log("SAT FILTERED closesWeekend: " + s.name);
      return false;
  }`
).replace(
  'if (s.blockedDays.includes(shift.day.short)) return false;',
  `if (s.blockedDays.includes(shift.day.short)) {
      if (debug) console.log("SAT FILTERED blockedDays: " + s.name);
      return false;
  }`
);

fs.writeFileSync('./algorithm_hacked.js', hacked);
