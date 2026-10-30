'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Package, ShoppingCart, BarChart3,
  Users, LogOut, Bell, Menu, X, ChevronDown,
  CreditCard,Receipt,
  UsersRound as Users2,
  MapPin,
  Wallet,
  BookOpen,
  BookText,
  Settings,
  Plus,
  Tags,
  Ruler,
  Badge,
  FileText, TrendingUp, Gift, Award, PanelLeftClose, PanelLeftOpen, Truck, Store
} from 'lucide-react';
import {Moon,Sun} from 'lucide-react';
import Cookies from 'js-cookie';
import {useAccess} from './AccessBoundary';
import ThemePicker from './ThemePicker';
import HelpAssistant from './HelpAssistant';
import {useTheme} from './ThemeProvider';
import {canVisit} from '../lib/access';
import { authApi, treasuryApi, accountsApi } from '../lib/api';
import { toast } from 'sonner';

const audioRef = { current: null as HTMLAudioElement | null };
function playPop() {
  try {
    if (typeof window === 'undefined') return;
    if (!audioRef.current) audioRef.current = new Audio('/pop.mp3');
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});
  } catch {}
}

const NAV_ITEMS = [
  {href:'/superadmin',label:'Superadmin',icon:Settings,adminOnly:false},
  {label:'Administration',icon:Settings,adminOnly:true,subItems:[{href:'/users',label:'Members',icon:Users},{href:'/roles',label:'Roles',icon:Users},{href:'/business/settings',label:'Business settings',icon:Settings},{href:'/locations',label:'Locations',icon:MapPin},{href:'/customers',label:'Customers',icon:Users2},{href:'/suppliers',label:'Suppliers',icon:ShoppingCart},{href:'/loyalty',label:'Loyalty Overview',icon:Award},{href:'/loyalty/rewards',label:'Loyalty Rewards',icon:Gift},{href:'/loyalty/history',label:'Loyalty History',icon:Receipt},{href:'/network',label:'StockPro Network',icon:Users2},{href:'/network/invite',label:'Invite to Network',icon:Users2},{href:'/subscription',label:'Packages',icon:CreditCard},{href:'/subscription/status',label:'Subscription Status',icon:CreditCard},{href:'/subscription/overview',label:'Subscription Overview',icon:CreditCard},{href:'/subscription/manage',label:'Subscription Requests',icon:CreditCard,adminOnly:true}]},
  { href: '/',          label: 'Dashboard',  icon: LayoutDashboard, adminOnly: false },
  {href:'/pos',               label:'POS',   icon:CreditCard,                       adminOnly:false},
  {href:'/fleet',label:'Fleet Management',icon:Truck,adminOnly:false},
  {href:'/supermarket',label:'Supermarket',icon:ShoppingCart,adminOnly:false},
  {href:'/marketplace',label:'Marketplace',icon:Store,adminOnly:false},
  { label: 'Inventory', icon: Package, adminOnly: false, subItems: [
    { href: '/inventory', label: 'Inventory Management', icon: Package },
    {href:'/stock-transfers',label:'Stock transfers',icon:Package},
    {href:'/stock-adjustments',label:'Stock adjustments',icon:Package},
    { href: '/setup/units', label: 'Units', icon: Ruler, adminOnly: true },
    { href: '/setup/categories', label: 'Categories', icon: Tags, adminOnly: true },
    { href: '/setup/brands', label: 'Brands', icon: Badge, adminOnly: true },
  ] },
  {href:'/expenses',label:'Expenses',icon:Receipt,adminOnly:false},
  { href: '/purchases', label: 'Purchases', icon: ShoppingCart, adminOnly: true },
  {
    label: 'Sales A/R',
    icon: Receipt,
    adminOnly: false,
    subItems: [
      { href: '/sales-ar/quotation', label: 'Quotations', icon: FileText },
      { href: '/sales-ar/sales_order', label: 'Sales Orders', icon: ShoppingCart },
      { href: '/sales-ar/proforma', label: 'Proformas', icon: Receipt },
      { href: '/sales-ar/invoice', label: 'Invoices', icon: Receipt },
      { href: '/sales-ar/credit_note', label: 'Credit Notes', icon: BookText },
      { href: '/discounts', label: 'Discounts', icon: Tags },
    ]
  },
  { label: 'Reports', icon: BarChart3, adminOnly: false, subItems: [
    { href: '/reports', label: 'Reports', icon: BarChart3 },
    { href: '/insights', label: 'Business Insights', icon: TrendingUp },
    { href: '/insights/actions', label: 'Insight Actions', icon: TrendingUp },
    { href: '/notifications', label: 'Notifications', icon: Bell },
    { href: '/staff-performance', label: 'Staff Performance', icon: TrendingUp, adminOnly: true },
    { href: '/users', label: 'User Management', icon: Users, adminOnly: true },
  ] },
  { label:'Sales', icon:Receipt, adminOnly:false, subItems:[
    {href:'/sales',label:'Sales History',icon:Receipt},
    {href:'/payments',label:'M-Pesa Payments',icon:CreditCard,adminOnly:true},
  ]},
  { href: '/account/account',  label: 'Treasury',   icon: Wallet, adminOnly: true  },
  {
    label: 'Accounting',
    icon: BookOpen,
    adminOnly: true,
    subItems: [
      { href: '/accounting/dashboard', label: 'Overview', icon: BookOpen },
      { href: '/accounts',  label: 'Chart of Accounts',  icon: BookOpen },
      { href: '/accounts/ledger',  label: 'Ledger',  icon: BookText },
      { href: '/accounting/journal-entry', label: 'Journal entries', icon: Plus },
      { href: '/accounts/settings',  label: 'Settings',  icon: Settings },
    ]
  },
];

