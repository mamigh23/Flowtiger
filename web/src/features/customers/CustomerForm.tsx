import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, ErrorState, Input, useFocusFirstInvalidFieldOnError } from '@/components/ui';
import { customerErrorMessage, fieldErrorOf } from './customerErrors';

/**
 * Müşteri formu — oluşturma ve düzenleme ortak yüzeyi.
 *
 * GÖVDE SÖZLEŞMESİ: yalnızca `name` ve `phone` gönderilir.
 *
 * `phone` HER İSTEKTE gönderilir, boşsa null olarak. Uç PUT'tur (PATCH
 * değil): gövde kaydın tam halini tanımlar ve gönderilmeyen alan
 * BOŞALTILIR. Alanı gövdeden düşürmek, yalnızca adı düzelten bir
 * kullanıcının telefonu farkında olmadan silmesi demek olurdu.
 *
 * customer_no ve company_id GÖNDERİLMEZ. Backend bunları sessizce düşürür
 * ama göndermek, istemcinin bu alanlar üzerinde söz sahibi olduğu
 * yanılgısını doğurur (playbook §3.1).
 */
export interface CustomerFormValues {
  name: string;
  phone: string | null;
}

interface CustomerFormProps {
  title: string;
  submitLabel: string;
  initialValues?: CustomerFormValues;
  onSubmit: (values: CustomerFormValues) => Promise<void>;
}

export function CustomerForm({
  title,
  submitLabel,
  initialValues,
  onSubmit,
}: CustomerFormProps) {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [phone, setPhone] = useState(initialValues?.phone ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // P1-06: submit başarısız olduğunda odağı ilk geçersiz alana taşır.
  useFocusFirstInvalidFieldOnError(error);

  // Çift gönderim koruması ref ile: state güncellemesi asenkrondur ve
  // hızlı iki tıklama arasında henüz uygulanmamış olabilir.
  const inFlight = useRef(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (inFlight.current) return;
    inFlight.current = true;

    setSubmitting(true);
    setError(null);

    try {
      const trimmed = phone.trim();

      await onSubmit({
        name: name.trim(),
        // Boş metin null'a çevrilir: backend `nullable` bekler,
        // boş string bir telefon numarası değildir.
        phone: trimmed === '' ? null : trimmed,
      });
    } catch (caught) {
      setError(caught);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  const formError = error && !fieldErrorOf(error, 'name') && !fieldErrorOf(error, 'phone')
    ? customerErrorMessage(error)
    : null;

  return (
    <div className="ft-page">
      <header className="ft-page__header">
        <h1 className="ft-page__title">{title}</h1>
      </header>

      <Card>
        <form onSubmit={handleSubmit} noValidate>
          {formError && <ErrorState message={formError} />}

          <Input
            label="Ad"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={fieldErrorOf(error, 'name')}
            autoComplete="off"
          />

          <Input
            label="Telefon"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            error={fieldErrorOf(error, 'phone')}
            autoComplete="off"
            inputMode="tel"
          />

          <div className="ft-form__actions">
            <Button type="submit" loading={submitting}>
              {submitLabel}
            </Button>
            <Link className="ft-button ft-button--ghost" to="/app/customers">
              Vazgeç
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
