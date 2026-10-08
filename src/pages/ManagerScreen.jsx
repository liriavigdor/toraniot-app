import React, { useState, useEffect } from 'react';
import { ClipboardCheck, CheckCircle2, AlertCircle, ArrowDown, FileText, XCircle, Share2, ChevronDown, ChevronUp, BrainCircuit, MessageSquareText } from 'lucide-react';
import html2canvas from 'html2canvas';
import { db } from '../firebase/firebase';
import { doc, collection, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { generateSchedule, SchedulingConflictError } from '../utils/algorithm';

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

  const [justiceData, setJusticeData] = useState(null);
  const [historyData, setHistoryData] = useState({});
  const [editingShift, setEditingShift] = useState(null);

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

    return () => {
      unsubKitchen();
      unsubDepartments();
      unsubJustice();
      unsubHistory();
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
      const result = generateSchedule(kitchenData, departmentsData, managerOverrides, kitchenOverrides, historyData);
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

  const handleFeedbackSubmit = () => {
    // In a real system, save this to Firebase so the AI/algorithm can "learn" from it
    console.log("Feedback submitted for algorithm training:", feedbackText);
    setFeedbackSubmitted(true);
    setTimeout(() => {
      setFeedbackSubmitted(false);
      setFeedbackText('');
    }, 4000);
  };

  const handleApproveSchedule = async () => {
    if (!algorithmResult) return;
    
    const updatedStats = { ...historyData };
    const addToStats = (s, isWeekend, weight) => {
       const key = `${s.name}_${s.department}`;
       if (!updatedStats[key]) updatedStats[key] = { total: 0, weekend: 0, midweek: 0 };
       updatedStats[key].total += weight;
       if (isWeekend) updatedStats[key].weekend += weight;
       else updatedStats[key].midweek += weight;
    };

    algorithmResult.schedule.forEach(day => {
       const isWeekend = day.isWeekend || day.shortName === "ה'";
       const weight = day.shortName === "ש'" ? 0.5 : 1;
       day.morning.forEach(s => addToStats(s, isWeekend, weight));
       day.evening.forEach(s => addToStats(s, isWeekend, weight));
    });

    await setDoc(doc(db, 'justiceTable', 'current'), {
      schedule: algorithmResult.schedule,
      timestamp: new Date().toISOString()
    });

    const historyRef = doc(db, 'history', 'stats');
    // צוברים את ההיסטוריה משבוע לשבוע כדי לשמור על הגינות דו-שבועית/חודשית
    await setDoc(historyRef, updatedStats);
    
    setAlgorithmResult(null); // Clear preview to force focus on Step 5
  };

  const handleBaltamChange = async (dayIdx, shiftTime, idx, oldPerson, newPersonStr) => {
    if (!newPersonStr) {
      setEditingShift(null);
      return;
    }
    const [newName, newDep] = newPersonStr.split('_');
    const isWeekend = justiceData.schedule[dayIdx].isWeekend || justiceData.schedule[dayIdx].shortName === "ה'";
    const weight = justiceData.schedule[dayIdx].shortName === "ש'" ? 0.5 : 1;

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

    await setDoc(historyRef, globalStats);

    const newSchedule = [...justiceData.schedule];
    newSchedule[dayIdx][shiftTime][idx] = { 
        name: newName, 
        department: newDep, 
        isAgam: newDep === 'אג"ם' 
    };

    await setDoc(doc(db, 'justiceTable', 'current'), {
        ...justiceData,
        schedule: newSchedule
    });
    
    setEditingShift(null);
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '3rem' }}>
      
      <div className="glass-panel" style={{ marginBottom: '3rem', textAlign: 'center' }}>
        <h3 style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.8rem', margin: 0 }}>
          <ClipboardCheck color="var(--primary-color)" size={32} /> בקרה ושיבוץ (שבוע נוכחי)
        </h3>
      </div>

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
            <h4 style={{ fontSize: '1.2rem', marginBottom: '1.5rem' }}>שלב 4: הפעלת אלגוריתם והפקת פלט</h4>
            
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
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                      <button onClick={() => setScheduleFilter('all')} className="btn" style={{ padding: '0.4rem 1rem', backgroundColor: scheduleFilter === 'all' ? 'var(--primary-color)' : 'rgba(255,255,255,0.1)' }}>הכל</button>
                      <button onClick={() => setScheduleFilter('plasam')} className="btn" style={{ padding: '0.4rem 1rem', backgroundColor: scheduleFilter === 'plasam' ? 'var(--primary-color)' : 'rgba(255,255,255,0.1)' }}>פלס״ם</button>
                    </div>
                    
                    <div id="schedule-table-preview" className="pdf-preview" style={{ backgroundColor: 'white', color: 'black', padding: '1rem 1.5rem', borderRadius: '8px', textAlign: 'right', marginBottom: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '0.95rem', width: '90%', maxWidth: '450px', margin: '0 auto' }}>
                      <h2 style={{ textAlign: 'center', borderBottom: '2px solid #333', paddingBottom: '0.5rem', marginBottom: '1rem', fontSize: '1.3rem' }}>
                        שיבוץ תורני מטבח - {scheduleFilter === 'plasam' ? 'פלס״ם' : 'הכל'}
                      </h2>
                      
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', margin: '0 auto' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '2px solid #ddd' }}>
                            <th style={{ padding: '0.4rem 0.75rem', border: '1px solid #ddd' }}>יום</th>
                            <th style={{ padding: '0.4rem 0.75rem', border: '1px solid #ddd' }}>בוקר</th>
                            <th style={{ padding: '0.4rem 0.75rem', border: '1px solid #ddd' }}>ערב</th>
                          </tr>
                        </thead>
                        <tbody>
                          {algorithmResult.schedule.map((day, idx) => {
                            const getDepartmentColor = (depName) => {
                              const colors = { 'תקשוב': '#bae6fd', 'לוגיסטיקה': '#fef08a', 'טנ"א': '#bbf7d0', 'משא"ן': '#fbcfe8' };
                              return colors[depName] || '#f3f4f6';
                            };
                            const filterShift = (shift) => shift.filter(s => scheduleFilter === 'all' || (scheduleFilter === 'plasam' && !s.isAgam));
                            
                            const filteredMorning = filterShift(day.morning);
                            const filteredEvening = filterShift(day.evening);
                            
                            // Align lengths so they match row by row visually
                            const maxRows = Math.max(filteredMorning.length, filteredEvening.length);
                            const rows = Array.from({ length: maxRows === 0 ? 1 : maxRows });

                            return (
                              <tr key={idx}>
                                <td style={{ padding: '0.4rem 0.75rem', border: '1px solid #ddd', fontWeight: 'bold', width: '20%' }}>{day.shortName}</td>
                                <td style={{ padding: '0', border: '1px solid #ddd', verticalAlign: 'top', width: '40%' }}>
                                  {rows.map((_, i) => {
                                    if (maxRows === 0) return <div key={i} style={{ padding: '0.4rem' }}>-</div>;
                                    const s = filteredMorning[i];
                                    return s ? <div key={i} style={{ padding: '0.4rem', borderBottom: i < maxRows - 1 ? '1px solid #eee' : 'none', backgroundColor: getDepartmentColor(s.department) }}>{s.name}</div> : <div key={i} style={{ padding: '0.4rem', borderBottom: i < maxRows - 1 ? '1px solid #eee' : 'none' }}>&nbsp;</div>;
                                  })}
                                </td>
                                <td style={{ padding: '0', border: '1px solid #ddd', verticalAlign: 'top', width: '40%' }}>
                                  {rows.map((_, i) => {
                                    if (maxRows === 0) return <div key={i} style={{ padding: '0.4rem' }}>-</div>;
                                    const s = filteredEvening[i];
                                    return s ? <div key={i} style={{ padding: '0.4rem', borderBottom: i < maxRows - 1 ? '1px solid #eee' : 'none', backgroundColor: getDepartmentColor(s.department) }}>{s.name}</div> : <div key={i} style={{ padding: '0.4rem', borderBottom: i < maxRows - 1 ? '1px solid #eee' : 'none' }}>&nbsp;</div>;
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
                                const file = new File([blob], 'schedule.png', { type: 'image/png' });
                                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                                  await navigator.share({
                                    files: [file],
                                    title: 'שיבוץ תורנויות',
                                    text: 'שיבוץ תורני מטבח לשבוע הקרוב'
                                  });
                                } else {
                                  // Fallback to download if sharing files is not supported
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = 'schedule.png';
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

                    <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'center' }}>
                      <button onClick={handleApproveSchedule} className="btn" style={{ padding: '0.75rem 1.5rem', backgroundColor: '#F59E0B', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                        <ClipboardCheck size={20} />
                        חותמת מנהל: אשר שבצ״ק והעבר לטבלת צדק
                      </button>
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

        {/* שלב 5: טבלת הצדק ובלת"מים */}
        <div className="glass-panel" style={{ width: '100%', borderColor: justiceData ? 'var(--primary-color)' : 'var(--border-color)', position: 'relative' }}>
          <h4 style={{ fontSize: '1.2rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
             <ClipboardCheck /> שלב 5: טבלת הצדק ובלת״מים
          </h4>
          
          {justiceData ? (
            <div className="animate-fade-in" style={{ textAlign: 'center' }}>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                כאן מנוהל השבצ״ק בפועל. לחץ על שם של חייל כדי לעדכן בלת״ם (החלפה). כל שינוי יתעדכן אוטומטית בהיסטוריית המשמרות וישפיע על שבוע הבא.
              </p>

              <div style={{ overflowX: 'auto', backgroundColor: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>יום</th>
                      <th style={{ padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>בוקר</th>
                      <th style={{ padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>ערב</th>
                    </tr>
                  </thead>
                  <tbody>
                    {justiceData.schedule.map((day, dayIdx) => (
                      <tr key={dayIdx}>
                        <td style={{ padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)', fontWeight: 'bold' }}>{day.shortName}</td>
                        <td style={{ padding: '0', borderBottom: '1px solid rgba(255,255,255,0.05)', borderLeft: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top' }}>
                          {day.morning.length === 0 ? <div style={{ padding: '0.5rem' }}>-</div> : day.morning.map((s, idx) => (
                            <div key={idx} style={{ padding: '0.5rem', borderBottom: idx < day.morning.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', cursor: 'pointer', backgroundColor: 'rgba(255,255,255,0.02)', transition: 'all 0.2s' }} onClick={() => setEditingShift({ dayIdx, shiftTime: 'morning', idx, oldPerson: s })} title="לחץ להחלפה">
                               {editingShift?.dayIdx === dayIdx && editingShift?.shiftTime === 'morning' && editingShift?.idx === idx ? (
                                 <select 
                                    autoFocus
                                    onBlur={() => setEditingShift(null)}
                                    onChange={(e) => handleBaltamChange(dayIdx, 'morning', idx, s, e.target.value)}
                                    style={{ width: '100%', padding: '0.2rem', backgroundColor: '#333', color: 'white', border: '1px solid var(--primary-color)', borderRadius: '4px' }}
                                 >
                                   <option value="">בחר מחליף...</option>
                                   {departmentsData.flatMap(d => (d.soldiers || []).map(soldier => (
                                     <option key={`${soldier.name}_${d.departmentName}`} value={`${soldier.name}_${d.departmentName}`}>
                                       {soldier.name} ({d.departmentName})
                                     </option>
                                   )))}
                                 </select>
                               ) : (
                                 <span style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.25rem', color: 'var(--text-primary)' }}>
                                   {s.name} <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>({s.department})</span> ✏️
                                 </span>
                               )}
                            </div>
                          ))}
                        </td>
                        <td style={{ padding: '0', borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top' }}>
                          {day.evening.length === 0 ? <div style={{ padding: '0.5rem' }}>-</div> : day.evening.map((s, idx) => (
                            <div key={idx} style={{ padding: '0.5rem', borderBottom: idx < day.evening.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', cursor: 'pointer', backgroundColor: 'rgba(255,255,255,0.02)', transition: 'all 0.2s' }} onClick={() => setEditingShift({ dayIdx, shiftTime: 'evening', idx, oldPerson: s })} title="לחץ להחלפה">
                               {editingShift?.dayIdx === dayIdx && editingShift?.shiftTime === 'evening' && editingShift?.idx === idx ? (
                                 <select 
                                    autoFocus
                                    onBlur={() => setEditingShift(null)}
                                    onChange={(e) => handleBaltamChange(dayIdx, 'evening', idx, s, e.target.value)}
                                    style={{ width: '100%', padding: '0.2rem', backgroundColor: '#333', color: 'white', border: '1px solid var(--primary-color)', borderRadius: '4px' }}
                                 >
                                   <option value="">בחר מחליף...</option>
                                   {departmentsData.flatMap(d => (d.soldiers || []).map(soldier => (
                                     <option key={`${soldier.name}_${d.departmentName}`} value={`${soldier.name}_${d.departmentName}`}>
                                       {soldier.name} ({d.departmentName})
                                     </option>
                                   )))}
                                 </select>
                               ) : (
                                 <span style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.25rem', color: 'var(--text-primary)' }}>
                                   {s.name} <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>({s.department})</span> ✏️
                                 </span>
                               )}
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
              טבלת הצדק תהיה זמינה לאחר שתאשר את השיבוץ משלב 4 באמצעות "חותמת מנהל".
            </p>
          )}
        </div>

      </div>
    </div>
  );
};

export default ManagerScreen;
