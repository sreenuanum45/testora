import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import AppLayout from './layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NewTest from './pages/NewTest';
import TestDetail from './pages/TestDetail';
import Suites from './pages/Suites';
import Schedulers from './pages/Schedulers';
import Variables from './pages/Variables';
import Locators from './pages/Locators';
import Uploads from './pages/Uploads';
import Reports from './pages/Reports';
import ApiTesting from './pages/ApiTesting';
import Components from './pages/Components';
import Settings from './pages/Settings';

function RequireAuth({ children }: { children: JSX.Element }): JSX.Element {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/new-test" element={<NewTest />} />
        <Route path="/tests/:testId" element={<TestDetail />} />
        <Route path="/suites" element={<Suites />} />
        <Route path="/components" element={<Components />} />
        <Route path="/schedulers" element={<Schedulers />} />
        <Route path="/variables" element={<Variables />} />
        <Route path="/locators" element={<Locators />} />
        <Route path="/uploads" element={<Uploads />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/api-testing" element={<ApiTesting />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
