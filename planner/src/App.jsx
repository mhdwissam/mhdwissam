import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { getState, setState, today } from './lib/store.js';
import { buildSeed } from './lib/seed.js';
import { useMe } from './hooks.js';
import Shell from './components/Shell.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Home from './pages/Home.jsx';
import Plan from './pages/Plan.jsx';
import Subject from './pages/Subject.jsx';
import Ranking from './pages/Ranking.jsx';
import Inbox from './pages/Inbox.jsx';
import AdminContent from './pages/admin/Content.jsx';
import AdminSubject from './pages/admin/SubjectEditor.jsx';
import AdminCalendar from './pages/admin/Calendar.jsx';
import AdminWeak from './pages/admin/Weak.jsx';

export default function App() {
  const [ready, setReady] = useState(!!getState());
  useEffect(() => {
    if (ready) return;
    buildSeed(today()).then((s) => {
      setState(s);
      setReady(true);
    });
  }, [ready]);
  if (!ready) return <div className="splash">جاري تجهيز البيانات التجريبية…</div>;
  return <Routed />;
}

function Routed() {
  const me = useMe();
  if (!me) {
    return (
      <Shell>
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="*" element={<Login />} />
        </Routes>
      </Shell>
    );
  }
  if (me.role === 'admin') {
    return (
      <Shell me={me}>
        <Routes>
          <Route path="/admin" element={<AdminContent me={me} />} />
          <Route path="/admin/subject/:id" element={<AdminSubject me={me} />} />
          <Route path="/admin/calendar" element={<AdminCalendar me={me} />} />
          <Route path="/admin/weak" element={<AdminWeak me={me} />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </Shell>
    );
  }
  return (
    <Shell me={me}>
      <Routes>
        <Route path="/" element={<Home me={me} />} />
        <Route path="/plan" element={<Plan me={me} />} />
        <Route path="/subject/:id" element={<Subject me={me} />} />
        <Route path="/rank" element={<Ranking me={me} />} />
        <Route path="/inbox" element={<Inbox me={me} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
