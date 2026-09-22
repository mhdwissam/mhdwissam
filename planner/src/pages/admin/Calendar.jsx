import { useState } from 'react';
import { useStore } from '../../hooks.js';
import { saveCalendar, setExamDate } from '../../lib/actions.js';
import { examPeriodStart, reviewStart } from '../../lib/engine.js';
import { addDays, prettyDate, weekday } from '../../lib/dates.js';
import { Alert, Badge, Field } from '../../components/ui.jsx';

export default function Calendar({ me }) {
  const { s } = useStore();
  const [f, setF] = useState({ academicYear: s.calendar.academicYear, semesterEnd: { ...s.calendar.semesterEnd } });
  const [msg, setMsg] = useState(null);
  const subjects = [...s.subjects].sort((a, b) => a.semester - b.semester || a.order - b.order);

  const saveCal = (e) => {
    e.preventDefault();
    const r = saveCalendar(me.id, f);
    setMsg(r.ok ? { tone: 'success', text: 'تم الحفظ. الطلاب الذين يستخدمون التاريخ المقترح تحدّثت خططهم، ووصل إشعار للجميع.' } : { tone: 'error', text: r.error });
  };

  return (
    <div className="stack">
      <h2>التقويم والامتحانات</h2>
      <form className="card" onSubmit={saveCal}>
        <h3>السنة والفصلان الدراسيان</h3>
        <div className="grid-3">
          <Field label="السنة الدراسية"><input value={f.academicYear} onChange={(e) => setF({ ...f, academicYear: e.target.value })} /></Field>
          <Field label="نهاية الكورس الأساسي المقترحة — الفصل الأول">
            <input type="date" value={f.semesterEnd[1]} onChange={(e) => setF({ ...f, semesterEnd: { ...f.semesterEnd, 1: e.target.value } })} />
          </Field>
          <Field label="نهاية الكورس الأساسي المقترحة — الفصل الثاني">
            <input type="date" value={f.semesterEnd[2]} onChange={(e) => setF({ ...f, semesterEnd: { ...f.semesterEnd, 2: e.target.value } })} />
          </Field>
        </div>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <button className="btn btn-primary">حفظ</button>
      </form>

      <div className="card">
        <h3>بداية فترة الامتحانات</h3>
        {[1, 2].map((sem) => {
          const eps = examPeriodStart(s, sem);
          return (
            <p key={sem}>
              الفصل {sem === 1 ? 'الأول' : 'الثاني'}:{' '}
              {eps ? <><strong>{prettyDate(eps)}</strong> <span className="muted small">(يُغلق الكورس الأساسي لكل مواد الفصل ابتداءً من هذا اليوم)</span></> : <span className="muted">لم تُحدد تواريخ امتحانات بعد</span>}
            </p>
          );
        })}
      </div>

      <div className="card table-wrap">
        <h3>تواريخ الامتحانات</h3>
        <table>
          <thead><tr><th>المادة</th><th>الفصل</th><th>تاريخ الامتحان</th><th>أسبوع المراجعة</th></tr></thead>
          <tbody>
            {subjects.map((x) => <ExamRow key={x.id} me={me} subj={x} />)}
          </tbody>
        </table>
        <p className="small muted">أسبوع المراجعة = الأيام الستة التي تسبق الامتحان. تأجيل امتحان ينقل أسبوع مراجعته ويصل إشعار لطلاب المادة.</p>
      </div>
    </div>
  );
}

function ExamRow({ me, subj }) {
  const { s } = useStore();
  const [d, setD] = useState(subj.examDate || '');
  const rs = reviewStart(s, subj);
  const dirty = (subj.examDate || '') !== d;
  return (
    <tr>
      <td>{subj.name} {!subj.visible && <Badge>مخفية</Badge>}</td>
      <td>{subj.semester === 1 ? 'الأول' : 'الثاني'}</td>
      <td className="nowrap">
        <input type="date" value={d} onChange={(e) => setD(e.target.value)} />
        {dirty && <button className="btn btn-sm btn-primary" onClick={() => setExamDate(me.id, subj.id, d)}>حفظ</button>}
        {d && weekday(d) !== 6 && <div className="small txt-warn">تنبيه: التاريخ ليس يوم سبت</div>}
      </td>
      <td className="small">{rs ? `${prettyDate(rs)} ← ${prettyDate(addDays(subj.examDate, -1))}` : 'موعد الامتحان لم يُحدد بعد'}</td>
    </tr>
  );
}
