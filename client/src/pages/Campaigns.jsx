import { useEffect, useMemo, useState } from 'react';
import { api, money } from '../api';
import { Modal, copyText } from '../components/ui';

const emptyForm = {
  name: '',
  key: '',
  traffic_source_id: '',
  offer_id: '',
  landing_id: '',
  cost_model: 'cpc',
  cost_value: 0,
  status: 'active',
  notes: '',
};

export default function Campaigns() {
  const [rows, setRows] = useState([]);
  const [sources, setSources] = useState([]);
  const [offers, setOffers] = useState([]);
  const [landings, setLandings] = useState([]);
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');

  const load = () =>
    Promise.all([
      api.get(`/api/campaigns${q ? `?q=${encodeURIComponent(q)}` : ''}`),
      api.get('/api/sources'),
      api.get('/api/offers'),
      api.get('/api/landings'),
    ]).then(([c, s, o, l]) => {
      setRows(c);
      setSources(s);
      setOffers(o);
      setLandings(l);
    });

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, []);

  const clickBase = useMemo(() => window.location.origin, []);

  async function save(e) {
    e.preventDefault();
    const body = {
      ...form,
      traffic_source_id: form.traffic_source_id ? Number(form.traffic_source_id) : null,
      offer_id: form.offer_id ? Number(form.offer_id) : null,
      landing_id: form.landing_id ? Number(form.landing_id) : null,
      cost_value: Number(form.cost_value || 0),
      key: form.key || undefined,
    };
    try {
      if (editingId) await api.put(`/api/campaigns/${editingId}`, body);
      else await api.post('/api/campaigns', body);
      setForm(null);
      setEditingId(null);
      await load();
    } catch (err) {
      setMsg(err.message);
    }
  }

  async function remove(id) {
    if (!confirm('Удалить кампанию?')) return;
    await api.del(`/api/campaigns/${id}`);
    await load();
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Кампании</h1>
          <p>Трекинг-ссылки, офферы, лендинги и стоимость клика</p>
        </div>
        <div className="toolbar">
          <input
            className="input sm"
            placeholder="Поиск…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
          />
          <button className="btn ghost" type="button" onClick={load}>
            Найти
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              setEditingId(null);
              setForm({ ...emptyForm });
            }}
          >
            + Кампания
          </button>
        </div>
      </div>

      {msg && <p className="neg">{msg}</p>}

      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Название</th>
                <th>Key</th>
                <th>Источник</th>
                <th>Оффер</th>
                <th>CPC</th>
                <th>Статус</th>
                <th>Ссылка</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const url = `${clickBase}/click/${r.key}`;
                return (
                  <tr key={r.id}>
                    <td className="mono">{r.id}</td>
                    <td>{r.name}</td>
                    <td className="mono">{r.key}</td>
                    <td>{r.source_name || '—'}</td>
                    <td>{r.offer_name || '—'}</td>
                    <td>{money(r.cost_value)}</td>
                    <td>
                      <span className={`badge ${r.status}`}>{r.status}</span>
                    </td>
                    <td>
                      <div className="copy-row">
                        <code title={url}>{url}</code>
                        <button
                          className="btn ghost sm"
                          type="button"
                          onClick={async () => {
                            const ok = await copyText(url);
                            setMsg(ok ? 'Ссылка скопирована' : 'Не удалось скопировать');
                          }}
                        >
                          Copy
                        </button>
                      </div>
                    </td>
                    <td>
                      <div className="toolbar">
                        <button
                          className="btn ghost sm"
                          type="button"
                          onClick={() => {
                            setEditingId(r.id);
                            setForm({
                              name: r.name,
                              key: r.key,
                              traffic_source_id: r.traffic_source_id || '',
                              offer_id: r.offer_id || '',
                              landing_id: r.landing_id || '',
                              cost_model: r.cost_model,
                              cost_value: r.cost_value,
                              status: r.status,
                              notes: r.notes || '',
                            });
                          }}
                        >
                          Edit
                        </button>
                        <button className="btn danger sm" type="button" onClick={() => remove(r.id)}>
                          Del
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={9}>
                    <div className="empty">Кампаний пока нет</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <Modal
          title={editingId ? 'Редактировать кампанию' : 'Новая кампания'}
          onClose={() => setForm(null)}
        >
          <form onSubmit={save}>
            <div className="form-grid">
              <label className="lbl">
                Название
                <input
                  className="input"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="lbl">
                Key (пусто = авто)
                <input
                  className="input mono"
                  value={form.key}
                  onChange={(e) => setForm({ ...form, key: e.target.value })}
                />
              </label>
              <label className="lbl">
                Источник
                <select
                  className="select"
                  value={form.traffic_source_id}
                  onChange={(e) => setForm({ ...form, traffic_source_id: e.target.value })}
                >
                  <option value="">—</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="lbl">
                Оффер
                <select
                  className="select"
                  value={form.offer_id}
                  onChange={(e) => setForm({ ...form, offer_id: e.target.value })}
                >
                  <option value="">—</option>
                  {offers.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="lbl">
                Лендинг (опционально)
                <select
                  className="select"
                  value={form.landing_id}
                  onChange={(e) => setForm({ ...form, landing_id: e.target.value })}
                >
                  <option value="">Direct to offer</option>
                  {landings.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="lbl">
                CPC
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  value={form.cost_value}
                  onChange={(e) => setForm({ ...form, cost_value: e.target.value })}
                />
              </label>
              <label className="lbl">
                Статус
                <select
                  className="select"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="active">active</option>
                  <option value="paused">paused</option>
                </select>
              </label>
              <label className="lbl full">
                Заметки
                <textarea
                  className="textarea"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </label>
            </div>
            <p className="hint" style={{ marginTop: '0.85rem' }}>
              Макросы в URL оффера/лендинга: {'{clickid}'}, {'{campaign_id}'}, {'{campaign_name}'},{' '}
              {'{cost}'}, {'{country}'}, {'{token1}'}…{'{token5}'}
            </p>
            <div className="modal-actions">
              <button className="btn ghost" type="button" onClick={() => setForm(null)}>
                Отмена
              </button>
              <button className="btn" type="submit">
                Сохранить
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
