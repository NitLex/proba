import { useEffect, useState } from 'react';
import { api } from '../api';
import { Modal } from '../components/ui';

const empty = {
  name: '',
  postback_url: '',
  cost_param: 'cost',
  currency: 'USD',
  token1: '',
  token2: '',
  token3: '',
  token4: '',
  token5: '',
  notes: '',
};

export default function Sources() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const load = () => api.get('/api/sources').then(setRows);
  useEffect(() => {
    load().catch(console.error);
  }, []);

  async function save(e) {
    e.preventDefault();
    if (editingId) await api.put(`/api/sources/${editingId}`, form);
    else await api.post('/api/sources', form);
    setForm(null);
    setEditingId(null);
    await load();
  }

  async function remove(id) {
    if (!confirm('Удалить источник?')) return;
    await api.del(`/api/sources/${id}`);
    await load();
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Источники трафика</h1>
          <p>Маппинг токенов и параметра стоимости из рекламных кабинетов</p>
        </div>
        <button
          className="btn"
          type="button"
          onClick={() => {
            setEditingId(null);
            setForm({ ...empty });
          }}
        >
          + Источник
        </button>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Название</th>
                <th>Cost param</th>
                <th>Tokens</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.id}</td>
                  <td>{r.name}</td>
                  <td className="mono">{r.cost_param}</td>
                  <td className="mono">
                    {[r.token1, r.token2, r.token3, r.token4, r.token5].filter(Boolean).join(', ') ||
                      '—'}
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
        <Modal
          title={editingId ? 'Редактировать источник' : 'Новый источник'}
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
                Cost param
                <input
                  className="input mono"
                  value={form.cost_param}
                  onChange={(e) => setForm({ ...form, cost_param: e.target.value })}
                />
              </label>
              {['token1', 'token2', 'token3', 'token4', 'token5'].map((t) => (
                <label className="lbl" key={t}>
                  {t} (query name)
                  <input
                    className="input mono"
                    value={form[t]}
                    onChange={(e) => setForm({ ...form, [t]: e.target.value })}
                    placeholder="utm_campaign"
                  />
                </label>
              ))}
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
