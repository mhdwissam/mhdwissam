import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStore } from '../hooks.js';
import { savePlan, setPlanDays, setPriorTasks, priorAllowance, suggestedEnd, syncStudent } from '../lib/actions.js';
import { visibleSubjects, planFor, chaptersOf, chapterTasks } from '../lib/engine.js';
import { prettyDate } from '../lib/dates.js';
import { dur, hours, typeLabel } from '../lib/constants.js';
import { Alert, DayPicker, Field, daysText } from '../components/ui.jsx';

export default function Plan({ me }) {
  const { s, today } = useStore();
  const [params] = useSearchParams();
  const subjects = visibleSubjects(s);
  const [choice, setChoice] = useState(params.get('subject') || 'all');
  const chosen = choice === 'all' ? subjects : subjects.filter((x) => x.id === choice);
  const existing = choice !== 'all' ? planFor(s, me.id, choice) : null;
  const suggested = chosen[0] ? suggestedEnd(s, chosen[0]) : '';
  const [start, setStart] = useState(existing?.start || today);
  const [end, setEnd] = useState(existing?.end || suggested);
  const [msg, setMsg] = useState(null);
  const [priorFor, setPriorFor] = useState([]);

  useEffect(() => {
    const p = choice !== 'all' ? planFor(s, me.id, choice) : null;
    setStart(p?.start || today);
    setEnd(p?.end || suggested);
    setMsg(null);
    setPriorFor([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice]);

  useEffect(() => {
    if (location.hash.includes('#days')) document.getElementById('days')?.scrollIntoView();
  }, []);

  const submit = (e) => {
    e.preventDefault();
    const ids = chosen.map((x) => x.id);
    const useSuggested = end === suggested;
    const r = savePlan(me.id, ids, start, useSuggested && choice === 'all' ? null : end);
    if (!r.ok) return setMsg({ tone: 'error', text: r.error });
    syncStudent(me.id);
    setMsg({ tone: 'success', text: 'تم حفظ مواعيدك وحُسبت ساعاتك اليومية.' });
    setPriorFor(start < today ? ids : []);
  };

  const myPlans = subjects.map((subj) => ({ subj, plan: planFor(s, me.id, subj.id) })).filter((x) => x.plan);

  return (
    <div className="stack">
      <h2>خطتي</h2>

      <form className="card" onSubmit={submit}>
        <h3>تاريخ البداية والنهاية</h3>
        <Field label="المادة">
          <select value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="all">كل المواد</option>
            {subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
        <div className="grid-2">
          <Field label="تاريخ البداية" hint="يمكن أن يكون تاريخاً سابقاً">
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="تاريخ النهاية" hint={`المقترح: ${prettyDate(suggested)} (نهاية الكورس الأساسي)`}>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        {end !== suggested && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEnd(suggested)}>استخدم التاريخ المقترح</button>
        )}
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <button className="btn btn-primary btn-block">حفظ</button>
      </form>

      {priorFor.length > 0 && (
        <PriorStudy me={me} subjectIds={priorFor} onDone={() => setPriorFor([])} />
      )}

      <section id="days" className="stack">
        <h3 className="section-title">أيام دراسة كل مادة</h3>
        {!myPlans.length && <p className="muted">احفظ مواعيد مادة أولاً.</p>}
        {myPlans.map(({ subj, plan }) => <DaysEditor key={subj.id} me={me} subj={subj} plan={plan} />)}
      </section>
    </div>
  );
}

function DaysEditor({ me, subj, plan }) {
  const [days, setDays] = useState(plan.days);
  const [msg, setMsg] = useState(null);
  const dirty = [...days].sort().join() !== [...plan.days].sort().join();
  useEffect(() => setDays(plan.days), [plan.days]);

  const save = () => {
    const r = setPlanDays(me.id, subj.id, days);
    setMsg(r.ok ? { tone: 'success', text: 'تم الحفظ وأُعيد حساب ساعاتك.' } : { tone: 'error', text: r.error });
  };

  return (
    <div className="card">
      <div className="row between">
        <h4>{subj.name}</h4>
        <span className="small muted">{prettyDate(plan.start)} ← {prettyDate(plan.end)}</span>
      </div>
      <DayPicker value={days} onChange={(d) => { setDays(d); setMsg(null); }} />
      <p className="small muted">{plan.customDays ? 'أيام اخترتها بنفسك' : 'الأيام المقترحة من ميدكس'}: {daysText(plan.days)}</p>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {dirty && <button className="btn btn-primary btn-sm" onClick={save}>حفظ الأيام</button>}
    </div>
  );
}

function PriorStudy({ me, subjectIds, onDone }) {
  const { s, today } = useStore();
  const [active, setActive] = useState(subjectIds[0]);
  const [answer, setAnswer] = useState(null);
  const [saved, setSaved] = useState(new Set());
  const subj = s.subjects.find((x) => x.id === active);
  const chapters = chaptersOf(s, active, 'main');
  const initial = useMemo(
    () => new Set(chapters.flatMap((c) => chapterTasks(s, me.id, c.id)).filter((t) => t.prior).map((t) => t.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active],
  );
  const [picked, setPicked] = useState(initial);
  const [msg, setMsg] = useState(null);
  useEffect(() => { setPicked(initial); setMsg(null); }, [initial]);

  const allowance = priorAllowance(s, me.id, today);
  const otherPrior = s.tasks.filter((t) => t.studentId === me.id && t.prior && t.subjectId !== active).reduce((a, t) => a + t.minutes, 0);
  const pickedMin = s.tasks.filter((t) => picked.has(t.id)).reduce((a, t) => a + t.minutes, 0);

  const toggle = (id) => {
    const n = new Set(picked);
    n.has(id) ? n.delete(id) : n.add(id);
    setPicked(n);
    setMsg(null);
  };
  const save = () => {
    const r = setPriorTasks(me.id, active, [...picked]);
    if (!r.ok) return setMsg({ tone: 'error', text: r.error });
    syncStudent(me.id);
    const nowSaved = new Set(saved).add(active);
    setSaved(nowSaved);
    const next = subjectIds.find((x) => !nowSaved.has(x));
    if (next) setActive(next);
    else onDone();
  };

  if (answer === null) {
    return (
      <div className="card highlight">
        <h3>هل درست شيئاً من {subjectIds.length > 1 ? 'هذه المواد' : subj.name} قبل اليوم؟</h3>
        <p className="small muted">تاريخ بدايتك قبل اليوم، فيك تعلّم المهام التي أنجزتها قبل ما تستخدم التطبيق.</p>
        <div className="row gap">
          <button className="btn btn-primary" onClick={() => setAnswer(true)}>نعم، بعلّمها</button>
          <button className="btn" onClick={onDone}>لا</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card highlight">
      <h3>الدراسة السابقة للتطبيق</h3>
      {subjectIds.length > 1 && (
        <div className="chips">
          {subjectIds.map((id) => (
            <button key={id} className={`chip ${id === active ? 'on' : ''}`} onClick={() => setActive(id)}>
              {saved.has(id) ? '✓ ' : ''}{s.subjects.find((x) => x.id === id).name}
            </button>
          ))}
        </div>
      )}
      <p className="small">
        الحد المسموح لكل المواد: <strong>{hours(allowance)} ساعة</strong> (6 ساعات × أيام من أقدم تاريخ بداية). معلّم الآن: {hours(otherPrior + pickedMin)} ساعة.
      </p>
      {chapters.map((c) => {
        const ts = chapterTasks(s, me.id, c.id).filter((t) => !t.auto);
        return (
          <div key={c.id} className="prior-chapter">
            <strong>{c.name}</strong>
            {ts.map((t) => {
              const inApp = t.done && !t.prior;
              return (
                <label key={t.id} className={`check ${inApp ? 'disabled' : ''}`}>
                  <input type="checkbox" disabled={inApp} checked={inApp || picked.has(t.id)} onChange={() => toggle(t.id)} />
                  <span>{t.name} <span className="muted small">· {typeLabel(t.type)} · {dur(t.minutes)}{inApp ? ' · أنجزتها بالتطبيق' : ''}</span></span>
                </label>
              );
            })}
          </div>
        );
      })}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="row gap">
        <button className="btn btn-primary" onClick={save}>حفظ {subj.name}</button>
        <button className="btn" onClick={onDone}>إنهاء</button>
      </div>
    </div>
  );
}
