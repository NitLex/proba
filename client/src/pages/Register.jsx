import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { api } from '../api';
import { trackSiteVisit } from '../analytics';

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({
    username: '',
    email: '',
    telegram: '',
    password: '',
    password2: '',
    invite_code: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    trackSiteVisit('/register');
    api
      .get('/api/auth/registration-status')
      .then(setStatus)
      .catch(() => setStatus({ enabled: true, invite_required: false }));
  }, []);

  if (user) return <Navigate to="/" replace />;

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (form.password !== form.password2) {
      setError('Пароли не совпадают');
      return;
    }
    setBusy(true);
    try {
      await register({
        username: form.username.trim(),
        email: form.email.trim(),
        telegram: form.telegram.trim(),
        password: form.password,
        invite_code: form.invite_code.trim(),
      });
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (status && !status.enabled) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="brand" style={{ marginBottom: '1rem' }}>
            <div className="brand-mark">
              Arb<span>Track</span>
            </div>
            <div className="brand-sub">Регистрация закрыта</div>
          </div>
          <p className="hint">Новые аккаунты сейчас не принимаются. Обратитесь к администратору.</p>
          <p className="hint" style={{ textAlign: 'center' }}>
            <Link to="/login">Войти</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="brand" style={{ marginBottom: '1rem' }}>
          <div className="brand-mark">
            Arb<span>Track</span>
          </div>
          <div className="brand-sub">Регистрация</div>
        </div>

        <label className="lbl">
          Логин
          <input
            className="input"
            autoComplete="username"
            value={form.username}
            onChange={(e) => setField('username', e.target.value)}
            placeholder="latin_letters_123"
            required
          />
        </label>
        <label className="lbl" style={{ marginTop: '0.75rem' }}>
          Email
          <input
            className="input"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setField('email', e.target.value)}
            placeholder="you@mail.com"
            required
          />
        </label>
        <label className="lbl" style={{ marginTop: '0.75rem' }}>
          Telegram
          <input
            className="input"
            value={form.telegram}
            onChange={(e) => setField('telegram', e.target.value)}
            placeholder="@username"
            required
          />
        </label>
        {status?.invite_required && (
          <label className="lbl" style={{ marginTop: '0.75rem' }}>
            Инвайт-код
            <input
              className="input mono"
              value={form.invite_code}
              onChange={(e) => setField('invite_code', e.target.value)}
              required
            />
          </label>
        )}
        <label className="lbl" style={{ marginTop: '0.75rem' }}>
          Пароль
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setField('password', e.target.value)}
            minLength={6}
            required
          />
        </label>
        <label className="lbl" style={{ marginTop: '0.75rem' }}>
          Повтор пароля
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={form.password2}
            onChange={(e) => setField('password2', e.target.value)}
            minLength={6}
            required
          />
        </label>

        {error && (
          <p className="neg" style={{ marginTop: '0.75rem' }}>
            {error}
          </p>
        )}

        <button className="btn" type="submit" style={{ width: '100%', marginTop: '1rem' }} disabled={busy}>
          {busy ? 'Создаём…' : 'Создать аккаунт'}
        </button>

        <p className="hint" style={{ marginTop: '1rem', textAlign: 'center' }}>
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
      </form>
    </div>
  );
}
