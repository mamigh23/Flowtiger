import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Button, Card, ErrorState, Input, Select, Textarea } from '@/components/ui';
import { MoneyFormatError, parseMinorAmount } from '@/lib/finance/money';
import type { Customer, FinanceEntryInput } from '@/types/api';
import { VAT_RATE_OPTIONS, directionLabel } from './financeLabels';
import { fieldErrorOf, financeErrorMessage } from './financeErrors';

/**
 * Finans kaydı formu — oluşturma ve düzenleme ortak yüzeyi.
 *
 * BU FORM HESAP YAPMAZ. Kullanıcı TUTARI ve ESASI verir; net, KDV ve brüt
 * üçlüsünü backend'in VatCalculator'ı üretir. Formda "1.000 + %20 = 1.200"
 * gibi bir önizleme YOKTUR ve olmayacak: o önizlemeyi üreten şey ikinci
 * bir hesaplama motoru olurdu ve bir gün backend'inkiyle ayrışır, hangisinin
 * doğru olduğu bilinemezdi. Kullanıcı sonucu ancak sunucu yanıtından sonra
 * görür.
 *
 * TUTAR DÖNÜŞÜMÜ money.ts'e AİTTİR. Burada `parseFloat`, `toFixed`,
 * `Math.round` ya da `/ 100` geçmez.
 *
 * GÖVDE HER ZAMAN TAM: uç PUT'tur ve gönderilmeyen alan BOŞALTILIR.
 * Kullanıcı yalnızca notu düzeltse bile müşteri, kategori ve tarih gövdede
 * gider — yoksa dokunulmayan alanlar sessizce silinirdi.
 *
 * YÖN İKİ MODDA FARKLI DAVRANIR:
 *   oluşturma → rotadan gelir, DEĞİŞTİRİLEMEZ. "Yeni gelir" ve "Yeni
 *               gider" iki ayrı niyettir ve form açılmadan önce seçilir;
 *               forma ikinci bir seçici koymak başlığı yalan söyler hâle
 *               getirirdi.
 *   düzenleme → değiştirilebilir. Yanlış yönle girilmiş bir kaydı
 *               düzeltmenin başka yolu yok; silme ucu da yok.
 *
 * `currency` KULLANICIYA SORULMAZ: backend MVP'de yalnızca TRY kabul
 * ediyor. Seçilemeyen bir alanı seçim gibi göstermek yanlış bir vaat olurdu.
 */

export interface FinanceFormInitialValues {
  direction: FinanceEntryInput['direction'];
  financialDate: string;
  /** Türkçe biçimde, ör. "1.234,56". Esasa göre net ya da brüt. */
  amount: string;
  amountBasis: FinanceEntryInput['amount_basis'];
  /** Seçim değeri: '' → KDV yok, '0' → %0, '2000' → %20. */
  vatRate: string;
  customerId: string;
  category: string;
  note: string;
}

interface FinanceEntryFormProps {
  title: string;
  submitLabel: string;
  /** Yön düzenlenebilir mi? Oluşturmada hayır, düzenlemede evet. */
  directionEditable: boolean;
  initialValues: FinanceFormInitialValues;
  cancelTo: string;
  onSubmit: (values: FinanceEntryInput) => Promise<void>;
}

