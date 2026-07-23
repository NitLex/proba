import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Modal } from '../components/ui';

const emptyForm = {
  name: '',
  vertical: 'Nutra',
  geo: '',
  source: 'Facebook Ads',
  funnel: 'preland',
  payout_model: 'CPA',
  bid_hint: '',
  heat: 'warm',
  difficulty: 'medium',
  rating: 3,
  where_to_pour: '',
  creatives: '',
  landing_notes: '',
  offer_notes: '',
  risks: '',
  checklist: '',
  status: 'active',
  notes: '',
};

const HEAT_LABEL = { hot: 'Hot', warm: 'Warm', cold: 'Cold' };

export default function Bundles() {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ verticals: [], geos: [], sources: [] });
  const [q, setQ] = useState('');
  const [vertical, setVertical] = useState('');
  const [geo, setGeo] = useState('');
  const [source, setSource] = useState('');
  const [heat, setHeat] = useState('');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [msg, setMsg] = useState('');
  const [launching, setLaunching] = useState(false);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (vertical) p.set('vertical', vertical);
    if (geo) p.set('geo', geo);
    if (source) p.set('source', source);
    if (heat) p.set('heat', heat);
    p.set('status', 'active');
    return p.toString();
  }, [q, vertical, geo, source, heat]);

  const load = () =>
    Promise.all([
      api.get(`/api/bundles?${query}`),
      api.get('/api/bundles/meta/filters'),
    ]).then(([list, meta]) => {
      setRows(list);
      setFilters(meta);
    });

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, [query]);

  async function save(e) {
    e.preventDefault();
    try {
      const body = { ...form, rating: Number(form.rating) || 3 };
      if (editingId) await api.put(`/api/bundles/${editingId}`, body);
      else await api.post('/api/bundles', body);
      setForm(null);
      setEditingId(null);
      setMsg(editingId ? 'Связка обновлена' : 'Связка добавлена');
      await load();
    } catch (err) {
      setMsg(err.message);
    }
  }

  async function remove(id) {
    if (!confirm('Удалить связку?')) return;
    await api.del(`/api/bundles/${id}`);
    if (selected?.id === id) setSelected(null);
    await load();
  }

  async function launch(bundle) {
    setLaunching(true);
    setMsg('');
    try {
      const res = await api.post(`/api/bundles/${bundle.id}/launch`, {});
      setMsg(`Кампания создана: ${res.campaign.name} · ${res.click_path}`);
      setSelected(null);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setLaunching(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Связки</h1>
          <p>Куда лить, какие вертикали, воронки и креативы — playbook арбитражника</p>
        </div>
        <div className="toolbar">
          <button
            className="btn"
            type="button"
            onClick={() => {
              setEditingId(null);
              setForm({ ...emptyForm });
            }}
          >
            + Связка
          </button>
        </div>
      </div>

      {msg && <p className={msg.includes('создана') || msg.includes('добавлена') || msg.includes('обновлена') ? 'pos' : 'neg'}>{msg}</p>}

      <div className="panel" style={{ marginBottom: '1rem' }}>
        <div className="toolbar bundle-filters">
          <input
            className="input sm"
            placeholder="Поиск: nutra, FB, DE…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="select sm" value={vertical} onChange={(e) => setVertical(e.target.value)}>
            <option value="">Все вертикали</option>
            {filters.verticals.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select className="select sm" value={geo} onChange={(e) => setGeo(e.target.value)}>
            <option value="">Все гео</option>
            {filters.geos.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select className="select sm" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Все источники</option>
            {filters.sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select className="select sm" value={heat} onChange={(e) => setHeat(e.target.value)}>
            <option value="">Любой heat</option>
            <option value="hot">hot</option>
            <option value="warm">warm</option>
            <option value="cold">cold</option>
          </select>
        </div>
      </div>

      <div className="bundle-grid">
        {rows.map((b) => (
          <article key={b.id} className={`bundle-card heat-${b.heat}`} onClick={() => setSelected(b)}>
            <div className="bundle-card-top">
              <span className={`badge heat ${b.heat}`}>{HEAT_LABEL[b.heat] || b.heat}</span>
              <span className="bundle-rating">{'★'.repeat(b.rating)}{'☆'.repeat(5 - b.rating)}</span>
            </div>
            <h3>{b.name}</h3>
            <div className="bundle-meta">
              <span>{b.vertical}</span>
              <span>{b.geo}</span>
              <span>{b.source}</span>
            </div>
            <p className="bundle-bid">{b.bid_hint || b.payout_model}</p>
            <p className="bundle-excerpt">{excerpt(b.where_to_pour)}</p>
            <div className="bundle-card-foot">
              <span className="badge">{b.funnel}</span>
              <span className="muted">{b.difficulty}</span>
            </div>
          </article>
        ))}
        {!rows.length && <div className="empty panel">Связок нет — добавь свою или запусти seed</div>}
      </div>

      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(null)}>
          <div className="bundle-detail">
            <div className="bundle-meta">
              <span className={`badge heat ${selected.heat}`}>{HEAT_LABEL[selected.heat] || selected.heat}</span>
              <span className="badge">{selected.vertical}</span>
              <span className="badge">{selected.geo}</span>
              <span className="badge">{selected.source}</span>
              <span className="badge">{selected.funnel}</span>
              <span className="badge">{selected.payout_model}</span>
            </div>
            {selected.bid_hint && (
              <p>
                <strong>Бид:</strong> {selected.bid_hint}
              </p>
            )}
            <Section title="Куда заливать" text={selected.where_to_pour} />
            <Section title="Креативы" text={selected.creatives} />
            <Section title="Лендинг / воронка" text={selected.landing_notes} />
            <Section title="Оффер" text={selected.offer_notes} />
            <Section title="Риски" text={selected.risks} />
            <Section title="Чеклист" text={selected.checklist} />
            <Section title="Заметки" text={selected.notes} />
          </div>
          <div className="modal-actions">
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setEditingId(selected.id);
                setForm({
                  name: selected.name,
                  vertical: selected.vertical,
                  geo: selected.geo,
                  source: selected.source,
                  funnel: selected.funnel,
                  payout_model: selected.payout_model,
                  bid_hint: selected.bid_hint || '',
                  heat: selected.heat,
                  difficulty: selected.difficulty,
                  rating: selected.rating,
                  where_to_pour: selected.where_to_pour || '',
                  creatives: selected.creatives || '',
                  landing_notes: selected.landing_notes || '',
                  offer_notes: selected.offer_notes || '',
                  risks: selected.risks || '',
                  checklist: selected.checklist || '',
                  status: selected.status,
                  notes: selected.notes || '',
                });
                setSelected(null);
              }}
            >
              Edit
            </button>
            <button className="btn danger" type="button" onClick={() => remove(selected.id)}>
              Del
            </button>
            <Link className="btn ghost" to="/campaigns" onClick={() => setSelected(null)}>
              К кампаниям
            </Link>
            <button className="btn" type="button" disabled={launching} onClick={() => launch(selected)}>
              {launching ? 'Создаём…' : 'Запустить кампанию'}
            </button>
          </div>
        </Modal>
      )}

      {form && (
        <Modal title={editingId ? 'Редактировать связку' : 'Новая связка'} onClose={() => setForm(null)}>
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
              <label className="lbl">
                Вертикаль
                <input
                  className="input"
                  value={form.vertical}
                  onChange={(e) => setForm({ ...form, vertical: e.target.value })}
                />
              </label>
              <label className="lbl">
                Гео
                <input
                  className="input"
                  value={form.geo}
                  onChange={(e) => setForm({ ...form, geo: e.target.value })}
                  placeholder="DE, PL, US…"
                />
              </label>
              <label className="lbl">
                Источник
                <input
                  className="input"
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                />
              </label>
              <label className="lbl">
                Воронка
                <input
                  className="input"
                  value={form.funnel}
                  onChange={(e) => setForm({ ...form, funnel: e.target.value })}
                />
              </label>
              <label className="lbl">
                Модель
                <input
                  className="input"
                  value={form.payout_model}
                  onChange={(e) => setForm({ ...form, payout_model: e.target.value })}
                />
              </label>
              <label className="lbl">
                Бид
                <input
                  className="input"
                  value={form.bid_hint}
                  onChange={(e) => setForm({ ...form, bid_hint: e.target.value })}
                />
              </label>
              <label className="lbl">
                Heat
                <select
                  className="select"
                  value={form.heat}
                  onChange={(e) => setForm({ ...form, heat: e.target.value })}
                >
                  <option value="hot">hot</option>
                  <option value="warm">warm</option>
                  <option value="cold">cold</option>
                </select>
              </label>
              <label className="lbl">
                Сложность
                <select
                  className="select"
                  value={form.difficulty}
                  onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
                >
                  <option value="easy">easy</option>
                  <option value="medium">medium</option>
                  <option value="hard">hard</option>
                </select>
              </label>
              <label className="lbl">
                Рейтинг (1–5)
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={5}
                  value={form.rating}
                  onChange={(e) => setForm({ ...form, rating: e.target.value })}
                />
              </label>
              <label className="lbl full">
                Куда заливать
                <textarea
                  className="textarea"
                  rows={3}
                  value={form.where_to_pour}
                  onChange={(e) => setForm({ ...form, where_to_pour: e.target.value })}
                />
              </label>
              <label className="lbl full">
                Креативы
                <textarea
                  className="textarea"
                  rows={2}
                  value={form.creatives}
                  onChange={(e) => setForm({ ...form, creatives: e.target.value })}
                />
              </label>
              <label className="lbl full">
                Лендинг
                <textarea
                  className="textarea"
                  rows={2}
                  value={form.landing_notes}
                  onChange={(e) => setForm({ ...form, landing_notes: e.target.value })}
                />
              </label>
              <label className="lbl full">
                Оффер
                <textarea
                  className="textarea"
                  rows={2}
                  value={form.offer_notes}
                  onChange={(e) => setForm({ ...form, offer_notes: e.target.value })}
                />
              </label>
              <label className="lbl full">
                Риски
                <textarea
                  className="textarea"
                  rows={2}
                  value={form.risks}
                  onChange={(e) => setForm({ ...form, risks: e.target.value })}
                />
              </label>
              <label className="lbl full">
                Чеклист
                <textarea
                  className="textarea"
                  rows={2}
                  value={form.checklist}
                  onChange={(e) => setForm({ ...form, checklist: e.target.value })}
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

function Section({ title, text }) {
  if (!text) return null;
  return (
    <div className="bundle-section">
      <h4>{title}</h4>
      <p className="prewrap">{text}</p>
    </div>
  );
}

function excerpt(text, n = 120) {
  const t = String(text || '').trim();
  if (!t) return 'Нет описания залива';
  return t.length > n ? `${t.slice(0, n)}…` : t;
}
