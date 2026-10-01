import React, { useState } from 'react';
import { ChefHat, Save, Users, CalendarDays, AlertTriangle } from 'lucide-react';
import { db } from '../firebase/firebase';
import { doc, setDoc, serverTimestamp, deleteDoc, getDocs, collection } from 'firebase/firestore';

const KitchenScreen = () => {
  // אמצע שבוע
  const [midweekPlasam, setMidweekPlasam] = useState('');
  const [midweekAgam, setMidweekAgam] = useState('');
  
  // סופ"ש
  const [weekendPlasam, setWeekendPlasam] = useState('');
  const [weekendAgam, setWeekendAgam] = useState('');
  
  const [activeDays, setActiveDays] = useState({
    "א'": 'full', "ב'": 'full', "ג'": 'full', "ד'": 'full', "ה'": 'full', "ו'": 'full', "ש'": 'full'
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const toggleDay = (day) => {
    setActiveDays(prev => {
      const current = prev[day];
      let next = 'off';
      if (current === 'off') next = 'half';
      else if (current === 'half') next = 'full';
      else if (current === 'full') next = 'off';
      return { ...prev, [day]: next };
    });
  };

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
        activeDays: activeDays,
        midweek: { plasam: parseInt(midweekPlasam || 0), agam: parseInt(midweekAgam || 0) },
        weekend: { plasam: parseInt(weekendPlasam || 0), agam: parseInt(weekendAgam || 0) },
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
        style={{ position: 'absolute', top: '1rem', left: '1rem', backgroundColor: 'transparent', border: '1px solid var(--danger-color)', color: 'var(--danger-color)', padding: '0.5rem 1rem', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
        title="מוחק את כל נתוני המטבח והסמלים לשבוע הנוכחי"
      >
        <AlertTriangle size={16} /> איפוס מצב חירום
      </button>

      <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.5rem' }}>
        <ChefHat color="var(--primary-color)" /> דרישת תורנים שבועית (מטבח)
      </h3>
      
      <form onSubmit={handleSubmit}>
        
        {/* בחירת ימי שיבוץ */}
        <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid var(--border-color)' }}>
          <h4 style={{ marginBottom: '1rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CalendarDays size={18} /> בחר משמרות לשיבוץ
          </h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem', marginTop: '-0.5rem' }}>
            לחץ על יום כדי לשנות מצב: <strong>מלא (כחול)</strong> ➡️ <strong>לא פעיל (אפור)</strong> ➡️ <strong>חצי בוקר (כתום)</strong>
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"].map(day => {
              const state = activeDays[day];
              let bg = 'rgba(255,255,255,0.05)';
              let border = 'rgba(255,255,255,0.1)';
              let color = 'var(--text-secondary)';
              
              if (state === 'full') {
                bg = 'rgba(99, 102, 241, 0.2)';
                border = 'var(--primary-color)';
                color = 'white';
              } else if (state === 'half') {
                bg = 'rgba(245, 158, 11, 0.2)'; // Orangeish
                border = '#F59E0B';
                color = '#FCD34D';
              }

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  style={{
                    flex: 1, minWidth: '45px', padding: '0.75rem 0', borderRadius: '4px', fontSize: '1rem', fontWeight: 'bold',
                    border: '1px solid', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: bg,
                    borderColor: border,
                    color: color,
                    transition: 'all 0.2s'
                  }}
                  title={state === 'full' ? "יום שלם" : (state === 'half' ? "חצי בוקר בלבד" : "לא משובץ")}
                >
                  {day}
                  {state === 'half' && <span style={{ fontSize: '0.65rem', marginTop: '0.2rem' }}>בוקר</span>}
                </button>
              );
            })}
          </div>
        </div>
        
        {/* אמצע שבוע */}
        <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid var(--border-color)' }}>
          <h4 style={{ marginBottom: '1rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CalendarDays size={18} /> אמצע שבוע (א'-ה')
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Users size={16} /> מפלס״ם</label>
              <input type="number" className="input-field" min="0" value={midweekPlasam} onChange={(e) => setMidweekPlasam(e.target.value)} placeholder="לדוגמה: 3" required />
            </div>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Users size={16} /> מאג״ם</label>
              <input type="number" className="input-field" min="0" value={midweekAgam} onChange={(e) => setMidweekAgam(e.target.value)} placeholder="לדוגמה: 2" required />
            </div>
          </div>
        </div>

        {/* סופ"ש */}
        <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem', border: '1px solid var(--border-color)' }}>
          <h4 style={{ marginBottom: '1rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CalendarDays size={18} /> סוף שבוע (ו'-ש')
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Users size={16} /> מפלס״ם</label>
              <input type="number" className="input-field" min="0" value={weekendPlasam} onChange={(e) => setWeekendPlasam(e.target.value)} placeholder="לדוגמה: 1" required />
            </div>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Users size={16} /> מאג״ם</label>
              <input type="number" className="input-field" min="0" value={weekendAgam} onChange={(e) => setWeekendAgam(e.target.value)} placeholder="לדוגמה: 1" required />
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
