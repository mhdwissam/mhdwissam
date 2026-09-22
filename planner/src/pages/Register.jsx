import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../lib/actions.js';
import { GOVERNORATES, SOURCES } from '../lib/constants.js';
import { Alert, Field } from '../components/ui.jsx';

export default function Register() {
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', phone: '', password: '', source: '', sourceOther: '', governorate: '', gpa: '', contactConsent: false });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const r = await register(f);
    setBusy(false);
    if (!r.ok) return setError(r);
    nav('/plan', { replace: true });
  };

  return (
    <div className="auth">
      <h1>حساب جديد</h1>
      <form className="card" onSubmit={submit}>
        <Field label="الاسم الكامل">
          <input value={f.name} onChange={set('name')} autoComplete="name" />
        </Field>
        <Field label="رقم الموبايل" hint="بالصيغة 09XXXXXXXX">
          <input inputMode="numeric" dir="ltr" placeholder="09XXXXXXXX" value={f.phone} onChange={set('phone')} autoComplete="tel" />
        </Field>
        <Field label="كلمة السر" hint="6 أحرف أو أكثر">
          <input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" />
        </Field>
        <Field label="مصدرك الدراسي">
          <select value={f.source} onChange={set('source')}>
            <option value="">اختر…</option>
            {SOURCES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        </Field>
        {f.source === 'other_platform' && (
          <Field label="اسم المنصة أو التطبيق">
            <input value={f.sourceOther} onChange={set('sourceOther')} />
          </Field>
        )}
        <Field label="المحافظة">
          <select value={f.governorate} onChange={set('governorate')}>
            <option value="">اختر…</option>
            {GOVERNORATES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="معدلك (%)">
          <input inputMode="decimal" dir="ltr" placeholder="مثال: 92.5" value={f.gpa} onChange={set('gpa')} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={f.contactConsent} onChange={set('contactConsent')} />
          <span>موافق إن فريق ميدكس يتواصل معي هاتفياً</span>
        </label>
        <p className="note">ℹ️ اسمك رح يظهر بالترتيب لزملائك.</p>

        {error && (
          <Alert tone="error">
            {error.error}
            {error.code === 'duplicate' && (
              <div><Link className="btn btn-sm" to="/login" state={{ phone: f.phone }}>سجّل دخول</Link></div>
            )}
          </Alert>
        )}
        <button className="btn btn-primary btn-block" disabled={busy}>تسجيل</button>
        <p className="center small">عندك حساب؟ <Link to="/login">دخول</Link></p>
      </form>
    </div>
  );
}
