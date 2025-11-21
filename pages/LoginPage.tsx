import React, { useState } from 'react';
import { useMockData } from '../hooks/useMockData';
import Button from '../components/ui/Button';
import MInput from '../components/ui/MInput';
import { UserCircleIcon } from '@heroicons/react/24/outline';
import { useTheme } from '../hooks/useTheme';

const LoginPage: React.FC = () => {
  const { login } = useMockData();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { settings } = useTheme();

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    await login(email, password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-lg shadow-md">
        <div>
          <div className="mx-auto h-12 w-12 text-primary-600 flex justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to {settings?.logoText || ''}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter your email and password to sign in.
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <MInput id="email" name="email" type="email" label="Email" value={email} onChange={v => setEmail(v)} placeholder="Email address" class="active" />
            <MInput id="password" name="password" type="password" label="Password" value={password} onChange={v => setPassword(v)} placeholder="Password" class="active" />
          </div>

          <div>
            <Button type="submit" className="w-full justify-center flex items-center">
              <UserCircleIcon className="h-5 w-5 mr-2" />
              Sign In
            </Button>
          </div>
        </form>

        <div className="text-xs text-gray-500 mt-4 bg-blue-50 p-3 rounded border border-blue-200">
          <strong>Dev Note:</strong> Use the default admin credentials from `.env.local` (DEFAULT_ADMIN_EMAIL / DEFAULT_ADMIN_PASSWORD) or create a user from the Users page.
        </div>
      </div>
    </div>
  );
};

export default LoginPage;