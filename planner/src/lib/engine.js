// Pure calculation rules from the spec (sections 3.4, 3.5, 3.6, 4.3, 4.4, 5.1, 6.2).
// Everything here is derived from saved data and never stored, except the
// daily "required" snapshots which the spec asks to freeze at the start of each day.
import { addDays, diffDays, eachDay, minDate, weekday, weekStart } from './dates.js';

// ---------- lookups ----------
export const subjectById = (s, id) => s.subjects.find((x) => x.id === id);
export const chapterById = (s, id) => s.chapters.find((x) => x.id === id);
export const userById = (s, id) => s.users.find((x) => x.id === id);
export const planFor = (s, sid, subjectId) =>
  s.plans.find((p) => p.studentId === sid && p.subjectId === subjectId);
export const plansOf = (s, sid) => s.plans.filter((p) => p.studentId === sid);
export const students = (s) => s.users.filter((u) => u.role === 'student');

export function visibleSubjects(s) {
  return s.subjects.filter((x) => x.visible).sort((a, b) => a.semester - b.semester || a.order - b.order);
}

export function chaptersOf(s, subjectId, course) {
  return s.chapters
    .filter((c) => c.subjectId === subjectId && c.course === course)
    .sort((a, b) => a.order - b.order);
}

export function templatesOf(s, chapterId) {
  return s.templates.filter((t) => t.chapterId === chapterId).sort((a, b) => a.order - b.order);
}

export function studentTasks(s, sid, subjectId, course) {
  return s.tasks.filter(
    (t) => t.studentId === sid && t.subjectId === subjectId && (!course || t.course === course),
  );
}

export function chapterTasks(s, sid, chapterId) {
  return s.tasks.filter((t) => t.studentId === sid && t.chapterId === chapterId).sort((a, b) => a.order - b.order);
}

const dateOf = (stamp) => (stamp ? stamp.slice(0, 10) : null);
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);

// ---------- exam calendar ----------
export function reviewStart(s, subj) {
  return subj.examDate ? addDays(subj.examDate, -s.settings.reviewWeekDays) : null;
}

// First day of the first review week in the semester.
export function examPeriodStart(s, semester) {
  let first = null;
  for (const subj of s.subjects) {
    if (!subj.visible || subj.semester !== semester || !subj.examDate) continue;
    first = minDate(first, reviewStart(s, subj));
  }
  return first;
}

// 'main' | 'closed' (main closed, review week not started) | 'review' | 'after'
export function phaseOf(s, subj, d) {
  if (subj.examDate && d >= subj.examDate) return 'after';
  const rs = reviewStart(s, subj);
  if (rs && d >= rs) return 'review';
  const eps = examPeriodStart(s, subj.semester);
  if (eps && d >= eps) return 'closed';
  return 'main';
}

// The main course closes at the start of the exam period whatever the student's end date (case 12).
export function effectiveEnd(s, plan) {
  const subj = subjectById(s, plan.subjectId);
  const eps = examPeriodStart(s, subj.semester);
  return eps ? minDate(plan.end, addDays(eps, -1)) : plan.end;
}

export function countStudyDays(days, from, to) {
  if (!from || !to || from > to) return 0;
  let n = 0;
  for (const d of eachDay(from, to)) if (days.includes(weekday(d))) n++;
  return n;
}

// ---------- remaining time ----------
// Task state as it was at the very start of day `d` (for frozen daily snapshots).
function existedAtStart(t, d) {
  return !t.auto || dateOf(t.createdAt) < d;
}
function doneBefore(t, d) {
  return t.done && (t.prior || dateOf(t.doneAt) < d);
}

export function remainingMinutes(s, sid, subjectId, course, atStartOf = null) {
  const ts = studentTasks(s, sid, subjectId, course);
  if (atStartOf) return sum(ts.filter((t) => existedAtStart(t, atStartOf) && !doneBefore(t, atStartOf)), (t) => t.minutes);
  return sum(ts.filter((t) => !t.done), (t) => t.minutes);
}

function reviewTotalMinutes(s, sid, subjectId) {
  const ts = studentTasks(s, sid, subjectId, 'review');
  if (ts.length) return sum(ts, (t) => t.minutes);
  // Not copied yet: use the admin templates.
  return sum(
    chaptersOf(s, subjectId, 'review').flatMap((c) => templatesOf(s, c.id)),
    (t) => t.minutes,
  );
}

// Required minutes for a subject on day d, computed from the data as it stood at the start of d.
// Returns null when the subject is not scheduled that day.
export function requiredAtStart(s, plan, d) {
  const subj = subjectById(s, plan.subjectId);
  const phase = phaseOf(s, subj, d);
  if (phase === 'review') {
    return Math.round(reviewTotalMinutes(s, plan.studentId, subj.id) / s.settings.reviewWeekDays);
  }
  if (phase !== 'main') return null;
  const end = effectiveEnd(s, plan);
  if (d < plan.start || d > end || !plan.days.includes(weekday(d))) return null;
  const remaining = remainingMinutes(s, plan.studentId, subj.id, 'main', d);
  const daysLeft = countStudyDays(plan.days, d, end);
  return daysLeft ? Math.round(remaining / daysLeft) : null;
}