/** Bugünün TAKVİM GÜNÜ — yerel saate göre. */
function todayAsCalendarDay(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');

  // toISOString() KULLANILMADI: UTC'ye çevirir ve UTC'nin ilerisindeki bir
  // saat diliminde akşam saatlerinde yarının tarihini verir.
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function emptyFinanceFormValues(
  direction: FinanceEntryInput['direction'],
): FinanceFormInitialValues {
  return {
    direction,
    financialDate: todayAsCalendarDay(),
    amount: '',
    amountBasis: 'net',
    // KDV VARSAYILANI "YOK" (null), "%0" DEĞİL. İkisi backend'de farklı
    // şeylerdir; varsayılan bir oran seçmek, kullanıcı hiçbir şey
    // söylemeden onun adına vergi beyanı yapmak olurdu.
    vatRate: '',
    customerId: '',
    category: '',
    note: '',
  };
}

export function FinanceEntryForm({
  title,
  submitLabel,
  directionEditable,
  initialValues,
  cancelTo,
  onSubmit,
}: FinanceEntryFormProps) {
  const [direction, setDirection] = useState(initialValues.direction);
  const [financialDate, setFinancialDate] = useState(initialValues.financialDate);
  const [amount, setAmount] = useState(initialValues.amount);
  const [amountBasis, setAmountBasis] = useState(initialValues.amountBasis);
  const [vatRate, setVatRate] = useState(initialValues.vatRate);
  const [customerId, setCustomerId] = useState(initialValues.customerId);
  const [category, setCategory] = useState(initialValues.category);
  const [note, setNote] = useState(initialValues.note);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersError, setCustomersError] = useState<unknown>(null);

  const [amountError, setAmountError] = useState<string | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  // Çift gönderim koruması ref ile: state güncellemesi asenkrondur ve
  // hızlı iki tıklama arasında henüz uygulanmamış olabilir.
  const inFlight = useRef(false);

  /**
   * Müşteri seçenekleri — YALNIZCA gerçek müşteri ucundan.
   *
   * `per_page=100` gönderilir çünkü burada sayfalama YOK: varsayılan 15
   * ile gelen bir seçici, on altıncı müşteriyi seçilemez hâle getirir ve
   * kullanıcı sebebini göremez. 100 backend'in izin verdiği en büyük
   * değerdir; üstü 422 döner.
   */
  const loadCustomers = useCallback(async () => {
    try {
      const result = await endpoints.customers.list(api, { per_page: 100 });
      setCustomers(result.data);
      setCustomersError(null);
    } catch (caught) {
      // Yutulmaz: seçicinin altında gösterilir. Sessizce boş bir liste,
      // kullanıcıya "hiç müşterin yok" demek olurdu.
      setCustomersError(caught);
      setCustomers([]);
    }
  }, []);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (inFlight.current) return;

    setAmountError(undefined);

    let amountMinor: number;

    try {
      amountMinor = parseMinorAmount(amount);
    } catch (caught) {
      // Okunamayan tutar SUNUCUYA GÖNDERİLMEZ. Gönderilseydi ya NaN
      // giderdi ya da alan hiç gitmezdi; ikisi de kullanıcıya "tutarı
      // anlamadım" demekten kötü.
      if (caught instanceof MoneyFormatError) {
        setAmountError(caught.message);
        return;
      }
      throw caught;
    }

    inFlight.current = true;
    setSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        direction,
        financial_date: financialDate,
        amount_basis: amountBasis,
        amount_minor: amountMinor,
        // '' seçimi null'dur: "KDV yok". Number('') sıfır verirdi ve
        // sıfır oran BAŞKA bir şeydir.
        vat_rate_bp: vatRate === '' ? null : Number(vatRate),
        currency: 'TRY',
        customer_id: customerId === '' ? null : Number(customerId),
        // Boş metin null'a çevrilir: backend `nullable` bekler, boş string
        // bir kategori değildir.
        category: category.trim() === '' ? null : category.trim(),
        note: note.trim() === '' ? null : note.trim(),
      });
    } catch (caught) {
      setError(caught);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  const dateError = fieldErrorOf(error, 'financial_date');
  const basisError = fieldErrorOf(error, 'amount_basis');
  const vatError = fieldErrorOf(error, 'vat_rate_bp');
  const customerError = fieldErrorOf(error, 'customer_id');
  const categoryError = fieldErrorOf(error, 'category');
  const noteError = fieldErrorOf(error, 'note');
  const directionError = fieldErrorOf(error, 'direction');
  const apiAmountError = fieldErrorOf(error, 'amount_minor');

  const hasFieldError = Boolean(
    dateError ||
      basisError ||
      vatError ||
      customerError ||
      categoryError ||
      noteError ||
      directionError ||
      apiAmountError,
  );

  // Alan altında gösterilemeyen her hata form seviyesinde gösterilir;
  // sessizce yutulan bir hata kullanıcıya "kaydedildi" izlenimi verir.
  const formError = error !== null && !hasFieldError ? financeErrorMessage(error) : null;

  return (
    <div className="ft-page">
      <header className="ft-page__header">
        <h1 className="ft-page__title">{title}</h1>
      </header>

      <Card>
        <form onSubmit={(event) => void handleSubmit(event)} noValidate>
          {formError && <ErrorState message={formError} />}

          {directionEditable ? (
            <Select
              label="Yön"
              value={direction}
              onChange={(event) =>
                setDirection(event.target.value as FinanceEntryInput['direction'])
              }
              error={directionError}
            >
              <option value="in">Gelir</option>
              <option value="out">Gider</option>
            </Select>
          ) : (
            <p className="ft-muted">
              Yön: <strong data-testid="finance-direction">{directionLabel(direction)}</strong>
            </p>
          )}

          <Input
            label="Tarih"
            type="date"
            value={financialDate}
            onChange={(event) => setFinancialDate(event.target.value)}
            error={dateError}
          />

          <Input
            label="Tutar"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            // Yerel doğrulama sunucununkinin yerine geçmez, önüne geçer.
            error={amountError ?? apiAmountError}
            inputMode="decimal"
            autoComplete="off"
            placeholder="1.234,56"
          />

          <Select
            label="Tutar esası"
            value={amountBasis}
            onChange={(event) =>
              setAmountBasis(event.target.value as FinanceEntryInput['amount_basis'])
            }
            error={basisError}
          >
            <option value="net">Net (KDV hariç)</option>
            <option value="gross">Brüt (KDV dahil)</option>
          </Select>

          <Select
            label="KDV oranı"
            value={vatRate}
            onChange={(event) => setVatRate(event.target.value)}
            error={vatError}
          >
            {/* Boş değer null'dur: "kayıt KDV bilgisi taşımıyor". */}
            <option value="">KDV yok</option>
            {VAT_RATE_OPTIONS.map((option) => (
              <option key={option.bp} value={String(option.bp)}>
                {option.label}
              </option>
            ))}
          </Select>

          <Select
            label="Müşteri"
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            error={customerError ?? (customersError ? financeErrorMessage(customersError) : undefined)}
          >
            <option value="">Müşteri seçilmedi</option>
            {customers.map((customer) => (
              <option key={customer.id} value={String(customer.id)}>
                {customer.name}
              </option>
            ))}
          </Select>

          <Input
            label="Kategori"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            error={categoryError}
            autoComplete="off"
          />

          <Textarea
            label="Not"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            error={noteError}
            rows={3}
          />

          <div className="ft-form__actions">
            <Button type="submit" loading={submitting}>
              {submitLabel}
            </Button>
            <Link className="ft-button ft-button--ghost" to={cancelTo}>
              Vazgeç
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
