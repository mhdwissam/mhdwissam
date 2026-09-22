import { useSyncExternalStore } from 'react';
import { Modal } from './ui.jsx';

// In-page replacement for window.confirm (blocked in some embedded viewers).
let pending = null;
const subs = new Set();
const emit = () => subs.forEach((f) => f());

export function askConfirm(message, okLabel = 'تأكيد') {
  return new Promise((resolve) => {
    pending = { message, okLabel, resolve };
    emit();
  });
}

function close(value) {
  const p = pending;
  pending = null;
  emit();
  p?.resolve(value);
}

export function ConfirmHost() {
  const p = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => pending);
  if (!p) return null;
  return (
    <Modal title="تأكيد" onClose={() => close(false)}>
      <p style={{ whiteSpace: 'pre-line' }}>{p.message}</p>
      <div className="row gap">
        <button className="btn btn-primary" onClick={() => close(true)}>{p.okLabel}</button>
        <button className="btn" onClick={() => close(false)}>إلغاء</button>
      </div>
    </Modal>
  );
}
