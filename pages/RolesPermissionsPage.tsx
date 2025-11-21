import React, { useEffect, useState } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import MInput from '../components/ui/MInput';

// Placeholder types, adjust as needed
type Role = { id: number; name: string; description?: string };
type Permission = { id: number; name: string; description?: string };
type User = { id: number; first_name: string; last_name: string; email: string; roles: Role[]; permissions: Permission[] };

const RolesPermissionsPage: React.FC = () => {
    const [roles, setRoles] = useState<Role[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [userRoles, setUserRoles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchAll() {
            setLoading(true);
            setError(null);
            try {
                let [rolesRes, permsRes, userRolesRes] = await Promise.all([
                    fetch('/api/admin/roles', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
                    fetch('/api/admin/permissions', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
                    fetch('/api/admin/user_roles', { credentials: 'include' }).then(r => r.ok ? r.json() : [])
                ]);
                setRoles(Array.isArray(rolesRes) ? rolesRes : []);
                setPermissions(Array.isArray(permsRes) ? permsRes : []);
                setUserRoles(Array.isArray(userRolesRes) ? userRolesRes : []);
            } catch (e) {
                setError('Failed to fetch roles/permissions/user_roles. You may not be authorized.');
                setRoles([]); setPermissions([]); setUserRoles([]);
            }
            setLoading(false);
        }
        fetchAll();
    }, []);

    return (
        <div className="p-4">
            {error && <div className="text-red-600 mb-4">{error}</div>}
            <Card>
                <h2 className="text-xl font-bold mb-4">Roles</h2>
                <table className="min-w-full text-sm mb-4">
                    <thead><tr><th>ID</th><th>Name</th><th>Description</th></tr></thead>
                    <tbody>
                        {roles.map(r => <tr key={r.id}><td>{r.id}</td><td>{r.name}</td><td>{r.description}</td></tr>)}
                    </tbody>
                </table>
            </Card>
            <Card className="mt-6">
                <h2 className="text-xl font-bold mb-4">Permissions</h2>
                <table className="min-w-full text-sm mb-4">
                    <thead><tr><th>ID</th><th>Name</th><th>Description</th></tr></thead>
                    <tbody>
                        {permissions.map(p => <tr key={p.id}><td>{p.id}</td><td>{p.name}</td><td>{p.description}</td></tr>)}
                    </tbody>
                </table>
            </Card>
            <Card className="mt-6">
                <h2 className="text-xl font-bold mb-4">User Roles</h2>
                <table className="min-w-full text-sm mb-4">
                    <thead><tr><th>User ID</th><th>Role ID</th><th>Role Name</th></tr></thead>
                    <tbody>
                        {userRoles.map((ur, i) => <tr key={i}><td>{ur.user_id}</td><td>{ur.role_id}</td><td>{ur.role_name || ur.name}</td></tr>)}
                    </tbody>
                </table>
            </Card>
        </div>
    );
};

export default RolesPermissionsPage;
