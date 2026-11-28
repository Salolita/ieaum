import {useEffect, useState} from 'react';
import {uniLudoLabel, type RankingRow} from '../../portal/uniludo/service';
import {gameRequest, type GameRanking} from './api';
import {GameBrand} from './components/GameBrand';
import {toPersianDigits as digits} from './utils/storage';

export function Ranking({token, onClose, onError}: {token: string; onClose: () => void; onError: (failure: unknown) => string}) {
  const [rows, setRows] = useState<RankingRow[]>();
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    void gameRequest<GameRanking>('ranking', {sort:'points'}, token)
      .then(data => { if (current) setRows(data.ranking); })
      .catch(failure => { if (current) setError(onError(failure)); });
    return () => { current = false; };
  }, [token, onError]);
  const own = rows?.find(row => row.mine);

  return <main className="game-ranking">
    <section className="game-panel" aria-labelledby="ranking-title">
      <GameBrand />
      <h1 id="ranking-title">رنکینگ {uniLudoLabel}</h1>
      <p>نفر اول ۱۵، نفر دوم ۱۰ و نفر سوم ۵ ژتون می‌گیرند.</p>
      {error ? <p role="alert" className="game-error">{error}</p> : !rows ? <p role="status">در حال دریافت رنکینگ…</p> : <>
        {own && <p>رتبهٔ شما <strong>{digits(own.rank)}</strong> · <strong>{digits(own.points)}</strong> ژتون</p>}
        <div className="game-ranking-scroll" role="region" aria-label="جدول رنکینگ" tabIndex={0}>
          <table className="game-ranking-table">
            <thead><tr>
              <th scope="col">رتبه</th><th scope="col">بازیکن</th><th scope="col">ژتون</th><th scope="col">برد</th><th scope="col">بازی</th>
            </tr></thead>
            <tbody>{rows.map((row, index) => <tr key={index} data-mine={row.mine}>
              <td>{row.rank <= 3 ? <span role="img" aria-label={'رتبهٔ ' + digits(row.rank)}>{['🥇','🥈','🥉'][row.rank - 1]}</span> : digits(row.rank)}</td>
              <td><bdi>{row.name}</bdi></td><td>{digits(row.points)}</td><td>{digits(row.wins)}</td><td>{digits(row.games)}</td>
            </tr>)}
            {!rows.length && <tr><td colSpan={5}>هنوز نتیجه‌ای ثبت نشده است.</td></tr>}</tbody>
          </table>
        </div>
      </>}
      <button type="button" onClick={onClose} className="game-secondary game-back">بازگشت به بازی</button>
    </section>
  </main>;
}
