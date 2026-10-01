export class SchedulingConflictError extends Error {
  constructor(message, conflicts) {
    super(message);
    this.name = "SchedulingConflictError";
    this.conflicts = conflicts;
  }
}

const DAYS = [
  { name: 'ראשון', short: "א'", isWeekend: false },
  { name: 'שני', short: "ב'", isWeekend: false },
  { name: 'שלישי', short: "ג'", isWeekend: false },
  { name: 'רביעי', short: "ד'", isWeekend: false },
  { name: 'חמישי', short: "ה'", isWeekend: false },
  { name: 'שישי', short: "ו'", isWeekend: true },
  { name: 'שבת', short: "ש'", isWeekend: true }
];

export const generateSchedule = (kitchenData, departmentsData, managerOverrides = {}) => {
  let eligibleSoldiers = [];
  let totalExemptions = 0;
  
  departmentsData.forEach(dep => {
    dep.soldiers?.forEach((s, idx) => {
      const id = `${dep.departmentName}_${idx}`;
      const isAgam = dep.departmentName === 'אג"ם';
      
      const originallyHasException = s.exceptionType && s.exceptionType !== 'none';
      const isExempt = managerOverrides[id] !== undefined 
        ? managerOverrides[id] === 'פטור' 
        : originallyHasException;
      
      const activeExceptionType = isExempt ? s.exceptionType : 'none';
      
      if (activeExceptionType === 'full') {
        totalExemptions++;
      } else {
        eligibleSoldiers.push({
          id,
          name: `${s.name} (${dep.departmentName})`,
          department: dep.departmentName,
          closesWeekend: s.closesWeekend,
          preference: s.shiftPreference || 'none',
          blockedDays: s.blockedDays || [],
          constraintReason: s.constraintReason || '',
          isWeekendExempt: activeExceptionType === 'weekend',
          isAgam: isAgam,
          shiftsAssigned: 0,
          lastDayAssigned: -99 
        });
      }
    });
  });

  const conflicts = [];
  const schedule = []; 
  
  const reqPlasamMid = parseInt(kitchenData.midweek?.plasam || 0);
  const reqAgamMid = parseInt(kitchenData.midweek?.agam || 0);
  const reqPlasamWeek = parseInt(kitchenData.weekend?.plasam || 0);
  const reqAgamWeek = parseInt(kitchenData.weekend?.agam || 0);

  const pickSoldiers = (dayIndex, dayInfo, isMorning, isAgamReq, requiredCount) => {
    if (requiredCount === 0) return [];
    
    let candidates = eligibleSoldiers.filter(s => {
      if (s.isAgam !== isAgamReq) return false;
      if (dayIndex - s.lastDayAssigned < 2) return false;
      if (dayInfo.isWeekend && (!s.closesWeekend || s.isWeekendExempt)) return false;
      if (s.blockedDays.includes(dayInfo.short)) return false;
      return true;
    });

    candidates.sort((a, b) => {
      if (a.shiftsAssigned !== b.shiftsAssigned) return a.shiftsAssigned - b.shiftsAssigned;
      const prefA = (isMorning && a.preference === 'morning') || (!isMorning && a.preference === 'evening') ? -1 : (a.preference === 'none' ? 0 : 1);
      const prefB = (isMorning && b.preference === 'morning') || (!isMorning && b.preference === 'evening') ? -1 : (b.preference === 'none' ? 0 : 1);
      return prefA - prefB;
    });

    if (candidates.length < requiredCount) {
      const typeStr = isAgamReq ? "אג״ם" : "פלס״ם";
      const shiftStr = isMorning ? "בוקר" : "ערב";
      
      // איסוף אילוצים של אנשים שחסומים ביום הזה (בשביל להציג למנהל)
      const blockedPeople = eligibleSoldiers.filter(s => 
        s.isAgam === isAgamReq && 
        s.blockedDays.includes(dayInfo.short)
      );
      
      let constraintText = "";
      if (blockedPeople.length > 0) {
        const reasons = blockedPeople.filter(s => s.constraintReason).map(s => `${s.name}: ${s.constraintReason}`).join(" | ");
        if (reasons) {
          constraintText = `\nסיבות לאי זמינות חיילים באותו יום: ${reasons}`;
        }
      }

      conflicts.push(`ביום ${dayInfo.name} במשמרת ${shiftStr} חסרים תורני ${typeStr} (נדרשו ${requiredCount}, נמצאו ${candidates.length} פנויים).${constraintText}`);
      return candidates;
    }

    // Pick top N
    const selected = candidates.slice(0, requiredCount);
    selected.forEach(s => {
      s.shiftsAssigned++;
      s.lastDayAssigned = dayIndex;
    });
    
    return selected;
  };

  const selectedDaysMap = kitchenData.activeDays || { "א'": 'full', "ב'": 'full', "ג'": 'full', "ד'": 'full', "ה'": 'full', "ו'": 'full', "ש'": 'full' };
  
  let activeDaysToSchedule = DAYS.filter(d => {
    if (Array.isArray(selectedDaysMap)) return selectedDaysMap.includes(d.short); // Backwards compatibility
    return selectedDaysMap[d.short] && selectedDaysMap[d.short] !== 'off';
  });

  // Reorder so Sunday is at the end if it's a weekend-oriented schedule (e.g., Thu-Sun)
  const hasSunday = activeDaysToSchedule.find(d => d.short === "א'");
  const hasSaturday = activeDaysToSchedule.find(d => d.short === "ש'");
  const hasMonday = activeDaysToSchedule.find(d => d.short === "ב'");
  
  if (hasSunday && hasSaturday && !hasMonday) {
    // Remove Sunday from the beginning and push it to the end
    activeDaysToSchedule = activeDaysToSchedule.filter(d => d.short !== "א'");
    activeDaysToSchedule.push(hasSunday);
  }

  activeDaysToSchedule.forEach((day) => {
    const dayIndex = DAYS.findIndex(d => d.name === day.name);
    const dayState = Array.isArray(selectedDaysMap) ? 'full' : (selectedDaysMap[day.short] || 'full');
    
    const isW = day.isWeekend;
    const pReq = isW ? reqPlasamWeek : reqPlasamMid;
    const aReq = isW ? reqAgamWeek : reqAgamMid;

    const morningShift = [
      ...pickSoldiers(dayIndex, day, true, false, pReq), // Plasam morning
      ...pickSoldiers(dayIndex, day, true, true, aReq)   // Agam morning
    ];
    
    let eveningShift = [];
    if (dayState === 'full') {
      eveningShift = [
        ...pickSoldiers(dayIndex, day, false, false, pReq), // Plasam evening
        ...pickSoldiers(dayIndex, day, false, true, aReq)   // Agam evening
      ];
    }

    schedule.push({
      dayName: day.name,
      shortName: day.short,
      isWeekend: isW,
      morning: morningShift.map(s => s.name),
      evening: eveningShift.map(s => s.name)
    });
  });

  if (conflicts.length > 0) {
    throw new SchedulingConflictError("השיבוץ נכשל עקב אילוצי כוח אדם", conflicts);
  }

  return {
    status: 'success',
    totalEligible: eligibleSoldiers.length,
    totalExempt: totalExemptions,
    schedule
  };
};
