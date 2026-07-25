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
            <Route index element={<Dashboard />} />
            <Route path="campaigns" element={<Campaigns />} />
            <Route path="offers" element={<Offers />} />
            <Route path="landings" element={<Landings />} />
            <Route path="sources" element={<Sources />} />
            <Route path="stats" element={<Stats />} />
            <Route path="logs" element={<Logs />} />
            <Route path="pipeline" element={<Pipeline />} />
            <Route path="profile" element={<Profile />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
