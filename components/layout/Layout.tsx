
import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Compute left offset for content based on sidebar width. When collapsed we remove the left margin so main can expand.
  const contentMarginClass = collapsed ? 'md:ml-0' : 'md:ml-64';

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className={`flex-1 flex flex-col overflow-y-hidden ${contentMarginClass}`}>
        <Header collapsed={collapsed} onToggleSidebar={() => setCollapsed(c => !c)} onToggleMobileSidebar={() => setMobileOpen(o => !o)} />
        <main className="flex-1 overflow-x-auto overflow-y-auto bg-gray-100 p-4 md:p-6 lg:p-8 mb-0 pb-0 transition-all duration-200">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
