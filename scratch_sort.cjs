const candidates = [
  { id: 'Maayan', assignedDays: [1, 5], lastDayAssigned: 5, weekendShifts: 1, midweekShifts: 1, totalShifts: 2 },
  { id: 'Eden', assignedDays: [4, 5], lastDayAssigned: 5, weekendShifts: 2, midweekShifts: 0, totalShifts: 2 },
  { id: 'Yarin', assignedDays: [0, 4, 5], lastDayAssigned: 5, weekendShifts: 3, midweekShifts: 1, totalShifts: 4 },
  { id: 'Ben', assignedDays: [1, 4, 5], lastDayAssigned: 5, weekendShifts: 2, midweekShifts: 1, totalShifts: 3 }
];

function runSort(candidates, dayIndex, dayInfo) {
  candidates.sort((a, b) => {
        const a3Consecutive = (a.assignedDays.includes(dayIndex - 1) && a.assignedDays.includes(dayIndex - 2)) ? 1 : 0;
        const b3Consecutive = (b.assignedDays.includes(dayIndex - 1) && b.assignedDays.includes(dayIndex - 2)) ? 1 : 0;
        if (a3Consecutive !== b3Consecutive) return a3Consecutive - b3Consecutive;

        const aDouble = a.lastDayAssigned === dayIndex ? 1 : 0;
        const bDouble = b.lastDayAssigned === dayIndex ? 1 : 0;
        if (aDouble !== bDouble) return aDouble - bDouble;

        const isWeekendShiftForSort = dayInfo.isWeekend || dayInfo.key === "ה'";
        if (isWeekendShiftForSort) {
          if (a.weekendShifts !== b.weekendShifts) return a.weekendShifts - b.weekendShifts;
        } else {
          if (a.midweekShifts !== b.midweekShifts) return a.midweekShifts - b.midweekShifts;
        }

        const a2Consecutive = a.lastDayAssigned === dayIndex - 1 ? 1 : 0;
        const b2Consecutive = b.lastDayAssigned === dayIndex - 1 ? 1 : 0;
        if (a2Consecutive !== b2Consecutive) return a2Consecutive - b2Consecutive;

        if (a.totalShifts !== b.totalShifts) return a.totalShifts - b.totalShifts;
        
        return 0;
  });
  return candidates.map(c => c.id);
}

console.log("Saturday Sort:");
console.log(runSort([...candidates], 6, { key: "ש'", isWeekend: true }));

console.log("Sunday Exit Sort:");
console.log(runSort([...candidates], 7, { key: "א' (יציאה)", isWeekend: true }));
