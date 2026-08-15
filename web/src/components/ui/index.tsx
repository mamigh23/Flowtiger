import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

/**
 * Foundation bileşenleri.
 *
 * Kasıtlı olarak küçük: bir tasarım sistemi değil, ekranların ortak
 * dili. Stiller global.css'te token'lar üzerinden tanımlıdır; buradaki
 * bileşenler yalnızca doğru sınıfı ve erişilebilirlik özniteliklerini
 * yerine koyar.
 */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
  loading?: boolean;
};

export function Button({ variant = 'primary', loading = false, children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={`ft-button${variant === 'secondary' ? ' ft-button--secondary' : ''}`}
      disabled={rest.disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export function Input({ label, error, id, ...rest }: InputProps) {
  const inputId = id ?? `ft-${rest.name ?? label}`;
  const errorId = `${inputId}-error`;

  return (
    <div className="ft-field">
      <label className="ft-field__label" htmlFor={inputId}>
        {label}
      </label>
      <input
        {...rest}
        id={inputId}
        className="ft-input"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <span className="ft-field__error" id={errorId}>
          {error}
        </span>
      )}
    </div>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="ft-card">{children}</div>;
}

export function Spinner() {
  return <span className="ft-spinner" role="status" aria-label="Yükleniyor" />;
}

export function ErrorState({ message }: { message: string }) {
  return (
    <p className="ft-error" role="alert">
      {message}
    </p>
  );
}

export function LoadingScreen() {
  return (
    <div className="ft-centered">
      <Spinner />
    </div>
  );
}
