import React, { useState, useEffect } from 'react';
import { ClipboardCheck, CheckCircle2, AlertCircle, ArrowDown, FileText, XCircle, Share2, ChevronDown, ChevronUp, BrainCircuit, MessageSquareText, FileCheck, Unlock, PenLine, CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2, Scale, Radio, Search, Filter, RotateCcw, AlertTriangle } from 'lucide-react';
import html2canvas from 'html2canvas';
import { db } from '../firebase/firebase';
import { doc, collection, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { generateSchedule, SchedulingConflictError, kesherDaysToKitchenShifts } from '../utils/algorithm';
import { getDefaultSunday, formatDayDate, getWeekRangeStr, addDaysToDateStr } from '../utils/dateUtils';

// מחלקות שצריכות להגיש כדי שהמערכת תוכל לשבץ - נעדכן לפי הצורך
const EXPECTED_DEPARTMENTS = ['תקשוב', 'לוגיסטיקה', 'טנ"א', 'משא"ן'];

const ManagerScreen = () => {
  const [kitchenData, setKitchenData] = useState(null);
  const [departmentsData, setDepartmentsData] = useState([]);
  const [managerOverrides, setManagerOverrides] = useState({});
  const [kitchenOverrides, setKitchenOverrides] = useState(() => {
    const saved = localStorage.getItem('toraniot_kitchenOverrides');
    return saved ? JSON.parse(saved) : {};
  });
  const [showKitchenOverrides, setShowKitchenOverrides] = useState(false);
  const [algorithmResult, setAlgorithmResult] = useState(null);
  const [algorithmError, setAlgorithmError] = useState(null);
  const [whatsappNumber, setWhatsappNumber] = useState('0546231678');
  const [showConsiderations, setShowConsiderations] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [scheduleFilter, setScheduleFilter] = useState('all');
  const [previewEditModal, setPreviewEditModal] = useState(null);
  const [modalMode, setModalMode] = useState('select'); // 'select' | 'custom'
  const [modalSoldierKey, setModalSoldierKey] = useState('');
  const [modalCustomName, setModalCustomName] = useState('');
  const [modalCustomDept, setModalCustomDept] = useState('לוגיסטיקה');
  const [modalDayIdx, setModalDayIdx] = useState(0);
  const [modalShiftTime, setModalShiftTime] = useState('morning');

  const [justiceData, setJusticeData] = useState(null);
  const [historyData, setHistoryData] = useState({});
  const [kesherEntries, setKesherEntries] = useState([]);
  const [activeTab, setActiveTab] = useState('schedule'); // 'schedule' | 'justice'

  const [kesherSoldierKey, setKesherSoldierKey] = useState('');
  const [kesherDaysCount, setKesherDaysCount] = useState('1');
  const [kesherDate, setKesherDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [kesherNote, setKesherNote] = useState('');
  const [kesherSubmitting, setKesherSubmitting] = useState(false);
  const [kesherSuccessMsg, setKesherSuccessMsg] = useState('');

  const [justiceSearch, setJusticeSearch] = useState('');
  const [justiceDeptFilter, setJusticeDeptFilter] = useState('all');
  const [justiceSortBy, setJusticeSortBy] = useState('effectiveTotal'); // 'effectiveTotal' | 'kesherDays' | 'kitchenTotal' | 'name'
  const [justiceSortAsc, setJusticeSortAsc] = useState(false);

  const [showResetModal, setShowResetModal] = useState(false);
  const [resetKesherAlso, setResetKesherAlso] = useState(false);
  const [resetScheduleAlso, setResetScheduleAlso] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccessMsg, setResetSuccessMsg] = useState(false);

  const [editingShift, setEditingShift] = useState(null);
  const [addingShift, setAddingShift] = useState(null);
  const [transferredSuccess, setTransferredSuccess] = useState(false);
  const [signerName, setSignerName] = useState(() => {
    return localStorage.getItem('toraniot_signerName') || 'מנהל תורנויות';
  });
  const [signSuccessMessage, setSignSuccessMessage] = useState(false);
  const [isSigning, setIsSigning] = useState(false);

  const [weekStartDate, setWeekStartDate] = useState(() => {
    return localStorage.getItem('toraniot_weekStartDate') || getDefaultSunday();
  });

  const handleDateChange = (val) => {
    setWeekStartDate(val);
    localStorage.setItem('toraniot_weekStartDate', val);
  };

  const handleShiftWeek = (daysOffset) => {
    if (!weekStartDate) return;
    const newStr = addDaysToDateStr(weekStartDate, daysOffset);
    handleDateChange(newStr);
  };

  useEffect(() => {
    // 1. האזנה בזמן אמת לדרישות המטבח השבועיות
    const unsubKitchen = onSnapshot(doc(db, 'activeWeek', 'kitchen'), (docSnap) => {
      if (docSnap.exists()) {
        setKitchenData(docSnap.data());
      } else {
        setKitchenData(null);
      }
    });

    // 2. האזנה בזמן אמת לעדכוני הסמלים השבועיים
    const unsubDepartments = onSnapshot(collection(db, 'activeDepartments'), (snapshot) => {
      const deps = [];
      snapshot.forEach(doc => deps.push(doc.data()));
      setDepartmentsData(deps);
    });

    // 3. האזנה לטבלת הצדק
    const unsubJustice = onSnapshot(doc(db, 'justiceTable', 'current'), (docSnap) => {
      if (docSnap.exists()) setJusticeData(docSnap.data());
      else setJusticeData(null);
    });
    
    // 4. האזנה להיסטוריית משמרות
    const unsubHistory = onSnapshot(doc(db, 'history', 'stats'), (docSnap) => {
      if (docSnap.exists()) setHistoryData(docSnap.data());
      else setHistoryData({});
    });

    // 5. האזנה לנתוני אתר קשר
    const unsubKesher = onSnapshot(doc(db, 'history', 'kesherSite'), (docSnap) => {
      if (docSnap.exists() && docSnap.data().entries) {
        setKesherEntries(docSnap.data().entries);
      } else {
        setKesherEntries([]);
      }
    });

    return () => {
      unsubKitchen();
      unsubDepartments();
      unsubJustice();
      unsubHistory();
      unsubKesher();
    };
  }, []);

  const submittedDepartments = departmentsData.map(d => d.departmentName);
  const missingDepartments = EXPECTED_DEPARTMENTS.filter(d => !submittedDepartments.includes(d));

  const isReadyForAlgorithm = kitchenData && missingDepartments.length === 0;

  const handleOverrideChange = (soldierId, value) => {
    setManagerOverrides(prev => ({
      ...prev,
      [soldierId]: value
    }));
  };

  const handleKitchenOverride = (dayKey, shift, type, val) => {
    setKitchenOverrides(prev => {
      const updated = {
        ...prev,
        [`${dayKey}_${shift}_${type}`]: val
      };
      localStorage.setItem('toraniot_kitchenOverrides', JSON.stringify(updated));
      return updated;
    });
  };

  const handleRunAlgorithm = () => {
    setAlgorithmError(null);
    setAlgorithmResult(null);

    try {
      const result = generateSchedule(kitchenData, departmentsData, managerOverrides, kitchenOverrides, combinedHistory);
      result.originalSchedule = JSON.parse(JSON.stringify(result.schedule));
      result.isManuallyModified = false;
      setAlgorithmResult(result);
      // במערכת אמיתית פה נייצר את ה-PDF ונשמור ל-Firebase
    } catch (error) {
      if (error instanceof SchedulingConflictError) {
        setAlgorithmError({ message: error.message, conflicts: error.conflicts });
      } else {
        setAlgorithmError({ message: 'אירעה שגיאה לא צפויה בעת הרצת האלגוריתם.', conflicts: [error.message] });
      }
    }
  };

  const openPreviewEdit = (dayIdx, shiftTime, slotIdx, soldier, dayShortName, dateStr, allowChooseDayAndShift = false) => {
    setPreviewEditModal({
      dayIdx,
      shiftTime,
      slotIdx,
      soldier,
      dayShortName,
      dateStr,
      allowChooseDayAndShift
    });
    setModalDayIdx(dayIdx);
    setModalShiftTime(shiftTime);
    setModalMode('select');
    if (soldier) {
      setModalCustomName(soldier.name || '');
      setModalCustomDept(soldier.department || 'לוגיסטיקה');
      setModalSoldierKey(`${soldier.name}__${soldier.department}`);
    } else {
      setModalCustomName('');
      setModalCustomDept('לוגיסטיקה');
      setModalSoldierKey('');
    }
  };

  const handleSavePreviewEdit = () => {
    const finalName = modalCustomName.trim();
    if (!finalName || !algorithmResult) return;

    const targetDayIdx = previewEditModal?.allowChooseDayAndShift ? modalDayIdx : previewEditModal.dayIdx;
    const targetShiftTime = previewEditModal?.allowChooseDayAndShift ? modalShiftTime : previewEditModal.shiftTime;

    setAlgorithmResult(prev => {
      if (!prev) return prev;
      const newSchedule = prev.schedule.map((day, dIdx) => {
        if (dIdx !== targetDayIdx) return day;

        const newDay = { ...day };
        const shiftList = [...(newDay[targetShiftTime] || [])];

        if (previewEditModal.slotIdx >= 0 && previewEditModal.slotIdx < shiftList.length && !previewEditModal.allowChooseDayAndShift) {
          shiftList[previewEditModal.slotIdx] = {
            ...shiftList[previewEditModal.slotIdx],
            name: finalName,
            department: modalCustomDept,
            isEdited: true
          };
        } else {
          shiftList.push({
            name: finalName,
            department: modalCustomDept,
            isAgam: modalCustomDept === 'אג"ם' || modalCustomDept === 'אגם',
            isEdited: true,
            isAdded: true
          });
        }

        newDay[targetShiftTime] = shiftList;
        return newDay;
      });

      return {
        ...prev,
        schedule: newSchedule,
        isManuallyModified: true
      };
    });

    setPreviewEditModal(null);
  };

  const handleRemovePreviewSoldier = () => {
    if (!algorithmResult || !previewEditModal || previewEditModal.slotIdx < 0) {
      setPreviewEditModal(null);
      return;
    }

    setAlgorithmResult(prev => {
      if (!prev) return prev;
      const newSchedule = prev.schedule.map((day, dIdx) => {
        if (dIdx !== previewEditModal.dayIdx) return day;

        const newDay = { ...day };
        const shiftList = [...(newDay[previewEditModal.shiftTime] || [])];
        if (previewEditModal.slotIdx >= 0 && previewEditModal.slotIdx < shiftList.length) {
          shiftList.splice(previewEditModal.slotIdx, 1);
        }
        newDay[previewEditModal.shiftTime] = shiftList;
        return newDay;
      });

      return {
        ...prev,
        schedule: newSchedule,
        isManuallyModified: true
      };
    });

    setPreviewEditModal(null);
  };

  const handleFeedbackSubmit = () => {
    // In a real system, save this to Firebase so the AI/algorithm can "learn" from it
    console.log("Feedback submitted for algorithm training:", feedbackText);
    setFeedbackSubmitted(true);
    setTimeout(() => {
      setFeedbackSubmitted(false);
      setFeedbackText('');
    }, 4000);
  };

  // העברת השבצ״ק מהאלגוריתם (שלב 4) לטבלה השבועית לעריכה (שלב 5) - ללא חתימה עדיין
  const handleTransferToStep5 = async () => {
    if (!algorithmResult) return;

    if (justiceData && justiceData.schedule && justiceData.schedule.length > 0) {
      if (!justiceData.isSigned) {
        const proceed = window.confirm(
          "⚠️ שים לב: בלוח השבצ״ק הנוכחי (שלב 5) יש משמרות שטרם נחתמו!\n\nאם תעביר שבצ״ק חדש כעת, המשמרות הללו יימחקו מהלוח ולא ייצברו לטבלת הצדק.\n\nמומלץ ללחוץ 'ביטול', לחתום קודם על השבצ״ק הנוכחי ('✍️ חתום ואשר שבצ״ק סופי'), ורק אז להעביר את השבצ״ק החדש.\n\nהאם לדרוס בכל זאת?"
        );
        if (!proceed) return;
      } else {
        const proceed = window.confirm(
          "השבצ״ק הנוכחי חתום וכל משמרותיו שמורות בבטחה בטבלת הצדק החודשית.\n\nהעברת השבצ״ק החדש תציג בלוח את השבוע החדש. להמשיך?"
        );
        if (!proceed) return;
      }
    }

    await setDoc(doc(db, 'justiceTable', 'current'), {
      schedule: algorithmResult.schedule.map(d => ({
        ...d,
        dateStr: formatDayDate(d.shortName, weekStartDate),
        morning: (d.morning || []).map(s => ({
          ...s,
          originalName: s.name,
          originalDepartment: s.department,
          isEdited: false
        })),
        evening: (d.evening || []).map(s => ({
          ...s,
          originalName: s.name,
          originalDepartment: s.department,
          isEdited: false
        }))
      })),
      startDate: weekStartDate,
      timestamp: new Date().toISOString(),
      isSigned: false,
      signedAt: null,
      signedBy: null,
      weekContributions: null
    });

    setTransferredSuccess(true);
    setTimeout(() => {
      setTransferredSuccess(false);
    }, 4000);
  };

  // חתימת מנהל בסוף השבוע - נעילת השבצ״ק בפועל וצבירת המשמרות לטבלת הצדק
  const handleSignSchedule = async () => {
    if (!justiceData || !justiceData.schedule) return;
    setIsSigning(true);

    try {
      const historyRef = doc(db, 'history', 'stats');
      const historySnap = await getDoc(historyRef);
      const globalStats = historySnap.exists() ? { ...historySnap.data() } : {};

      // אם כבר נצברו נתונים בעבר לשבוע זה (למשל חתימה מחדש), מנקים אותם תחילה
      if (justiceData.weekContributions) {
        Object.entries(justiceData.weekContributions).forEach(([key, contribution]) => {
          if (globalStats[key]) {
            globalStats[key].total = Math.max(0, (globalStats[key].total || 0) - (contribution.total || 0));
            globalStats[key].midweek = Math.max(0, (globalStats[key].midweek || 0) - (contribution.midweek || 0));
            globalStats[key].weekend = Math.max(0, (globalStats[key].weekend || 0) - (contribution.weekend || 0));
          }
        });
      }

      // חישוב המשמרות בפועל מתוך הטבלה המעודכנת
      const newWeekContributions = {};
      const addToContributions = (s, isWeekend, weight) => {
        if (!s || !s.name) return;
        const key = `${s.name}_${s.department}`;
        if (!newWeekContributions[key]) {
          newWeekContributions[key] = { total: 0, weekend: 0, midweek: 0 };
        }
        newWeekContributions[key].total += weight;
        if (isWeekend) newWeekContributions[key].weekend += weight;
        else newWeekContributions[key].midweek += weight;
      };

      justiceData.schedule.forEach(day => {
        const isWeekend = day.isWeekend || day.shortName === "ה'";
        const weight = day.shortName === "ש'" ? 0.5 : 1;
        (day.morning || []).forEach(s => addToContributions(s, isWeekend, weight));
        (day.evening || []).forEach(s => addToContributions(s, isWeekend, weight));
      });

      // הוספה להיסטוריה הגלובלית
      Object.entries(newWeekContributions).forEach(([key, contribution]) => {
        if (!globalStats[key]) {
          globalStats[key] = { total: 0, weekend: 0, midweek: 0 };
        }
        globalStats[key].total = (globalStats[key].total || 0) + contribution.total;
        globalStats[key].midweek = (globalStats[key].midweek || 0) + contribution.midweek;
        globalStats[key].weekend = (globalStats[key].weekend || 0) + contribution.weekend;
      });

      await setDoc(historyRef, globalStats);

      const currentSigner = signerName.trim() || 'מנהל תורנויות';
      localStorage.setItem('toraniot_signerName', currentSigner);

      await setDoc(doc(db, 'justiceTable', 'current'), {
        ...justiceData,
        isSigned: true,
        signedAt: new Date().toISOString(),
        signedBy: currentSigner,
        historyApplied: true,
        weekContributions: newWeekContributions
      });

      setSignSuccessMessage(true);
      setTimeout(() => setSignSuccessMessage(false), 5000);
    } catch (err) {
      console.error("Error signing schedule:", err);
      alert("אירעה שגיאה בחתימה: " + err.message);
    } finally {
      setIsSigning(false);
    }
  };

  // פתיחת שבצ״ק חתום לעריכה מחודשת במקרה של בלת״ם מאוחר
  const handleUnlockForEdit = async () => {
    if (!window.confirm("פתיחת השבצ״ק לעריכה תבטל זמנית את צבירת המשמרות של השבוע עד לחתימתך המחודשת בסיום העריכה. להמשיך?")) {
      return;
    }

    try {
      if (justiceData?.weekContributions) {
        const historyRef = doc(db, 'history', 'stats');
        const historySnap = await getDoc(historyRef);
        if (historySnap.exists()) {
          const globalStats = { ...historySnap.data() };
          Object.entries(justiceData.weekContributions).forEach(([key, contribution]) => {
            if (globalStats[key]) {
              globalStats[key].total = Math.max(0, (globalStats[key].total || 0) - (contribution.total || 0));
              globalStats[key].midweek = Math.max(0, (globalStats[key].midweek || 0) - (contribution.midweek || 0));
              globalStats[key].weekend = Math.max(0, (globalStats[key].weekend || 0) - (contribution.weekend || 0));
            }
          });
          await setDoc(historyRef, globalStats);
        }
      }

      await setDoc(doc(db, 'justiceTable', 'current'), {
        ...justiceData,
        isSigned: false,
        weekContributions: null
      });
    } catch (err) {
      console.error("Error unlocking schedule:", err);
      alert("שגיאה בפתיחת השבצ״ק: " + err.message);
    }
  };

  const handleBaltamChange = async (dayIdx, shiftTime, idx, oldPerson, newPersonStr) => {
    if (!newPersonStr) {
      setEditingShift(null);
      return;
    }
    const [newName, newDep] = newPersonStr.split('_');
    const isWeekend = justiceData.schedule[dayIdx].isWeekend || justiceData.schedule[dayIdx].shortName === "ה'";
    const weight = justiceData.schedule[dayIdx].shortName === "ש'" ? 0.5 : 1;

    let updatedWeekContributions = justiceData.weekContributions ? { ...justiceData.weekContributions } : null;

    // רק אם השבצ״ק כבר נחתם ונסגר בעבר, נעדכן את היסטוריית המשמרות במקביל
    if (justiceData.isSigned) {
      const historyRef = doc(db, 'history', 'stats');
      const historySnap = await getDoc(historyRef);
      const globalStats = historySnap.exists() ? historySnap.data() : {};
      
      const oldKey = `${oldPerson.name}_${oldPerson.department}`;
      const newKey = `${newName}_${newDep}`;
      
      if (globalStats[oldKey]) {
          globalStats[oldKey].total = Math.max(0, globalStats[oldKey].total - weight);
          if (isWeekend) globalStats[oldKey].weekend = Math.max(0, globalStats[oldKey].weekend - weight);
          else globalStats[oldKey].midweek = Math.max(0, globalStats[oldKey].midweek - weight);
      }
      
      if (!globalStats[newKey]) globalStats[newKey] = { total: 0, weekend: 0, midweek: 0 };
      globalStats[newKey].total += weight;
      if (isWeekend) globalStats[newKey].weekend += weight;
      else globalStats[newKey].midweek += weight;

      if (updatedWeekContributions) {
        if (updatedWeekContributions[oldKey]) {
          updatedWeekContributions[oldKey].total = Math.max(0, updatedWeekContributions[oldKey].total - weight);
          if (isWeekend) updatedWeekContributions[oldKey].weekend = Math.max(0, updatedWeekContributions[oldKey].weekend - weight);
          else updatedWeekContributions[oldKey].midweek = Math.max(0, updatedWeekContributions[oldKey].midweek - weight);
        }
        if (!updatedWeekContributions[newKey]) updatedWeekContributions[newKey] = { total: 0, weekend: 0, midweek: 0 };
        updatedWeekContributions[newKey].total += weight;
        if (isWeekend) updatedWeekContributions[newKey].weekend += weight;
        else updatedWeekContributions[newKey].midweek += weight;
      }

      await setDoc(historyRef, globalStats);
    }

    const oldOrigName = oldPerson.originalName !== undefined ? oldPerson.originalName : oldPerson.name;
    const oldOrigDep = oldPerson.originalDepartment !== undefined ? oldPerson.originalDepartment : oldPerson.department;
    const isNowDifferent = (newName !== oldOrigName) || (newDep !== oldOrigDep);

    const newSchedule = [...justiceData.schedule];
    newSchedule[dayIdx][shiftTime][idx] = { 
        name: newName, 
        department: newDep, 
        isAgam: newDep === 'אג"ם',
        originalName: oldOrigName,
        originalDepartment: oldOrigDep,
        isEdited: isNowDifferent
    };

    await setDoc(doc(db, 'justiceTable', 'current'), {
        ...justiceData,
        schedule: newSchedule,
        weekContributions: updatedWeekContributions
    });
    
    setEditingShift(null);
  };

  // הוספת תורן נוסף למשמרת ביום מסוים (בלת״ם)
  const handleAddSoldierToShift = async (dayIdx, shiftTime, newPersonStr) => {
    if (!newPersonStr) {
      setAddingShift(null);
      return;
    }
    const [newName, newDep] = newPersonStr.split('_');
    const isWeekend = justiceData.schedule[dayIdx].isWeekend || justiceData.schedule[dayIdx].shortName === "ה'";
    const weight = justiceData.schedule[dayIdx].shortName === "ש'" ? 0.5 : 1;

    let updatedWeekContributions = justiceData.weekContributions ? { ...justiceData.weekContributions } : null;

    if (justiceData.isSigned) {
      const historyRef = doc(db, 'history', 'stats');
      const historySnap = await getDoc(historyRef);
      const globalStats = historySnap.exists() ? historySnap.data() : {};
      
      const newKey = `${newName}_${newDep}`;
      if (!globalStats[newKey]) globalStats[newKey] = { total: 0, weekend: 0, midweek: 0 };
      globalStats[newKey].total += weight;
      if (isWeekend) globalStats[newKey].weekend += weight;
      else globalStats[newKey].midweek += weight;

      if (updatedWeekContributions) {
        if (!updatedWeekContributions[newKey]) updatedWeekContributions[newKey] = { total: 0, weekend: 0, midweek: 0 };
        updatedWeekContributions[newKey].total += weight;
        if (isWeekend) updatedWeekContributions[newKey].weekend += weight;
        else updatedWeekContributions[newKey].midweek += weight;
      }

      await setDoc(historyRef, globalStats);
    }

    const newSchedule = [...justiceData.schedule];
    if (!newSchedule[dayIdx][shiftTime]) {
      newSchedule[dayIdx][shiftTime] = [];
    }
    newSchedule[dayIdx][shiftTime].push({
      name: newName,
      department: newDep,
      isAgam: newDep === 'אג"ם',
      originalName: null,
      originalDepartment: null,
      isEdited: true,
      isAdded: true
    });

    await setDoc(doc(db, 'justiceTable', 'current'), {
      ...justiceData,
      schedule: newSchedule,
      weekContributions: updatedWeekContributions
    });

    setAddingShift(null);
  };

  // הסרת תורן ממשמרת
  const handleRemoveSoldierFromShift = async (dayIdx, shiftTime, idx, oldPerson) => {
    if (!window.confirm(`האם להסיר את ${oldPerson.name} (${oldPerson.department}) ממשמרת זו?`)) {
      setEditingShift(null);
      return;
    }

    const isWeekend = justiceData.schedule[dayIdx].isWeekend || justiceData.schedule[dayIdx].shortName === "ה'";
    const weight = justiceData.schedule[dayIdx].shortName === "ש'" ? 0.5 : 1;

    let updatedWeekContributions = justiceData.weekContributions ? { ...justiceData.weekContributions } : null;

    if (justiceData.isSigned) {
      const historyRef = doc(db, 'history', 'stats');
      const historySnap = await getDoc(historyRef);
      const globalStats = historySnap.exists() ? historySnap.data() : {};
      
      const oldKey = `${oldPerson.name}_${oldPerson.department}`;
      if (globalStats[oldKey]) {
        globalStats[oldKey].total = Math.max(0, globalStats[oldKey].total - weight);
        if (isWeekend) globalStats[oldKey].weekend = Math.max(0, globalStats[oldKey].weekend - weight);
        else globalStats[oldKey].midweek = Math.max(0, globalStats[oldKey].midweek - weight);
      }

      if (updatedWeekContributions && updatedWeekContributions[oldKey]) {
        updatedWeekContributions[oldKey].total = Math.max(0, updatedWeekContributions[oldKey].total - weight);
        if (isWeekend) updatedWeekContributions[oldKey].weekend = Math.max(0, updatedWeekContributions[oldKey].weekend - weight);
        else updatedWeekContributions[oldKey].midweek = Math.max(0, updatedWeekContributions[oldKey].midweek - weight);
      }

      await setDoc(historyRef, globalStats);
    }

    const newSchedule = [...justiceData.schedule];
    newSchedule[dayIdx][shiftTime].splice(idx, 1);

    await setDoc(doc(db, 'justiceTable', 'current'), {
      ...justiceData,
      schedule: newSchedule,
      weekContributions: updatedWeekContributions
    });

    setEditingShift(null);
  };

  // נתוני אתר קשר וצדק משולבים - כל 1.5 ימים באתר קשר = 1 משמרת מטבח, יום עודף = 0.5 מטבח
  const combinedHistory = React.useMemo(() => {
    const combined = { ...historyData };
    const kesherDaysMap = {};
    (kesherEntries || []).forEach(e => {
      const key = `${e.soldierName}_${e.department}`;
      kesherDaysMap[key] = (kesherDaysMap[key] || 0) + Number(e.daysCount || 0);
    });

    // מעדכן חיילים שקיימים בהיסטוריה
    Object.keys(combined).forEach(key => {
      const kDays = kesherDaysMap[key] || 0;
      const kEquiv = kesherDaysToKitchenShifts(kDays);
      combined[key] = {
        ...combined[key],
        kesherDays: kDays,
        kesherEquiv: kEquiv,
        effectiveTotal: (combined[key].total || 0) + kEquiv,
        effectiveMidweek: (combined[key].midweek || 0) + kEquiv,
        effectiveWeekend: combined[key].weekend || 0
      };
    });

    // מוסיף חיילים שיש להם רק ימי קשר וטרם ביצעו מטבח
    Object.entries(kesherDaysMap).forEach(([key, kDays]) => {
      if (!combined[key]) {
        const kEquiv = kesherDaysToKitchenShifts(kDays);
        combined[key] = {
          total: 0,
          midweek: 0,
          weekend: 0,
          kesherDays: kDays,
          kesherEquiv: kEquiv,
          effectiveTotal: kEquiv,
          effectiveMidweek: kEquiv,
          effectiveWeekend: 0
        };
      }
    });

    return combined;
  }, [historyData, kesherEntries]);

  // רשימת כל החיילים מכל המחלקות משוקללת עם נתוני הצדק (חיילים בעלי פטור מלא מוחרגים)
  const allSoldiersList = React.useMemo(() => {
    const list = [];
    const seenKeys = new Set();
    const fullExemptKeys = new Set();

    (departmentsData || []).forEach(dep => {
      (dep.soldiers || []).forEach((s, idx) => {
        const id = `${dep.departmentName}_${idx}`;
        const isExemptRejected = managerOverrides[`${id}_exception`] === 'rejected';
        const activeExceptionType = isExemptRejected ? 'none' : (s.exceptionType || 'none');
        if (activeExceptionType === 'full') {
          fullExemptKeys.add(`${s.name}_${dep.departmentName}`);
        }
      });
    });

    (departmentsData || []).forEach(dep => {
      (dep.soldiers || []).forEach(s => {
        const key = `${s.name}_${dep.departmentName}`;
        seenKeys.add(key);

        // אם לחייל יש פטור מלא - מסירים אותו מטבלת הצדק
        if (fullExemptKeys.has(key)) return;

        const hist = combinedHistory[key] || { total: 0, midweek: 0, weekend: 0, kesherDays: 0, effectiveTotal: 0 };
        const kDays = hist.kesherDays || 0;
        const kEquiv = kesherDaysToKitchenShifts(kDays);
        list.push({
          name: s.name,
          department: dep.departmentName,
          key,
          midweek: hist.midweek || 0,
          weekend: hist.weekend || 0,
          kitchenTotal: hist.total || 0,
          kesherDays: kDays,
          kesherEquiv: kEquiv,
          effectiveTotal: hist.effectiveTotal !== undefined ? hist.effectiveTotal : ((hist.total || 0) + kEquiv),
          isNew: s.isNewSoldier
        });
      });
    });

    Object.entries(combinedHistory).forEach(([key, hist]) => {
      if (!seenKeys.has(key)) {
        if (fullExemptKeys.has(key)) return;
        const [name, dep] = key.split('_');
        const kDays = hist.kesherDays || 0;
        const kEquiv = kesherDaysToKitchenShifts(kDays);
        list.push({
          name,
          department: dep || 'כללי',
          key,
          midweek: hist.midweek || 0,
          weekend: hist.weekend || 0,
          kitchenTotal: hist.total || 0,
          kesherDays: kDays,
          kesherEquiv: kEquiv,
          effectiveTotal: hist.effectiveTotal !== undefined ? hist.effectiveTotal : ((hist.total || 0) + kEquiv),
          isNew: false
        });
      }
    });

    return list;
  }, [departmentsData, combinedHistory, managerOverrides]);

  const fullExemptCount = React.useMemo(() => {
    let count = 0;
    (departmentsData || []).forEach(dep => {
      (dep.soldiers || []).forEach((s, idx) => {
        const id = `${dep.departmentName}_${idx}`;
        const isExemptRejected = managerOverrides[`${id}_exception`] === 'rejected';
        const activeExceptionType = isExemptRejected ? 'none' : (s.exceptionType || 'none');
        if (activeExceptionType === 'full') count++;
      });
    });
    return count;
  }, [departmentsData, managerOverrides]);

  const totalKitchenShifts = React.useMemo(() => allSoldiersList.reduce((acc, s) => acc + s.kitchenTotal, 0), [allSoldiersList]);
  const totalKesherDays = React.useMemo(() => allSoldiersList.reduce((acc, s) => acc + s.kesherDays, 0), [allSoldiersList]);
  const totalEffectiveShifts = React.useMemo(() => allSoldiersList.reduce((acc, s) => acc + s.effectiveTotal, 0), [allSoldiersList]);
  const avgShiftsPerSoldier = React.useMemo(() => allSoldiersList.length > 0 ? (totalEffectiveShifts / allSoldiersList.length).toFixed(1) : '0', [allSoldiersList, totalEffectiveShifts]);

  // רשימה מסוננת וממוינת לטבלת הצדק
  const filteredAndSortedJusticeList = React.useMemo(() => {
    return allSoldiersList
      .filter(s => {
        if (justiceDeptFilter !== 'all' && s.department !== justiceDeptFilter) return false;
        if (justiceSearch.trim()) {
          const q = justiceSearch.trim().toLowerCase();
          return s.name.toLowerCase().includes(q) || s.department.toLowerCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        let valA = a[justiceSortBy];
        let valB = b[justiceSortBy];
        if (typeof valA === 'string') {
          return justiceSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return justiceSortAsc ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0);
      });
  }, [allSoldiersList, justiceDeptFilter, justiceSearch, justiceSortBy, justiceSortAsc]);

  // הוספת רשומת אתר קשר
  const handleAddKesher = async (e) => {
    e?.preventDefault();
    if (!kesherSoldierKey) {
      alert("אנא בחר חייל מהרשימה");
      return;
    }
    const days = parseInt(kesherDaysCount, 10);
    if (isNaN(days) || days <= 0) {
      alert("כמות הימים חייבת להיות לפחות 1");
      return;
    }

    const [sName, sDep] = kesherSoldierKey.split('_');
    setKesherSubmitting(true);

    try {
      const newEntry = {
        id: `kesher_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        soldierName: sName,
        department: sDep,
        daysCount: days,
        date: kesherDate || new Date().toISOString().split('T')[0],
        note: kesherNote.trim() || '',
        createdAt: new Date().toISOString()
      };

      const updatedEntries = [newEntry, ...(kesherEntries || [])];
      await setDoc(doc(db, 'history', 'kesherSite'), { entries: updatedEntries });

      // סנכרון ישיר ל-history/stats
      const historyRef = doc(db, 'history', 'stats');
      const historySnap = await getDoc(historyRef);
      const stats = historySnap.exists() ? historySnap.data() : {};
      if (!stats[kesherSoldierKey]) {
        stats[kesherSoldierKey] = { total: 0, midweek: 0, weekend: 0 };
      }
      stats[kesherSoldierKey].kesherDays = (stats[kesherSoldierKey].kesherDays || 0) + days;
      await setDoc(historyRef, stats);

      const addedEquiv = kesherDaysToKitchenShifts(days);
      setKesherSuccessMsg(`נוספו ${days} ימים באתר קשר עבור ${sName}! (שווה ערך ל-${addedEquiv} משמרות מטבח)`);
      setTimeout(() => setKesherSuccessMsg(''), 4000);
      setKesherSoldierKey('');
      setKesherDaysCount('1');
      setKesherNote('');
    } catch (err) {
      console.error("Error adding kesher entry:", err);
      alert("שגיאה בהוספת רישום אתר קשר: " + err.message);
    } finally {
      setKesherSubmitting(false);
    }
  };

  // מחיקת רשומת אתר קשר
  const handleDeleteKesher = async (entryId) => {
    const entry = (kesherEntries || []).find(e => e.id === entryId);
    if (!entry) return;
    if (!window.confirm(`האם למחוק את רישום אתר הקשר של ${entry.soldierName} (${entry.daysCount} ימים)?`)) {
      return;
    }

    try {
      const updatedEntries = (kesherEntries || []).filter(e => e.id !== entryId);
      await setDoc(doc(db, 'history', 'kesherSite'), { entries: updatedEntries });

      const key = `${entry.soldierName}_${entry.department}`;
      const historyRef = doc(db, 'history', 'stats');
      const historySnap = await getDoc(historyRef);
      if (historySnap.exists()) {
        const stats = historySnap.data();
        if (stats[key]) {
          stats[key].kesherDays = Math.max(0, (stats[key].kesherDays || 0) - entry.daysCount);
          await setDoc(historyRef, stats);
        }
      }
    } catch (err) {
      console.error("Error deleting kesher entry:", err);
      alert("שגיאה במחיקת רישום: " + err.message);
    }
  };

  // איפוס טבלת הצדק (כולל וידוא מודאלי ומחיקת השבצ״ק השגוי)
  const handleResetJusticeTable = async () => {
    setIsResetting(true);
    try {
      if (resetKesherAlso) {
        // איפוס מלא כולל אתר קשר
        await setDoc(doc(db, 'history', 'stats'), {});
        await setDoc(doc(db, 'history', 'kesherSite'), { entries: [] });
        setKesherEntries([]);
        setHistoryData({});
      } else {
        // איפוס משמרות מטבח בלבד ושמירה על ימי אתר קשר אם קיימים
        const historyRef = doc(db, 'history', 'stats');
        const historySnap = await getDoc(historyRef);
        const currentStats = historySnap.exists() ? historySnap.data() : {};
        const cleanedStats = {};
        Object.entries(currentStats).forEach(([key, val]) => {
          if (val && val.kesherDays) {
            cleanedStats[key] = { total: 0, midweek: 0, weekend: 0, kesherDays: val.kesherDays };
          }
        });
        await setDoc(historyRef, cleanedStats);
        setHistoryData(cleanedStats);
      }

      // ביטול חתימת/צבירת השבצ״ק הנוכחי שהוכנס בטעות
      if (justiceData) {
        if (resetScheduleAlso) {
          await setDoc(doc(db, 'justiceTable', 'current'), {
            schedule: null,
            isSigned: false,
            historyApplied: false,
            weekContributions: null,
            signedAt: null,
            signedBy: null
          });
          setJusticeData(null);
        } else {
          await setDoc(doc(db, 'justiceTable', 'current'), {
            ...justiceData,
            isSigned: false,
            historyApplied: false,
            weekContributions: null,
            signedAt: null,
            signedBy: null
          });
        }
      }

      setShowResetModal(false);
      setResetSuccessMsg(true);
      setTimeout(() => setResetSuccessMsg(false), 5000);
    } catch (err) {
      console.error("Error resetting justice table:", err);
      alert("שגיאה באיפוס טבלת הצדק: " + err.message);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '850px', margin: '0 auto', paddingBottom: '3rem' }}>
      
      <div className="glass-panel" style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
        <h3 style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.8rem', margin: 0 }}>
          <ClipboardCheck color="var(--primary-color)" size={32} /> מרכז בקרה וניהול תורנויות
        </h3>
      </div>

      {/* בורר טאבים עליון: שיבוץ שבועי מול טבלת צדק ואתר קשר */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setActiveTab('schedule')}
          className="btn"
          style={{
            padding: '0.75rem 1.6rem',
            fontSize: '1.05rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.6rem',
            backgroundColor: activeTab === 'schedule' ? 'var(--primary-color)' : 'rgba(255, 255, 255, 0.04)',
            borderColor: activeTab === 'schedule' ? 'var(--primary-color)' : 'var(--border-color)',
            boxShadow: activeTab === 'schedule' ? '0 4px 15px rgba(99, 102, 241, 0.35)' : 'none'
          }}
        >
          <ClipboardCheck size={20} />
          שיבוץ שבועי ובלת״מים
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('justice')}
          className="btn"
          style={{
            padding: '0.75rem 1.6rem',
            fontSize: '1.05rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.6rem',
            backgroundColor: activeTab === 'justice' ? 'var(--secondary-color)' : 'rgba(255, 255, 255, 0.04)',
            borderColor: activeTab === 'justice' ? 'var(--secondary-color)' : 'var(--border-color)',
            boxShadow: activeTab === 'justice' ? '0 4px 15px rgba(16, 185, 129, 0.35)' : 'none'
          }}
        >
          <Scale size={20} />
          טבלת צדק חודשית & אתר קשר
          {kesherEntries.length > 0 && (
            <span style={{ fontSize: '0.75rem', backgroundColor: 'rgba(255,255,255,0.25)', padding: '0.1rem 0.5rem', borderRadius: '10px', fontWeight: 'bold' }}>
              {kesherEntries.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'schedule' && (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
        
        {/* שלב 1: סטטוס מטבח */}
        <div className="glass-panel" style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <h4 style={{ fontSize: '1.2rem', margin: 0 }}>שלב 1: דרישת מטבח שבועית</h4>
            {kitchenData ? <CheckCircle2 color="var(--secondary-color)" /> : <XCircle color="var(--text-secondary)" opacity={0.7} />}
          </div>
          
          {kitchenData ? (
            <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {/* אמצע שבוע */}
              <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <h5 style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '1rem' }}>אמצע שבוע</h5>
                <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>פלס״ם</span>
                    <strong style={{ display: 'block', fontSize: '1.4rem', color: 'var(--secondary-color)' }}>{kitchenData.midweek?.plasam || 0}</strong>
                  </div>
                </div>
              </div>
              
              {/* סופ"ש */}
              <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <h5 style={{ color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '1rem' }}>סופ״ש</h5>
                <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>פלס״ם</span>
                    <strong style={{ display: 'block', fontSize: '1.4rem', color: 'var(--secondary-color)' }}>{kitchenData.weekend?.plasam || 0}</strong>
                  </div>
                </div>
              </div>

              {/* עריכה פרטנית */}
              <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem', gridColumn: '1 / -1' }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setShowKitchenOverrides(!showKitchenOverrides)}
                  style={{ fontSize: '0.9rem', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 auto' }}
                >
                  {showKitchenOverrides ? 'הסתר עריכה פרטנית' : '✏️ הטבח ויתר? ערוך דרישה פרטנית לכל משמרת'}
                </button>

                {showKitchenOverrides && (
                  <div className="animate-fade-in" style={{ marginTop: '1.5rem', overflowX: 'auto', backgroundColor: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.9rem' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>
                          <th style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>יום</th>
                          <th style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>בוקר פלס״ם</th>
                          <th style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>ערב פלס״ם</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const SCHEDULE_DAYS = [
                            { key: "א'", name: 'ראשון', short: "א'", isWeekend: false },
                            { key: "ב'", name: 'שני', short: "ב'", isWeekend: false },
                            { key: "ג'", name: 'שלישי', short: "ג'", isWeekend: false },
                            { key: "ד'", name: 'רביעי', short: "ד'", isWeekend: false },
                            { key: "ה'", name: 'חמישי', short: "ה'", isWeekend: true },
                            { key: "ו'", name: 'שישי', short: "ו'", isWeekend: true },
                            { key: "ש'", name: 'שבת', short: "ש'", isWeekend: true },
                            { key: "א' (יציאה)", name: 'ראשון', short: "א'", isWeekend: true } 
                          ];
                          const activeDays = kitchenData.activeDays || {};
                          const activeDaysList = SCHEDULE_DAYS.filter(d => activeDays[d.key] && activeDays[d.key] !== 'off');
                          
                          return activeDaysList.map(day => {
                            const state = activeDays[day.key];
                            const isW = day.isWeekend;
                            const defPlasam = isW ? (kitchenData.weekend?.plasam || 0) : (kitchenData.midweek?.plasam || 0);
                            const defAgam = isW ? (kitchenData.weekend?.agam || 0) : (kitchenData.midweek?.agam || 0);
                            
                            const hasMorning = state === 'full' || state === 'half_morning';
                            const hasEvening = state === 'full' || state === 'half_evening';
                      
                            return (
                              <tr key={day.key} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '0.75rem 0.5rem', fontWeight: 'bold' }}>{day.key}</td>
                                <td style={{ padding: '0.75rem 0.5rem' }}>
                                  {hasMorning ? <input type="number" min="0" placeholder={defPlasam} style={{ width: '60px', textAlign: 'center', backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'white', borderRadius: '4px', padding: '0.2rem' }} value={kitchenOverrides[`${day.key}_morning_plasam`] ?? ''} onChange={e => handleKitchenOverride(day.key, 'morning', 'plasam', e.target.value)} /> : '-'}
                                </td>
                                <td style={{ padding: '0.75rem 0.5rem' }}>
                                  {hasEvening ? <input type="number" min="0" placeholder={defPlasam} style={{ width: '60px', textAlign: 'center', backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'white', borderRadius: '4px', padding: '0.2rem' }} value={kitchenOverrides[`${day.key}_evening_plasam`] ?? ''} onChange={e => handleKitchenOverride(day.key, 'evening', 'plasam', e.target.value)} /> : '-'}
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="animate-fade-in" style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '1.5rem 0', opacity: 0.8 }}>
              <span style={{ fontWeight: 500 }}>המטבח טרם הזין דרישה לשבוע הקרוב</span>
            </div>
          )}
        </div>

        {/* חץ למטה */}
        <ArrowDown size={32} color="var(--text-secondary)" style={{ opacity: 0.5 }} />

        {/* שלב 2: סטטוס סמלים (מחלקות) */}
        <div className="glass-panel" style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <h4 style={{ fontSize: '1.2rem', margin: 0 }}>שלב 2: הזנת סד״כ שבועי (סמלים)</h4>
            <span style={{ fontSize: '0.9rem', color: missingDepartments.length === 0 ? 'var(--secondary-color)' : 'var(--text-secondary)', fontWeight: 500 }}>
              ({departmentsData.length}/{EXPECTED_DEPARTMENTS.length} הגישו)
            </span>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {EXPECTED_DEPARTMENTS.map(deptName => {
              const depData = departmentsData.find(d => d.departmentName === deptName);
              const hasSubmitted = !!depData;

              if (hasSubmitted) {
                const total = depData.soldiers?.length || 0;
                const fullExceptions = depData.soldiers?.filter(s => s.exceptionType === 'full').length || 0;
                const weekendExceptions = depData.soldiers?.filter(s => s.exceptionType === 'weekend').length || 0;
                const availableMidweek = total - fullExceptions;
                const availableWeekend = total - fullExceptions - weekendExceptions;
                
                return (
                  <div key={deptName} className="animate-fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', padding: '1rem', backgroundColor: 'rgba(16, 185, 129, 0.05)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <CheckCircle2 size={20} color="var(--secondary-color)" />
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{deptName}</span>
                    </div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      סה״כ: {total} | אמצ״ש: <strong style={{ color: 'var(--secondary-color)' }}>{availableMidweek}</strong> | סופ״ש: <strong style={{ color: 'var(--secondary-color)' }}>{availableWeekend}</strong> | פטורים מלאים: <strong style={{ color: 'var(--danger-color)' }}>{fullExceptions}</strong>
                    </span>
                  </div>
                );
              } else {
                return (
                  <div key={deptName} className="animate-fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', padding: '1rem', backgroundColor: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px dashed rgba(255, 255, 255, 0.1)', opacity: 0.6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <AlertCircle size={20} color="var(--text-secondary)" />
                      <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{deptName}</span>
                    </div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                      טרם הגישו
                    </span>
                  </div>
                );
              }
            })}
          </div>
        </div>

        {/* חץ למטה */}
        <ArrowDown size={32} color={isReadyForAlgorithm ? "var(--primary-color)" : "var(--text-secondary)"} style={{ opacity: isReadyForAlgorithm ? 1 : 0.5 }} />

        {/* שלב 3: אישור מצבת כוח אדם */}
        <div className="glass-panel" style={{ width: '100%', borderColor: isReadyForAlgorithm ? 'var(--primary-color)' : 'var(--border-color)', position: 'relative' }}>
          
          <h4 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>שלב 3: אישור ועריכת מצבת כוח אדם</span>
          </h4>
          
          {isReadyForAlgorithm ? (
            <div className="animate-fade-in">
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                עבור על רשימת החיילים מכל המחלקות. תוכל לאשר או לבטל פטורים לפני הפעלת השיבוץ.
              </p>
              
              <div style={{ maxHeight: '300px', overflowY: 'auto', paddingRight: '0.5rem', marginBottom: '2rem' }}>
                <h5 style={{ color: 'var(--danger-color)', marginBottom: '1rem', borderBottom: '1px solid var(--danger-color)', paddingBottom: '0.5rem' }}>בקשות פטורים (מחייב אישור)</h5>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', marginBottom: '1.5rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '0.5rem' }}>שם החייל</th>
                      <th style={{ padding: '0.5rem' }}>מחלקה</th>
                      <th style={{ padding: '0.5rem' }}>הערת סמל</th>
                      <th style={{ padding: '0.5rem', textAlign: 'center' }}>אישור מנהל</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const soldiersWithExceptions = departmentsData.flatMap(dep => 
                        (dep.soldiers || [])
                          .map((s, idx) => ({ ...s, depName: dep.departmentName, id: `${dep.departmentName}_${idx}` }))
                          .filter(s => s.exceptionType && s.exceptionType !== 'none')
                      );

                      if (soldiersWithExceptions.length === 0) {
                        return (
                          <tr>
                            <td colSpan="4" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                              אין בקשות לפטורים השבוע.
                            </td>
                          </tr>
                        );
                      }

                      return soldiersWithExceptions.map((soldier) => {
                        const isRejected = managerOverrides[`${soldier.id}_exception`] === 'rejected';

                        return (
                          <tr key={soldier.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', backgroundColor: isRejected ? 'rgba(16,185,129,0.05)' : 'rgba(239, 68, 68, 0.05)' }}>
                            <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500 }}>{soldier.name}</td>
                            <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{soldier.depName}</td>
                            <td style={{ padding: '0.75rem 0.5rem' }}>
                              <div style={{ color: 'var(--danger-color)' }}>
                                <strong style={{ display: 'block', fontSize: '0.9rem' }}>{soldier.exceptionType === 'full' ? 'פטור מלא' : 'פטור סופ"ש'}</strong>
                                <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>{soldier.exceptionReason}</span>
                              </div>
                            </td>
                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                              <select 
                                className="input-field" 
                                style={{ padding: '0.25rem 0.5rem', margin: 0, width: 'auto', display: 'inline-block', backgroundColor: !isRejected ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', borderColor: 'transparent' }}
                                value={managerOverrides[`${soldier.id}_exception`] || "approved"}
                                onChange={(e) => handleOverrideChange(`${soldier.id}_exception`, e.target.value)}
                              >
                                <option value="approved">❌ מאושר (לא ישובץ)</option>
                                <option value="rejected">✅ נדחה (כשיר לשיבוץ)</option>
                              </select>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>

                <h5 style={{ color: '#F59E0B', marginBottom: '1rem', borderBottom: '1px solid #F59E0B', paddingBottom: '0.5rem', marginTop: '1rem' }}>אילוצים שבועיים (תיעדוף)</h5>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '0.5rem' }}>שם החייל</th>
                      <th style={{ padding: '0.5rem' }}>מחלקה</th>
                      <th style={{ padding: '0.5rem' }}>ימים וסיבה</th>
                      <th style={{ padding: '0.5rem', textAlign: 'center' }}>תיעדוף לאלגוריתם</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const soldiersWithConstraints = departmentsData.flatMap(dep => 
                        (dep.soldiers || [])
                          .map((s, idx) => ({ ...s, depName: dep.departmentName, id: `${dep.departmentName}_${idx}` }))
                          .filter(s => s.blockedDays && s.blockedDays.length > 0)
                      );

                      if (soldiersWithConstraints.length === 0) {
                        return (
                          <tr>
                            <td colSpan="4" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                              אין אילוצים השבוע.
                            </td>
                          </tr>
                        );
                      }

                      return soldiersWithConstraints.map((soldier) => {
                        const overrideState = managerOverrides[`${soldier.id}_constraint`] || 'critical';
                        let rowBg = 'rgba(245, 158, 11, 0.05)';
                        if (overrideState === 'flexible') rowBg = 'rgba(59, 130, 246, 0.05)';
                        if (overrideState === 'ignored') rowBg = 'rgba(16, 185, 129, 0.05)';

                        return (
                          <tr key={soldier.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', backgroundColor: rowBg }}>
                            <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500 }}>{soldier.name}</td>
                            <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{soldier.depName}</td>
                            <td style={{ padding: '0.75rem 0.5rem' }}>
                              <div style={{ color: '#F59E0B' }}>
                                <strong style={{ display: 'block', fontSize: '0.9rem' }}>{soldier.blockedDays.join(", ")}</strong>
                                <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>{soldier.constraintReason}</span>
                              </div>
                            </td>
                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                              <select 
                                className="input-field" 
                                style={{ padding: '0.25rem 0.5rem', margin: 0, width: 'auto', display: 'inline-block', backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.2)' }}
                                value={overrideState}
                                onChange={(e) => handleOverrideChange(`${soldier.id}_constraint`, e.target.value)}
                              >
                                <option value="critical">⛔ קריטי (לא ישובץ כלל)</option>
                                <option value="flexible">⚠️ גמיש (ישובץ רק אם אין ברירה)</option>
                                <option value="ignored">✅ התעלם (ישובץ כרגיל)</option>
                              </select>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '0' }}>המערכת ממתינה להשלמת כל הנתונים לפני שתוכל לערוך את הרשימה המאוחדת.</p>
            </div>
          )}
        </div>

        {/* חץ למטה */}
        <ArrowDown size={32} color={isReadyForAlgorithm ? "var(--primary-color)" : "var(--text-secondary)"} style={{ opacity: isReadyForAlgorithm ? 1 : 0.5 }} />

        {/* שלב 4: הפקת שיבוץ */}
        <div className="glass-panel" style={{ width: '100%', textAlign: 'center', borderColor: isReadyForAlgorithm ? 'var(--primary-color)' : 'var(--border-color)', position: 'relative', overflow: 'hidden' }}>
          
          {/* זוהר ברקע כשמוכן */}
          {isReadyForAlgorithm && (
             <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'radial-gradient(circle at center, rgba(99, 102, 241, 0.15) 0%, transparent 70%)', zIndex: 0, pointerEvents: 'none' }}></div>
          )}

          <div style={{ position: 'relative', zIndex: 1 }}>
            <h4 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>שלב 4: הפעלת אלגוריתם והפקת פלט</h4>
            
            {/* בורר תאריך תחילת שבוע */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              marginBottom: '1.5rem',
              padding: '0.6rem 1.25rem',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              borderRadius: '10px',
              border: '1px solid var(--border-color)',
              flexWrap: 'wrap'
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                <CalendarDays size={18} color="var(--primary-color)" /> תאריך תחילת שבוע (יום א'):
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <button
                  type="button"
                  onClick={() => handleShiftWeek(-7)}
                  className="btn btn-secondary"
                  style={{ padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                  title="שבוע קודם"
                >
                  <ChevronRight size={16} />
                </button>
                <input 
                  type="date" 
                  value={weekStartDate} 
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="input-field" 
                  style={{ width: 'auto', padding: '0.35rem 0.6rem', margin: 0, textAlign: 'center' }}
                />
                <button
                  type="button"
                  onClick={() => handleShiftWeek(7)}
                  className="btn btn-secondary"
                  style={{ padding: '0.35rem 0.6rem', fontSize: '0.85rem' }}
                  title="שבוע הבא"
                >
                  <ChevronLeft size={16} />
                </button>
              </div>
              {weekStartDate && (
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginRight: '0.25rem' }}>
                  (שבוע {getWeekRangeStr(weekStartDate)})
                </span>
              )}
            </div>

            {isReadyForAlgorithm ? (
              <div className="animate-fade-in">
                {algorithmError && (
                  <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid var(--danger-color)', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem', textAlign: 'right' }}>
                    <h5 style={{ color: 'var(--danger-color)', fontSize: '1.2rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <XCircle /> {algorithmError.message}
                    </h5>
                    <ul style={{ listStyle: 'disc', paddingRight: '1.5rem', color: 'var(--text-primary)' }}>
                      {algorithmError.conflicts.map((c, i) => <li key={i} style={{ marginBottom: '0.5rem' }}>{c}</li>)}
                    </ul>
                    <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      אנא חזור לשלב 3, בטל פטורים כדי לשחרר כוח אדם, או בקש מהמטבח להפחית דרישות.
                    </p>
                  </div>
                )}

                {algorithmResult && (
                  <div style={{ backgroundColor: 'rgba(16,185,129,0.05)', border: '1px solid var(--secondary-color)', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem', textAlign: 'center' }}>
                    <h5 style={{ color: 'var(--secondary-color)', fontSize: '1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
                      <CheckCircle2 size={28} /> דוח שיבוץ תורנויות הושלם!
                    </h5>
                    
                    {/* תצוגת PDF מקדימה (טבלה) */}
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button onClick={() => setScheduleFilter('all')} className="btn" style={{ padding: '0.4rem 1rem', backgroundColor: scheduleFilter === 'all' ? 'var(--primary-color)' : 'rgba(255,255,255,0.1)' }}>הכל</button>
                        <button onClick={() => setScheduleFilter('plasam')} className="btn" style={{ padding: '0.4rem 1rem', backgroundColor: scheduleFilter === 'plasam' ? 'var(--primary-color)' : 'rgba(255,255,255,0.1)' }}>פלס״ם</button>
                      </div>

                      <button 
                        type="button"
                        onClick={() => openPreviewEdit(0, 'morning', -1, null, algorithmResult.schedule[0]?.shortName || "א'", formatDayDate(algorithmResult.schedule[0]?.shortName, weekStartDate), true)}
                        className="btn btn-secondary"
                        style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', borderColor: 'rgba(99, 102, 241, 0.4)' }}
                        title="הוספת תורן חדש ליום ומשמרת לבחירתך"
                      >
                        <Plus size={15} color="var(--primary-color)" /> הוסף תורן לטבלה
                      </button>

                      {algorithmResult.isManuallyModified && (
                        <button 
                          type="button"
                          onClick={() => {
                            if (window.confirm('האם לשחזר את הטבלה לשיבוץ המקורי של האלגוריתם (ביטול כל העריכות הידניות)?')) {
                              setAlgorithmResult(prev => ({
                                ...prev,
                                schedule: JSON.parse(JSON.stringify(prev.originalSchedule)),
                                isManuallyModified: false
                              }));
                            }
                          }}
                          className="btn btn-secondary" 
                          style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.4)' }}
                          title="שחזור השיבוץ המקורי כפי שחושב על ידי האלגוריתם"
                        >
                          <RotateCcw size={14} /> שחזר למקורי
                        </button>
                      )}
                    </div>

                    {/* טיפ הדרכה לעריכה מהירה */}
                    <div style={{
                      backgroundColor: 'rgba(99, 102, 241, 0.08)',
                      border: '1px dashed rgba(99, 102, 241, 0.35)',
                      borderRadius: '8px',
                      padding: '0.55rem 0.85rem',
                      marginBottom: '1rem',
                      fontSize: '0.85rem',
                      color: 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.45rem',
                      maxWidth: '450px',
                      margin: '0 auto 1rem auto'
                    }}>
                      <PenLine size={16} color="var(--primary-color)" style={{ flexShrink: 0 }} />
                      <span><strong>עריכת מנהל מהירה:</strong> לחץ על כל שם בטבלה כדי לשנותו, להחליף חייל או למחוק תורן.</span>
                    </div>
                    
                    <div id="schedule-table-preview" className="pdf-preview" style={{ backgroundColor: 'white', color: 'black', padding: '1rem 1.5rem', borderRadius: '8px', textAlign: 'right', marginBottom: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '0.95rem', width: '90%', maxWidth: '450px', margin: '0 auto' }}>
                      <h2 style={{ textAlign: 'center', borderBottom: '2px solid #333', paddingBottom: '0.5rem', marginBottom: '1rem', fontSize: '1.25rem' }}>
                        שיבוץ תורני מטבח - {scheduleFilter === 'plasam' ? 'פלס״ם' : 'הכל'}
                        {weekStartDate && (
                          <span style={{ display: 'block', fontSize: '0.9rem', fontWeight: 'normal', color: '#555', marginTop: '4px' }}>
                            שבוע {getWeekRangeStr(weekStartDate)}
                          </span>
                        )}
                      </h2>
                      
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', margin: '0 auto' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '2px solid #ddd' }}>
                            <th style={{ padding: '0.4rem 0.75rem', border: '1px solid #ddd', width: '22%' }}>יום ותאריך</th>
                            <th style={{ padding: '0.4rem 0.75rem', border: '1px solid #ddd', width: '39%' }}>בוקר</th>
                            <th style={{ padding: '0.4rem 0.75rem', border: '1px solid #ddd', width: '39%' }}>ערב</th>
                          </tr>
                        </thead>
                        <tbody>
                          {algorithmResult.schedule.map((day, idx) => {
                            const getDepartmentColor = (depName) => {
                              const colors = { 'תקשוב': '#bae6fd', 'לוגיסטיקה': '#fef08a', 'טנ"א': '#bbf7d0', 'משא"ן': '#fbcfe8' };
                              return colors[depName] || '#f3f4f6';
                            };
                            
                            const morningWithIdx = (day.morning || []).map((s, origIdx) => ({ ...s, origIdx }));
                            const eveningWithIdx = (day.evening || []).map((s, origIdx) => ({ ...s, origIdx }));
                            
                            const filteredMorning = morningWithIdx.filter(s => scheduleFilter === 'all' || (scheduleFilter === 'plasam' && !s.isAgam));
                            const filteredEvening = eveningWithIdx.filter(s => scheduleFilter === 'all' || (scheduleFilter === 'plasam' && !s.isAgam));
                            
                            // Align lengths so they match row by row visually
                            const maxRows = Math.max(filteredMorning.length, filteredEvening.length);
                            const rows = Array.from({ length: maxRows === 0 ? 1 : maxRows });
                            const dayDateStr = formatDayDate(day.shortName, weekStartDate);

                            return (
                              <tr key={idx}>
                                <td style={{ padding: '0.4rem 0.5rem', border: '1px solid #ddd', fontWeight: 'bold', width: '22%', verticalAlign: 'middle' }}>
                                  <div style={{ fontSize: '0.95rem' }}>{day.shortName}</div>
                                  {dayDateStr && (
                                    <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 'normal', marginTop: '2px' }}>
                                      {dayDateStr}
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding: '0', border: '1px solid #ddd', verticalAlign: 'top', width: '39%' }}>
                                  {rows.map((_, i) => {
                                    if (maxRows === 0) {
                                      return (
                                        <div 
                                          key={i} 
                                          onClick={() => openPreviewEdit(idx, 'morning', -1, null, day.shortName, dayDateStr)}
                                          title="לחץ להוספת תורן בוקר"
                                          style={{ padding: '0.4rem', cursor: 'pointer', color: '#888' }}
                                        >
                                          -
                                        </div>
                                      );
                                    }
                                    const s = filteredMorning[i];
                                    return s ? (
                                      <div 
                                        key={i} 
                                        onClick={() => openPreviewEdit(idx, 'morning', s.origIdx, s, day.shortName, dayDateStr)}
                                        title="לחץ לעריכת שם או החלפת תורן"
                                        style={{ 
                                          padding: '0.4rem', 
                                          borderBottom: i < maxRows - 1 ? '1px solid #eee' : 'none', 
                                          backgroundColor: getDepartmentColor(s.department),
                                          cursor: 'pointer',
                                          userSelect: 'none'
                                        }}
                                      >
                                        {s.name}
                                      </div>
                                    ) : (
                                      <div 
                                        key={i} 
                                        onClick={() => openPreviewEdit(idx, 'morning', -1, null, day.shortName, dayDateStr)}
                                        title="לחץ להוספת תורן בוקר"
                                        style={{ 
                                          padding: '0.4rem', 
                                          borderBottom: i < maxRows - 1 ? '1px solid #eee' : 'none',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        &nbsp;
                                      </div>
                                    );
                                  })}
                                </td>
                                <td style={{ padding: '0', border: '1px solid #ddd', verticalAlign: 'top', width: '39%' }}>
                                  {rows.map((_, i) => {
                                    if (maxRows === 0) {
                                      return (
                                        <div 
                                          key={i} 
                                          onClick={() => openPreviewEdit(idx, 'evening', -1, null, day.shortName, dayDateStr)}
                                          title="לחץ להוספת תורן ערב"
                                          style={{ padding: '0.4rem', cursor: 'pointer', color: '#888' }}
                                        >
                                          -
                                        </div>
                                      );
                                    }
                                    const s = filteredEvening[i];
                                    return s ? (
                                      <div 
                                        key={i} 
                                        onClick={() => openPreviewEdit(idx, 'evening', s.origIdx, s, day.shortName, dayDateStr)}
                                        title="לחץ לעריכת שם או החלפת תורן"
                                        style={{ 
                                          padding: '0.4rem', 
                                          borderBottom: i < maxRows - 1 ? '1px solid #eee' : 'none', 
                                          backgroundColor: getDepartmentColor(s.department),
                                          cursor: 'pointer',
                                          userSelect: 'none'
                                        }}
                                      >
                                        {s.name}
                                      </div>
                                    ) : (
                                      <div 
                                        key={i} 
                                        onClick={() => openPreviewEdit(idx, 'evening', -1, null, day.shortName, dayDateStr)}
                                        title="לחץ להוספת תורן ערב"
                                        style={{ 
                                          padding: '0.4rem', 
                                          borderBottom: i < maxRows - 1 ? '1px solid #eee' : 'none',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        &nbsp;
                                      </div>
                                    );
                                  })}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* דוח סטטיסטיקה והקרבות */}
                    {algorithmResult.sacrificed && (
                      <div style={{ marginTop: '2rem', padding: '1.5rem', backgroundColor: 'rgba(245, 158, 11, 0.05)', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.3)', textAlign: 'right' }}>
                        <h4 style={{ color: '#F59E0B', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <AlertCircle size={20} /> "חיילים שהוקרבו" השבוע
                        </h4>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                          האלגוריתם נאלץ לפגוע בנוחות של חיילים אלו כדי לעמוד בחוקים קריטיים יותר (כמו אילוצים של אחרים, איסור חפיפה מחלקתית, או השלמת פערים). הם זכאים להתחשבות בשבוע הבא:
                        </p>
                        {algorithmResult.sacrificed.length > 0 ? (
                          <ul style={{ listStyleType: 'none', padding: 0, margin: 0 }}>
                            {algorithmResult.sacrificed.map((s, idx) => (
                              <li key={idx} style={{ padding: '0.75rem', backgroundColor: 'rgba(0,0,0,0.2)', marginBottom: '0.5rem', borderRadius: '4px' }}>
                                <strong style={{ color: 'var(--text-primary)' }}>{s.name} ({s.department})</strong>
                                <ul style={{ marginTop: '0.25rem', paddingRight: '1.5rem', color: '#F59E0B', fontSize: '0.85rem' }}>
                                  {s.reasons.map((r, i) => <li key={i}>{r}</li>)}
                                </ul>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div style={{ padding: '1rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--secondary-color)', borderRadius: '4px', textAlign: 'center' }}>
                            <CheckCircle2 size={24} style={{ display: 'block', margin: '0 auto 0.5rem' }} />
                            אף חייל לא הוקרב השבוע! השיבוץ עבר בצורה חלקה ונוחה לכולם.
                          </div>
                        )}
                      </div>
                    )}

                    {/* סיכום כמות משמרות שבועית */}
                    {algorithmResult.stats && (
                      <div style={{ marginTop: '2rem', padding: '1.5rem', backgroundColor: 'rgba(59, 130, 246, 0.05)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.3)', textAlign: 'right' }}>
                        <h4 style={{ color: '#3B82F6', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <FileText size={20} /> סיכום משמרות שבועי
                        </h4>
                        <div style={{ maxHeight: '200px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.9rem' }}>
                            <thead>
                              <tr style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>
                                <th style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>שם</th>
                                <th style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>מחלקה</th>
                                <th style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>אמצ״ש</th>
                                <th style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>סופ״ש</th>
                                <th style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>סה״כ</th>
                              </tr>
                            </thead>
                            <tbody>
                              {algorithmResult.stats
                                .filter(s => s.assignedDays && s.assignedDays.length > 0)
                                .sort((a, b) => b.totalShifts - a.totalShifts)
                                .map((s, idx) => (
                                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                    <td style={{ padding: '0.5rem', fontWeight: 500 }}>{s.name}</td>
                                    <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>{s.department}</td>
                                    <td style={{ padding: '0.5rem' }}>{s.midweekShifts}</td>
                                    <td style={{ padding: '0.5rem' }}>{s.weekendShifts}</td>
                                    <td style={{ padding: '0.5rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>{s.totalShifts}</td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* תפריט שיקולים ולמידה */}
                    <div style={{ marginTop: '2rem', padding: '1.5rem', backgroundColor: 'rgba(99, 102, 241, 0.05)', borderRadius: '8px', border: '1px solid rgba(99, 102, 241, 0.3)', textAlign: 'right' }}>
                      <button 
                        onClick={() => setShowConsiderations(!showConsiderations)}
                        style={{ background: 'none', border: 'none', color: 'var(--primary-color)', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1.1rem', fontWeight: 600, padding: '0.5rem 0', cursor: 'pointer' }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <BrainCircuit size={20} /> תפריט שיקולים והחלטות אלגוריתם
                        </span>
                        {showConsiderations ? <ChevronUp /> : <ChevronDown />}
                      </button>

                      {showConsiderations && (
                        <div className="animate-fade-in" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(99, 102, 241, 0.2)' }}>
                          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                            האלגוריתם התבסס על החוקים והשיקולים הבאים בעת יצירת השיבוץ:
                          </p>
                          <ul style={{ listStyleType: 'none', padding: 0, margin: '0 0 1.5rem 0' }}>
                            {algorithmResult.considerations?.map((cons, idx) => (
                              <li key={idx} style={{ padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.02)', marginBottom: '0.5rem', borderRadius: '4px', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                {cons}
                              </li>
                            ))}
                          </ul>

                          <div style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '6px' }}>
                            <h5 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--secondary-color)', margin: '0 0 0.75rem 0', fontSize: '1rem' }}>
                              <MessageSquareText size={18} /> ביקורת ולמידת מכונה
                            </h5>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                              משהו לא מדויק? שיבצנו מישהו יותר מדי בסופ"ש? כתוב לנו כאן, והאלגוריתם ילמד מכך וידייק את המשקלים שלו לשבועות הבאים.
                            </p>
                            <textarea 
                              className="input-field" 
                              style={{ width: '100%', minHeight: '80px', padding: '0.75rem', marginBottom: '0.75rem' }}
                              placeholder="לדוגמה: שיבצת את מעיין יותר מדי פעמים בסופ״ש יחסית לשאר..."
                              value={feedbackText}
                              onChange={(e) => setFeedbackText(e.target.value)}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                              <button 
                                className="btn btn-secondary" 
                                style={{ fontSize: '0.9rem', padding: '0.5rem 1.5rem' }}
                                onClick={handleFeedbackSubmit}
                                disabled={!feedbackText.trim() || feedbackSubmitted}
                              >
                                {feedbackSubmitted ? 'הביקורת נשלחה ונלמדה! ✅' : 'שלח לאלגוריתם'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* שליחה לוואטסאפ כתמונה */}
                    <div style={{ marginTop: '2rem', padding: '1.5rem', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                      <h4 style={{ margin: 0, color: 'var(--secondary-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Share2 size={24} />
                        שתף את הטבלה
                      </h4>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>בלחיצה אחת, המערכת תצלם את הטבלה ותעביר אותך לשלוח אותה בוואטסאפ כתמונה יפה וקריאה.</p>
                      
                      <div style={{ display: 'flex', gap: '1rem', width: '100%', maxWidth: '400px', justifyContent: 'center' }}>
                        <button 
                          onClick={async () => {
                            const element = document.getElementById('schedule-table-preview');
                            if (!element) return;
                            try {
                              const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff' });
                              canvas.toBlob(async (blob) => {
                                const file = new File([blob], `schedule_${weekStartDate || 'week'}.png`, { type: 'image/png' });
                                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                                  await navigator.share({
                                    files: [file],
                                    title: 'שיבוץ תורנויות',
                                    text: `שיבוץ תורני מטבח לשבוע ${getWeekRangeStr(weekStartDate)}`
                                  });
                                } else {
                                  // Fallback to download if sharing files is not supported
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = `schedule_${weekStartDate || 'week'}.png`;
                                  a.click();
                                  URL.revokeObjectURL(url);
                                  alert('הטבלה הורדה כקובץ למכשיר שלך! תוכל לשלוח אותה כעת בוואטסאפ.');
                                }
                              });
                            } catch(err) {
                              console.error(err);
                              alert('אירעה שגיאה ביצירת התמונה');
                            }
                          }} 
                          className="btn" 
                          style={{ padding: '0.75rem 1.5rem', backgroundColor: '#25D366', color: 'white', border: 'none', width: '100%', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" /><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" /></svg>
                          שלח כתמונה לוואטסאפ
                        </button>
                      </div>
                    </div>

                    <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                      <button 
                        onClick={handleTransferToStep5} 
                        className="btn" 
                        style={{ padding: '0.85rem 2rem', backgroundColor: 'var(--primary-color)', color: 'white', display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.1rem', boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)' }}
                      >
                        <ArrowDown size={22} />
                        העבר שבצ״ק לטבלה השבועית (שלב 5)
                      </button>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        השבצ״ק יועבר לשלב 5 לעריכת בלת״מים שוטפת במהלך השבוע. חתימת המנהל תתבצע בסוף השבוע לאחר וידוא התייצבות.
                      </span>
                      {transferredSuccess && (
                        <div className="animate-fade-in" style={{ color: 'var(--secondary-color)', fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <CheckCircle2 size={18} /> השבצ״ק הועבר בהצלחה לשלב 5! כעת ניתן לנהל בלת״מים.
                        </div>
                      )}
                    </div>

                    <p style={{ marginTop: '1.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>האלגוריתם שילב <strong>{algorithmResult.totalEligible}</strong> חיילים תוך התחשבות בחצאי משמרות, שוויון נטל ואילוצי מערכת.</p>
                  </div>
                )}

                {!algorithmResult && (
                  <>
                    <p style={{ color: 'var(--secondary-color)', marginBottom: '1.5rem' }}>לאחר שווידאת ואישרת את הרשימה, ניתן להפעיל את השיבוץ האוטומטי.</p>
                    <button onClick={handleRunAlgorithm} className="btn" style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}>
                      <FileText size={20} />
                      הפעל אלגוריתם והפק דוח PDF
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div>
                <button className="btn btn-secondary" style={{ padding: '1rem 2rem', fontSize: '1.1rem', opacity: 0.5, cursor: 'not-allowed' }} disabled>
                  <FileText size={20} />
                  הפעל אלגוריתם והפק דוח PDF
                </button>
              </div>
            )}
          </div>
        </div>

        {/* חץ למטה */}
        <ArrowDown size={32} color={justiceData ? "var(--primary-color)" : "var(--text-secondary)"} style={{ opacity: justiceData ? 1 : 0.5 }} />

        {/* שלב 5: טבלת השבצ״ק, בלת"מים וחתימת מנהל בסוף השבוע */}
        <div className="glass-panel" style={{ width: '100%', borderColor: justiceData ? 'var(--primary-color)' : 'var(--border-color)', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h4 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
               <ClipboardCheck color="var(--primary-color)" /> שלב 5: ניהול שבצ״ק שבועי ובלת״מים
               {(justiceData?.startDate || weekStartDate) && (
                 <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 'normal' }}>
                   (שבוע {getWeekRangeStr(justiceData?.startDate || weekStartDate)})
                 </span>
               )}
            </h4>
            {justiceData?.isSigned ? (
              <span style={{ fontSize: '0.85rem', padding: '0.3rem 0.8rem', borderRadius: '20px', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--secondary-color)', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}>
                <CheckCircle2 size={15} /> שבוע חתום ומאושר
              </span>
            ) : justiceData ? (
              <span style={{ fontSize: '0.85rem', padding: '0.3rem 0.8rem', borderRadius: '20px', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', border: '1px solid rgba(245, 158, 11, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 500 }}>
                טיוטת שבצ״ק פעילה (ממתין לסוף השבוע)
              </span>
            ) : null}
          </div>
          
          {justiceData ? (
            <div className="animate-fade-in" style={{ textAlign: 'center' }}>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '0.75rem', textAlign: 'right', fontSize: '0.95rem' }}>
                כאן מנוהל השבצ״ק השבועי בפועל. לחץ על שם של חייל כדי לעדכן בלת״ם (החלפה או הסרה), או לחץ על <strong>+ הוסף תורן</strong> להגדלת כמות התורנים ביום מסוים.
                <br />
                <strong>בסוף השבוע:</strong> וודא מי באמת עלה למשמרות, וחתום על השבצ״ק בחלק התחתון לסגירת השבוע ועדכון היסטוריית הצדק.
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: '#34d399', backgroundColor: 'rgba(16, 185, 129, 0.12)', padding: '0.3rem 0.8rem', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.35)', fontWeight: 500 }}>
                  <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#10B981', display: 'inline-block' }}></span>
                  משבצת ירוקה = תורן שעודכן או נוסף בעריכה (בלת״ם)
                </span>
              </div>

              <div style={{ overflowX: 'auto', backgroundColor: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', width: '20%' }}>יום ותאריך</th>
                      <th style={{ padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', width: '40%' }}>בוקר</th>
                      <th style={{ padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', width: '40%' }}>ערב</th>
                    </tr>
                  </thead>
                  <tbody>
                    {justiceData.schedule.map((day, dayIdx) => {
                      const dayDateStr = day.dateStr || formatDayDate(day.shortName, justiceData.startDate || weekStartDate);
                      return (
                        <tr key={dayIdx}>
                          <td style={{ padding: '0.75rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', fontWeight: 'bold', verticalAlign: 'middle', width: '20%' }}>
                            <div>{day.shortName}</div>
                            {dayDateStr && (
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 'normal', marginTop: '2px' }}>
                                {dayDateStr}
                              </div>
                            )}
                          </td>

                          {/* עמודת בוקר */}
                          <td style={{ padding: '0', borderBottom: '1px solid rgba(255,255,255,0.05)', borderLeft: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top' }}>
                            {(!day.morning || day.morning.length === 0) && !(addingShift?.dayIdx === dayIdx && addingShift?.shiftTime === 'morning') && (
                              <div style={{ padding: '0.6rem 0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                                <span style={{ opacity: 0.35, fontSize: '0.9rem' }}>-</span>
                                <button
                                  type="button"
                                  onClick={() => setAddingShift({ dayIdx, shiftTime: 'morning' })}
                                  className="btn btn-secondary"
                                  style={{
                                    padding: '0.2rem 0.55rem',
                                    fontSize: '0.75rem',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    borderColor: 'rgba(99, 102, 241, 0.4)',
                                    color: 'var(--primary-color)'
                                  }}
                                  title="הוסף תורן למשמרת בוקר"
                                >
                                  <Plus size={13} /> הוסף תורן
                                </button>
                              </div>
                            )}

                            {(day.morning || []).map((s, idx) => {
                              const isSlotEdited = s.isEdited || s.isAdded || (s.originalName && (s.name !== s.originalName || s.department !== s.originalDepartment));
                              return (
                                <div 
                                  key={idx} 
                                  style={{ 
                                    padding: '0.5rem', 
                                    borderBottom: idx < day.morning.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', 
                                    cursor: 'pointer', 
                                    backgroundColor: isSlotEdited ? 'rgba(16, 185, 129, 0.22)' : 'rgba(255,255,255,0.02)',
                                    borderRight: isSlotEdited ? '3px solid #10B981' : 'none',
                                    transition: 'all 0.2s' 
                                  }} 
                                  onClick={() => setEditingShift({ dayIdx, shiftTime: 'morning', idx, oldPerson: s })} 
                                  title="לחץ להחלפה או להסרת התורן"
                                >
                                   {editingShift?.dayIdx === dayIdx && editingShift?.shiftTime === 'morning' && editingShift?.idx === idx ? (
                                     <select 
                                        autoFocus
                                        onBlur={() => setEditingShift(null)}
                                        onChange={(e) => {
                                          if (e.target.value === '__REMOVE__') {
                                            handleRemoveSoldierFromShift(dayIdx, 'morning', idx, s);
                                          } else if (e.target.value) {
                                            handleBaltamChange(dayIdx, 'morning', idx, s, e.target.value);
                                          }
                                        }}
                                        style={{ width: '100%', padding: '0.25rem', backgroundColor: '#333', color: 'white', border: '1px solid var(--primary-color)', borderRadius: '4px' }}
                                     >
                                       <option value="">בחר מחליף...</option>
                                       <option value="__REMOVE__" style={{ color: '#ef4444', fontWeight: 'bold' }}>❌ הסר תורן ממשמרת זו</option>
                                       {departmentsData.flatMap(d => (d.soldiers || []).map(soldier => (
                                         <option key={`${soldier.name}_${d.departmentName}`} value={`${soldier.name}_${d.departmentName}`}>
                                           {soldier.name} ({d.departmentName})
                                         </option>
                                       )))}
                                     </select>
                                   ) : (
                                     <span style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.35rem', color: isSlotEdited ? '#34d399' : 'var(--text-primary)', fontWeight: isSlotEdited ? 600 : 'normal' }}>
                                       {s.name} <span style={{ fontSize: '0.75rem', opacity: isSlotEdited ? 0.9 : 0.6 }}>({s.department})</span>
                                       {isSlotEdited ? (
                                         <span style={{ fontSize: '0.68rem', backgroundColor: 'rgba(16, 185, 129, 0.35)', color: '#a7f3d0', padding: '0.1rem 0.35rem', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.5)' }}>
                                           עודכן
                                         </span>
                                       ) : (
                                         <span>✏️</span>
                                       )}
                                     </span>
                                   )}
                                </div>
                              );
                            })}

                            {/* טופס הוספת תורן בוקר */}
                            {addingShift?.dayIdx === dayIdx && addingShift?.shiftTime === 'morning' ? (
                              <div style={{ padding: '0.5rem', backgroundColor: 'rgba(99, 102, 241, 0.15)', border: '1px solid var(--primary-color)', borderRadius: '4px', margin: '0.25rem', textAlign: 'right' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary-color)', marginBottom: '0.3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span>הוספת תורן בוקר:</span>
                                  <button type="button" onClick={() => setAddingShift(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem' }}>✕</button>
                                </div>
                                <select
                                  autoFocus
                                  defaultValue=""
                                  onChange={(e) => {
                                    if (e.target.value) handleAddSoldierToShift(dayIdx, 'morning', e.target.value);
                                  }}
                                  style={{ width: '100%', padding: '0.25rem', backgroundColor: '#222', color: 'white', border: '1px solid var(--primary-color)', borderRadius: '4px', fontSize: '0.82rem' }}
                                >
                                  <option value="">בחר חייל להוספה...</option>
                                  {departmentsData.flatMap(d => (d.soldiers || []).map(soldier => (
                                    <option key={`${soldier.name}_${d.departmentName}`} value={`${soldier.name}_${d.departmentName}`}>
                                      {soldier.name} ({d.departmentName})
                                    </option>
                                  )))}
                                </select>
                              </div>
                            ) : (
                              day.morning && day.morning.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setAddingShift({ dayIdx, shiftTime: 'morning' })}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.25rem',
                                    width: '100%',
                                    padding: '0.3rem 0.5rem',
                                    fontSize: '0.72rem',
                                    backgroundColor: 'transparent',
                                    border: 'none',
                                    borderTop: '1px dashed rgba(255, 255, 255, 0.08)',
                                    color: 'var(--primary-color)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    opacity: 0.85
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.1)'; e.currentTarget.style.opacity = '1'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.opacity = '0.85'; }}
                                  title="הוסף תורן נוסף למשמרת בוקר"
                                >
                                  <Plus size={12} /> הוסף תורן
                                </button>
                              )
                            )}
                          </td>

                          {/* עמודת ערב */}
                          <td style={{ padding: '0', borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top' }}>
                            {(!day.evening || day.evening.length === 0) && !(addingShift?.dayIdx === dayIdx && addingShift?.shiftTime === 'evening') && (
                              <div style={{ padding: '0.6rem 0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                                <span style={{ opacity: 0.35, fontSize: '0.9rem' }}>-</span>
                                <button
                                  type="button"
                                  onClick={() => setAddingShift({ dayIdx, shiftTime: 'evening' })}
                                  className="btn btn-secondary"
                                  style={{
                                    padding: '0.2rem 0.55rem',
                                    fontSize: '0.75rem',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    borderColor: 'rgba(99, 102, 241, 0.4)',
                                    color: 'var(--primary-color)'
                                  }}
                                  title="הוסף תורן למשמרת ערב"
                                >
                                  <Plus size={13} /> הוסף תורן
                                </button>
                              </div>
                            )}

                            {(day.evening || []).map((s, idx) => {
                              const isSlotEdited = s.isEdited || s.isAdded || (s.originalName && (s.name !== s.originalName || s.department !== s.originalDepartment));
                              return (
                                <div 
                                  key={idx} 
                                  style={{ 
                                    padding: '0.5rem', 
                                    borderBottom: idx < day.evening.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', 
                                    cursor: 'pointer', 
                                    backgroundColor: isSlotEdited ? 'rgba(16, 185, 129, 0.22)' : 'rgba(255,255,255,0.02)',
                                    borderRight: isSlotEdited ? '3px solid #10B981' : 'none',
                                    transition: 'all 0.2s' 
                                  }} 
                                  onClick={() => setEditingShift({ dayIdx, shiftTime: 'evening', idx, oldPerson: s })} 
                                  title="לחץ להחלפה או להסרת התורן"
                                >
                                   {editingShift?.dayIdx === dayIdx && editingShift?.shiftTime === 'evening' && editingShift?.idx === idx ? (
                                     <select 
                                        autoFocus
                                        onBlur={() => setEditingShift(null)}
                                        onChange={(e) => {
                                          if (e.target.value === '__REMOVE__') {
                                            handleRemoveSoldierFromShift(dayIdx, 'evening', idx, s);
                                          } else if (e.target.value) {
                                            handleBaltamChange(dayIdx, 'evening', idx, s, e.target.value);
                                          }
                                        }}
                                        style={{ width: '100%', padding: '0.25rem', backgroundColor: '#333', color: 'white', border: '1px solid var(--primary-color)', borderRadius: '4px' }}
                                     >
                                       <option value="">בחר מחליף...</option>
                                       <option value="__REMOVE__" style={{ color: '#ef4444', fontWeight: 'bold' }}>❌ הסר תורן ממשמרת זו</option>
                                       {departmentsData.flatMap(d => (d.soldiers || []).map(soldier => (
                                         <option key={`${soldier.name}_${d.departmentName}`} value={`${soldier.name}_${d.departmentName}`}>
                                           {soldier.name} ({d.departmentName})
                                         </option>
                                       )))}
                                     </select>
                                   ) : (
                                     <span style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.35rem', color: isSlotEdited ? '#34d399' : 'var(--text-primary)', fontWeight: isSlotEdited ? 600 : 'normal' }}>
                                       {s.name} <span style={{ fontSize: '0.75rem', opacity: isSlotEdited ? 0.9 : 0.6 }}>({s.department})</span>
                                       {isSlotEdited ? (
                                         <span style={{ fontSize: '0.68rem', backgroundColor: 'rgba(16, 185, 129, 0.35)', color: '#a7f3d0', padding: '0.1rem 0.35rem', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.5)' }}>
                                           עודכן
                                         </span>
                                       ) : (
                                         <span>✏️</span>
                                       )}
                                     </span>
                                   )}
                                </div>
                              );
                            })}

                            {/* טופס הוספת תורן ערב */}
                            {addingShift?.dayIdx === dayIdx && addingShift?.shiftTime === 'evening' ? (
                              <div style={{ padding: '0.5rem', backgroundColor: 'rgba(99, 102, 241, 0.15)', border: '1px solid var(--primary-color)', borderRadius: '4px', margin: '0.25rem', textAlign: 'right' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary-color)', marginBottom: '0.3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span>הוספת תורן ערב:</span>
                                  <button type="button" onClick={() => setAddingShift(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem' }}>✕</button>
                                </div>
                                <select
                                  autoFocus
                                  defaultValue=""
                                  onChange={(e) => {
                                    if (e.target.value) handleAddSoldierToShift(dayIdx, 'evening', e.target.value);
                                  }}
                                  style={{ width: '100%', padding: '0.25rem', backgroundColor: '#222', color: 'white', border: '1px solid var(--primary-color)', borderRadius: '4px', fontSize: '0.82rem' }}
                                >
                                  <option value="">בחר חייל להוספה...</option>
                                  {departmentsData.flatMap(d => (d.soldiers || []).map(soldier => (
                                    <option key={`${soldier.name}_${d.departmentName}`} value={`${soldier.name}_${d.departmentName}`}>
                                      {soldier.name} ({d.departmentName})
                                    </option>
                                  )))}
                                </select>
                              </div>
                            ) : (
                              day.evening && day.evening.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setAddingShift({ dayIdx, shiftTime: 'evening' })}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.25rem',
                                    width: '100%',
                                    padding: '0.3rem 0.5rem',
                                    fontSize: '0.72rem',
                                    backgroundColor: 'transparent',
                                    border: 'none',
                                    borderTop: '1px dashed rgba(255, 255, 255, 0.08)',
                                    color: 'var(--primary-color)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    opacity: 0.85
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.1)'; e.currentTarget.style.opacity = '1'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.opacity = '0.85'; }}
                                  title="הוסף תורן נוסף למשמרת ערב"
                                >
                                  <Plus size={12} /> הוסף תורן
                                </button>
                              )
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* חתימת מנהל - מיד אחרי הטבלה שניתן לערוך */}
              <div style={{
                marginTop: '1.75rem',
                padding: '1.5rem',
                borderRadius: '10px',
                backgroundColor: justiceData.isSigned ? 'rgba(16, 185, 129, 0.07)' : 'rgba(255, 255, 255, 0.02)',
                border: justiceData.isSigned ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid var(--border-color)',
                textAlign: 'right',
                transition: 'all 0.3s ease'
              }}>
                {justiceData.isSigned ? (
                  <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--secondary-color)', border: '2px solid rgba(16, 185, 129, 0.4)' }}>
                          <CheckCircle2 size={26} />
                        </div>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--secondary-color)' }}>
                            השבצ״ק השבועי נחתם ואושר רשמית!
                          </h4>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            השבוע נסגר והמשמרות בפועל נצברו בהיסטוריית הצדק לקראת השבוע הבא
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button 
                          onClick={handleUnlockForEdit} 
                          className="btn btn-secondary" 
                          style={{ fontSize: '0.85rem', padding: '0.45rem 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', borderColor: 'rgba(255,255,255,0.2)' }}
                          title="פתח מחדש לעריכה אם התרחש בלת״ם של הרגע האחרון"
                        >
                          <Unlock size={14} /> פתח לעריכה מחודשת
                        </button>

                        <button 
                          type="button"
                          onClick={() => setShowResetModal(true)} 
                          className="btn btn-secondary" 
                          style={{ fontSize: '0.85rem', padding: '0.45rem 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#f87171', borderColor: 'rgba(239,68,68,0.3)' }}
                          title="איפוס טבלת הצדק וביטול צבירת המשמרות"
                        >
                          <RotateCcw size={14} /> איפוס צבירת צדק
                        </button>
                      </div>
                    </div>

                    <div style={{ backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: '8px', padding: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block' }}>נחתם על ידי</span>
                        <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>{justiceData.signedBy || 'מנהל תורנויות'}</strong>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block' }}>מועד חתימה</span>
                        <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                          {justiceData.signedAt ? new Date(justiceData.signedAt).toLocaleString('he-IL', { dateStyle: 'medium', timeStyle: 'short' }) : '-'}
                        </strong>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block' }}>סטטוס צבירת צדק</span>
                        <strong style={{ fontSize: '0.95rem', color: 'var(--secondary-color)' }}>נצבר בהיסטוריה ✅</strong>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <h5 style={{ margin: 0, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#F59E0B' }}>
                        <FileCheck size={20} /> חתימת מנהל וסגירת שבוע (בסוף השבוע)
                      </h5>
                      <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem', borderRadius: '12px', backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                        סגירת שבוע
                      </span>
                    </div>

                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: '1.5' }}>
                      במהלך השבוע השבצ״ק פתוח לעריכת בלת״מים בטבלה שלמעלה.<br />
                      <strong>בסיום השבוע</strong>, לאחר שווידאת מי מהחיילים אכן עלה לכל משמרת, חתום כאן כדי לאשר רשמית את השבצ״ק ולצבור את המשמרות בטבלת הצדק לחישוב השבועות הבאים.
                    </p>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: '1', minWidth: '240px' }}>
                        <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>שם המנהל החותם:</label>
                        <input 
                          type="text" 
                          className="input-field" 
                          style={{ margin: 0, flex: 1, padding: '0.5rem 0.75rem' }}
                          value={signerName} 
                          onChange={(e) => setSignerName(e.target.value)} 
                          placeholder="למשל: סגן רועי / מנהל תורנויות"
                        />
                      </div>

                      <button 
                        onClick={handleSignSchedule} 
                        disabled={isSigning}
                        className="btn" 
                        style={{ padding: '0.7rem 1.8rem', backgroundColor: '#F59E0B', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.05rem', fontWeight: 600, boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)' }}
                      >
                        <FileCheck size={18} />
                        {isSigning ? 'שומר חתימה...' : '✍️ חתום ואשר שבצ״ק סופי'}
                      </button>
                    </div>

                    {signSuccessMessage && (
                      <div className="animate-fade-in" style={{ marginTop: '0.75rem', color: 'var(--secondary-color)', fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <CheckCircle2 size={18} /> השבצ״ק נחתם בהצלחה והמשמרות נצברו לטבלת הצדק!
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
          ) : (
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
              טבלת השבצ״ק תהיה זמינה לאחר הפקת השיבוץ בשלב 4 והעברתו לכאן.
            </p>
          )}
        </div>

      </div>
      )}

      {/* טאב 2: טבלת צדק חודשית & אתר קשר */}
      {activeTab === 'justice' && (
        <div className="animate-fade-in" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* כותרת עליונה של טבלת הצדק עם כפתור איפוס */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', backgroundColor: 'rgba(255,255,255,0.02)', padding: '1rem 1.25rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <div>
              <h4 style={{ margin: 0, fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Scale color="var(--secondary-color)" size={24} /> ניהול טבלת צדק חודשית & אתר קשר
              </h4>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                מעקב עומסים מצטבר, שקלול ימי קשר וסנכרון לאלגוריתם השיבוץ
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowResetModal(true)}
              className="btn"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#f87171',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.55rem 1.15rem',
                fontSize: '0.9rem',
                fontWeight: 600,
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.25)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)'}
            >
              <RotateCcw size={16} /> איפוס טבלת הצדק
            </button>
          </div>

          {resetSuccessMsg && (
            <div className="glass-panel animate-fade-in" style={{ borderColor: 'rgba(16, 185, 129, 0.4)', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--secondary-color)', padding: '0.85rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, borderRadius: '8px' }}>
              <CheckCircle2 size={18} /> טבלת הצדק אופסה בהצלחה! כל המונים אופסו ל-0 וחתימת השבצ״ק בוטלה.
            </div>
          )}

          {/* כרטיסי סיכום חודשיים (KPIs) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <div className="glass-panel" style={{ padding: '1.25rem', textAlign: 'center', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>משמרות מטבח שבוצעו</span>
              <strong style={{ fontSize: '2rem', color: 'var(--primary-color)' }}>{totalKitchenShifts}</strong>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginTop: '0.2rem' }}>מצטבר חודשי</span>
            </div>

            <div className="glass-panel" style={{ padding: '1.25rem', textAlign: 'center', borderRadius: '10px', border: '1px solid rgba(14, 165, 233, 0.35)', backgroundColor: 'rgba(14, 165, 233, 0.05)' }}>
              <span style={{ fontSize: '0.85rem', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', marginBottom: '0.4rem' }}>
                <Radio size={16} /> ימים באתר קשר
              </span>
              <strong style={{ fontSize: '2rem', color: '#38bdf8' }}>{totalKesherDays}</strong>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginTop: '0.2rem' }}>1.5 ימים = 1 מטבח (+0.5 לעודף)</span>
            </div>

            <div className="glass-panel" style={{ padding: '1.25rem', textAlign: 'center', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.35)', backgroundColor: 'rgba(16, 185, 129, 0.05)' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--secondary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', marginBottom: '0.4rem' }}>
                <Scale size={16} /> סה״כ משוקלל לצדק
              </span>
              <strong style={{ fontSize: '2rem', color: 'var(--secondary-color)' }}>{totalEffectiveShifts}</strong>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginTop: '0.2rem' }}>מטבח + ימי קשר משוקללים</span>
            </div>

            <div className="glass-panel" style={{ padding: '1.25rem', textAlign: 'center', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>ממוצע משמרות לחייל</span>
              <strong style={{ fontSize: '2rem', color: 'white' }}>{avgShiftsPerSoldier}</strong>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginTop: '0.2rem' }}>
                מתוך {allSoldiersList.length} חיילים פעילים {fullExemptCount > 0 && `(${fullExemptCount} בפטור מלא הוחרגו)`}
              </span>
            </div>
          </div>

          {/* סקציה 1: ניהול ורישום אתר קשר */}
          <div className="glass-panel" style={{ borderColor: 'rgba(14, 165, 233, 0.4)', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h4 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#38bdf8' }}>
                <Radio size={22} /> ניהול ורישום שהייה ב״אתר קשר״
              </h4>
              <span style={{ fontSize: '0.82rem', padding: '0.2rem 0.7rem', borderRadius: '12px', backgroundColor: 'rgba(14, 165, 233, 0.15)', color: '#38bdf8', border: '1px solid rgba(14, 165, 233, 0.3)' }}>
                1.5 ימים בקשר = 1 תורנות מטבח (יום עודף = 0.5)
              </span>
            </div>

            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: '1.5', textAlign: 'right' }}>
              כאן מזינים חיילים ששירתו באתר הקשר. <strong>כל יום וחצי (1.5) באתר קשר שווה ל-1 משמרת מטבח</strong>. אם כמות הימים אינה מתחלקת ב-1.5, כל יום עודף נספר כחצי (0.5) משמרת מטבח (למשל: 4 ימים בקשר = 2.5 משמרות מטבח). הנתונים מתווספים לטבלת הצדק החודשית <strong>ומשוקללים באלגוריתם של השבוע הבא</strong> כך שהחייל יקבל עדיפות מוגנת למנוחה.
            </p>

            {/* טופס הוספה */}
            <form onSubmit={handleAddKesher} style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
              <h5 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: 'var(--text-primary)' }}>+ הוספת שהייה באתר קשר לחייל</h5>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>חייל ומחלקה:</label>
                  <select
                    value={kesherSoldierKey}
                    onChange={(e) => setKesherSoldierKey(e.target.value)}
                    className="input-field"
                    style={{ width: '100%', margin: 0, padding: '0.5rem' }}
                    required
                  >
                    <option value="">בחר חייל מהמאגר...</option>
                    {allSoldiersList.map(s => (
                      <option key={s.key} value={s.key}>
                        {s.name} ({s.department}) - סה״כ כעת: {s.effectiveTotal}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>כמות ימים באתר קשר:</label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={kesherDaysCount}
                    onChange={(e) => setKesherDaysCount(e.target.value)}
                    className="input-field"
                    style={{ width: '100%', margin: 0, padding: '0.5rem' }}
                    placeholder="למשל: 3"
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>תאריך שהייה:</label>
                  <input
                    type="date"
                    value={kesherDate}
                    onChange={(e) => setKesherDate(e.target.value)}
                    className="input-field"
                    style={{ width: '100%', margin: 0, padding: '0.5rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>הערה (אופציונלי):</label>
                  <input
                    type="text"
                    value={kesherNote}
                    onChange={(e) => setKesherNote(e.target.value)}
                    className="input-field"
                    style={{ width: '100%', margin: 0, padding: '0.5rem' }}
                    placeholder="למשל: תגבור מוצב, שבוע קשר"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <button
                  type="submit"
                  disabled={kesherSubmitting}
                  className="btn"
                  style={{ backgroundColor: '#0284c7', borderColor: '#0284c7', padding: '0.6rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'white', fontWeight: 600 }}
                >
                  <Plus size={18} />
                  {kesherSubmitting ? 'שומר...' : 'הוסף לטבלת הצדק'}
                </button>

                {kesherSuccessMsg && (
                  <span className="animate-fade-in" style={{ color: 'var(--secondary-color)', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <CheckCircle2 size={16} /> {kesherSuccessMsg}
                  </span>
                )}
              </div>
            </form>

            {/* רשימת רשומות אתר קשר קיימות */}
            <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
              רישומי אתר קשר פעילים ({kesherEntries.length})
            </h5>
            
            {kesherEntries.length === 0 ? (
              <div style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-secondary)', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                אין עדיין רישומי אתר קשר במערכת. השתמש בטופס למעלה כדי להוסיף.
              </div>
            ) : (
              <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '0.5rem' }}>חייל</th>
                      <th style={{ padding: '0.5rem' }}>מחלקה</th>
                      <th style={{ padding: '0.5rem' }}>ימים בקשר</th>
                      <th style={{ padding: '0.5rem' }}>תאריך / הערה</th>
                      <th style={{ padding: '0.5rem' }}>מחיקה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kesherEntries.map(entry => (
                      <tr key={entry.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '0.5rem', fontWeight: 600 }}>{entry.soldierName}</td>
                        <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>{entry.department}</td>
                        <td style={{ padding: '0.5rem' }}>
                          <span style={{ backgroundColor: 'rgba(14, 165, 233, 0.2)', color: '#38bdf8', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 'bold' }}>
                            {entry.daysCount} ימים ({kesherDaysToKitchenShifts(entry.daysCount)} מטבח)
                          </span>
                        </td>
                        <td style={{ padding: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                          {entry.date ? `${entry.date} ` : ''}{entry.note ? `(${entry.note})` : ''}
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <button
                            type="button"
                            onClick={() => handleDeleteKesher(entry.id)}
                            style={{ background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer', padding: '0.2rem' }}
                            title="מחק רישום זה"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* סקציה 2: טבלת הצדק החודשית המלאה */}
          <div className="glass-panel" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Scale color="var(--secondary-color)" size={22} /> טבלת צדק חודשית מצטברת (חיילים פעילים)
                </h4>
                {fullExemptCount > 0 && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginTop: '0.2rem' }}>
                    * {fullExemptCount} חיילים בעלי פטור מלא הוסרו אוטומטית מטבלת הצדק
                  </span>
                )}
              </div>

              {/* כפתור איפוס ושורת חיפוש */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setShowResetModal(true)}
                  className="btn"
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    color: '#f87171',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                  title="איפוס טבלת הצדק"
                >
                  <RotateCcw size={14} /> איפוס טבלה
                </button>

                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="חיפוש חייל..."
                    value={justiceSearch}
                    onChange={(e) => setJusticeSearch(e.target.value)}
                    className="input-field"
                    style={{ margin: 0, padding: '0.35rem 0.75rem', fontSize: '0.85rem', width: '160px' }}
                  />
                </div>
              </div>
            </div>

            {/* פילטרים לפי מחלקות */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              {['all', 'תקשוב', 'לוגיסטיקה', 'טנ"א', 'משא"ן'].map(dep => (
                <button
                  key={dep}
                  type="button"
                  onClick={() => setJusticeDeptFilter(dep)}
                  className="btn btn-secondary"
                  style={{
                    padding: '0.3rem 0.8rem',
                    fontSize: '0.85rem',
                    backgroundColor: justiceDeptFilter === dep ? 'var(--primary-color)' : 'rgba(255,255,255,0.04)',
                    color: justiceDeptFilter === dep ? 'white' : 'var(--text-secondary)',
                    borderColor: justiceDeptFilter === dep ? 'var(--primary-color)' : 'transparent'
                  }}
                >
                  {dep === 'all' ? 'כל המחלקות' : dep}
                </button>
              ))}
            </div>

            {/* טבלה מפורטת */}
            <div style={{ overflowX: 'auto', backgroundColor: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>שם החייל</th>
                    <th style={{ padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>מחלקה</th>
                    <th style={{ padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>מטבח אמצ״ש</th>
                    <th style={{ padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>מטבח סופ״ש</th>
                    <th style={{ padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#38bdf8' }}>
                      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                        <Radio size={15} /> אתר קשר (ימים)
                      </span>
                    </th>
                    <th style={{ padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--secondary-color)', fontWeight: 'bold' }}>
                      סה״כ לצדק
                    </th>
                    <th style={{ padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>סטטוס עומס</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedJusticeList.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ padding: '1.5rem', color: 'var(--text-secondary)' }}>לא נמצאו חיילים התואמים לחיפוש.</td>
                    </tr>
                  ) : (
                    filteredAndSortedJusticeList.map(s => {
                      const depColors = { 'תקשוב': '#38bdf8', 'לוגיסטיקה': '#facc15', 'טנ"א': '#4ade80', 'משא"ן': '#f472b6' };
                      const depColor = depColors[s.department] || 'var(--text-secondary)';
                      
                      const avg = Number(avgShiftsPerSoldier) || 0;
                      let loadBadge = { text: 'תקין', bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: 'rgba(59, 130, 246, 0.3)' };
                      if (s.effectiveTotal < avg - 0.75) {
                        loadBadge = { text: 'עומס קל', bg: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: 'rgba(16, 185, 129, 0.3)' };
                      } else if (s.effectiveTotal > avg + 0.75) {
                        loadBadge = { text: 'עמוס', bg: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' };
                      }

                      return (
                        <tr key={s.key} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <td style={{ padding: '0.65rem 0.5rem', fontWeight: 600 }}>{s.name}</td>
                          <td style={{ padding: '0.65rem 0.5rem' }}>
                            <span style={{ color: depColor, fontWeight: 500 }}>{s.department}</span>
                          </td>
                          <td style={{ padding: '0.65rem 0.5rem' }}>{s.midweek}</td>
                          <td style={{ padding: '0.65rem 0.5rem' }}>{s.weekend}</td>
                          <td style={{ padding: '0.65rem 0.5rem' }}>
                            {s.kesherDays > 0 ? (
                              <span style={{ backgroundColor: 'rgba(14, 165, 233, 0.2)', color: '#38bdf8', padding: '0.2rem 0.55rem', borderRadius: '4px', fontWeight: 'bold' }} title={`${s.kesherDays} ימים באתר קשר = שווה ערך ל-${s.kesherEquiv} משמרות מטבח`}>
                                {s.kesherDays} ימים ({s.kesherEquiv} מטבח)
                              </span>
                            ) : (
                              <span style={{ opacity: 0.35 }}>0</span>
                            )}
                          </td>
                          <td style={{ padding: '0.65rem 0.5rem', fontWeight: 'bold', fontSize: '1.05rem', color: 'var(--secondary-color)' }}>
                            {s.effectiveTotal}
                          </td>
                          <td style={{ padding: '0.65rem 0.5rem' }}>
                            <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '10px', backgroundColor: loadBadge.bg, color: loadBadge.color, border: `1px solid ${loadBadge.border}`, fontWeight: 500 }}>
                              {loadBadge.text}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* מודאל אישור מפורט לאיפוס טבלת הצדק (בטוח?) */}
      {showResetModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.82)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '1rem',
            direction: 'rtl'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isResetting) setShowResetModal(false);
          }}
        >
          <div 
            className="glass-panel animate-fade-in"
            style={{
              maxWidth: '520px',
              width: '100%',
              backgroundColor: '#1e293b',
              border: '2px solid rgba(239, 68, 68, 0.6)',
              borderRadius: '16px',
              padding: '1.75rem',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
              position: 'relative'
            }}
          >
            {/* אייקון אזהרה וכותרת */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '1.25rem' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '2px solid rgba(239, 68, 68, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ef4444',
                flexShrink: 0
              }}>
                <AlertTriangle size={26} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.3rem', color: '#f87171' }}>
                  איפוס טבלת הצדק - וידוא פעולה
                </h3>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  האם אתה בטוח שברצונך לאפס? פעולה זו תנקה נתונים שנצברו
                </span>
              </div>
            </div>

            <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)', lineHeight: '1.6', marginBottom: '1.25rem' }}>
              <p style={{ margin: '0 0 0.85rem 0' }}>
                דיווחת כי הוכנס בטעות שבצ״ק לא רלוונטי לטבלה. איפוס הטבלה יחזיר את ממוצעי העומסים למצב נקי.
              </p>
              
              <div style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: '8px',
                padding: '0.9rem 1.1rem',
                fontSize: '0.9rem',
                color: 'var(--text-secondary)',
                marginBottom: '1rem'
              }}>
                <strong style={{ color: '#f87171', display: 'block', marginBottom: '0.4rem' }}>
                  פעולה זו תבצע:
                </strong>
                <ul style={{ margin: 0, paddingRight: '1.2rem', lineHeight: '1.6' }}>
                  <li>איפוס כל <strong>{totalKitchenShifts}</strong> משמרות המטבח שנצברו בטבלה ל-0.</li>
                  <li>ביטול נעילת וחתימת השבצ״ק הלא רלוונטי (כך שלא ישפיע על השבועות הבאים).</li>
                  <li>החזרת כל החיילים למצב עומס התחלתי שוויוני (0 תורנויות).</li>
                </ul>
              </div>

              {/* אפשרויות מתקדמות */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', backgroundColor: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer', margin: 0, fontSize: '0.88rem' }}>
                  <input
                    type="checkbox"
                    checked={resetKesherAlso}
                    onChange={(e) => setResetKesherAlso(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: '#ef4444', cursor: 'pointer' }}
                  />
                  <span style={{ color: resetKesherAlso ? '#f87171' : 'var(--text-primary)', fontWeight: resetKesherAlso ? 600 : 400 }}>
                    לאפס גם את רישומי ימי ״אתר קשר״ ({totalKesherDays} ימים רשומים)
                  </span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer', margin: 0, fontSize: '0.88rem' }}>
                  <input
                    type="checkbox"
                    checked={resetScheduleAlso}
                    onChange={(e) => setResetScheduleAlso(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: '#ef4444', cursor: 'pointer' }}
                  />
                  <span style={{ color: resetScheduleAlso ? '#f87171' : 'var(--text-primary)', fontWeight: resetScheduleAlso ? 600 : 400 }}>
                    למחוק גם את לוח השבצ״ק מהתצוגה (מאפשר הפקת שיבוץ חדש לגמרי מאפס)
                  </span>
                </label>
              </div>
            </div>

            {/* כפתורי פעולה ווידוא סופי */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                disabled={isResetting}
                className="btn btn-secondary"
                style={{ padding: '0.65rem 1.3rem', fontSize: '0.95rem' }}
              >
                ביטול
              </button>

              <button
                type="button"
                onClick={handleResetJusticeTable}
                disabled={isResetting}
                className="btn"
                style={{
                  backgroundColor: '#dc2626',
                  borderColor: '#dc2626',
                  color: 'white',
                  fontWeight: 'bold',
                  padding: '0.65rem 1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.95rem',
                  boxShadow: '0 4px 14px rgba(220, 38, 38, 0.4)'
                }}
              >
                <RotateCcw size={17} />
                {isResetting ? 'מאפס כעת...' : 'בטוח! אפס את הטבלה עכשיו'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* מודאל עריכת שם תורן בשיבוץ המקדים (לפני שליחה לחברים) */}
      {previewEditModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.82)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '1rem',
            direction: 'rtl'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewEditModal(null);
          }}
        >
          <div 
            className="glass-panel animate-fade-in"
            style={{
              maxWidth: '480px',
              width: '100%',
              backgroundColor: '#1e293b',
              border: '2px solid rgba(99, 102, 241, 0.5)',
              borderRadius: '16px',
              padding: '1.75rem',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
              position: 'relative'
            }}
          >
            {/* כותרת וכפתור סגירה */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary-color)' }}>
                <PenLine size={22} />
                {previewEditModal.slotIdx >= 0 ? 'עריכת תורן בשיבוץ' : 'הוספת תורן לשיבוץ'}
              </h3>
              <button 
                type="button"
                onClick={() => setPreviewEditModal(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.4rem', padding: '0.2rem' }}
              >
                ✕
              </button>
            </div>

            {/* פרטי היום והמשמרת */}
            <div style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
              {previewEditModal.allowChooseDayAndShift ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>בחר יום:</label>
                    <select 
                      value={modalDayIdx}
                      onChange={(e) => setModalDayIdx(Number(e.target.value))}
                      className="input-field"
                      style={{ width: '100%', padding: '0.45rem', backgroundColor: '#0f172a', color: 'white', borderRadius: '6px', fontSize: '0.88rem' }}
                    >
                      {algorithmResult?.schedule?.map((d, dIdx) => (
                        <option key={dIdx} value={dIdx}>יום {d.shortName} ({formatDayDate(d.shortName, weekStartDate)})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>בחר משמרת:</label>
                    <select 
                      value={modalShiftTime}
                      onChange={(e) => setModalShiftTime(e.target.value)}
                      className="input-field"
                      style={{ width: '100%', padding: '0.45rem', backgroundColor: '#0f172a', color: 'white', borderRadius: '6px', fontSize: '0.88rem' }}
                    >
                      <option value="morning">בוקר ☀️</option>
                      <option value="evening">ערב 🌙</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <span><strong>יום:</strong> {previewEditModal.dayShortName} {previewEditModal.dateStr && `(${previewEditModal.dateStr})`}</span>
                  <span><strong>משמרת:</strong> {previewEditModal.shiftTime === 'morning' ? 'בוקר ☀️' : 'ערב 🌙'}</span>
                  {previewEditModal.soldier && (
                    <span><strong>שם נוכחי:</strong> <span style={{ color: 'var(--secondary-color)', fontWeight: 'bold' }}>{previewEditModal.soldier.name}</span></span>
                  )}
                </div>
              )}
            </div>

            {/* כפתורי מעבר בין בחירה מרשימה לבין הקלדה חופשית */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button 
                type="button"
                onClick={() => setModalMode('select')}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  backgroundColor: modalMode === 'select' ? 'var(--primary-color)' : 'rgba(255,255,255,0.06)',
                  color: 'white',
                  fontWeight: modalMode === 'select' ? 600 : 'normal'
                }}
              >
                👥 בחירה מהפלוגה
              </button>
              <button 
                type="button"
                onClick={() => setModalMode('custom')}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  backgroundColor: modalMode === 'custom' ? 'var(--primary-color)' : 'rgba(255,255,255,0.06)',
                  color: 'white',
                  fontWeight: modalMode === 'custom' ? 600 : 'normal'
                }}
              >
                ✍️ הזנת שם חופשי
              </button>
            </div>

            {/* בחירה מרשימת החיילים */}
            {modalMode === 'select' && (
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                  בחר חייל מהפלוגה להחלפה מהירה:
                </label>
                <select 
                  value={modalSoldierKey}
                  onChange={(e) => {
                    const val = e.target.value;
                    setModalSoldierKey(val);
                    if (val) {
                      const [sName, sDept] = val.split('__');
                      setModalCustomName(sName || '');
                      setModalCustomDept(sDept || 'לוגיסטיקה');
                    }
                  }}
                  className="input-field"
                  style={{ width: '100%', padding: '0.6rem', backgroundColor: '#0f172a', color: 'white', borderRadius: '6px', fontSize: '0.95rem' }}
                >
                  <option value="">-- בחר חייל מהרשימה --</option>
                  {departmentsData.map(dep => (
                    <optgroup key={dep.departmentName} label={`מחלקת ${dep.departmentName}`}>
                      {(dep.soldiers || []).map((s, sIdx) => (
                        <option key={`${s.name}__${dep.departmentName}__${sIdx}`} value={`${s.name}__${dep.departmentName}`}>
                          {s.name} ({dep.departmentName})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            )}

            {/* שדה שם לתצוגה */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                שם התורן שיוצג בטבלה:
              </label>
              <input 
                type="text"
                value={modalCustomName}
                onChange={(e) => setModalCustomName(e.target.value)}
                placeholder="הקלד שם תורן..."
                className="input-field"
                style={{ width: '100%', padding: '0.6rem', backgroundColor: '#0f172a', color: 'white', borderRadius: '6px', fontSize: '0.95rem' }}
              />
            </div>

            {/* בחירת מחלקה (צבע המשבצת בטבלה) */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                צבע המשבצת לפי מחלקה:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem' }}>
                {[
                  { name: 'לוגיסטיקה', color: '#fef08a' },
                  { name: 'תקשוב', color: '#bae6fd' },
                  { name: 'טנ"א', color: '#bbf7d0' },
                  { name: 'משא"ן', color: '#fbcfe8' },
                  { name: 'אג"ם', color: '#e2e8f0' },
                  { name: 'אחר', color: '#f3f4f6' }
                ].map(d => (
                  <button
                    key={d.name}
                    type="button"
                    onClick={() => setModalCustomDept(d.name)}
                    style={{
                      padding: '0.45rem 0.25rem',
                      borderRadius: '6px',
                      border: modalCustomDept === d.name ? '2px solid var(--primary-color)' : '1px solid rgba(255,255,255,0.1)',
                      backgroundColor: d.color,
                      color: '#000',
                      fontSize: '0.82rem',
                      fontWeight: modalCustomDept === d.name ? 'bold' : 'normal',
                      cursor: 'pointer',
                      textAlign: 'center',
                      boxShadow: modalCustomDept === d.name ? '0 0 8px rgba(99, 102, 241, 0.6)' : 'none'
                    }}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            </div>

            {/* כפתורי פעולה */}
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', flexWrap: 'wrap', alignItems: 'center' }}>
              {previewEditModal.slotIdx >= 0 && !previewEditModal.allowChooseDayAndShift && (
                <button 
                  type="button"
                  onClick={handleRemovePreviewSoldier}
                  className="btn"
                  style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.4)', padding: '0.6rem 1rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: 'auto' }}
                  title="מחק חייל זה ממשמרת זו"
                >
                  <Trash2 size={16} /> מחק תורן
                </button>
              )}
              <button 
                type="button"
                onClick={() => setPreviewEditModal(null)}
                className="btn btn-secondary"
                style={{ padding: '0.6rem 1.2rem', fontSize: '0.9rem' }}
              >
                ביטול
              </button>
              <button 
                type="button"
                onClick={handleSavePreviewEdit}
                disabled={!modalCustomName.trim()}
                className="btn"
                style={{ backgroundColor: 'var(--primary-color)', color: 'white', padding: '0.6rem 1.5rem', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <CheckCircle2 size={16} /> שמור שינוי
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerScreen;
