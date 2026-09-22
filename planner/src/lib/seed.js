// Realistic demo data: first-semester subjects of the medical preparatory year,
// an admin account, one known demo student and ~30 classmates with a few weeks of history.
// The chapter lists are illustrative until the trainers' real plans (medx-chapter-durations.xlsx) are entered.
import { emptyState, nextId } from './store.js';
import { addDays, eachDay, weekday } from './dates.js';
import { GOVERNORATES } from './constants.js';
import { hashPassword, copyTemplates, applyCompletion } from './actions.js';
import { requiredAtStart, studentTasks, ensureSnapshots } from './engine.js';

export const DEMO_ADMIN = { phone: '0999000000', password: 'admin123' };
export const DEMO_STUDENT = { phone: '0933123456', password: '123456' };

// Deterministic PRNG so every fresh load looks the same.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// [name, hasCycles, size(1..3)]
const SUBJECTS = [
  {
    name: 'علم الحياة الخلوية', semester: 1, days: [6, 1, 3], exam: '2027-01-09',
    main: [
      ['مقدمة الكورس وخطة الدراسة', false, 0],
      ['بنية الخلية ومكوّناتها', true, 2],
      ['الغشاء الخلوي والنقل عبره', true, 3],
      ['العضيات الخلوية', true, 3],
      ['النواة والمادة الوراثية', true, 2],
      ['الانقسام الخيطي', true, 2],
      ['الانقسام المنصّف', true, 2],
      ['التنفس الخلوي', true, 3],
      ['الوراثة المندلية', true, 2],
      ['الأنسجة الأساسية', true, 2],
    ],
    review: [
      ['مراجعة: الخلية والغشاء', true, 2],
      ['مراجعة: العضيات والنواة', true, 2],
      ['مراجعة: الانقسام والوراثة', true, 2],
      ['مراجعة: الاستقلاب والأنسجة', true, 2],
    ],
  },
  {
    name: 'الكيمياء العامة', semester: 1, days: [0, 2], exam: '2027-01-16',
    main: [
      ['فيديو تأسيسي: أساسيات الحساب الكيميائي', false, 1],
      ['البنية الذرية', true, 2],
      ['الجدول الدوري وخواص العناصر', true, 2],
      ['الروابط الكيميائية', true, 3],
      ['المحاليل والتراكيز', true, 3],
      ['الحموض والأسس وpH', true, 3],
      ['الحركية الكيميائية', true, 2],
      ['التوازن الكيميائي', true, 2],
    ],
    review: [
      ['مراجعة: الذرة والروابط', true, 2],
      ['مراجعة: المحاليل والحموض', true, 2],
      ['مراجعة: الحركية والتوازن', true, 2],
    ],
  },
  {
    name: 'الفيزياء الطبية', semester: 1, days: [1, 4], exam: '2027-01-23',
    main: [
      ['مقدمة: الأدوات الرياضية', false, 1],
      ['الحركة والقوى', true, 2],
      ['العمل والطاقة', true, 2],
      ['الموائع وضغط الدم', true, 3],
      ['الحرارة وتنظيمها بالجسم', true, 2],
      ['الموجات والصوت والأمواج فوق الصوتية', true, 2],
      ['الضوء والعين', true, 2],
      ['الكهرباء الحيوية', true, 3],
    ],
    review: [
      ['مراجعة: الميكانيك والموائع', true, 2],
      ['مراجعة: الحرارة والموجات', true, 2],
      ['مراجعة: الضوء والكهرباء', true, 2],
    ],
  },
  {
    name: 'اللغة الإنكليزية 1', semester: 1, days: [3, 5], exam: '2027-01-30', reviewSame: true,
    main: [
      ['Unit 1: Medical Terminology Basics', true, 1],
      ['Unit 2: Prefixes and Suffixes', true, 1],
      ['Unit 3: The Body Systems', true, 2],
      ['Unit 4: Reading Medical Texts', true, 1],
      ['Unit 5: Grammar Review', true, 1],
    ],
  },
  {
    name: 'تاريخ الطب', semester: 1, days: [5], exam: null, reviewSame: true,
    main: [
      ['الطب في الحضارات القديمة', true, 1],
      ['الطب عند الإغريق والرومان', true, 1],
      ['الطب العربي والإسلامي', true, 1],
      ['الطب في عصر النهضة', true, 1],
      ['نشأة الطب الحديث', true, 1],
    ],
  },
];

