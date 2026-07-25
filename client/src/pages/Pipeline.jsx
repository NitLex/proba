import { useEffect, useState } from 'react';
import { api } from '../api';

const emptyOffer = {
  name: '',
  url: '',
  payout: '',
  epc: '',
  geo: 'RU',
  vertical: 'Fintech',
  network: 'LeadGid',
  source: 'Yandex Direct РСЯ',
  daily_budget: '5000',
  promo_code: '',
  notes: '',
  funnel: 'direct',
};

const STATUS_CLASS = {
  pending: 'pill muted',
  running: 'pill warn',
  done: 'pill ok',
  failed: 'pill bad',
};

export default function Pipeline() {
  const [roles, setRoles] = useState([]);
  const [pipeline, setPipeline] = useState([]);
  const [runs, setRuns] = useState([]);
  const [form, setForm] = useState(emptyOffer);
  const [dryRun, setDryRun] = useState(false);
  const [applyDirect, setApplyDirect] = useState(false);
  const [active, setActive] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const loadList = () => api.get('/api/pipeline/runs').then(setRuns);

  useEffect(() => {
    Promise.all([api.get('/api/pipeline/roles'), api.get('/api/pipeline/runs')])
      .then(([meta, list]) => {
        setRoles(meta.roles || []);
        setPipeline(meta.pipeline || []);
        setRuns(list);
      })
      .catch((e) => setMsg(e.message));
  }, []);

  async function openRun(id) {
    try {
      const run = await api.get(`/api/pipeline/runs/${id}`);
      setActive(run);
    } catch (e) {
      setMsg(e.message);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const body = {
        ...form,
        payout: form.payout === '' ? undefined : Number(form.payout),
        epc: form.epc === '' ? undefined : Number(form.epc),
        daily_budget: form.daily_budget === '' ? undefined : Number(form.daily_budget),
        dry_run: dryRun,
        apply_direct: applyDirect,
      };
      const run = await api.post('/api/pipeline/runs', body);
      setActive(run);
      setMsg(run.status === 'done' ? 'Пайплайн завершён' : `Статус: ${run.status}`);
      await loadList();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Оркестратор агентов</h1>
          <p className="muted">
            Даёшь данные оффера → аналитик разбирает связки → Wordstat / креатив / трекер / Директ
            получают задачи.
          </p>
        </div>
      </header>

      {msg ? <div className="banner">{msg}</div> : null}

      <section className="card-block">
        <h2>Агенты</h2>
        <div className="agent-grid">
          {roles.map((r) => (
            <div key={r.id} className="agent-card">
              <div className="agent-id">{r.id}</div>
              <strong>{r.name}</strong>
              <p className="muted small">{r.description}</p>
            </div>
          ))}
        </div>
        <ol className="pipeline-flow">
          {pipeline.map((s) => (
            <li key={s.agent}>
              <code>{s.agent}</code> — {s.title}
              {s.dependsOn?.length ? (
                <span className="muted small"> ← {s.dependsOn.join(', ')}</span>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <div className="split-2">
        <section className="card-block">
          <h2>Новый запуск</h2>
          <form className="form-grid" onSubmit={submit}>
            <label>
              Название оффера *
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Плати по миру"
              />
            </label>
            <label>
              URL оффера
              <input
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://go.leadgid.ru/aff_c?..."
              />
            </label>
            <label>
              Payout ₽
              <input
                value={form.payout}
                onChange={(e) => setForm({ ...form, payout: e.target.value })}
                placeholder="896"
              />
            </label>
            <label>
              EPC сети
              <input
                value={form.epc}
                onChange={(e) => setForm({ ...form, epc: e.target.value })}
                placeholder="9.5"
              />
            </label>
            <label>
              Гео
              <input value={form.geo} onChange={(e) => setForm({ ...form, geo: e.target.value })} />
            </label>
            <label>
              Вертикаль
              <input
                value={form.vertical}
                onChange={(e) => setForm({ ...form, vertical: e.target.value })}
              />
            </label>
            <label>
              Сеть
              <input
                value={form.network}
                onChange={(e) => setForm({ ...form, network: e.target.value })}
              />
            </label>
            <label>
              Источник
              <input
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
              />
            </label>
            <label>
              Бюджет ₽/день
              <input
                value={form.daily_budget}
                onChange={(e) => setForm({ ...form, daily_budget: e.target.value })}
              />
            </label>
            <label>
              Промокод
              <input
                value={form.promo_code}
                onChange={(e) => setForm({ ...form, promo_code: e.target.value })}
                placeholder="LG2026"
              />
            </label>
            <label className="full">
              Заметки / вводные
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="путешествия, зарубежные сервисы, премиум…"
              />
            </label>
            <label className="check">
              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
              Dry-run (не создавать сущности в трекере)
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={applyDirect}
                onChange={(e) => setApplyDirect(e.target.checked)}
              />
              Сразу создать кампанию в Директе (нужен API-токен)
            </label>
            <div className="full">
              <button className="btn primary" disabled={busy} type="submit">
                {busy ? 'Запуск…' : 'Запустить оркестратор'}
              </button>
            </div>
          </form>
        </section>

        <section className="card-block">
          <h2>История запусков</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Название</th>
                  <th>Статус</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.id}</td>
                    <td>{r.title}</td>
                    <td>
                      <span className={STATUS_CLASS[r.status] || 'pill'}>{r.status}</span>
                    </td>
                    <td>
                      <button type="button" className="btn small" onClick={() => openRun(r.id)}>
                        Открыть
                      </button>
                    </td>
                  </tr>
                ))}
                {!runs.length ? (
                  <tr>
                    <td colSpan={4} className="muted">
                      Пока пусто
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {active ? (
        <section className="card-block">
          <div className="row-between">
            <h2>
              Run #{active.id} — {active.title}
            </h2>
            <span className={STATUS_CLASS[active.status] || 'pill'}>{active.status}</span>
          </div>
          {active.error ? <div className="banner bad">{active.error}</div> : null}

          <div className="steps">
            {(active.steps || []).map((s) => (
              <details key={s.id} className="step" open={s.status === 'failed'}>
                <summary>
                  <span className={STATUS_CLASS[s.status] || 'pill'}>{s.status}</span>{' '}
                  <strong>{s.title}</strong> <code>{s.agent}</code>
                  {s.output?.summary ? <span className="muted"> — {s.output.summary}</span> : null}
                </summary>
                {s.error ? <pre className="pre bad">{s.error}</pre> : null}
                {s.output?.cursor_prompt ? (
                  <div>
                    <div className="muted small">Промпт для Cursor-агента</div>
                    <pre className="pre">{s.output.cursor_prompt}</pre>
                  </div>
                ) : null}
                <pre className="pre">{JSON.stringify(s.output || {}, null, 2)}</pre>
              </details>
            ))}
          </div>

          {active.context?.tracker?.click_url ? (
            <p>
              Click URL:{' '}
              <code className="mono">{active.context.tracker.click_url}</code>
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
