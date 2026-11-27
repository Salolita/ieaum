import { useEffect, useState } from 'react';
import type { RankingRow } from '../../portal/uniludo/service';
import { gameRequest, type GameRanking } from './api';
import { toPersianDigits as digits } from './utils/storage';

export function Ranking({token, onClose, onError}: {token: string; onClose: () => void; onError: (failure: unknown) => string}) {
  const [rows, setRows] = useState<RankingRow[]>();
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    void gameRequest<GameRanking>('ranking', {}, token)
      .then(data => { if (current) setRows(data.ranking); })
      .catch(failure => { if (current) setError(onError(failure)); });
    return () => { current = false; };
  }, [token, onError]);
  const own = rows?.find(row => row.mine);

  return <main className="game-ranking">
    <section className="game-panel" aria-labelledby="ranking-title">
      <button type="button" onClick={onClose} className="game-secondary">بازگشت به بازی</button>
      <h1 id="ranking-title">رنکینگ منچ صنایع</h1>
      <p>هر برد امتیازی ۳ امتیاز دارد. رنکینگ بر اساس امتیاز مرتب می‌شود.</p>
      {error ? <p role="alert" className="game-error">{error}</p> : !rows ? <p role="status">در حال دریافت رنکینگ…</p> : <>
        <p>{own ? <>رتبهٔ شما <strong>{digits(own.rank)}</strong> · امتیاز <strong>{digits(own.points)}</strong></>
          : 'پس از پایان اولین بازی امتیازی، رتبهٔ شما در این بخش نمایش داده می‌شود.'}</p>
        {rows.length > 0 && <div role="table" aria-label="جدول رنکینگ">
          <div role="row" className="game-ranking-row"><strong role="columnheader">رتبه</strong><strong role="columnheader">بازیکن</strong>
            <strong role="columnheader">امتیاز</strong><strong role="columnheader">برد</strong></div>
          {rows.map(row => <div role="row" key={row.username} className="game-ranking-row" data-mine={row.mine}>
            <span role="cell">{digits(row.rank)}</span><span role="cell"><bdi>{row.username}</bdi>{row.mine ? ' (شما)' : ''}</span>
            <span role="cell">{digits(row.points)}</span><span role="cell">{digits(row.wins)}</span>
          </div>)}
        </div>}
      </>}
    </section>
  </main>;
}
