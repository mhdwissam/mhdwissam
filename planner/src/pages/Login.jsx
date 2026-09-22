import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { login } from '../lib/actions.js';
import { Alert, Field } from '../components/ui.jsx';
import { DEMO_ADMIN, DEMO_STUDENT } from '../lib/seed.js';

export default function Login() {
  const loc = useLocation();
  const nav = useNavigate();
  const [phone, setPhone] = useState(loc.state?.phone || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const r = await login(phone, password);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    nav(r.user.role === 'admin' ? '/admin' : '/', { replace: true });
  };

  return (
    <div className="auth">
      <h1>أهلاً فيك 👋</h1>
      <p className="muted">اعرف قديش لازم تدرس كل يوم، ووين صرت بخطتك.</p>
      <form className="card" onSubmit={submit}>
        <Field label="رقم الموبايل">
          <input inputMode="numeric" dir="ltr" placeholder="09XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="username" />
        </Field>
        <Field label="كلمة السر">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        <Alert tone="error">{error}</Alert>
        <button className="btn btn-primary btn-block" disabled={busy}>دخول</button>
        <p className="center small">ما عندك حساب؟ <Link to="/register">حساب جديد</Link></p>
      </form>

      <details className="demo-creds">
        <summary>حسابات تجريبية</summary>
        <p>طالب: <code dir="ltr">{DEMO_STUDENT.phone}</code> / <code dir="ltr">{DEMO_STUDENT.password}</code></p>
        <p>المدير: <code dir="ltr">{DEMO_ADMIN.phone}</code> / <code dir="ltr">{DEMO_ADMIN.password}</code></p>
      </details>
    </div>
  );
}
