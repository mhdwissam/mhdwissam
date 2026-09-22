import { beforeEach, describe, expect, it } from 'vitest';
import { emptyState, setState, getState, setDemoToday, setSessionUserId } from '../src/lib/store.js';
import * as A from '../src/lib/actions.js';
import * as E from '../src/lib/engine.js';
import { buildSeed } from '../src/lib/seed.js';

// A small world: one subject studied Sat/Mon/Wed, exam on Saturday 2027-01-09.
async function world(today = '2026-09-22') {
  const s = emptyState();
  setState(s);
  setDemoToday(today);
  s.subjects.push({ id: 'bio', name: 'علم الحياة', semester: 1, order: 1, visible: true, suggestedDays: [6, 1, 3], examDate: '2027-01-09' });
  s.chapters.push({ id: 'c1', subjectId: 'bio', course: 'main', name: 'الخلية', order: 1, attendanceMinutes: 90, hasCycles: true });
  s.chapters.push({ id: 'c2', subjectId: 'bio', course: 'main', name: 'مقدمة', order: 0, attendanceMinutes: 10, hasCycles: false });
  s.chapters.push({ id: 'r1', subjectId: 'bio', course: 'review', name: 'مراجعة الخلية', order: 1, attendanceMinutes: 60, hasCycles: true });
  s.templates.push(
    { id: 'k1', chapterId: 'c1', name: 'دراسة', type: 'study', minutes: 200, order: 1 },
    { id: 'k2', chapterId: 'c1', name: 'ملخص', type: 'summary', minutes: 40, order: 2 },
    { id: 'k3', chapterId: 'c1', name: 'حل دورات', type: 'cycles', minutes: 60, order: 3 },
    { id: 'k4', chapterId: 'c2', name: 'مشاهدة', type: 'other', minutes: 30, order: 1 },
    { id: 'k5', chapterId: 'r1', name: 'مراجعة', type: 'study', minutes: 240, order: 1 },
    { id: 'k6', chapterId: 'r1', name: 'دورات', type: 'cycles', minutes: 60, order: 2 },
  );
  const { salt, hash } = await A.hashPassword('secret1');
  s.users.push({ id: 'admin', role: 'admin', name: 'مدير', phone: '0999000000', salt, passwordHash: hash });
  const r = await A.register({ name: 'طالب تجريبي', phone: '0933000001', password: 'secret1', source: 'youtube', governorate: 'حمص', gpa: '90', contactConsent: true });
  return { s: getState(), uid: r.user.id };
}

const task = (s, uid, name, course = 'main') => s.tasks.find((t) => t.studentId === uid && t.name === name && t.course === course);

describe('accounts', () => {
  beforeEach(() => world());
  it('rejects bad phone format and duplicate numbers', async () => {
    const bad = await A.register({ name: 'اسم كامل', phone: '0812', password: 'secret1', source: 'self', governorate: 'دمشق', gpa: '80' });
    expect(bad.error).toMatch('09XXXXXXXX');
    const dup = await A.register({ name: 'اسم كامل', phone: '٠٩٣٣٠٠٠٠٠١', password: 'secret1', source: 'self', governorate: 'دمشق', gpa: '80' });
    expect(dup.code).toBe('duplicate');
  });
  it('gives one message for unknown number and wrong password; never stores the password', async () => {
    const a = await A.login('0911111111', 'x');
    const b = await A.login('0933000001', 'wrong');
    expect(a.error).toBe(b.error);
    expect((await A.login('0933000001', 'secret1')).ok).toBe(true);
    expect(JSON.stringify(getState())).not.toContain('secret1');
  });
});

