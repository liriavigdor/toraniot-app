import React, { useState } from 'react';
import { Users, Plus, Save, UserCheck, ShieldAlert, Sun, Moon, CheckCircle2 } from 'lucide-react';
import { db } from '../firebase/firebase';
import { doc, setDoc, getDoc, serverTimestamp, deleteField, updateDoc } from 'firebase/firestore';

import { useLocation } from 'react-router-dom';

const EXPECTED_DEPARTMENTS = ['תקשוב', 'לוגיסטיקה', 'טנ"א', 'משא"ן'];

const DepartmentsScreen = () => {
  // קריאת שם המחלקה מה-URL אם הועבר, או בחירה ישירה במסך
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const initialDepartment = searchParams.get('name') || '';
  const [selectedDepartment, setSelectedDepartment] = useState(initialDepartment);
  
  const [soldiers, setSoldiers] = useState([{ name: '', isNewSoldier: false, closesWeekend: false, exceptionType: 'none', exceptionReason: '', shiftPreference: 'none', blockedDays: [], constraintReason: '', spreadPreference: 'none', shiftTypePreference: 'none', preferredBuddy: '' }]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  React.useEffect(() => {
    const fetchDep = async () => {
      if (selectedDepartment) {
        setLoading(true);
        setIsDirty(false);
        try {
          const docRef = doc(db, 'activeDepartments', selectedDepartment);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.soldiers && data.soldiers.length > 0) {
              setSoldiers(data.soldiers);
            } else {
              setSoldiers([{ name: '', isNewSoldier: false, closesWeekend: false, exceptionType: 'none', exceptionReason: '', shiftPreference: 'none', blockedDays: [], constraintReason: '', spreadPreference: 'none', shiftTypePreference: 'none', preferredBuddy: '' }]);
            }
          } else {
            setSoldiers([{ name: '', isNewSoldier: false, closesWeekend: false, exceptionType: 'none', exceptionReason: '', shiftPreference: 'none', blockedDays: [], constraintReason: '', spreadPreference: 'none', shiftTypePreference: 'none', preferredBuddy: '' }]);
          }
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      }
    };
    fetchDep();
  }, [selectedDepartment]);

  const handleAddSoldier = () => {
    setIsDirty(true);
    setSoldiers([...soldiers, { name: '', isNewSoldier: false, closesWeekend: false, exceptionType: 'none', exceptionReason: '', shiftPreference: 'none', blockedDays: [], constraintReason: '', spreadPreference: 'none', shiftTypePreference: 'none', preferredBuddy: '' }]);
  };

  const handleSoldierChange = (index, field, value) => {
    setIsDirty(true);
    const newSoldiers = [...soldiers];
    newSoldiers[index][field] = value;
    setSoldiers(newSoldiers);
  };

  const toggleBlockedDay = (index, day) => {
    setIsDirty(true);
    const newSoldiers = [...soldiers];
    const currentDays = newSoldiers[index].blockedDays || [];
    if (currentDays.includes(day)) {
      newSoldiers[index].blockedDays = currentDays.filter(d => d !== day);
    } else {
      newSoldiers[index].blockedDays = [...currentDays, day];
    }
    setSoldiers(newSoldiers);
  };

  const saveDepartmentData = async (soldiersToSave, removedSoldierNames = []) => {
    if (!selectedDepartment) return false;

    // סינון שורות ריקות, ניקוי רווחים מיותרים ומניעת כפילויות של אותו חייל
    const seenNames = new Set();
    const validSoldiers = [];
    
    soldiersToSave.forEach(s => {
      const trimmedName = (s.name || '').trim();
      if (trimmedName !== '' && !seenNames.has(trimmedName)) {
        seenNames.add(trimmedName);
        validSoldiers.push({
          ...s,
          name: trimmedName,
          exceptionReason: (s.exceptionReason || '').trim(),
          constraintReason: (s.constraintReason || '').trim(),
          preferredBuddy: (s.preferredBuddy || '').trim()
        });
      }
    });

    setLoading(true);
    setMessage('');

    try {
      const depRef = doc(db, 'activeDepartments', selectedDepartment);
      
      // מציאת חיילים שהוסרו (אם לא הועברו מפורשות)
      let allRemoved = [...removedSoldierNames];
      try {
        const prevSnap = await getDoc(depRef);
        if (prevSnap.exists()) {
          const prevSoldiers = prevSnap.data()?.soldiers || [];
          prevSoldiers.forEach(ps => {
            const psName = (ps.name || '').trim();
            if (psName && !seenNames.has(psName) && !allRemoved.includes(psName)) {
              allRemoved.push(psName);
            }
          });
        }
      } catch (e) {
        console.error("Error checking previous soldiers:", e);
      }

      await setDoc(depRef, {
        departmentName: selectedDepartment.trim(),
        soldiers: validSoldiers,
        updatedAt: serverTimestamp()
      });

      // עדכון אוטומטי של מספר תורנויות ממוצע לחייל שנוסף, ומחיקת חיילים שהוסרו מההיסטוריה
      try {
        const historyRef = doc(db, 'history', 'stats');
        const historySnap = await getDoc(historyRef);
        const globalStats = historySnap.exists() ? { ...historySnap.data() } : {};
        
        let vetTotalSum = 0;
        let vetMidSum = 0;
        let vetWeekSum = 0;
        let vetCount = 0;
        Object.entries(globalStats).forEach(([k, val]) => {
          const tot = Number(val.total || 0);
          if (tot > 0) {
            vetTotalSum += tot;
            vetMidSum += Number(val.midweek || 0);
            vetWeekSum += Number(val.weekend || 0);
            vetCount++;
          }
        });
        const avgTotal = vetCount > 0 ? Math.floor(vetTotalSum / vetCount) : 5;
        const avgWeek = vetCount > 0 ? Math.round(vetWeekSum / vetCount) : 1;
        const avgMid = Math.max(0, avgTotal - avgWeek);

        let statsModified = false;
        
        // 1. הסרת חיילים שנמחקו מהמחלקה מ-history/stats
        allRemoved.forEach(remName => {
          const remKey = `${remName.trim()}_${selectedDepartment.trim()}`;
          if (globalStats[remKey] !== undefined) {
            delete globalStats[remKey];
            statsModified = true;
          }
        });

        // 2. הוספת ממוצע לחיילים חדשים ללא שבוע חסד
        validSoldiers.forEach(s => {
          if (s.isNewSoldier) return;

          const key = `${s.name}_${selectedDepartment.trim()}`;
          const existing = globalStats[key];
          const hasHistory = existing && (Number(existing.total || 0) > 0 || Number(existing.kesherDays || 0) > 0);

          if (!hasHistory) {
            globalStats[key] = {
              total: avgTotal,
              midweek: avgMid,
              weekend: avgWeek,
              kesherDays: Number(existing?.kesherDays || 0)
            };
            statsModified = true;
          }
        });

        if (statsModified) {
          await setDoc(historyRef, globalStats);
        }
      } catch (statsErr) {
        console.error("Error syncing soldier baseline stats in history:", statsErr);
      }
      
      setIsDirty(false);
      setMessage('הנתונים עודכנו ונשמרו בהצלחה למערכת ולטבלת הצדק!');
      return true;
    } catch (error) {
      console.error("Error saving department document: ", error);
      setMessage('שגיאה בשמירת הנתונים: ' + error.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveSoldier = async (index) => {
    const soldierToRemove = soldiers[index];
    const sName = (soldierToRemove?.name || '').trim();

    if (sName) {
      if (!window.confirm(`האם אתה בטוח שברצונך למחוק את החייל/ת "${sName}" ממחלקת ${selectedDepartment}?\n\nהמחיקה תעדכן את המערכת וטבלת הצדק מיידית.`)) {
        return;
      }
    }

    const newSoldiers = soldiers.filter((_, i) => i !== index);
    const finalSoldiers = newSoldiers.length > 0 ? newSoldiers : [{ name: '', isNewSoldier: false, closesWeekend: false, exceptionType: 'none', exceptionReason: '', shiftPreference: 'none', blockedDays: [], constraintReason: '', spreadPreference: 'none', shiftTypePreference: 'none', preferredBuddy: '' }];
    setSoldiers(finalSoldiers);

    // אם לחייל היה שם - מבצעים שמירה וסנכרון מיידי ל-Firestore
    if (sName && selectedDepartment) {
      await saveDepartmentData(finalSoldiers, [sName]);
    } else {
      setIsDirty(true);
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!selectedDepartment) {
      setMessage('שגיאה: לא נבחרה מחלקה. בחר מחלקה תחילה.');
      return;
    }

    const hasAnySoldier = soldiers.some(s => (s.name || '').trim() !== '');
    if (!hasAnySoldier) {
      setMessage('נא להזין לפחות חייל אחד עם שם במחלקה.');
      return;
    }

    await saveDepartmentData(soldiers);
  };

  if (!selectedDepartment) {
    return (
      <div className="glass-panel animate-fade-in" style={{ maxWidth: '520px', margin: '2rem auto', textAlign: 'center', padding: '2.5rem' }}>
        <div style={{ display: 'inline-flex', padding: '1rem', borderRadius: '50%', backgroundColor: 'rgba(59, 130, 246, 0.1)', marginBottom: '1.2rem' }}>
          <Users size={44} color="var(--primary-color)" />
        </div>
        <h2 style={{ marginBottom: '0.75rem', fontSize: '1.8rem' }}>כניסת סמלים</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '1.05rem', lineHeight: '1.5' }}>
          בחר את המחלקה שלך כדי לעדכן את מצבת החיילים והאילוצים:
        </p>
        <div style={{ display: 'grid', gap: '1rem' }}>
          {EXPECTED_DEPARTMENTS.map(dep => (
            <button
              key={dep}
              onClick={() => setSelectedDepartment(dep)}
              className="btn btn-secondary"
              style={{
                width: '100%',
                padding: '1.1rem',
                fontSize: '1.2rem',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '0.75rem',
                backgroundColor: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                cursor: 'pointer',
                fontWeight: 600,
                borderRadius: '10px'
              }}
            >
              <Users size={20} color="var(--secondary-color)" />
              סמל {dep}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h3 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.5rem' }}>
        <Users color="var(--primary-color)" /> ניהול מצבת כוח אדם
      </h3>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '1.25rem', 
        flexWrap: 'wrap', 
        gap: '0.75rem',
        padding: '0.75rem 1rem',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: '8px',
        border: '1px solid var(--border-color)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h4 style={{ color: 'var(--secondary-color)', margin: 0, fontSize: '1.2rem' }}>משתמש: סמל {selectedDepartment}</h4>
          {isDirty ? (
            <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.55rem', borderRadius: '12px', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.35)', fontWeight: 600 }}>
              🟡 יש שינויים שטרם נשמרו
            </span>
          ) : (
            <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.55rem', borderRadius: '12px', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.35)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <CheckCircle2 size={13} /> כל הנתונים מסונכרנים
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={loading}
            className="btn btn-primary"
            style={{ 
              padding: '0.45rem 1rem', 
              fontSize: '0.9rem', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.4rem',
              backgroundColor: isDirty ? 'var(--primary-color)' : 'rgba(99, 102, 241, 0.7)',
              boxShadow: isDirty ? '0 0 12px rgba(99, 102, 241, 0.4)' : 'none'
            }}
          >
            <Save size={16} />
            {loading ? 'שומר...' : 'שמור נתוני מחלקה'}
          </button>
          
          <button 
            type="button" 
            onClick={() => {
              if (isDirty && !window.confirm('ישנם שינויים שטרם נשמרו. האם לצאת בכל זאת?')) return;
              setSelectedDepartment('');
            }} 
            className="btn btn-secondary" 
            style={{ padding: '0.45rem 0.8rem', fontSize: '0.85rem' }}
          >
            החלף מחלקה
          </button>
        </div>
      </div>
      
      <form onSubmit={handleSubmit}>

        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <UserCheck size={18} color="var(--secondary-color)"/> רשימת חיילי המחלקה
            </h4>
            <button type="button" onClick={handleAddSoldier} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem' }}>
              <Plus size={16} /> הוסף חייל
            </button>
          </div>
          
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            הזן את כל חיילי המחלקה. מחיקת חייל מסנכרנת ומסירה אותו מיידית מטבלת הצדק.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {soldiers.map((soldier, index) => (
              <div key={index} style={{ 
                backgroundColor: 'rgba(255,255,255,0.02)',
                padding: '1rem 1rem 1rem 3rem', // Extra padding on left for the X button
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.05)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                position: 'relative'
              }}>
                
                {/* כפתור מחיקה - איקס אדום בשמאל */}
                <button 
                  type="button" 
                  onClick={() => handleRemoveSoldier(index)}
                  className="btn btn-secondary"
                  style={{ position: 'absolute', top: '0.5rem', left: '0.5rem', padding: '0.5rem', borderColor: 'transparent', color: 'var(--danger-color)', backgroundColor: 'transparent' }}
                  title="הסר חייל מהמחלקה ומטבלת הצדק"
                >
                  X
                </button>

                {/* שורה 1: פרטים בסיסיים */}
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button 
                    type="button" 
                    onClick={() => {
                      let nextPref = 'none';
                      if (soldier.shiftPreference === 'none') nextPref = 'morning';
                      else if (soldier.shiftPreference === 'morning') nextPref = 'evening';
                      handleSoldierChange(index, 'shiftPreference', nextPref);
                    }}
                    className="btn btn-secondary"
                    style={{ 
                      padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', 
                      backgroundColor: soldier.shiftPreference === 'none' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.2)', 
                      color: soldier.shiftPreference === 'morning' ? '#FCD34D' : (soldier.shiftPreference === 'evening' ? '#93C5FD' : 'var(--text-secondary)'),
                      borderColor: soldier.shiftPreference !== 'none' ? (soldier.shiftPreference === 'morning' ? '#FCD34D' : '#93C5FD') : 'transparent'
                    }}
                    title={soldier.shiftPreference === 'morning' ? "מעדיף בוקר" : (soldier.shiftPreference === 'evening' ? "מעדיף ערב" : "אין העדפת משמרת")}
                  >
                    {soldier.shiftPreference === 'morning' ? <Sun size={18} /> : (soldier.shiftPreference === 'evening' ? <Moon size={18} /> : <div style={{width: 18, height: 18, borderRadius: '50%', border: '2px dashed var(--text-secondary)'}}></div>)}
                  </button>

                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="שם החייל/ת"
                    value={soldier.name}
                    onChange={(e) => handleSoldierChange(index, 'name', e.target.value)}
                    style={{ marginBottom: 0, flex: '1 1 calc(100% - 60px)', minWidth: '100px' }}
                  />
                  
                  <div style={{ display: 'flex', width: '100%', gap: '1rem', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                      <input 
                        type="checkbox" 
                        checked={soldier.closesWeekend}
                        onChange={(e) => handleSoldierChange(index, 'closesWeekend', e.target.checked)}
                        style={{ width: '18px', height: '18px', accentColor: 'var(--primary-color)' }}
                      />
                      סוגר שבת? (חמישי-שבת)
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#10B981' }}>
                      <input 
                        type="checkbox" 
                        checked={soldier.isNewSoldier}
                        onChange={(e) => handleSoldierChange(index, 'isNewSoldier', e.target.checked)}
                        style={{ width: '18px', height: '18px', accentColor: '#10B981' }}
                      />
                      <span title="חייל חדש מקבל שבוע חסד ללא תורנויות. עם החלפת השבוע ויצירת שבצ״ק חדש, שבוע החסד יוסר אוטומטית והחייל יקבל את ממוצע התורנויות בטבלת הצדק למניעת טחינה.">
                        חייל חדש? (שבוע חסד)
                      </span>
                    </label>
                  </div>
                </div>

                {/* שורה 2: פטורים ואילוצים */}
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', backgroundColor: 'rgba(0,0,0,0.1)', padding: '0.75rem', borderRadius: '6px' }}>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ShieldAlert size={18} color="var(--text-secondary)" opacity={0.5} />
                    <select
                      className="input-field"
                      value={soldier.exceptionType}
                      onChange={(e) => handleSoldierChange(index, 'exceptionType', e.target.value)}
                      style={{ marginBottom: 0, padding: '0.25rem 0.5rem', width: 'auto', backgroundColor: soldier.exceptionType !== 'none' ? 'rgba(239,68,68,0.1)' : 'transparent', borderColor: soldier.exceptionType !== 'none' ? 'var(--danger-color)' : 'var(--border-color)' }}
                    >
                      <option value="none">ללא פטור</option>
                      <option value="full">פטור מלא</option>
                      <option value="weekend">פטור סופ"ש</option>
                    </select>
                  </div>

                  {soldier.exceptionType !== 'none' && (
                    <input 
                      type="text" 
                      className="input-field" 
                      placeholder="סיבת הפטור (חובה למלא עבור המנהל)"
                      value={soldier.exceptionReason}
                      onChange={(e) => handleSoldierChange(index, 'exceptionReason', e.target.value)}
                      style={{ marginBottom: 0, flex: 1, minWidth: '200px', borderColor: 'var(--danger-color)' }}
                    />
                  )}

                </div>

                {/* שורה 3: אילוצים */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', width: '100%' }}>אילוצי ימים (בחר ימים שבהם החייל לא יכול לעלות):</span>
                  
                  {/* בחירת ימים */}
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', width: '100%' }}>
                    {["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"].map(day => {
                      const isBlocked = (soldier.blockedDays || []).includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleBlockedDay(index, day)}
                          style={{
                            flex: '1 1 calc(14% - 0.4rem)', minWidth: '32px', height: '36px', borderRadius: '6px', fontSize: '1rem', fontWeight: 'bold',
                            border: '1px solid', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            backgroundColor: isBlocked ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
                            borderColor: isBlocked ? 'var(--danger-color)' : 'rgba(255,255,255,0.1)',
                            color: isBlocked ? 'var(--danger-color)' : 'var(--text-secondary)',
                            transition: 'all 0.2s'
                          }}
                          title={isBlocked ? "יום חסום" : "יום פנוי"}
                        >
                          {day.replace("'", "")}
                        </button>
                      );
                    })}
                  </div>

                  {/* סיבת האילוץ */}
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="סיבת האילוץ (כדי שהמנהל ידע במקרה של סתירה)"
                    value={soldier.constraintReason || ''}
                    onChange={(e) => handleSoldierChange(index, 'constraintReason', e.target.value)}
                    style={{ marginBottom: 0, padding: '0.75rem', fontSize: '0.9rem', flex: '1 1 100%', minWidth: '100%' }}
                  />
                </div>

                {/* שורה 4: העדפות אישיות (חדש) */}
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', backgroundColor: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: '150px' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>סגנון שיבוץ:</span>
                    <select
                      className="input-field"
                      value={soldier.spreadPreference || 'none'}
                      onChange={(e) => handleSoldierChange(index, 'spreadPreference', e.target.value)}
                      style={{ marginBottom: 0, padding: '0.4rem', fontSize: '0.9rem' }}
                    >
                      <option value="none">ללא העדפה</option>
                      <option value="consecutive">במכה (יום אחרי יום)</option>
                      <option value="spread">בפיזור (לתת רווח)</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: '150px' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>העדפת משמרת:</span>
                    <select
                      className="input-field"
                      value={soldier.shiftTypePreference || 'none'}
                      onChange={(e) => handleSoldierChange(index, 'shiftTypePreference', e.target.value)}
                      style={{ marginBottom: 0, padding: '0.4rem', fontSize: '0.9rem' }}
                    >
                      <option value="none">ללא העדפה</option>
                      <option value="full">ברצף (יום שלם)</option>
                      <option value="half">חצי פה חצי שם (משמרת בודדת)</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: '150px' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>חברים מועדפים (Buddy):</span>
                    <input 
                      type="text" 
                      className="input-field" 
                      placeholder="שם החבר/ה (אופציונלי)"
                      value={soldier.preferredBuddy || ''}
                      onChange={(e) => handleSoldierChange(index, 'preferredBuddy', e.target.value)}
                      style={{ marginBottom: 0, padding: '0.4rem', fontSize: '0.9rem' }}
                    />
                  </div>
                </div>

              </div>
            ))}
          </div>
        </div>

        {message && (
          <div style={{ 
            padding: '1rem', 
            marginBottom: '1rem', 
            borderRadius: '8px',
            backgroundColor: message.includes('בהצלחה') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            color: message.includes('בהצלחה') ? 'var(--secondary-color)' : 'var(--danger-color)',
            border: `1px solid ${message.includes('בהצלחה') ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            textAlign: 'center'
          }}>
            {message}
          </div>
        )}

        <button type="submit" className="btn" style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', marginTop: '1rem' }} disabled={loading}>
          <Save size={20} />
          {loading ? 'שומר נתונים...' : 'עדכן נתוני מחלקה למערכת'}
        </button>
      </form>
    </div>
  );
};

export default DepartmentsScreen;
// Reload triggered
