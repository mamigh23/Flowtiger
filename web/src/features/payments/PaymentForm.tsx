import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Button, Card, ErrorState, Input, Select, Textarea, useFocusFirstInvalidFieldOnError } from '@/components/ui';
import { MoneyFormatError, parseMinorAmount } from '@/lib/finance/money';
import type { Customer, PaymentAllocationInput, PaymentInput } from '@/types/api';
import { financeEntryOptionLabel } from './paymentFormat';
import { fieldErrorOf, paymentErrorMessage, unhandledValidationMessages } from './paymentErrors';

/**
 * Ödeme formu — oluşturma ve düzenleme ortak yüzeyi.
 *
 * BU FORM HESAP YAPMAZ. `allocated_minor` ve `remaining_minor` backend'de
 * her okumada hesaplanır ve gövdede `prohibited`'dır. Formda "kalan
 * dağıtılmamış tutar" göstergesi de YOKTUR: o gösterge backend'in
 * ürettiği değerin istemci tarafındaki ikinci bir kopyası olurdu ve
 * backend kuralı değiştirdiği gün sessizce yalan söylerdi. Dağıtım
 * toplamı ödemeyi aşarsa backend 422 döner ve o gösterilir.
 *
 * `allocations` ALANI HİÇBİR GÖVDEDEN DÜŞMEZ. Backend kuralı `sometimes`
 * olduğu için eksik gövde 422 vermez; servis `?? []` diyerek boş liste
 * varsayar ve `replaceAllocations` MEVCUT TÜM DAĞITIMLARI SİLER. Yani
 * alanı düşürmek "dokunma" değil, "hepsini sil" demektir. Liste boşsa
 * açıkça `[]` gider.
 *
 * HEDEF SEÇENEKLERİ İKİ KAYNAĞIN BİRLEŞİMİDİR:
 *   1. GET /finance-entries?per_page=100
 *   2. Düzenlenen ödemenin kendi dağıtım hedefleri (`extraTargets`)
 *
 * İkincisi olmadan gerçek bir veri kaybı yolu açılırdı: mevcut bir
 * dağıtımın hedefi ilk 100 kaydın dışındaysa seçici o değeri gösteremez,
 * seçim boşa düşer ve "Kaydet" o dağıtımı sessizce yok ederdi. Aynı kayıt
 * iki kaynakta da varsa TEK seçenek gösterilir.
 *
 * TUTAR DÖNÜŞÜMÜ money.ts'e AİTTİR: `parseFloat`, `toFixed`, `Math.round`
 * ya da `/ 100` burada geçmez.
 */

export interface PaymentAllocationDraft {
  /** Kararlı React anahtarı — satır sırası değişse de kimlik korunur. */
  key: string;
  financeEntryId: string;
  /** Türkçe biçimde, ör. "500,00". */
  amount: string;
}

export interface PaymentFormInitialValues {
  financialDate: string;
  amount: string;
  method: string;
  customerId: string;
  note: string;
  allocations: PaymentAllocationDraft[];
}

export interface FinanceEntryOption {
  id: number;
  label: string;
}

interface PaymentFormProps {
  title: string;
  submitLabel: string;
  initialValues: PaymentFormInitialValues;
  /**
   * Ödemenin kendi dağıtım hedefleri.
   *
   * Uçtan gelmese bile seçilebilir kalmalılar; aksi hâlde mevcut bir
   * dağıtımın hedefi kaydederken kaybolur.
   */
  extraTargets: FinanceEntryOption[];
  cancelTo: string;
  onSubmit: (values: PaymentInput) => Promise<void>;
}