describe('plan and daily hours', () => {
  it('copies tasks once, validates dates and splits remaining time over study days', async () => {
    const { s, uid } = await world();
    expect(A.savePlan(uid, ['bio'], '2026-09-22', '2026-09-20').ok).toBe(false);
    expect(A.savePlan(uid, ['bio'], '2026-09-01', '2026-09-21').error).toMatch('اليوم');
    expect(A.savePlan(uid, ['bio'], '2026-09-22', '2026-10-03').ok).toBe(true);
    A.savePlan(uid, ['bio'], '2026-09-22', '2026-10-03');
    expect(s.tasks.filter((t) => t.studentId === uid).length).toBe(4);
    // Tue 22/9 → Sat 3/10 with Sat/Mon/Wed: 23,26,28,30/9, 3/10 = 5 days; 330 min remaining.
    const st = E.subjectStatus(s, uid, s.subjects[0], '2026-09-22');
    expect(st.daysLeft).toBe(5);
    expect(st.perDay).toBe(66);
    expect(A.setPlanDays(uid, 'bio', []).error).toBe('كل مادة تحتاج يوماً واحداً على الأقل.');
  });

  it('freezes the requirement at the start of the day and raises later days when behind', async () => {
    const { s, uid } = await world('2026-09-23');
    A.savePlan(uid, ['bio'], '2026-09-23', '2026-10-03');
    A.syncStudent(uid);
    expect(E.snapshotTotal(s, uid, '2026-09-23')).toBe(66); // Wed 23/9 → Sat 3/10: 5 study days, 330 min
    A.completeTask(uid, task(s, uid, 'مشاهدة').id, '30');
    A.syncStudent(uid);
    expect(E.snapshotTotal(s, uid, '2026-09-23')).toBe(66); // unchanged after finishing work
    setDemoToday('2026-09-26');
    A.syncStudent(uid);
    expect(E.snapshotTotal(s, uid, '2026-09-26')).toBe(75); // 300 left / 4 days
  });
});

describe('cycles and improvement loops', () => {
  it('adds two improvement tasks under the threshold and stops after 3 loops', async () => {
    const { s, uid } = await world();
    A.savePlan(uid, ['bio'], '2026-09-22', '2026-12-31');
    const first = task(s, uid, 'حل دورات');
    expect(A.completeTask(uid, first.id, '50', { questions: '10', errors: '11' }).ok).toBe(false);
    const r = A.completeTask(uid, first.id, '50', { questions: '40', errors: '8' });
    expect(r.score).toBe(80);
    const added = s.tasks.filter((t) => t.causeId === first.id);
    expect(added.map((t) => t.minutes).sort()).toEqual([30, 60]); // 15% of 200 study, same as cycles
    let cause = first;
    for (let loop = 1; loop <= 3; loop++) {
      const redo = s.tasks.find((t) => t.causeId === cause.id && t.type === 'cycles');
      const res = A.completeTask(uid, redo.id, '60', { questions: '10', errors: '5' });
      cause = redo;
      if (loop < 3) expect(res.added).toBe(2);
      else expect(res.exhausted).toBe(true);
    }
    expect(E.chapterStatus(s, uid, E.chapterById(s, 'c1'))).toBe('followUp');
    expect(E.weakRows(s).some((w) => w.student.id === uid)).toBe(true);
  });

  it('undo removes result and pending improvement tasks, but not after one is done', async () => {
    const { s, uid } = await world();
    A.savePlan(uid, ['bio'], '2026-09-22', '2026-12-31');
    const c = task(s, uid, 'حل دورات');
    A.completeTask(uid, c.id, '50', { questions: '10', errors: '3' });
    const review = s.tasks.find((t) => t.causeId === c.id && t.type === 'other');
    A.completeTask(uid, review.id, '20');
    expect(A.undoTask(uid, c.id).error).toBe('تراجع عن مهام التحسين أولاً.');
    A.undoTask(uid, review.id);
    expect(A.undoTask(uid, c.id).ok).toBe(true);
    expect(c.score).toBe(null);
    expect(s.tasks.some((t) => t.causeId === c.id)).toBe(false);
    A.completeTask(uid, c.id, '50', { questions: '10', errors: '0' });
    setDemoToday('2026-09-23');
    expect(A.undoTask(uid, c.id).ok).toBe(false);
  });

  it('rejects zero minutes and asks to confirm over 3x the estimate', async () => {
    const { s, uid } = await world();
    A.savePlan(uid, ['bio'], '2026-09-22', '2026-12-31');
    const t = task(s, uid, 'ملخص');
    expect(A.checkTaskInput(t, '0').ok).toBe(false);
    expect(A.checkTaskInput(t, '121').needsConfirm).toBe(true);
    expect(A.checkTaskInput(t, '120').needsConfirm).toBe(false);
  });
});

describe('prior study cap', () => {
  it('caps prior tasks at 6h per day since the oldest start', async () => {
    const { s, uid } = await world();
    A.savePlan(uid, ['bio'], '2026-09-21', '2026-12-31'); // 1 day before → 360 min allowed
    const ids = s.tasks.filter((t) => t.studentId === uid).map((t) => t.id); // 330 min
    expect(A.setPriorTasks(uid, 'bio', ids).ok).toBe(true);
    A.saveTemplate('admin', { ...s.templates.find((k) => k.id === 'k1'), minutes: 400 });
    expect(task(s, uid, 'دراسة').minutes).toBe(200); // done copies keep their old time
    const st = E.subjectStatus(s, uid, s.subjects[0], '2026-09-22');
    expect(st.kind).toBe('complete');
    A.setPriorTasks(uid, 'bio', []);
    A.saveTemplate('admin', { ...s.templates.find((k) => k.id === 'k1'), minutes: 400 });
    expect(task(s, uid, 'دراسة').minutes).toBe(400);
    expect(A.setPriorTasks(uid, 'bio', ids).error).toMatch('6 ساعة');
  });
});

