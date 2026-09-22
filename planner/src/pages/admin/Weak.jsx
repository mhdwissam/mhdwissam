import { useState } from 'react';
import { useStore } from '../../hooks.js';
import { sendOffers, studentsWithPriorOffers } from '../../lib/actions.js';
import { CHAPTER_STATUS, chapterById, chaptersOf, offersReceived, subjectById, userById, weakRows } from '../../lib/engine.js';
import { GOVERNORATES, sourceLabel } from '../../lib/constants.js';
import { prettyDate } from '../../lib/dates.js';
import { Alert, Badge, Field } from '../../components/ui.jsx';

const DEFAULT_TEXT = 'لاحظنا إنك بحاجة دعم بهالفصل. اشترك ببروفيسور ميدكس واحصل على شرح الفصل مع حل الدورات خطوة بخطوة. الكود صالح للفصلين الدراسيين.';

export default function Weak({ me }) {
  const { s } = useStore();
  const [filters, setFilters] = useState({ subject: '', chapter: '', governorate: '', consent: '' });
  const [selected, setSelected] = useState(new Set());
  const [text, setText] = useState(DEFAULT_TEXT);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState(null);

  const all = weakRows(s);
  const rows = all.filter((r) =>
    (!filters.subject || r.subject.id === filters.subject) &&
    (!filters.chapter || r.chapter.id === filters.chapter) &&
    (!filters.governorate || r.student.governorate === filters.governorate) &&
    (!filters.consent || String(r.student.contactConsent) === filters.consent));
  const keyOf = (r) => `${r.student.id}|${r.chapter.id}`;
  const subjectsWithWeak = [...new Map(all.map((r) => [r.subject.id, r.subject])).values()];
  const chapterOptions = filters.subject ? chaptersOf(s, filters.subject, 'main').concat(chaptersOf(s, filters.subject, 'review')) : [];

  const toggle = (k) => {
    const n = new Set(selected);
    n.has(k) ? n.delete(k) : n.add(k);
    setSelected(n);
  };
  const allOn = rows.length > 0 && rows.every((r) => selected.has(keyOf(r)));
  const toggleAll = () => setSelected(allOn ? new Set() : new Set(rows.map(keyOf)));

  const send = () => {
    const picked = [...selected].map((k) => {
      const [studentId, chapterId] = k.split('|');
      return { studentId, chapterId };
    });
    const repeat = studentsWithPriorOffers(picked);
    if (repeat.length && !confirm(`تنبيه: هؤلاء الطلاب وصلهم عرض من قبل:\n${repeat.map((u) => `• ${u.name}`).join('\n')}\n\nمتابعة الإرسال؟`)) return;
    const r = sendOffers(me.id, picked, text, code);
    if (!r.ok) return setMsg({ tone: 'error', text: r.error });
    setMsg({ tone: 'success', text: `أُرسل العرض (${r.count} رسالة) ووصل كإشعار داخل التطبيق.` });
    setSelected(new Set());
  };

  const sent = s.messages.filter((m) => m.type === 'offer').sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1));
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value, ...(k === 'subject' ? { chapter: '' } : {}) });

  return (
    <div className="stack">
      <h2>الطلاب الضعاف غير المشتركين</h2>
      <p className="muted small">طلاب مصدرهم غير بروفيسور ميدكس، عندهم فصل فيه دورات آخر علامته أقل من العتبة أو حالته "بحاجة متابعة".</p>

      <div className="card grid-4">
        <Field label="المادة">
          <select value={filters.subject} onChange={set('subject')}>
            <option value="">الكل</option>
            {subjectsWithWeak.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
        <Field label="الفصل">
          <select value={filters.chapter} onChange={set('chapter')} disabled={!filters.subject}>
            <option value="">الكل</option>
            {chapterOptions.map((c) => <option key={c.id} value={c.id}>{c.course === 'review' ? 'مراجعة · ' : ''}{c.name}</option>)}
          </select>
        </Field>
        <Field label="المحافظة">
          <select value={filters.governorate} onChange={set('governorate')}>
            <option value="">الكل</option>
            {GOVERNORATES.map((g) => <option key={g}>{g}</option>)}
          </select>
        </Field>
        <Field label="الموافقة على الاتصال">
          <select value={filters.consent} onChange={set('consent')}>
            <option value="">الكل</option>
            <option value="true">موافق</option>
            <option value="false">غير موافق</option>
          </select>
        </Field>
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" checked={allOn} onChange={toggleAll} aria-label="تحديد الكل" /></th>
              <th>الطالب</th><th>الموبايل</th><th>المحافظة</th><th>المصدر</th><th>الفصل الضعيف</th><th>آخر علامة</th><th>الحالة</th><th>الاتصال</th><th>عروض سابقة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const k = keyOf(r);
              const prev = offersReceived(s, r.student.id).length;
              return (
                <tr key={k} className={selected.has(k) ? 'selected' : ''} onClick={() => toggle(k)}>
                  <td><input type="checkbox" checked={selected.has(k)} onChange={() => toggle(k)} onClick={(e) => e.stopPropagation()} /></td>
                  <td><strong>{r.student.name}</strong></td>
                  <td dir="ltr" className="nowrap">{r.student.phone}</td>
                  <td>{r.student.governorate}</td>
                  <td className="small">{sourceLabel(r.student)}</td>
                  <td className="small">{r.subject.name}<br /><span className="muted">{r.chapter.course === 'review' ? 'مراجعة · ' : ''}{r.chapter.name}</span></td>
                  <td className="txt-red">{r.lastScore != null ? `${r.lastScore}%` : '—'}</td>
                  <td><Badge tone={CHAPTER_STATUS[r.status].tone}>{CHAPTER_STATUS[r.status].label}</Badge></td>
                  <td>{r.student.contactConsent ? <Badge tone="green">📞 موافق</Badge> : <Badge>غير موافق</Badge>}</td>
                  <td>{prev ? <Badge tone="yellow">{prev}</Badge> : '—'}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={10} className="center muted">لا يوجد طلاب مطابقون.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>إرسال عرض اشتراك ({selected.size} محدد)</h3>
        <Field label="نص العرض"><textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <Field label="الكود (يُكتب يدوياً من نظام ميدكس)" hint="كود واحد صالح للفصلين الدراسيين. يظهر فقط برسالة الطالب المقصود.">
          <input dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} placeholder="MEDX-XXXX" />
        </Field>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <button className="btn btn-primary" disabled={!selected.size} onClick={send}>إرسال كإشعار داخل التطبيق</button>
      </div>

      <div className="card table-wrap">
        <h3>العروض المرسلة</h3>
        <table className="compact">
          <thead><tr><th>لمن</th><th>عن أي فصل</th><th>متى</th><th>الكود</th><th>قُرئ</th></tr></thead>
          <tbody>
            {sent.map((m) => {
              const ch = chapterById(s, m.chapterId);
              return (
                <tr key={m.id}>
                  <td>{userById(s, m.studentId)?.name}</td>
                  <td className="small">{subjectById(s, ch.subjectId).name} — {ch.name}</td>
                  <td className="nowrap small">{prettyDate(m.sentAt.slice(0, 10))} {m.sentAt.slice(11, 16)}</td>
                  <td dir="ltr">{m.code}</td>
                  <td>{m.read ? '✓' : '—'}</td>
                </tr>
              );
            })}
            {!sent.length && <tr><td colSpan={5} className="center muted">لم يُرسل أي عرض بعد.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
