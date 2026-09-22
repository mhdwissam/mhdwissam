import { NavLink, useLocation } from 'react-router-dom';
import { logout } from '../lib/actions.js';
import { useStore } from '../hooks.js';
import DemoBar from './DemoBar.jsx';

const STUDENT_NAV = [
  { to: '/', label: 'الرئيسية', icon: '🏠', end: true },
  { to: '/plan', label: 'خطتي', icon: '🗓️' },
  { to: '/rank', label: 'الترتيب', icon: '🏆' },
  { to: '/inbox', label: 'الإشعارات', icon: '🔔', badge: true },
];

const ADMIN_NAV = [
  { to: '/admin', label: 'المحتوى', end: true },
  { to: '/admin/calendar', label: 'التقويم والامتحانات' },
  { to: '/admin/weak', label: 'الطلاب الضعاف' },
];

export default function Shell({ me, children }) {
  const { s } = useStore();
  const loc = useLocation();
  const unread = me ? s.messages.filter((m) => m.studentId === me.id && !m.read).length : 0;
  const isAdmin = me?.role === 'admin';

  return (
    <div className={`app ${isAdmin ? 'app-admin' : 'app-student'}`}>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark">م</span>
            <div>
              <strong>مخطِّط الدراسة</strong>
              <small>بروفيسور ميدكس · السنة التحضيرية</small>
            </div>
          </div>
          {me && (
            <div className="topbar-actions">
              <span className="who">{isAdmin ? 'المدير' : me.name}</span>
              <button className="btn btn-ghost btn-sm" onClick={logout}>خروج</button>
            </div>
          )}
        </div>
        {isAdmin && (
          <nav className="admin-tabs">
            {ADMIN_NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) =>
                isActive || (n.to === '/admin' && loc.pathname.startsWith('/admin/subject')) ? 'active' : ''}>
                {n.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <DemoBar />

      <main className="page">{children}</main>

      {me && !isAdmin && (
        <nav className="bottomnav">
          {STUDENT_NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span className="nav-icon">
                {n.icon}
                {n.badge && unread > 0 && <span className="dot">{unread}</span>}
              </span>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
