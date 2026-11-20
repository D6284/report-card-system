import { GraduationCap } from 'lucide-react';

export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className={compact ? 'sidebar-brand-mark !h-9 !w-9' : 'sidebar-brand-mark'}>
        <GraduationCap className={compact ? 'h-[18px] w-[18px]' : 'h-5 w-5'} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="sidebar-brand-name truncate">School Report</span>
        <span className="sidebar-brand-sub">Management System</span>
      </span>
    </div>
  );
}
