import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../hooks.js';
import { syncStudent } from '../lib/actions.js';
import {
  visibleSubjects, subjectStatus, projectedForDay, avgActualLast7, COLOR_LABEL, plansOf,
} from '../lib/engine.js';
import { addDays, DAY_NAMES, weekday, prettyDate, dayLabel } from '../lib/dates.js';
import { dur, hours } from '../lib/constants.js';
import { Alert, Progress } from '../components/ui.jsx';

export default function Home({ me }) {
  const { s, today } = useStore();
  useEffect(() => { syncStudent(me.id); }, [me.id, today]);

  const subjects = visibleSubjects(s);
  const statuses = subjects.map((subj) => subjectStatus(s, me.id, subj, today));
  const planned = statuses.filter((x) => x.kind !== 'noPlan');

  if (!plansOf(s, me.id).length) {
    return (
      <div className="stack">
        <h2>أهلاً {me.name.split(' ')[0]} 👋</h2>
        <div className="card hero-card">
          <h3>خطوتك الأولى: حدد مواعيدك</h3>
          <p>اختار مادة (أو كل المواد) وحدد تاريخ بدايتك ونهايتك، ونحنا منحسبلك قديش لازم تدرس كل يوم.</p>
          <Link to="/plan" className="btn btn-primary">حدد مواعيدي</Link>
        </div>
      </div>
    );
  }

  const todays = planned.filter((x) => x.todayTarget != null);
  const target = todays.reduce((a, x) => a + x.todayTarget, 0);
  const doneToday = planned.reduce((a, x) => a + (x.doneToday || 0), 0);
  const behind = planned.some((x) => x.kind === 'color' && x.color !== 'green');
  const avg = avgActualLast7(s, me.id, today);

  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i)).map((d) => ({
    d,
    items: planned
      .map((st) => ({ st, min: projectedForDay(s, me.id, st.subject, d, st) }))
      .filter((x) => x.min != null),
  }));
  const next7 = Math.round(week.reduce((a, w) => a + w.items.reduce((b, x) => b + x.min, 0), 0) / 7);

  return (
    <div className="stack">
      <section className="card today-card">
        <div className="today-head">
          <div>
            <span className="muted small">{dayLabel(today)}</span>
            <h2>مطلوب اليوم</h2>
          </div>
          <div className="big-number">
            {todays.length ? <>{hours(target)}<small> ساعة</small></> : <small>لا مواد اليوم</small>}
          </div>
        </div>
        {todays.length > 0 ? (
          <>
            <Progress value={target ? doneToday / target : 1} tone={doneToday >= target ? 'green' : 'blue'} />
            <p className="small muted">أنجزت اليوم {dur(doneToday)} من {dur(target)} (حسب الوقت المقدّر للمهام)</p>
            <ul className="today-list">
              {todays.map((x) => (
                <li key={x.subject.id}>
                  <Link to={`/subject/${x.subject.id}`}>{x.subject.name}</Link>
                  <span>{x.phase === 'review' && <span className="tag">مراجعة</span>} {dur(x.todayTarget)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="muted">ما عندك مواد مخصصة لليوم. أي مهمة تنجزها اليوم تنحسب بإنجازك مباشرة.</p>
        )}
      </section>

      <section className={`card pace ${behind ? 'pace-behind' : ''}`}>
        {behind && next7 > avg ? (
          <p>📈 لتلحق، ارفع دراستك من <strong>{hours(avg)}</strong> لـ <strong>{hours(next7)}</strong> ساعات يومياً.</p>
        ) : (
          <p>معدل دراستك آخر 7 أيام: <strong>{hours(avg)}</strong> ساعة يومياً{next7 ? <> · المطلوب بالأيام الجاية: <strong>{hours(next7)}</strong> ساعة يومياً</> : null}.</p>
        )}
      </section>

      <h3 className="section-title">موادي</h3>
      <div className="subject-grid">
        {statuses.map((st) => <SubjectCard key={st.subject.id} st={st} />)}
      </div>

      <h3 className="section-title">الأيام السبعة الجاية</h3>
      <div className="week-strip">
        {week.map((w) => (
          <div key={w.d} className={`week-day ${w.d === today ? 'is-today' : ''}`}>
            <strong>{DAY_NAMES[weekday(w.d)]}</strong>
            <span className="muted small">{prettyDate(w.d).slice(0, -5)}</span>
            {w.items.length ? w.items.map((x) => (
              <span key={x.st.subject.id} className="week-item">{x.st.subject.name}<br /><b>{dur(x.min)}</b></span>
            )) : <span className="muted small">راحة</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function SubjectCard({ st }) {
  const { subject, kind } = st;
  const link = `/subject/${subject.id}`;
  const tone = kind === 'color' ? st.color : kind === 'complete' ? 'green' : kind === 'expired' ? 'red' : 'muted';

  let body;
  switch (kind) {
    case 'noPlan':
      body = <p className="muted">ما حددت مواعيد هالمادة. <Link to={`/plan?subject=${subject.id}`}>حدد مواعيدها</Link></p>;
      break;
    case 'notStarted':
      body = <p>لم تبدأ بعد — تبدأ بتاريخ {prettyDate(st.plan.start)}</p>;
      break;
    case 'expired':
      body = (
        <Alert tone="error">
          انتهى الموعد وباقي {dur(st.remaining)}. <Link to={`/plan?subject=${subject.id}`}>حدد تاريخ نهاية جديد أو أضف يوماً</Link>
        </Alert>
      );
      break;
    case 'complete':
      body = <p>🎉 خلّصت كل مهام {st.phase === 'review' ? 'كورس المراجعة' : 'الكورس الأساسي'}.</p>;
      break;
    case 'closed':
      body = (
        <p>أُغلق الكورس الأساسي مع بداية فترة الامتحانات.{' '}
          {st.reviewStart ? `أسبوع مراجعة المادة يبدأ ${prettyDate(st.reviewStart)}.` : 'موعد الامتحان لم يُحدد بعد.'}
        </p>
      );
      break;
    case 'after':
      body = <p className="farewell">منتمنالك التوفيق 🤍</p>;
      break;
    default:
      body = (
        <>
          <div className="status-row">
            <span className={`status-pill tone-${st.color}`}>{COLOR_LABEL[st.color]}</span>
            <span className="small muted">إنجازك {Math.round(st.actual * 100)}% · المفروض {Math.round(st.expected * 100)}%</span>
          </div>
          <Progress value={st.actual} tone={st.color} />
          {st.phase === 'review' ? (
            <p className="small">أسبوع المراجعة: {dur(st.perDay)} كل يوم · الامتحان {prettyDate(subject.examDate)}</p>
          ) : (
            <p className="small">المطلوب بكل يوم دراسة: <strong>{dur(st.perDay)}</strong> · باقي {st.daysLeft} يوم دراسة حتى {prettyDate(st.end)}</p>
          )}
          {st.overCap && (
            <Alert tone="warn">
              المطلوب بيوم هالمادة أكثر من 12 ساعة.{' '}
              <Link to={`/plan?subject=${subject.id}#days`}>أضف يوماً للمادة</Link> أو{' '}
              <Link to={`/plan?subject=${subject.id}`}>أخّر تاريخ النهاية</Link>
            </Alert>
          )}
        </>
      );
  }

  return (
    <div className={`card subject-card edge-${tone}`}>
      <div className="subject-card-head">
        <Link to={link}><h4>{subject.name}</h4></Link>
        {st.phase === 'review' && kind !== 'after' && <span className="tag">أسبوع المراجعة</span>}
      </div>
      {body}
      {st.examMissing && kind !== 'noPlan' && kind !== 'closed' && <p className="small muted">موعد الامتحان لم يُحدد بعد.</p>}
      {st.closesEarly && <p className="small muted">يُغلق الكورس الأساسي مع بداية فترة الامتحانات، قبل تاريخ نهايتك.</p>}
      {kind !== 'noPlan' && kind !== 'after' && <Link to={link} className="small">افتح الفصول والمهام ←</Link>}
    </div>
  );
}