// Draft subject for the second semester: hidden, and its first chapter still lacks a "حل دورات" task.
const DRAFT = {
  name: 'علم التشريح', semester: 2, days: [6, 2], exam: null, hidden: true,
  main: [['العظام والمفاصل', true, 3]],
  review: [],
};

const STUDY = [90, 150, 210];

function addTemplates(s, chapterId, hasCycles, size, withCycles = true) {
  const add = (name, type, minutes, order) =>
    s.templates.push({ id: nextId(s, 'k'), chapterId, name, type, minutes, order });
  if (size === 0) {
    add('مشاهدة المقدمة', 'other', 30, 1);
    return;
  }
  add('دراسة المحاضرة', 'study', STUDY[size - 1], 1);
  add('كتابة الملخص', 'summary', 30 + size * 15, 2);
  if (hasCycles && withCycles) add('حل دورات الفصل', 'cycles', 30 + size * 20, 3);
}

function buildContent(s, r) {
  const all = [...SUBJECTS, DRAFT];
  all.forEach((def, i) => {
    const subj = {
      id: nextId(s, 's'),
      name: def.name,
      academicYear: s.calendar.academicYear,
      semester: def.semester,
      order: i + 1,
      visible: !def.hidden,
      suggestedDays: def.days,
      examDate: def.exam,
    };
    s.subjects.push(subj);
    const addCourse = (course, list) =>
      list.forEach(([name, hasCycles, size], j) => {
        const ch = {
          id: nextId(s, 'c'),
          subjectId: subj.id,
          course,
          name,
          order: j + 1,
          attendanceMinutes: size === 0 ? 20 : Math.round(40 + size * 35 + r() * 30),
          hasCycles,
        };
        s.chapters.push(ch);
        addTemplates(s, ch.id, hasCycles, size, !def.hidden);
      });
    addCourse('main', def.main);
    addCourse('review', def.reviewSame ? def.main : def.review);
  });
}

const FIRST = ['محمد', 'أحمد', 'لين', 'سارة', 'يوسف', 'رهف', 'عمر', 'نور', 'حسن', 'مرح', 'علي', 'جود', 'خالد', 'تالا', 'زين', 'بتول', 'مجد', 'هبة', 'كرم', 'ريم', 'إبراهيم', 'غنى', 'باسل', 'ليان', 'طارق', 'آية', 'فراس', 'شهد', 'سامر', 'دانة'];
const LAST = ['الأحمد', 'الحسن', 'الخطيب', 'العلي', 'المصري', 'الحلبي', 'الشامي', 'الزعبي', 'السيد', 'النجار', 'الحمصي', 'الديري', 'القاسم', 'عثمان', 'درويش', 'الأسعد', 'حداد', 'يوسف', 'الإدلبي', 'سليمان'];
const SOURCES_MIX = ['medx', 'medx', 'youtube', 'youtube', 'self', 'institute', 'other_platform'];
const OTHER_PLATFORMS = ['إيليت', 'منصة نبراس', 'تطبيق دروسي'];

function pick(r, arr) {
  return arr[Math.floor(r() * arr.length)];
}

function simulate(s, r, student, plans, diligence, skill, until) {
  for (const d of eachDay(plans.map((p) => p.start).sort()[0], until)) {
    for (const plan of plans) {
      if (d < plan.start || !plan.days.includes(weekday(d))) continue;
      const req = requiredAtStart(s, plan, d);
      if (req == null || r() > 0.55 + diligence * 0.4) continue; // skipped this day
      const target = req * diligence * (0.7 + r() * 0.6);
      let doneMin = 0;
      let hour = 16 + Math.floor(r() * 5);
      while (doneMin < target) {
        const next = studentTasks(s, student.id, plan.subjectId, 'main')
          .filter((t) => !t.done)
          .sort((a, b) => chapterOrder(s, a) - chapterOrder(s, b) || a.order - b.order)[0];
        if (!next) break;
        // Tasks are chunky: less diligent students stop short instead of overshooting.
        if (doneMin > 0 && doneMin + next.minutes > target * 1.2) break;
        if (doneMin === 0 && next.minutes > target * 1.5 && r() > diligence * 0.7) break;
        const actual = Math.max(5, Math.round((next.minutes * (0.8 + r() * 0.7)) / 5) * 5);
        let cycles = null;
        if (next.type === 'cycles') {
          const q = 20 + Math.floor(r() * 4) * 10;
          const score = Math.min(100, Math.max(40, skill + (r() - 0.5) * 24 + next.loop * 6));
          cycles = { questions: q, errors: Math.round(q * (1 - score / 100)) };
        }
        const stamp = `${d}T${String(Math.min(hour, 23)).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}`;
        applyCompletion(s, next, actual, cycles, stamp);
        doneMin += next.minutes;
        hour++;
      }
    }
  }
}

