
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// Materialize CSS removed; using Tailwind
import './overrides.css';
import { ThemeProvider } from './hooks/useTheme';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
