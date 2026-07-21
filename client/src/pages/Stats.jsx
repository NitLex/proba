import { useEffect, useState } from 'react';
import { api, money, num, pct, today, todayMinus } from '../api';

const groups = [
  { id: 'by-campaign', label: 'По кампаниям' },
  { id: 'by-offer', label: 'По офферам' },
  { id: 'by-source', label: 'По источникам' },
  { id: 'by-day', label: 'По дням' },
];

export default function Stats() {
  const [group, setGroup] = useState('by-campaign');
  const [from, setFrom] = useState(todayMinus(7));
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState([]);
  const [overview, setOverview] = useState(null);

  useEffect(() => {
    const q = `from=${from}&to=${to}`;
    Promise.all([
      api.get(`/api/stats/${group}?${q}`),
      api.get(`/api/stats/overview?${q}`),
    ]).then(([r, o]) => {
      setRows(r);
      setOverview(o);
    });
  }, [group, from, to]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Статистика</h1>
          <p>Отчёты в стиле Binom: клики, cost, revenue, ROI, CR, EPC</p>
        </div>
        <div className="toolbar">
          <input className="input sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input className="input sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {overview && (
        <div className="metrics">
          <div className="metric">
            <div className="metric-label">Клики</div>
            <div className="metric-value">{num(overview.clicks)}</div>
          </div>
          <div className="metric">
            <div className="metric-label">Конверсии</div>
            <div className="metric-value">{num(overview.conversions)}</div>
          </div>
          <div className="metric">
            <div className="metric-label">Profit</div>
            <div className={`metric-value ${overview.profit >= 0 ? 'pos' : 'neg'}`}>
              {money(overview.profit)}
            </div>
          </div>
          <div className="metric">
            <div className="metric-label">ROI</div>
            <div className="metric-value">{overview.roi == null ? '—' : pct(overview.roi)}</div>
          </div>
        </div>
      )}

      <div className="toolbar" style={{ marginBottom: '0.85rem' }}>
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            className={`btn ${group === g.id ? '' : 'ghost'} sm`}
            onClick={() => setGroup(g.id)}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{group === 'by-day' ? 'День' : 'Название'}</th>
                {group === 'by-campaign' && <th>Источник</th>}
                {group === 'by-campaign' && <th>Оффер</th>}
                {group === 'by-offer' && <th>Сеть</th>}
                <th>Клики</th>
                <th>Conv</th>
                <th>CR</th>
                <th>Cost</th>
                <th>Revenue</th>
                <th>Profit</th>
                <th>ROI</th>
                <th>EPC</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id ?? r.day}>
                  <td>{r.name || r.day}</td>
                  {group === 'by-campaign' && <td>{r.source_name}</td>}
                  {group === 'by-campaign' && <td>{r.offer_name}</td>}
                  {group === 'by-offer' && <td>{r.network || '—'}</td>}
                  <td>{num(r.clicks)}</td>
                  <td>{num(r.conversions)}</td>
                  <td>{pct(r.cr)}</td>
                  <td>{money(r.cost)}</td>
                  <td>{money(r.revenue)}</td>
                  <td className={r.profit >= 0 ? 'pos' : 'neg'}>{money(r.profit)}</td>
                  <td>{r.roi == null ? '—' : pct(r.roi)}</td>
                  <td>{money(r.epc)}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={12}>
                    <div className="empty">Нет данных за период</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
