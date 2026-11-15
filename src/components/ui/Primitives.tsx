import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'lavender' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  const variantClasses = {
    primary:
      'bg-[#10373A] text-white hover:bg-[#194E52] active:bg-[#0C2B2E] border border-transparent shadow-[0_1px_2px_rgba(16,55,58,0.12)]',
    secondary:
      'bg-[#EBF6F1] text-[#10373A] hover:bg-[#D8EDE3] active:bg-[#CBE4D8] border border-[#C6E3D5]',
    lavender:
      'bg-[#F2EEFA] text-[#4A397C] hover:bg-[#E5DDF6] active:bg-[#DAD0F2] border border-[#D2C5EE]',
    ghost:
      'bg-transparent text-[#10373A] hover:bg-[#EBF6F1]/75 active:bg-[#E2F1EA] border border-transparent',
    danger:
      'bg-[#FEF2F2] text-[#991B1B] hover:bg-[#FEE2E2] active:bg-[#FECACA] border border-[#FECACA]',
  };

  const sizeClasses = {
    sm: 'min-h-[44px] sm:min-h-[40px] px-3.5 py-2 text-sm',
    md: 'min-h-[46px] sm:min-h-[44px] px-5 py-2.5 text-base',
    lg: 'min-h-[52px] px-6 py-3 text-base font-semibold',
  };

  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.99] whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'white' | 'mint' | 'lavender' | 'warm';
}

export function Card({
  tone = 'white',
  className,
  children,
  ...props
}: CardProps) {
  const tones = {
    white: 'bg-white border border-[#DCE5E2]',
    mint: 'bg-[#F1F8F5] border border-[#CBE4D8]',
    lavender: 'bg-[#F5F2FB] border border-[#DDD4F2]',
    warm: 'bg-[#FAF9F6] border border-[#E2E6E4]',
  };

  return (
    <div
      className={cn(
        'rounded-2xl shadow-[0_2px_10px_rgba(16,55,58,0.04)]',
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
}

export function Input({
  label,
  error,
  helperText,
  id,
  className,
  ...props
}: InputProps) {
  const inputId = id || `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className="text-sm font-semibold text-[#10373A]"
      >
        {label}
      </label>
      <input
        id={inputId}
        className={cn(
          'min-h-[48px] w-full rounded-xl border bg-white px-4 py-2.5 text-base text-[#10373A] placeholder:text-[#6B8A8D] transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[#5D4A96]/25',
          error
            ? 'border-[#B42318] focus:border-[#B42318]'
            : 'border-[#C9D8D4] focus:border-[#10373A]',
          className,
        )}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${inputId}-error` : undefined}
        {...props}
      />
      {error ? (
        <p id={`${inputId}-error`} className="text-sm font-medium text-[#B42318]">
          {error}
        </p>
      ) : helperText ? (
        <p className="text-xs text-[#4B7478]">{helperText}</p>
      ) : null}
    </div>
  );
}

interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  helperText?: string;
}

export function Textarea({
  label,
  error,
  helperText,
  id,
  className,
  ...props
}: TextareaProps) {
  const inputId = id || `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className="text-sm font-semibold text-[#10373A]"
      >
        {label}
      </label>
      <textarea
        id={inputId}
        className={cn(
          'min-h-[100px] w-full rounded-xl border bg-white px-4 py-3 text-base text-[#10373A] placeholder:text-[#6B8A8D] transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[#5D4A96]/25',
          error
            ? 'border-[#B42318] focus:border-[#B42318]'
            : 'border-[#C9D8D4] focus:border-[#10373A]',
          className,
        )}
        aria-invalid={Boolean(error)}
        {...props}
      />
      {error ? (
        <p className="text-sm font-medium text-[#B42318]">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-[#4B7478]">{helperText}</p>
      ) : null}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: { value: string; label: string }[];
  error?: string;
  helperText?: string;
}

export function Select({
  label,
  options,
  error,
  helperText,
  id,
  className,
  ...props
}: SelectProps) {
  const selectId = id || `select-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={selectId}
        className="text-sm font-semibold text-[#10373A]"
      >
        {label}
      </label>
      <select
        id={selectId}
        className={cn(
          'min-h-[48px] w-full rounded-xl border bg-white px-4 py-2.5 text-base text-[#10373A] transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[#5D4A96]/25',
          error
            ? 'border-[#B42318] focus:border-[#B42318]'
            : 'border-[#C9D8D4] focus:border-[#10373A]',
          className,
        )}
        aria-invalid={Boolean(error)}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error ? (
        <p className="text-sm font-medium text-[#B42318]">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-[#4B7478]">{helperText}</p>
      ) : null}
    </div>
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}

export function Switch({ checked, onChange, label, description }: SwitchProps) {
  const id = `switch-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-base font-medium text-[#10373A] cursor-pointer">
          {label}
        </label>
        {description && (
          <p className="text-sm text-[#4B7478] mt-0.5">{description}</p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-150',
          checked ? 'bg-[#1A7A68]' : 'bg-[#CBD8D4]',
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-150',
            checked ? 'translate-x-6' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded-xl bg-[#E4ECE9]', className)}
      aria-hidden="true"
    />
  );
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-[#C6D8D3] bg-[#F7FAF8] px-6 py-12">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#E2F1EA] text-[#10373A]">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-[#10373A]">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-[#4B7478]">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} variant="secondary" className="mt-5">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export function ErrorBanner({
  title = 'Unable to complete action',
  message,
  onRetry,
  onDismiss,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#F5C2C0] bg-[#FEF3F2] px-4 py-3 text-[#7A1D16]"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm mt-0.5">{message}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onRetry && (
          <Button size="sm" variant="danger" onClick={onRetry}>
            Try Again
          </Button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss error message"
            className="rounded-lg p-2 hover:bg-[#FEE2E2] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0C2B2E]/45 p-4 backdrop-blur-[2px] transition-opacity duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#DCE5E2] bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#EBF0EE] pb-4">
          <div>
            <h2 id="modal-title" className="text-xl font-bold text-[#10373A]">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-sm text-[#4B7478]">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#4B7478] hover:bg-[#F1F8F5] hover:text-[#10373A] transition-colors duration-150 cursor-pointer shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
