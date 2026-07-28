import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, num, pct, today, todayMinus } from '../api';
import { Metric } from '../components/ui';

const PRESETS = [
  { id: 'today', label: 'Сегодня', from: () => today(), to: () => today() },
  { id: '7d', label: '7 дней', from: () => todayMinus(6), to: () => today() },
  { id: '30d', label: '30 дней', from: () => todayMinus(29), to: () => today() },
];

export default function Dashboard() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [preset, setPreset] = useState('today');
  const [overview, setOverview] = useState(null);
  const [byDay, setByDay] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [recentConv, setRecentConv] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = `from=${from}&to=${to}`;
    Promise.all([
      api.get(`/api/stats/overview?${q}`),
      api.get(`/api/stats/by-day?${q}`),
      api.get(`/api/stats/by-campaign?${q}`),
      api.get(`/api/stats/recent-conversions?limit=8&from=${from}&to=${to}`),
    ])
      .then(([o, d, c, conv]) => {
        setOverview(o);
        setByDay(d);
        setCampaigns(c.slice(0, 8));
        setRecentConv(conv);
        setError('');
      })
      .catch((e) => setError(e.message));
  }, [from, to]);

  const alerts = useMemo(() => buildAlerts(overview, campaigns), [overview, campaigns]);
  const maxClicks = Math.max(...byDay.map((d) => d.clicks), 1);
  const cur = overview?.currency || 'RUB';

  function applyPreset(id) {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setPreset(id);
    setFrom(p.from());
    setTo(p.to());
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Дашборд</h1>
          <p>
            {from === to ? from : `${from} — ${to}`}
          </p>
        </div>
        <div className="toolbar">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`btn ${preset === p.id ? '' : 'ghost'} sm`}
              onClick={() => applyPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
          <input
            className="input sm"
            type="date"
            value={from}
            onChange={(e) => {
              setPreset('');
              setFrom(e.target.value);
            }}
          />
          <input
            className="input sm"
            type="date"
            value={to}
            onChange={(e) => {
              setPreset('');
              setTo(e.target.value);
            }}
          />
          <Link className="btn sm" to="/campaigns">
            + Кампания
          </Link>
        </div>
      </div>

      {error && <p className="neg">{error}</p>}

      {alerts.length > 0 && (
        <div className="panel" style={{ marginBottom: '1rem', borderColor: 'rgba(201, 133, 46, 0.35)' }}>
          <div className="panel-head">
            <h2>Предупреждения</h2>
          </div>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', lineHeight: 1.55 }}>
            {alerts.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {overview && (
        <div className="metrics" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
          <Metric
            label="Profit"
            value={money(overview.profit, cur)}
            tone={overview.profit >= 0 ? 'pos' : 'neg'}
          />
          <Metric label="ROI" value={overview.roi == null ? '—' : pct(overview.roi)} />
          <Metric label="Revenue" value={money(overview.revenue, cur)} />
          <Metric label="Cost" value={money(overview.cost, cur)} />
          <Metric label="Конверсии" value={num(overview.conversions)} />
          <Metric label="Клики" value={num(overview.clicks)} />
          <Metric label="Уники" value={num(overview.uniques)} />
          <Metric label="CR" value={pct(overview.cr)} />
          <Metric label="EPC" value={money(overview.epc, cur)} />
          <Metric label="CPA" value={overview.cpa == null ? '—' : money(overview.cpa, cur)} />
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
                  <th>ROI</th>
                  <th>Profit</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{num(c.clicks)}</td>
                    <td>{num(c.conversions)}</td>
                    <td>{c.roi == null ? '—' : pct(c.roi)}</td>
                    <td className={c.profit >= 0 ? 'pos' : 'neg'}>
                      {money(c.profit, c.currency || cur)}
                    </td>
                  </tr>
                ))}
                {!campaigns.length && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyHint />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: '1rem' }}>
        <div className="panel-head">
          <h2>Последние конверсии</h2>
          <Link className="btn ghost sm" to="/logs">
            Логи
          </Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Время</th>
                <th>Кампания</th>
                <th>Оффер</th>
                <th>Статус</th>
                <th>Payout</th>
              </tr>
            </thead>
            <tbody>
              {recentConv.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.created_at}</td>
                  <td>{c.campaign_name}</td>
                  <td>{c.offer_name || '—'}</td>
                  <td>
                    <span className={`badge ${c.status}`}>{c.status}</span>
                  </td>
                  <td>{money(c.payout, c.currency || cur)}</td>
                </tr>
              ))}
              {!recentConv.length && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty">Конверсий за период нет</div>
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

function buildAlerts(overview, campaigns) {
  if (!overview) return [];
  const out = [];
  if (overview.clicks >= 50 && overview.conversions === 0) {
    out.push(`Есть ${overview.clicks} кликов за период, конверсий 0 — проверь постбек и оффер.`);
  }
  if (overview.roi != null && overview.roi < -30 && overview.cost > 0) {
    out.push(`ROI ${overview.roi}% ниже −30% за выбранный период.`);
  }
  for (const c of campaigns.slice(0, 5)) {
    if (c.clicks >= 40 && c.conversions === 0) {
      out.push(`Кампания «${c.name}»: ${c.clicks} кликов без конверсий.`);
    }
  }
  return out.slice(0, 5);
}

function EmptyHint() {
  return <div className="empty">Пока нет данных — создайте кампанию и отправьте трафик</div>;
}
