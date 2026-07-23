import { useEffect, useMemo, useState } from 'react';
import { api, money } from '../api';
import { Modal, copyText } from '../components/ui';

const RULE_FIELDS = [
  { value: 'country', label: 'Country' },
  { value: 'device', label: 'Device' },
  { value: 'os', label: 'OS' },
  { value: 'browser', label: 'Browser' },
  { value: 'bot', label: 'Bot (0/1)' },
  { value: 'language', label: 'Language' },
  { value: 'ip', label: 'IP' },
  { value: 'token1', label: 'token1' },
  { value: 'token2', label: 'token2' },
  { value: 'token3', label: 'token3' },
  { value: 'token4', label: 'token4' },
  { value: 'token5', label: 'token5' },
];

const RULE_OPS = [
  { value: 'eq', label: '=' },
  { value: 'neq', label: '≠' },
  { value: 'contains', label: 'contains' },
  { value: 'starts', label: 'starts' },
  { value: 'in', label: 'in' },
  { value: 'not_in', label: 'not in' },
];

let cid = 0;
function nextId(prefix = 'p') {
  cid += 1;
  return `${prefix}${Date.now()}_${cid}`;
}

function defaultPath() {
  return {
    client_id: nextId('path'),
    name: 'Default',
    weight: 100,
    landing_id: '',
    enabled: true,
    is_default: true,
    offers: [{ offer_id: '', weight: 100 }],
  };
}

function emptyForm() {
  return {
    name: '',
    key: '',
    traffic_source_id: '',
    cost_model: 'cpc',
    cost_value: 0,
    status: 'active',
    unique_hours: 24,
    block_bots: false,
    notes: '',
    paths: [defaultPath()],
    rules: [],
  };
}