export function PaymentForm({
  title,
  submitLabel,
  initialValues,
  extraTargets,
  cancelTo,
  onSubmit,
}: PaymentFormProps) {
  const [financialDate, setFinancialDate] = useState(initialValues.financialDate);
  const [amount, setAmount] = useState(initialValues.amount);
  const [method, setMethod] = useState(initialValues.method);
  const [customerId, setCustomerId] = useState(initialValues.customerId);
  const [note, setNote] = useState(initialValues.note);
  const [rows, setRows] = useState<PaymentAllocationDraft[]>(initialValues.allocations);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersError, setCustomersError] = useState<unknown>(null);
  const [apiTargets, setApiTargets] = useState<FinanceEntryOption[]>([]);
  const [targetsError, setTargetsError] = useState<unknown>(null);

  const [amountError, setAmountError] = useState<string | undefined>(undefined);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  // P1-06: submit başarısız olduğunda odağı ilk geçersiz alana taşır.
  // Üç bağımsız hata kaynağı var: sunucu (`error`), yerel tutar ayrıştırma
  // (`amountError`) ve dağıtım satırları (`rowErrors`) — hepsi izlenir.
  useFocusFirstInvalidFieldOnError(error, amountError, rowErrors);

  // Çift gönderim koruması ref ile: state güncellemesi asenkrondur ve
  // hızlı iki tıklama arasında henüz uygulanmamış olabilir.
  const inFlight = useRef(false);

  // Yeni satırlara benzersiz anahtar üretir; dizinin indeksi anahtar
  // OLARAK KULLANILAMAZ — araya satır silinince kimlikler kayardı.
  const nextKey = useRef(0);

  /**
   * Seçenek kaynakları — ikisi de "izin verilen en büyük sayfa" ile.
   *
   * Bu ekranlarda sayfalama YOK: varsayılan 15 ile gelen bir seçici,
   * on altıncı kaydı seçilemez hâle getirir ve kullanıcı sebebini göremez.
   * 100 backend'in üst sınırıdır (MAX_PER_PAGE); üstü 422 döner.
   */
  const loadPickers = useCallback(async () => {
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

    try {
      const result = await endpoints.financeEntries.list(api, { per_page: 100 });
      setApiTargets(
        result.data.map((entry) => ({ id: entry.id, label: financeEntryOptionLabel(entry) })),
      );
      setTargetsError(null);
    } catch (caught) {
      setTargetsError(caught);
      setApiTargets([]);
    }
  }, []);

  useEffect(() => {
    void loadPickers();
  }, [loadPickers]);

  /**
   * Uçtan gelen hedefler + ödemenin kendi hedefleri, ID bazında birleşim.
   *
   * Aynı kayıt iki kaynakta da varsa uçtan geleni tutarız: o etiket iptal
   * durumunu da taşıyor, özet ise taşımıyor.
   */
  const targets: FinanceEntryOption[] = [
    ...apiTargets,
    ...extraTargets.filter((extra) => !apiTargets.some((option) => option.id === extra.id)),
  ];

  function addRow() {
    nextKey.current += 1;
    setRows((current) => [
      ...current,
      { key: `new-${nextKey.current}`, financeEntryId: '', amount: '' },
    ]);
  }

  function removeRow(key: string) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  function updateRow(key: string, patch: Partial<PaymentAllocationDraft>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (inFlight.current) return;

    setAmountError(undefined);
    setRowErrors({});

    const nextRowErrors: Record<string, string> = {};
    let amountMinor: number | null = null;

    try {
      amountMinor = parseMinorAmount(amount);
    } catch (caught) {
      // Okunamayan tutar SUNUCUYA GÖNDERİLMEZ: ya NaN giderdi ya da alan
      // hiç gitmezdi; ikisi de "tutarı anlamadım" demekten kötü.
      if (!(caught instanceof MoneyFormatError)) throw caught;
      setAmountError(caught.message);
    }

    const allocations: PaymentAllocationInput[] = [];

    for (const row of rows) {
      if (row.financeEntryId === '') {
        nextRowErrors[`${row.key}:target`] = 'Bir finans kaydı seçin.';
        continue;
      }

      try {
        allocations.push({
          finance_entry_id: Number(row.financeEntryId),
          amount_minor: parseMinorAmount(row.amount),
        });
      } catch (caught) {
        if (!(caught instanceof MoneyFormatError)) throw caught;
        nextRowErrors[`${row.key}:amount`] = caught.message;
      }
    }

    if (amountMinor === null || Object.keys(nextRowErrors).length > 0) {
      setRowErrors(nextRowErrors);
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        financial_date: financialDate,
        amount_minor: amountMinor,
        currency: 'TRY',
        // Boş metin null'a çevrilir: backend `nullable` bekler, boş string
        // bir ödeme yöntemi değildir.
        method: method.trim() === '' ? null : method.trim(),
        note: note.trim() === '' ? null : note.trim(),
        customer_id: customerId === '' ? null : Number(customerId),
        // Boş olsa bile AÇIKÇA gönderilir (bkz. dosya başlığı).
        allocations,
      });
    } catch (caught) {
      setError(caught);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  const dateError = fieldErrorOf(error, 'financial_date');
  const apiAmountError = fieldErrorOf(error, 'amount_minor');
  const methodError = fieldErrorOf(error, 'method');
  const noteError = fieldErrorOf(error, 'note');
  const customerError = fieldErrorOf(error, 'customer_id');
  // Kural satırlara değil TOPLAMA aittir; hangi satırın "fazla" olduğu
  // söylenemez, bu yüzden bölümün altında gösterilir.
  const allocationsError = fieldErrorOf(error, 'allocations');

  const handledFields = new Set<string>([
    'financial_date',
    'amount_minor',
    'method',
    'note',
    'customer_id',
    'allocations',
    ...rows.flatMap((_, index) => [
      `allocations.${index}.finance_entry_id`,
      `allocations.${index}.amount_minor`,
    ]),
  ]);

  const unhandled = unhandledValidationMessages(error, handledFields);

  const shownFieldErrors = [
    dateError,
    apiAmountError,
    methodError,
    noteError,
    customerError,
    allocationsError,
    ...rows.flatMap((_, index) => [
      fieldErrorOf(error, `allocations.${index}.finance_entry_id`),
      fieldErrorOf(error, `allocations.${index}.amount_minor`),
    ]),
  ].filter(Boolean);

  // Alan altında gösterilemeyen her hata form seviyesinde gösterilir;
  // sessizce yutulan bir hata kullanıcıya "kaydedildi" izlenimi verir.
  const formError =
    error !== null && shownFieldErrors.length === 0 && unhandled.length === 0
      ? paymentErrorMessage(error)
      : null;

  return (
    <div className="ft-page">
      <header className="ft-page__header">
        <h1 className="ft-page__title">{title}</h1>
      </header>

      <Card>
        <form onSubmit={(event) => void handleSubmit(event)} noValidate>
          {formError && <ErrorState message={formError} />}
          {unhandled.map((message) => (
            <ErrorState key={message} message={message} />
          ))}

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

          {/* Serbest metin: backend'de enum yok, arayüz de uydurmaz. */}
          <Input
            label="Yöntem"
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            error={methodError}
            autoComplete="off"
          />

          <Select
            label="Müşteri"
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            error={
              customerError ?? (customersError ? paymentErrorMessage(customersError) : undefined)
            }
          >
            {/* Müşterisiz ödeme geçerlidir: hedefsiz avans. */}
            <option value="">Müşteri seçilmedi</option>
            {customers.map((customer) => (
              <option key={customer.id} value={String(customer.id)}>
                {customer.name}
              </option>
            ))}
          </Select>

          <Textarea
            label="Not"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            error={noteError}
            rows={3}
          />

          <section data-testid="payment-allocations">
            <h2 className="ft-section__title">Dağıtımlar</h2>

            {targetsError !== null && (
              <ErrorState message={paymentErrorMessage(targetsError)} />
            )}

            {rows.map((row, index) => (
              <div key={row.key} data-testid={`allocation-row-${index + 1}`}>
                <Select
                  label={`Finans kaydı ${index + 1}`}
                  value={row.financeEntryId}
                  onChange={(event) => updateRow(row.key, { financeEntryId: event.target.value })}
                  error={
                    rowErrors[`${row.key}:target`] ??
                    fieldErrorOf(error, `allocations.${index}.finance_entry_id`)
                  }
                >
                  <option value="">Kayıt seçilmedi</option>
                  {targets.map((target) => (
                    <option key={target.id} value={String(target.id)}>
                      {target.label}
                    </option>
                  ))}
                </Select>

                <Input
                  label={`Dağıtım tutarı ${index + 1}`}
                  value={row.amount}
                  onChange={(event) => updateRow(row.key, { amount: event.target.value })}
                  error={
                    rowErrors[`${row.key}:amount`] ??
                    fieldErrorOf(error, `allocations.${index}.amount_minor`)
                  }
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="1.234,56"
                />

                <Button type="button" variant="ghost" onClick={() => removeRow(row.key)}>
                  Satırı sil
                </Button>
              </div>
            ))}

            {allocationsError && <ErrorState message={allocationsError} />}

            <Button type="button" variant="secondary" onClick={addRow}>
              Dağıtım ekle
            </Button>
          </section>

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
