import { formatDayDate } from './dateUtils.js';

export const SCHEDULE_DAYS = [
  { key: "א'", name: 'ראשון', short: "א'", isWeekend: false, dayOffset: 0 },
  { key: "ב'", name: 'שני', short: "ב'", isWeekend: false, dayOffset: 1 },
  { key: "ג'", name: 'שלישי', short: "ג'", isWeekend: false, dayOffset: 2 },
  { key: "ד'", name: 'רביעי', short: "ד'", isWeekend: false, dayOffset: 3 },
  { key: "ה'", name: 'חמישי', short: "ה'", isWeekend: true, dayOffset: 4 },
  { key: "ו'", name: 'שישי', short: "ו'", isWeekend: true, dayOffset: 5 },
  { key: "ש'", name: 'שבת', short: "ש'", isWeekend: true, dayOffset: 6 },
  { key: "א' (יציאה)", name: 'ראשון (יציאה)', short: "א' (יציאה)", isWeekend: true, dayOffset: 7 }
];

/**
 * מחשב את מספר התורנים הנדרש למשמרת מסוימת בהתאם לדרישות המטבח והחרגות פרטניות
 */
export const getShiftRequiredCount = (dayKey, shiftTime, kitchenData, kitchenOverrides = {}) => {
  const activeDays = kitchenData?.activeDays || {
    "א'": 'half_evening',
    "ב'": 'full',
    "ג'": 'full',
    "ד'": 'full',
    "ה'": 'full',
    "ו'": 'full',
    "ש'": 'full',
    "א' (יציאה)": 'half_morning'
  };

  const dayState = activeDays[dayKey];
  const isMorning = shiftTime === 'morning';

  // בדיקת פעילות היום והמשמרת (חצי יום בוקר / חצי יום ערב / כבוי)
  if (!dayState || dayState === 'off') return 0;
  if (dayState === 'half_morning' && !isMorning) return 0;
  if (dayState === 'half_evening' && isMorning) return 0;

  // בדיקת חריגה פרטנית ראשית (kitchenOverrides)
  const overrideKey = `${dayKey}_${shiftTime}_plasam`;
  const overrideVal = kitchenOverrides[overrideKey];
  if (overrideVal !== undefined && overrideVal !== '' && overrideVal !== null) {
    return Math.max(0, parseInt(overrideVal, 10) || 0);
  }

  // דרישת ברירת מחדל מהמטבח (סופ״ש מול אמצ״ש)
  const dayObj = SCHEDULE_DAYS.find(d => d.key === dayKey);
  const isWeekend = dayObj ? dayObj.isWeekend : (dayKey === "ה'" || dayKey === "ו'" || dayKey === "ש'" || dayKey === "א' (יציאה)");
  
  const defVal = isWeekend 
    ? (kitchenData?.weekend?.plasam ?? 2) 
    : (kitchenData?.midweek?.plasam ?? 3);

  return Math.max(0, parseInt(defVal, 10) || 0);
};

/**
 * יצירת לוח שבועי מלא עם משבצות ריקות מוכנות למילוי חיילים
 * מותאם בדיוק למספר התורנים שמעודכן בדרישות טבחים
 */
export const createEmptyScheduleFromKitchen = (kitchenData, kitchenOverrides = {}, weekStartDate = null) => {
  return SCHEDULE_DAYS.map(day => {
    const morningCount = getShiftRequiredCount(day.key, 'morning', kitchenData, kitchenOverrides);
    const eveningCount = getShiftRequiredCount(day.key, 'evening', kitchenData, kitchenOverrides);

    const morning = Array.from({ length: morningCount }, () => ({
      name: '',
      department: '',
      isSlotEmpty: true,
      originalName: '',
      originalDepartment: '',
      isEdited: false
    }));

    const evening = Array.from({ length: eveningCount }, () => ({
      name: '',
      department: '',
      isSlotEmpty: true,
      originalName: '',
      originalDepartment: '',
      isEdited: false
    }));

    return {
      dayName: day.name,
      shortName: day.key,
      dayOffset: day.dayOffset,
      isWeekend: day.isWeekend,
      dateStr: weekStartDate ? formatDayDate(day.key, weekStartDate) : '',
      morning,
      evening
    };
  });
};

/**
 * התאמת לוח קיים לדרישות מטבח עדכניות:
 * שומר על חיילים שכבר שובצו במשבצות, ומתאים את סך המשבצות לכמות הנדרשת (מוסיף משבצות ריקות או מקצץ משבצות ריקות עודפות)
 */
export const syncScheduleWithKitchenRequirements = (currentSchedule, kitchenData, kitchenOverrides = {}, weekStartDate = null) => {
  if (!currentSchedule || !Array.isArray(currentSchedule) || currentSchedule.length === 0) {
    return createEmptyScheduleFromKitchen(kitchenData, kitchenOverrides, weekStartDate);
  }

  return SCHEDULE_DAYS.map(day => {
    const existingDay = currentSchedule.find(d => (d.shortName || d.key) === day.key) || {};
    const morningCount = getShiftRequiredCount(day.key, 'morning', kitchenData, kitchenOverrides);
    const eveningCount = getShiftRequiredCount(day.key, 'evening', kitchenData, kitchenOverrides);

    const adjustShift = (existingList = [], targetCount) => {
      const result = [...existingList];
      if (result.length < targetCount) {
        // הוספת משבצות ריקות להשלמת הכמות הנדרשת
        const needed = targetCount - result.length;
        for (let i = 0; i < needed; i++) {
          result.push({
            name: '',
            department: '',
            isSlotEmpty: true,
            originalName: '',
            originalDepartment: '',
            isEdited: false
          });
        }
      } else if (result.length > targetCount) {
        // קיצוץ: קודם מקצצים משבצות ריקות, ורק אם אין ברירה מקצצים מהסוף
        while (result.length > targetCount) {
          const emptyIdx = result.findLastIndex ? result.findLastIndex(s => !s.name || s.isSlotEmpty) : -1;
          if (emptyIdx !== -1) {
            result.splice(emptyIdx, 1);
          } else {
            result.pop();
          }
        }
      }
      return result;
    };

    return {
      dayName: day.name,
      shortName: day.key,
      dayOffset: day.dayOffset,
      isWeekend: day.isWeekend,
      dateStr: weekStartDate ? formatDayDate(day.key, weekStartDate) : (existingDay.dateStr || ''),
      morning: adjustShift(existingDay.morning, morningCount),
      evening: adjustShift(existingDay.evening, eveningCount)
    };
  });
};
