import { useEffect } from 'react';
import { DAY_NAMES, WEEK_ORDER } from '../lib/dates.js';

export function Alert({ tone = 'info', children }) {
  if (!children) return null;
  return <div className={`alert alert-${tone}`}>{children}</div>;
}

export function Badge({ tone = 'muted', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Progress({ value, tone = 'blue' }) {
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <div className="progress">
      <div className={`progress-bar tone-${tone}`} style={{ width: `${v * 100}%` }} />
    </div>
  );
}

export function DayPicker({ value, onChange, disabled }) {
  const toggle = (d) => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d]);
  return (
    <div className="daypicker">
      {WEEK_ORDER.map((d) => (
        <button type="button" key={d} disabled={disabled} className={value.includes(d) ? 'on' : ''} onClick={() => toggle(d)}>
          {DAY_NAMES[d]}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="إغلاق">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function daysText(days) {
  return WEEK_ORDER.filter((d) => days.includes(d)).map((d) => DAY_NAMES[d]).join('، ');
}
