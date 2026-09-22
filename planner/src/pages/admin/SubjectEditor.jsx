import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStore } from '../../hooks.js';
import {
  copyMainToReview, deleteChapter, deleteTemplate, saveChapter, saveSubject, saveTemplate, subjectVisibilityProblem,
} from '../../lib/actions.js';
import { chaptersOf, subjectById, templatesOf } from '../../lib/engine.js';
import { COURSE_LABEL, TASK_TYPES, dur } from '../../lib/constants.js';
import { Alert, Badge, DayPicker, Field } from '../../components/ui.jsx';

export default function SubjectEditor({ me }) {
  const { id } = useParams();
  const { s } = useStore();
  const subj = subjectById(s, id);
  const [course, setCourse] = useState('main');
  const [msg, setMsg] = useState(null);
  if (!subj) return <p>المادة غير موجودة.</p>;
  const problem = subjectVisibilityProblem(s, id);
  const chapters = chaptersOf(s, id, course);

  const say = (r, okText) => setMsg(r.ok ? (r.warning ? { tone: 'warn', text: r.warning } : okText ? { tone: 'success', text: okText } : null) : { tone: 'error', text: r.error });

  return (
    <div className="stack">
      <Link to="/admin" className="small">→ كل المواد</Link>
      <div className="row between wrap">
        <h2>{subj.name}</h2>
        {subj.visible ? <Badge tone="green">ظاهرة للطلاب</Badge> : <Badge tone="muted">مخفية عن الطلاب</Badge>}
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      <SubjectForm me={me} subj={subj} problem={problem} onResult={say} />

      <div className="tabs">
        {['main', 'review'].map((c) => (
          <button key={c} className={course === c ? 'on' : ''} onClick={() => setCourse(c)}>
            {COURSE_LABEL[c]} ({chaptersOf(s, id, c).length})
          </button>
        ))}
      </div>

      {course === 'review' && !chapters.length && chaptersOf(s, id, 'main').length > 0 && (
        <button className="btn" onClick={() => say(copyMainToReview(me.id, id), 'نُسخ الكورس الأساسي ككورس مراجعة مطابق.')}>انسخ الكورس الأساسي ككورس مراجعة مطابق</button>
      )}

      {chapters.map((c) => <ChapterEditor key={c.id} me={me} chapter={c} onResult={say} />)}
      <NewChapter me={me} subjectId={id} course={course} nextOrder={chapters.length + 1} onResult={say} />
    </div>
  );
}

function SubjectForm({ me, subj, problem, onResult }) {
  const [f, setF] = useState(subj);
  useEffect(() => setF(subj), [subj]);
  const save = (visible = f.visible) => {
    const r = saveSubject(me.id, { ...f, visible });
    onResult(r, 'تم حفظ المادة.');
  };
  return (
    <div className="card">
      <div className="grid-3">
        <Field label="اسم المادة"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="الفصل الدراسي">
          <select value={f.semester} onChange={(e) => setF({ ...f, semester: Number(e.target.value) })}>
            <option value={1}>الأول</option><option value={2}>الثاني</option>
          </select>
        </Field>
        <Field label="الترتيب"><input type="number" value={f.order} onChange={(e) => setF({ ...f, order: e.target.value })} /></Field>
      </div>
      <Field label="أيام الدراسة المقترحة" hint="عند التغيير: تتحدث أيام الطلاب الذين لم يغيّروا أيامهم، ويصل إشعار للجميع.">
        <DayPicker value={f.suggestedDays} onChange={(d) => setF({ ...f, suggestedDays: d })} />
      </Field>
      {problem && <Alert tone="warn">{problem}</Alert>}
      <div className="row gap wrap">
        <button className="btn btn-primary" onClick={() => save()}>حفظ</button>
        {subj.visible
          ? <button className="btn" onClick={() => save(false)}>إخفاء عن الطلاب</button>
          : <button className="btn" disabled={!!problem} onClick={() => save(true)}>إظهار للطلاب</button>}
      </div>
    </div>
  );
}

