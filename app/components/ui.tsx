import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle, AlertTriangle, ArrowLeft, CheckCircle2, Info, Loader2,
} from 'lucide-react';

export function PageHeading({ eyebrow, title, subtitle, actions }: {
  eyebrow?: string; title: string; subtitle?: string; actions?: React.ReactNode;
}) {
  return (
    <div className="page-header animate-in">
      <div>
        {eyebrow && <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-600">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="toolbar">{actions}</div>}
    </div>
  );
}

const alertStyles = {
  info: { cls: 'alert-info', Icon: Info },
  success: { cls: 'alert-success', Icon: CheckCircle2 },
  warning: { cls: 'alert-warning', Icon: AlertTriangle },
  error: { cls: 'alert-error', Icon: AlertCircle },
};

export function Alert({ tone = 'info', title, children, role }: {
  tone?: keyof typeof alertStyles; title?: string; children: React.ReactNode; role?: 'alert' | 'status';
}) {
  const { cls, Icon } = alertStyles[tone];
  return (
    <div className={`alert ${cls} animate-in`} role={role ?? (tone === 'error' ? 'alert' : 'status')}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div><div className="font-semibold">{title ?? children}</div>{title && <div className="mt-0.5 font-normal opacity-90">{children}</div>}</div>
    </div>
  );
}

export function EmptyState({ icon: Icon = Info, title, description, action }: {
  icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon"><Icon className="h-5 w-5" aria-hidden="true" /></span>
      <p className="empty-state-title">{title}</p>
      {description && <p className="empty-state-text">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SectionCard({ title, subtitle, actions, children, className = '' }: {
  title?: React.ReactNode; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`card animate-in ${className}`}>
      {(title || actions) && (
        <div className="card-header">
          <div>
            {title && <h2 className="card-title flex items-center gap-2">{title}</h2>}
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="toolbar">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

const statTones = {
  brand: 'stat-icon-brand', success: 'stat-icon-success', warning: 'stat-icon-warning',
  danger: 'stat-icon-danger', info: 'stat-icon-info',
};

export function StatCard({ label, value, note, icon: Icon, tone = 'brand', href }: {
  label: string; value: React.ReactNode; note?: string; icon?: LucideIcon;
  tone?: keyof typeof statTones; href?: string;
}) {
  const inner = (
    <>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {note && <p className="stat-note">{note}</p>}
      {Icon && <span className={`stat-icon ${statTones[tone]}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>}
    </>
  );
  return href
    ? <Link href={href} className="stat-card animate-in">{inner}</Link>
    : <div className="stat-card animate-in">{inner}</div>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    submitted: 'badge-warning', pending: 'badge-warning', draft: 'badge-neutral',
    approved: 'badge-success', passed: 'badge-success', complete: 'badge-success', active: 'badge-success',
    rejected: 'badge-danger', failed: 'badge-danger', inactive: 'badge-danger',
    reopened: 'badge-info', conditional: 'badge-info', under_review: 'badge-info',
  };
  return <span className={`badge ${map[status] ?? 'badge-neutral'}`}>{status.replaceAll('_', ' ')}</span>;
}

export function Avatar({ name, size = 'sm' }: { name?: string | null; size?: 'sm' | 'lg' }) {
  const parts = (name ?? '?').trim().split(/\s+/).filter(Boolean);
  const initials = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : (name ?? '?').slice(0, 2);
  return <span className={`${size === 'lg' ? 'avatar-lg' : ''} avatar`} aria-hidden="true">{initials.toUpperCase()}</span>;
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-indigo-600">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> {label}
    </Link>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`h-4 w-4 animate-spin ${className}`} aria-hidden="true" />;
}
