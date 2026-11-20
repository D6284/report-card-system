'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';

type Props = {
  href: string;
  label: string;
  icon?: LucideIcon;
  variant?: 'sidebar' | 'topbar';
  exact?: boolean;
};

export default function NavLink({ href, label, icon: Icon, variant = 'sidebar', exact = false }: Props) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const base = variant === 'topbar' ? 'topbar-link' : 'nav-link';
  const activeClass = variant === 'topbar' ? 'topbar-link-active' : 'nav-link-active';

  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={`${base} ${active ? activeClass : ''}`}>
      {Icon && <Icon className={variant === 'topbar' ? 'h-4 w-4 shrink-0' : 'nav-link-icon'} aria-hidden="true" />}
      <span className="truncate">{label}</span>
    </Link>
  );
}
