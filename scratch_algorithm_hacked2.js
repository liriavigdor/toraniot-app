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

const getWeekNumber = (d) => {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
};

export const generateSchedule = (kitchenData, departmentsData, managerOverrides = {}, kitchenOverrides = {}) => {
  let eligibleSoldiers = [];
  let totalExemptions = 0;
  
  departmentsData.forEach(dep => {
    dep.soldiers?.forEach((s, idx) => {
      const id = `${dep.departmentName}_${idx}`;
      const isAgam = dep.departmentName === 'אג"ם';
      
      const isExemptRejected = managerOverrides[`${id}_exception`] === 'rejected';
      const activeExceptionType = isExemptRejected ? 'none' : (s.exceptionType || 'none');
      
      const constraintOverride = managerOverrides[`${id}_constraint`] || 'critical';
      const activeBlockedDays = constraintOverride === 'ignored' ? [] : (s.blockedDays || []);
      const softBlockedDays = constraintOverride === 'flexible' ? activeBlockedDays : [];
      const hardBlockedDays = constraintOverride === 'critical' ? activeBlockedDays : [];
      
      if (activeExceptionType === 'full') {
        totalExemptions++;
      } else {
        eligibleSoldiers.push({
          id,
          name: s.name,
          department: dep.departmentName,
          closesWeekend: s.closesWeekend,
          preference: s.shiftPreference || 'none',
          blockedDays: hardBlockedDays,
          softBlockedDays: softBlockedDays,
          constraintReason: s.constraintReason || '',
          isWeekendExempt: activeExceptionType === 'weekend',
          isAgam: isAgam,
          midweekShifts: 0,
          weekendShifts: 0,
          totalShifts: 0,
          lastDayAssigned: -99,
          assignedDays: []
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

  const dayConflictsBuffer = [];

  const pickSoldiers = (dayIndex, dayInfo, isMorning, isAgamReq, requiredCount) => {
    if (requiredCount === 0) return [];
    
    const picked = [];
    
    while (picked.length < requiredCount) {
      let candidates = eligibleSoldiers.filter(s => {
        if (s.isAgam !== isAgamReq) return false;
        
        // הגדרת "משמרת סופ״ש" לצורך סינון: כל יום שמוגדר סופ״ש, וגם יום חמישי במלואו (בוקר וערב) - לבקשת המנהל
        const isWeekendShift = dayInfo.isWeekend || dayInfo.key === "ה'";
        if (isWeekendShift && (!s.closesWeekend || s.isWeekendExempt)) return false;
        
        if (s.blockedDays.includes(dayInfo.short)) return false; // only hard blocked
        if (picked.some(p => p.id === s.id)) return false; // already picked in this shift
        return true;
      });
      
      if (candidates.length === 0) {
        break;
      }
      
      candidates.sort((a, b) => {
        // 1. העונש הכבד ביותר - 3 ימים ברצף (למדנו מהפידבק לא להפוך לוטו מוחלט אלא לעונש מרבי)
        const a3Consecutive = (a.assignedDays.includes(dayIndex - 1) && a.assignedDays.includes(dayIndex - 2)) ? 1 : 0;
        const b3Consecutive = (b.assignedDays.includes(dayIndex - 1) && b.assignedDays.includes(dayIndex - 2)) ? 1 : 0;
        if (a3Consecutive !== b3Consecutive) return a3Consecutive - b3Consecutive;

        // 2. עונש משמרת כפולה באותו יום
        const aDouble = a.lastDayAssigned === dayIndex ? 1 : 0;
        const bDouble = b.lastDayAssigned === dayIndex ? 1 : 0;
        if (aDouble !== bDouble) return aDouble - bDouble;

        // 3. הגינות ושוויון במסגרת (סופ"ש או אמצ"ש) - הקריטריון החשוב ביותר אחרי מניעת קריסה!
        const isWeekendShiftForSort = dayInfo.isWeekend || dayInfo.key === "ה'";
        if (isWeekendShiftForSort) {
          if (a.weekendShifts !== b.weekendShifts) return a.weekendShifts - b.weekendShifts;
        } else {
          if (a.midweekShifts !== b.midweekShifts) return a.midweekShifts - b.midweekShifts;
        }

        // 4. עונש על יומיים רצופים (חשוב, אבל פחות חשוב מההגינות הכללית של כמות המשמרות!)
        const a2Consecutive = a.lastDayAssigned === dayIndex - 1 ? 1 : 0;
        const b2Consecutive = b.lastDayAssigned === dayIndex - 1 ? 1 : 0;
        if (a2Consecutive !== b2Consecutive) return a2Consecutive - b2Consecutive;

        // 5. שוויון כולל כשובר שוויון סופי
        if (a.totalShifts !== b.totalShifts) return a.totalShifts - b.totalShifts;

        // 3. Saturday rotation (Automatic behind the scenes)
        if (dayInfo.key === "ש'") {
          const EXPECTED_DEPARTMENTS = ['תקשוב', 'לוגיסטיקה', 'טנ"א', 'משא"ן', 'אג"ם'];
          const currentWeek = getWeekNumber(new Date());
          const targetDeptThisWeek = EXPECTED_DEPARTMENTS[currentWeek % EXPECTED_DEPARTMENTS.length];
          
          const aSatTarget = a.department === targetDeptThisWeek ? 1 : 0;
          const bSatTarget = b.department === targetDeptThisWeek ? 1 : 0;
          if (aSatTarget !== bSatTarget) return bSatTarget - aSatTarget; // העדפה למחלקה שתורה הגיע
        }

        // 4. Soft blocked constraints get pushed to the end
        const aIsSoftBlocked = a.softBlockedDays.includes(dayInfo.short) ? 1 : 0;
        const bIsSoftBlocked = b.softBlockedDays.includes(dayInfo.short) ? 1 : 0;
        if (aIsSoftBlocked !== bIsSoftBlocked) return aIsSoftBlocked - bIsSoftBlocked;

        // 5. Department diversity within shift (Rule 1)
        const aDeptInShift = picked.some(p => p.department === a.department) ? 1 : 0;
        const bDeptInShift = picked.some(p => p.department === b.department) ? 1 : 0;
        if (aDeptInShift !== bDeptInShift) return aDeptInShift - bDeptInShift;

        // 6. Preferences
        const prefA = (isMorning && a.preference === 'morning') || (!isMorning && a.preference === 'evening') ? -1 : (a.preference === 'none' ? 0 : 1);
        const prefB = (isMorning && b.preference === 'morning') || (!isMorning && b.preference === 'evening') ? -1 : (b.preference === 'none' ? 0 : 1);
        return prefA - prefB;
      });
      
      const best = candidates[0];
      picked.push(best);
      
      best.totalShifts++;
      
      const isWeekendShiftCount = dayInfo.isWeekend || dayInfo.key === "ה'";
      if (isWeekendShiftCount) {
        best.weekendShifts++;
      } else {
        best.midweekShifts++;
      }

      // שבת זה יום שלם (בוקר וערב אותו תורן) אז אנחנו סופרים לו את זה מראש כ-2 משמרות כדי שהאלגוריתם לא יחשוב שיש לו פחות משמרות וישבץ אותו שוב
      if (dayInfo.key === "ש'") {
        best.totalShifts++;
        best.weekendShifts++;
      }
      best.lastDayAssigned = dayIndex;
      best.assignedDays.push(dayIndex);
    }

    if (picked.length < requiredCount) {
      const typeStr = isAgamReq ? "אג״ם" : "פלס״ם";
      const shiftStr = isMorning ? "בוקר" : "ערב";
      
      const blockedPeople = eligibleSoldiers.filter(s => 
        s.isAgam === isAgamReq && 
        (s.blockedDays.includes(dayInfo.short) || s.softBlockedDays.includes(dayInfo.short))
      );
      
      let constraintText = "";
      if (blockedPeople.length > 0) {
        const reasons = blockedPeople.filter(s => s.constraintReason).map(s => `${s.name}: ${s.constraintReason}`).join(" | ");
        if (reasons) {
          constraintText = `סיבות לאי זמינות חיילים באותו יום: ${reasons}`;
        }
      }

      dayConflictsBuffer.push({ shiftStr, typeStr, req: requiredCount, found: picked.length, constraintText, day: dayInfo });
      return picked;
    }
    
    return picked;
  };

  const SCHEDULE_DAYS = [
    { key: "א'", name: 'ראשון', short: "א'", isWeekend: false },
    { key: "ב'", name: 'שני', short: "ב'", isWeekend: false },
    { key: "ג'", name: 'שלישי', short: "ג'", isWeekend: false },
    { key: "ד'", name: 'רביעי', short: "ד'", isWeekend: false },
    { key: "ה'", name: 'חמישי', short: "ה'", isWeekend: false },
    { key: "ו'", name: 'שישי', short: "ו'", isWeekend: true },
    { key: "ש'", name: 'שבת', short: "ש'", isWeekend: true },
    { key: "א' (יציאה)", name: 'ראשון', short: "א'", isWeekend: true } 
  ];

  const selectedDaysMap = kitchenData.activeDays || {};
  
  const activeDaysToSchedule = SCHEDULE_DAYS.filter(d => {
    return selectedDaysMap[d.key] && selectedDaysMap[d.key] !== 'off';
  });

  let shiftsToSchedule = [];

  activeDaysToSchedule.forEach((day) => {
    const dayIndex = SCHEDULE_DAYS.findIndex(d => d.key === day.key);
    const dayState = selectedDaysMap[day.key];
    const isW = day.isWeekend;
    
    const getReq = (dayInfo, isMorning, isAgamReq) => {
      const typeStr = isAgamReq ? 'agam' : 'plasam';
      const shiftStr = isMorning ? 'morning' : 'evening';
      const override = kitchenOverrides[`${dayInfo.key}_${shiftStr}_${typeStr}`];
      if (override !== undefined && override !== '') return parseInt(override);
      const defReq = isW ? (isAgamReq ? reqAgamWeek : reqPlasamWeek) : (isAgamReq ? reqAgamMid : reqPlasamMid);
      return parseInt(defReq || 0);
    };

    if (dayState === 'full' || dayState === 'half_morning') {
      shiftsToSchedule.push({ dayIndex, day, isMorning: true, isAgamReq: false, req: getReq(day, true, false) });
      shiftsToSchedule.push({ dayIndex, day, isMorning: true, isAgamReq: true, req: getReq(day, true, true) });
    }
    if (dayState === 'full' || dayState === 'half_evening') {
      if (day.key !== "ש'") {
        shiftsToSchedule.push({ dayIndex, day, isMorning: false, isAgamReq: false, req: getReq(day, false, false) });
        shiftsToSchedule.push({ dayIndex, day, isMorning: false, isAgamReq: true, req: getReq(day, false, true) });
      }
    }
  });

  const scheduleResultMap = {};

  while (shiftsToSchedule.length > 0) {
    shiftsToSchedule.forEach(shift => {
      shift.availableCount = eligibleSoldiers.filter(s => {
        if (s.isAgam !== shift.isAgamReq) return false;
        if (Math.abs(shift.dayIndex - s.lastDayAssigned) === 1) return false;
        
        const isWeekendShift = shift.day.isWeekend || shift.day.key === "ה'";
        if (isWeekendShift && (!s.closesWeekend || s.isWeekendExempt)) return false;
        
        if (s.blockedDays.includes(shift.day.short)) return false;
        return true;
      }).length;
    });

    // Sort to find the most constrained shift (least available candidates first)
    shiftsToSchedule.sort((a, b) => {
      if (a.availableCount !== b.availableCount) {
        return a.availableCount - b.availableCount;
      }
      
      // תעדוף קריטי: שבת חייבת להיות משובצת ראשונה כי היא מעניקה 2 משמרות! 
      // אם לא נשבץ אותה ראשונה, מישהו עלול לקבל משמרת בחמישי ואז להשתבץ שוב בשבת ולקפוץ ל-3 משמרות.
      const aIsSat = a.day.key === "ש'" ? 1 : 0;
      const bIsSat = b.day.key === "ש'" ? 1 : 0;
      if (aIsSat !== bIsSat) return bIsSat - aIsSat;

      // לאחר מכן נתעדף סופ"ש באופן כללי כי יש פחות מקורות כוח אדם
      if (a.day.isWeekend !== b.day.isWeekend) {
        return a.day.isWeekend ? -1 : 1;
      }

      return a.dayIndex - b.dayIndex; // chronological tiebreaker
    });

    const shift = shiftsToSchedule.shift();
    const picked = pickSoldiers(shift.dayIndex, shift.day, shift.isMorning, shift.isAgamReq, shift.req);
    const key = `${shift.day.key}_${shift.isMorning ? 'morning' : 'evening'}_${shift.isAgamReq}`;
    scheduleResultMap[key] = picked;
  }

  activeDaysToSchedule.forEach((day) => {
    const dayState = selectedDaysMap[day.key];
    const isW = day.isWeekend;

    const getReq = (dayInfo, isMorning, isAgamReq) => {
      const typeStr = isAgamReq ? 'agam' : 'plasam';
      const shiftStr = isMorning ? 'morning' : 'evening';
      const override = kitchenOverrides[`${dayInfo.key}_${shiftStr}_${typeStr}`];
      if (override !== undefined && override !== '') return parseInt(override);
      const defReq = isW ? (isAgamReq ? reqAgamWeek : reqPlasamWeek) : (isAgamReq ? reqAgamMid : reqPlasamMid);
      return parseInt(defReq || 0);
    };

    let morningShift = [];
    if (dayState === 'full' || dayState === 'half_morning') {
      const pM = scheduleResultMap[`${day.key}_morning_false`] || [];
      const aM = scheduleResultMap[`${day.key}_morning_true`] || [];
      morningShift = [...pM, ...aM];
    }
    
    let eveningShift = [];
    if (dayState === 'full' || dayState === 'half_evening') {
      if (day.key === "ש'") {
        // שבת - משמרת ערב זהה למשמרת בוקר, כי זה אותו תורן לכל היום
        const pE_req = getReq(day, false, false);
        const aE_req = getReq(day, false, true);
        const pM = scheduleResultMap[`${day.key}_morning_false`] || [];
        const aM = scheduleResultMap[`${day.key}_morning_true`] || [];
        
        const pE = pM.slice(0, pE_req);
        const aE = aM.slice(0, aE_req);

        // יצירת קונפליקטים במידה ויש חוסר
        if (pE.length < pE_req) {
          dayConflictsBuffer.push({ shiftStr: 'ערב', typeStr: 'פלס״ם', req: pE_req, found: pE.length, constraintText: '', day });
        }
        if (aE.length < aE_req) {
          dayConflictsBuffer.push({ shiftStr: 'ערב', typeStr: 'אג״ם', req: aE_req, found: aE.length, constraintText: '', day });
        }
        
        eveningShift = [...pE, ...aE];
      } else {
        const pE = scheduleResultMap[`${day.key}_evening_false`] || [];
        const aE = scheduleResultMap[`${day.key}_evening_true`] || [];
        eveningShift = [...pE, ...aE];
      }
    }

    schedule.push({
      dayName: day.name,
      shortName: day.key,
      isWeekend: isW,
      morning: morningShift.map(s => s.name),
      evening: eveningShift.map(s => s.name)
    });

    // Merge conflicts for the day
    const types = ["פלס״ם", "אג״ם"];
    types.forEach(type => {
      const mConflict = dayConflictsBuffer.find(c => c.day.key === day.key && c.typeStr === type && c.shiftStr === 'בוקר');
      const eConflict = dayConflictsBuffer.find(c => c.day.key === day.key && c.typeStr === type && c.shiftStr === 'ערב');
      
      if (mConflict && eConflict) {
        conflicts.push(`ביום ${day.name} לכל היום חסרים תורני ${type} (נדרשו ${mConflict.req} למשמרת, אבל במאגר נמצא רק חייל ${mConflict.found} פנוי ורשאי לעלות!). \n${mConflict.constraintText || eConflict.constraintText || ''}`);
      } else {
        if (mConflict) conflicts.push(`ביום ${day.name} במשמרת בוקר חסרים תורני ${type} (נדרשו ${mConflict.req}, אבל במאגר נמצאו רק ${mConflict.found} פנויים). \n${mConflict.constraintText || ''}`);
        if (eConflict) conflicts.push(`ביום ${day.name} במשמרת ערב חסרים תורני ${type} (נדרשו ${eConflict.req}, אבל במאגר נמצאו רק ${eConflict.found} פנויים). \n${eConflict.constraintText || ''}`);
      }
    });
  });

  if (conflicts.length > 0) {
    throw new SchedulingConflictError("השיבוץ נכשל עקב אילוצי כוח אדם", conflicts);
  }

  return {
    status: 'success',
    totalEligible: eligibleSoldiers.length,
    totalExempt: totalExemptions,
    schedule,
    considerations: [
      "✓ שוויון במסגרות הסופ״ש והאמצ״ש כערך עליון (נלמד מפידבק): המערכת שמה את ההגינות והשוויון בכמות המשמרות (בתוך אותה מסגרת - סופ״ש או אמצ״ש) בראש סדר העדיפויות, אפילו לפני הניסיון למנוע משמרות יום אחרי יום. זאת כדי להבטיח שאף אחד לא נשאר ריק בזמן שאחרים טוחנים.",
      "✓ משקלים משמעותיים למניעת עומס חריג: למרות שהגינות חשובה, המערכת תסרב (ככל הניתן) לתת לאותו חייל משמרת כפולה בוקר+ערב, או 3 ימים ברצף, אלא אם אין שום פתרון אחר.",
      "✓ שחרור עומס הסופ״ש: יום חמישי מוגדר כעת כיום סופ״ש לכל דבר מבחינת סינון חיילים (רק סוגרי סופ״ש עולים בו), אך המשמרות בו נספרות כמשמרות סופ״ש כדי למנוע טחינה של חייל אחד.",
      "✓ שוויון סך כל המשמרות: משמש כשובר שוויון סופי כדי להבטיח צדק כללי במבט מלמעלה.",
      "✓ פיזור מחלקתי ורוטציית שבת ממשיכים להישמר כרגיל כשיקולים משניים."
    ]
  };
};
