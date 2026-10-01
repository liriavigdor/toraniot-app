import React, { useState, useEffect } from 'react';
import { ClipboardCheck, CheckCircle2, AlertCircle, ArrowDown, FileText, XCircle } from 'lucide-react';
import { db } from '../firebase/firebase';
import { doc, collection, onSnapshot } from 'firebase/firestore';
import { generateSchedule, SchedulingConflictError } from '../utils/algorithm';

// מחלקות שצריכות להגיש כדי שהמערכת תוכל לשבץ - נעדכן לפי הצורך
const EXPECTED_DEPARTMENTS = ['תקשוב', 'לוגיסטיקה', 'טנ"א', 'משא"ן', 'אג"ם'];

const ManagerScreen = () => {
  const [kitchenData, setKitchenData] = useState(null);
  const [departmentsData, setDepartmentsData] = useState([]);
  const [managerOverrides, setManagerOverrides] = useState({});
  const [kitchenOverrides, setKitchenOverrides] = useState({});
  const [showKitchenOverrides, setShowKitchenOverrides] = useState(false);
  const [algorithmResult, setAlgorithmResult] = useState(null);
  const [algorithmError, setAlgorithmError] = useState(null);
  const [whatsappNumber, setWhatsappNumber] = useState('0546231678');

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

    return () => {
      unsubKitchen();
      unsubDepartments();
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
    setKitchenOverrides(prev => ({
      ...prev,
      [`${dayKey}_${shift}_${type}`]: val
    }));
  };

  const handleRunAlgorithm = () => {
    setAlgorithmError(null);
    setAlgorithmResult(null);

    try {
      const result = generateSchedule(kitchenData, departmentsData, managerOverrides, kitchenOverrides);
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
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>אג״ם</span>
                    <strong style={{ display: 'block', fontSize: '1.4rem', color: 'var(--secondary-color)' }}>{kitchenData.midweek?.agam || 0}</strong>
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
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>אג״ם</span>
                    <strong style={{ display: 'block', fontSize: '1.4rem', color: 'var(--secondary-color)' }}>{kitchenData.weekend?.agam || 0}</strong>
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
                          <th style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>בוקר אג״ם</th>
                          <th style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>ערב פלס״ם</th>
                          <th style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>ערב אג״ם</th>
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
                                  {hasMorning ? <input type="number" min="0" placeholder={defAgam} style={{ width: '60px', textAlign: 'center', backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'white', borderRadius: '4px', padding: '0.2rem' }} value={kitchenOverrides[`${day.key}_morning_agam`] ?? ''} onChange={e => handleKitchenOverride(day.key, 'morning', 'agam', e.target.value)} /> : '-'}
                                </td>
                                <td style={{ padding: '0.75rem 0.5rem' }}>
                                  {hasEvening ? <input type="number" min="0" placeholder={defPlasam} style={{ width: '60px', textAlign: 'center', backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'white', borderRadius: '4px', padding: '0.2rem' }} value={kitchenOverrides[`${day.key}_evening_plasam`] ?? ''} onChange={e => handleKitchenOverride(day.key, 'evening', 'plasam', e.target.value)} /> : '-'}
                                </td>
                                <td style={{ padding: '0.75rem 0.5rem' }}>
                                  {hasEvening ? <input type="number" min="0" placeholder={defAgam} style={{ width: '60px', textAlign: 'center', backgroundColor: 'transparent', border: '1px solid var(--border-color)', color: 'white', borderRadius: '4px', padding: '0.2rem' }} value={kitchenOverrides[`${day.key}_evening_agam`] ?? ''} onChange={e => handleKitchenOverride(day.key, 'evening', 'agam', e.target.value)} /> : '-'}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <h4 style={{ fontSize: '1.2rem', margin: 0 }}>שלב 2: הזנת סד״כ שבועי (סמלים)</h4>
            {missingDepartments.length === 0 ? <CheckCircle2 color="var(--secondary-color)" /> : <AlertCircle color="var(--text-secondary)" opacity={0.7} />}
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            {/* מי שהגיש */}
            <div>
              <h5 style={{ color: 'var(--secondary-color)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle2 size={16} /> הגישו נתונים ({departmentsData.length}/{EXPECTED_DEPARTMENTS.length})
              </h5>
              {departmentsData.length === 0 ? <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>טרם התקבלו נתונים מאף מחלקה</p> : null}
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {departmentsData.map((d, idx) => {
                  const total = d.soldiers?.length || 0;
                  const exceptions = d.soldiers?.filter(s => s.exceptionReason && s.exceptionReason.trim() !== '').length || 0;
                  const available = total - exceptions;
                  
                  return (
                    <li key={idx} className="animate-fade-in" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '6px', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 500 }}>{d.departmentName}</span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>סה״כ: {total} | כשירים: <strong style={{ color: 'var(--secondary-color)' }}>{available}</strong> | פטורים: <strong style={{ color: 'var(--danger-color)' }}>{exceptions}</strong></span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* מי שחסר */}
            <div>
              <h5 style={{ color: 'var(--text-secondary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertCircle size={16} opacity={0.8} /> טרם הגישו
              </h5>
              {missingDepartments.length === 0 ? <p style={{ fontSize: '0.9rem', color: 'var(--secondary-color)' }}>מעולה! כולם הגישו את הנתונים.</p> : null}
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {missingDepartments.map((d, idx) => (
                  <li key={idx} className="animate-fade-in" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0', color: 'var(--text-secondary)', opacity: 0.8 }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'currentColor' }}></span> {d}
                  </li>
                ))}
              </ul>
            </div>
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
                          .filter(s => s.exceptionType && s.exceptionType !== 'none')
                          .map((s, idx) => ({ ...s, depName: dep.departmentName, id: `${dep.departmentName}_${idx}` }))
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
                          .filter(s => s.blockedDays && s.blockedDays.length > 0)
                          .map((s, idx) => ({ ...s, depName: dep.departmentName, id: `${dep.departmentName}_${idx}` }))
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
                    <div className="pdf-preview" style={{ backgroundColor: 'white', color: 'black', padding: '2rem', borderRadius: '8px', textAlign: 'right', marginBottom: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                      <h2 style={{ textAlign: 'center', borderBottom: '2px solid #333', paddingBottom: '1rem', marginBottom: '2rem' }}>שיבוץ תורני מטבח - השבוע הקרוב</h2>
                      
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '2px solid #ddd' }}>
                            <th style={{ padding: '0.75rem', border: '1px solid #ddd' }}>יום</th>
                            <th style={{ padding: '0.75rem', border: '1px solid #ddd' }}>משמרת בוקר</th>
                            <th style={{ padding: '0.75rem', border: '1px solid #ddd' }}>משמרת ערב</th>
                          </tr>
                        </thead>
                        <tbody>
                          {algorithmResult.schedule.map((day, idx) => (
                            <tr key={idx}>
                              <td style={{ padding: '1rem', border: '1px solid #ddd', fontWeight: 'bold' }}>{day.shortName}</td>
                              <td style={{ padding: '1rem', border: '1px solid #ddd' }}>
                                {day.morning.length > 0 ? day.morning.map((name, i) => <div key={i}>{name}</div>) : '-'}
                              </td>
                              <td style={{ padding: '1rem', border: '1px solid #ddd' }}>
                                {day.evening.length > 0 ? day.evening.map((name, i) => <div key={i}>{name}</div>) : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* שליחה לוואטסאפ */}
                    <div style={{ marginTop: '2rem', padding: '1.5rem', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                      <h4 style={{ margin: 0, color: 'var(--secondary-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" /><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" /></svg>
                        שליחת השבצ"ק בוואטסאפ
                      </h4>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>הכנס מספר טלפון כדי לשלוח את השיבוץ כהודעה מסודרת.</p>
                      
                      <div style={{ display: 'flex', gap: '1rem', width: '100%', maxWidth: '400px', justifyContent: 'center' }}>
                        <input 
                          type="tel" 
                          className="input-field" 
                          placeholder="מספר טלפון (לדוגמה 0501234567)" 
                          value={whatsappNumber || ''}
                          onChange={(e) => setWhatsappNumber(e.target.value)}
                          style={{ margin: 0, flex: 1, textAlign: 'center', direction: 'ltr' }}
                        />
                        <button 
                          onClick={() => {
                            if (!whatsappNumber || whatsappNumber.length < 9) {
                              alert('נא להזין מספר טלפון תקין');
                              return;
                            }
                            let text = "*שיבוץ תורני מטבח - השבוע הקרוב* 🍳\\n\\n";
                            algorithmResult.schedule.forEach(day => {
                              text += `*${day.dayName} (${day.shortName})*\\n`;
                              text += `🌅 בוקר: ${day.morning.length > 0 ? day.morning.join(', ') : '-'}\\n`;
                              text += `🌙 ערב: ${day.evening.length > 0 ? day.evening.join(', ') : '-'}\\n\\n`;
                            });
                            
                            let num = whatsappNumber.replace(/\\D/g, '');
                            if (num.startsWith('0')) {
                              num = '972' + num.slice(1);
                            }
                            const url = `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
                            window.open(url, '_blank');
                          }} 
                          className="btn" 
                          style={{ padding: '0.5rem 1.5rem', backgroundColor: '#25D366', color: 'white', border: 'none' }}
                        >
                          שלח
                        </button>
                      </div>
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

      </div>
    </div>
  );
};

export default ManagerScreen;
