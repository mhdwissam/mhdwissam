import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStore } from '../hooks.js';
import { canUndo, checkTaskInput, completeTask, scoreOf, syncStudent, undoTask } from '../lib/actions.js';
import {
  CHAPTER_STATUS, chapterStatus, chapterTasks, chaptersOf, phaseOf, planFor, subjectById, subjectStatus, COLOR_LABEL,
} from '../lib/engine.js';
import { prettyDate } from '../lib/dates.js';
import { COURSE_LABEL, dur, normalizeDigits, typeLabel } from '../lib/constants.js';
import { Alert, Badge, Modal, Progress } from '../components/ui.jsx';

export default function Subject({ me }) {
  const { id } = useParams();
  const { s, today } = useStore();
  useEffect(() => { syncStudent(me.id); }, [me.id, today]);
  const subj = subjectById(s, id);
  if (!subj || !subj.visible) return <p>المادة غير موجودة.</p>;
  const plan = planFor(s, me.id, id);
  const phase = phaseOf(s, subj, today);
  const st = subjectStatus(s, me.id, subj, today);

  let content;
  if (!plan) {
    content = <div className="card"><p>حدد مواعيد المادة أولاً حتى تظهر مهامها.</p><Link className="btn btn-primary" to={`/plan?subject=${id}`}>حدد مواعيدها</Link></div>;
  } else if (phase === 'after') {
    content = <div className="card center"><p className="farewell">منتمنالك التوفيق 🤍</p></div>;
  } else if (phase === 'closed') {
    content = (
      <div className="card">
        <p>أُغلق الكورس الأساسي لكل المواد مع بداية فترة الامتحانات.</p>
        <p>{st.reviewStart ? `مهام كورس المراجعة تظهر مع بداية أسبوع مراجعة المادة: ${prettyDate(st.reviewStart)}.` : 'موعد الامتحان لم يُحدد بعد.'}</p>
      </div>
    );
  } else {
    const course = phase === 'review' ? 'review' : 'main';
    content = (
      <>
        {st.kind === 'color' && (
          <div className="card">
            <div className="status-row">
              <span className={`status-pill tone-${st.color}`}>{COLOR_LABEL[st.color]}</span>
              <span className="small muted">إنجازك {Math.round(st.actual * 100)}% · المفروض {Math.round(st.expected * 100)}%</span>
            </div>
            <Progress value={st.actual} tone={st.color} />
          </div>
        )}
        {st.kind === 'notStarted' && <Alert tone="info">لم تبدأ بعد — تبدأ بتاريخ {prettyDate(plan.start)}. فيك تنجز مهام من الآن وتنحسبلك.</Alert>}
        {st.kind === 'expired' && <Alert tone="error">انتهى الموعد. <Link to={`/plan?subject=${id}`}>حدد تاريخاً جديداً أو أضف يوماً</Link></Alert>}
        {chaptersOf(s, id, course).map((c) => <Chapter key={c.id} me={me} chapter={c} />)}
      </>
    );
  }

  return (
    <div className="stack">
      <Link to="/" className="small">→ الرئيسية</Link>
      <div className="row between wrap">
        <h2>{subj.name}</h2>
        {plan && phase !== 'after' && <Badge tone="blue">{phase === 'review' ? COURSE_LABEL.review : COURSE_LABEL.main}</Badge>}
      </div>
      {!subj.examDate && <p className="small muted">موعد الامتحان لم يُحدد بعد.</p>}
      {phase === 'review' && <Alert tone="info">أسبوع المراجعة: ينتهي قبل الامتحان يوم {prettyDate(subj.examDate)}. المطلوب كل يوم {dur(st.perDay)} مهما كانت أيامك.</Alert>}
      {content}
    </div>
  );
}

