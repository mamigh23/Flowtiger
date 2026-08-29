import { useNavigate } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { todayAsCalendarDay } from '@/features/finance/financeLabels';
import type { PaymentInput } from '@/types/api';
import { PaymentForm } from './PaymentForm';

/**
 * Yeni ödeme.
 *
 * Kayıt oluşunca AYRINTIYA gidilir: kullanıcı sunucunun dağıtım hesabını
 * (`allocated_minor` / `remaining_minor`) orada görür. Listeye dönmek,
 * kullanıcıyı kendi kaydının sonucunu görmeden bırakırdı.
 *
 * `extraTargets` BOŞTUR: henüz bir ödeme yok, dolayısıyla korunması
 * gereken mevcut bir dağıtım hedefi de yok. Seçenekler yalnızca finans
 * ucundan gelir.
 */
export function PaymentCreatePage() {
  const navigate = useNavigate();

  async function handleSubmit(values: PaymentInput): Promise<void> {
    const created = await endpoints.payments.create(api, values);
    navigate(`/app/payments/${created.id}`, { replace: true });
  }

  return (
    <PaymentForm
      title="Yeni ödeme"
      submitLabel="Kaydet"
      initialValues={{
        financialDate: todayAsCalendarDay(),
        amount: '',
        method: '',
        customerId: '',
        note: '',
        // Dağıtım satırı UYDURULMAZ: kullanıcı istemeden boş bir satır
        // açmak, doldurulması zorunluymuş izlenimi verirdi.
        allocations: [],
      }}
      extraTargets={[]}
      cancelTo="/app/payments"
      onSubmit={handleSubmit}
    />
  );
}