interface NavbarProps {
  user?: { name: string; role: string; email: string } | null;
  alertCount?: number;
  compactForPOS?: boolean;
  hideHelpAssistant?: boolean;
}

/**
 * Left navigation sidebar component. Shows navigation links, alerts and user menu.
 */
export default function Navbar({ user = null, alertCount = 0, compactForPOS = false, hideHelpAssistant = false }: NavbarProps) {
  const pathname = usePathname().replace(/\/$/,'')||'/';
  const {access,user:workspaceUser}=useAccess();
  const {darkMode,toggleDarkMode}=useTheme();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpenMenu, setMobileOpenMenu] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedMenuTop, setCollapsedMenuTop] = useState(0);

  const [currentUser, setCurrentUser] = useState(user ?? workspaceUser ?? null);
  const [treasuryConfigured, setTreasuryConfigured] = useState(false);
  const [accountsConfigured, setAccountsConfigured] = useState(false);

  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    const activeGroup = NAV_ITEMS.find((item: any) => item.subItems?.some((sub: any) => pathname === sub.href));
    if (activeGroup) setOpenMenu(activeGroup.label);
  }, [pathname]);

  useEffect(()=>{if(!compactForPOS)return;const fit=()=>setCollapsed(window.innerWidth<1024);fit();window.addEventListener('resize',fit);return()=>window.removeEventListener('resize',fit);},[compactForPOS]);

  useEffect(() => {
    if (canVisit(access,'/treasury')) treasuryApi.getAll().then((res) => setTreasuryConfigured(Array.isArray(res.data) && res.data.length > 0)).catch(() => setTreasuryConfigured(false));
    if (canVisit(access,'/accounts')) accountsApi.getAll().then((res) => setAccountsConfigured(Array.isArray(res.data) && res.data.length > 0)).catch(() => setAccountsConfigured(false));
  }, [isAdmin,access]);

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
    sessionStorage.removeItem('stockpro_superadmin_token');
    router.push('/login');
    toast.success('Logged out successfully');
  }

  const visibleItems = NAV_ITEMS.map(item=>item.subItems?{...item,subItems:item.subItems.filter(sub=>canVisit(access,sub.href))}:item).filter(item=>item.subItems?item.subItems.length>0:canVisit(access,item.href||''));
  return (
    <>
    <nav className={`app-sidebar bg-white border-b border-gray-200 sticky top-0 z-50 md:fixed md:left-0 md:h-screen md:border-r md:overflow-y-auto   ${collapsed ? 'md:w-16' : 'md:w-60'}`}>
      <div className={`mx-auto md:py-5 ${collapsed ? 'px-1' : 'px-4'}`}>
        <div className="flex items-center justify-between h-14 md:h-auto md:flex-col md:items-stretch md:gap-6">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-sm bg-brand flex items-center justify-center shrink-0">
              <span className="text-white text-sm font-semibold">
                {currentUser?.business?.name?.[0]?.toUpperCase() || 'S'}
              </span>
            </div>
            {!collapsed && (
              <span className="font-semibold text-gray-900 text-sm truncate max-w-[120px]">
                {currentUser?.business?.name || 'StockPro'}
              </span>
            )}
          </Link>

          <button
            type="button"
            onClick={() => setCollapsed(value => !value)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="sidebar-collapse-toggle hidden md:inline-flex self-end items-center justify-center w-9 h-9 rounded-sm border border-gray-300 bg-white text-gray-600 shadow-sm transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            {collapsed ? <PanelLeftOpen aria-hidden="true" className="w-5 h-5" /> : <PanelLeftClose aria-hidden="true" className="w-5 h-5" />}
          </button>

          {/* Desktop nav */}
          <div className="hidden md:flex md:flex-col md:items-stretch gap-1">
            {visibleItems.map((item) => {
              if (item.subItems) {
                const isActive = item.subItems.some(sub => pathname === sub.href);
                return (
                  <div key={item.label} className="relative">
                    <button
                      type="button"
                      onClick={(event) => { setOpenMenu(openMenu === item.label ? null : item.label); if(collapsed){const top=event.currentTarget.getBoundingClientRect().top;setCollapsedMenuTop(Math.min(top,window.innerHeight-240));} playPop(); }}
                      title={collapsed ? item.label : undefined}
                      aria-label={collapsed ? item.label : undefined}
                      className={`flex items-center rounded-sm text-sm font-medium transition-colors ${collapsed ? 'h-10 justify-center px-0' : 'gap-2 px-3 py-2'}
                        ${isActive
                          ? 'bg-brand/10 text-brand'
                          : 'text-gray-600 hover:bg-brand/10 hover:text-brand'
                        }`}
                    >
                      <item.icon className={collapsed ? 'w-5 h-5 shrink-0' : 'w-4 h-4 shrink-0'} />
                      {!collapsed && item.label}
                      {!collapsed && <ChevronDown className="w-3 h-3" />}
                    </button>

                    {openMenu === item.label && (
                      <div style={collapsed ? {position:'fixed',left:'4rem',top:collapsedMenuTop,width:'14rem'} : undefined} className={`bg-white border border-gray-200 rounded-sm py-1 z-50 ${collapsed ? 'shadow-lg' : 'mt-1 ml-3'}`}>
                        {item.subItems.filter((sub: any) => canVisit(access,sub.href)).map((sub) => (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            onClick={() => { setOpenMenu(null); playPop(); }}
                            className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors
                              ${pathname === sub.href
                                ? 'bg-brand/10 text-brand'
                                : 'text-gray-600 hover:bg-brand/10 hover:text-brand'
                              }`}
                          >
                            <sub.icon className="w-4 h-4" />
                            {!collapsed && sub.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={playPop}
                  title={collapsed ? item.label : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  className={`flex items-center rounded-sm text-sm font-medium transition-colors ${collapsed ? 'h-10 justify-center px-0' : 'gap-2 px-3 py-2'}
                    ${active
                      ? 'bg-brand/10 text-brand'
                      : 'text-gray-600 hover:bg-brand/10 hover:text-brand'
                    }`}
                >
                  <item.icon className={collapsed ? 'w-5 h-5 shrink-0' : 'w-4 h-4 shrink-0'} />
                  {!collapsed && item.label}
                </Link>
              );
            })}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2 md:w-full md:flex-col">
            <button type="button" onClick={toggleDarkMode} title={darkMode?'Switch to light mode':'Switch to dark mode'} aria-label={darkMode?'Switch to light mode':'Switch to dark mode'} aria-pressed={darkMode} className={`flex h-10 items-center rounded-sm text-gray-600 hover:bg-gray-100 ${collapsed?'justify-center px-0':'gap-2 px-2'}`}>
              {darkMode?<Sun className="h-5 w-5"/>:<Moon className="h-5 w-5"/>}
              {!collapsed&&<span>{darkMode?'Light mode':'Dark mode'}</span>}
            </button>
            {/* Alert bell */}
            <button type="button" onClick={() => router.push('/insights')} title="Open business alerts" aria-label="Open business alerts" className={`relative flex h-10 items-center rounded-sm text-gray-500 hover:bg-gray-100 ${collapsed ? 'justify-center px-0' : 'gap-2 px-2'}`}>
              <Bell className="w-5 h-5" />
              {!collapsed && <span>Alerts</span>}
              {alertCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-sm flex items-center justify-center">
                  {alertCount > 9 ? '9+' : alertCount}
                </span>
              )}
            </button>

            {/* User menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => { setUserMenuOpen(!userMenuOpen); playPop(); }}
                className={`flex items-center rounded-sm text-sm text-gray-700 hover:bg-brand/10 hover:text-brand transition-colors ${collapsed ? 'h-10 justify-center px-0' : 'gap-2 px-3 py-1.5'}`}
              >
                  <div className="w-6 h-6 rounded-sm bg-brand text-white text-xs flex items-center justify-center font-medium">
                    {currentUser?.name?.[0]?.toUpperCase() || 'U'}
                  </div>
                  {!collapsed && <span className="hidden sm:block">{currentUser?.name || 'User'}</span>}
                {!collapsed && <ChevronDown className="w-3 h-3" />}
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-sm  py-1 z-50">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <p className="text-xs font-medium text-gray-900">{currentUser?.name}</p>
                    <p className="text-xs text-gray-500">{currentUser?.role}</p>
                  </div>
                        <button
                          type="button"
                          onClick={handleLogout}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 "
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
              className="md:hidden p-2 rounded-sm text-gray-500 hover:bg-gray-100"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-x-0 top-14 bottom-16 z-[60] overflow-y-auto border-t border-gray-200 bg-white px-4 py-3 pb-6 shadow-lg space-y-1">
          {visibleItems.map((item) => {
            if (item.subItems) {
              const isActive = item.subItems.some(sub => pathname === sub.href);
              return (
                <div key={item.label} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => { setMobileOpenMenu(mobileOpenMenu === item.label ? null : item.label); playPop(); }}
                    className={`flex items-center justify-between w-full px-3 py-2.5 rounded-sm text-sm font-medium transition-colors
                      ${isActive ? 'bg-brand/10 text-brand' : 'text-gray-700 hover:bg-brand/10 hover:text-brand'}`}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className="w-4 h-4" />
                      {item.label}
                    </div>
                    <ChevronDown className={`w-3 h-3  ${mobileOpenMenu === item.label ? 'rotate-180' : ''}`} />
                  </button>
                  {mobileOpenMenu === item.label && (
                    <div className="pl-9 space-y-1">
                      {item.subItems.filter((sub: any) => canVisit(access,sub.href)).map((sub) => (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          onClick={() => { setMobileOpen(false); playPop(); }}
                          className={`flex items-center gap-3 px-3 py-2 rounded-sm text-sm font-medium transition-colors
                            ${pathname === sub.href ? 'bg-brand/10 text-brand' : 'text-gray-600 hover:bg-brand/10 hover:text-brand'}`}
                        >
                          <sub.icon className="w-4 h-4" />
                          {sub.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => { setMobileOpen(false); playPop(); }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-medium transition-colors
                  ${active ? 'bg-brand/10 text-brand' : 'text-gray-700 hover:bg-brand/10 hover:text-brand'}`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
      <div className="mobile-bottom-nav md:hidden fixed inset-x-0 bottom-0 z-[55] grid grid-cols-4 border-t border-gray-300 bg-white shadow-[0_-4px_12px_rgba(0,0,0,.08)]">
        {[
          { href: '/', label: 'Home', icon: LayoutDashboard },
          { href: '/pos', label: 'POS', icon: CreditCard },
          { href: '/inventory', label: 'Stock', icon: Package },
        ].filter(item => canVisit(access, item.href)).map(item => {
          const active = pathname === item.href;
          return <Link key={item.href} href={item.href} onClick={() => { setMobileOpen(false); playPop(); }} aria-current={active ? 'page' : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium ${active ? 'text-brand' : 'text-gray-600'}`}><item.icon className="h-5 w-5" />{item.label}</Link>;
        })}
        <button type="button" onClick={() => setMobileOpen(value => !value)} aria-expanded={mobileOpen} className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium ${mobileOpen ? 'text-brand' : 'text-gray-600'}`}><Menu className="h-5 w-5" />More</button>
      </div>
    </nav>
    {!hideHelpAssistant&&<HelpAssistant/>}
    </>
  );
}
