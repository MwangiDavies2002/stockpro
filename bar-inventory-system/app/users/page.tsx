/** biome-ignore-all lint/a11y/useButtonType: <explanation> */
/** biome-ignore-all lint/a11y/noLabelWithoutControl: <explanation> */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { Plus, Edit2, Trash2, Shield, User as UserIcon } from 'lucide-react';
import Navbar from '../components/Navbar';
import { usersApi, authApi } from '../lib/api';
import { toast } from 'sonner';

interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'employee';
  phone: string;
  created_at: string;
  active: boolean;
}

const EMPTY = { name: '', email: '', password: '', role: 'employee' as 'admin' | 'employee', phone: '' };

export default function UsersPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<{ id: number; name: string; role: string; email: string } | null>(null);

  const [users, setUsers]         = useState<User[]>([]);
  const [loading, setLoading]     = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser]   = useState<User | null>(null);
  const [form, setForm]           = useState(EMPTY);
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) {
      router.push('/login');
      return;
    }
    authApi.me()
      .then((res) => {
        setCurrentUser(res.data);
        if (res.data.role !== 'admin') {
          router.push('/pos');
        }
      })
      .catch(() => {
        Cookies.remove('token');
        router.push('/login');
      });
  }, []);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    try {
      const { data } = await usersApi.getAll();
      setUsers(data);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  function openAdd() { setEditUser(null); setForm(EMPTY); setModalOpen(true); }
  function openEdit(u: User) {
    setEditUser(u);
    setForm({ name: u.name, email: u.email, password: '', role: u.role, phone: u.phone });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.email.trim()) return toast.error('Name and email required');
    if (!editUser && !form.password.trim()) return toast.error('Password required for new users');
    setSaving(true);
    try {
      if (editUser) {
        const payload: any = { name: form.name, email: form.email, role: form.role, phone: form.phone, active: editUser.active };
        if (form.password.trim()) payload.password = form.password;
        const { data } = await usersApi.update(editUser.id, payload);
        setUsers((prev) => prev.map((u) => (u.id === editUser.id ? data : u)));
        toast.success('User updated');
      } else {
        const { data } = await usersApi.create(form);
        setUsers((prev) => [...prev, data]);
        toast.success('User created');
      }
      setModalOpen(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this user?')) return;
    try {
      await usersApi.delete(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      toast.success('User removed');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to delete user');
    }
  }

  async function toggleActive(id: number) {
    try {
      const { data } = await usersApi.toggleActive(id);
      setUsers((prev) => prev.map((u) => (u.id === id ? data : u)));
    } catch {
      toast.error('Failed to update status');
    }
  }

  if (!currentUser) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={currentUser} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-base font-semibold text-gray-900">User Management</h1>
            <p className="text-xs text-gray-500 mt-0.5">Admin only — manage bar staff accounts</p>
          </div>
          <button onClick={openAdd}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-2 rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add User
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <div className="text-xl font-semibold">{users.length}</div>
            <div className="text-xs text-gray-500 mt-0.5">Total Users</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <div className="text-xl font-semibold text-purple-600">{users.filter((u) => u.role === 'admin').length}</div>
            <div className="text-xs text-gray-500 mt-0.5">Admins</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <div className="text-xl font-semibold text-green-600">{users.filter((u) => u.active).length}</div>
            <div className="text-xs text-gray-500 mt-0.5">Active</div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Joined</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
                )}
                {!loading && !users.length && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No users found</td></tr>
                )}
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-green-600 text-white text-xs flex items-center justify-center font-medium flex-shrink-0">
                          {u.name[0]}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{u.name}</div>
                          <div className="text-xs text-gray-400">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1 w-fit text-xs px-2 py-0.5 rounded-full font-medium
                        ${u.role === 'admin' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
                        {u.role === 'admin' ? <Shield className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{u.phone || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{new Date(u.created_at).toLocaleDateString('en-KE')}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleActive(u.id)}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors
                          ${u.active ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                        {u.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEdit(u)}
                          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(u.id)}
                          className="p-1.5 rounded-md hover:bg-red-50 text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6 border border-gray-200 shadow-xl">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-base font-semibold">{editUser ? 'Edit User' : 'Add New User'}</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Full Name</label>
                <input type="text" placeholder="John Kamau" value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input type="email" placeholder="john@bar.co.ke" value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                <input type="text" placeholder="0712345678" value={form.phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
                <input type="password" placeholder={editUser ? 'Leave blank to keep current' : 'Min. 8 characters'} value={form.password}
                  onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                <select value={form.role} onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as any }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                  <option value="employee">Employee</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setModalOpen(false)} className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                {saving ? 'Saving...' : editUser ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}