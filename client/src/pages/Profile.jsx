import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { api } from '../api';

export default function Profile() {
  const { user, updateProfile, changePassword } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [telegram, setTelegram] = useState(user?.telegram || '');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [curPass, setCurPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [newPass2, setNewPass2] = useState('');
  const [passMsg, setPassMsg] = useState('');
  const [passErr, setPassErr] = useState('');

  const [regEnabled, setRegEnabled] = useState(true);
  const [inviteCode, setInviteCode] = useState('');
  const [setMsg2, setSetMsg2] = useState('');
  const [setErr, setSetErr] = useState('');

  useEffect(() => {
    setEmail(user?.email || '');
    setTelegram(user?.telegram || '');
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
  }, [user]);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setMsg('');
    setBusy(true);
    try {
      await updateProfile({ email: email.trim(), telegram: telegram.trim() });
      setMsg('Данные сохранены');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
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
            </div>
            {error && <p className="neg">{error}</p>}
            {msg && <p className="pos">{msg}</p>}
            <button className="btn" type="submit" disabled={busy} style={{ marginTop: '0.75rem' }}>
              Сохранить
            </button>
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
