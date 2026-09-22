import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../../hooks.js';
import { saveSubject } from '../../lib/actions.js';
import { chaptersOf } from '../../lib/engine.js';
import { Alert, Badge, DayPicker, Field, daysText } from '../../components/ui.jsx';

export default function Content({ me }) {
  const { s } = useStore();
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', semester: 1, order: s.subjects.length + 1, suggestedDays: [] });
  const [error, setError] = useState('');
  const subjects = [...s.subjects].sort((a, b) => a.semester - b.semester || a.order - b.order);

  const add = (e) => {
    e.preventDefault();
    const r = saveSubject(me.id, { ...f, visible: false });
    if (!r.ok) return setError(r.error);
    nav(`/admin/subject/${r.subject.id}`);
  };

  return (
    <div className="stack">
      <div className="row between wrap">
        <h2>المواد والمحتوى</h2>
        <span className="muted small">السنة الدراسية {s.calendar.academicYear}</span>
      </div>
      <div className="table-wrap card">
        <table>
          <thead>
            <tr><th>المادة</th><th>الفصل الدراسي</th><th>الترتيب</th><th>الأيام المقترحة</th><th>فصول (أساسي/مراجعة)</th><th>طلاب</th><th>الحالة</th><th /></tr>
          </thead>
          <tbody>
            {subjects.map((x) => (
              <tr key={x.id}>
                <td><strong>{x.name}</strong></td>
                <td>{x.semester === 1 ? 'الأول' : 'الثاني'}</td>
                <td>{x.order}</td>
                <td className="small">{daysText(x.suggestedDays)}</td>
                <td>{chaptersOf(s, x.id, 'main').length} / {chaptersOf(s, x.id, 'review').length}</td>
                <td>{s.plans.filter((p) => p.subjectId === x.id).length}</td>
                <td>{x.visible ? <Badge tone="green">ظاهرة</Badge> : <Badge tone="muted">مخفية</Badge>}</td>
                <td><Link className="btn btn-sm" to={`/admin/subject/${x.id}`}>تعديل</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="card" onSubmit={add}>
        <h3>إضافة مادة</h3>
        <div className="grid-3">
          <Field label="اسم المادة"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="الفصل الدراسي">
            <select value={f.semester} onChange={(e) => setF({ ...f, semester: Number(e.target.value) })}>
              <option value={1}>الأول</option><option value={2}>الثاني</option>
            </select>
          </Field>
          <Field label="الترتيب"><input type="number" value={f.order} onChange={(e) => setF({ ...f, order: e.target.value })} /></Field>
        </div>
        <Field label="أيام الدراسة المقترحة">
          <DayPicker value={f.suggestedDays} onChange={(d) => setF({ ...f, suggestedDays: d })} />
        </Field>
        <p className="small muted">تُضاف المادة مخفية. أضف فصولها ومهامها، ثم أظهرها للطلاب.</p>
        <Alert tone="error">{error}</Alert>
        <button className="btn btn-primary">إضافة وفتح المادة</button>
      </form>
    </div>
  );
}
