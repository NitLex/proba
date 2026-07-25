import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, num, pct, today, todayMinus } from '../api';
import { Metric } from '../components/ui';

export default function Dashboard() {
  const [from] = useState(todayMinus(7));
  const [to] = useState(today());
  const [overview, setOverview] = useState(null);
  const [byDay, setByDay] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = `from=${from}&to=${to}`;
    Promise.all([
      api.get(`/api/stats/overview?${q}`),
      api.get(`/api/stats/by-day?${q}`),
      api.get(`/api/stats/by-campaign?${q}`),
    ])
      .then(([o, d, c]) => {
        setOverview(o);
        setByDay(d);
        setCampaigns(c.slice(0, 8));
      })
      .catch((e) => setError(e.message));
  }, [from, to]);

  const maxClicks = Math.max(...byDay.map((d) => d.clicks), 1);
  const cur = overview?.currency || 'USD';

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Дашборд</h1>
          <p>
            Последние 7 дней · {from} — {to}
          </p>
        </div>
        <Link className="btn" to="/campaigns">
          + Кампания
        </Link>
      </div>

      {error && <p className="neg">{error}</p>}

      {overview && (
        <div className="metrics" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          <Metric label="Клики" value={num(overview.clicks)} />
          <Metric label="Уники" value={num(overview.uniques)} />
          <Metric label="Конверсии" value={num(overview.conversions)} />
          <Metric label="CR" value={pct(overview.cr)} />
          <Metric label="Cost" value={money(overview.cost, cur)} />
          <Metric label="Revenue" value={money(overview.revenue, cur)} />
          <Metric
            label="Profit"
            value={money(overview.profit, cur)}
            tone={overview.profit >= 0 ? 'pos' : 'neg'}
          />
          <Metric label="ROI" value={overview.roi == null ? '—' : pct(overview.roi)} />
        </div>
      )}

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <h2>Клики по дням</h2>
          </div>
          <div className="chart">
            {byDay.length === 0 ? (
              <EmptyHint />
            ) : (
              byDay.map((d) => (
                <div
                  key={d.day}
                  className="chart-bar"
                  style={{ height: `${Math.max(8, (d.clicks / maxClicks) * 100)}%` }}
                  data-tip={`${d.day}: ${d.clicks} кликов`}
                />
              ))
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Топ кампаний</h2>
            <Link className="btn ghost sm" to="/stats">
              Все отчёты
            </Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Кампания</th>
                  <th>Клики</th>
                  <th>Conv</th>
                  <th>Profit</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{num(c.clicks)}</td>
                    <td>{num(c.conversions)}</td>
                    <td className={c.profit >= 0 ? 'pos' : 'neg'}>
                      {money(c.profit, c.currency || cur)}
                    </td>
                  </tr>
                ))}
                {!campaigns.length && (
                  <tr>
                    <td colSpan={4}>
                      <EmptyHint />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyHint() {
  return <div className="empty">Пока нет данных — создайте кампанию и отправьте трафик</div>;
}