function mapCampaignToForm(r) {
  const paths =
    r.paths?.length > 0
      ? r.paths.map((p, idx) => ({
          client_id: String(p.id || nextId('path')),
          name: p.name || `Path ${idx + 1}`,
          weight: p.weight ?? 100,
          landing_id: p.landing_id ? String(p.landing_id) : '',
          enabled: p.enabled !== 0 && p.enabled !== false,
          is_default: !!p.is_default,
          offers:
            p.offers?.length > 0
              ? p.offers.map((o) => ({ offer_id: String(o.offer_id), weight: o.weight }))
              : [{ offer_id: '', weight: 100 }],
        }))
      : [
          {
            ...defaultPath(),
            landing_id: r.landing_id ? String(r.landing_id) : '',
            offers:
              r.rotation?.length > 0
                ? r.rotation.map((x) => ({ offer_id: String(x.offer_id), weight: x.weight }))
                : [{ offer_id: r.offer_id ? String(r.offer_id) : '', weight: 100 }],
          },
        ];

  const pathIds = new Set(paths.map((p) => p.client_id));
  const rules = (r.rules || []).map((rule) => ({
    name: rule.name || 'Rule',
    priority: rule.priority ?? 100,
    enabled: rule.enabled !== 0 && rule.enabled !== false,
    path_id: pathIds.has(String(rule.path_id)) ? String(rule.path_id) : paths[0]?.client_id || '',
    conditions:
      rule.conditions?.length > 0
        ? rule.conditions.map((c) => ({
            field: c.field || 'country',
            operator: c.operator || 'eq',
            value: c.value || '',
          }))
        : [{ field: 'country', operator: 'eq', value: '' }],
  }));

  return {
    name: r.name,
    key: r.key,
    traffic_source_id: r.traffic_source_id || '',
    cost_model: r.cost_model,
    cost_value: r.cost_value,
    status: r.status,
    unique_hours: r.unique_hours ?? 24,
    block_bots: !!r.block_bots,
    notes: r.notes || '',
    paths,
    rules,
  };
}

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
    const paths = (form.paths || []).map((p, idx) => ({
      client_id: p.client_id,
      name: p.name || `Path ${idx + 1}`,
      weight: Number(p.weight || 100),
      landing_id: p.landing_id ? Number(p.landing_id) : null,
      enabled: !!p.enabled,
      is_default: !!p.is_default,
      sort_order: idx,
      offers: (p.offers || [])
        .filter((x) => x.offer_id && Number(x.weight) > 0)
        .map((x) => ({ offer_id: Number(x.offer_id), weight: Number(x.weight) })),
    }));

    if (!paths.length) {
      setMsg('Нужен хотя бы один path');
      return;
    }
    if (!paths.some((p) => p.is_default)) paths[0].is_default = true;

    const rules = (form.rules || []).map((r, idx) => ({
      name: r.name || `Rule ${idx + 1}`,
      priority: Number(r.priority || (idx + 1) * 10),
      enabled: !!r.enabled,
      path_id: r.path_id,
      conditions: (r.conditions || [])
        .filter((c) => c.field && String(c.value ?? '').trim() !== '')
        .map((c) => ({
          field: c.field,
          operator: c.operator || 'eq',
          value: String(c.value),
        })),
    }));

    const defaultPath = paths.find((p) => p.is_default) || paths[0];
    const body = {
      name: form.name,
      key: form.key || undefined,
      traffic_source_id: form.traffic_source_id ? Number(form.traffic_source_id) : null,
      offer_id: defaultPath.offers[0]?.offer_id || null,
      landing_id: defaultPath.landing_id || null,
      cost_model: form.cost_model,
      cost_value: Number(form.cost_value || 0),
      status: form.status,
      unique_hours: Number(form.unique_hours || 24),
      block_bots: !!form.block_bots,
      notes: form.notes,
      paths,
      rules,
    };

    try {
      if (editingId) await api.put(`/api/campaigns/${editingId}`, body);
      else await api.post('/api/campaigns', body);
      setForm(null);
      setEditingId(null);
      setMsg('');
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

  function updatePath(idx, patch) {
    const paths = [...form.paths];
    paths[idx] = { ...paths[idx], ...patch };
    if (patch.is_default) {
      paths.forEach((p, i) => {
        paths[i] = { ...p, is_default: i === idx };
      });
    }
    setForm({ ...form, paths });
  }

  function updateRule(idx, patch) {
    const rules = [...form.rules];
    rules[idx] = { ...rules[idx], ...patch };
    setForm({ ...form, rules });
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Кампании</h1>
          <p>Paths, Rules, ротация офферов</p>
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
              setForm(emptyForm());
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
                <th>Paths / Rules</th>
                <th>CPC</th>
                <th>Статус</th>
                <th>Ссылка</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const url = `${clickBase}/click/${r.key}`;
                const pathCount = r.paths?.length || 0;
                const ruleCount = r.rules?.length || 0;
                const rot =
                  r.paths?.[0]?.offers
                    ?.map((x) => `${x.offer_name || x.offer_id} (${x.weight})`)
                    .join(', ') ||
                  r.rotation?.map((x) => `${x.offer_name || x.offer_id} (${x.weight})`).join(', ') ||
                  r.offer_name ||
                  '—';
                return (
                  <tr key={r.id}>
                    <td className="mono">{r.id}</td>
                    <td>{r.name}</td>
                    <td className="mono">{r.key}</td>
                    <td>{r.source_name || '—'}</td>
                    <td>
                      <span className="mono">
                        {pathCount}p / {ruleCount}r
                      </span>
                      <div className="hint" style={{ marginTop: 2 }}>
                        {rot}
                      </div>
                    </td>
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
                            setForm(mapCampaignToForm(r));
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
          className="wide"
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
                <div className="section-label">Paths</div>
                <p className="hint" style={{ marginBottom: '0.55rem' }}>
                  Path = лендинг + ротация офферов. Default path используется, если правило не
                  сработало.
                </p>
                {(form.paths || []).map((path, pIdx) => (
                  <div key={path.client_id} className="subpanel">
                    <div className="toolbar" style={{ marginBottom: '0.45rem', flexWrap: 'wrap' }}>
                      <input
                        className="input"
                        style={{ flex: 1, minWidth: 140 }}
                        value={path.name}
                        onChange={(e) => updatePath(pIdx, { name: e.target.value })}
                        placeholder="Имя path"
                      />
                      <input
                        className="input sm"
                        type="number"
                        min="0"
                        style={{ width: 90 }}
                        title="Weight"
                        value={path.weight}
                        onChange={(e) => updatePath(pIdx, { weight: e.target.value })}
                      />
                      <select
                        className="select"
                        value={path.landing_id}
                        onChange={(e) => updatePath(pIdx, { landing_id: e.target.value })}
                      >
                        <option value="">Direct to offer</option>
                        {landings.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                      <label className="chk">
                        <input
                          type="checkbox"
                          checked={!!path.is_default}
                          onChange={(e) => updatePath(pIdx, { is_default: e.target.checked })}
                        />
                        default
                      </label>
                      <label className="chk">
                        <input
                          type="checkbox"
                          checked={!!path.enabled}
                          onChange={(e) => updatePath(pIdx, { enabled: e.target.checked })}
                        />
                        on
                      </label>
                      {form.paths.length > 1 && (
                        <button
                          className="btn ghost sm"
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              paths: form.paths.filter((_, i) => i !== pIdx),
                            })
                          }
                        >
                          − path
                        </button>
                      )}
                    </div>
                    {(path.offers || []).map((row, oIdx) => (
                      <div key={oIdx} className="toolbar" style={{ marginBottom: '0.35rem' }}>
                        <select
                          className="select"
                          value={row.offer_id}
                          onChange={(e) => {
                            const offers = [...path.offers];
                            offers[oIdx] = { ...offers[oIdx], offer_id: e.target.value };
                            updatePath(pIdx, { offers });
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
                            const offers = [...path.offers];
                            offers[oIdx] = { ...offers[oIdx], weight: e.target.value };
                            updatePath(pIdx, { offers });
                          }}
                        />
                        <button
                          className="btn ghost sm"
                          type="button"
                          onClick={() =>
                            updatePath(pIdx, {
                              offers: path.offers.filter((_, i) => i !== oIdx),
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
                        updatePath(pIdx, {
                          offers: [...(path.offers || []), { offer_id: '', weight: 100 }],
                        })
                      }
                    >
                      + оффер
                    </button>
                  </div>
                ))}
                <button
                  className="btn ghost sm"
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      paths: [
                        ...form.paths,
                        {
                          client_id: nextId('path'),
                          name: `Path ${form.paths.length + 1}`,
                          weight: 100,
                          landing_id: '',
                          enabled: true,
                          is_default: false,
                          offers: [{ offer_id: '', weight: 100 }],
                        },
                      ],
                    })
                  }
                >
                  + path
                </button>
              </div>

              <div className="full">
                <div className="section-label">Rules</div>
                <p className="hint" style={{ marginBottom: '0.55rem' }}>
                  Условия через AND. Первое подходящее правило (по priority) направляет на path.
                </p>
                {(form.rules || []).map((rule, rIdx) => (
                  <div key={rIdx} className="subpanel">
                    <div className="toolbar" style={{ marginBottom: '0.45rem', flexWrap: 'wrap' }}>
                      <input
                        className="input"
                        style={{ flex: 1, minWidth: 120 }}
                        value={rule.name}
                        onChange={(e) => updateRule(rIdx, { name: e.target.value })}
                        placeholder="Имя rule"
                      />
                      <input
                        className="input sm"
                        type="number"
                        style={{ width: 90 }}
                        title="Priority (меньше = раньше)"
                        value={rule.priority}
                        onChange={(e) => updateRule(rIdx, { priority: e.target.value })}
                      />
                      <select
                        className="select"
                        value={rule.path_id}
                        onChange={(e) => updateRule(rIdx, { path_id: e.target.value })}
                      >
                        {form.paths.map((p) => (
                          <option key={p.client_id} value={p.client_id}>
                            → {p.name}
                          </option>
                        ))}
                      </select>
                      <label className="chk">
                        <input
                          type="checkbox"
                          checked={!!rule.enabled}
                          onChange={(e) => updateRule(rIdx, { enabled: e.target.checked })}
                        />
                        on
                      </label>
                      <button
                        className="btn ghost sm"
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            rules: form.rules.filter((_, i) => i !== rIdx),
                          })
                        }
                      >
                        − rule
                      </button>
                    </div>
                    {(rule.conditions || []).map((cond, cIdx) => (
                      <div key={cIdx} className="toolbar" style={{ marginBottom: '0.35rem' }}>
                        <select
                          className="select"
                          value={cond.field}
                          onChange={(e) => {
                            const conditions = [...rule.conditions];
                            conditions[cIdx] = { ...conditions[cIdx], field: e.target.value };
                            updateRule(rIdx, { conditions });
                          }}
                        >
                          {RULE_FIELDS.map((f) => (
                            <option key={f.value} value={f.value}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                        <select
                          className="select sm"
                          style={{ width: 110 }}
                          value={cond.operator}
                          onChange={(e) => {
                            const conditions = [...rule.conditions];
                            conditions[cIdx] = { ...conditions[cIdx], operator: e.target.value };
                            updateRule(rIdx, { conditions });
                          }}
                        >
                          {RULE_OPS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <input
                          className="input"
                          placeholder="значение (для in: RU,US)"
                          value={cond.value}
                          onChange={(e) => {
                            const conditions = [...rule.conditions];
                            conditions[cIdx] = { ...conditions[cIdx], value: e.target.value };
                            updateRule(rIdx, { conditions });
                          }}
                        />
                        <button
                          className="btn ghost sm"
                          type="button"
                          onClick={() =>
                            updateRule(rIdx, {
                              conditions: rule.conditions.filter((_, i) => i !== cIdx),
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
                        updateRule(rIdx, {
                          conditions: [
                            ...(rule.conditions || []),
                            { field: 'country', operator: 'eq', value: '' },
                          ],
                        })
                      }
                    >
                      + условие
                    </button>
                  </div>
                ))}
                <button
                  className="btn ghost sm"
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      rules: [
                        ...form.rules,
                        {
                          name: `Rule ${form.rules.length + 1}`,
                          priority: (form.rules.length + 1) * 10,
                          enabled: true,
                          path_id: form.paths[0]?.client_id || '',
                          conditions: [{ field: 'country', operator: 'eq', value: '' }],
                        },
                      ],
                    })
                  }
                >
                  + rule
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