// Freeze each day's requirement the first time that day is seen (spec 3.4: saved at the start of each day).
// Returns true if anything was written.
export function ensureSnapshots(s, sid, today) {
  const student = userById(s, sid);
  const snaps = (s.snapshots[sid] ||= {});
  let changed = false;
  for (const plan of plansOf(s, sid)) {
    const from = [plan.start, dateOf(plan.createdAt), dateOf(student.createdAt)].sort().at(-1);
    for (const d of eachDay(from, today)) {
      const day = (snaps[d] ||= {});
      if (plan.subjectId in day) continue;
      day[plan.subjectId] = requiredAtStart(s, plan, d);
      changed = true;
    }
  }
  return changed;
}

export function snapshotTotal(s, sid, d) {
  const day = s.snapshots[sid]?.[d];
  if (!day) return null;
  const vals = Object.values(day).filter((v) => v !== null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
}

// ---------- chapter status (4.3) ----------
export function maxLoops(s, course) {
  return course === 'review' ? s.settings.loopsReview : s.settings.loopsMain;
}

export function chapterStatus(s, sid, chapter) {
  const ts = chapterTasks(s, sid, chapter.id);
  if (!ts.length || !ts.some((t) => t.done)) return 'notStarted';
  if (chapter.hasCycles) {
    const last = lastCyclesResult(ts);
    if (last && last.score >= last.passMark) return 'mastered';
    if (last && last.exhausted) return 'followUp';
    return 'inProgress';
  }
  return ts.every((t) => t.done) ? 'complete' : 'inProgress';
}

export function lastCyclesResult(ts) {
  return ts
    .filter((t) => t.type === 'cycles' && t.done && t.score != null)
    .sort((a, b) => (a.doneAt < b.doneAt ? -1 : a.doneAt > b.doneAt ? 1 : a.loop - b.loop))
    .at(-1);
}

export const CHAPTER_STATUS = {
  notStarted: { label: 'لم يبدأ', tone: 'muted' },
  inProgress: { label: 'قيد الدراسة', tone: 'blue' },
  mastered: { label: 'متقن', tone: 'green' },
  followUp: { label: 'بحاجة متابعة', tone: 'red' },
  complete: { label: 'مكتمل', tone: 'green' },
};

// ---------- subject status (3.4, 3.5, 3.6, 4.4) ----------
export function subjectStatus(s, sid, subj, today) {
  const plan = planFor(s, sid, subj.id);
  const base = { subject: subj, plan, examMissing: !subj.examDate };
  if (!plan) return { ...base, kind: 'noPlan' };
  const phase = phaseOf(s, subj, today);
  const todayTarget = s.snapshots[sid]?.[today]?.[subj.id] ?? null;
  const course = phase === 'review' ? 'review' : 'main';
  const doneToday = sum(
    studentTasks(s, sid, subj.id, course).filter((t) => t.done && !t.prior && dateOf(t.doneAt) === today),
    (t) => t.minutes,
  );
  const common = { ...base, phase, todayTarget, doneToday };

  if (phase === 'after') return { ...common, kind: 'after' };
  if (phase === 'closed') return { ...common, kind: 'closed', reviewStart: reviewStart(s, subj) };

  const colorOf = (gap) =>
    gap <= s.settings.greenGap / 100 ? 'green' : gap <= s.settings.yellowGap / 100 ? 'yellow' : 'red';

  if (phase === 'review') {
    const ts = studentTasks(s, sid, subj.id, 'review');
    const total = sum(ts, (t) => t.minutes);
    const done = sum(ts.filter((t) => t.done), (t) => t.minutes);
    const rs = reviewStart(s, subj);
    const expected = Math.min(1, diffDays(rs, today) / s.settings.reviewWeekDays);
    const actual = total ? done / total : 1;
    const gap = expected - actual;
    return {
      ...common,
      kind: total && done >= total ? 'complete' : 'color',
      color: colorOf(gap),
      expected, actual, gap,
      remaining: total - done,
      perDay: Math.round(total / s.settings.reviewWeekDays),
      reviewStart: rs,
      daysLeft: diffDays(today, subj.examDate),
    };
  }

  // main course
  if (today < plan.start) return { ...common, kind: 'notStarted' };
  const end = effectiveEnd(s, plan);
  const ts = studentTasks(s, sid, subj.id, 'main');
  const total = sum(ts, (t) => t.minutes);
  const done = sum(ts.filter((t) => t.done), (t) => t.minutes);
  const remaining = total - done;
  if (remaining <= 0) return { ...common, kind: 'complete', color: 'green', expected: 1, actual: 1, gap: 0, remaining: 0 };
  const daysLeft = countStudyDays(plan.days, today, end);
  const allDays = countStudyDays(plan.days, plan.start, end);
  if (!daysLeft || !allDays) return { ...common, kind: 'expired', remaining, end };
  const passed = countStudyDays(plan.days, plan.start, minDate(addDays(today, -1), end));
  const expected = passed / allDays;
  const actual = total ? done / total : 1;
  const gap = expected - actual;
  const perDay = Math.round(remaining / daysLeft);
  return {
    ...common,
    kind: 'color',
    color: colorOf(gap),
    expected, actual, gap, remaining, daysLeft, perDay, end,
    overCap: perDay > s.settings.subjectDayCapHours * 60,
    closesEarly: end < plan.end,
  };
}

export const COLOR_LABEL = { green: 'على المسار', yellow: 'متأخر قليلاً', red: 'متأخر' };

// Projected requirement for a future day (live, after the latest completion).
export function projectedForDay(s, sid, subj, d, status) {
  if (!status || !status.plan) return null;
  const phase = phaseOf(s, subj, d);
  if (phase === 'review') return Math.round(reviewTotalMinutes(s, sid, subj.id) / s.settings.reviewWeekDays);
  if (phase !== 'main' || status.kind !== 'color') return null;
  const plan = status.plan;
  if (d < plan.start || d > status.end || !plan.days.includes(weekday(d))) return null;
  return status.perDay;
}

// Average actual study time per day over the last 7 days (all subjects).
export function avgActualLast7(s, sid, today) {
  const from = addDays(today, -6);
  const ts = s.tasks.filter((t) => t.studentId === sid && t.done && !t.prior && dateOf(t.doneAt) >= from && dateOf(t.doneAt) <= today);
  return Math.round(sum(ts, (t) => t.actualMinutes || 0) / 7);
}

// ---------- ranking (5.1, 5.2) ----------
function doneEstimatedOn(s, sid, d) {
  return sum(
    s.tasks.filter((t) => t.studentId === sid && t.done && !t.prior && dateOf(t.doneAt) === d),
    (t) => t.minutes,
  );
}

export function studentRankStats(s, sid, today) {
  const cap = s.settings.rankDailyCapHours * 60;
  const snaps = s.snapshots[sid] || {};
  const ws = weekStart(today);
  const out = { weekCommitted: 0, weekMinutes: 0, totalCommitted: 0, totalMinutes: 0, streak: 0, overCapDays: 0 };
  const days = Object.keys(snaps).filter((d) => d <= today).sort();
  const committedByDay = {};
  for (const d of days) {
    const req = snapshotTotal(s, sid, d);
    const raw = doneEstimatedOn(s, sid, d);
    if (raw > cap) out.overCapDays++;
    if (req === null) continue; // no subject that day: neither counts nor breaks the streak
    const done = Math.min(raw, cap);
    const committed = done >= req;
    committedByDay[d] = committed;
    if (committed) out.totalCommitted++;
    out.totalMinutes += done;
    if (d >= ws) {
      if (committed) out.weekCommitted++;
      out.weekMinutes += done;
    }
  }
  const scheduled = Object.keys(committedByDay).sort().reverse();
  for (const d of scheduled) {
    if (committedByDay[d]) out.streak++;
    else if (d === today) continue; // today is still in progress
    else break;
  }
  return out;
}

export function isActive(s, sid, today) {
  const from = addDays(today, -6);
  return s.tasks.some((t) => t.studentId === sid && t.done && !t.prior && dateOf(t.doneAt) >= from && dateOf(t.doneAt) <= today);
}

function rankList(rows, key, tie) {
  const sorted = [...rows].sort((a, b) => b[key] - a[key] || b[tie] - a[tie]);
  let rank = 0;
  sorted.forEach((r, i) => {
    const prev = sorted[i - 1];
    if (!prev || prev[key] !== r[key] || prev[tie] !== r[tie]) rank = i + 1;
    r.rank = rank;
  });
  return sorted;
}

export function leaderboard(s, today) {
  const rows = students(s)
    .filter((u) => !u.hidden)
    .map((u) => ({ id: u.id, name: u.name, ...studentRankStats(s, u.id, today) }));
  return {
    weekly: rankList(rows.map((r) => ({ ...r })), 'weekCommitted', 'weekMinutes'),
    overall: rankList(rows.map((r) => ({ ...r })), 'totalCommitted', 'totalMinutes'),
    activeCount: students(s).filter((u) => isActive(s, u.id, today)).length,
  };
}

// ---------- weak students (6.2) ----------
export function weakRows(s) {
  const rows = [];
  for (const u of students(s)) {
    if (u.source === 'medx') continue;
    const chapterIds = [...new Set(s.tasks.filter((t) => t.studentId === u.id).map((t) => t.chapterId))];
    for (const cid of chapterIds) {
      const ch = chapterById(s, cid);
      if (!ch || !ch.hasCycles) continue;
      const ts = chapterTasks(s, u.id, cid);
      const last = lastCyclesResult(ts);
      const status = chapterStatus(s, u.id, ch);
      if (status === 'followUp' || (last && last.score < last.passMark)) {
        rows.push({ student: u, chapter: ch, subject: subjectById(s, ch.subjectId), lastScore: last?.score ?? null, status });
      }
    }
  }
  return rows;
}

export function offersReceived(s, sid) {
  return s.messages.filter((m) => m.studentId === sid && m.type === 'offer');
}