describe('exam period and review week', () => {
  it('closes the main course, opens review week with a message, then wishes luck', async () => {
    const { s, uid } = await world();
    A.savePlan(uid, ['bio'], '2026-09-22', '2027-01-01');
    setDemoToday('2027-01-03'); // first review day (exam 9/1 − 6)
    A.syncStudent(uid);
    const bio = s.subjects[0];
    expect(E.phaseOf(s, bio, '2027-01-02')).toBe('main');
    const st = E.subjectStatus(s, uid, bio, '2027-01-03');
    expect(st.phase).toBe('review');
    expect(st.perDay).toBe(50); // 300 / 6
    expect(s.messages.some((m) => m.studentId === uid && m.type === 'review')).toBe(true);
    expect(E.snapshotTotal(s, uid, '2027-01-04')).toBe(null); // not reached yet
    expect(E.subjectStatus(s, uid, bio, '2027-01-10').kind).toBe('after');
  });

  it('closes every subject at the first review week of the semester', async () => {
    const { s, uid } = await world();
    s.subjects.push({ id: 'chem', name: 'كيمياء', semester: 1, order: 2, visible: true, suggestedDays: [0], examDate: '2027-01-16' });
    expect(E.phaseOf(s, s.subjects[1], '2027-01-05')).toBe('closed');
    expect(E.phaseOf(s, s.subjects[1], '2027-01-10')).toBe('review');
    void uid;
  });
});

describe('ranking', () => {
  it('counts committed days, resets weekly on Saturday and ignores prior tasks', async () => {
    const { s, uid } = await world('2026-09-19');
    A.savePlan(uid, ['bio'], '2026-09-19', '2026-10-03');
    A.syncStudent(uid);
    const target = E.snapshotTotal(s, uid, '2026-09-19');
    expect(target).toBeGreaterThan(0);
    A.completeTask(uid, task(s, uid, 'دراسة').id, '200');
    let r = E.studentRankStats(s, uid, '2026-09-19');
    expect(r.weekCommitted).toBe(1);
    expect(r.streak).toBe(1);
    setDemoToday('2026-09-20'); // Sunday, no subject: doesn't count or break the streak
    A.syncStudent(uid);
    r = E.studentRankStats(s, uid, '2026-09-20');
    expect(r.totalCommitted).toBe(1);
    expect(r.streak).toBe(1);
    setDemoToday('2026-09-26'); // next Saturday: weekly resets
    A.syncStudent(uid);
    r = E.studentRankStats(s, uid, '2026-09-26');
    expect(r.weekCommitted).toBe(0);
    expect(r.streak).toBe(0); // missed Monday and Wednesday
  });
});

describe('admin rules', () => {
  it('blocks showing a subject whose cycles chapter lacks a cycles task', async () => {
    const { s } = await world();
    s.templates = s.templates.filter((k) => k.id !== 'k3');
    expect(A.saveSubject('admin', { ...s.subjects[0], visible: true }).ok).toBe(false);
  });

  it('students cannot use admin actions; offers reach the student with the code', async () => {
    const { s, uid } = await world();
    expect(() => A.sendOffers(uid, [], 'x', 'y')).toThrow();
    A.savePlan(uid, ['bio'], '2026-09-22', '2026-12-31');
    A.sendOffers('admin', [{ studentId: uid, chapterId: 'c1' }], 'عرض', 'MEDX-1');
    expect(A.studentsWithPriorOffers([{ studentId: uid }]).length).toBe(1);
    expect(s.messages.find((m) => m.type === 'offer').code).toBe('MEDX-1');
    setSessionUserId(null);
  });
});

describe('demo data', () => {
  it('builds a consistent seed', async () => {
    const s = await buildSeed('2026-09-22');
    expect(E.students(s).length).toBe(31);
    expect(E.weakRows(s).length).toBeGreaterThan(0);
    expect(E.weakRows(s).every((r) => r.student.source !== 'medx')).toBe(true);
  });
});
