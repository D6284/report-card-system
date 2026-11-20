import type { ReactNode } from 'react';
import { BarChart3, ClipboardCheck, FileText, GraduationCap, ShieldCheck } from 'lucide-react';
import Brand from './Brand';

const features = [
  { icon: ClipboardCheck, title: 'Streamlined mark entry', text: 'Capture, validate and submit marks in one focused workflow.' },
  { icon: ShieldCheck, title: 'Controlled approvals', text: 'Every submission is reviewed and recorded with a full audit trail.' },
  { icon: FileText, title: 'Print-ready report cards', text: 'Generate branded A4 reports from approved academic results.' },
];

export default function AuthShell({ title, description, children, footer }: {
  title: string; description?: string; children: ReactNode; footer?: ReactNode;
}) {
  return (
    <main className="auth-shell lg:grid-cols-2">
      <aside className="auth-aside">
        <div className="auth-aside-grid" aria-hidden="true" />
        <div className="relative">
          <Brand />
          <div className="mt-16 max-w-md xl:mt-20">
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-400/25 bg-indigo-500/10 px-3 py-1.5 text-[11px] font-semibold text-indigo-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Academic operations, simplified
            </span>
            <h2 className="mt-6 text-[34px] font-extrabold leading-[1.15] tracking-tight text-white xl:text-[42px]">
              Every report,<br />ready on time.
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">
              A single workspace for teachers and administrators to manage marks, approvals and official report cards.
            </p>
          </div>
        </div>
        <div className="relative grid max-w-lg gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          {features.map(({ icon: Icon, title: label, text }) => (
            <div className="auth-feature" key={label}>
              <span className="auth-feature-icon"><Icon className="h-4 w-4" aria-hidden="true" /></span>
              <div>
                <p className="text-xs font-bold text-white">{label}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{text}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="relative flex items-center gap-2 text-[11px] text-slate-500">
          <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
          Built for modern schools and academic teams.
        </p>
      </aside>

      <section className="auth-main">
        <div className="auth-card animate-in">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-200">
              <GraduationCap className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-extrabold text-slate-900">School Report</span>
              <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Management System</span>
            </span>
          </div>
          <div className="mb-6">
            <span className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600 lg:hidden">
              <BarChart3 className="h-5 w-5" aria-hidden="true" />
            </span>
            <h1 className="text-[22px] font-extrabold tracking-tight text-slate-900">{title}</h1>
            {description && <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>}
          </div>
          {children}
          {footer && <div className="mt-6 border-t border-slate-100 pt-5 text-center text-sm">{footer}</div>}
        </div>
      </section>
    </main>
  );
}