const orderCache = new Map();
function chapterOrder(s, t) {
  if (!orderCache.has(t.chapterId)) orderCache.set(t.chapterId, s.chapters.find((c) => c.id === t.chapterId).order);
  return orderCache.get(t.chapterId);
}

export async function buildSeed(todayStr) {
  const s = emptyState();
  const r = rng(20260922);
  orderCache.clear();
  buildContent(s, r);
  const visible = s.subjects.filter((x) => x.visible);
  const yesterday = addDays(todayStr, -1);

  const mkUser = async (fields, password) => {
    const { salt, hash } = await hashPassword(password);
    const u = { id: nextId(s, 'u'), salt, passwordHash: hash, hidden: false, ...fields };
    s.users.push(u);
    return u;
  };

  await mkUser(
    { role: 'admin', name: 'إدارة ميدكس', phone: DEMO_ADMIN.phone, createdAt: `${addDays(todayStr, -30)}T09:00` },
    DEMO_ADMIN.password,
  );

  const mkPlan = (u, subj, start, created) => {
    const plan = {
      id: nextId(s, 'p'), studentId: u.id, subjectId: subj.id, start,
      end: s.calendar.semesterEnd[subj.semester], days: [...subj.suggestedDays],
      customEnd: false, customDays: false, mainCopied: true, reviewCopied: false,
      createdAt: `${created}T10:00`,
    };
    s.plans.push(plan);
    copyTemplates(s, u.id, subj.id, 'main', `${created}T10:00`);
    return plan;
  };

  const classmates = [];
  const pw = await hashPassword('student123');
  for (let i = 0; i < 30; i++) {
    const reg = addDays(todayStr, -(10 + Math.floor(r() * 12)));
    const source = pick(r, SOURCES_MIX);
    const u = {
      id: nextId(s, 'u'), role: 'student', salt: pw.salt, passwordHash: pw.hash, hidden: false,
      name: `${FIRST[i]} ${pick(r, LAST)}`,
      phone: `09${String(30000000 + Math.floor(r() * 69999999)).padStart(8, '0')}`,
      source, sourceOther: source === 'other_platform' ? pick(r, OTHER_PLATFORMS) : '',
      gpa: Math.round((82 + r() * 18) * 10) / 10,
      governorate: pick(r, GOVERNORATES.slice(0, 9)),
      contactConsent: r() > 0.35,
      createdAt: `${reg}T${10 + Math.floor(r() * 10)}:15`,
    };
    u.contactConsentAt = u.createdAt;
    s.users.push(u);
    const start = addDays(reg, -Math.floor(r() * 3));
    const subs = r() > 0.4 ? visible : visible.slice(0, 3);
    const plans = subs.map((subj) => mkPlan(u, subj, start, reg));
    classmates.push({ u, plans, diligence: 0.25 + r() * 1.0, skill: 72 + r() * 26 });
  }

  // The known demo student: YouTube learner, fairly regular, struggling in chemistry.
  const demoReg = addDays(todayStr, -14);
  const demo = await mkUser(
    {
      role: 'student', name: 'أحمد الخطيب', phone: DEMO_STUDENT.phone, source: 'youtube', sourceOther: '',
      gpa: 91.4, governorate: 'حمص', contactConsent: true, contactConsentAt: `${demoReg}T18:20`,
      createdAt: `${demoReg}T18:20`,
    },
    DEMO_STUDENT.password,
  );
  const demoPlans = visible.slice(0, 3).map((subj) => mkPlan(demo, subj, demoReg, demoReg));

  for (const c of classmates) simulate(s, r, c.u, c.plans, c.diligence, c.skill, yesterday);
  simulate(s, r, demo, demoPlans, 0.8, 80, yesterday);

  for (const u of s.users) if (u.role === 'student') ensureSnapshots(s, u.id, yesterday);
  return s;
}
