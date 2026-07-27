import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

const links = [
  { to: '/', label: 'Дашборд', end: true, surface: 'tracker' },
  { to: '/bundles', label: 'Связки', surface: 'tracker' },
  { to: '/campaigns', label: 'Кампании', surface: 'tracker' },
  { to: '/offers', label: 'Офферы', surface: 'tracker' },
  { to: '/landings', label: 'Лендинги', surface: 'tracker' },
  { to: '/sources', label: 'Источники', surface: 'tracker' },
  { to: '/stats', label: 'Статистика', surface: 'tracker' },
  { to: '/logs', label: 'Клики / конверсии', surface: 'tracker' },
  { to: '/pipeline', label: 'Оркестратор', registeredOnly: true, surface: 'orchestrator' },
  { to: '/profile', label: 'Личный кабинет', surface: 'both' },
];

export default function Layout() {
  const { user, app, logout } = useAuth();
  const navigate = useNavigate();
  const isDemo = Boolean(user?.is_demo || String(user?.username || '').toLowerCase() === 'demo');
  const mode = app?.mode || 'full';

  const visibleLinks = links.filter((l) => {
    if (l.registeredOnly && isDemo) return false;
    if (mode === 'orchestrator' && l.surface === 'tracker') return false;
    if (mode === 'tracker' && l.surface === 'orchestrator') return false;
    return true;
  });

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            {mode === 'orchestrator' ? (
              <>
                Orkestr<span>.online</span>
              </>
            ) : (
              <>
                Arb<span>Track</span>
              </>
            )}
          </div>
          {mode !== 'full' ? (
            <div className="hint" style={{ marginTop: '0.35rem', fontSize: '0.75rem' }}>
              {mode === 'orchestrator' ? 'pipeline host' : 'tracker host'}
            </div>
          ) : null}
        </div>
        <nav className="nav">
          {visibleLinks.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div style={{ marginBottom: '0.55rem' }}>
            Вы вошли как <strong className="mono">{user?.username}</strong>
          </div>
          {mode === 'orchestrator' && app?.tracker_public_url ? (
            <a
              className="btn ghost sm"
              href={app.tracker_public_url}
              target="_blank"
              rel="noreferrer"
              style={{ width: '100%', marginBottom: '0.45rem', textAlign: 'center' }}
            >
              Открыть трекер
            </a>
          ) : null}
          <button
            className="btn ghost sm"
            type="button"
            style={{ width: '100%' }}
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            Выйти
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
