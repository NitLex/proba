import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Campaigns from './pages/Campaigns';
import Offers from './pages/Offers';
import Landings from './pages/Landings';
import Sources from './pages/Sources';
import Stats from './pages/Stats';
import Logs from './pages/Logs';
import Login from './pages/Login';
import Register from './pages/Register';
import Profile from './pages/Profile';
import Pipeline from './pages/Pipeline';
import Bundles from './pages/Bundles';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p className="hint" style={{ textAlign: 'center', margin: 0 }}>
            Загрузка…
          </p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

/** Orchestrator: registered users only (hidden for demo). */
function RegisteredOnly({ children }) {
  const { user, loading, app } = useAuth();
  if (loading) return null;
  const isDemo = Boolean(user?.is_demo || String(user?.username || '').toLowerCase() === 'demo');
  if (!user || isDemo) return <Navigate to={app?.mode === 'orchestrator' ? '/profile' : '/'} replace />;
  if (app?.mode === 'tracker') return <Navigate to="/" replace />;
  return children;
}

/** Tracker CRUD/stats — hidden on orchestrator-only host. */
function TrackerOnly({ children }) {
  const { app, homePath, loading } = useAuth();
  if (loading) return null;
  if (app?.mode === 'orchestrator') return <Navigate to={homePath} replace />;
  return children;
}

function ModeHome() {
  const { app, homePath } = useAuth();
  if (app?.mode === 'orchestrator') return <Navigate to={homePath} replace />;
  return <Dashboard />;
}

function HomeRedirect() {
  const { homePath } = useAuth();
  return <Navigate to={homePath} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            element={
              <Protected>
                <Layout />
              </Protected>
            }
          >
            <Route index element={<ModeHome />} />
            <Route
              path="bundles"
              element={
                <TrackerOnly>
                  <Bundles />
                </TrackerOnly>
              }
            />
            <Route
              path="campaigns"
              element={
                <TrackerOnly>
                  <Campaigns />
                </TrackerOnly>
              }
            />
            <Route
              path="offers"
              element={
                <TrackerOnly>
                  <Offers />
                </TrackerOnly>
              }
            />
            <Route
              path="landings"
              element={
                <TrackerOnly>
                  <Landings />
                </TrackerOnly>
              }
            />
            <Route
              path="sources"
              element={
                <TrackerOnly>
                  <Sources />
                </TrackerOnly>
              }
            />
            <Route
              path="stats"
              element={
                <TrackerOnly>
                  <Stats />
                </TrackerOnly>
              }
            />
            <Route
              path="logs"
              element={
                <TrackerOnly>
                  <Logs />
                </TrackerOnly>
              }
            />
            <Route
              path="pipeline"
              element={
                <RegisteredOnly>
                  <Pipeline />
                </RegisteredOnly>
              }
            />
            <Route path="profile" element={<Profile />} />
            <Route path="*" element={<HomeRedirect />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
