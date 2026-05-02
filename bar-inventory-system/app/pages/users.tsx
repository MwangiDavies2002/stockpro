'use client';

import { useState } from 'react';
import { Plus, Edit2, Trash2, Shield, User as UserIcon } from 'lucide-react';
import Navbar from '../components/Navbar';
import { toast } from 'sonner';

interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'employee';
  phone: string;
  createdAt: string;
  active: boolean;
}

const MOCK_USERS: User[] = [
  { id:1, name:'James Mutua',    email:'james@bar.co.ke',  role:'admin',    phone:'0712345678', createdAt:'2025-01-10', active:true },
  { id:2, name:'Grace Achieng',  email:'grace@bar.co.ke',  role:'employee', phone:'0722456789', createdAt:'2025-02-14', active:true },
  { id:3, name:'Peter Omondi',   email:'peter@bar.co.ke',  role:'employee', phone:'0733567890', createdAt:'2025-03-05', active:true },
  { id:4, name:'Lucy Wanjiku',   email:'lucy@bar.co.ke',   role:'employee', phone:'0744678901', createdAt:'2025-03-20', active:false },
];

const EMPTY = { name:'', email:'', password:'', role:'employee' as 'admin'|'employee', phone:'' };

export default function UsersPage() {
  const currentUser = { name:'James Mutua', role:'admin', email:'james@bar.co.ke' };
  const [users, setUsers]         = useState<User[]>(MOCK_USERS);
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser]   = useState<User | null>(null);
  const [form, setForm]           = useState(EMPTY);

  function openAdd() { setEditUser(null); setForm(EMPTY); setModalOpen(true); }
  function openEdit(u: User) {
    setEditUser(u);
    setForm({ name:u.name, email:u.email, password:'', role:u.role, phone:u.phone });
    setModalOpen(true);
  }

  function handleSave() {
    if (!form.name.trim() || !form.email.trim()) return toast.error('Name and email required');
    if (editUser) {
      setUsers(prev => prev.map(u => u.id === editUser.id ? { ...u, ...form } : u));
      toast.success('User updated');
    } else {
      const newUser: User = { id:Date.now(), ...form, createdAt:new Date().toISOString().split('T')[0], active:true };
      setUsers(prev => [...prev, newUser]);
      toast.success('User created');
    }
    setModalOpen(false);
  }

  function handleDelete(id: number) {
    if (id === 1) return toast.error("Can't delete the primary admin");
    if (!confirm('Delete this user?')) return;
    setUsers(prev => prev.filter(u => u.id !== id));
    toast.success('User removed');
  }

  function toggleActive(id: number) {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, active: !u.active } : u));
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
            className="flex items-center gap-2 bg-brand hover:bg-brand-dark text-white text-sm px-3 py-2 rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add User
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <div className="text-xl font-semibold">{users.length}</div>
            <div className="text-xs text-gray-500 mt-0.5">Total Users</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <div className="text-xl font-semibold text-purple-600">{users.filter(u=>u.role==='admin').length}</div>
            <div className="text-xs text-gray-500 mt-0.5">Admins</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <div className="text-xl font-semibold text-brand">{users.filter(u=>u.active).length}</div>
            <div className="text-xs text-gray-500 mt-0.5">Active</div>
          </div>
        </div>

        {/* Users table */}
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
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-brand text-white text-xs flex items-center justify-center font-medium flex-shrink-0">
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
                        ${u.role==='admin' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
                        {u.role==='admin' ? <Shield className="w-3 h-3"/> : <UserIcon className="w-3 h-3"/>}
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{u.phone}</td>
                    <td className="px-4 py-3 text-gray-500">{u.createdAt}</td>
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

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6 border border-gray-200 shadow-xl">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-base font-semibold">{editUser ? 'Edit User' : 'Add New User'}</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="space-y-3">
              {[
                { label:'Full Name',    key:'name',  type:'text',  placeholder:'John Kamau'       },
                { label:'Email',        key:'email', type:'email', placeholder:'john@bar.co.ke'   },
                { label:'Phone',        key:'phone', type:'text',  placeholder:'0712345678'       },
                { label:'Password',     key:'password',type:'password',placeholder: editUser?'Leave blank to keep current':'Min. 8 characters' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder}
                    value={(form as any)[f.key]}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                <select value={form.role} onChange={e => setForm(prev => ({ ...prev, role: e.target.value as any }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                  <option value="employee">Employee</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setModalOpen(false)} className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} className="bg-brand text-white px-4 py-2 rounded-lg text-sm hover:bg-brand-dark">
                {editUser ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
