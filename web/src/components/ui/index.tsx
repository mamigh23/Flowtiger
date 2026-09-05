import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  KeyboardEvent,
  MutableRefObject,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { useEffect, useId, useRef, useState } from 'react';

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
        <span className="ft-field__error" id={errorId} role="alert">
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
        <span className="ft-field__error" id={errorId} role="alert">
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
        <span className="ft-field__error" id={errorId} role="alert">
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
        <span className="ft-field__error" id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`ft-card${className ? ` ${className}` : ''}`}>{children}</div>;
}

type ConfirmPanelProps = HTMLAttributes<HTMLDivElement> & {
  /** Onayı açan denetime referans; panel kapanınca odak buraya döner. */
  triggerRef: MutableRefObject<HTMLElement | null>;
  /** Escape'in de çağırdığı kapatma yolu; "Vazgeç" ile AYNI fonksiyon olmalı. */
  onCancel: () => void;
};

/**
 * Silme/iptal onaylarında kullanılan ortak, dar kapsamlı odak yönetimi.
 *
 * GERÇEK BİR MODAL DEĞİLDİR. Portal, backdrop, role="dialog"/aria-modal
 * ya da bir focus trap KASITLI OLARAK yok: bu paneller sayfa akışının
 * bir parçasıdır, üstüne binen bir katman değil. Görünüm çağıranın
 * elindedir (genelde bir <Card> içine konur); burada yönetilen tek şey
 * odaktır:
 *
 *   - açılışta odak panelin KENDİSİNE taşınır (tabIndex=-1) — belirli
 *     bir alana (ör. bir metin kutusuna) zorla odaklanmak, o alanı
 *     gereğinden önemli göstermek olurdu.
 *   - Escape aynı kapatma yolunu (`onCancel`) çağırır; "Vazgeç"
 *     düğmesiyle davranış farkı yoktur.
 *   - panel DOM'dan kalktığında (Vazgeç, Escape ya da bir API hatası —
 *     üçü de çağıranın state'ini kapatıp bu bileşeni unmount eder) odak
 *     tetikleyici düğmeye geri döner.
 *
 * Başarılı bir işlemden sonra sayfa değişiyorsa ya da tetikleyicinin
 * kendisi de aynı anda kalkıyorsa bu geri dönüş sessizce hiçbir şey
 * yapmaz (dönük düğme artık DOM'da değildir) — o senaryo kasıtlı olarak
 * bu bileşenin kapsamı dışıdır.
 */
export function ConfirmPanel({ triggerRef, onCancel, children, onKeyDown, ...rest }: ConfirmPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Açılış: odak panelin kendisine taşınır. Çağıran bu bileşeni bir
  // koşulla render ettiği için (`{confirming && <ConfirmPanel>...}`)
  // her açılış yeni bir mount'tur — boş bağımlılık dizisi burada
  // "yalnızca bir kez" değil, "her açılışta bir kez" anlamına gelir.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // Kapanış: panel unmount olduğunda odak tetikleyiciye döner. Aynı
  // anda tetikleyici de kalkmışsa (ör. başarılı işlem sonrası
  // yönlendirme) `focus()` çağrısı sessizce hiçbir şey yapmaz.
  useEffect(
    () => () => {
      triggerRef.current?.focus();
    },
    [triggerRef],
  );

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);

    if (event.key === 'Escape') {
      // Modal olmadığı için tarayıcı Escape'i kendiliğinden ele almaz;
      // olayın bir üst forma sızması da istenmez.
      event.stopPropagation();
      onCancel();
    }
  }

  return (
    <div {...rest} ref={panelRef} tabIndex={-1} onKeyDown={handleKeyDown}>
      {children}
    </div>
  );
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

/**
 * Submit başarısız olduğunda odağı DOM'daki İLK geçersiz alana taşır
 * (P1-06).
 *
 * `triggers`, çağıran formun hata(ları)nı tuttuğu STATE'İN KENDİSİDİR
 * (`error`, `submitError`, `fieldErrors` — hangisiyse; birden fazla
 * bağımsız hata kaynağı olan formlar — ör. PaymentForm'un hem sunucu
 * `error`'ı hem yerel `amountError`/`rowErrors`'ı — hepsini geçirebilir).
 * Her başarısız submit bu state'(ler)i YENİDEN yazar (form handler'ları
 * her denemede önce temizleyip sonra dolduruyor), bu yüzden aynı hatayla
 * ikinci bir deneme bile bağımlılığı gerçekten DEĞİŞTİRİR ve efekt
 * yeniden çalışır.
 *
 * NEDEN useEffect: React state güncellemesi ile DOM'un gerçekten
 * güncellenmesi ARASINDA bir gecikme vardır. `catch` bloğunun içinde
 * senkron bir sorgu, React henüz `aria-invalid`i yazmadan çalışırdı.
 * useEffect DOM commit'İNDEN SONRA çalıştığı için sorgulandığı anda
 * attribute zaten oradadır.
 *
 * ELEMENT BULUNAMAZSA HİÇBİR ŞEY YAPILMAZ: yalnızca form seviyesi bir
 * hata varsa (hiçbir alan `aria-invalid` değilse) bu bilinçli bir
 * no-op'tur — o durumda zaten `role="alert"` taşıyan `ErrorState` kendi
 * duyurusunu yapar.
 *
 * Sayfada aynı anda birden fazla form YOKTUR (her ekran tek form), bu
 * yüzden `document` genelinde aramak yeterlidir; bir form ref'i/kapsayıcı
 * parametresi gerektirmez.
 */
export function useFocusFirstInvalidFieldOnError(...triggers: unknown[]): void {
  // triggers, çağıranın verdiği bağımlılık listesidir — bu hook'un TEK
  // amacı bu listeyi useEffect'e olduğu gibi aktarmaktır.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, triggers);
}
