import React, { useState, useEffect } from 'react';
import { db } from '../firebase/firebase';
import { doc, collection, onSnapshot, setDoc } from 'firebase/firestore';
import { formatDayDate, getWeekRangeStr, getDefaultSunday } from '../utils/dateUtils';
import { createEmptyScheduleFromKitchen, syncScheduleWithKitchenRequirements } from '../utils/scheduleUtils';
import { CalendarDays, Plus, CheckCircle2, AlertCircle, RefreshCw, UserPlus, RotateCcw, Trash2, Edit3, X } from 'lucide-react';

const SoldierWeeklyScreen = () => {
  const [justiceData, setJusticeData] = useState(null);
  const [departmentsData, setDepartmentsData] = useState([]);
  const [kitchenData, setKitchenData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Modal for slot assignment / editing
  const [activeSlotModal, setActiveSlotModal] = useState(null);
  const [modalMode, setModalMode] = useState('select'); // 'select' | 'custom'
  const [modalSoldierKey, setModalSoldierKey] = useState('');
  const [modalCustomName, setModalCustomName] = useState('');
  const [modalCustomDept, setModalCustomDept] = useState('פלס"ם');
  
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    // 1. האזנה בזמן אמת לטבלת השבצ״ק השבועית
    const unsubJustice = onSnapshot(doc(db, 'justiceTable', 'current'), (docSnap) => {
      if (docSnap.exists() && docSnap.data().schedule) {
        setJusticeData(docSnap.data());
      } else {
        setJusticeData(null);
      }
      setLoading(false);
    });

    // 2. האזנה לרשימת המחלקות והחיילים הפעילים עבור התפריט הנפתח
    const unsubDepartments = onSnapshot(collection(db, 'activeDepartments'), (snapshot) => {
      const deps = [];
      snapshot.forEach(docSnap => deps.push(docSnap.data()));
      setDepartmentsData(deps);
    });

    // 3. האזנה לדרישות המטבח העדכניות
    const unsubKitchen = onSnapshot(doc(db, 'activeWeek', 'kitchen'), (docSnap) => {
      if (docSnap.exists()) {
        setKitchenData(docSnap.data());
      } else {
        setKitchenData(null);
      }
    });

    return () => {
      unsubJustice();
      unsubDepartments();
      unsubKitchen();
    };
  }, []);

  // רשימת חיילים ייחודית ללא כפילויות וללא רווחים עודפים עבור התפריטים הנפתחים
  const uniqueSoldiersList = React.useMemo(() => {
    const list = [];
    const seen = new Set();
    (departmentsData || []).forEach(d => {
      const depName = (d.departmentName || '').trim();
      (d.soldiers || []).forEach(soldier => {
        const sName = (soldier.name || '').trim();
        if (!sName) return;
        const key = `${sName}__${depName}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push({ name: sName, department: depName, key });
        }
      });
    });
    return list;
  }, [departmentsData]);

  const triggerSuccessMsg = (msg = 'השינוי נשמר בהצלחה ומסונכרן בזמן אמת!') => {
    setStatusMsg(msg);
    setSaveSuccessMsg(true);
    setTimeout(() => setSaveSuccessMsg(false), 3500);
  };

  // פתיחת מודאל שיבוץ או עריכה עבור משבצת
  const openSlotModal = (dayIdx, shiftTime, slotIdx, soldier, dayShortName, dayDateStr) => {
    setActiveSlotModal({
      dayIdx,
      shiftTime,
      slotIdx,
      soldier,
      dayShortName,
      dayDateStr
    });

    if (soldier?.name) {
      setModalCustomName(soldier.name);
      setModalCustomDept(soldier.department || 'פלס"ם');
      const found = uniqueSoldiersList.find(s => s.name === soldier.name);
      if (found) {
        setModalSoldierKey(found.key);
        setModalMode('select');
      } else {
        setModalSoldierKey('');
        setModalMode('custom');
      }
    } else {
      setModalSoldierKey('');
      setModalCustomName('');
      setModalCustomDept('פלס"ם');
      setModalMode('select');
    }
  };

  // שמירת שיבוץ מהמודאל למשבצת
  const handleSaveSlotModal = async () => {
    if (!activeSlotModal || !justiceData?.schedule) return;
    const { dayIdx, shiftTime, slotIdx, soldier } = activeSlotModal;

    let finalName = '';
    let finalDept = '';

    if (modalMode === 'select') {
      if (!modalSoldierKey) {
        alert('אנא בחר חייל מהרשימה או עבור להזנת שם חופשי');
        return;
      }
      const [sName, sDept] = modalSoldierKey.split('__');
      finalName = sName.trim();
      finalDept = (sDept || '').trim();
    } else {
      finalName = modalCustomName.trim();
      finalDept = modalCustomDept.trim() || 'פלס"ם';
      if (!finalName) {
        alert('אנא הזן את שם החייל');
        return;
      }
    }

    const newSchedule = [...justiceData.schedule];
    const targetShift = [...(newSchedule[dayIdx][shiftTime] || [])];

    targetShift[slotIdx] = {
      name: finalName,
      department: finalDept,
      isAgam: finalDept === 'אג"ם',
      originalName: targetShift[slotIdx]?.originalName || soldier?.name || finalName,
      originalDepartment: targetShift[slotIdx]?.originalDepartment || soldier?.department || finalDept,
      isEdited: true,
      isSlotEmpty: false
    };

    newSchedule[dayIdx][shiftTime] = targetShift;

    await setDoc(doc(db, 'justiceTable', 'current'), {
      ...justiceData,
      schedule: newSchedule
    });

    setActiveSlotModal(null);
    triggerSuccessMsg(`התורן ${finalName} שובץ בהצלחה!`);
  };

  // ריקון משבצת בודדת (החזרה למצב פנוי ריק)
  const handleClearSlot = async (dayIdx, shiftTime, slotIdx) => {
    if (!justiceData?.schedule) return;
    const newSchedule = [...justiceData.schedule];
    const targetShift = [...(newSchedule[dayIdx][shiftTime] || [])];

    targetShift[slotIdx] = {
      name: '',
      department: '',
      isSlotEmpty: true,
      originalName: '',
      originalDepartment: '',
      isEdited: false
    };

    newSchedule[dayIdx][shiftTime] = targetShift;

    await setDoc(doc(db, 'justiceTable', 'current'), {
      ...justiceData,
      schedule: newSchedule
    });

    setActiveSlotModal(null);
    triggerSuccessMsg('המשבצת רוקנה וחזרה למצב פנוי.');
  };

  // מחיקת משבצת לגמרי
  const handleRemoveSlotCompletely = async (dayIdx, shiftTime, slotIdx) => {
    if (!window.confirm('האם למחוק משבצת זו לחלוטין מהמשמרת?')) return;
    if (!justiceData?.schedule) return;

    const newSchedule = [...justiceData.schedule];
    newSchedule[dayIdx][shiftTime].splice(slotIdx, 1);

    await setDoc(doc(db, 'justiceTable', 'current'), {
      ...justiceData,
      schedule: newSchedule
    });

    setActiveSlotModal(null);
    triggerSuccessMsg('המשבצת הוסרה מהמשמרת.');
  };

  // הוספת משבצת חדשה למשמרת
  const handleAddNewSlot = async (dayIdx, shiftTime) => {
    if (!justiceData?.schedule) return;
    const newSchedule = [...justiceData.schedule];
    if (!newSchedule[dayIdx][shiftTime]) {
      newSchedule[dayIdx][shiftTime] = [];
    }

    const newSlot = {
      name: '',
      department: '',
      isSlotEmpty: true,
      originalName: '',
      originalDepartment: '',
      isEdited: true,
      isAdded: true
    };

    newSchedule[dayIdx][shiftTime].push(newSlot);

    await setDoc(doc(db, 'justiceTable', 'current'), {
      ...justiceData,
      schedule: newSchedule
    });

    const newIdx = newSchedule[dayIdx][shiftTime].length - 1;
    const day = newSchedule[dayIdx];
    openSlotModal(dayIdx, shiftTime, newIdx, newSlot, day.shortName, day.dateStr);
  };

  // איפוס וריקון כל המשבצות (החזרה למשבצות ריקות לפי דרישות טבחים)
  const handleResetToEmptySlots = async () => {
    if (!window.confirm('האם לאפס ולרוקן את כל המשבצות בטבלה?\n\nפעולה זו תרוקן את כל שמות החיילים ותחזיר חללים ריקים למילוי, בדיוק לפי דרישות הטבחים המעודכנות.')) {
      return;
    }

    const startDate = justiceData?.startDate || getDefaultSunday();
    const overrides = kitchenData?.kitchenOverrides || {};
    const emptySched = createEmptyScheduleFromKitchen(kitchenData, overrides, startDate);

    await setDoc(doc(db, 'justiceTable', 'current'), {
      schedule: emptySched,
      startDate: startDate,
      timestamp: new Date().toISOString(),
      isSigned: false,
      signedAt: null,
      signedBy: null,
      weekContributions: null,
      historyApplied: false,
      weekTitle: justiceData?.weekTitle || 'שבוע פלס״ם'
    });

    triggerSuccessMsg('הטבלה אופסה ורוקנה בהצלחה! כל המשבצות פנויות למילוי.');
  };

  // סנכרון משבצות לפי דרישות המטבח (שומר על שמות שכבר שובצו)
  const handleSyncWithKitchen = async () => {
    const startDate = justiceData?.startDate || getDefaultSunday();
    const overrides = kitchenData?.kitchenOverrides || {};
    const syncedSched = syncScheduleWithKitchenRequirements(justiceData?.schedule, kitchenData, overrides, startDate);

    await setDoc(doc(db, 'justiceTable', 'current'), {
      ...justiceData,
      schedule: syncedSched,
      startDate: startDate,
      timestamp: new Date().toISOString()
    });

    triggerSuccessMsg('מבנה המשבצות סונכרן והותאם בהצלחה לדרישות המטבח!');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', color: 'var(--text-secondary)' }}>
        <RefreshCw size={36} className="animate-spin" style={{ marginBottom: '1rem', color: 'var(--primary-color)' }} />
        <p>טוען את לוח התורנויות השבועי...</p>
      </div>
    );
  }

  const weekDisplay = justiceData?.weekTitle 
    ? justiceData.weekTitle 
    : (justiceData?.startDate ? `שבוע ${getWeekRangeStr(justiceData.startDate)}` : 'שבוע נוכחי');

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* כותרת ראשית ייעודית לחיילים */}
      <div className="glass-panel" style={{ textAlign: 'center', marginBottom: '1.5rem', padding: '1.5rem', borderColor: 'rgba(99, 102, 241, 0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.65rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          <CalendarDays size={28} color="var(--primary-color)" />
          <h2 style={{ margin: 0, fontSize: '1.7rem' }}>לוח תורנויות שבועי ועדכון תורנים</h2>
          <span style={{ 
            fontSize: '1rem', 
            padding: '0.25rem 0.9rem', 
            borderRadius: '20px', 
            backgroundColor: 'rgba(99, 102, 241, 0.25)', 
            color: '#a5b4fc', 
            border: '1px solid rgba(99, 102, 241, 0.5)', 
            fontWeight: 'bold',
            boxShadow: '0 0 12px rgba(99, 102, 241, 0.25)'
          }}>
            {weekDisplay}
          </span>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', margin: 0, maxWidth: '750px', marginInline: 'auto', lineHeight: '1.5' }}>
          חיילים יקרים, המשבצות מותאמות לדרישות המטבח. לחצו על <strong>משבצת פנויה</strong> כדי לשבץ את שמכם, או לחצו על שם קיים כדי לעדכן/להחליף.
        </p>

        {saveSuccessMsg && (
          <div className="animate-fade-in" style={{ marginTop: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '0.35rem 0.9rem', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.4)', fontSize: '0.9rem', fontWeight: 600 }}>
            <CheckCircle2 size={16} /> {statusMsg || 'השינוי נשמר בהצלחה ומסונכרן בזמן אמת!'}
          </div>
        )}
      </div>

      {/* הודעה אם עדיין לא הופעל לוח */}
      {(!justiceData || !justiceData.schedule || justiceData.schedule.length === 0) ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-secondary)' }}>
          <AlertCircle size={48} color="var(--primary-color)" style={{ marginBottom: '1rem', opacity: 0.8 }} />
          <h3 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>לוח התורנויות טרם הופעל לשבוע זה</h3>
          <p style={{ maxWidth: '500px', margin: '0 auto 1.5rem auto', fontSize: '0.95rem' }}>
            ניתן להפעיל כעת לוח משבצות ריקות לפי דרישות המטבח המעודכנות כדי שחיילים יוכלו למלא את שמם.
          </p>
          <button
            type="button"
            onClick={handleResetToEmptySlots}
            className="btn"
            style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Plus size={18} /> הפעל לוח משבצות ריקות למילוי עכשיו
          </button>
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: '1rem', width: '100%' }}>
          {/* סרגל כפתורי פעולה ומקרא */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: '#a5b4fc', backgroundColor: 'rgba(99, 102, 241, 0.12)', padding: '0.3rem 0.75rem', borderRadius: '6px', border: '1px solid rgba(99, 102, 241, 0.35)', fontWeight: 500 }}>
                <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#6366f1', display: 'inline-block' }}></span>
                משבצת מקווקוות = פנויה למילוי
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: '#34d399', backgroundColor: 'rgba(16, 185, 129, 0.12)', padding: '0.3rem 0.75rem', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.35)', fontWeight: 500 }}>
                <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#10B981', display: 'inline-block' }}></span>
                משבצת ירוקה = תורן ששובץ
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleSyncWithKitchen}
                className="btn btn-secondary"
                style={{ padding: '0.35rem 0.8rem', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                title="התאם את מספר המשבצות לדרישות המטבח המעודכנות"
              >
                <RefreshCw size={14} /> התאם לדרישות טבחים
              </button>

              <button
                type="button"
                onClick={handleResetToEmptySlots}
                className="btn btn-secondary"
                style={{ padding: '0.35rem 0.8rem', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                title="איפוס וריקון כל המשבצות (הכן לשבוע חדש)"
              >
                <RotateCcw size={14} /> אפס ורוקן לוח למילוי
              </button>
            </div>
          </div>

          {/* טבלת השיבוץ השבועי */}
          <div style={{ overflowX: 'auto', backgroundColor: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', width: '20%' }}>יום ותאריך</th>
                  <th style={{ padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', width: '40%' }}>משמרת בוקר ☀️</th>
                  <th style={{ padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', width: '40%' }}>משמרת ערב 🌙</th>
                </tr>
              </thead>
              <tbody>
                {justiceData.schedule.map((day, dayIdx) => {
                  const dayDateStr = day.dateStr || formatDayDate(day.shortName, justiceData.startDate);
                  return (
                    <tr key={dayIdx}>
                      <td style={{ padding: '0.75rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)', fontWeight: 'bold', verticalAlign: 'middle', width: '20%' }}>
                        <div style={{ fontSize: '1.05rem', color: day.isWeekend ? '#fbbf24' : 'var(--text-primary)' }}>{day.shortName}</div>
                        {dayDateStr && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 'normal', marginTop: '2px' }}>
                            {dayDateStr}
                          </div>
                        )}
                      </td>

                      {/* עמודת בוקר */}
                      <td style={{ padding: '0.4rem', borderBottom: '1px solid rgba(255,255,255,0.05)', borderLeft: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top' }}>
                        {(!day.morning || day.morning.length === 0) ? (
                          <div style={{ padding: '0.6rem 0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ opacity: 0.35, fontSize: '0.9rem' }}>-</span>
                            <button
                              type="button"
                              onClick={() => handleAddNewSlot(dayIdx, 'morning')}
                              className="btn btn-secondary"
                              style={{ padding: '0.2rem 0.55rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', borderColor: 'rgba(99, 102, 241, 0.4)', color: 'var(--primary-color)' }}
                              title="הוסף משבצת למשמרת בוקר"
                            >
                              <Plus size={13} /> הוסף משבצת
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            {day.morning.map((s, idx) => {
                              const isEmpty = !s.name || s.isSlotEmpty;
                              if (isEmpty) {
                                return (
                                  <div
                                    key={idx}
                                    onClick={() => openSlotModal(dayIdx, 'morning', idx, s, day.shortName, dayDateStr)}
                                    style={{
                                      padding: '0.55rem 0.5rem',
                                      borderRadius: '6px',
                                      border: '1.5px dashed rgba(99, 102, 241, 0.45)',
                                      backgroundColor: 'rgba(99, 102, 241, 0.08)',
                                      color: '#a5b4fc',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '0.4rem',
                                      fontSize: '0.85rem',
                                      fontWeight: 600,
                                      transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.18)'; e.currentTarget.style.borderColor = 'var(--primary-color)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.08)'; e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.45)'; }}
                                    title="משבצת פנויה - לחץ למילוי שמך"
                                  >
                                    <UserPlus size={14} color="var(--primary-color)" />
                                    <span>משבצת פנויה #{idx + 1} – לחץ למילוי</span>
                                  </div>
                                );
                              }

                              const isSlotEdited = s.isEdited || s.isAdded;
                              return (
                                <div
                                  key={idx}
                                  onClick={() => openSlotModal(dayIdx, 'morning', idx, s, day.shortName, dayDateStr)}
                                  style={{
                                    padding: '0.5rem',
                                    borderRadius: '6px',
                                    backgroundColor: 'rgba(16, 185, 129, 0.18)',
                                    border: '1px solid rgba(16, 185, 129, 0.4)',
                                    borderRight: '3px solid #10B981',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.35rem'
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.28)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.18)'; }}
                                  title="לחץ לעריכה, החלפה או ריקון"
                                >
                                  <span style={{ fontWeight: 600, color: '#34d399' }}>{s.name}</span>
                                  <span style={{ fontSize: '0.75rem', opacity: 0.8, color: '#a7f3d0' }}>({s.department})</span>
                                  <Edit3 size={13} style={{ opacity: 0.6, marginRight: '4px' }} />
                                </div>
                              );
                            })}

                            <button
                              type="button"
                              onClick={() => handleAddNewSlot(dayIdx, 'morning')}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.25rem',
                                width: '100%',
                                padding: '0.3rem',
                                fontSize: '0.75rem',
                                backgroundColor: 'transparent',
                                border: 'none',
                                borderTop: '1px dashed rgba(255, 255, 255, 0.08)',
                                color: 'var(--primary-color)',
                                cursor: 'pointer',
                                opacity: 0.8
                              }}
                              title="הוסף משבצת נוספת למשמרת בוקר"
                            >
                              <Plus size={12} /> הוסף משבצת
                            </button>
                          </div>
                        )}
                      </td>

                      {/* עמודת ערב */}
                      <td style={{ padding: '0.4rem', borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top' }}>
                        {(!day.evening || day.evening.length === 0) ? (
                          <div style={{ padding: '0.6rem 0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ opacity: 0.35, fontSize: '0.9rem' }}>-</span>
                            <button
                              type="button"
                              onClick={() => handleAddNewSlot(dayIdx, 'evening')}
                              className="btn btn-secondary"
                              style={{ padding: '0.2rem 0.55rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', borderColor: 'rgba(99, 102, 241, 0.4)', color: 'var(--primary-color)' }}
                              title="הוסף משבצת למשמרת ערב"
                            >
                              <Plus size={13} /> הוסף משבצת
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            {day.evening.map((s, idx) => {
                              const isEmpty = !s.name || s.isSlotEmpty;
                              if (isEmpty) {
                                return (
                                  <div
                                    key={idx}
                                    onClick={() => openSlotModal(dayIdx, 'evening', idx, s, day.shortName, dayDateStr)}
                                    style={{
                                      padding: '0.55rem 0.5rem',
                                      borderRadius: '6px',
                                      border: '1.5px dashed rgba(99, 102, 241, 0.45)',
                                      backgroundColor: 'rgba(99, 102, 241, 0.08)',
                                      color: '#a5b4fc',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '0.4rem',
                                      fontSize: '0.85rem',
                                      fontWeight: 600,
                                      transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.18)'; e.currentTarget.style.borderColor = 'var(--primary-color)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.08)'; e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.45)'; }}
                                    title="משבצת פנויה - לחץ למילוי שמך"
                                  >
                                    <UserPlus size={14} color="var(--primary-color)" />
                                    <span>משבצת פנויה #{idx + 1} – לחץ למילוי</span>
                                  </div>
                                );
                              }

                              const isSlotEdited = s.isEdited || s.isAdded;
                              return (
                                <div
                                  key={idx}
                                  onClick={() => openSlotModal(dayIdx, 'evening', idx, s, day.shortName, dayDateStr)}
                                  style={{
                                    padding: '0.5rem',
                                    borderRadius: '6px',
                                    backgroundColor: 'rgba(16, 185, 129, 0.18)',
                                    border: '1px solid rgba(16, 185, 129, 0.4)',
                                    borderRight: '3px solid #10B981',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.35rem'
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.28)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.18)'; }}
                                  title="לחץ לעריכה, החלפה או ריקון"
                                >
                                  <span style={{ fontWeight: 600, color: '#34d399' }}>{s.name}</span>
                                  <span style={{ fontSize: '0.75rem', opacity: 0.8, color: '#a7f3d0' }}>({s.department})</span>
                                  <Edit3 size={13} style={{ opacity: 0.6, marginRight: '4px' }} />
                                </div>
                              );
                            })}

                            <button
                              type="button"
                              onClick={() => handleAddNewSlot(dayIdx, 'evening')}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.25rem',
                                width: '100%',
                                padding: '0.3rem',
                                fontSize: '0.75rem',
                                backgroundColor: 'transparent',
                                border: 'none',
                                borderTop: '1px dashed rgba(255, 255, 255, 0.08)',
                                color: 'var(--primary-color)',
                                cursor: 'pointer',
                                opacity: 0.8
                              }}
                              title="הוסף משבצת נוספת למשמרת ערב"
                            >
                              <Plus size={12} /> הוסף משבצת
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* מודאל שיבוץ / עריכת משבצת */}
      {activeSlotModal && (
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
            if (e.target === e.currentTarget) setActiveSlotModal(null);
          }}
        >
          <div 
            className="glass-panel animate-fade-in"
            style={{
              maxWidth: '460px',
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
                <UserPlus size={22} />
                {activeSlotModal.soldier?.name ? 'עריכת תורן במשבצת' : `שיבוץ תורן – משבצת #${activeSlotModal.slotIdx + 1}`}
              </h3>
              <button 
                type="button"
                onClick={() => setActiveSlotModal(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.4rem', padding: '0.2rem' }}
              >
                ✕
              </button>
            </div>

            {/* פרטי היום והמשמרת */}
            <div style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span><strong>יום:</strong> {activeSlotModal.dayShortName} {activeSlotModal.dayDateStr && `(${activeSlotModal.dayDateStr})`}</span>
              <span><strong>משמרת:</strong> {activeSlotModal.shiftTime === 'morning' ? 'בוקר ☀️' : 'ערב 🌙'}</span>
              {activeSlotModal.soldier?.name && (
                <div style={{ width: '100%', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '0.4rem', marginTop: '0.2rem' }}>
                  <span>משובץ כרגע: <strong style={{ color: '#34d399' }}>{activeSlotModal.soldier.name}</strong> ({activeSlotModal.soldier.department})</span>
                </div>
              )}
            </div>

            {/* טאבים: בחירה מהרשימה מול הקלדה חופשית */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <button 
                type="button"
                onClick={() => setModalMode('select')}
                style={{
                  flex: 1,
                  padding: '0.55rem',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.88rem',
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
                  padding: '0.55rem',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  backgroundColor: modalMode === 'custom' ? 'var(--primary-color)' : 'rgba(255,255,255,0.06)',
                  color: 'white',
                  fontWeight: modalMode === 'custom' ? 600 : 'normal'
                }}
              >
                ✍️ הקלדת שם חופשי
              </button>
            </div>

            {/* תוכן הטאב הנבחר */}
            {modalMode === 'select' ? (
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                  בחר את שמך מהרשימה:
                </label>
                <select 
                  value={modalSoldierKey}
                  onChange={(e) => {
                    const val = e.target.value;
                    setModalSoldierKey(val);
                    if (val) {
                      const [sName, sDept] = val.split('__');
                      setModalCustomName(sName || '');
                      setModalCustomDept(sDept || 'פלס"ם');
                    }
                  }}
                  className="input-field"
                  style={{ width: '100%', padding: '0.6rem', backgroundColor: '#0f172a', color: 'white', borderRadius: '6px', fontSize: '0.95rem' }}
                >
                  <option value="">-- בחר חייל מהרשימה --</option>
                  {uniqueSoldiersList.map(soldier => (
                    <option key={soldier.key} value={soldier.key}>
                      {soldier.name} ({soldier.department})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                    שם מלא:
                  </label>
                  <input 
                    type="text" 
                    value={modalCustomName}
                    onChange={(e) => setModalCustomName(e.target.value)}
                    placeholder="לדוגמה: ישראל ישראלי"
                    className="input-field"
                    style={{ width: '100%', padding: '0.55rem', backgroundColor: '#0f172a', color: 'white', borderRadius: '6px', fontSize: '0.9rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                    מחלקה / פלוגה:
                  </label>
                  <select 
                    value={modalCustomDept}
                    onChange={(e) => setModalCustomDept(e.target.value)}
                    className="input-field"
                    style={{ width: '100%', padding: '0.55rem', backgroundColor: '#0f172a', color: 'white', borderRadius: '6px', fontSize: '0.9rem' }}
                  >
                    <option value="פלס״ם">פלס״ם</option>
                    <option value="תקשוב">תקשוב</option>
                    <option value="לוגיסטיקה">לוגיסטיקה</option>
                    <option value="טנ״א">טנ״א</option>
                    <option value="משא״ן">משא״ן</option>
                    <option value="אג״ם">אג״ם</option>
                  </select>
                </div>
              </div>
            )}

            {/* כפתורי פעולה */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {activeSlotModal.soldier?.name && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleClearSlot(activeSlotModal.dayIdx, activeSlotModal.shiftTime, activeSlotModal.slotIdx)}
                      className="btn btn-secondary"
                      style={{ padding: '0.5rem 0.8rem', fontSize: '0.85rem', color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.4)' }}
                      title="רוקן את המשבצת והשאר אותה פנויה לאחרים"
                    >
                      <RotateCcw size={14} style={{ marginLeft: '4px' }} /> רוקן משבצת
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRemoveSlotCompletely(activeSlotModal.dayIdx, activeSlotModal.shiftTime, activeSlotModal.slotIdx)}
                      className="btn btn-secondary"
                      style={{ padding: '0.5rem 0.7rem', fontSize: '0.85rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                      title="מחק משבצת זו לחלוטין מהמשמרת"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setActiveSlotModal(null)}
                  className="btn btn-secondary"
                  style={{ padding: '0.55rem 1rem', fontSize: '0.9rem' }}
                >
                  ביטול
                </button>

                <button
                  type="button"
                  onClick={handleSaveSlotModal}
                  className="btn"
                  style={{ padding: '0.55rem 1.4rem', fontSize: '0.95rem', fontWeight: 'bold' }}
                >
                  ✓ {activeSlotModal.soldier?.name ? 'שמור שינוי' : 'שבץ אותי עכשיו'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SoldierWeeklyScreen;
