import { useEffect, useState } from 'react';
import { api } from '../api';
import { copyText } from '../components/ui';

const emptyOffer = {
  url: '',
  name: '',
  payout: '',
  epc: '',
  geo: 'RU',
  vertical: 'Fintech',
  network: 'LeadGid',
  source: 'Yandex Direct РСЯ',
  daily_budget: '5000',
  promo_code: '',
  notes: '',
  ad_format: 'auto',
  display_domain: '',
};

const STATUS_CLASS = {
  pending: 'badge paused',
  running: 'badge paused',
  done: 'badge active',
  failed: 'badge rejected',
};

export default function Pipeline() {
  const [roles, setRoles] = useState([]);
  const [pipeline, setPipeline] = useState([]);
  const [integrations, setIntegrations] = useState(null);
  const [runs, setRuns] = useState([]);
  const [form, setForm] = useState(emptyOffer);
  const [showExtra, setShowExtra] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [applyDirect, setApplyDirect] = useState(true);
  const [spawnCursor, setSpawnCursor] = useState(false);
  const [active, setActive] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');

  async function copyField(key, text) {
    if (!text) return;
    const ok = await copyText(text);
    setCopiedKey(ok ? key : '');
    if (ok) setTimeout(() => setCopiedKey((k) => (k === key ? '' : k)), 1600);
    else setMsg('Не удалось скопировать');
  }

  const loadList = () => api.get('/api/pipeline/runs').then(setRuns);

  useEffect(() => {
    Promise.all([api.get('/api/pipeline/roles'), api.get('/api/pipeline/runs')])
      .then(([meta, list]) => {
        setRoles(meta.roles || []);
        setPipeline(meta.pipeline || []);
        setIntegrations(meta.integrations || null);
        setRuns(list);
        if (meta.integrations?.direct?.configured) setApplyDirect(true);
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
        spawn_cursor_agents: spawnCursor,
      };
      const run = await api.post('/api/pipeline/runs', body);
      setActive(run);
      const ready = run.context?.direct?.ready_message || run.steps?.find((s) => s.agent === 'direct')?.output?.ready_message;
      const qa = run.context?.qa;
      const launches = run.context?.cursor_launches || [];
      const launched = launches.filter((l) => l.ok).length;
      const directStep = run.steps?.find((s) => s.agent === 'direct');
      const qaStep = run.steps?.find((s) => s.agent === 'qa');
      const directFail =
        directStep?.status === 'failed' ||
        /не удалось создать черновик/i.test(directStep?.output?.summary || run.error || '');
      const qaFail = qaStep?.status === 'failed' || /QA smoke fail/i.test(run.error || '');
      if (qaFail) {
        setMsg(`QA не пройден: ${run.error || qaStep?.error || qa?.summary || 'проверь click/bots'}`);
      } else if (run.status === 'done' && ready) {
        setMsg(
          `${ready}${qa?.ok ? ' · ссылки/клики проверены' : ''}. Запусти кампанию в Директе сам — на модерацию не отправляли.`,
        );
      } else if (directFail) {
        setMsg(
          `Директ не создал кампанию: ${run.error || directStep?.error || directStep?.output?.summary || 'ошибка API'}`,
        );
      } else if (run.status === 'done') {
        setMsg(
          `Пайплайн завершён${qa?.ok ? ' · QA ok' : ''}${spawnCursor ? ` · Cursor агентов: ${launched}/${launches.length || 0}` : ''}`,
        );
      } else {
        setMsg(`Статус: ${run.status}${run.error ? ` — ${run.error}` : ''}`);
      }
      await loadList();
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function spawnCursorAgain() {
    if (!active?.id) return;
    setBusy(true);
    try {
      const res = await api.post(`/api/pipeline/runs/${active.id}/spawn-cursor`, {});
      setActive(res.run);
      setMsg('Cursor-агенты перезапущены');
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Оркестратор</h1>
          <p>
            Вставь ссылку на оффер — агенты соберут данные, креативы, настроят трекер и черновик Директа.
            На модерацию не отправляем: в конце будет «Кампания готова», запуск — вручную.
            API-ключи берутся с сервера, вводить ничего не нужно.
          </p>
        </div>
      </header>

      {msg ? (
        <div className={`banner ${/готова|заверш/.test(msg) ? 'ok' : ''} ${/ошиб|fail|Статус: failed/i.test(msg) ? 'bad' : ''}`}>
          {msg}
        </div>
      ) : null}

      {integrations ? (
        <section className="panel" style={{ marginBottom: '1rem' }}>
          <div className="panel-head">
            <h2>Интеграции (ключи с сервера)</h2>
          </div>
          <div className="pipeline-integrations">
            <div className="subpanel">
              <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                wordstat
              </div>
              <strong>Yandex Wordstat</strong>
              <p className="hint">
                {integrations.wordstat?.configured
                  ? `Live · регионы: ${(integrations.wordstat.regions || []).join(', ')}`
                  : 'Не настроено'}
              </p>
            </div>
            <div className="subpanel">
              <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                direct
              </div>
              <strong>Яндекс.Директ</strong>
              <p className="hint">
                {integrations.direct?.configured
                  ? `OK · ${integrations.direct.login} · только черновик OFF`
                  : 'Не настроено'}
              </p>
            </div>
            <div className="subpanel">
              <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                images
              </div>
              <strong>Креативы</strong>
              <p className="hint">
                {integrations.images?.configured
                  ? integrations.images.note
                  : 'Нужен YandexART (YANDEX_CLOUD_*) или OpenAI + proxy'}
              </p>
            </div>
            <div className="subpanel">
              <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                tracker
              </div>
              <strong>ArbTrack</strong>
              <p className="hint">
                {integrations.tracker?.mode === 'remote'
                  ? `Remote → ${integrations.tracker.url}`
                  : integrations.tracker?.note || 'Local'}
              </p>
            </div>
          </div>

          {integrations.leadgid_postback?.url ? (
            <div className="banner" style={{ margin: '0 1rem 1rem' }}>
              <strong>LeadGid постбэк — только вручную</strong>
              <p className="hint" style={{ margin: '0.35rem 0 0.55rem' }}>
                {integrations.leadgid_postback.reason}. {integrations.leadgid_postback.where}.
              </p>
              <div className="copy-row">
                <code title={integrations.leadgid_postback.url}>
                  {integrations.leadgid_postback.url}
                </code>
                <button
                  className="btn ghost sm"
                  type="button"
                  onClick={() => copyField('pb-global', integrations.leadgid_postback.url)}
                >
                  {copiedKey === 'pb-global' ? 'Скопировано' : 'Copy'}
                </button>
              </div>
              <p className="hint" style={{ marginTop: '0.45rem' }}>
                В ссылке оффера должен быть <code>aff_sub={'{clickid}'}</code>
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="panel" style={{ marginBottom: '1rem' }}>
        <div className="panel-head">
          <h2>Агенты</h2>
        </div>
        <div className="pipeline-agents">
          {roles.map((r) => (
            <div key={r.id} className="subpanel">
              <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                {r.id}
              </div>
              <strong>{r.name}</strong>
              <p className="hint">{r.description}</p>
            </div>
          ))}
        </div>
        <ol className="pipeline-flow">
          {pipeline.map((s) => (
            <li key={s.agent}>
              <code>{s.agent}</code> — {s.title}
              {s.dependsOn?.length ? (
                <span className="hint"> ← {s.dependsOn.join(', ')}</span>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <div className="grid-2" style={{ marginBottom: '1rem' }}>
        <section className="panel">
          <div className="panel-head">
            <h2>Новый запуск</h2>
          </div>
          <form className="form-grid" style={{ padding: '1rem' }} onSubmit={submit}>
            <label className="lbl full">
              Ссылка на оффер *
              <input
                className="field"
                required
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://go.leadgid.ru/aff_c?offer_id=7397&..."
              />
            </label>

            <label className="lbl full">
              Тип объявления / креатива
              <select
                className="field"
                value={form.ad_format}
                onChange={(e) => setForm({ ...form, ad_format: e.target.value })}
              >
                <option value="auto">Авто — по креативу (с текстом → графика, без → товарное)</option>
                <option value="product">Товарное — чистая картинка, текст в настройках</option>
                <option value="graphic">Графическое — надписи оффера на баннере</option>
              </select>
            </label>
            <p className="hint full" style={{ marginTop: '-0.35rem' }}>
              Графическое = ImageAd (текст на картинке). Товарное = TextAd (заголовок/текст в полях Директа).
            </p>

            <div className="full">
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => setShowExtra((v) => !v)}
              >
                {showExtra ? 'Скрыть доп. поля' : 'Доп. поля (необязательно)'}
              </button>
            </div>

            {showExtra ? (
              <>
                <label className="lbl">
                  Название
                  <input
                    className="field"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="подставится из сети/страницы"
                  />
                </label>
                <label className="lbl">
                  Payout ₽
                  <input
                    className="field"
                    value={form.payout}
                    onChange={(e) => setForm({ ...form, payout: e.target.value })}
                    placeholder="896"
                  />
                </label>
                <label className="lbl">
                  EPC
                  <input
                    className="field"
                    value={form.epc}
                    onChange={(e) => setForm({ ...form, epc: e.target.value })}
                    placeholder="9.5"
                  />
                </label>
                <label className="lbl">
                  Гео
                  <input
                    className="field"
                    value={form.geo}
                    onChange={(e) => setForm({ ...form, geo: e.target.value })}
                  />
                </label>
                <label className="lbl">
                  Вертикаль
                  <input
                    className="field"
                    value={form.vertical}
                    onChange={(e) => setForm({ ...form, vertical: e.target.value })}
                  />
                </label>
                <label className="lbl">
                  Бюджет ₽/день
                  <input
                    className="field"
                    value={form.daily_budget}
                    onChange={(e) => setForm({ ...form, daily_budget: e.target.value })}
                  />
                </label>
                <label className="lbl">
                  Промокод
                  <input
                    className="field"
                    value={form.promo_code}
                    onChange={(e) => setForm({ ...form, promo_code: e.target.value })}
                    placeholder="LG2026"
                  />
                </label>
                <label className="lbl">
                  Домен в объявлении
                  <input
                    className="field"
                    value={form.display_domain}
                    onChange={(e) => setForm({ ...form, display_domain: e.target.value })}
                    placeholder="payservices.ru"
                  />
                </label>
                <p className="hint full" style={{ marginTop: '-0.35rem' }}>
                  Показывается вместо trekerarbitrag.ru. Домен должен смотреть на этот трекер (DNS + SSL).
                  Путь подставится сам: payservices.ru/karta/poezdki
                </p>
                <label className="lbl full">
                  Заметки
                  <textarea
                    className="field"
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="углы, ограничения, вводные…"
                  />
                </label>
              </>
            ) : null}

            <label className="chk full">
              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
              Dry-run (не создавать сущности в трекере)
            </label>
            <label className="chk full">
              <input
                type="checkbox"
                checked={applyDirect}
                onChange={(e) => setApplyDirect(e.target.checked)}
              />
              Создать черновик в Директе (OFF, без модерации)
            </label>
            <label className="chk full">
              <input
                type="checkbox"
                checked={spawnCursor}
                onChange={(e) => setSpawnCursor(e.target.checked)}
              />
              Автозапуск Cursor-субагентов (не создаёт кампанию в Директе — только cloud-агенты)
            </label>
            <div className="full">
              <button className="btn" disabled={busy} type="submit">
                {busy ? 'Запуск…' : 'Запустить оркестратор'}
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>История запусков</h2>
          </div>
          <div className="table-wrap">
            <table>
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
                      <span className={STATUS_CLASS[r.status] || 'badge'}>{r.status}</span>
                    </td>
                    <td>
                      <button type="button" className="btn ghost sm" onClick={() => openRun(r.id)}>
                        Открыть
                      </button>
                    </td>
                  </tr>
                ))}
                {!runs.length ? (
                  <tr>
                    <td colSpan={4} className="empty">
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
        <section className="panel">
          <div className="panel-head">
            <h2>
              Run #{active.id} — {active.title}
            </h2>
            <div className="toolbar">
              <button type="button" className="btn ghost sm" disabled={busy} onClick={spawnCursorAgain}>
                Spawn Cursor
              </button>
              <span className={STATUS_CLASS[active.status] || 'badge'}>{active.status}</span>
            </div>
          </div>
          <div style={{ padding: '1rem' }}>
            {active.context?.direct?.ready_message ? (
              <div className="banner ok">{active.context.direct.ready_message}</div>
            ) : null}
            {active.context?.qa ? (
              <div className={`banner ${active.context.qa.ok ? 'ok' : 'bad'}`}>
                QA: {active.context.qa.summary || (active.context.qa.ok ? 'ok' : 'fail')}
                {active.context.qa.checks?.length ? (
                  <ul style={{ margin: '0.45rem 0 0', paddingLeft: '1.1rem' }}>
                    {active.context.qa.checks.map((c) => (
                      <li key={c.id}>
                        <code>{c.id}</code> — {c.summary}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            {active.error ? <div className="banner bad">{active.error}</div> : null}
            {active.context?.cursor_launches?.length ? (
              <div className="banner">
                Cursor launches:{' '}
                {active.context.cursor_launches.map((l) => (
                  <span key={`${l.agent}-${l.agent_id || l.error || l.reason}`} style={{ marginRight: 8 }}>
                    {l.agent}:{' '}
                    {l.url ? (
                      <a href={l.url} target="_blank" rel="noreferrer">
                        {l.agent_id || 'open'}
                      </a>
                    ) : (
                      l.error || l.reason || (l.ok ? 'ok' : 'fail')
                    )}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="pipeline-steps">
              {(active.steps || []).map((s) => (
                <details key={s.id} className="pipeline-step" open={s.status === 'failed' || s.agent === 'direct'}>
                  <summary>
                    <span className={STATUS_CLASS[s.status] || 'badge'}>{s.status}</span>{' '}
                    <strong>{s.title}</strong> <code>{s.agent}</code>
                    {s.output?.summary ? <span className="hint"> — {s.output.summary}</span> : null}
                  </summary>
                  {s.error ? <pre className="pipeline-pre bad">{s.error}</pre> : null}
                  {s.output?.ready_message ? (
                    <div className="banner ok">{s.output.ready_message}</div>
                  ) : null}
                  {s.output?.cursor_prompt ? (
                    <div>
                      <div className="hint">Промпт для Cursor-агента</div>
                      <pre className="pipeline-pre">{s.output.cursor_prompt}</pre>
                    </div>
                  ) : null}
                  <pre className="pipeline-pre">{JSON.stringify(s.output || {}, null, 2)}</pre>
                </details>
              ))}
            </div>

            {(active.context?.tracker?.postback_url ||
              active.context?.tracker?.click_url ||
              active.context?.direct?.campaign_id) && (
              <div className="subpanel" style={{ marginTop: '0.75rem' }}>
                <strong>Ссылки запуска</strong>
                {active.context?.tracker?.postback_url ? (
                  <div style={{ marginTop: '0.55rem' }}>
                    <div className="hint">
                      LeadGid постбэк (вручную в кабинете)
                      {active.context.tracker.postback_help?.where
                        ? ` · ${active.context.tracker.postback_help.where}`
                        : ''}
                    </div>
                    <div className="copy-row">
                      <code title={active.context.tracker.postback_url}>
                        {active.context.tracker.postback_url}
                      </code>
                      <button
                        className="btn ghost sm"
                        type="button"
                        onClick={() =>
                          copyField('pb-run', active.context.tracker.postback_url)
                        }
                      >
                        {copiedKey === 'pb-run' ? 'Скопировано' : 'Copy'}
                      </button>
                    </div>
                  </div>
                ) : null}
                {active.context?.tracker?.click_url ? (
                  <div style={{ marginTop: '0.55rem' }}>
                    <div className="hint">Click URL (в Директ уже подставлен)</div>
                    <div className="copy-row">
                      <code title={active.context.tracker.click_url}>
                        {active.context.tracker.click_url}
                      </code>
                      <button
                        className="btn ghost sm"
                        type="button"
                        onClick={() => copyField('click-run', active.context.tracker.click_url)}
                      >
                        {copiedKey === 'click-run' ? 'Скопировано' : 'Copy'}
                      </button>
                    </div>
                  </div>
                ) : null}
                {active.context?.direct?.campaign_id ? (
                  <p style={{ marginTop: '0.55rem' }}>
                    Direct campaign ID:{' '}
                    <code className="mono">{active.context.direct.campaign_id}</code> (OFF, без
                    модерации)
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
