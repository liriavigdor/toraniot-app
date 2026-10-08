import React, { useState } from 'react';
import { ChefHat, Save, Users, CalendarDays, AlertTriangle } from 'lucide-react';
import { db } from '../firebase/firebase';
import { doc, setDoc, serverTimestamp, deleteDoc, getDocs, collection } from 'firebase/firestore';

const KitchenScreen = () => {
  // אמצע שבוע
  const [midweekPlasam, setMidweekPlasam] = useState('');
  
  // סופ"ש
  const [weekendPlasam, setWeekendPlasam] = useState('');
  
  const [includeMidweek, setIncludeMidweek] = useState(true);
  const [includeWeekend, setIncludeWeekend] = useState(true);

  React.useEffect(() => {
    const fetchKitchenData = async () => {
      try {
        const { getDoc } = await import('firebase/firestore');
        const docSnap = await getDoc(doc(db, 'activeWeek', 'kitchen'));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setMidweekPlasam(data.midweek?.plasam?.toString() || '');
          setWeekendPlasam(data.weekend?.plasam?.toString() || '');
          if (data.includeMidweek !== undefined) setIncludeMidweek(data.includeMidweek);
          if (data.includeWeekend !== undefined) setIncludeWeekend(data.includeWeekend);
        }
      } catch (err) {
        console.error("Error fetching kitchen data:", err);
      }
    };
    fetchKitchenData();
  }, []);

  // Derive the 8 days state from the checkboxes
  const activeDays = {
    "א'": includeMidweek ? 'half_evening' : 'off',
    "ב'": includeMidweek ? 'full' : 'off',
    "ג'": includeMidweek ? 'full' : 'off',
    "ד'": includeMidweek ? 'full' : 'off',
    "ה'": includeWeekend ? 'full' : 'off',
    "ו'": includeWeekend ? 'full' : 'off',
    "ש'": includeWeekend ? 'full' : 'off',
    "א' (יציאה)": includeWeekend ? 'half_morning' : 'off'
  };

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleEmergencyReset = async () => {
    if (!window.confirm('האם אתה בטוח שברצונך להכריז על מצב חירום? זה ימחק את דרישת המטבח הנוכחית ואת כל נתוני הסמלים שהוזנו לשבוע זה!')) {
      return;
    }
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'activeWeek', 'kitchen'));
      const snapshot = await getDocs(collection(db, 'activeDepartments'));
      const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, 'activeDepartments', d.id)));
      await Promise.all(deletePromises);
      setMessage('המערכת אופסה בהצלחה. ניתן להזין דרישה חדשה.');
    } catch (err) {
      console.error(err);
      setMessage('שגיאה באיפוס המערכת.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      // דריסת המסמך "kitchen" כדי שתמיד יהיה מעודכן לשבוע הנוכחי
      await setDoc(doc(db, 'activeWeek', 'kitchen'), {
        includeMidweek,
        includeWeekend,
        activeDays,
        midweek: { plasam: parseInt(midweekPlasam || 0) },
        weekend: { plasam: parseInt(weekendPlasam || 0) },
        updatedAt: serverTimestamp()
      });
      setMessage('הדרישה לשבוע הקרוב עודכנה בהצלחה!');
    } catch (error) {
      console.error("Error adding document: ", error);
      setMessage('שגיאה בשמירת הנתונים. ודא שהמסד נתונים פתוח לכתוב.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto', position: 'relative' }}>
      
      <button 
        onClick={handleEmergencyReset}
        disabled={loading}
        style={{ marginBottom: '1.5rem', width: '100%', justifyContent: 'center', backgroundColor: 'transparent', border: '1px solid var(--danger-color)', color: 'var(--danger-color)', padding: '0.75rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
        title="מוחק את כל נתוני המטבח והסמלים לשבוע הנוכחי"
      >
        <AlertTriangle size={18} /> איפוס מצב חירום
      </button>

      <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.5rem' }}>
        <ChefHat color="var(--primary-color)" /> דרישת תורנים שבועית (מטבח)
      </h3>
      
      <form onSubmit={handleSubmit}>
        
        {/* צ'קבוקסים לבחירת סוג שיבוץ */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', backgroundColor: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', flex: 1, padding: '0.5rem', backgroundColor: includeMidweek ? 'rgba(99,102,241,0.1)' : 'transparent', borderRadius: '4px', border: `1px solid ${includeMidweek ? 'var(--primary-color)' : 'transparent'}` }}>
            <input type="checkbox" checked={includeMidweek} onChange={(e) => setIncludeMidweek(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: 'var(--primary-color)' }} />
            <span style={{ fontWeight: includeMidweek ? 'bold' : 'normal' }}>אמצע שבוע (א' צהריים - ד')</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', flex: 1, padding: '0.5rem', backgroundColor: includeWeekend ? 'rgba(99,102,241,0.1)' : 'transparent', borderRadius: '4px', border: `1px solid ${includeWeekend ? 'var(--primary-color)' : 'transparent'}` }}>
            <input type="checkbox" checked={includeWeekend} onChange={(e) => setIncludeWeekend(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: 'var(--primary-color)' }} />
            <span style={{ fontWeight: includeWeekend ? 'bold' : 'normal' }}>סופ"ש (ה' - א' בוקר)</span>
          </label>
        </div>

        {/* בחירת ימי שיבוץ תצוגה */}
        <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid var(--border-color)' }}>
          <h4 style={{ marginBottom: '1rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CalendarDays size={18} /> תצוגת משמרות (מתעדכן אוטומטית)
          </h4>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'", "א' (יציאה)"].map(day => {
              const state = activeDays[day] || 'off';
              let bg = 'rgba(255,255,255,0.05)';
              let border = 'rgba(255,255,255,0.1)';
              let color = 'var(--text-secondary)';
              
              if (state === 'full') {
                bg = 'rgba(99, 102, 241, 0.2)';
                border = 'var(--primary-color)';
                color = 'white';
              } else if (state === 'half_morning' || state === 'half_evening') {
                bg = 'rgba(245, 158, 11, 0.2)';
                border = '#F59E0B';
                color = '#FCD34D';
              }

              return (
                <div
                  key={day}
                  style={{
                    flex: 1, minWidth: '45px', padding: '0.75rem 0', borderRadius: '4px', fontSize: '0.9rem', fontWeight: 'bold',
                    border: '1px solid', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: bg,
                    borderColor: border,
                    color: color,
                    transition: 'all 0.2s',
                    opacity: state === 'off' ? 0.5 : 1
                  }}
                  title={state === 'full' ? "יום שלם" : (state.includes('half') ? "חצי יום" : "לא משובץ")}
                >
                  <span style={{ whiteSpace: 'nowrap' }}>{day}</span>
                  {state === 'half_morning' && <span style={{ fontSize: '0.65rem', marginTop: '0.2rem' }}>בוקר</span>}
                  {state === 'half_evening' && <span style={{ fontSize: '0.65rem', marginTop: '0.2rem' }}>ערב</span>}
                </div>
              );
            })}
          </div>
        </div>
        
        {/* אמצע שבוע */}
        <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid var(--border-color)', opacity: includeMidweek ? 1 : 0.4 }}>
          <h4 style={{ marginBottom: '1rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CalendarDays size={18} /> אמצע שבוע (א' צהריים - ד')
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Users size={16} /> מפלס״ם</label>
              <input type="number" className="input-field" min="0" value={midweekPlasam} onChange={(e) => setMidweekPlasam(e.target.value)} placeholder="לדוגמה: 3" required={includeMidweek} disabled={!includeMidweek} />
            </div>
          </div>
        </div>

        {/* סופ"ש */}
        <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem', border: '1px solid var(--border-color)', opacity: includeWeekend ? 1 : 0.4 }}>
          <h4 style={{ marginBottom: '1rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CalendarDays size={18} /> סוף שבוע (ה' - א' בוקר)
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Users size={16} /> מפלס״ם</label>
              <input type="number" className="input-field" min="0" value={weekendPlasam} onChange={(e) => setWeekendPlasam(e.target.value)} placeholder="לדוגמה: 1" required={includeWeekend} disabled={!includeWeekend} />
            </div>
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

        <button type="submit" className="btn" style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }} disabled={loading}>
          <Save size={20} />
          {loading ? 'שומר נתונים...' : 'עדכן דרישה לשבוע הקרוב'}
        </button>
      </form>
    </div>
  );
};

export default KitchenScreen;
