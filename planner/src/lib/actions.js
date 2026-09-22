// State-changing operations. Each returns { ok: true, ... } or { ok: false, error }.
// Role checks follow the permissions table in section 4 of the spec.
import { getState, persist, nextId, today, nowStamp, setSessionUserId } from './store.js';
import { diffDays } from './dates.js';
import { normalizeDigits, GOVERNORATES, SOURCES, hours } from './constants.js';
import {
  subjectById, chapterById, userById, planFor, plansOf, chaptersOf, templatesOf, studentTasks,
  chapterTasks, phaseOf, maxLoops, ensureSnapshots, leaderboard, offersReceived,
} from './engine.js';
import { weekStart } from './dates.js';

const fail = (error, extra = {}) => ({ ok: false, error, ...extra });

// ---------- passwords (never stored readable) ----------
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randomSalt() {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function hashPassword(pw, salt = randomSalt()) {
  return { salt, hash: await sha256(`${salt}:${pw}`) };
}

// ---------- guards ----------
function requireRole(uid, role) {
  const u = userById(getState(), uid);
  if (!u || u.role !== role) throw new Error('غير مسموح');
  return u;
}

// ---------- accounts (1.1, 1.2) ----------
export const PHONE_RE = /^09\d{8}$/;

export async function register(form) {
  const s = getState();
  const phone = normalizeDigits(form.phone);
  const name = (form.name || '').trim();
  if (name.length < 3) return fail('اكتب اسمك الكامل.');
  if (!PHONE_RE.test(phone)) return fail('رقم الموبايل لازم يكون بالصيغة 09XXXXXXXX، مثال: 0933123456');
  if (s.users.some((u) => u.phone === phone)) return fail('هذا الرقم عنده حساب، سجّل دخول.', { code: 'duplicate' });
  if (!form.password || form.password.length < 6) return fail('كلمة السر لازم تكون 6 أحرف أو أكثر.');
  if (!SOURCES.some((x) => x.id === form.source)) return fail('اختر مصدرك الدراسي.');
  if (form.source === 'other_platform' && !(form.sourceOther || '').trim()) return fail('اكتب اسم المنصة أو التطبيق.');
  if (!GOVERNORATES.includes(form.governorate)) return fail('اختر محافظتك.');
  const gpa = Number(normalizeDigits(form.gpa));
  if (!form.gpa || Number.isNaN(gpa) || gpa < 0 || gpa > 100) return fail('اكتب معدلك كنسبة مئوية بين 0 و100.');

  const { salt, hash } = await hashPassword(form.password);
  const stamp = nowStamp();
  const user = {
    id: nextId(s, 'u'),
    role: 'student',
    name,
    phone,
    salt,
    passwordHash: hash,
    source: form.source,
    sourceOther: form.source === 'other_platform' ? form.sourceOther.trim() : '',
    gpa,
    governorate: form.governorate,
    contactConsent: !!form.contactConsent,
    contactConsentAt: stamp,
    createdAt: stamp,
    hidden: false,
  };
  s.users.push(user);
  persist();
  setSessionUserId(user.id);
  return { ok: true, user };
}

export async function login(phoneRaw, password) {
  const s = getState();
  const phone = normalizeDigits(phoneRaw);
  const u = s.users.find((x) => x.phone === phone);
  const generic = fail('رقم الموبايل أو كلمة السر غير صحيحة. إذا نسيت كلمة السر، تواصل مع ميدكس لاستعادة حسابك.');
  if (!u) return generic;
  const { hash } = await hashPassword(password || '', u.salt);
  if (hash !== u.passwordHash) return generic;
  setSessionUserId(u.id);
  return { ok: true, user: u };
}

export function logout() {
  setSessionUserId(null);
}

// ---------- messages ----------
export function addMessage(s, studentId, type, text, extra = {}) {
  s.messages.push({ id: nextId(s, 'm'), studentId, type, text, read: false, sentAt: nowStamp(), chapterId: null, ...extra });
}

export function markRead(uid, messageId) {
  const s = getState();
  const m = s.messages.find((x) => x.id === messageId);
  if (!m || m.studentId !== uid || m.read) return;
  m.read = true;
  persist();
}

// ---------- student plan (3.1, 3.2, 3.3) ----------
export function copyTemplates(s, sid, subjectId, course, stamp = nowStamp()) {
  let n = 0;
  for (const ch of chaptersOf(s, subjectId, course)) {
    for (const t of templatesOf(s, ch.id)) {
      s.tasks.push({
        id: nextId(s, 't'),
        studentId: sid,
        subjectId,
        chapterId: ch.id,
        course,
        templateId: t.id,
        name: t.name,
        type: t.type,
        minutes: t.minutes,
        order: t.order,
        auto: false,
        loop: 0,
        causeId: null,
        done: false,
        prior: false,
        actualMinutes: null,
        doneAt: null,
        questions: null,
        errors: null,
        score: null,
        createdAt: stamp,
      });
      n++;
    }
  }
  return n;
}

export function suggestedEnd(s, subj) {
  return s.calendar.semesterEnd[subj.semester];
}

// subjectIds: one subject or all visible ones ("كل المواد").
// end: null = use each subject's suggested end.
export function savePlan(uid, subjectIds, start, end) {
  requireRole(uid, 'student');
  const s = getState();
  const d0 = today();
  if (!start) return fail('اختر تاريخ البداية.');
  for (const id of subjectIds) {
    const subj = subjectById(s, id);
    if (!subj || !subj.visible) return fail('المادة غير متاحة.');
    const e = end || suggestedEnd(s, subj);
    if (e < start) return fail('تاريخ النهاية لازم يكون بعد تاريخ البداية.');
    if (e < d0) return fail('تاريخ النهاية لازم يكون اليوم أو بعده.');
  }
  for (const id of subjectIds) {
    const subj = subjectById(s, id);
    const e = end || suggestedEnd(s, subj);
    let plan = planFor(s, uid, id);
    if (!plan) {
      plan = {
        id: nextId(s, 'p'),
        studentId: uid,
        subjectId: id,
        start,
        end: e,
        days: [...subj.suggestedDays],
        customEnd: e !== suggestedEnd(s, subj),
        customDays: false,
        mainCopied: false,
        reviewCopied: false,
        createdAt: nowStamp(),
      };
      s.plans.push(plan);
    } else {
      plan.start = start;
      plan.end = e;
      plan.customEnd = e !== suggestedEnd(s, subj);
    }
    // Copy main-course tasks once only (re-saving never duplicates).
    if (!plan.mainCopied) {
      copyTemplates(s, uid, id, 'main');
      plan.mainCopied = true;
    }
  }
  persist();
  return { ok: true };
}

export function setPlanDays(uid, subjectId, days) {
  requireRole(uid, 'student');
  const s = getState();
  const plan = planFor(s, uid, subjectId);
  if (!plan) return fail('حدد مواعيد المادة أولاً.');
  if (!days.length) return fail('كل مادة تحتاج يوماً واحداً على الأقل.');
  plan.days = [...days].sort();
  plan.customDays = true;
  persist();
  return { ok: true };
}

export function priorAllowance(s, uid, d0 = today()) {
  const starts = plansOf(s, uid).map((p) => p.start).sort();
  if (!starts.length || starts[0] >= d0) return 0;
  return s.settings.priorDailyCapHours * 60 * diffDays(starts[0], d0);
}

// Replace the set of "done before the app" tasks for one subject.
export function setPriorTasks(uid, subjectId, taskIds) {
  requireRole(uid, 'student');
  const s = getState();
  const plan = planFor(s, uid, subjectId);
  const d0 = today();
  if (!plan || plan.start >= d0) return fail('تعليم الدراسة السابقة متاح فقط لخطة تاريخ بدايتها قبل اليوم.');
  const chosen = new Set(taskIds);
  const mine = studentTasks(s, uid, subjectId, 'main');
  const otherPrior = s.tasks.filter((t) => t.studentId === uid && t.prior && t.subjectId !== subjectId);
  const total =
    otherPrior.reduce((a, t) => a + t.minutes, 0) +
    mine.filter((t) => chosen.has(t.id)).reduce((a, t) => a + t.minutes, 0);
  const cap = priorAllowance(s, uid, d0);
  if (total > cap) {
    return fail(`المهام المعلّمة (${hours(total)} ساعة) أكثر من المسموح. الحد الأقصى المسموح: ${hours(cap)} ساعة.`);
  }
  for (const t of mine) {
    if (t.done && !t.prior) continue; // finished inside the app; untouched
    if (chosen.has(t.id)) Object.assign(t, { done: true, prior: true, doneAt: null, actualMinutes: null });
    else if (t.prior) Object.assign(t, { done: false, prior: false });
  }
  persist();
  return { ok: true };
}

// ---------- review course (3.5) ----------
// Called whenever a student opens the app: copies review tasks at the start of each subject's review week.
export function syncStudent(uid) {
  const s = getState();
  const d0 = today();
  let changed = false;
  for (const plan of plansOf(s, uid)) {
    const subj = subjectById(s, plan.subjectId);
    if (!plan.reviewCopied && phaseOf(s, subj, d0) === 'review') {
      copyTemplates(s, uid, subj.id, 'review');
      plan.reviewCopied = true;
      addMessage(s, uid, 'review', `بدأ أسبوع مراجعة ${subj.name}`);
      changed = true;
    }
  }
  if (ensureSnapshots(s, uid, d0)) changed = true;
  if (changed) persist();
}

// Top-10 weekly notification (5.4).
export function checkRankNotice(uid) {
  const s = getState();
  const d0 = today();
  for (const u of s.users) if (u.role === 'student') ensureSnapshots(s, u.id, d0);
  const lb = leaderboard(s, d0);
  const me = lb.weekly.find((r) => r.id === uid);
  const ws = weekStart(d0);
  if (me && me.rank <= s.settings.topCount && me.weekCommitted > 0) {
    const already = s.messages.some((m) => m.studentId === uid && m.type === 'rank' && m.sentAt.slice(0, 10) >= ws);
    if (!already) addMessage(s, uid, 'rank', `مبروك! دخلت أفضل ${s.settings.topCount} بالترتيب الأسبوعي (ترتيبك ${me.rank}).`);
  }
  persist();
  return lb;
}

// ---------- completing tasks (4.1, 4.2, 4.3) ----------
function ownTask(s, uid, taskId) {
  const t = s.tasks.find((x) => x.id === taskId);
  if (!t || t.studentId !== uid) throw new Error('غير مسموح');
  return t;
}

export function checkTaskInput(task, actualMinutes, cycles) {
  const m = Number(normalizeDigits(actualMinutes));
  if (!actualMinutes || Number.isNaN(m) || m <= 0) return fail('اكتب الوقت الذي أخذته بالدقائق (أكبر من صفر).');
  if (task.type === 'cycles') {
    const q = Number(normalizeDigits(cycles?.questions));
    const e = Number(normalizeDigits(cycles?.errors));
    if (!q || Number.isNaN(q) || q <= 0) return fail('اكتب عدد الأسئلة.');
    if (cycles?.errors === '' || Number.isNaN(e) || e < 0) return fail('اكتب عدد الأخطاء (صفر إذا ما في أخطاء).');
    if (e > q) return fail('عدد الأخطاء لا يمكن أن يكون أكثر من عدد الأسئلة.');
  }
  return { ok: true, minutes: m, needsConfirm: m > task.minutes * 3 };
}

export function scoreOf(questions, errors) {
  return Math.round(((questions - errors) / questions) * 1000) / 10;
}

export function completeTask(uid, taskId, actualMinutes, cycles) {
  requireRole(uid, 'student');
  const s = getState();
  const t = ownTask(s, uid, taskId);
  if (t.done) return fail('المهمة منجزة من قبل.');
  const subj = subjectById(s, t.subjectId);
  const phase = phaseOf(s, subj, today());
  if ((t.course === 'main' && phase !== 'main') || (t.course === 'review' && phase !== 'review')) {
    return fail('هذا الكورس غير متاح الآن.');
  }
  const check = checkTaskInput(t, actualMinutes, cycles);
  if (!check.ok) return check;
  const result = applyCompletion(s, t, check.minutes, cycles, nowStamp());
  persist();
  return result;
}

// Shared by the UI and the demo-data generator.
export function applyCompletion(s, t, minutes, cycles, stamp) {
  Object.assign(t, { done: true, prior: false, actualMinutes: minutes, doneAt: stamp });
  const result = { ok: true, added: 0 };
  if (t.type === 'cycles') {
    const q = Number(normalizeDigits(cycles.questions));
    const e = Number(normalizeDigits(cycles.errors));
    t.questions = q;
    t.errors = e;
    t.score = scoreOf(q, e);
    t.passMark = s.settings.masteryThreshold; // later threshold changes don't affect this result
    result.score = t.score;
    if (t.score < t.passMark) {
      if (t.loop < maxLoops(s, t.course)) {
        addImprovementTasks(s, t, stamp);
        result.added = 2;
      } else {
        t.exhausted = true;
        result.exhausted = true;
      }
    }
  }
  return result;
}

function addImprovementTasks(s, cause, stamp) {
  const siblings = chapterTasks(s, cause.studentId, cause.chapterId).filter((x) => !x.auto);
  const studyMinutes = siblings.filter((x) => x.type === 'study').reduce((a, x) => a + x.minutes, 0);
  const loop = cause.loop + 1;
  const base = {
    studentId: cause.studentId,
    subjectId: cause.subjectId,
    chapterId: cause.chapterId,
    course: cause.course,
    templateId: null,
    auto: true,
    loop,
    causeId: cause.id,
    done: false,
    prior: false,
    actualMinutes: null,
    doneAt: null,
    questions: null,
    errors: null,
    score: null,
    createdAt: stamp,
  };
  s.tasks.push({
    ...base,
    id: nextId(s, 't'),
    name: `مراجعة الأخطاء (حلقة ${loop})`,
    type: 'other',
    minutes: Math.max(5, Math.round((studyMinutes * s.settings.errorReviewPct) / 100)),
    order: cause.order + loop * 0.1 + 0.01,
  });
  s.tasks.push({
    ...base,
    id: nextId(s, 't'),
    name: `إعادة حل الدورات (حلقة ${loop})`,
    type: 'cycles',
    minutes: cause.minutes,
    order: cause.order + loop * 0.1 + 0.02,
  });
}

export function canUndo(t, d0 = today()) {
  return t.done && !t.prior && t.doneAt && t.doneAt.slice(0, 10) === d0;
}

export function undoTask(uid, taskId) {
  requireRole(uid, 'student');
  const s = getState();
  const t = ownTask(s, uid, taskId);
  if (!canUndo(t)) return fail('التراجع متاح فقط لمهمة أنهيتها اليوم.');
  const children = s.tasks.filter((x) => x.causeId === t.id);
  if (children.some((x) => x.done)) return fail('تراجع عن مهام التحسين أولاً.');
  s.tasks = s.tasks.filter((x) => x.causeId !== t.id);
  Object.assign(t, { done: false, actualMinutes: null, doneAt: null, questions: null, errors: null, score: null, passMark: undefined, exhausted: false });
  persist();
  return { ok: true };
}

// ---------- admin: content (2.1, 2.2) ----------
export function subjectVisibilityProblem(s, subjectId) {
  const bad = s.chapters.filter(
    (c) => c.subjectId === subjectId && c.hasCycles && !templatesOf(s, c.id).some((t) => t.type === 'cycles'),
  );
  if (!bad.length) return null;
  return `لا يمكن إظهار المادة: هذه الفصول فيها دورات بلا مهمة "حل دورات": ${bad.map((c) => c.name).join('، ')}`;
}

export function saveSubject(uid, data) {
  requireRole(uid, 'admin');
  const s = getState();
  const name = (data.name || '').trim();
  if (!name) return fail('اكتب اسم المادة.');
  if (!data.suggestedDays?.length) return fail('اختر يوماً مقترحاً واحداً على الأقل.');
  let subj = data.id ? subjectById(s, data.id) : null;
  if (data.visible && subj) {
    const problem = subjectVisibilityProblem(s, subj.id);
    if (problem) return fail(problem);
  }
  if (data.visible && !subj) return fail('أضف الفصول والمهام أولاً، ثم أظهر المادة.');
  if (!subj) {
    subj = { id: nextId(s, 's'), examDate: null };
    s.subjects.push(subj);
  }
  const oldDays = subj.suggestedDays ? [...subj.suggestedDays].sort().join() : null;
  Object.assign(subj, {
    name,
    academicYear: data.academicYear || s.calendar.academicYear,
    semester: Number(data.semester) || 1,
    order: Number(data.order) || 1,
    visible: !!data.visible,
    suggestedDays: [...data.suggestedDays].sort(),
  });
  // Case 8: suggested days changed after students started.
  if (oldDays !== null && oldDays !== subj.suggestedDays.join()) {
    for (const p of s.plans.filter((x) => x.subjectId === subj.id)) {
      if (!p.customDays) {
        p.days = [...subj.suggestedDays];
        addMessage(s, p.studentId, 'schedule', `تغيّرت أيام الدراسة المقترحة لمادة ${subj.name}، وتحدّثت أيامك تلقائياً.`);
      } else {
        addMessage(s, p.studentId, 'schedule', `تغيّرت أيام الدراسة المقترحة لمادة ${subj.name}. أيامك التي اخترتها بقيت كما هي.`);
      }
    }
  }
  persist();
  return { ok: true, subject: subj };
}

export function saveChapter(uid, data) {
  requireRole(uid, 'admin');
  const s = getState();
  const name = (data.name || '').trim();
  if (!name) return fail('اكتب اسم الفصل.');
  let ch = data.id ? chapterById(s, data.id) : null;
  if (!ch) {
    ch = { id: nextId(s, 'c'), subjectId: data.subjectId, course: data.course };
    s.chapters.push(ch);
  }
  Object.assign(ch, {
    name,
    order: Number(data.order) || 1,
    attendanceMinutes: Number(data.attendanceMinutes) || 0,
    hasCycles: !!data.hasCycles,
  });
  const subj = subjectById(s, ch.subjectId);
  const warning = subj.visible ? subjectVisibilityProblem(s, subj.id) : null;
  if (warning) {
    subj.visible = false;
  }
  persist();
  return { ok: true, chapter: ch, warning: warning ? `${warning} — أُخفيت المادة حتى تُضاف المهمة.` : null };
}

export function deleteChapter(uid, chapterId) {
  requireRole(uid, 'admin');
  const s = getState();
  if (s.tasks.some((t) => t.chapterId === chapterId)) return fail('لا يمكن حذف فصل بدأ الطلاب بدراسته.');
  const ids = new Set(templatesOf(s, chapterId).map((t) => t.id));
  s.templates = s.templates.filter((t) => !ids.has(t.id));
  s.chapters = s.chapters.filter((c) => c.id !== chapterId);
  persist();
  return { ok: true };
}

export function saveTemplate(uid, data) {
  requireRole(uid, 'admin');
  const s = getState();
  const name = (data.name || '').trim();
  const minutes = Number(normalizeDigits(data.minutes));
  if (!name) return fail('اكتب اسم المهمة.');
  if (!minutes || minutes <= 0) return fail('اكتب الوقت المقدّر بالدقائق.');
  let t = data.id ? s.templates.find((x) => x.id === data.id) : null;
  if (!t) {
    t = { id: nextId(s, 'k'), chapterId: data.chapterId };
    s.templates.push(t);
  }
  Object.assign(t, { name, type: data.type, minutes, order: Number(data.order) || 1 });
  // Case 7: only students' unfinished copies take the new time.
  for (const st of s.tasks) {
    if (st.templateId === t.id && !st.done) Object.assign(st, { minutes, name, type: t.type, order: t.order });
  }
  const ch = chapterById(s, t.chapterId);
  const subj = subjectById(s, ch.subjectId);
  const problem = subj.visible ? subjectVisibilityProblem(s, subj.id) : null;
  if (problem) subj.visible = false;
  persist();
  return { ok: true, warning: problem ? `${problem} — أُخفيت المادة.` : null };
}

export function deleteTemplate(uid, templateId) {
  requireRole(uid, 'admin');
  const s = getState();
  if (s.tasks.some((t) => t.templateId === templateId)) return fail('لا يمكن حذف مهمة نُسخت لطلاب. عدّل وقتها بدلاً من ذلك.');
  const t = s.templates.find((x) => x.id === templateId);
  s.templates = s.templates.filter((x) => x.id !== templateId);
  const subj = subjectById(s, chapterById(s, t.chapterId).subjectId);
  if (subj.visible && subjectVisibilityProblem(s, subj.id)) subj.visible = false;
  persist();
  return { ok: true };
}

// ---------- admin: calendar (2.3) ----------
export function saveCalendar(uid, { academicYear, semesterEnd }) {
  requireRole(uid, 'admin');
  const s = getState();
  const changed = [1, 2].filter((k) => semesterEnd[k] && semesterEnd[k] !== s.calendar.semesterEnd[k]);
  s.calendar.academicYear = academicYear || s.calendar.academicYear;
  for (const k of changed) {
    s.calendar.semesterEnd[k] = semesterEnd[k];
    for (const p of s.plans) {
      const subj = subjectById(s, p.subjectId);
      if (subj.semester !== k) continue;
      if (!p.customEnd) {
        p.end = semesterEnd[k];
        addMessage(s, p.studentId, 'schedule', `تغيّر تاريخ نهاية الكورس الأساسي المقترح لمادة ${subj.name}، وتحدّث تاريخ نهايتك.`);
      } else {
        addMessage(s, p.studentId, 'schedule', `تغيّر تاريخ نهاية الكورس الأساسي المقترح لمادة ${subj.name}. تاريخك الذي اخترته بقي كما هو.`);
      }
    }
  }
  persist();
  return { ok: true };
}

export function setExamDate(uid, subjectId, date) {
  requireRole(uid, 'admin');
  const s = getState();
  const subj = subjectById(s, subjectId);
  const old = subj.examDate;
  subj.examDate = date || null;
  if (old && old !== subj.examDate) {
    // Case 9: postponed exam — review week moves; everyone studying the subject is told.
    for (const p of s.plans.filter((x) => x.subjectId === subjectId)) {
      addMessage(s, p.studentId, 'schedule', `تغيّر موعد امتحان ${subj.name}، وانتقل أسبوع مراجعتها معه.`);
    }
  }
  persist();
  return { ok: true };
}

// ---------- admin: offers (6.3) ----------
export function studentsWithPriorOffers(rows) {
  const s = getState();
  return [...new Map(rows.filter((r) => offersReceived(s, r.studentId).length).map((r) => [r.studentId, userById(s, r.studentId)])).values()];
}

export function sendOffers(uid, rows, text, code) {
  requireRole(uid, 'admin');
  const s = getState();
  if (!rows.length) return fail('اختر طالباً واحداً على الأقل.');
  if (!(text || '').trim()) return fail('اكتب نص العرض.');
  if (!(code || '').trim()) return fail('اكتب كود العرض.');
  for (const r of rows) {
    const ch = chapterById(s, r.chapterId);
    addMessage(s, r.studentId, 'offer', text.trim(), { code: code.trim(), chapterId: ch.id, sentBy: uid });
  }
  persist();
  return { ok: true, count: rows.length };
}

// Review course identical to the main one (e.g. English 1, History of Medicine).
export function copyMainToReview(uid, subjectId) {
  requireRole(uid, 'admin');
  const s = getState();
  if (chaptersOf(s, subjectId, 'review').length) return fail('كورس المراجعة فيه فصول من قبل.');
  for (const c of chaptersOf(s, subjectId, 'main')) {
    const nc = { ...c, id: nextId(s, 'c'), course: 'review' };
    s.chapters.push(nc);
    for (const t of templatesOf(s, c.id)) s.templates.push({ ...t, id: nextId(s, 'k'), chapterId: nc.id });
  }
  persist();
  return { ok: true };
}
