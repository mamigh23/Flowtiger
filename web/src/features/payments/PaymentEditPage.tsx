import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Card, ErrorState, LoadingScreen } from '@/components/ui';
import { formatMinorAmount } from '@/lib/finance/money';
import type { Payment, PaymentInput } from '@/types/api';
import { PaymentForm } from './PaymentForm';
import type { FinanceEntryOption, PaymentFormInitialValues } from './PaymentForm';
import { financeEntryLabel } from './paymentFormat';
import { PAYMENT_VOIDED_MESSAGE, paymentErrorMessage } from './paymentErrors';

/**
 * Ödeme düzenleme.
 *
 * UÇ PUT'TUR VE DAĞITIM LİSTESİ TAMAMEN YERİNE GEÇER: servis önce
 * `delete()` çalıştırır, sonra gelen satırları yazar. Bunun iki sonucu var:
 *
 *   1. Form mevcut dağıtımları EKSİKSİZ doldurmalı. Eksik doldurulsaydı,
 *      yalnızca notu düzelten bir kullanıcı farkında olmadan dağıtımları
 *      silerdi.
 *   2. Dağıtım id'leri her kayıtta DEĞİŞİR (silinip yeniden yazılıyor);
 *      arayüz id kalıcılığına güvenmez.
 *
 * HEDEF KAYBOLMAZ. Seçenek havuzu iki kaynağın ID bazında birleşimidir:
 * finans ucundan gelen ilk 100 kayıt VE bu ödemenin kendi dağıtım
 * hedefleri. İkincisi olmadan gerçek bir veri kaybı yolu açılırdı: mevcut
 * bir dağıtımın hedefi ilk 100 kaydın dışındaysa seçici o değeri
 * gösteremez, seçim boşa düşer ve "Kaydet" o dağıtımı sessizce yok ederdi.
 *
 * Backend bir finans kaydının ne kadarının zaten kapatıldığını
 * DÖNDÜRMÜYOR; bu yüzden seçicide "kalan borç" gibi bir bilgi yok. Onu
 * istemcide hesaplamak, olmayan veriden sonuç uydurmak olurdu.
 *
 * İPTAL EDİLMİŞ ÖDEMEDE FORM HİÇ AÇILMAZ.
 */
export function PaymentEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setPayment(await endpoints.payments.get(api, Number(id)));
    } catch (caught) {
      setError(caught);
      setPayment(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(values: PaymentInput): Promise<void> {
    await endpoints.payments.update(api, Number(id), values);
    navigate(`/app/payments/${id}`, { replace: true });
  }

  if (loading) return <LoadingScreen />;

  if (payment === null) {
    return (
      <div className="ft-page">
        <Card>
          <ErrorState message={paymentErrorMessage(error)} />
          <Link className="ft-button ft-button--secondary" to="/app/payments">
            Ödemelere dön
          </Link>
        </Card>
      </div>
    );
  }

  if (payment.voided_at !== null) {
    return (
      <div className="ft-page">
        <Card>
          <ErrorState message={PAYMENT_VOIDED_MESSAGE} />
          <Link className="ft-button ft-button--secondary" to={`/app/payments/${payment.id}`}>
            Ödemeye dön
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <PaymentForm
      title="Ödemeyi düzenle"
      submitLabel="Kaydet"
      initialValues={initialValuesOf(payment)}
      extraTargets={existingTargetsOf(payment)}
      cancelTo={`/app/payments/${payment.id}`}
      onSubmit={handleSubmit}
    />
  );
}

function initialValuesOf(payment: Payment): PaymentFormInitialValues {
  return {
    // Sözleşmede nullable; boş tarihli bir kayıt uydurma bir güne
    // doldurulmaz, alan boş açılır ve kullanıcı seçer.
    financialDate: payment.financial_date ?? '',
    amount: formatMinorAmount(payment.amount_minor),
    method: payment.method ?? '',
    customerId: payment.customer === null ? '' : String(payment.customer.id),
    note: payment.note ?? '',

    allocations: payment.allocations.map((allocation) => ({
      // Dağıtımın kendi id'si kararlı bir React anahtarıdır; satır
      // sırası değişse de kimlik korunur.
      key: `existing-${allocation.id}`,
      // Hedef okunamıyorsa (finance_entry null) seçim boş açılır:
      // uydurma bir id yazmak, olmayan bir kayda dağıtım yapmak olurdu.
      financeEntryId:
        allocation.finance_entry === null ? '' : String(allocation.finance_entry.id),
      amount: formatMinorAmount(allocation.amount_minor),
    })),
  };
}

/**
 * Ödemenin kendi dağıtım hedefleri — seçenek havuzuna eklenir.
 *
 * Özet `currency` taşımadığı için etiket ÖDEMENİN para birimiyle kurulur.
 * İptal durumu özette yok; bu seçenekler iptal etiketi taşımaz. Aynı kayıt
 * finans ucundan da geldiyse oradaki (iptal bilgisini taşıyan) etiket
 * kullanılır — birleştirme PaymentForm'da yapılır.
 */
function existingTargetsOf(payment: Payment): FinanceEntryOption[] {
  const targets: FinanceEntryOption[] = [];

  for (const allocation of payment.allocations) {
    const entry = allocation.finance_entry;
    if (entry === null) continue;
    if (targets.some((target) => target.id === entry.id)) continue;

    targets.push({ id: entry.id, label: financeEntryLabel(entry, payment.currency) });
  }

  return targets;
}
