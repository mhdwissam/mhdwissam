import { useState } from 'react';
import { useStore } from '../hooks.js';
import { markRead } from '../lib/actions.js';
import { chapterById, subjectById } from '../lib/engine.js';
import { prettyDate } from '../lib/dates.js';

const TYPE = {
  offer: { icon: '🎁', label: 'عرض من ميدكس' },
  schedule: { icon: '🗓️', label: 'تغيير بالمواعيد' },
  rank: { icon: '🏆', label: 'الترتيب' },
  review: { icon: '📚', label: 'أسبوع المراجعة' },
};

export default function Inbox({ me }) {
  const { s } = useStore();
  const [openId, setOpenId] = useState(null);
  const mine = s.messages.filter((m) => m.studentId === me.id).sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1));

  const open = (m) => {
    setOpenId(openId === m.id ? null : m.id);
    markRead(me.id, m.id);
  };

  return (
    <div className="stack">
      <h2>الإشعارات</h2>
      {!mine.length && <p className="muted">ما في إشعارات بعد.</p>}
      {mine.map((m) => {
        const t = TYPE[m.type];
        const ch = m.chapterId ? chapterById(s, m.chapterId) : null;
        return (
          <div key={m.id} className={`card msg ${m.read ? '' : 'unread'}`} onClick={() => open(m)} role="button" tabIndex={0}>
            <div className="row between">
              <strong>{t.icon} {t.label}</strong>
              <span className="small muted">{prettyDate(m.sentAt.slice(0, 10))}</span>
            </div>
            {openId === m.id ? (
              <div className="msg-body">
                {ch && <p className="small muted">بخصوص: {subjectById(s, ch.subjectId).name} — {ch.name}</p>}
                <p>{m.text}</p>
                {m.code && <p>الكود: <code dir="ltr" className="code">{m.code}</code></p>}
              </div>
            ) : (
              <p className="small muted ellipsis">{m.text}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
