'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function PasswordInput({ name, label, autoComplete = 'current-password', minLength, placeholder = '••••••••' }: {
  name: string; label: string; autoComplete?: string; minLength?: number; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <div className="relative">
        <input id={name} name={name} type={show ? 'text' : 'password'} required minLength={minLength}
          autoComplete={autoComplete} placeholder={placeholder} className="input pr-11" />
        <button type="button" onClick={() => setShow((v) => !v)}
          className="icon-button absolute right-1.5 top-1/2 !h-8 !w-8 -translate-y-1/2"
          aria-label={show ? 'Hide password' : 'Show password'}>
          {show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
