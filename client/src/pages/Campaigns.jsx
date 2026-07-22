import { useEffect, useMemo, useState } from 'react';
import { api, money } from '../api';
import { Modal, copyText } from '../components/ui';

const emptyForm = {
  name: '',
  key: '',
  traffic_source_id: '',
  landing_id: '',
  cost_model: 'cpc',
  cost_value: 0,
  status: 'active',
  unique_hours: 24,
  block_bots: false,
  notes: '',
  rotation: [{ offer_id: '', weight: 100 }],
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
    const rotation = (form.rotation || [])
      .filter((x) => x.offer_id && Number(x.weight) > 0)
      .map((x) => ({ offer_id: Number(x.offer_id), weight: Number(x.weight) }));
    const body = {
      name: form.name,
      key: form.key || undefined,
      traffic_source_id: form.traffic_source_id ? Number(form.traffic_source_id) : null,
      offer_id: rotation[0]?.offer_id || null,
      landing_id: form.landing_id ? Number(form.landing_id) : null,
      cost_model: form.cost_model,
      cost_value: Number(form.cost_value || 0),
      status: form.status,
      unique_hours: Number(form.unique_hours || 24),
      block_bots: !!form.block_bots,
      notes: form.notes,
      rotation,
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

  function openEdit(r) {
    setEditingId(r.id);
    setForm({
      name: r.name,
      key: r.key,
      traffic_source_id: r.traffic_source_id || '',
      landing_id: r.landing_id || '',
      cost_model: r.cost_model,
      cost_value: r.cost_value,
      status: r.status,
      unique_hours: r.unique_hours ?? 24,
      block_bots: !!r.block_bots,
      notes: r.notes || '',
      rotation:
        r.rotation?.length > 0
          ? r.rotation.map((x) => ({ offer_id: String(x.offer_id), weight: x.weight }))
          : [{ offer_id: r.offer_id ? String(r.offer_id) : '', weight: 100 }],
    });
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Кампании</h1>
          <p>Ротация офферов, уникальность, антибот</p>
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
              setForm({ ...emptyForm, rotation: [{ offer_id: '', weight: 100 }] });
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
                <th>Офферы</th>
                <th>CPC</th>
                <th>Статус</th>
                <th>Ссылка</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const url = `${clickBase}/click/${r.key}`;
                const rot =
                  r.rotation?.map((x) => `${x.offer_name || x.offer_id} (${x.weight})`).join(', ') ||
                  r.offer_name ||
                  '—';
                return (
                  <tr key={r.id}>
                    <td className="mono">{r.id}</td>
                    <td>{r.name}</td>
                    <td className="mono">{r.key}</td>
                    <td>{r.source_name || '—'}</td>
                    <td>{rot}</td>
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
                        <button className="btn ghost sm" type="button" onClick={() => openEdit(r)}>
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
                Лендинг
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
                Уникальность (часов)
                <input
                  className="input"
                  type="number"
                  min="1"
                  value={form.unique_hours}
                  onChange={(e) => setForm({ ...form, unique_hours: e.target.value })}
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
              <label
                className="lbl"
                style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}
              >
                <input
                  type="checkbox"
                  checked={!!form.block_bots}
                  onChange={(e) => setForm({ ...form, block_bots: e.target.checked })}
                />
                Блокировать ботов
              </label>

              <div className="full">
                <div className="hint" style={{ marginBottom: '0.45rem' }}>
                  Ротация офферов (вес = доля трафика)
                </div>
                {(form.rotation || []).map((row, idx) => (
                  <div key={idx} className="toolbar" style={{ marginBottom: '0.4rem' }}>
                    <select
                      className="select"
                      value={row.offer_id}
                      onChange={(e) => {
                        const rotation = [...form.rotation];
                        rotation[idx] = { ...rotation[idx], offer_id: e.target.value };
                        setForm({ ...form, rotation });
                      }}
                    >
                      <option value="">— оффер —</option>
                      {offers.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input sm"
                      type="number"
                      min="1"
                      style={{ width: 90 }}
                      value={row.weight}
                      onChange={(e) => {
                        const rotation = [...form.rotation];
                        rotation[idx] = { ...rotation[idx], weight: e.target.value };
                        setForm({ ...form, rotation });
                      }}
                    />
                    <button
                      className="btn ghost sm"
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          rotation: form.rotation.filter((_, i) => i !== idx),
                        })
                      }
                    >
                      −
                    </button>
                  </div>
                ))}
                <button
                  className="btn ghost sm"
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      rotation: [...(form.rotation || []), { offer_id: '', weight: 100 }],
                    })
                  }
                >
                  + оффер
                </button>
              </div>
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
