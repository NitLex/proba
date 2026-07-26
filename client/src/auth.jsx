import { createContext, useContext, useEffect, useState } from 'react';
import { api, setAuthToken, clearAuthToken, getAuthToken } from './api';

const AuthContext = createContext(null);

const DEFAULT_APP = {
  mode: 'full',
  name: 'ArbTrack',
  tracker_public_url: null,
  orchestrator_public_url: null,
  pipeline_tracker_mode: null,
};

function homePathForApp(app, user) {
  const mode = app?.mode || 'full';
  if (mode === 'orchestrator') {
    const isDemo = Boolean(user?.is_demo || String(user?.username || '').toLowerCase() === 'demo');
    return isDemo ? '/profile' : '/pipeline';
  }
  return '/';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [app, setApp] = useState(DEFAULT_APP);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const health = await api.get('/api/health');
        if (!cancelled && health?.app) setApp(health.app);
      } catch {
        /* ignore — mode defaults to full */
      }

      const token = getAuthToken();
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const r = await api.get('/api/auth/me');
        if (cancelled) return;
        setUser(r.user);
        if (r.app) setApp(r.app);
      } catch {
        if (cancelled) return;
        clearAuthToken();
        setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(username, password) {
    const r = await api.post('/api/auth/login', { username, password });
    setAuthToken(r.token);
    setUser(r.user);
    const nextApp = r.app || app;
    if (r.app) setApp(r.app);
    return { user: r.user, app: nextApp, homePath: homePathForApp(nextApp, r.user) };
  }

  async function register(payload) {
    const r = await api.post('/api/auth/register', payload);
    setAuthToken(r.token);
    setUser(r.user);
    const nextApp = r.app || app;
    if (r.app) setApp(r.app);
    return { user: r.user, app: nextApp, homePath: homePathForApp(nextApp, r.user) };
  }

  async function updateProfile(payload) {
    const r = await api.put('/api/auth/profile', payload);
    setUser(r.user);
    return r.user;
  }

  async function changePassword(current_password, new_password) {
    await api.put('/api/auth/password', { current_password, new_password });
  }

  function logout() {
    clearAuthToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        app,
        loading,
        homePath: homePathForApp(app, user),
        login,
        register,
        updateProfile,
        changePassword,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}

export { homePathForApp };