function Chapter({ me, chapter }) {
  const { s, today } = useStore();
  const tasks = chapterTasks(s, me.id, chapter.id);
  const status = chapterStatus(s, me.id, chapter);
  const [open, setOpen] = useState(status === 'inProgress');
  const [finishing, setFinishing] = useState(null);
  const [note, setNote] = useState(null);
  const info = CHAPTER_STATUS[status];
  const doneCount = tasks.filter((t) => t.done).length;

  const undo = (t) => {
    if (!confirm(`التراجع عن "${t.name}"؟ سيُحذف الوقت المسجّل${t.type === 'cycles' ? ' ونتيجة الدورات' : ''}.`)) return;
    const r = undoTask(me.id, t.id);
    setNote(r.ok ? { tone: 'info', text: 'تم التراجع وأُعيد الحساب.' } : { tone: 'error', text: r.error });
  };

  return (
    <div className="card chapter">
      <button className="chapter-head" onClick={() => setOpen(!open)}>
        <div>
          <strong>{chapter.name}</strong>
          <span className="small muted"> · {doneCount}/{tasks.length} مهام{chapter.attendanceMinutes ? ` · حضور ${dur(chapter.attendanceMinutes)}` : ''}</span>
        </div>
        <Badge tone={info.tone}>{info.label}</Badge>
      </button>
      {open && (
        <ul className="tasks">
          {tasks.map((t) => (
            <li key={t.id} className={`task ${t.done ? 'done' : ''} ${t.auto ? 'auto' : ''}`}>
              <div className="task-main">
                <span className="task-name">{t.done ? '✅ ' : ''}{t.name}</span>
                <span className="small muted">
                  {typeLabel(t.type)} · مقدّر {dur(t.minutes)}
                  {t.done && t.prior && ' · منجزة قبل التطبيق'}
                  {t.done && !t.prior && ` · أخذت ${dur(t.actualMinutes)}`}
                  {t.score != null && <> · علامتك <b className={t.score >= t.passMark ? 'txt-green' : 'txt-red'}>{t.score}%</b></>}
                </span>
              </div>
              {!t.done && <button className="btn btn-primary btn-sm" onClick={() => setFinishing(t)}>خلصت</button>}
              {canUndo(t, today) && <button className="btn btn-ghost btn-sm" onClick={() => undo(t)}>تراجع</button>}
            </li>
          ))}
        </ul>
      )}
      {note && <Alert tone={note.tone}>{note.text}</Alert>}
      {finishing && (
        <FinishModal
          task={finishing}
          onClose={() => setFinishing(null)}
          onSaved={(r) => {
            setFinishing(null);
            setOpen(true);
            if (r.score == null) setNote({ tone: 'success', text: 'تم! أُعيد حساب ساعاتك.' });
            else if (r.added) setNote({ tone: 'warn', text: `علامتك ${r.score}% (أقل من ${s.settings.masteryThreshold}%). أضفنا لك مهمتين: مراجعة الأخطاء وإعادة حل الدورات.` });
            else if (r.exhausted) setNote({ tone: 'error', text: `علامتك ${r.score}%. استنفدت حلقات التحسين لهذا الفصل، وصار "بحاجة متابعة".` });
            else setNote({ tone: 'success', text: `ممتاز! علامتك ${r.score}% — الفصل متقن.` });
          }}
          me={me}
        />
      )}
    </div>
  );
}

function FinishModal({ task, me, onClose, onSaved }) {
  const { s } = useStore();
  const [minutes, setMinutes] = useState('');
  const [questions, setQuestions] = useState('');
  const [errors, setErrors] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const isCycles = task.type === 'cycles';
  const q = Number(normalizeDigits(questions));
  const e = Number(normalizeDigits(errors));
  const preview = isCycles && q > 0 && errors !== '' && e >= 0 && e <= q ? scoreOf(q, e) : null;

  const submit = (ev) => {
    ev.preventDefault();
    const cycles = isCycles ? { questions, errors } : null;
    const check = checkTaskInput(task, minutes, cycles);
    if (!check.ok) return setError(check.error);
    if (check.needsConfirm && !confirming) return setConfirming(true);
    const r = completeTask(me.id, task.id, minutes, cycles);
    if (!r.ok) return setError(r.error);
    onSaved(r);
  };

  return (
    <Modal title={task.name} onClose={onClose}>
      <form onSubmit={submit} className="stack-sm">
        <label className="field">
          <span className="field-label">كم دقيقة أخذت؟</span>
          <input autoFocus inputMode="numeric" dir="ltr" placeholder={String(task.minutes)} value={minutes}
            onChange={(e2) => { setMinutes(e2.target.value); setConfirming(false); setError(''); }} />
          <span className="field-hint">الوقت المقدّر: {task.minutes} دقيقة</span>
        </label>
        {isCycles && (
          <div className="grid-2">
            <label className="field">
              <span className="field-label">عدد الأسئلة</span>
              <input inputMode="numeric" dir="ltr" value={questions} onChange={(e2) => { setQuestions(e2.target.value); setError(''); }} />
            </label>
            <label className="field">
              <span className="field-label">عدد الأخطاء</span>
              <input inputMode="numeric" dir="ltr" value={errors} onChange={(e2) => { setErrors(e2.target.value); setError(''); }} />
            </label>
          </div>
        )}
        {preview != null && <p>علامتك: <b className={preview >= s.settings.masteryThreshold ? 'txt-green' : 'txt-red'}>{preview}%</b></p>}
        {error && <Alert tone="error">{error}</Alert>}
        {confirming && <Alert tone="warn">الوقت الذي كتبته أكثر من 3 أضعاف الوقت المقدّر ({task.minutes} دقيقة). متأكد؟ اضغط "حفظ" مرة ثانية للتأكيد.</Alert>}
        <button className="btn btn-primary btn-block">{confirming ? 'نعم، احفظ' : 'حفظ'}</button>
      </form>
    </Modal>
  );
}
