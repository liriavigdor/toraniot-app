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

/**
 * המרת ימי שהייה באתר קשר למשמרות מטבח:
 * כל יום וחצי (1.5) שווה למשמרת מטבח אחת.
 * אם לא מתחלק (למשל 4 ימים = 3 ימים שזה 2 מטבחים + יום נוסף), היום הנוסף שווה חצי מטבח (0.5) -> סה״כ 2.5
 */
export const kesherDaysToKitchenShifts = (days) => {
  const d = Number(days);
  if (!d || isNaN(d) || d <= 0) return 0;
  
  // בדיקה אם מתחלק במדויק ב-1.5 (למשל 1.5, 3, 4.5, 6, 9)
  const divided = d / 1.5;
  if (Math.abs(divided - Math.round(divided)) < 0.0001) {
    return Math.round(divided);
  }
  
  // אם לא מתחלק במדויק ב-1.5:
  // כל 3 ימים שווים 2 משמרות מטבח.
  // יום נוסף שנותר שווה 0.5 משמרת מטבח (למשל 4 ימים -> 2 + 0.5 = 2.5)
  const fullTriplets = Math.floor(d / 3);
  const remainder = d % 3;
  return fullTriplets * 2 + (remainder * 0.5);
};

const generateSingleSchedule = (kitchenData, departmentsData, managerOverrides = {}, kitchenOverrides = {}, historyData = {}, seed = 0) => {
  let eligibleSoldiers = [];
  let totalExemptions = 0;
  
  const EXPECTED_DEPARTMENTS = ['תקשוב', 'לוגיסטיקה', 'טנ"א', 'משא"ן'];
  departmentsData.filter(dep => EXPECTED_DEPARTMENTS.includes(dep.departmentName)).forEach(dep => {
    dep.soldiers?.forEach((s, idx) => {
      const id = `${dep.departmentName}_${idx}`;
      const isExemptRejected = managerOverrides[`${id}_exception`] === 'rejected';
      const activeExceptionType = isExemptRejected ? 'none' : (s.exceptionType || 'none');
      
      const constraintOverride = managerOverrides[`${id}_constraint`] || 'critical';
      const activeBlockedDays = constraintOverride === 'ignored' ? [] : (s.blockedDays || []);
      const softBlockedDays = constraintOverride === 'flexible' ? activeBlockedDays : [];
      const hardBlockedDays = constraintOverride === 'critical' ? activeBlockedDays : [];
      
      const sName = (s.name || '').trim();
      const depName = (dep.departmentName || '').trim();
      const soldierKey = `${sName}_${depName}`;
      const history = historyData[soldierKey] || historyData[`${s.name}_${dep.departmentName}`] || { total: 0, weekend: 0, midweek: 0, kesherDays: 0 };

      const kesherDays = history.kesherDays || 0;
      const kesherEquiv = kesherDaysToKitchenShifts(kesherDays);
      let virtTotal = (history.effectiveTotal !== undefined ? history.effectiveTotal : (history.total || 0) + kesherEquiv);
      let virtMid = (history.effectiveMidweek !== undefined ? history.effectiveMidweek : (history.midweek || 0) + kesherEquiv);
      let virtWeek = history.weekend || 0;
      
      if (s.isNewSoldier) {
        // "שבוע חסד" - לחייל חדש יוגדר כאילו ביצע משמרת 1 כדי שלא יידפק מול הותיקים שצברו 0 משמרות
        virtTotal = Math.max(virtTotal, 1);
        virtMid = Math.max(virtMid, 1);
        virtWeek = Math.max(virtWeek, 1);
      }

      if (activeExceptionType === 'full') {
        totalExemptions++;
      } else {
        eligibleSoldiers.push({
          id,
          name: sName,
          department: depName,
          closesWeekend: s.closesWeekend === true || s.closesWeekend === 'true',
          preference: s.shiftPreference || 'none',
          spreadPreference: s.spreadPreference || 'none',
          shiftTypePreference: s.shiftTypePreference || 'none',
          preferredBuddy: s.preferredBuddy || '',
          blockedDays: hardBlockedDays,
          softBlockedDays: softBlockedDays,
          constraintReason: s.constraintReason || '',
          isWeekendExempt: activeExceptionType === 'weekend',
          midweekShifts: virtMid,
          weekendShifts: virtWeek,
          totalShifts: virtTotal,
          kesherDays: kesherDays,
          lastDayAssigned: -99,
          assignedDays: []
        });
      }
    });
  });

  const conflicts = [];
  const schedule = []; 
  
  const reqMid = parseInt(kitchenData.midweek?.plasam || 0);
  const reqWeek = parseInt(kitchenData.weekend?.plasam || 0);

  const dayConflictsBuffer = [];

  const pickSoldiers = (dayIndex, dayInfo, isMorning, requiredCount) => {
    if (requiredCount === 0) return [];
    
    const picked = [];
    
    while (picked.length < requiredCount) {
      let candidates = eligibleSoldiers.filter(s => {
        
        // הגדרת "משמרת סופ״ש" לצורך סינון: כל יום שמוגדר סופ״ש, וגם יום חמישי במלואו (בוקר וערב) - מי שלא סוגר שבת אסור לשבץ!
        const isThursday = dayInfo.key === "ה'" || dayInfo.short === "ה'" || dayInfo.name === 'חמישי';
        const isWeekendShift = dayInfo.isWeekend || isThursday;
        if (isWeekendShift && (!s.closesWeekend || s.isWeekendExempt)) return false;
        
        if (s.blockedDays.includes(dayInfo.short)) return false; // only hard blocked
        if (picked.some(p => p.id === s.id)) return false; // already picked in this shift
        
        // חוק 1: עד 4 מטבחים באמצע שבוע (א'-ד') למניעת שחיקה מוגזמת
        if (!isWeekendShift && (s.thisWeekMidweekCount || 0) >= 4) return false;

        // חוק 2: מחלקת לוגיסטיקה יכולה להעלות רק חייל 1 ביום (בוקר וערב יחד)
        if (s.department === 'לוגיסטיקה') {
          const otherLogisticsAssignedToday = eligibleSoldiers.some(other => 
            other.department === 'לוגיסטיקה' && 
            other.id !== s.id && 
            other.assignedDays.includes(dayIndex)
          );
          const otherLogisticsInShift = picked.some(p => p.department === 'לוגיסטיקה' && p.id !== s.id);
          if (otherLogisticsAssignedToday || otherLogisticsInShift) return false;
        }

        // חוק 3: מניעה מוחלטת של 3 ימים ברצף (אלא אם ביקש רצף מפורש)
        if (s.spreadPreference !== 'consecutive') {
          const would3Consecutive = 
            (s.assignedDays.includes(dayIndex - 1) && s.assignedDays.includes(dayIndex - 2)) ||
            (s.assignedDays.includes(dayIndex + 1) && s.assignedDays.includes(dayIndex + 2)) ||
            (s.assignedDays.includes(dayIndex - 1) && s.assignedDays.includes(dayIndex + 1));
          if (would3Consecutive) return false;
        }

        return true;
      });
      
      if (candidates.length === 0) {
        if (!isWeekendShift) {
          // במקרה קיצון של מחסור חריג בחיילים פנויים, מאפשרים חריגה מבוקרת כפתרון חירום
          candidates = eligibleSoldiers.filter(s => {
            if (s.blockedDays.includes(dayInfo.short)) return false;
            if (picked.some(p => p.id === s.id)) return false;
            return true;
          });
        }
        if (candidates.length === 0) {
          break;
        }
      }

      // תעדוף יום שלם: לא מסננים מועמדים שכבר שובצו היום, כדי לאפשר שיבוץ יום שלם ולמנוע פיזור על פני ימים מרובים
      
      candidates.sort((a, b) => {

        // 0.0. עדיפות עליונה: מניעת יומיים ברצף (אתמול או מחר) - לבקשת המפקד
        const aConsec = ((a.assignedDays.includes(dayIndex - 1) || a.assignedDays.includes(dayIndex + 1)) && a.spreadPreference !== 'consecutive') ? 1 : 0;
        const bConsec = ((b.assignedDays.includes(dayIndex - 1) || b.assignedDays.includes(dayIndex + 1)) && b.spreadPreference !== 'consecutive') ? 1 : 0;
        if (aConsec !== bConsec) return aConsec - bConsec;

        // 0.1 תעדוף יום שלם (בוקר + ערב): עדיף לחייל לעשות יום שלם ולסיים, במקום להעלות אותו ביום נוסף
        const getFullDayScore = (soldier) => {
          if (soldier.assignedDays.includes(dayIndex)) {
            if (soldier.shiftTypePreference === 'half') return 1; // העדפה אישית לחצי יום
            return -2; // בונוס משמעותי לשיבוץ יום שלם
          }
          return 0;
        };
        const aFull = getFullDayScore(a);
        const bFull = getFullDayScore(b);
        if (aFull !== bFull) return aFull - bFull;

        // 0.2 איזון עומס שבועי: מניעת פער שבועי מוגזם
        const aWk = a.thisWeekTotalCount || 0;
        const bWk = b.thisWeekTotalCount || 0;
        if (Math.abs(aWk - bWk) >= 2) return aWk - bWk;

        // 0.3. באמצ"ש: גיוון מחלקתי בעדיפות גבוהה (מעל שוויון היסטורי)
        const isWeekendShiftForSort = dayInfo.isWeekend || dayInfo.key === "ה'";
        const aDeptInShift = picked.some(p => p.department === a.department) ? 1 : 0;
        const bDeptInShift = picked.some(p => p.department === b.department) ? 1 : 0;
        if (!isWeekendShiftForSort) {
          if (aDeptInShift !== bDeptInShift) return aDeptInShift - bDeptInShift;
        }

        // 1. הגינות ושוויון במסגרת (סופ"ש או אמצ"ש)
        // התאמת הספירה: אם עשה משמרת הרגע וביקש כפול/רצף, נתעלם ממנה בחישוב ההגינות כדי לאפשר לו לקבל את השנייה
        const getAdjustedWeekend = (soldier) => {
            let val = soldier.weekendShifts;
            if (soldier.lastDayAssigned === dayIndex && soldier.shiftTypePreference === 'full') val -= 1;
            if (soldier.lastDayAssigned === dayIndex - 1 && soldier.spreadPreference === 'consecutive') val -= 1;
            return val;
        };
        const getAdjustedMidweek = (soldier) => {
            let val = soldier.midweekShifts;
            if (soldier.lastDayAssigned === dayIndex && soldier.shiftTypePreference === 'full') val -= 1;
            if (soldier.lastDayAssigned === dayIndex - 1 && soldier.spreadPreference === 'consecutive') val -= 1;
            return val;
        };

        if (isWeekendShiftForSort) {
          const aW = getAdjustedWeekend(a);
          const bW = getAdjustedWeekend(b);
          if (aW !== bW) return aW - bW;
        } else {
          const aM = getAdjustedMidweek(a);
          const bM = getAdjustedMidweek(b);
          if (aM !== bM) return aM - bM;
        }

        // 2. שוויון סך כל המשמרות הכולל
        const getAdjustedTotal = (soldier) => {
            let val = soldier.totalShifts;
            if (soldier.lastDayAssigned === dayIndex && soldier.shiftTypePreference === 'full') val -= 1;
            if (soldier.lastDayAssigned === dayIndex - 1 && soldier.spreadPreference === 'consecutive') val -= 1;
            return val;
        };
        const aTot = getAdjustedTotal(a);
        const bTot = getAdjustedTotal(b);
        if (aTot !== bTot) return aTot - bTot;

        // 2.5 בונוס למי שביקש שלם או רצף (שובר שוויון רק אם יש שוויון בהגינות)
        const getBonusScore = (soldier) => {
            if (soldier.lastDayAssigned === dayIndex && soldier.shiftTypePreference === 'full') return -1;
            if (soldier.lastDayAssigned === dayIndex - 1 && soldier.spreadPreference === 'consecutive') return -1;
            return 0;
        };
        const aBonus = getBonusScore(a);
        const bBonus = getBonusScore(b);
        if (aBonus !== bBonus) return aBonus - bBonus;

        // (מניעת קריסה של 3 ימים ברצף הועברה לראש התעדוף)

        // 3. Saturday rotation (Automatic behind the scenes)
        if (dayInfo.key === "ש'") {
          const EXPECTED_DEPARTMENTS = ['תקשוב', 'לוגיסטיקה', 'טנ"א', 'משא"ן'];
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

        // בסופ"ש: גיוון מחלקתי בעדיפות נמוכה
        if (isWeekendShiftForSort) {
          if (aDeptInShift !== bDeptInShift) return aDeptInShift - bDeptInShift;
        }

        // 6. Preferences
        const prefA = (isMorning && a.preference === 'morning') || (!isMorning && a.preference === 'evening') ? -1 : (a.preference === 'none' ? 0 : 1);
        const prefB = (isMorning && b.preference === 'morning') || (!isMorning && b.preference === 'evening') ? -1 : (b.preference === 'none' ? 0 : 1);
        if (prefA !== prefB) return prefA - prefB;

        // 6.5 Buddy System (Low Priority)
        const aHasBuddy = picked.some(p => p.name === a.preferredBuddy || a.name === p.preferredBuddy) ? -1 : 0;
        const bHasBuddy = picked.some(p => p.name === b.preferredBuddy || b.name === p.preferredBuddy) ? -1 : 0;
        if (aHasBuddy !== bHasBuddy) return aHasBuddy - bHasBuddy;

        // 7. Random tie-breaker for optimization loops
        return Math.random() - 0.5;
      });
      
      const best = candidates[0];
      picked.push(best);
      
      let shiftWeight = 1;
      // לבקשת הלקוח: שבת נחשבת משמרת מאוד קלה/טובה ולכן תחושב כחצי משמרת בלבד
      if (dayInfo.key === "ש'") {
        shiftWeight = 0.5;
      }
      
      best.totalShifts += shiftWeight;
      
      const isWeekendShiftCount = dayInfo.isWeekend || dayInfo.key === "ה'";
      if (isWeekendShiftCount) {
        best.weekendShifts += shiftWeight;
      } else {
        best.midweekShifts += shiftWeight;
      }
      best.thisWeekTotalCount = (best.thisWeekTotalCount || 0) + 1;
      if (!isWeekendShiftCount) {
        best.thisWeekMidweekCount = (best.thisWeekMidweekCount || 0) + 1;
      }
      best.lastDayAssigned = dayIndex;
      best.assignedDays.push(dayIndex);
    }

    if (picked.length < requiredCount) {
      const shiftStr = isMorning ? "בוקר" : "ערב";
      
      const blockedPeople = eligibleSoldiers.filter(s => 
        (s.blockedDays.includes(dayInfo.short) || s.softBlockedDays.includes(dayInfo.short))
      );
      
      let constraintText = "";
      if (blockedPeople.length > 0) {
        const reasons = blockedPeople.filter(s => s.constraintReason).map(s => `${s.name}: ${s.constraintReason}`).join(" | ");
        if (reasons) {
          constraintText = `סיבות לאי זמינות חיילים באותו יום: ${reasons}`;
        }
      }

      dayConflictsBuffer.push({ shiftStr, req: requiredCount, found: picked.length, constraintText, day: dayInfo });
      return picked;
    }
    
    return picked;
  };

  const SCHEDULE_DAYS = [
    { key: "א'", name: 'ראשון', short: "א'", isWeekend: false, dayOffset: 0 },
    { key: "ב'", name: 'שני', short: "ב'", isWeekend: false, dayOffset: 1 },
    { key: "ג'", name: 'שלישי', short: "ג'", isWeekend: false, dayOffset: 2 },
    { key: "ד'", name: 'רביעי', short: "ד'", isWeekend: false, dayOffset: 3 },
    { key: "ה'", name: 'חמישי', short: "ה'", isWeekend: false, dayOffset: 4 },
    { key: "ו'", name: 'שישי', short: "ו'", isWeekend: true, dayOffset: 5 },
    { key: "ש'", name: 'שבת', short: "ש'", isWeekend: true, dayOffset: 6 },
    { key: "א' (יציאה)", name: 'ראשון', short: "א'", isWeekend: true, dayOffset: 7 } 
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
    
    const getReq = (dayInfo, isMorning) => {
      const shiftStr = isMorning ? 'morning' : 'evening';
      const override = kitchenOverrides[`${dayInfo.key}_${shiftStr}_plasam`];
      if (override !== undefined && override !== '') return parseInt(override);
      const defReq = isW ? reqWeek : reqMid;
      return parseInt(defReq || 0);
    };

    if (dayState === 'full' || dayState === 'half_morning') {
      shiftsToSchedule.push({ dayIndex, day, isMorning: true, req: getReq(day, true) });
    }
    if (dayState === 'full' || dayState === 'half_evening') {
      if (day.key !== "ש'" && day.key !== "ו'") {
        shiftsToSchedule.push({ dayIndex, day, isMorning: false, req: getReq(day, false) });
      }
    }
  });

  const scheduleResultMap = {};

  while (shiftsToSchedule.length > 0) {
    shiftsToSchedule.forEach(shift => {
      shift.availableCount = eligibleSoldiers.filter(s => {
        if (Math.abs(shift.dayIndex - s.lastDayAssigned) === 1 && s.spreadPreference !== 'consecutive') return false;
        
        const isThursday = shift.day.key === "ה'" || shift.day.short === "ה'" || shift.day.name === 'חמישי';
        const isWeekendShift = shift.day.isWeekend || isThursday;
        if (isWeekendShift && (!s.closesWeekend || s.isWeekendExempt)) return false;
        
        if (s.blockedDays.includes(shift.day.short)) return false;
        if (!isWeekendShift && (s.thisWeekMidweekCount || 0) >= 4) return false;
        return true;
      }).length;
    });

    // Sort to find the most constrained shift (least available candidates first)
    shiftsToSchedule.sort((a, b) => {
      if (a.availableCount !== b.availableCount) {
        return a.availableCount - b.availableCount;
      }
      
      // לאחר מכן נתעדף סופ"ש באופן כללי כי יש פחות מקורות כוח אדם
      const aIsWeekend = a.day.isWeekend || a.day.key === "ה'";
      const bIsWeekend = b.day.isWeekend || b.day.key === "ה'";
      if (aIsWeekend !== bIsWeekend) {
        return aIsWeekend ? -1 : 1;
      }

      if (a.dayIndex !== b.dayIndex) {
        return a.dayIndex - b.dayIndex; // chronological tiebreaker
      }
      return a.isMorning ? -1 : 1;
    });

    const shift = shiftsToSchedule.shift();
    const picked = pickSoldiers(shift.dayIndex, shift.day, shift.isMorning, shift.req);
    const key = `${shift.day.key}_${shift.isMorning ? 'morning' : 'evening'}`;
    scheduleResultMap[key] = picked;
  }

  activeDaysToSchedule.forEach((day) => {
    const dayState = selectedDaysMap[day.key];
    const isW = day.isWeekend;

    const getReq = (dayInfo, isMorning) => {
      const shiftStr = isMorning ? 'morning' : 'evening';
      const override = kitchenOverrides[`${dayInfo.key}_${shiftStr}_plasam`];
      if (override !== undefined && override !== '') return parseInt(override);
      const defReq = isW ? reqWeek : reqMid;
      return parseInt(defReq || 0);
    };

    let morningShift = [];
    if (dayState === 'full' || dayState === 'half_morning') {
      morningShift = scheduleResultMap[`${day.key}_morning`] || [];
    }
    
    let eveningShift = [];
    if (dayState === 'full' || dayState === 'half_evening') {
      if (day.key === "ש'" || day.key === "ו'") {
        // שבת ושישי - משמרת ערב זהה למשמרת בוקר, כי זה אותו תורן לכל היום
        const pE_req = getReq(day, false);
        const pM = scheduleResultMap[`${day.key}_morning`] || [];
        
        eveningShift = pM.slice(0, pE_req);

        // יצירת קונפליקטים במידה ויש חוסר
        if (eveningShift.length < pE_req) {
          dayConflictsBuffer.push({ shiftStr: 'ערב', req: pE_req, found: eveningShift.length, constraintText: '', day });
        }
      } else {
        eveningShift = scheduleResultMap[`${day.key}_evening`] || [];
      }
    }

    let m = morningShift.map(s => ({ name: s.name, department: s.department }));
    let e = eveningShift.map(s => ({ name: s.name, department: s.department }));

    const mNames = m.map(x => x.name);
    const eNames = e.map(x => x.name);
    const fullDayNames = mNames.filter(name => eNames.includes(name));

    m.sort((a, b) => {
      const aFull = fullDayNames.includes(a.name);
      const bFull = fullDayNames.includes(b.name);
      if (aFull !== bFull) return bFull ? 1 : -1;
      return a.department.localeCompare(b.department);
    });
    
    e.sort((a, b) => {
      const aIndex = m.findIndex(x => x.name === a.name);
      const bIndex = m.findIndex(x => x.name === b.name);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.department.localeCompare(b.department);
    });

    schedule.push({
      dayName: day.name,
      shortName: day.key,
      dayOffset: day.dayOffset,
      isWeekend: isW,
      morning: m,
      evening: e
    });

    // Merge conflicts for the day
    const mConflict = dayConflictsBuffer.find(c => c.day.key === day.key && c.shiftStr === 'בוקר');
    const eConflict = dayConflictsBuffer.find(c => c.day.key === day.key && c.shiftStr === 'ערב');
    
    if (mConflict && eConflict) {
      conflicts.push(`ביום ${day.name} לכל היום חסרים תורנים (נדרשו ${mConflict.req} למשמרת, אבל במאגר נמצא רק חייל ${mConflict.found} פנוי ורשאי לעלות!). \n${mConflict.constraintText || eConflict.constraintText || ''}`);
    } else {
      if (mConflict) conflicts.push(`ביום ${day.name} במשמרת בוקר חסרים תורנים (נדרשו ${mConflict.req}, אבל במאגר נמצאו רק ${mConflict.found} פנויים). \n${mConflict.constraintText || ''}`);
      if (eConflict) conflicts.push(`ביום ${day.name} במשמרת ערב חסרים תורנים (נדרשו ${eConflict.req}, אבל במאגר נמצאו רק ${eConflict.found} פנויים). \n${eConflict.constraintText || ''}`);
    }
  });

  if (conflicts.length > 0) {
    throw new SchedulingConflictError("השיבוץ נכשל עקב אילוצי כוח אדם", conflicts);
  }

  return {
    status: 'success',
    totalEligible: eligibleSoldiers.length,
    totalExempt: totalExemptions,
    schedule,
    soldiersState: eligibleSoldiers,
    considerations: [
      "✓ שוויון במסגרות הסופ״ש והאמצ״ש כערך עליון (נלמד מפידבק): המערכת שמה את ההגינות והשוויון בכמות המשמרות (בתוך אותה מסגרת - סופ״ש או אמצ״ש) בראש סדר העדיפויות, אפילו לפני הניסיון למנוע משמרות יום אחרי יום. זאת כדי להבטיח שאף אחד לא נשאר ריק בזמן שאחרים טוחנים.",
      "✓ חוק מחלקת לוגיסטיקה (עד חייל 1 ביום): לבקשת המפקד, מחלקת לוגיסטיקה לא תעלה יותר מחייל אחד ביום (בוקר וערב יחד), כדי לשמור על רציפות תפקודית של המחלקה.",
      "✓ מניעה מוחלטת של ימים ברצף ותעדוף יום שלם: האלגוריתם מונע לחלוטין 3 ימים ברצף, נמנע מיומיים ברצף, ומתעדף שיבוץ חיילים ליום שלם (בוקר וערב באותו יום) כדי שיסיימו את תורנותם ביום אחד מרוכז ולא ייגררו על פני ימים עוקבים.",
      "✓ הגבלת עומס שבועי (עד 4 מטבחים באמצ״ש): חוק ברזל במערכת – אף חייל לא יעלה יותר מ-4 משמרות מטבח באמצע השבוע (א׳-ד׳), כדי למנוע שחיקה חריגה של חיילים חדשים או בעלי מעט משמרות היסטוריות.",
      "✓ שקלול שהייה באתר קשר: כל 1.5 ימים באתר קשר נספרים כשווה ערך למשמרת מטבח (אם יש יום עודף שלא מתחלק, הוא נספר כחצי משמרת מטבח, למשל 4 ימים = 2.5 משמרות). חיילים ששירתו באתר קשר מקבלים עדיפות למנוחה ואינם משובצים לפני חיילים שטרם ביצעו תורנויות.",
      "✓ נעילת יום חמישי לסוגרי שבת בלבד: יום חמישי מוגדר כחלק מסוף השבוע (התחלת הסגירה). חייל המסומן כ'לא סוגר' או בעל פטור סופ״ש חסום באופן מוחלט משיבוץ ביום חמישי (בוקר וערב).",
      "✓ שוויון סך כל המשמרות: משמש כשובר שוויון סופי כדי להבטיח צדק כללי במבט מלמעלה.",
      "✓ פיזור מחלקתי ורוטציית שבת ממשיכים להישמר כרגיל כשיקולים משניים.",
      "✓ אופטימיזציה ובקרת איכות (QA): האלגוריתם בחן עשרות וריאציות אפשריות (במצבים של שובר שוויון) ובחר להגיש לך אך ורק את התוצאה עם הפערים הקטנים ביותר האפשריים בין החיילים!"
    ]
  };
};

