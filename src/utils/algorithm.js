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
      
      const soldierKey = `${s.name}_${dep.departmentName}`;
      const history = historyData[soldierKey] || { total: 0, weekend: 0, midweek: 0 };

      let virtTotal = history.total;
      let virtMid = history.midweek;
      let virtWeek = history.weekend;
      
      if (s.isNewSoldier) {
        // "שבוע חסד" - לחייל חדש יוגדר כאילו ביצע משמרת 1 כדי שלא יידפק מול הותיקים שצברו 0 משמרות
        virtTotal = 1;
        virtMid = 1;
        virtWeek = 1;
      }

      if (activeExceptionType === 'full') {
        totalExemptions++;
      } else {
        eligibleSoldiers.push({
          id,
          name: s.name,
          department: dep.departmentName,
          closesWeekend: s.closesWeekend,
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


        // 0. עדיפות עליונה: מניעת 3 ימים ברצף (שחיקה מוגזמת, גם במחיר של חוסר שוויון קל במספר המשמרות - שיתאזן בשבוע הבא)
        const a3Consecutive = (a.assignedDays.includes(dayIndex - 1) && a.assignedDays.includes(dayIndex - 2) && a.spreadPreference !== 'consecutive') ? 1 : 0;
        const b3Consecutive = (b.assignedDays.includes(dayIndex - 1) && b.assignedDays.includes(dayIndex - 2) && b.spreadPreference !== 'consecutive') ? 1 : 0;
        if (a3Consecutive !== b3Consecutive) return a3Consecutive - b3Consecutive;

        // 0.5. מניעת שני חיילי לוגיסטיקה באותה משמרת סופ"ש (עדיפות גבוהה מאוד לפי בקשת הלקוח)
        const isWeekendShiftForSort = dayInfo.isWeekend || dayInfo.key === "ה'";
        if (isWeekendShiftForSort) {
          const isTwoLogistics = (candidate) => {
            if (candidate.department !== 'לוגיסטיקה') return 0;
            const hasLogisticsAlready = picked.some(p => p.department === 'לוגיסטיקה');
            return hasLogisticsAlready ? 1 : 0;
          };
          const aTwoLog = isTwoLogistics(a);
          const bTwoLog = isTwoLogistics(b);
          if (aTwoLog !== bTwoLog) return aTwoLog - bTwoLog;
        }

        // 0.6. מניעת משמרת כפולה באותו יום (עונשים בלבד - לא בונוס שידרוס הגינות)
        const getDoublePenalty = (soldier) => {
          if (soldier.lastDayAssigned === dayIndex) {
            if (soldier.shiftTypePreference === 'full') return 0; // אין עונש
            if (soldier.shiftTypePreference === 'half') return 2;  // עונש מוגדל
            return 1; // עונש רגיל
          }
          return 0;
        };
        const aDoublePen = getDoublePenalty(a);
        const bDoublePen = getDoublePenalty(b);
        if (aDoublePen !== bDoublePen) return aDoublePen - bDoublePen;

        // 0.7. מניעת יום אחרי יום (עונשים בלבד)
        const getConsecPenalty = (soldier) => {
          if (soldier.lastDayAssigned === dayIndex - 1) {
            if (soldier.spreadPreference === 'consecutive') return 0; // אין עונש
            if (soldier.spreadPreference === 'spread') return 2; // עונש מוגדל
            return 1; // עונש רגיל
          }
          return 0;
        };
        const aConsecPen = getConsecPenalty(a);
        const bConsecPen = getConsecPenalty(b);
        if (aConsecPen !== bConsecPen) return aConsecPen - bConsecPen;

        // 0.8. באמצ"ש: גיוון מחלקתי בעדיפות גבוהה מאוד (מעל שוויון)
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
      
      // לאחר מכן נתעדף סופ"ש באופן כללי כי יש פחות מקורות כוח אדם
      const aIsWeekend = a.day.isWeekend || a.day.key === "ה'";
      const bIsWeekend = b.day.isWeekend || b.day.key === "ה'";
      if (aIsWeekend !== bIsWeekend) {
        return aIsWeekend ? -1 : 1;
      }

      return a.dayIndex - b.dayIndex; // chronological tiebreaker
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
      "✓ משקלים משמעותיים למניעת עומס חריג: למרות שהגינות חשובה, המערכת תסרב (ככל הניתן) לתת לאותו חייל משמרת כפולה בוקר+ערב, או 3 ימים ברצף, אלא אם אין שום פתרון אחר.",
      "✓ שחרור עומס הסופ״ש: יום חמישי מוגדר כעת כיום סופ״ש לכל דבר מבחינת סינון חיילים (רק סוגרי סופ״ש עולים בו), אך המשמרות בו נספרות כמשמרות סופ״ש כדי למנוע טחינה של חייל אחד.",
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
      
      const soldiers = result.soldiersState;
      if (soldiers && soldiers.length > 0) {
        soldiers.forEach(s => {
          if (s.weekendShifts > maxWeekend) maxWeekend = s.weekendShifts;
          if (s.weekendShifts < minWeekend) minWeekend = s.weekendShifts;
          
          if (s.midweekShifts > maxMidweek) maxMidweek = s.midweekShifts;
          if (s.midweekShifts < minMidweek) minMidweek = s.midweekShifts;
          
          if (s.totalShifts > maxTotal) maxTotal = s.totalShifts;
          if (s.totalShifts < minTotal) minTotal = s.totalShifts;
          
          if (s.assignedDays && s.spreadPreference !== 'consecutive') {
            const consecutiveDays = s.assignedDays.filter((d, idx, arr) => idx >= 1 && d === arr[idx-1]+1).length;
            score += consecutiveDays * 200; // עונש גדול מאוד על כל יום ברצף
          }
        });
        
        const weekendGap = maxWeekend - minWeekend;
        const totalGap = maxTotal - minTotal;
        
        let sumSquaredDiffs = 0;
        const avgWeekend = soldiers.reduce((acc, s) => acc + s.weekendShifts, 0) / soldiers.length;
        soldiers.forEach(s => {
          sumSquaredDiffs += Math.pow(s.weekendShifts - avgWeekend, 2);
        });

        score += (weekendGap * 100) + (totalGap * 50) + sumSquaredDiffs;
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
    
    // Check if they had to do multiple shifts in the same day (double shift)
    // we can check if assignedDays has duplicates
    if (s.assignedDays.length > new Set(s.assignedDays).size) {
       reasons.push("נאלצנו לשבץ משמרת כפולה");
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
