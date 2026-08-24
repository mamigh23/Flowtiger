import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
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
      {/*
        Düğme içindeki gösterge aria-hidden'dır ve bilinçli olarak
        <Spinner /> DEĞİLDİR.

        Spinner role="status" + aria-label="Yükleniyor" taşır; bir
        düğmenin İÇİNDE bu etiket, düğmenin erişilebilir adına karışır
        ve ad yükleme sırasında "Yükleniyor Kaydet"e dönüşür. Sonuç: hem
        ekran okuyucu kullanıcısı düğmenin ne yaptığını kaybeder, hem de
        düğme adıyla yapılan her sorgu yükleme anında eşleşmez.
        Meşguliyet bilgisi zaten aria-busy ile veriliyor.
      */}
      {loading && <span className="ft-spinner" aria-hidden="true" />}
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

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
};

/**
 * Seçim alanı — Input ile AYNI iskelet.
 *
 * Ayrı bir yapı kurulmadı: etiket/hata/aria bağlantısı her alanda aynı
 * şekilde çalışmalı, yoksa bir alanda unutulan `aria-describedby` fark
 * edilmeden kalır.
 *
 * Seçenekler children olarak verilir. Bileşen bir seçenek listesi
 * ÜRETMEZ — hangi seçeneklerin olduğu ekranın bilgisidir, ortak dilin
 * değil.
 */
export function Select({ label, error, id, children, ...rest }: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = `${selectId}-error`;

  return (
    <div className="ft-field">
      <label className="ft-field__label" htmlFor={selectId}>
        {label}
      </label>
      <select
        {...rest}
        id={selectId}
        className="ft-select"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : undefined}
      >
        {children}
      </select>
      {error && (
        <span className="ft-field__error" id={errorId}>
          {error}
        </span>
      )}
    </div>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
};

/** Çok satırlı metin — Input ile aynı iskelet, aynı gerekçe. */
export function Textarea({ label, error, id, ...rest }: TextareaProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const errorId = `${textareaId}-error`;

  return (
    <div className="ft-field">
      <label className="ft-field__label" htmlFor={textareaId}>
        {label}
      </label>
      <textarea
        {...rest}
        id={textareaId}
        className="ft-textarea"
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
