import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Campaigns from './pages/Campaigns';
import Offers from './pages/Offers';
import Landings from './pages/Landings';
import Sources from './pages/Sources';
import Stats from './pages/Stats';
import Logs from './pages/Logs';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="campaigns" element={<Campaigns />} />
          <Route path="offers" element={<Offers />} />
          <Route path="landings" element={<Landings />} />
          <Route path="sources" element={<Sources />} />
          <Route path="stats" element={<Stats />} />
          <Route path="logs" element={<Logs />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
