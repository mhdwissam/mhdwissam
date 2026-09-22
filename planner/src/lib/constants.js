export const DEFAULT_SETTINGS = {
  masteryThreshold: 90, // %
  errorReviewPct: 15, // % of study-task time in the chapter
  loopsMain: 3, // improvement loops after the first attempt (main course)
  loopsReview: 1, // improvement loops after the first attempt (review course)
  greenGap: 5, // %
  yellowGap: 15, // %
  rankDailyCapHours: 12,
  subjectDayCapHours: 12,
  priorDailyCapHours: 6,
  minActiveForTotal: 200,
  topCount: 10,
  reviewWeekDays: 6,
  telegramGroup: '',
  telegramChannel: '',
};

export const GOVERNORATES = [
  'دمشق', 'ريف دمشق', 'حلب', 'حمص', 'حماة', 'اللاذقية', 'طرطوس',
  'إدلب', 'درعا', 'السويداء', 'القنيطرة', 'دير الزور', 'الرقة', 'الحسكة',
];

export const SOURCES = [
  { id: 'medx', label: 'بروفيسور ميدكس' },
  { id: 'youtube', label: 'يوتيوب' },
  { id: 'other_platform', label: 'منصة أو تطبيق تعليمي آخر' },
  { id: 'institute', label: 'معهد' },
  { id: 'self', label: 'دراسة ذاتية' },
];

export const TASK_TYPES = [
  { id: 'study', label: 'دراسة' },
  { id: 'summary', label: 'ملخص' },
  { id: 'cycles', label: 'حل دورات' },
  { id: 'other', label: 'أخرى' },
];

export const COURSE_LABEL = { main: 'الكورس الأساسي', review: 'كورس المراجعة' };

export function sourceLabel(u) {
  const s = SOURCES.find((x) => x.id === u.source);
  if (!s) return '—';
  return u.source === 'other_platform' && u.sourceOther ? `${s.label}: ${u.sourceOther}` : s.label;
}

export function typeLabel(t) {
  return TASK_TYPES.find((x) => x.id === t)?.label ?? t;
}

// Accept Arabic-Indic digits too.
export function normalizeDigits(s) {
  return String(s ?? '')
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .trim();
}

export function hours(min, digits = 1) {
  const h = min / 60;
  return Number.isInteger(h) ? String(h) : h.toFixed(digits);
}

export function dur(min) {
  if (min == null) return '—';
  if (min < 60) return `${Math.round(min)} دقيقة`;
  const h = Math.round((min / 60) * 10) / 10;
  if (h === 1) return 'ساعة واحدة';
  if (h === 2) return 'ساعتان';
  return `${h} ساعات`;
}
