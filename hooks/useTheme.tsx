import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type ThemeSettings = {
    primaryColor: string;
    sidebarBg: string;
    navTextColor: string;
    logoColor: string;
    textColor: string;
    fontFamily: string;
    navbarBg?: string;
    logoDataUrl?: string | null;
    logoText?: string;
    fontSize?: string;
    logoWidth?: string;
};

const DEFAULT: ThemeSettings = {
    primaryColor: '#3b82f6',
    sidebarBg: '#ffffff',
    navTextColor: '#111827',
    logoColor: '#111827',
    textColor: '#111827',
    fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial'
    , navbarBg: '#ffffff',
    logoDataUrl: null,
    logoText: 'DQAPlus'
    , fontSize: '14px'
    , logoWidth: '100%'
};

const STORAGE_KEY = 'intelliform_theme_settings_v1';

const ThemeContext = createContext<{
    settings: ThemeSettings;
    setSettings: (s: Partial<ThemeSettings>) => void;
    reset: () => void;
} | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
    const [settings, setSettingsState] = useState<ThemeSettings>(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : DEFAULT;
        } catch (e) {
            return DEFAULT;
        }
    });

    useEffect(() => {
        // Apply CSS variables to :root
        const root = document.documentElement;
        root.style.setProperty('--primary-color', settings.primaryColor);
        root.style.setProperty('--sidebar-bg', settings.sidebarBg);
        root.style.setProperty('--nav-text-color', settings.navTextColor);
        root.style.setProperty('--logo-color', settings.logoColor);
        root.style.setProperty('--app-text-color', settings.textColor);
        root.style.setProperty('--app-font-family', settings.fontFamily);
        root.style.setProperty('--app-font-size', (settings as any).fontSize || '14px');
        root.style.setProperty('--logo-width', (settings as any).logoWidth || '40px');
        root.style.setProperty('--navbar-bg', settings.navbarBg || '#ffffff');
        // Apply absolute font-size to root so most elements scale if they don't reference the CSS var
        try { root.style.fontSize = (settings as any).fontSize || '14px'; } catch (e) { }
        if (settings.logoDataUrl) root.style.setProperty('--logo-image', `url(${settings.logoDataUrl})`);
        root.dataset.logoText = settings.logoText || '';
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) { }
    }, [settings]);

    const setSettings = (patch: Partial<ThemeSettings>) => {
        setSettingsState(prev => ({ ...prev, ...patch }));
    };

    const reset = () => setSettingsState(DEFAULT);

    return (
        <ThemeContext.Provider value={{ settings, setSettings, reset }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
    return ctx;
};

export type { ThemeSettings };
