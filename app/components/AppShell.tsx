'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  Activity, BadgeCheck, BarChart3, BookOpen, Building2, CalendarDays, ChevronRight,
  ClipboardCheck, ClipboardList, FileText, GraduationCap, KeyRound, LayoutDashboard,
  LogOut, Menu, School, Send, Settings, ShieldCheck, Users,
} from 'lucide-react';
import Brand from './Brand';

const icons: Record<string, LucideIcon> = {
  Activity, BadgeCheck, BarChart3, BookOpen, Building2, CalendarDays, ClipboardCheck,
  ClipboardList, FileText, GraduationCap, LayoutDashboard, School, Send, Settings,
  ShieldCheck, Users,
};

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  section?: string;
  exact?: boolean;
};

type Props = {
  nav: NavItem[];
  roleLabel: string;
  workspaceLabel: string;
  userName?: string | null;
  userEmail?: string | null;
  children: ReactNode;
};

function initialsOf(name?: string | null, email?: string | null, fallback = 'SR') {
  const source = (name || email || fallback).trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : source.slice(0, 2)).toUpperCase();
}

export default function AppShell({ nav, roleLabel, workspaceLabel, userName, userEmail, children }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = nav.find((item) => item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const sections = [...new Set(nav.map((item) => item.section ?? workspaceLabel))];
  const displayName = userName || userEmail?.split('@')[0] || roleLabel;
  const initials = initialsOf(userName, userEmail, roleLabel.slice(0, 2));

  const renderLinks = (items: NavItem[]) => items.map((item) => {
    const Icon = icons[item.icon] ?? LayoutDashboard;
    const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
    return (
      <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
        className={`nav-link ${active ? 'nav-link-active' : ''}`} onClick={() => setOpen(false)}>
        <Icon className="nav-link-icon" aria-hidden="true" />
        <span className="truncate">{item.label}</span>
        {active && <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-60" aria-hidden="true" />}
      </Link>
    );
  });

  const sidebarContent = (
    <>
      <div className="sidebar-brand"><Brand /></div>
      <div className="nav">
        {sections.map((section) => (
          <div key={section}>
            <div className="sidebar-section">{section}</div>
            {renderLinks(nav.filter((item) => (item.section ?? workspaceLabel) === section))}
          </div>
        ))}
      </div>
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <span className="avatar">{initials}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-white">{displayName}</span>
            <span className="mt-0.5 block truncate text-[11px] text-slate-400">{roleLabel}</span>
          </span>
        </div>
        <div className="mt-2 flex gap-2">
          <Link href="/change-password" className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-semibold text-slate-400 transition hover:bg-white/[0.07] hover:text-white">
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" /> Password
          </Link>
          <a href="/api/auth/logout" className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-semibold text-red-300/80 transition hover:bg-red-500/10 hover:text-red-200">
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Sign out
          </a>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen">
      <aside className="sidebar">{sidebarContent}</aside>

      {open && (
        <>
          <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setOpen(false)} />
          <aside className="mobile-drawer" role="dialog" aria-modal="true" aria-label="Navigation">
            {sidebarContent}
          </aside>
        </>
      )}

      <div className="desktop-body">
        <header className="app-topbar">
          <div className="flex min-w-0 items-center gap-3">
            <button className="icon-button lg:hidden" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}>
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="flex items-center gap-2 lg:hidden">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white"><GraduationCap className="h-4 w-4" aria-hidden="true" /></span>
              <span className="text-sm font-extrabold text-slate-900">School Report</span>
            </span>
            <span className="hidden min-w-0 lg:block">
              <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{workspaceLabel}</span>
              <span className="block truncate text-sm font-bold text-slate-800">{current?.label ?? roleLabel}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-lg bg-indigo-50 px-2.5 py-1.5 text-[11px] font-bold text-indigo-700 sm:inline-flex">{roleLabel}</span>
            <Link href="/change-password" className="topbar-link hidden sm:inline-flex" aria-label="Change password">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
            </Link>
            <a href="/api/auth/logout" className="topbar-link hidden sm:inline-flex" aria-label="Sign out">
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </a>
            <span className="avatar" title={displayName} aria-label={displayName}>{initials}</span>
          </div>
        </header>
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
