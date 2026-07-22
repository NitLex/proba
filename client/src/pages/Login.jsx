import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(username.trim(), password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="brand" style={{ marginBottom: '1rem' }}>
          <div className="brand-mark">
            Arb<span>Track</span>
          </div>
          <div className="brand-sub">Вход в трекер</div>
        </div>

        <label className="lbl">
          Логин
          <input
            className="input"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <label className="lbl" style={{ marginTop: '0.75rem' }}>
          Пароль
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && <p className="neg" style={{ marginTop: '0.75rem' }}>{error}</p>}

        <button className="btn" type="submit" style={{ width: '100%', marginTop: '1rem' }} disabled={busy}>
          {busy ? 'Входим…' : 'Войти'}
        </button>

        <p className="hint" style={{ marginTop: '1rem', textAlign: 'center' }}>
          Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        </p>
        <p className="hint" style={{ textAlign: 'center' }}>
          Демо: <span className="mono">demo / demo123</span>
        </p>
      </form>
    </div>
  );
}