function ChapterEditor({ me, chapter, onResult }) {
  const { s } = useStore();
  const [f, setF] = useState(chapter);
  const [open, setOpen] = useState(false);
  useEffect(() => setF(chapter), [chapter]);
  const templates = templatesOf(s, chapter.id);
  const missingCycles = chapter.hasCycles && !templates.some((t) => t.type === 'cycles');
  const total = templates.reduce((a, t) => a + t.minutes, 0);

  return (
    <div className={`card chapter ${missingCycles ? 'edge-red' : ''}`}>
      <button className="chapter-head" onClick={() => setOpen(!open)}>
        <div>
          <strong>{chapter.order}. {chapter.name}</strong>
          <span className="small muted"> · {templates.length} مهام · {dur(total)} · حضور {dur(chapter.attendanceMinutes)}</span>
        </div>
        <div className="row gap">
          {chapter.hasCycles ? <Badge tone="blue">فيه دورات</Badge> : <Badge>بلا دورات</Badge>}
          {missingCycles && <Badge tone="red">ينقصه "حل دورات"</Badge>}
        </div>
      </button>
      {open && (
        <div className="stack-sm">
          <div className="grid-4">
            <Field label="اسم الفصل"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="الترتيب"><input type="number" value={f.order} onChange={(e) => setF({ ...f, order: e.target.value })} /></Field>
            <Field label="مدة الحضور (دقيقة)"><input type="number" value={f.attendanceMinutes} onChange={(e) => setF({ ...f, attendanceMinutes: e.target.value })} /></Field>
            <label className="check"><input type="checkbox" checked={f.hasCycles} onChange={(e) => setF({ ...f, hasCycles: e.target.checked })} /> <span>فيه دورات</span></label>
          </div>
          <div className="row gap">
            <button className="btn btn-sm" onClick={() => onResult(saveChapter(me.id, f), 'تم حفظ الفصل.')}>حفظ الفصل</button>
            <button className="btn btn-sm btn-danger-ghost" onClick={() => confirm('حذف الفصل ومهامه؟') && onResult(deleteChapter(me.id, chapter.id), 'تم حذف الفصل.')}>حذف الفصل</button>
          </div>
          <div className="table-wrap">
            <table className="compact">
              <thead><tr><th>المهمة</th><th>النوع</th><th>الوقت المقدّر (دقيقة)</th><th>الترتيب</th><th /></tr></thead>
              <tbody>
                {templates.map((t) => <TemplateRow key={t.id} me={me} t={t} onResult={onResult} />)}
                <TemplateRow me={me} t={{ chapterId: chapter.id, name: '', type: 'study', minutes: '', order: templates.length + 1 }} isNew onResult={onResult} />
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateRow({ me, t, isNew, onResult }) {
  const [f, setF] = useState(t);
  useEffect(() => { if (!isNew) setF(t); }, [t, isNew]);
  const dirty = isNew ? f.name || f.minutes : f.name !== t.name || f.type !== t.type || String(f.minutes) !== String(t.minutes) || String(f.order) !== String(t.order);
  const save = () => {
    const r = saveTemplate(me.id, f);
    onResult(r, isNew ? 'أُضيفت المهمة.' : 'تم حفظ المهمة. تغيّر وقتها بمهام الطلاب غير المنجزة فقط.');
    if (r.ok && isNew) setF(t);
  };
  return (
    <tr className={isNew ? 'new-row' : ''}>
      <td><input value={f.name} placeholder={isNew ? 'مهمة جديدة…' : ''} onChange={(e) => setF({ ...f, name: e.target.value })} /></td>
      <td>
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          {TASK_TYPES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      </td>
      <td><input type="number" className="num" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} /></td>
      <td><input type="number" className="num" value={f.order} onChange={(e) => setF({ ...f, order: e.target.value })} /></td>
      <td className="nowrap">
        {dirty && <button className="btn btn-sm btn-primary" onClick={save}>{isNew ? 'إضافة' : 'حفظ'}</button>}
        {!isNew && <button className="btn btn-sm btn-ghost" onClick={() => confirm('حذف المهمة؟') && onResult(deleteTemplate(me.id, t.id), 'حُذفت المهمة.')}>✕</button>}
      </td>
    </tr>
  );
}

function NewChapter({ me, subjectId, course, nextOrder, onResult }) {
  const empty = { name: '', order: nextOrder, attendanceMinutes: '', hasCycles: true };
  const [f, setF] = useState(empty);
  useEffect(() => setF((x) => ({ ...x, order: nextOrder })), [nextOrder]);
  const add = (e) => {
    e.preventDefault();
    const r = saveChapter(me.id, { ...f, subjectId, course });
    onResult(r, 'أُضيف الفصل. افتحه وأضف مهامه.');
    if (r.ok) setF({ ...empty, order: nextOrder + 1 });
  };
  return (
    <form className="card dashed" onSubmit={add}>
      <h4>إضافة فصل إلى {COURSE_LABEL[course]}</h4>
      <div className="grid-4">
        <Field label="اسم الفصل"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="الترتيب"><input type="number" value={f.order} onChange={(e) => setF({ ...f, order: e.target.value })} /></Field>
        <Field label="مدة الحضور (دقيقة)"><input type="number" value={f.attendanceMinutes} onChange={(e) => setF({ ...f, attendanceMinutes: e.target.value })} /></Field>
        <label className="check"><input type="checkbox" checked={f.hasCycles} onChange={(e) => setF({ ...f, hasCycles: e.target.checked })} /> <span>فيه دورات</span></label>
      </div>
      <p className="small muted">الفيديوهات التأسيسية والمقدمات: فصول بلا دورات.</p>
      <button className="btn btn-primary btn-sm">إضافة الفصل</button>
    </form>
  );
}
