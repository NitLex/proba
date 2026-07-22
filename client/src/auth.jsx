import { createContext, useContext, useEffect, useState } from 'react';
import { api, setAuthToken, clearAuthToken, getAuthToken } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/api/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => {
        clearAuthToken();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(username, password) {
    const r = await api.post('/api/auth/login', { username, password });
    setAuthToken(r.token);
    setUser(r.user);
    return r.user;
  }

  async function register(username, password) {
    const r = await api.post('/api/auth/register', { username, password });
    setAuthToken(r.token);
    setUser(r.user);
    return r.user;
  }

  function logout() {
    clearAuthToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
