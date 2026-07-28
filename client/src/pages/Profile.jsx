import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { api, num } from '../api';
import { Metric } from '../components/ui';

export default function Profile() {
  const { user, updateProfile, changePassword } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [telegram, setTelegram] = useState(user?.telegram || '');
  const [chatId, setChatId] = useState(user?.telegram_chat_id || '');
  const [alertsOn, setAlertsOn] = useState(user?.alerts_enabled !== false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [alertStatus, setAlertStatus] = useState(null);
  const [testMsg, setTestMsg] = useState('');
  const [testErr, setTestErr] = useState('');

  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPass2, setNewPass2] = useState('');
  const [passMsg, setPassMsg] = useState('');
  const [passErr, setPassErr] = useState('');

  const [regEnabled, setRegEnabled] = useState(true);
  const [inviteCode, setInviteCode] = useState('');
  const [setMsg2, setSetMsg2] = useState('');
  const [setErr, setSetErr] = useState('');
  const [siteStats, setSiteStats] = useState(null);
  const [alertSettings, setAlertSettings] = useState(null);
  const [alertSetMsg, setAlertSetMsg] = useState('');
  const [alertSetErr, setAlertSetErr] = useState('');

  useEffect(() => {
    setEmail(user?.email || '');
    setTelegram(user?.telegram || '');
    setChatId(user?.telegram_chat_id || '');
    setAlertsOn(user?.alerts_enabled !== false);
  }, [user]);

  useEffect(() => {
    api
      .get('/api/alerts/status')
      .then(setAlertStatus)
      .catch(() => setAlertStatus(null));
  }, [user]);

  useEffect(() => {
    if (!user?.is_admin) return;
    api
      .get('/api/settings')
      .then((s) => {
        setRegEnabled(!!s.registration_enabled);
        setInviteCode(s.invite_code || '');
      })
      .catch(() => {});
    api
      .get('/api/analytics/site')
      .then(setSiteStats)
      .catch(() => setSiteStats(null));
    api
      .get('/api/alerts/settings')
      .then(setAlertSettings)
      .catch(() => setAlertSettings(null));
  }, [user]);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setMsg('');
    setBusy(true);
    try {
      await updateProfile({
        email: email.trim(),
        telegram: telegram.trim(),
        telegram_chat_id: chatId.trim(),
        alerts_enabled: alertsOn,
      });
      setMsg('Данные сохранены');
      const st = await api.get('/api/alerts/status');
      setAlertStatus(st);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onTestAlert() {
    setTestErr('');
    setTestMsg('');
    try {
      await api.post('/api/alerts/test', {});
      setTestMsg('Тестовое сообщение отправлено в Telegram');
    } catch (err) {
      setTestErr(err.message);
    }
  }

  async function onAlertSettings(e) {
    e.preventDefault();
    setAlertSetErr('');
    setAlertSetMsg('');
    try {
      const s = await api.put('/api/alerts/settings', alertSettings);
      setAlertSettings(s);
      setAlertSetMsg('Пороги алертов сохранены');
    } catch (err) {
      setAlertSetErr(err.message);
    }
  }

  async function onPassword(e) {
    e.preventDefault();
    setPassErr('');
    setPassMsg('');
    if (newPass !== newPass2) {
      setPassErr('Пароли не совпадают');
      return;
    }
    try {
      await changePassword(curPass, newPass);
      setPassMsg('Пароль изменён');
      setCurPass('');
      setNewPass('');
      setNewPass2('');
    } catch (err) {
      setPassErr(err.message);
    }
  }

  async function onSettings(e) {
    e.preventDefault();
    setSetErr('');
    setSetMsg2('');
    try {
      const s = await api.put('/api/settings', {
        registration_enabled: regEnabled,
        invite_code: inviteCode.trim(),
      });
      setRegEnabled(!!s.registration_enabled);
      setInviteCode(s.invite_code || '');
      setSetMsg2('Настройки сохранены');
    } catch (err) {
      setSetErr(err.message);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Личный кабинет</h1>
          <p>Профиль, пароль{user?.is_admin ? ' и настройки регистрации' : ''}</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <h2>Профиль</h2>
          </div>
          <form onSubmit={onSubmit} style={{ padding: '1rem' }}>
            <div className="form-grid">
              <label className="lbl full">
                Логин
                <input className="input mono" value={user?.username || ''} disabled />
              </label>
              <label className="lbl full">
                Email
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label className="lbl full">
                Telegram
                <input
                  className="input"
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  required
                />
              </label>
              <label className="lbl full">
                Telegram chat_id (для алертов)
                <input
                  className="input mono"
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  placeholder="123456789"
                />
              </label>
              <label
                className="lbl full"
                style={{ flexDirection: 'row', alignItems: 'center', gap: '0.6rem' }}
              >
                <input
                  type="checkbox"
                  checked={alertsOn}
                  onChange={(e) => setAlertsOn(e.target.checked)}
                />
                Telegram-алерты (0 конверсий / просадка ROI)
              </label>
            </div>
            <p className="hint">
              Бот: {alertStatus?.bot_configured ? 'настроен на сервере' : 'не настроен (TELEGRAM_BOT_TOKEN)'}
              . Напишите боту /start, узнайте chat_id (@userinfobot) и сохраните здесь.
            </p>
            {error && <p className="neg">{error}</p>}
            {msg && <p className="pos">{msg}</p>}
            <div className="toolbar" style={{ marginTop: '0.75rem' }}>
              <button className="btn" type="submit" disabled={busy}>
                Сохранить
              </button>
              <button className="btn ghost" type="button" onClick={onTestAlert}>
                Тест в Telegram
              </button>
            </div>
            {testErr && <p className="neg">{testErr}</p>}
            {testMsg && <p className="pos">{testMsg}</p>}
          </form>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Смена пароля</h2>
          </div>
          <form onSubmit={onPassword} style={{ padding: '1rem' }}>
            <div className="form-grid">
              <label className="lbl full">
                Текущий пароль
                <input
                  className="input"
                  type="password"
                  value={curPass}
                  onChange={(e) => setCurPass(e.target.value)}
                  required
                />
              </label>
              <label className="lbl full">
                Новый пароль
                <input
                  className="input"
                  type="password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  minLength={6}
                  required
                />
              </label>
              <label className="lbl full">
                Повтор нового пароля
                <input
                  className="input"
                  type="password"
                  value={newPass2}
                  onChange={(e) => setNewPass2(e.target.value)}
                  minLength={6}
                  required
                />
              </label>
            </div>
            {passErr && <p className="neg">{passErr}</p>}
            {passMsg && <p className="pos">{passMsg}</p>}
            <button className="btn" type="submit" style={{ marginTop: '0.75rem' }}>
              Сменить пароль
            </button>
          </form>
        </div>
      </div>

      {user?.is_admin && siteStats && (
        <div className="panel" style={{ marginTop: '1rem' }}>
          <div className="panel-head">
            <h2>Посетители сайта</h2>
          </div>
          <div style={{ padding: '1rem' }}>
            <p className="hint" style={{ marginTop: 0 }}>
              Считаются заходы на страницы входа и регистрации (не клики по /click/…).
            </p>
            <div className="metrics" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              <Metric label="Визиты сегодня" value={num(siteStats.visits_today)} />
              <Metric label="Уники сегодня" value={num(siteStats.uniques_today)} />
              <Metric label="Регистрации сегодня" value={num(siteStats.registrations_today)} />
              <Metric label="Визиты всего" value={num(siteStats.visits_total)} />
              <Metric label="Уники всего" value={num(siteStats.uniques_total)} />
              <Metric label="Пользователей всего" value={num(siteStats.registrations)} />
            </div>

            <div className="table-wrap" style={{ marginTop: '1rem' }}>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Логин</th>
                    <th>Email</th>
                    <th>Telegram</th>
                    <th>Когда</th>
                  </tr>
                </thead>
                <tbody>
                  {(siteStats.recent_users || []).map((u) => (
                    <tr key={u.id}>
                      <td className="mono">{u.id}</td>
                      <td>
                        {u.username}
                        {u.is_admin ? ' · admin' : ''}
                      </td>
                      <td>{u.email || '—'}</td>
                      <td>{u.telegram || '—'}</td>
                      <td className="mono">{u.created_at}</td>
                    </tr>
                  ))}
                  {!siteStats.recent_users?.length && (
                    <tr>
                      <td colSpan={5}>
                        <div className="empty">Пользователей пока нет</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {user?.is_admin && alertSettings && (
        <div className="panel" style={{ marginTop: '1rem', maxWidth: 560 }}>
          <div className="panel-head">
            <h2>Пороги алертов (админ)</h2>
          </div>
          <form onSubmit={onAlertSettings} style={{ padding: '1rem' }}>
            <div className="form-grid">
              <label className="lbl">
                Окно, часов
                <input
                  className="input"
                  type="number"
                  value={alertSettings.alert_window_hours}
                  onChange={(e) =>
                    setAlertSettings({ ...alertSettings, alert_window_hours: e.target.value })
                  }
                />
              </label>
              <label className="lbl">
                Мин. кликов (общий 0 conv)
                <input
                  className="input"
                  type="number"
                  value={alertSettings.alert_min_clicks}
                  onChange={(e) =>
                    setAlertSettings({ ...alertSettings, alert_min_clicks: e.target.value })
                  }
                />
              </label>
              <label className="lbl">
                ROI порог %
                <input
                  className="input"
                  type="number"
                  value={alertSettings.alert_roi_threshold}
                  onChange={(e) =>
                    setAlertSettings({ ...alertSettings, alert_roi_threshold: e.target.value })
                  }
                />
              </label>
              <label className="lbl">
                Мин. кликов на кампанию
                <input
                  className="input"
                  type="number"
                  value={alertSettings.alert_campaign_min_clicks}
                  onChange={(e) =>
                    setAlertSettings({
                      ...alertSettings,
                      alert_campaign_min_clicks: e.target.value,
                    })
                  }
                />
              </label>
              <label className="lbl">
                Cooldown, часов
                <input
                  className="input"
                  type="number"
                  value={alertSettings.alert_cooldown_hours}
                  onChange={(e) =>
                    setAlertSettings({ ...alertSettings, alert_cooldown_hours: e.target.value })
                  }
                />
              </label>
            </div>
            {alertSetErr && <p className="neg">{alertSetErr}</p>}
            {alertSetMsg && <p className="pos">{alertSetMsg}</p>}
            <button className="btn" type="submit" style={{ marginTop: '0.75rem' }}>
              Сохранить пороги
            </button>
          </form>
        </div>
      )}

      {user?.is_admin && (
        <div className="panel" style={{ marginTop: '1rem', maxWidth: 560 }}>
          <div className="panel-head">
            <h2>Регистрация (админ)</h2>
          </div>
          <form onSubmit={onSettings} style={{ padding: '1rem' }}>
            <label className="lbl" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.6rem' }}>
              <input
                type="checkbox"
                checked={regEnabled}
                onChange={(e) => setRegEnabled(e.target.checked)}
              />
              Разрешить регистрацию новых пользователей
            </label>
            <label className="lbl" style={{ marginTop: '0.75rem' }}>
              Инвайт-код (пусто = без кода)
              <input
                className="input mono"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="secret-invite"
              />
            </label>
            {setErr && <p className="neg">{setErr}</p>}
            {setMsg2 && <p className="pos">{setMsg2}</p>}
            <button className="btn" type="submit" style={{ marginTop: '0.75rem' }}>
              Сохранить настройки
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
