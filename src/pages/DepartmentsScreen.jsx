import React, { useState } from 'react';
import { Users, Plus, Save, UserCheck, ShieldAlert, Sun, Moon } from 'lucide-react';
import { db } from '../firebase/firebase';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';

import { useLocation } from 'react-router-dom';

const EXPECTED_DEPARTMENTS = ['תקשוב', 'לוגיסטיקה', 'טנ"א', 'משא"ן', 'אג"ם'];

const DepartmentsScreen = () => {
  // קריאת שם המחלקה מה-URL
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const departmentName = searchParams.get('name') || 'לא זוהה משתמש';
  
  const [soldiers, setSoldiers] = useState([{ name: '', isNewSoldier: false, closesWeekend: false, exceptionType: 'none', exceptionReason: '', shiftPreference: 'none', blockedDays: [], constraintReason: '', spreadPreference: 'none', shiftTypePreference: 'none', preferredBuddy: '' }]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  React.useEffect(() => {
    const fetchDep = async () => {
      if (departmentName && departmentName !== 'לא זוהה משתמש') {
        try {
          const docRef = doc(db, 'activeDepartments', departmentName);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.soldiers && data.soldiers.length > 0) {
              setSoldiers(data.soldiers);
            }
          }
        } catch (e) {
          console.error(e);
        }
      }
    };
    fetchDep();
  }, [departmentName]);

  const handleAddSoldier = () => {
    setSoldiers([...soldiers, { name: '', isNewSoldier: false, closesWeekend: false, exceptionType: 'none', exceptionReason: '', shiftPreference: 'none', blockedDays: [], constraintReason: '', spreadPreference: 'none', shiftTypePreference: 'none', preferredBuddy: '' }]);
  };

  const handleSoldierChange = (index, field, value) => {
    const newSoldiers = [...soldiers];
    newSoldiers[index][field] = value;
    setSoldiers(newSoldiers);
  };

  const toggleBlockedDay = (index, day) => {
    const newSoldiers = [...soldiers];
    const currentDays = newSoldiers[index].blockedDays || [];
    if (currentDays.includes(day)) {
      newSoldiers[index].blockedDays = currentDays.filter(d => d !== day);
    } else {
      newSoldiers[index].blockedDays = [...currentDays, day];
    }
    setSoldiers(newSoldiers);
  };

  const handleRemoveSoldier = (index) => {
    const newSoldiers = soldiers.filter((_, i) => i !== index);
    setSoldiers(newSoldiers);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!departmentName || departmentName === 'לא זוהה משתמש') {
      setMessage('שגיאה: לא זוהתה מחלקה. נסה להתחבר מחדש.');
      return;
    }

    // סינון שורות ריקות (כאלה שלא הזינו בהן שם)
    const validSoldiers = soldiers.filter(s => s.name.trim() !== '');
    
    if (validSoldiers.length === 0) {
      setMessage('נא להזין לפחות חייל אחד.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      await setDoc(doc(db, 'activeDepartments', departmentName), {
        departmentName,
        soldiers: validSoldiers,
        updatedAt: serverTimestamp()
      });
      
      setMessage('הנתונים לשבוע הקרוב נשמרו בהצלחה!');
    } catch (error) {
      console.error("Error adding document: ", error);
      setMessage('שגיאה בשמירת הנתונים.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h3 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.5rem' }}>
        <Users color="var(--primary-color)" /> ניהול מצבת כוח אדם
      </h3>
      <h4 style={{ color: 'var(--secondary-color)', marginBottom: '1.5rem' }}>משתמש: סמל {departmentName}</h4>
      
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
            הזן את כל חיילי המחלקה. למי שסוגר שבת - סמן V. למי שיש פטור מתורנות - רשום את הסיבה.
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
                  title="הסר חייל"
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
                    required
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
                      חייל חדש? (שבוע חסד)
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
