import { useCallback, useEffect, useState } from 'react';
import { api, money, today, todayMinus, downloadCsv } from '../api';

export default function Logs() {
  const [clicks, setClicks] = useState([]);
  const [conversions, setConversions] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [tab, setTab] = useState('clicks');
  const [from, setFrom] = useState(todayMinus(6));
  const [to, setTo] = useState(today());
  const [q, setQ] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [status, setStatus] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/api/campaigns').then(setCampaigns).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '100', from, to });
    if (q.trim()) params.set('q', q.trim());
    if (campaignId) params.set('campaign_id', campaignId);
    const convParams = new URLSearchParams(params);
    if (status) convParams.set('status', status);

    Promise.all([
      api.get(`/api/stats/recent-clicks?${params}`),
      api.get(`/api/stats/recent-conversions?${convParams}`),
    ])
      .then(([c, v]) => {
        setClicks(c);
        setConversions(v);
        setErr('');
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [from, to, q, campaignId, status]);

  useEffect(() => {
    load();
  }, [load]);

  async function exportCsv() {
    try {
      await downloadCsv(
        `/api/stats/export/${tab === 'clicks' ? 'clicks' : 'conversions'}`,
        `${tab}.csv`
      );
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Логи</h1>
          <p>Клики и постбеки — фильтры и быстрый просмотр</p>
        </div>
        <div className="toolbar">
          <button
            type="button"
            className={`btn ${tab === 'clicks' ? '' : 'ghost'} sm`}
            onClick={() => setTab('clicks')}
          >
            Клики
          </button>
          <button
            type="button"
            className={`btn ${tab === 'conversions' ? '' : 'ghost'} sm`}
            onClick={() => setTab('conversions')}
          >
            Конверсии
          </button>
          <button className="btn ghost sm" type="button" onClick={load} disabled={loading}>
            {loading ? '…' : 'Обновить'}
          </button>
          <button className="btn ghost sm" type="button" onClick={exportCsv}>
            CSV
          </button>
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: '0.85rem', flexWrap: 'wrap' }}>
        <input className="input sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className="input sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <select
          className="select sm"
          value={campaignId}
          onChange={(e) => setCampaignId(e.target.value)}
        >
          <option value="">Все кампании</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {tab === 'conversions' && (
          <select className="select sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Все статусы</option>
            <option value="lead">lead</option>
            <option value="sale">sale</option>
            <option value="rejected">rejected</option>
            <option value="hold">hold</option>
          </select>
        )}
        <input
          className="input sm"
          style={{ minWidth: '12rem' }}
          placeholder="Поиск: clickid, GEO, токен…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {err && <p className="neg">{err}</p>}

      <div className="panel">
        <div className="table-wrap">
          {tab === 'clicks' ? (
            <table>
              <thead>
                <tr>
                  <th>Время</th>
                  <th>Click ID</th>
                  <th>Кампания</th>
                  <th>Источник</th>
                  <th>GEO</th>
                  <th>Device</th>
                  <th>Bot</th>
                  <th>Cost</th>
                  <th>Tokens</th>
                </tr>
              </thead>
              <tbody>
                {clicks.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">{c.created_at}</td>
                    <td className="mono">{c.clickid}</td>
                    <td>{c.campaign_name}</td>
                    <td>{c.source_name || '—'}</td>
                    <td>{c.country || '—'}</td>
                    <td>{c.device}</td>
                    <td>{c.is_bot ? 'yes' : '—'}</td>
                    <td>{money(c.cost, c.currency || 'RUB')}</td>
                    <td className="mono">
                      {[c.token1, c.token2, c.token3].filter(Boolean).join(' · ') || '—'}
                    </td>
                  </tr>
                ))}
                {!clicks.length && (
                  <tr>
                    <td colSpan={9}>
                      <div className="empty">Нет кликов по фильтру</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Время</th>
                  <th>Click ID</th>
                  <th>Кампания</th>
                  <th>Оффер</th>
                  <th>Статус</th>
                  <th>Payout</th>
                  <th>TX</th>
                </tr>
              </thead>
              <tbody>
                {conversions.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">{c.created_at}</td>
                    <td className="mono">{c.clickid}</td>
                    <td>{c.campaign_name}</td>
                    <td>{c.offer_name}</td>
                    <td>
                      <span className={`badge ${c.status}`}>{c.status}</span>
                    </td>
                    <td>{money(c.payout, c.currency || 'RUB')}</td>
                    <td className="mono">{c.txid || '—'}</td>
                  </tr>
                ))}
                {!conversions.length && (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty">Нет конверсий по фильтру</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
