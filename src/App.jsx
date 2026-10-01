import React, { useState } from 'react';
import { HashRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { ChefHat, Users, ClipboardCheck, LogOut } from 'lucide-react';
import './index.css';
import KitchenScreenComponent from './pages/KitchenScreen';

import DepartmentsScreenComponent from './pages/DepartmentsScreen';
import ManagerScreenComponent from './pages/ManagerScreen';

// מסך בחירת תפקיד (ללא סיסמאות בינתיים)
const LoginScreen = () => {
  const [showDepartments, setShowDepartments] = useState(false);

  return (
    <div className="animate-fade-in glass-panel" style={{ maxWidth: '500px', margin: '15vh auto', textAlign: 'center' }}>
      <h1 style={{ marginBottom: '1rem', fontSize: '2.5rem' }}>מערכת תורנויות מטבח</h1>
      
      {!showDepartments ? (
        <>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem', fontSize: '1.1rem' }}>בחר את התפקיד שלך כדי להיכנס למערכת:</p>
          <div style={{ display: 'grid', gap: '1.2rem' }}>
            <Link to="/kitchen" style={{ textDecoration: 'none' }}>
              <button className="btn" style={{ width: '100%', padding: '1.2rem', fontSize: '1.2rem' }}>
                <ChefHat size={24} style={{ marginLeft: '10px' }} />
                כניסה כטבח (דרישות מטבח)
              </button>
            </Link>
            
            <button className="btn" onClick={() => setShowDepartments(true)} style={{ width: '100%', padding: '1.2rem', fontSize: '1.2rem', backgroundColor: 'var(--secondary-color)' }}>
              <Users size={24} style={{ marginLeft: '10px' }} />
              כניסה כסמל (הזנת סד״כ)
            </button>
            
            <Link to="/manager" style={{ textDecoration: 'none' }}>
              <button className="btn btn-secondary" style={{ width: '100%', padding: '1.2rem', fontSize: '1.2rem', backgroundColor: 'rgba(255,255,255,0.05)' }}>
                <ClipboardCheck size={24} style={{ marginLeft: '10px' }} />
                כניסה כמנהל (שיבוץ)
              </button>
            </Link>
          </div>
        </>
      ) : (
        <>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '1.1rem' }}>בחר את המחלקה שלך:</p>
          <div style={{ display: 'grid', gap: '1rem' }}>
            {['תקשוב', 'לוגיסטיקה', 'טנ"א', 'משא"ן', 'אג"ם'].map(dep => (
              <Link key={dep} to={`/departments?name=${encodeURIComponent(dep)}`} style={{ textDecoration: 'none' }}>
                <button className="btn btn-secondary" style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', backgroundColor: 'rgba(255,255,255,0.05)' }}>
                  סמל {dep}
                </button>
              </Link>
            ))}
            <button onClick={() => setShowDepartments(false)} style={{ marginTop: '0.5rem', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', textDecoration: 'underline' }}>
              חזור לתפריט הראשי
            </button>
          </div>
        </>
      )}
    </div>
  );
};

const DashboardLayout = ({ children, title, icon: Icon }) => {
  const location = useLocation();
  const getNavClass = (path) => location.pathname === path ? "btn" : "btn btn-secondary";
  
  return (
    <div className="app-container animate-fade-in">
      <header className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', padding: '1rem 2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Icon size={28} color="var(--primary-color)" />
          <h2>{title}</h2>
        </div>
        <nav style={{ display: 'flex', gap: '1rem' }}>
          <Link to="/kitchen" className={getNavClass('/kitchen')}><ChefHat size={18}/> מטבח</Link>
          <Link to="/departments" className={getNavClass('/departments')}><Users size={18}/> מחלקות</Link>
          <Link to="/manager" className={getNavClass('/manager')}><ClipboardCheck size={18}/> מנהל</Link>
          <Link to="/" className="btn btn-secondary" style={{ borderColor: 'var(--danger-color)', color: 'var(--danger-color)' }}><LogOut size={18}/> יציאה</Link>
        </nav>
      </header>
      <main>
        {children}
      </main>
    </div>
  );
};

const KitchenScreen = () => (
  <DashboardLayout title="ניהול דרישות מטבח" icon={ChefHat}>
    <KitchenScreenComponent />
  </DashboardLayout>
);

const DepartmentsScreen = () => (
  <DashboardLayout title="הזנת סד״כ מחלקות" icon={Users}>
    <DepartmentsScreenComponent />
  </DashboardLayout>
);

const ManagerScreen = () => (
  <DashboardLayout title="בקרה ושיבוץ תורנויות" icon={ClipboardCheck}>
    <ManagerScreenComponent />
  </DashboardLayout>
);

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<LoginScreen />} />
        <Route path="/kitchen" element={<KitchenScreen />} />
        <Route path="/departments" element={<DepartmentsScreen />} />
        <Route path="/manager" element={<ManagerScreen />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
