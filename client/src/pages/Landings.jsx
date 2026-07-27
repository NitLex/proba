import { useEffect, useState } from 'react';
import { api } from '../api';
import { Modal, LabelWithHint } from '../components/ui';

const empty = { name: '', url: '', notes: '' };

export default function Landings() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const load = () => api.get('/api/landings').then(setRows);
  useEffect(() => {
    load().catch(console.error);
  }, []);

  async function save(e) {
    e.preventDefault();
    if (editingId) await api.put(`/api/landings/${editingId}`, form);
    else await api.post('/api/landings', form);
    setForm(null);
    setEditingId(null);
    await load();
  }

  async function remove(id) {
    if (!confirm('Удалить лендинг?')) return;
    await api.del(`/api/landings/${id}`);
    await load();
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Лендинги</h1>
          <p>
            Преленды перед оффером. На CTA используйте{' '}
            <span className="mono">/to-offer?clickid={'{clickid}'}</span>
          </p>
        </div>
        <button
          className="btn"
          type="button"
          onClick={() => {
            setEditingId(null);
            setForm({ ...empty });
          }}
        >
          + Лендинг
        </button>
      </div>

      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Название</th>
                <th>URL</th>
                <th>Заметки</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.id}</td>
                  <td>{r.name}</td>
                  <td>
                    <code className="mono">{r.url}</code>
                  </td>
                  <td>{r.notes || '—'}</td>
                  <td>
                    <div className="toolbar">
                      <button
                        className="btn ghost sm"
                        type="button"
                        onClick={() => {
                          setEditingId(r.id);
                          setForm({ name: r.name, url: r.url, notes: r.notes || '' });
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
          title={editingId ? 'Редактировать лендинг' : 'Новый лендинг'}
          onClose={() => setForm(null)}
        >
          <form onSubmit={save}>
            <div className="form-grid">
              <label className="lbl full">
                Название
                <input
                  className="input"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label className="lbl full">
                <LabelWithHint hint="Адрес вашей прокладки. На кнопке CTA ведите на /to-offer?clickid=… — трекер сам добавит clickid при редиректе.">
                  URL
                </LabelWithHint>
                <input
                  className="input mono"
                  required
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                />
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
