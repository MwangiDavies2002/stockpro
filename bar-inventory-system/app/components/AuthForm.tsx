/** biome-ignore-all lint/a11y/noLabelWithoutControl: <explanation> */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Eye, EyeOff, Loader2 } from './TextMark';
import Cookies from 'js-cookie';
import { authApi } from '../lib/api';
import { toast } from 'sonner';
import GoogleSignInButton from './GoogleSignInButton';

type Mode = 'login' | 'register';

/**
 * Authentication form component used for login and registration.
 * Switches mode between `login` and `register` and handles form submit.
 */
export default function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', password: '', confirmPassword: '', role: 'employee',
  });

  /**
   * Update form state for input/select changes.
   */
  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  /**
   * Handle form submission for login or register flows.
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === 'register') {
      router.push('/register-business');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        const { data } = await authApi.login({ email: form.email, password: form.password });
        Cookies.set('token', data.token, { expires: 7 });
        toast.success('Welcome back!');
        router.push(data.user?.access?.superadmin?'/superadmin':'/');
      }
    } catch (err: any) {
      const message=err.response?.data?.message
        ||(err.code==='ECONNABORTED'?'Sign-in timed out. Check your connection and try again.'
        :err.response?.status?`Sign-in failed (server response ${err.response.status}). Please try again.`
        :err.request?'Could not reach the StockPro server. Check your internet connection and try again.'
        :'Sign-in failed. Please try again.');
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleCredential(credential: string) {
    setLoading(true);
    try {
      const { data } = await authApi.googleAuth(credential);
      Cookies.set('token', data.token, { expires: 7 });
      toast.success('Welcome back!');
      router.push(data.user?.access?.superadmin ? '/superadmin' : '/');
    } catch (err: any) {
      if (err.response?.data?.suggestOnboarding) {
        sessionStorage.setItem('stockpro_google_signup', JSON.stringify({ credential, email: err.response.data.email, name: err.response.data.name }));
        router.push('/register-business?google=1');
      } else toast.error(err.response?.data?.message || 'Google sign-in failed');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-sm bg-brand mb-4">
            <span className="text-white font-semibold">SP</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">StockPro</h1>
          <p className="text-sm text-gray-500 mt-1">
            {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border border-gray-200 rounded-sm p-8 ">
          {/* Toggle */}
          <div className="flex bg-gray-100 rounded-sm p-1 mb-6">
            {(['login', 'register'] as Mode[]).map((m) => (
              // biome-ignore lint/a11y/useButtonType: <explanation>
<button
                key={m}
                onClick={() => m==='register'?router.push('/register-business'):setMode('login')}
                className={`flex-1 py-2 text-sm font-medium rounded-sm  capitalize
                  ${mode === m ? 'bg-white text-gray-900 ' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {m === 'login' ? 'Sign In' : 'Register business'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                {/** biome-ignore lint/a11y/noLabelWithoutControl: <explanation> */}
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  required
                  placeholder="John Kamau"
                  className="w-full border border-gray-300 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                />
              </div>
            )}

            <div>
              {/** biome-ignore lint/a11y/noLabelWithoutControl: <explanation> */}
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                required
                placeholder="you@bar.co.ke"
                className="w-full border border-gray-300 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  required
                  minLength={8}
                  placeholder="Min. 8 characters"
                  className="w-full border border-gray-300 rounded-sm px-3 py-2.5 text-sm pr-20 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                  <input
                    type={showPw ? 'text' : 'password'}
                    name="confirmPassword"
                    value={form.confirmPassword}
                    onChange={handleChange}
                    required
                    minLength={8}
                    placeholder="Repeat password"
                    className="w-full border border-gray-300 rounded-sm px-3 py-2.5 text-sm pr-20 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                  />
                </div>
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select
                    name="role"
                    value={form.role}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  >
                    <option value="employee">Employee</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand hover:bg-brand-dark text-white font-medium py-2.5 rounded-sm text-sm  flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          {mode === 'login' && (
            <div className="mt-6">
              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
                <div className="relative flex justify-center text-sm"><span className="px-2 bg-white text-gray-500">Or continue with</span></div>
              </div>
              <GoogleSignInButton onCredential={handleGoogleCredential} disabled={loading} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
