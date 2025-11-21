import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellIcon, UserCircleIcon, ArrowRightOnRectangleIcon, Bars3Icon } from '@heroicons/react/24/outline';
import { useMockData } from '../../hooks/useMockData';
import { useTheme } from '../../hooks/useTheme';

const Header: React.FC<{ collapsed?: boolean; onToggleSidebar?: () => void; onToggleMobileSidebar?: () => void }> = ({ collapsed, onToggleSidebar, onToggleMobileSidebar }) => {
  const { currentUser, logout } = useMockData();
  const navigate = useNavigate();
  const { settings } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="relative bg-white shadow-sm z-10">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Mobile: show centered logo above menu row */}
          <div className="md:hidden absolute left-0 right-0 top-0 flex items-center justify-center py-1 pointer-events-none">
            {settings.logoDataUrl ? (
              <img src={settings.logoDataUrl} alt="logo" style={{ height: 'var(--logo-width)', maxHeight: 48, objectFit: 'contain', pointerEvents: 'auto' }} />
            ) : (
              <div style={{ color: 'var(--logo-color)', fontWeight: 700, fontSize: 'var(--app-font-size)' }}>{settings.logoText}</div>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <button onClick={() => (onToggleMobileSidebar ? onToggleMobileSidebar() : onToggleSidebar && onToggleSidebar())} className="p-2 rounded-md text-gray-600 hover:bg-gray-100 md:hidden">
              <Bars3Icon className="h-6 w-6" />
            </button>
            <button onClick={onToggleSidebar} className="p-2 rounded-md text-gray-600 hover:bg-gray-100 hidden md:inline-flex" title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
              <Bars3Icon className="h-6 w-6" />
            </button>
            <div className="flex items-center space-x-3">
              <h2 className="text-xl font-semibold text-gray-800 hidden md:block">Welcome, {currentUser?.firstName}</h2>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <button
              type="button"
              className="p-1 rounded-full text-gray-400 hover:text-gray-500 focus:outline-none"
            >
              <span className="sr-only">View notifications</span>
              <BellIcon className="h-6 w-6" aria-hidden="true" />
            </button>

            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen(v => !v)} className="flex items-center space-x-2 focus:outline-none">
                {currentUser?.profileImage ? (
                  <img src={currentUser.profileImage} alt="profile" className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <UserCircleIcon className="h-8 w-8 text-gray-400" />
                )}
                <div className="ml-2 text-sm hidden sm:block text-left">
                  <div className="font-medium text-gray-700">{currentUser?.firstName} {currentUser?.lastName}</div>
                  <div className="text-gray-500">{currentUser?.role}</div>
                </div>
              </button>

              {menuOpen && (
                <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50">
                  <div className="py-1">
                    {currentUser?.role === 'Admin' && (
                      <button onClick={() => { setMenuOpen(false); navigate('/settings'); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Settings</button>
                    )}
                    <button onClick={() => { setMenuOpen(false); navigate('/profile'); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Profile</button>
                    <button onClick={() => { setMenuOpen(false); navigate('/docs'); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Docs</button>
                    <button onClick={() => { setMenuOpen(false); handleLogout(); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Logout</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;