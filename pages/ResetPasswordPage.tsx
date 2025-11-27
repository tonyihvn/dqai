import React, { useEffect, useState } from 'react';
import Button from '../components/ui/Button';
import MInput from '../components/ui/MInput';
import { useLocation } from 'react-router-dom';

function useQuery() {
    const { search } = useLocation();
    return React.useMemo(() => new URLSearchParams(search), [search]);
}

const ResetPasswordPage: React.FC = () => {
    const query = useQuery();
    const [token, setToken] = useState<string | null>(null);
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const t = query.get('token');
        if (t) setToken(t);
    }, [query]);

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!token) return setError('Missing token');
        if (!password) return setError('Enter a new password');
        if (password !== confirm) return setError('Passwords do not match');
        setLoading(true); setError(null);
        try {
            const r = await fetch('/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, newPassword: password }) });
            const j = await r.json();
            if (r.ok && j.ok) {
                setMessage('Password updated. You can now sign in.');
            } else {
                setError(j.error || 'Failed to reset password');
            }
        } catch (e: any) { setError(String(e)); }
        setLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-lg shadow-md">
                <h2 className="text-2xl font-bold">Reset Password</h2>
                {!message && (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <MInput id="newpass" name="newpass" type="password" label="New password" value={password} onChange={v => setPassword(v)} placeholder="New password" />
                        <MInput id="confirm" name="confirm" type="password" label="Confirm password" value={confirm} onChange={v => setConfirm(v)} placeholder="Confirm password" />
                        {error && <div className="text-sm text-red-600">{error}</div>}
                        <div className="flex gap-2">
                            <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save new password'}</Button>
                            <Button variant="secondary" onClick={() => window.location.hash = '#/login'}>Back</Button>
                        </div>
                    </form>
                )}
                {message && (
                    <div>
                        <div className="text-sm text-green-600">{message}</div>
                        <div className="mt-4 flex gap-2"><Button onClick={() => window.location.hash = '#/login'}>Go to login</Button></div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ResetPasswordPage;
