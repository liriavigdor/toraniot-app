/**
 * Date utility functions for weekly toraniot schedule (שבצ"ק)
 */

export const DAY_OFFSETS = {
  "א'": 0,
  "ב'": 1,
  "ג'": 2,
  "ד'": 3,
  "ה'": 4,
  "ו'": 5,
  "ש'": 6,
  "א' (יציאה)": 7
};

export const getDefaultSunday = () => {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 is Sunday
  // Calculate next Sunday (or today if today is Sunday)
  const diff = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const target = new Date(now);
  target.setDate(now.getDate() + diff);
  const yyyy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, '0');
  const dd = String(target.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const addDaysToDateStr = (dateStr, daysOffset) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  d.setDate(d.getDate() + daysOffset);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const formatDayDate = (shortName, startDateStr) => {
  if (!startDateStr) return '';
  const offset = DAY_OFFSETS[shortName];
  if (offset === undefined) return '';
  const [year, month, day] = startDateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  d.setDate(d.getDate() + offset);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}`;
};

export const getWeekRangeStr = (startDateStr) => {
  if (!startDateStr) return '';
  const [year, month, day] = startDateStr.split('-').map(Number);
  const start = new Date(year, month - 1, day);
  const end = new Date(year, month - 1, day);
  end.setDate(end.getDate() + 7);
  
  const startFormatted = `${String(start.getDate()).padStart(2, '0')}.${String(start.getMonth() + 1).padStart(2, '0')}`;
  const endFormatted = `${String(end.getDate()).padStart(2, '0')}.${String(end.getMonth() + 1).padStart(2, '0')}`;
  return `${startFormatted} - ${endFormatted}`;
};
