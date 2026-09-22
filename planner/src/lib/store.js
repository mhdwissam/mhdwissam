import { DEFAULT_SETTINGS } from './constants.js';
import { realToday } from './dates.js';

const KEY = 'medx-planner-v1';
const CLOCK_KEY = 'medx-planner-clock';
const SESSION_KEY = 'medx-planner-session';

let state = null;
let version = 0;
const listeners = new Set();

export function emptyState() {
  return {
    settings: { ...DEFAULT_SETTINGS },
    calendar: { academicYear: '2026-2027', semesterEnd: { 1: '2027-01-01', 2: '2027-07-10' } },
    subjects: [],
    chapters: [],
    templates: [],
    users: [],
    plans: [],
    tasks: [],
    snapshots: {}, // studentId -> date -> { subjectId: requiredMinutes }
    messages: [],
    seq: 1,
  };
}

function safeGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function safeSet(k, v) {
  try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* ignore */ }
}

export function getState() {
  if (!state) {
    const raw = safeGet(KEY);
    state = raw ? JSON.parse(raw) : null;
  }
  return state;
}

export function setState(s) {
  state = s;
  persist();
}

export function persist() {
  safeSet(KEY, JSON.stringify(state));
  version++;
  listeners.forEach((l) => l());
}

export function subscribe(l) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getVersion() {
  return version;
}

export function nextId(s, prefix) {
  return `${prefix}${s.seq++}`;
}

export function clearAll() {
  safeSet(KEY, null);
  safeSet(SESSION_KEY, null);
  safeSet(CLOCK_KEY, null);
  state = null;
}

// ---- Demo clock: lets testers jump to any day to see daily recalculation,
// review weeks and post-exam behaviour. Not a product feature.
export function today() {
  return safeGet(CLOCK_KEY) || realToday();
}
export function setDemoToday(d) {
  safeSet(CLOCK_KEY, d || null);
  version++;
  listeners.forEach((l) => l());
}
export function isDemoClock() {
  return !!safeGet(CLOCK_KEY);
}

export function nowStamp() {
  // Time of day comes from the real clock, date from the (demo) clock.
  const t = new Date().toISOString().slice(11, 16);
  return `${today()}T${t}`;
}

export function getSessionUserId() {
  return safeGet(SESSION_KEY);
}
export function setSessionUserId(id) {
  safeSet(SESSION_KEY, id);
  version++;
  listeners.forEach((l) => l());
}
