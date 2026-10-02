import fs from 'fs';

const origFile = fs.readFileSync('./src/utils/algorithm.js', 'utf-8');

let hacked = origFile.replace(
  '// 5. שוויון כולל כשובר שוויון סופי',
  `
  if (dayInfo.key === "ש'") {
    console.log("SATURDAY SORT: " + a.name + " vs " + b.name);
    console.log("A(" + a.name + "): total=" + a.totalShifts + ", week=" + a.weekendShifts + ", a3=" + a3Consecutive + ", a2=" + a2Consecutive + ", aDbl=" + aDouble);
    console.log("B(" + b.name + "): total=" + b.totalShifts + ", week=" + b.weekendShifts + ", b3=" + b3Consecutive + ", b2=" + b2Consecutive + ", bDbl=" + bDouble);
  }
  // 5. שוויון כולל כשובר שוויון סופי`
);

fs.writeFileSync('./algorithm_hacked.js', hacked);
