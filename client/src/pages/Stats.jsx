import { useEffect, useState } from 'react';
import { api, money, num, pct, today, todayMinus, downloadCsv } from '../api';

const groups = [
  { id: 'by-campaign', label: 'По кампаниям' },
  { id: 'by-offer', label: 'По офферам' },
  { id: 'by-source', label: 'По источникам' },
  { id: 'by-day', label: 'По дням' },
  { id: 'by-token', label: 'По токенам' },
];

export default function Stats() {
  const [group, setGroup] = useState('by-campaign');
  const [token, setToken] = useState('token1');
  const [from, setFrom] = useState(todayMinus(7));
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState([]);
  const [overview, setOverview] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    const q = new URLSearchParams({ from, to });
    if (group === 'by-token') q.set('token', token);
    Promise.all([
      api.get(`/api/stats/${group}?${q}`),
      api.get(`/api/stats/overview?${q}`),
    ])
      .then(([r, o]) => {
        setRows(r);
        setOverview(o);
        setErr('');
      })
      .catch((e) => setErr(e.message));
  }, [group, from, to, token]);

  async function exportCsv() {
    try {
      const q = new URLSearchParams({ from, to, format: 'csv' });
      if (group === 'by-token') q.set('token', token);
      await downloadCsv(`/api/stats/${group}?${q}`, `${group}.csv`);
    } catch (e) {
      setErr(e.message);
    }
  }

  const cur = overview?.currency || 'USD';

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Статистика</h1>
          <p>Отчёты: клики, cost, revenue, ROI, CR, EPC, токены</p>
        </div>
        <div className="toolbar">
          <input className="input sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input className="input sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <button className="btn ghost sm" type="button" onClick={exportCsv}>
            CSV
          </button>
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
              {money(overview.profit, cur)}
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
        {group === 'by-token' && (
          <select className="select sm" value={token} onChange={(e) => setToken(e.target.value)}>
            <option value="token1">token1</option>
            <option value="token2">token2</option>
            <option value="token3">token3</option>
            <option value="token4">token4</option>
            <option value="token5">token5</option>
          </select>
        )}
      </div>

      {err && <p className="neg">{err}</p>}

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
              {rows.map((r) => {
                const rowCur = r.currency || cur;
                return (
                <tr key={r.id ?? r.day ?? r.name}>
                  <td>{r.name || r.day}</td>
                  {group === 'by-campaign' && <td>{r.source_name}</td>}
                  {group === 'by-campaign' && <td>{r.offer_name}</td>}
                  {group === 'by-offer' && <td>{r.network || '—'}</td>}
                  <td>{num(r.clicks)}</td>
                  <td>{num(r.conversions)}</td>
                  <td>{pct(r.cr)}</td>
                  <td>{money(r.cost, rowCur)}</td>
                  <td>{money(r.revenue, rowCur)}</td>
                  <td className={r.profit >= 0 ? 'pos' : 'neg'}>{money(r.profit, rowCur)}</td>
                  <td>{r.roi == null ? '—' : pct(r.roi)}</td>
                  <td>{money(r.epc, rowCur)}</td>
                </tr>
              );})}
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
