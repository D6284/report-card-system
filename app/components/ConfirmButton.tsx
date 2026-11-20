'use client';

import { type ReactNode } from 'react';

export default function ConfirmButton({ message, className, children, disabled }: {
  message: string; className?: string; children: ReactNode; disabled?: boolean;
}) {
  return (
    <button type="submit" className={className} disabled={disabled} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>
      {children}
    </button>
  );
}
