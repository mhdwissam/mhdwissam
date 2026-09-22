import { useEffect, useState } from 'react';
import { useStore } from '../hooks.js';
import { checkRankNotice, syncStudent } from '../lib/actions.js';
import { leaderboard } from '../lib/engine.js';
import { weekStart, prettyDate } from '../lib/dates.js';

export default function Ranking({ me }) {
  const { s, today } = useStore();
  const [tab, setTab] = useState('weekly');
  useEffect(() => { syncStudent(me.id); checkRankNotice(me.id); }, [me.id, today]);

  const lb = leaderboard(s, today);
  const list = lb[tab];
  const mine = list.find((r) => r.id === me.id);
  const top = list.slice(0, s.settings.topCount).filter((r) => r.rank <= s.settings.topCount);
  const showTotal = lb.activeCount >= s.settings.minActiveForTotal;
  const key = tab === 'weekly' ? 'weekCommitted' : 'totalCommitted';

  return (
    <div className="stack">
      <h2>الترتيب</h2>
      <div className="tabs">
        <button className={tab === 'weekly' ? 'on' : ''} onClick={() => setTab('weekly')}>هذا الأسبوع</button>
        <button className={tab === 'overall' ? 'on' : ''} onClick={() => setTab('overall')}>الترتيب العام</button>
      </div>

      {mine ? (
        <div className="card my-rank">
          <div>
            <span className="muted small">ترتيبك {tab === 'weekly' ? `من السبت ${prettyDate(weekStart(today))}` : 'العام'}</span>
            <div className="big-number">{mine.rank}{showTotal && <small> من أصل {list.length}</small>}</div>
          </div>
          <div className="my-rank-stats">
            <span><b>{mine[key]}</b> يوم ملتزم</span>
            <span>🔥 <b>{mine.streak}</b> أيام متتالية</span>
          </div>
        </div>
      ) : (
        <p className="muted">اسمك غير ظاهر بالترتيب حالياً.</p>
      )}

      <div className="card">
        <h3>أفضل {s.settings.topCount}</h3>
        <ol className="leaders">
          {top.map((r) => (
            <li key={r.id} className={r.id === me.id ? 'me' : ''}>
              <span className="rank-no">{r.rank}</span>
              <span className="grow">{r.name}</span>
              <span className="small muted">{r[key]} يوم</span>
            </li>
          ))}
        </ol>
      </div>

      <details className="card small">
        <summary>كيف ينحسب الترتيب؟</summary>
        <ul>
          <li>اليوم الملتزم: يوم فيه مادة على الأقل، أنجزت فيه مهاماً وقتها المقدّر يساوي أو يزيد عن مطلوب ذلك اليوم.</li>
          <li>الترتيب الأسبوعي يبدأ من الصفر كل سبت. عند التعادل يتقدم من أنجز وقتاً مقدّراً أكثر.</li>
          <li>اليوم الذي بلا مواد لا يُحسب ولا يقطع سلسلتك.</li>
          <li>العلامات والوقت الفعلي والدراسة السابقة للتطبيق لا تدخل بالترتيب، وأقصى ما يُحسب باليوم 12 ساعة.</li>
        </ul>
      </details>
    </div>
  );
}
