import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/', label: 'Дашборд', end: true },
  { to: '/pipeline', label: 'Оркестратор' },
  { to: '/bundles', label: 'Связки' },
  { to: '/campaigns', label: 'Кампании' },
  { to: '/offers', label: 'Офферы' },
  { to: '/landings', label: 'Лендинги' },
  { to: '/sources', label: 'Источники' },
  { to: '/stats', label: 'Статистика' },
  { to: '/logs', label: 'Клики / конверсии' },
];

export default function Layout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            Arb<span>Track</span>
          </div>
          <div className="brand-sub">Binom-style tracker</div>
        </div>
        <nav className="nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          Клик: <span className="mono">/click/:key</span>
          <br />
          Постбек: <span className="mono">/postback?clickid=…</span>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
