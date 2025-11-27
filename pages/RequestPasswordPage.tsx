import React, { useState } from 'react';
import Button from '../components/ui/Button';
import MInput from '../components/ui/MInput';

const RequestPasswordPage: React.FC = () => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const r = await fetch('/auth/request-password-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
            if (r.ok) {
                setDone(true);
            } else {
                const txt = await r.text();
                setError(txt || 'Failed to request password reset');
            }
        } catch (e: any) { setError(String(e)); }
        setLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-lg shadow-md">
                <h2 className="text-2xl font-bold">Request Password Reset</h2>
                {!done && (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <MInput id="email" name="email" type="email" label="Email" value={email} onChange={v => setEmail(v)} placeholder="Your email" />
                        {error && <div className="text-sm text-red-600">{error}</div>}
                        <div className="flex gap-2">
                            <Button type="submit" disabled={loading}>{loading ? 'Sending...' : 'Send reset email'}</Button>
                            <Button variant="secondary" onClick={() => { window.location.hash = '#/login'; }}>Back</Button>
                        </div>
                    </form>
                )}
                {done && (
                    <div>
                        <div className="text-sm text-green-600">If the email exists we sent a password reset link. Check your inbox.</div>
                        <div className="mt-4 flex gap-2"><Button onClick={() => window.location.hash = '#/login'}>Back to login</Button></div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RequestPasswordPage;
