import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { useId, useState } from 'react';

/**
 * Foundation bileşenleri.
 *
 * Kasıtlı olarak küçük: bir tasarım sistemi değil, ekranların ortak
 * dili. Stiller global.css'te token'lar üzerinden tanımlıdır.
 */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
};

export function Button({ variant = 'primary', loading = false, children, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={`ft-button ft-button--${variant}${rest.className ? ` ${rest.className}` : ''}`}
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
  const generatedId = useId();
  const inputId = id ?? generatedId;
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

/**
 * Parola alanı — göster/gizle düğmesiyle.
 *
 * Düğme kendi metnini erişilebilir ad olarak taşır; ekran okuyucu
 * kullanıcısı da durumu bilir.
 */
export function PasswordInput({ label, error, id, ...rest }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const [visible, setVisible] = useState(false);

  return (
    <div className="ft-field">
      <label className="ft-field__label" htmlFor={inputId}>
        {label}
      </label>

      <div className="ft-input-group">
        <input
          {...rest}
          id={inputId}
          type={visible ? 'text' : 'password'}
          className="ft-input"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <button
          type="button"
          className="ft-input-group__action"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Parolayı gizle' : 'Parolayı göster'}
        >
          {visible ? 'Gizle' : 'Göster'}
        </button>
      </div>

      {error && (
        <span className="ft-field__error" id={errorId}>
          {error}
        </span>
      )}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`ft-card${className ? ` ${className}` : ''}`}>{children}</div>;
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

/** Veri beklenirken yer tutucu — gereksiz animasyon içermez. */
export function Skeleton({ width = '100%' }: { width?: string }) {
  return <span className="ft-skeleton" style={{ width }} aria-hidden="true" />;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' }) {
  return <span className={`ft-badge ft-badge--${tone}`}>{children}</span>;
}
