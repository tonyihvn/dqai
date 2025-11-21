
import React, { createContext, useContext, useState, useEffect, createElement, ReactNode, FC } from 'react';
import { Program, Activity, Facility, User, ActivityReport, FormDefinition } from '../types';

// Context Definition
interface DataContextType {
    currentUser: User | null;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;

    programs: Program[];
    activities: Activity[];
    facilities: Facility[];
    users: User[];
    reports: ActivityReport[];

    getProgram: (id: string) => Program | undefined;
    saveProgram: (program: Program) => void;
    deleteProgram: (id: string) => void;

    getActivity: (id: string) => Activity | undefined;
    getActivitiesByProgram: (programId: string) => Activity[];
    saveActivity: (activity: Activity) => void;
    deleteActivity: (id: string) => void;

    getFacility: (id: string) => Facility | undefined;
    saveFacility: (facility: Facility) => void;
    deleteFacility: (id: string) => void;

    getUser: (id: string) => User | undefined;
    saveUser: (user: User) => void;
    deleteUser: (id: string) => void;

    saveFormDefinition: (activityId: string, formDef: FormDefinition) => void;
    getFormDefinition: (activityId: string) => FormDefinition | undefined;

    saveReport: (report: ActivityReport) => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

const API_URL = 'http://localhost:3000/api';
const AUTH_URL = 'http://localhost:3000/auth';

// No mock data: app must use backend Postgres for all data

export const DataProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const [currentUser, setCurrentUser] = useState<User | null>(() => {
        try {
            const raw = localStorage.getItem('intelliform_current_user');
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    });
    const [programs, setPrograms] = useState<Program[]>([]);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [facilities, setFacilities] = useState<Facility[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [reports, setReports] = useState<ActivityReport[]>([]);

    // Initial Data Fetch
    useEffect(() => {
        const fetchData = async () => {
            try {
                // Attempt to fetch User
                async function safeJson(res: Response) {
                    try {
                        // Read text first to avoid json() throwing on empty body
                        const txt = await res.text();
                        if (!txt) return null;
                        return JSON.parse(txt);
                    } catch (e) {
                        console.warn('Failed to parse JSON response', e);
                        return null;
                    }
                }

                const userRes = await fetch(`${API_URL}/current_user`, { credentials: 'include' });
                if (userRes.ok) {
                    const user = await safeJson(userRes);
                    if (user) {
                        setCurrentUser(user);
                        try { localStorage.setItem('intelliform_current_user', JSON.stringify(user)); } catch (e) { }
                    }
                }

                // Fetch Programs
                const progRes = await fetch(`${API_URL}/programs`, { credentials: 'include' });
                if (progRes.ok) {
                    const j = await safeJson(progRes);
                    if (j) setPrograms(j);
                }

                // Fetch Activities
                const actRes = await fetch(`${API_URL}/activities`, { credentials: 'include' });
                if (actRes.ok) {
                    const j = await safeJson(actRes);
                    if (j) setActivities(j);
                }

                // Fetch Facilities
                const facRes = await fetch(`${API_URL}/facilities`, { credentials: 'include' });
                if (facRes.ok) {
                    const j = await safeJson(facRes);
                    if (j) setFacilities(j);
                }

                // Fetch Users
                const usersRes = await fetch(`${API_URL}/users`, { credentials: 'include' });
                if (usersRes.ok) {
                    const j = await safeJson(usersRes);
                    if (j) setUsers(j);
                }

                // Fetch Reports
                const reportsRes = await fetch(`${API_URL}/reports`, { credentials: 'include' });
                if (reportsRes.ok) {
                    const j = await safeJson(reportsRes);
                    if (j) setReports(j);
                }

            } catch (error) {
                console.error("Backend unreachable. All data must come from PostgreSQL.", error);
                // Clear state to avoid displaying stale mock data
                setPrograms([]);
                setActivities([]);
                setFacilities([]);
                setUsers([]);
                setReports([]);
                setCurrentUser(null);
                alert('Unable to reach backend API. Please ensure the server is running and .env is configured.');
            }
        };
        fetchData();
    }, []);

    const login = async (email: string, password: string) => {
        try {
            const res = await fetch(`${AUTH_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, password })
            });
            if (res.ok) {
                const user = await res.json();
                setCurrentUser(user);
                try { localStorage.setItem('intelliform_current_user', JSON.stringify(user)); } catch (e) { }
                window.location.href = '#/dashboard';
            } else {
                const txt = await res.text();
                alert("Login failed: " + txt);
            }
        } catch (e) {
            console.error(e);
            alert("Login failed. Backend unreachable.");
        }
    };

    const logout = async () => {
        await fetch(`${API_URL}/logout`, { credentials: 'include' });
        setCurrentUser(null);
        try { localStorage.removeItem('intelliform_current_user'); } catch (e) { }
    };

    // Generic CRUD Helpers
    const handleSave = async (url: string, data: any, setter: React.Dispatch<React.SetStateAction<any[]>>, idField = 'id') => {
        try {
            const res = await fetch(url, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (res.ok) {
                const saved = await res.json();
                setter(prev => {
                    const exists = prev.some(p => p[idField] === saved[idField]);
                    if (exists) return prev.map(p => p[idField] === saved[idField] ? saved : p);
                    return [...prev, saved];
                });
            } else {
                console.error('Save failed', await res.text());
            }
        } catch (e) { console.error(e); }
    };

    const handleDelete = async (url: string, id: string, setter: React.Dispatch<React.SetStateAction<any[]>>) => {
        try {
            await fetch(`${url}/${id}`, { method: 'DELETE', credentials: 'include' });
            setter(prev => prev.filter(p => String(p.id) !== String(id)));
        } catch (e) { console.error(e); }
    };

    // Program CRUD
    const getProgram = (id: string) => programs.find(p => String(p.id) === String(id));
    const saveProgram = (program: Program) => handleSave(`${API_URL}/programs`, program, setPrograms);
    const deleteProgram = (id: string) => handleDelete(`${API_URL}/programs`, id, setPrograms);

    // Activity CRUD
    const getActivity = (id: string) => activities.find(a => String(a.id) === String(id));
    const getActivitiesByProgram = (programId: string) => activities.filter(a => String(a.programId) === String(programId));
    const saveActivity = (activity: Activity) => handleSave(`${API_URL}/activities`, activity, setActivities);
    const deleteActivity = (id: string) => handleDelete(`${API_URL}/activities`, id, setActivities);

    // Facility CRUD
    const getFacility = (id: string) => facilities.find(f => String(f.id) === String(id));
    const saveFacility = (facility: Facility) => handleSave(`${API_URL}/facilities`, facility, setFacilities);
    const deleteFacility = (id: string) => handleDelete(`${API_URL}/facilities`, id, setFacilities);

    // User CRUD
    const getUser = (id: string) => users.find(u => String(u.id) === String(id));
    const saveUser = (user: User) => {
        // Call backend to create/update user
        (async () => {
            try {
                const res = await fetch(`${API_URL}/users`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(user)
                });
                if (res.ok) {
                    const saved = await res.json();
                    setUsers(prev => {
                        const exists = prev.some(u => String(u.id) === String(saved.id));
                        if (exists) return prev.map(p => String(p.id) === String(saved.id) ? saved : p);
                        return [saved, ...prev];
                    });
                } else {
                    console.error('Failed to save user', await res.text());
                    alert('Failed to save user');
                }
            } catch (e) { console.error(e); alert('Failed to save user'); }
        })();
    };
    const deleteUser = (id: string) => setUsers(users.filter(u => String(u.id) !== String(id)));

    // Form Def
    const saveFormDefinition = async (activityId: string, formDef: FormDefinition) => {
        try {
            // Flatten questions and send to dedicated endpoint which syncs into `questions` table
            const questionsArray: any[] = [];
            for (const p of formDef.pages || []) {
                for (const s of p.sections || []) {
                    for (const q of s.questions || []) {
                        questionsArray.push({ ...q, pageName: p.name, sectionName: s.name });
                    }
                }
            }
            await fetch(`${API_URL}/activities/${activityId}/form`, {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ questions: questionsArray })
            });
            // Refresh activities list
            const actRes = await fetch(`${API_URL}/activities`, { credentials: 'include' });
            if (actRes.ok) setActivities(await actRes.json());
        } catch (e) { console.error(e); }
    };

    const getFormDefinition = (activityId: string) => {
        return activities.find(a => String(a.id) === String(activityId))?.formDefinition;
    };

    // Report CRUD
    const saveReport = (report: ActivityReport) => handleSave(`${API_URL}/reports`, report, setReports);

    const value = {
        currentUser, login, logout,
        programs, activities, facilities, users, reports,
        getProgram, saveProgram, deleteProgram,
        getActivity, getActivitiesByProgram, saveActivity, deleteActivity,
        getFacility, saveFacility, deleteFacility,
        getUser, saveUser, deleteUser,
        saveFormDefinition, getFormDefinition,
        saveReport
    };

    return createElement(DataContext.Provider, { value: value }, children);
};

export const useMockData = () => {
    const context = useContext(DataContext);
    if (context === undefined) {
        throw new Error('useMockData must be used within a DataProvider');
    }
    return context;
};