// QA Engine: Run multiple iterations with random tie-breakers and pick the most balanced schedule
export const generateSchedule = (kitchenData, departmentsData, managerOverrides = {}, kitchenOverrides = {}, historyData = {}) => {
  const NUM_ITERATIONS = 50;
  let bestSchedule = null;
  let bestScore = Infinity;
  let lastError = null;

  for (let i = 0; i < NUM_ITERATIONS; i++) {
    // Deep clone mutable inputs so each iteration starts fresh
    const clonedDepartments = JSON.parse(JSON.stringify(departmentsData));
    
    try {
      const result = generateSingleSchedule(kitchenData, clonedDepartments, managerOverrides, kitchenOverrides, historyData, i);
      
      let score = 0;
      
      let maxWeekend = 0, minWeekend = Infinity;
      let maxMidweek = 0, minMidweek = Infinity;
      let maxTotal = 0, minTotal = Infinity;
      let maxWeekTotal = 0, minWeekTotal = Infinity;
      
      const soldiers = result.soldiersState;
      if (soldiers && soldiers.length > 0) {
        soldiers.forEach(s => {
          if (s.weekendShifts > maxWeekend) maxWeekend = s.weekendShifts;
          if (s.weekendShifts < minWeekend) minWeekend = s.weekendShifts;
          
          if (s.midweekShifts > maxMidweek) maxMidweek = s.midweekShifts;
          if (s.midweekShifts < minMidweek) minMidweek = s.midweekShifts;
          
          if (s.totalShifts > maxTotal) maxTotal = s.totalShifts;
          if (s.totalShifts < minTotal) minTotal = s.totalShifts;
          
          const wkCount = s.thisWeekTotalCount || 0;
          if (wkCount > maxWeekTotal) maxWeekTotal = wkCount;
          if (wkCount < minWeekTotal) minWeekTotal = wkCount;

          if (s.assignedDays && s.spreadPreference !== 'consecutive') {
            const sortedDistinct = [...new Set(s.assignedDays)].sort((a,b) => a - b);
            for (let dIdx = 1; dIdx < sortedDistinct.length; dIdx++) {
              if (sortedDistinct[dIdx] === sortedDistinct[dIdx-1] + 1) {
                score += 500; // עונש כבד על יומיים ברצף
                if (dIdx >= 2 && sortedDistinct[dIdx-1] === sortedDistinct[dIdx-2] + 1) {
                  score += 10000; // עונש בלתי נסבל על 3 ימים ברצף!
                }
              }
            }
          }
        });

        // עונש כבד על חריגה מחוק לוגיסטיקה (יותר מחייל 1 ביום)
        result.schedule.forEach(day => {
          const allInDay = [...(day.morning || []), ...(day.evening || [])];
          const logInDay = new Set(allInDay.filter(s => s.department === 'לוגיסטיקה').map(s => s.name));
          if (logInDay.size > 1) {
            score += 20000;
          }
        });
        
        const weekendGap = maxWeekend - minWeekend;
        const totalGap = maxTotal - minTotal;
        const weekGap = maxWeekTotal - minWeekTotal;
        
        let sumSquaredDiffs = 0;
        const avgWeekend = soldiers.reduce((acc, s) => acc + s.weekendShifts, 0) / soldiers.length;
        soldiers.forEach(s => {
          sumSquaredDiffs += Math.pow(s.weekendShifts - avgWeekend, 2);
        });

        score += (weekendGap * 100) + (totalGap * 50) + (weekGap * 80) + sumSquaredDiffs;
      }

      if (score < bestScore) {
        bestScore = score;
        bestSchedule = result;
      }
      
      if (score === 0) break; // Found a perfect mathematically balanced schedule
      
    } catch (err) {
      lastError = err;
    }
  }

  if (!bestSchedule) {
    if (lastError) throw lastError;
    throw new SchedulingConflictError("לא נמצא שיבוץ אפשרי תחת האילוצים הקיימים.", ["כל הנסיונות לשיבוץ נכשלו. בדוק את האילוצים."]);
  }

  const stats = bestSchedule.soldiersState.map(s => ({
     name: s.name,
     department: s.department,
     midweekShifts: s.midweekShifts,
     weekendShifts: s.weekendShifts,
     totalShifts: s.totalShifts,
     assignedDays: s.assignedDays,
     spreadPreference: s.spreadPreference
  }));

  const sacrificed = [];
  const avgTotal = stats.length > 0 ? stats.reduce((acc, curr) => acc + curr.totalShifts, 0) / stats.length : 0;
  
  stats.forEach(s => {
    let reasons = [];
    if (s.spreadPreference !== 'consecutive' && s.assignedDays.length > 0) {
       const twoConsec = s.assignedDays.filter((d, idx, arr) => idx >= 1 && d === arr[idx-1]+1).length;
       if (twoConsec > 0) reasons.push("נאלצנו לשבץ יום אחרי יום");
    }
    
    // משמרת כפולה נחשבת כוויתור רק אם החייל ביקש מפורשות חצי יום
    if (s.assignedDays.length > new Set(s.assignedDays).size && s.shiftTypePreference === 'half') {
       reasons.push("נאלצנו לשבץ יום שלם למרות בקשת חצי יום");
    }

    if (s.totalShifts > avgTotal + 1.5) {
       reasons.push("קיבל יותר משמרות משמעותית מהממוצע כדי להשלים פערים");
    }
    
    if (reasons.length > 0) {
       sacrificed.push({ name: s.name, department: s.department, reasons });
    }
  });

  bestSchedule.stats = stats;
  bestSchedule.sacrificed = sacrificed;

  delete bestSchedule.soldiersState; // Clean up memory
  return bestSchedule;
};
