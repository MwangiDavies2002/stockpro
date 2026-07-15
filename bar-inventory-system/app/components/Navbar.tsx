'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Package, ShoppingCart, BarChart3,
  Users, LogOut, Bell, Menu, X, ChevronDown,
  CreditCard,Receipt
} from 'lucide-react';
import Cookies from 'js-cookie';
import { authApi } from '../lib/api';
import { toast } from 'sonner';

const NAV_ITEMS = [
  { href: '/',          label: 'Dashboard',  icon: LayoutDashboard, adminOnly: false },
  {href:'/pos',               label:'POS',   icon:CreditCard,                       adminOnly:false},
  { href: '/inventory', label: 'Inventory',  icon: Package,         adminOnly: false },
  //{ href: '/orders',    label: 'Orders',     icon: ShoppingCart,    adminOnly: false },
  { href: '/reports',   label: 'Reports',    icon: BarChart3,       adminOnly: false },
  { href: '/users',     label: 'Users',      icon: Users,           adminOnly: true  },
  {href: '/sales', label:'Sales', icon:Receipt, adminOnly:false}
];

interface NavbarProps {
  user: { name: string; role: string; email: string } | null;
  alertCount?: number;
}

/**
 * Top navigation bar component. Shows navigation links, alerts and user menu.
 */
export default function Navbar({ user, alertCount = 0 }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(user ?? null);

  const isAdmin = currentUser?.role === 'admin';

  // Try to load current user if not provided (client-side) and a token exists
  useEffect(() => {
    let mounted = true;
    if (!currentUser) {
      const token = Cookies.get('token');
      if (token) {
        authApi.me().then((res) => {
          if (mounted) setCurrentUser(res.data);
        }).catch(() => {
          Cookies.remove('token');
        });
      }
    }
    return () => { mounted = false; };
  }, [currentUser]);

  /** Log the user out by calling the logout endpoint and removing token. */
  async function handleLogout() {
    try {
      await authApi.logout();
    } catch {}
    Cookies.remove('token');
    router.push('/login');
    toast.success('Logged out successfully');
  }

  const visibleItems = isAdmin ? NAV_ITEMS : NAV_ITEMS.filter((item) =>item.href ==='/pos');
  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center">
              <Package className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-gray-900 text-sm">BarStock Pro</span>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {visibleItems.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors
                    ${active
                      ? 'bg-brand/10 text-brand'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              );
            })}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Alert bell */}
            <button type="button" className="relative p-2 rounded-md text-gray-500 hover:bg-gray-100 transition-colors">
              <Bell className="w-4 h-4" />
              {alertCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {alertCount > 9 ? '9+' : alertCount}
                </span>
              )}
            </button>

            {/* User menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-gray-700 hover:bg-gray-100 transition-colors"
              >
                  <div className="w-6 h-6 rounded-full bg-brand text-white text-xs flex items-center justify-center font-medium">
                    {currentUser?.name?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <span className="hidden sm:block">{currentUser?.name || 'User'}</span>
                <ChevronDown className="w-3 h-3" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <p className="text-xs font-medium text-gray-900">{currentUser?.name}</p>
                    <p className="text-xs text-gray-500">{currentUser?.role}</p>
                  </div>
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                    <LogOut className="w-3 h-3" />
                    Sign out
                  </button>
                </div>
              )}
            </div>

            {/* Mobile menu button */}
            <button
              type="button"
              className="md:hidden p-2 rounded-md text-gray-500 hover:bg-gray-100"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white px-4 py-3 space-y-1">
          {visibleItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors
                  ${active ? 'bg-brand/10 text-brand' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
