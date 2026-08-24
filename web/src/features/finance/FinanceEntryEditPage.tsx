import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Card, ErrorState, LoadingScreen } from '@/components/ui';
import { formatMinorAmount } from '@/lib/finance/money';
import type { FinanceEntry, FinanceEntryInput } from '@/types/api';
import { FinanceEntryForm } from './FinanceEntryForm';
import type { FinanceFormInitialValues } from './FinanceEntryForm';
import { FINANCE_ENTRY_VOIDED_MESSAGE, financeErrorMessage } from './financeErrors';

/**
 * Finans kaydı düzenleme.
 *
 * UÇ PUT'TUR: gövde kaydın TAM hâlini taşır ve parasal üçlü her seferinde
 * yeniden hesaplanır. Kısmi güncelleme olsaydı, yalnızca tutarı değiştiren
 * bir istek eski KDV ve brüt değerlerini yerinde bırakır ve kayıt kendi
 * içinde tutarsız olurdu.
 *
 * TUTAR ESASA GÖRE DOLDURULUR. Kullanıcı tutarı brütten girdiyse forma
 * brüt, netten girdiyse net gelir. Yanlış olanı doldurmak, hiçbir şeyi
 * değiştirmeden "Kaydet"e basan bir kullanıcının tutarını sessizce
 * oynatırdı.
 *
 * İPTAL EDİLMİŞ KAYITTA FORM HİÇ AÇILMAZ. Backend 422 +
 * `finance_entry_voided` döner; formu açıp o hatayı almak, kullanıcıya
 * çalışmayan bir form doldurtmaktır.
 */
export function FinanceEntryEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [entry, setEntry] = useState<FinanceEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setEntry(await endpoints.financeEntries.get(api, Number(id)));
    } catch (caught) {
      setError(caught);
      setEntry(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(values: FinanceEntryInput): Promise<void> {
    await endpoints.financeEntries.update(api, Number(id), values);
    navigate(`/app/finance/${id}`, { replace: true });
  }

  if (loading) return <LoadingScreen />;

  if (entry === null) {
    return (
      <div className="ft-page">
        <Card>
          <ErrorState message={financeErrorMessage(error)} />
          <Link className="ft-button ft-button--secondary" to="/app/finance">
            Finans kayıtlarına dön
          </Link>
        </Card>
      </div>
    );
  }

  if (entry.voided_at !== null) {
    return (
      <div className="ft-page">
        <Card>
          <ErrorState message={FINANCE_ENTRY_VOIDED_MESSAGE} />
          <Link className="ft-button ft-button--secondary" to={`/app/finance/${entry.id}`}>
            Kayda dön
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <FinanceEntryForm
      title="Finans kaydını düzenle"
      submitLabel="Kaydet"
      // Yanlış yönle girilmiş bir kaydı düzeltmenin başka yolu yok:
      // silme ucu da yok.
      directionEditable
      initialValues={initialValuesOf(entry)}
      cancelTo={`/app/finance/${entry.id}`}
      onSubmit={handleSubmit}
    />
  );
}

function initialValuesOf(entry: FinanceEntry): FinanceFormInitialValues {
  // ESASA GÖRE: brüt esaslı kayda net doldurulsaydı, hiçbir şeyi
  // değiştirmeden kaydeden kullanıcı tutarı sessizce düşürürdü.
  const amountMinor =
    entry.calculation.basis === 'gross' ? entry.gross_minor : entry.net_minor;

  return {
    direction: entry.direction,
    // Sözleşmede nullable; boş tarihli bir kayıt uydurma bir güne
    // doldurulmaz, alan boş açılır ve kullanıcı seçer.
    financialDate: entry.financial_date ?? '',
    amount: formatMinorAmount(amountMinor),
    amountBasis: entry.calculation.basis,
    // null "KDV yok"tur ve boş seçime karşılık gelir; 0 ise "%0" seçimi.
    vatRate: entry.vat_rate_bp === null ? '' : String(entry.vat_rate_bp),
    customerId: entry.customer === null ? '' : String(entry.customer.id),
    category: entry.category ?? '',
    note: entry.note ?? '',
  };
}
