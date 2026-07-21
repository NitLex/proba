import { useEffect, useState } from 'react';
import { api, money } from '../api';

export default function Logs() {
  const [clicks, setClicks] = useState([]);
  const [conversions, setConversions] = useState([]);
  const [tab, setTab] = useState('clicks');

  useEffect(() => {
    Promise.all([
      api.get('/api/stats/recent-clicks?limit=100'),
      api.get('/api/stats/recent-conversions?limit=100'),
    ]).then(([c, v]) => {
      setClicks(c);
      setConversions(v);
    });
  }, []);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Клики и конверсии</h1>
          <p>Живой лог трафика и постбеков</p>
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
        </div>
      </div>

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
                    <td>{money(c.cost)}</td>
                    <td className="mono">
                      {[c.token1, c.token2, c.token3].filter(Boolean).join(' · ') || '—'}
                    </td>
                  </tr>
                ))}
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
                    <td>{money(c.payout, c.currency || 'USD')}</td>
                    <td className="mono">{c.txid || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
