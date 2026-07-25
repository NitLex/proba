import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

const links = [
  { to: '/', label: 'Дашборд', end: true },
  { to: '/campaigns', label: 'Кампании' },
  { to: '/offers', label: 'Офферы' },
  { to: '/landings', label: 'Лендинги' },
  { to: '/sources', label: 'Источники' },
  { to: '/stats', label: 'Статистика' },
  { to: '/logs', label: 'Клики / конверсии' },
  { to: '/pipeline', label: 'Оркестратор', registeredOnly: true },
  { to: '/profile', label: 'Личный кабинет' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isDemo = Boolean(user?.is_demo || String(user?.username || '').toLowerCase() === 'demo');
  const visibleLinks = links.filter((l) => !l.registeredOnly || !isDemo);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            Arb<span>Track</span>
          </div>
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
