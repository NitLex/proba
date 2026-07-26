import { useEffect, useState } from 'react';
import { api } from '../api';
import { copyText } from '../components/ui';

const emptyOffer = {
  url: '',
  info_url: '',
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
  const [optPipeline, setOptPipeline] = useState([]);
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
  const [trafficCamps, setTrafficCamps] = useState([]);
  const [selectedTraffic, setSelectedTraffic] = useState([]);
  const [applyTraffic, setApplyTraffic] = useState(false);
  const [trafficBusy, setTrafficBusy] = useState(false);
  const [trafficReports, setTrafficReports] = useState([]);

  const OUTCOME_LABEL = {
    applied: 'Площадки запрещены в Директе',
    partial: 'Частично применено',
    apply_failed: 'Ошибка применения в Директе',
    nothing_new: 'Новых площадок не добавлено',
    recommendations_only: 'Только рекомендации',
    no_action: 'Нечего резать',
  };

  function loadTrafficReports() {
    return api
      .get('/api/pipeline/traffic/reports')
      .then((res) => setTrafficReports(res.reports || []))
      .catch(() => setTrafficReports([]));
  }

  async function copyField(key, text) {
    if (!text) return;
    const ok = await copyText(text);
    setCopiedKey(ok ? key : '');
    if (ok) setTimeout(() => setCopiedKey((k) => (k === key ? '' : k)), 1600);
    else setMsg('Не удалось скопировать');
  }

  const loadList = () => api.get('/api/pipeline/runs').then(setRuns);

  useEffect(() => {
    Promise.all([
      api.get('/api/pipeline/roles'),
      api.get('/api/pipeline/runs'),
      api.get('/api/pipeline/traffic/campaigns').catch(() => ({ campaigns: [] })),
      api.get('/api/pipeline/traffic/reports').catch(() => ({ reports: [] })),
    ])
      .then(([meta, list, traffic, reports]) => {
        setRoles(meta.roles || []);
        setPipeline(meta.pipeline || []);
        setOptPipeline(meta.optimization_pipeline || []);
        setIntegrations(meta.integrations || null);
        setRuns(list);
        if (meta.integrations?.direct?.configured) setApplyDirect(true);
        const camps = traffic.campaigns || [];
        setTrafficCamps(camps);
        setSelectedTraffic(camps.filter((c) => c.moderated).map((c) => c.id));
        setTrafficReports(reports.reports || []);
      })
      .catch((e) => setMsg(e.message));
  }, []);

  function toggleTrafficCamp(id) {
    setSelectedTraffic((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function runTrafficAnalyst() {
    setTrafficBusy(true);
    setMsg('');
    try {
      const run = await api.post('/api/pipeline/traffic/runs', {
        direct_campaign_ids: selectedTraffic,
        apply: applyTraffic,
      });
      setActive(run);
      const ta = run.context?.traffic_analysis;
      const mini = run.context?.mini_report;
      const cut = mini?.candidates_to_ban ?? ta?.actions?.exclude_placements?.length ?? 0;
      const added = mini?.sites_added ?? 0;
      setMsg(
        added > 0
          ? `Аналитик трафика: запретил +${added} площадок (кандидатов ${cut}). Run #${run.id}`
          : `Аналитик трафика: ${OUTCOME_LABEL[mini?.outcome] || 'готово'} · кандидатов ${cut}. Run #${run.id}`,
      );
      await loadList();
      await loadTrafficReports();
      const traffic = await api.get('/api/pipeline/traffic/campaigns').catch(() => null);
      if (traffic?.campaigns) setTrafficCamps(traffic.campaigns);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setTrafficBusy(false);
    }
  }

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
      const vertical = run.context?.analysis?.vertical_key || run.context?.playbook?.vertical_key;
      const campId = run.context?.direct?.campaign_id;
      if (qaFail) {
        setMsg(`QA не пройден: ${run.error || qaStep?.error || qa?.summary || 'проверь click/bots'}`);
      } else if (run.status === 'done' && ready) {
        setMsg(
          `${ready}${qa?.ok ? ' · ссылки/клики проверены' : ''}${
            vertical ? ` · вертикаль ${vertical}` : ''
          }${campId ? ` · Директ #${campId} (черновик OFF)` : ''}. Запуск/модерация — вручную.`,
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
            Запуск оффера: креативы, трекер, черновик Директа (без автомодерации). После модерации —
            аналитик трафика чистит площадки и предлагает правки по тестам.
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
        {optPipeline.length ? (
          <>
            <p className="hint" style={{ padding: '0 1rem', marginBottom: 0 }}>
              После модерации / набора кликов:
            </p>
            <ol className="pipeline-flow">
              {optPipeline.map((s) => (
                <li key={s.agent}>
                  <code>{s.agent}</code> — {s.title}
                </li>
              ))}
            </ol>
          </>
        ) : null}
      </section>

      <section className="panel" style={{ marginBottom: '1rem' }}>
        <div className="panel-head">
          <h2>Аналитик трафика</h2>
        </div>
        <div style={{ padding: '1rem' }}>
          <p className="hint" style={{ marginTop: 0 }}>
            Смотрит кампании, прошедшие модерацию: отчёт «Площадки» в Директе + статистика трекера.
            Режет мусорные площадки, подсказывает ставки и паузы. Цель — улучшить качество трафика.
          </p>
          {!trafficCamps.length ? (
            <p className="empty">Нет активных кампаний в Директе или токен не настроен</p>
          ) : (
            <div className="table-wrap" style={{ marginBottom: '0.75rem' }}>
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>ID</th>
                    <th>Название</th>
                    <th>Статус</th>
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  {trafficCamps.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedTraffic.includes(c.id)}
                          onChange={() => toggleTrafficCamp(c.id)}
                          disabled={!c.moderated && c.status === 'DRAFT'}
                        />
                      </td>
                      <td className="mono">{c.id}</td>
                      <td>{c.name}</td>
                      <td>
                        <span className={c.moderated ? 'badge active' : 'badge paused'}>
                          {c.status}
                        </span>
                      </td>
                      <td className="mono">{c.state}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <label className="chk">
            <input
              type="checkbox"
              checked={applyTraffic}
              onChange={(e) => setApplyTraffic(e.target.checked)}
            />
            Применить правки в Директе (запретить мусорные площадки)
          </label>
          <div style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              className="btn"
              disabled={trafficBusy || !selectedTraffic.length}
              onClick={runTrafficAnalyst}
            >
              {trafficBusy ? 'Анализ…' : 'Запустить аналитика трафика'}
            </button>
          </div>

          <div className="traffic-reports">
            <div className="traffic-reports-head">
              <strong>Мини-отчёт: что сделано</strong>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => loadTrafficReports()}
              >
                Обновить
              </button>
            </div>
            {!trafficReports.length ? (
              <p className="hint" style={{ margin: 0 }}>
                Пока нет запусков аналитика — после первого прогона здесь появится отчёт.
              </p>
            ) : (
              trafficReports.slice(0, 5).map((item) => {
                const r = item.report || {};
                const outcome = OUTCOME_LABEL[r.outcome] || r.outcome || item.status;
                const tone =
                  r.outcome === 'applied' || r.outcome === 'partial'
                    ? 'ok'
                    : r.outcome === 'apply_failed'
                      ? 'bad'
                      : '';
                return (
                  <article key={item.run_id} className={`traffic-report ${tone}`}>
                    <header className="traffic-report-head">
                      <div>
                        <span className={STATUS_CLASS[item.status] || 'badge'}>{item.status}</span>{' '}
                        <strong>Run #{item.run_id}</strong>
                        <span className="hint"> · {item.updated_at}</span>
                      </div>
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => openRun(item.run_id)}
                      >
                        Открыть
                      </button>
                    </header>
                    <p className="traffic-report-outcome">{outcome}</p>
                    <div className="traffic-report-metrics">
                      <span>
                        Кампании:{' '}
                        <code>
                          {(r.campaign_ids || []).join(', ') || '—'}
                        </code>
                      </span>
                      <span>
                        Период:{' '}
                        {r.period
                          ? `${r.period.from}…${r.period.to}`
                          : '—'}
                      </span>
                      <span>Площадок в отчёте: {r.placements_scanned ?? '—'}</span>
                      <span>К запрету: {r.candidates_to_ban ?? 0}</span>
                      <span>
                        В Директ: +{r.sites_added ?? 0}
                        {r.sites_total_after != null ? ` (всего ${r.sites_total_after})` : ''}
                      </span>
                    </div>
                    {r.top_banned?.length ? (
                      <ul className="traffic-report-list">
                        {r.top_banned.slice(0, 6).map((p) => (
                          <li key={`${item.run_id}-${p.placement}`}>
                            <code>{p.placement}</code>
                            <span className="hint">
                              {' '}
                              — {p.clicks} кл. / {p.cost} ₽
                              {p.reasons?.length ? ` · ${p.reasons[0]}` : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="hint" style={{ margin: '0.35rem 0 0' }}>
                        Список площадок пуст или только рекомендации без кандидатов.
                      </p>
                    )}
                    {r.advice?.length ? (
                      <p className="hint" style={{ margin: '0.4rem 0 0' }}>
                        {r.advice.slice(0, 2).join(' · ')}
                      </p>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        </div>
      </section>

      <div className="grid-2" style={{ marginBottom: '1rem' }}>
        <section className="panel">
          <div className="panel-head">
            <h2>Новый запуск</h2>
          </div>
          <form className="form-grid" style={{ padding: '1rem' }} onSubmit={submit}>
            <label className="lbl full">
              Трекинг-ссылка (aff_c) *
              <input
                className="field"
                required
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://go.leadgid.ru/aff_c?offer_id=4759&..."
              />
            </label>
            <label className="lbl full">
              Страница с описанием оффера (для исследования)
              <input
                className="field"
                value={form.info_url}
                onChange={(e) => setForm({ ...form, info_url: e.target.value })}
                placeholder="лендинг / кабинет LeadGid / FAQ — отсюда берутся тексты"
              />
            </label>
            <p className="hint full" style={{ marginTop: '-0.35rem' }}>
              В трекер уходит aff_c. Тексты и углы строятся из LeadGid API + этой страницы (не из
              шаблона «зарубежная карта»).
            </p>

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
            {active.context?.enrich ? (
              <div className="banner">
                Исследование оффера: {(active.context.enrich.sources || []).join(', ') || '—'}
                {active.context.enrich.leadgid?.name
                  ? ` · LeadGid: ${active.context.enrich.leadgid.name}`
                  : ''}
                {active.context.enrich.leadgid?.payout
                  ? ` · payout ${active.context.enrich.leadgid.payout}`
                  : ''}
                {active.context.enrich.page?.title
                  ? ` · page: ${active.context.enrich.page.title.slice(0, 80)}`
                  : ''}
                {active.context.playbook?.vertical_key
                  ? ` · vertical ${active.context.playbook.vertical_key}`
                  : ''}
              </div>
            ) : null}
            {active.context?.direct?.ready_message ? (
              <div className="banner ok">{active.context.direct.ready_message}</div>
            ) : null}
            {active.context?.direct?.apply_summary ? (
              <div
                className={`banner ${active.context.direct.apply_summary.ok ? 'ok' : 'bad'}`}
              >
                Директ apply: групп {active.context.direct.apply_summary.counts?.ad_groups ?? 0}
                {' · '}объявл. {active.context.direct.apply_summary.counts?.ads ?? 0}
                {' · '}ключей {active.context.direct.apply_summary.counts?.keywords ?? 0}
                {active.context.direct.apply_summary.warning
                  ? ` · ⚠ ${active.context.direct.apply_summary.warning}`
                  : ''}
              </div>
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
            {active.context?.traffic_analysis ? (
              <div
                className={`banner ${
                  Array.isArray(active.context.traffic_analysis.apply) &&
                  active.context.traffic_analysis.apply.some((a) => a.ok === false)
                    ? 'bad'
                    : 'ok'
                }`}
              >
                <strong>Аналитик трафика</strong>
                {' · '}площадок в отчёте {active.context.traffic_analysis.placement_report?.rows ?? 0}
                {' · '}к запрету{' '}
                {active.context.traffic_analysis.actions?.exclude_placements?.length || 0}
                {active.context.traffic_analysis.apply?.dry_run
                  ? ' · только рекомендации (галочка «Применить» выкл)'
                  : Array.isArray(active.context.traffic_analysis.apply)
                    ? ` · в Директ: ${active.context.traffic_analysis.apply
                        .map(
                          (a) =>
                            `#${a.campaign_id} ${a.ok ? `+${a.added} (всего ${a.total})` : `ошибка`}`,
                        )
                        .join('; ')}`
                    : ''}
                {(active.context.traffic_analysis.actions?.exclude_placements || []).length ? (
                  <ul style={{ margin: '0.45rem 0 0', paddingLeft: '1.1rem' }}>
                    {active.context.traffic_analysis.actions.exclude_placements
                      .slice(0, 12)
                      .map((p) => (
                        <li key={`${p.campaign_id}-${p.placement}`}>
                          <code>{p.placement}</code> — {p.clicks} кликов / {p.cost} ₽ /{' '}
                          {p.conversions} конв.
                          {p.reasons?.length ? ` · ${p.reasons.join('; ')}` : ''}
                        </li>
                      ))}
                  </ul>
                ) : null}
                {active.context.traffic_analysis.campaigns?.length ? (
                  <ul style={{ margin: '0.45rem 0 0', paddingLeft: '1.1rem' }}>
                    {active.context.traffic_analysis.campaigns.map((c) => (
                      <li key={c.direct?.id || c.direct?.name}>
                        <code>{c.direct?.id}</code> {c.direct?.name} —{' '}
                        {(c.advice || [])
                          .filter((a) => a.level === 'warn' || a.level === 'action' || a.level === 'ok')
                          .map((a) => a.text)
                          .join(' · ') || 'ок'}
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
                <details
                  key={s.id}
                  className="pipeline-step"
                  open={
                    s.status === 'failed' ||
                    s.agent === 'direct' ||
                    s.agent === 'traffic_analyst'
                  }
                >
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
