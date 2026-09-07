import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ChevronDown,
  ChevronRight,
  Layers,
  Box,
  Calendar,
  Braces,
  Search,
  UploadCloud,
  BarChart3,
  Link2,
  Settings,
  LogOut,
  Rocket,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const TEST_SUBMENU = [
  { to: '/suites', label: 'Suites', icon: Layers },
  { to: '/components', label: 'Components', icon: Box },
  { to: '/schedulers', label: 'Schedulers', icon: Calendar },
  { to: '/variables', label: 'Variables', icon: Braces },
  { to: '/locators', label: 'Locators', icon: Search },
  { to: '/uploads', label: 'Uploads', icon: UploadCloud },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/api-testing', label: 'API Testing', icon: Link2 },
];

function navItemClass(isActive: boolean): string {
  return `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
    isActive ? 'bg-gradient-to-r from-brand-500 to-brand-400 text-white shadow-sm' : 'text-muted hover:bg-brand-50 hover:text-ink'
  }`;
}

export default function Sidebar(): JSX.Element {
  const [testsOpen, setTestsOpen] = useState(true);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  return (
    <aside className="w-64 shrink-0 border-r border-border bg-panel flex flex-col p-4 gap-1">
      <div className="flex items-center gap-2.5 px-1 py-2 mb-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-400 flex items-center justify-center font-bold text-white text-lg shadow-sm">
          T
        </div>
        <div>
          <div className="font-bold text-ink leading-tight">Testora</div>
          <div className="text-xs text-muted leading-tight">Test Smarter</div>
        </div>
      </div>

      <NavLink to="/dashboard" className={({ isActive }) => navItemClass(isActive)}>
        <LayoutDashboard size={17} />
        Dashboard
      </NavLink>

      <button
        className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium text-muted hover:bg-brand-50 hover:text-ink"
        onClick={() => setTestsOpen((v) => !v)}
      >
        <span>Tests</span>
        {testsOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
      </button>
      {testsOpen && (
        <div className="flex flex-col gap-0.5">
          {TEST_SUBMENU.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => navItemClass(isActive)}>
              <item.icon size={17} />
              {item.label}
            </NavLink>
          ))}
        </div>
      )}

      <NavLink to="/settings" className={({ isActive }) => navItemClass(isActive)}>
        <Settings size={17} />
        Settings
      </NavLink>

      <div className="flex-1" />

      <div className="rounded-2xl bg-gradient-to-br from-brand-500 to-brand-400 text-white p-4 mb-2 relative overflow-hidden">
        <Rocket size={20} className="mb-2 opacity-90" />
        <div className="font-semibold text-sm leading-tight">Automate Faster</div>
        <div className="text-xs text-white/80 leading-tight">Test Smarter</div>
      </div>

      <button
        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-left text-muted hover:bg-red-50 hover:text-red-500"
        onClick={() => {
          logout();
          navigate('/login');
        }}
      >
        <LogOut size={17} />
        Logout
      </button>
    </aside>
  );
}
