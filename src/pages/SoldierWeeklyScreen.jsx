import React, { useState, useEffect } from 'react';
import { db } from '../firebase/firebase';
import { doc, collection, onSnapshot, setDoc } from 'firebase/firestore';
import { formatDayDate, getWeekRangeStr } from '../utils/dateUtils';
import { CalendarDays, Plus, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

const SoldierWeeklyScreen = () => {
  const [justiceData, setJusticeData] = useState(null);
  const [departmentsData, setDepartmentsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingShift, setEditingShift] = useState(null);
  const [addingShift, setAddingShift] = useState(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);

  useEffect(() => {
    // 1. האזנה בזמן אמת לטבלת השבצ״ק השבועית
    const unsubJustice = onSnapshot(doc(db, 'justiceTable', 'current'), (docSnap) => {
      if (docSnap.exists()) {
        setJusticeData(docSnap.data());
      } else {
        setJusticeData(null);
      }
      setLoading(false);
    });

    // 2. האזנה לרשימת המחלקות והחיילים הפעילים עבור התפריט הנפתח
    const unsubDepartments = onSnapshot(collection(db, 'activeDepartments'), (snapshot) => {
      const deps = [];
      snapshot.forEach(doc => deps.push(doc.data()));
      setDepartmentsData(deps);
    });

    return () => {
      unsubJustice();
      unsubDepartments();
    };
  }, []);

  // עדכון בלת״ם (החלפת חייל במשמרת)
  const handleBaltamChange = async (dayIdx, shiftTime, idx, oldPerson, newPersonStr) => {
    if (!newPersonStr || !justiceData?.schedule) {
      setEditingShift(null);
      return;
    }
    const [newName, newDep] = newPersonStr.split('_');

    const newSchedule = [...justiceData.schedule];
    const targetShift = [...(newSchedule[dayIdx][shiftTime] || [])];
    
    targetShift[idx] = {
      name: newName,
      department: newDep,
      isAgam: newDep === 'אג"ם',
      originalName: targetShift[idx]?.originalName || oldPerson.name,
      originalDepartment: targetShift[idx]?.originalDepartment || oldPerson.department,
      isEdited: true
    };
    newSchedule[dayIdx][shiftTime] = targetShift;

    await setDoc(doc(db, 'justiceTable', 'current'), {
      ...justiceData,
      schedule: newSchedule
    });
    
    setEditingShift(null);
    triggerSuccessMsg();
  };

  // הוספת תורן נוסף למשמרת ביום מסוים
  const handleAddSoldierToShift = async (dayIdx, shiftTime, newPersonStr) => {
    if (!newPersonStr || !justiceData?.schedule) {
      setAddingShift(null);
      return;
    }
    const [newName, newDep] = newPersonStr.split('_');

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
      schedule: newSchedule
    });

    setAddingShift(null);
    triggerSuccessMsg();
  };

  // הסרת תורן ממשמרת
  const handleRemoveSoldierFromShift = async (dayIdx, shiftTime, idx, oldPerson) => {
    if (!window.confirm(`האם להסיר את ${oldPerson.name} (${oldPerson.department}) ממשמרת זו?`)) {
      setEditingShift(null);
      return;
    }

    const newSchedule = [...justiceData.schedule];
    newSchedule[dayIdx][shiftTime].splice(idx, 1);

    await setDoc(doc(db, 'justiceTable', 'current'), {
      ...justiceData,
      schedule: newSchedule
    });

    setEditingShift(null);
    triggerSuccessMsg();
  };

  const triggerSuccessMsg = () => {
    setSaveSuccessMsg(true);
    setTimeout(() => setSaveSuccessMsg(false), 3000);
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
    <div className="animate-fade-in" style={{ maxWidth: '1050px', margin: '0 auto', padding: '1.5rem 1rem' }}>
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
          חיילים יקרים, כאן מנוהל השבצ״ק השבועי בפועל. לחצו על שם של חייל כדי לעדכן בלת״ם (החלפה או הסרה), או לחצו על <strong>+ הוסף תורן</strong> להוספת תורן למשמרת. כל שינוי מתעדכן ישירות במערכת.
        </p>

        {saveSuccessMsg && (
          <div className="animate-fade-in" style={{ marginTop: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '0.3rem 0.8rem', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.4)', fontSize: '0.88rem' }}>
            <CheckCircle2 size={16} /> השינוי נשמר בהצלחה ומסונכרן בזמן אמת!
          </div>
        )}
      </div>

      {/* הודעה אם עדיין לא פורסם שבצ״ק */}
      {(!justiceData || !justiceData.schedule || justiceData.schedule.length === 0) ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-secondary)' }}>
          <AlertCircle size={48} color="var(--primary-color)" style={{ marginBottom: '1rem', opacity: 0.8 }} />
          <h3 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>טרם פורסם שבצ״ק לשבוע זה</h3>
          <p style={{ maxWidth: '500px', margin: '0 auto', fontSize: '0.95rem' }}>
            מנהל התורנויות טרם העלה את לוח השיבוצים השבועי לעריכה. ברגע שהלוח יועלה, הוא יופיע כאן אוטומטית.
          </p>
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: '1rem', width: '100%' }}>
          {/* מקרא סימונים */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', justifyContent: 'flex-start', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: '#34d399', backgroundColor: 'rgba(16, 185, 129, 0.12)', padding: '0.3rem 0.8rem', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.35)', fontWeight: 500 }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#10B981', display: 'inline-block' }}></span>
              משבצת ירוקה = תורן שעודכן או נוסף בעריכה (בלת״ם)
            </span>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              💡 לחצו על שם החייל להחלפה
            </span>
          </div>

          {/* טבלת השיבוץ השבועי */}
          <div style={{ overflowX: 'auto', backgroundColor: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', width: '20%' }}>יום ותאריך</th>
                  <th style={{ padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', width: '40%' }}>משמרת בוקר</th>
                  <th style={{ padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)', width: '40%' }}>משמרת ערב</th>
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
                                padding: '0.55rem 0.5rem', 
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
                                    style={{ width: '100%', padding: '0.35rem', backgroundColor: '#333', color: 'white', border: '1px solid var(--primary-color)', borderRadius: '4px' }}
                                 >
                                   <option value="">בחר מחליף מהרשימה...</option>
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
                              style={{ width: '100%', padding: '0.35rem', backgroundColor: '#222', color: 'white', border: '1px solid var(--primary-color)', borderRadius: '4px', fontSize: '0.82rem' }}
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
                                padding: '0.35rem 0.5rem',
                                fontSize: '0.75rem',
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
                              <Plus size={13} /> הוסף תורן
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
                                padding: '0.55rem 0.5rem', 
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
                                    style={{ width: '100%', padding: '0.35rem', backgroundColor: '#333', color: 'white', border: '1px solid var(--primary-color)', borderRadius: '4px' }}
                                 >
                                   <option value="">בחר מחליף מהרשימה...</option>
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
                              style={{ width: '100%', padding: '0.35rem', backgroundColor: '#222', color: 'white', border: '1px solid var(--primary-color)', borderRadius: '4px', fontSize: '0.82rem' }}
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
                                padding: '0.35rem 0.5rem',
                                fontSize: '0.75rem',
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
                              <Plus size={13} /> הוסף תורן
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
        </div>
      )}
    </div>
  );
};

export default SoldierWeeklyScreen;
