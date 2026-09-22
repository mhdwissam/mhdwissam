import { useState } from 'react';
import { clearAll, isDemoClock, setDemoToday, setState } from '../lib/store.js';
import { buildSeed } from '../lib/seed.js';
import { askConfirm } from './confirm.jsx';
import { useStore } from '../hooks.js';
import { addDays, dayLabel, realToday } from '../lib/dates.js';

// Testing aid for the prototype only: move "today" to try daily recalculation,
// review weeks and post-exam behaviour, or restore the demo data.
export default function DemoBar() {
  const { today } = useStore();
  const [open, setOpen] = useState(false);
  const shifted = isDemoClock();

  const reset = async () => {
    if (!(await askConfirm('إعادة كل البيانات التجريبية لحالتها الأولى؟ سيُحذف كل ما أدخلته.', 'إعادة البيانات'))) return;
    clearAll();
    location.hash = '#/';
    setState(await buildSeed(realToday()));
    setOpen(false);
  };

  return (
    <div className={`demobar ${shifted ? 'shifted' : ''}`}>
      <button className="demobar-toggle" onClick={() => setOpen(!open)}>
        🧪 نسخة تجريبية · اليوم: {dayLabel(today)} {open ? '▲' : '▼'}
      </button>
      {open && (
        <div className="demobar-body">
          <label>
            غيّر تاريخ اليوم للتجربة:
            <input type="date" value={today} onChange={(e) => e.target.value && setDemoToday(e.target.value)} />
          </label>
          <div className="row gap wrap">
            <button className="btn btn-sm" onClick={() => setDemoToday(addDays(today, 1))}>اليوم التالي ←</button>
            <button className="btn btn-sm" onClick={() => setDemoToday(addDays(today, 7))}>بعد أسبوع</button>
            {shifted && <button className="btn btn-sm" onClick={() => setDemoToday(null)}>رجوع لتاريخ اليوم الحقيقي ({dayLabel(realToday())})</button>}
            <button className="btn btn-sm btn-danger-ghost" onClick={reset}>إعادة البيانات التجريبية</button>
          </div>
          <p className="muted small">هذا الشريط للتجربة فقط وليس جزءاً من التطبيق.</p>
        </div>
      )}
    </div>
  );
}
