import { useEffect, useState } from 'react';
import { api, money } from '../api';
import { Modal } from '../components/ui';

const empty = {
  name: '',
  url: '',
  payout: 0,
  currency: 'USD',
  geo: '',
  network: '',
  status: 'active',
  notes: '',
};

export default function Offers() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const load = () => api.get('/api/offers').then(setRows);
  useEffect(() => {
    load().catch(console.error);
  }, []);

  async function save(e) {
    e.preventDefault();
    const body = { ...form, payout: Number(form.payout || 0) };
    if (editingId) await api.put(`/api/offers/${editingId}`, body);
    else await api.post('/api/offers', body);
    setForm(null);
    setEditingId(null);
    await load();
  }

  async function remove(id) {
    if (!confirm('Удалить оффер?')) return;
    await api.del(`/api/offers/${id}`);
    await load();
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Офферы</h1>
          <p>Партнёрские ссылки с макросами и выплатой</p>
        </div>
        <button
          className="btn"
          type="button"
          onClick={() => {
            setEditingId(null);
            setForm({ ...empty });
          }}
        >
          + Оффер
        </button>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Название</th>
                <th>Сеть</th>
                <th>GEO</th>
                <th>Payout</th>
                <th>URL</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.id}</td>
                  <td>{r.name}</td>
                  <td>{r.network || '—'}</td>
                  <td>{r.geo || '—'}</td>
                  <td>{money(r.payout, r.currency || 'USD')}</td>
                  <td>
                    <code className="mono" title={r.url}>
                      {r.url.slice(0, 48)}…
                    </code>
                  </td>
                  <td>
                    <span className={`badge ${r.status}`}>{r.status}</span>
                  </td>
                  <td>
                    <div className="toolbar">
                      <button
                        className="btn ghost sm"
                        type="button"
                        onClick={() => {
                          setEditingId(r.id);
                          setForm({ ...empty, ...r });
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
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <Modal title={editingId ? 'Редактировать оффер' : 'Новый оффер'} onClose={() => setForm(null)}>
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
                Сеть
                <input
                  className="input"
                  value={form.network}
                  onChange={(e) => setForm({ ...form, network: e.target.value })}
                />
              </label>
              <label className="lbl full">
                URL (с макросами)
                <input
                  className="input mono"
                  required
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://aff.net/?sub1={clickid}"
                />
              </label>
              <label className="lbl">
                Payout
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  value={form.payout}
                  onChange={(e) => setForm({ ...form, payout: e.target.value })}
                />
              </label>
              <label className="lbl">
                Currency
                <input
                  className="input"
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                />
              </label>
              <label className="lbl">
                GEO
                <input
                  className="input"
                  value={form.geo}
                  onChange={(e) => setForm({ ...form, geo: e.target.value })}
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
            </div>
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
