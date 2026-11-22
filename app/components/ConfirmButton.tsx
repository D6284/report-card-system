'use client';

import { useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export default function ConfirmButton({ message, className, children, disabled }: {
  message: string; className?: string; children: ReactNode; disabled?: boolean;
}) {
  const [pending, setPending] = useState(false);
  return (
    <button type="submit" className={className} disabled={disabled || pending} onClick={(e) => {
      if (window.confirm(message)) setPending(true);
      else e.preventDefault();
    }}>
      {pending ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /><span>Working…</span></> : children}
    </button>
  );
}
