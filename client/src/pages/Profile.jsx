import { useEffect, useState } from 'react';
import { useAuth } from '../auth';

export default function Profile() {
  const { user, updateProfile } = useAuth();
  const [email, setEmail] = useState(user?.email || '');
  const [telegram, setTelegram] = useState(user?.telegram || '');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEmail(user?.email || '');
    setTelegram(user?.telegram || '');
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

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Личный кабинет</h1>
          <p>Контактные данные аккаунта</p>
        </div>
      </div>

      <div className="panel" style={{ maxWidth: 560 }}>
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
                placeholder="you@mail.com"
                required
              />
            </label>
            <label className="lbl full">
              Telegram
              <input
                className="input"
                value={telegram}
                onChange={(e) => setTelegram(e.target.value)}
                placeholder="@username"
                required
              />
            </label>
            <label className="lbl full">
              Дата регистрации
              <input className="input mono" value={user?.created_at || '—'} disabled />
            </label>
          </div>

          {error && <p className="neg">{error}</p>}
          {msg && <p className="pos">{msg}</p>}

          <div style={{ marginTop: '1rem' }}>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
