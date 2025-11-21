import React, { useState, useEffect } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { useMockData } from '../hooks/useMockData';
import { useTheme } from '../hooks/useTheme';

type RoleItem = { role_id: number, name: string };

const ProfilePage: React.FC = () => {
    const { currentUser, saveUser, facilities } = useMockData();
    const { settings } = useTheme();
    const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
    const [profileImage, setProfileImage] = useState<string | null>(null);
    const [roles, setRoles] = useState<RoleItem[]>([]);
    const [userRoles, setUserRoles] = useState<number[]>([]);
    const [selectedFacility, setSelectedFacility] = useState<string | null>(null);

    useEffect(() => {
        if (currentUser) {
            setForm({ firstName: currentUser.firstName || '', lastName: currentUser.lastName || '', email: currentUser.email || '', password: '' });
            setProfileImage((currentUser as any).profileImage || (currentUser as any).profile_image || null);
            setSelectedFacility((currentUser as any).facilityId || (currentUser as any).facility_id || null);
            // fetch roles and user roles (if admin)
            (async () => {
                try {
                    const r = await fetch('/api/admin/roles', { credentials: 'include' });
                    if (r.ok) {
                        const list = await r.json(); setRoles(list);
                    }
                    const ur = await fetch(`/api/admin/user_roles?userId=${currentUser.id}`, { credentials: 'include' });
                    if (ur.ok) {
                        const assigned = await ur.json(); setUserRoles(assigned.map((a: any) => a.role_id));
                    }
                } catch (e) { /* ignore */ }
            })();
        }
    }, [currentUser]);

    const handleSave = async () => {
        if (!currentUser) return alert('No current user');
        const payload: any = { id: currentUser.id, firstName: form.firstName, lastName: form.lastName, email: form.email, facilityId: selectedFacility };
        if (form.password && form.password.length > 0) payload.password = form.password;
        if (profileImage) payload.profileImage = profileImage;
        await saveUser(payload);
        alert('Profile updated');
    };

    const handlePassportUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]; if (!f) return;
        const reader = new FileReader();
        reader.onload = (ev) => { setProfileImage(String(ev.target?.result || null)); };
        reader.readAsDataURL(f);
    };

    const toggleRole = async (roleId: number) => {
        if (!currentUser) return;
        const has = userRoles.includes(roleId);
        try {
            if (has) {
                await fetch('/api/admin/roles/unassign', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser.id, roleId }) });
                setUserRoles(prev => prev.filter(r => r !== roleId));
            } else {
                await fetch('/api/admin/roles/assign', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: currentUser.id, roleId }) });
                setUserRoles(prev => [...prev, roleId]);
            }
        } catch (e) { console.error(e); alert('Failed to update roles'); }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">My Profile & Account</h1>
            </div>

            <Card>
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700">Passport / Profile Image</label>
                    <div className="mt-2 flex items-center gap-4">
                        <div className="w-24 h-24 bg-gray-100 rounded overflow-hidden flex items-center justify-center">
                            {profileImage ? <img src={profileImage} alt="passport" className="object-cover w-full h-full" /> : <div className="text-xs text-gray-400">No image</div>}
                        </div>
                        <div>
                            <input type="file" accept="image/*" onChange={handlePassportUpload} />
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">First Name</label>
                        <input className="mt-1 block w-full p-2 border rounded" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Last Name</label>
                        <input className="mt-1 block w-full p-2 border rounded" value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Email</label>
                        <input className="mt-1 block w-full p-2 border rounded" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">New Password</label>
                        <input type="password" className="mt-1 block w-full p-2 border rounded" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Facility</label>
                        <select className="mt-1 block w-full p-2 border rounded" value={selectedFacility || ''} onChange={e => setSelectedFacility(e.target.value)}>
                            <option value="">-- None --</option>
                            {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                    </div>
                </div>

                <div className="mt-4 flex space-x-3">
                    <Button onClick={handleSave}>Save Profile</Button>
                </div>

                {(currentUser && currentUser.role === 'Admin') && (
                    <div className="mt-6">
                        <h3 className="text-lg font-medium">Manage My Roles</h3>
                        <div className="mt-2 space-y-2">
                            {roles.map(r => (
                                <label key={r.id} className="flex items-center gap-2">
                                    <input type="checkbox" checked={userRoles.includes(r.id)} onChange={() => toggleRole(r.id)} />
                                    <span>{r.name}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}
            </Card>
        </div>
    );
};

export default ProfilePage;
