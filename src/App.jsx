import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { ChefHat, Users, ClipboardCheck, LogOut } from 'lucide-react';
import './index.css';

// פלייסהולדרים למסכים שניצור בהמשך
const LoginScreen = () => (
  <div className="animate-fade-in glass-panel" style={{ maxWidth: '400px', margin: '10vh auto' }}>
    <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>התחברות למערכת תורנויות</h1>
    <div className="input-group">
      <label className="input-label">שם משתמש / אימייל</label>
      <input type="text" className="input-field" placeholder="הזן את האימייל שלך" />
    </div>
    <div className="input-group">
      <label className="input-label">סיסמה</label>
      <input type="password" className="input-field" placeholder="הזן סיסמה" />
    </div>
    <Link to="/kitchen" style={{ textDecoration: 'none' }}>
      <button className="btn" style={{ width: '100%' }}>התחבר</button>
    </Link>
  </div>
);

const DashboardLayout = ({ children, title, icon: Icon }) => (
  <div className="app-container animate-fade-in">
    <header className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', padding: '1rem 2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Icon size={28} color="var(--primary-color)" />
        <h2>{title}</h2>
      </div>
      <nav style={{ display: 'flex', gap: '1rem' }}>
        <Link to="/kitchen" className="btn btn-secondary"><ChefHat size={18}/> מטבח</Link>
        <Link to="/departments" className="btn btn-secondary"><Users size={18}/> מחלקות</Link>
        <Link to="/manager" className="btn btn-secondary"><ClipboardCheck size={18}/> מנהל</Link>
        <Link to="/" className="btn btn-secondary" style={{ borderColor: 'var(--danger-color)', color: 'var(--danger-color)' }}><LogOut size={18}/> יציאה</Link>
      </nav>
    </header>
    <main>
      {children}
    </main>
  </div>
);

const KitchenScreen = () => (
  <DashboardLayout title="ניהול דרישות מטבח" icon={ChefHat}>
    <div className="glass-panel">
      <h3>דרישת תורנים למחר</h3>
      <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>כאן נוסיף טופס למטבח שיאפשר להזין כמה תורנים הם צריכים בכל משמרת.</p>
    </div>
  </DashboardLayout>
);

const DepartmentsScreen = () => (
  <DashboardLayout title="הזנת סד״כ מחלקות" icon={Users}>
    <div className="glass-panel">
      <h3>מצב כוח אדם ופטורים</h3>
      <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>כאן המחלקות יזינו אילו עובדים זמינים, ואת מי אי אפשר לשבץ (אילוצים/פטורים).</p>
    </div>
  </DashboardLayout>
);

const ManagerScreen = () => (
  <DashboardLayout title="ניהול ושיבוץ תורנויות" icon={ClipboardCheck}>
    <div className="glass-panel">
      <h3>תמונת מצב יומית ושיבוץ</h3>
      <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>המסך של האחראי. כאן הוא יראה את דוח ה-PDF עם כל הנתונים, יאשר ויפעיל את אלגוריתם השיבוץ.</p>
    </div>
  </DashboardLayout>
);

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginScreen />} />
        <Route path="/kitchen" element={<KitchenScreen />} />
        <Route path="/departments" element={<DepartmentsScreen />} />
        <Route path="/manager" element={<ManagerScreen />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
