import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChartPieIcon, DocumentPlusIcon, DocumentTextIcon, BuildingOfficeIcon, UserGroupIcon, FolderIcon, ClipboardDocumentListIcon, Cog6ToothIcon, UserIcon } from '@heroicons/react/24/outline';
import { useTheme } from '../../hooks/useTheme';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: ChartPieIcon },
  { name: 'Programs', href: '/programs', icon: FolderIcon },
  { name: 'Activities', href: '/activities', icon: ClipboardDocumentListIcon },
  { name: 'Reports', href: '/reports', icon: DocumentTextIcon },
  { name: 'Facilities', href: '/facilities', icon: BuildingOfficeIcon },
  { name: 'Users', href: '/users', icon: UserGroupIcon },
  { name: 'Settings', href: '/settings', icon: Cog6ToothIcon },
  { name: 'Profile', href: '/profile', icon: UserIcon },
];

const Sidebar: React.FC<{ collapsed?: boolean }> = ({ collapsed = false }) => {
  const location = useLocation();
  const sidebarWidthClass = collapsed ? 'md:w-20' : 'md:w-64';
  const { settings } = useTheme();

  return (
    <aside className={`app-sidebar hidden md:flex ${sidebarWidthClass} md:flex-col md:fixed md:inset-y-0 transition-all bg-white z-20`} style={{ backgroundColor: '#ffffff' }}>
      <div className="app-sidebar-inner flex flex-col flex-grow overflow-y-auto border-r border-gray-200 h-full" style={{ backgroundColor: '#ffffff' }}>
        <div className="flex flex-col items-center flex-shrink-0 px-4" style={{ paddingTop: 0, paddingBottom: 0, margin: 0 }}>
          {settings?.logoDataUrl ? (
            <img src={settings.logoDataUrl} alt="logo" className="object-contain block" style={{ width: 'var(--logo-width)', height: 'var(--logo-width)', margin: 0, padding: 0, display: 'block' }} />
          ) : (
            <DocumentPlusIcon className="text-primary-600" style={{ width: 'var(--logo-width)', height: 'var(--logo-width)', margin: 0, padding: 0, display: 'block' }} />
          )}
          {!collapsed && (
            <div style={{ marginTop: 0, padding: 0, textAlign: 'center' }}>
              <div className="font-bold text-gray-800" style={{ color: 'var(--logo-color)', fontSize: 'var(--app-font-size)', margin: 0, padding: 0 }}>{settings?.logoText || ''}</div>
            </div>
          )}
        </div>

        <div className="mt-0 flex-1 flex flex-col">
          <nav className="flex-1 px-2 pb-4 space-y-1">
            {navigation.map((item) => {
              const isActive = location.pathname.startsWith(item.href);
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`group flex items-center ${collapsed ? 'justify-center' : ''} px-2 py-2 text-sm font-medium rounded-md ${isActive
                    ? 'bg-primary-50 text-primary-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                >
                  <item.icon className={`flex-shrink-0 h-6 w-6 ${isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-gray-500'}`} aria-hidden="true" />
                  {!collapsed && <span className="ml-3">{item.name}</span>}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;