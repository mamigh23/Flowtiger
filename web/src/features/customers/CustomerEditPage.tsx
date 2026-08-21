import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Card, ErrorState, LoadingScreen } from '@/components/ui';
import type { Customer } from '@/types/api';
import { CustomerForm, type CustomerFormValues } from './CustomerForm';
import { customerErrorMessage } from './customerErrors';

/**
 * Müşteri düzenleme.
 *
 * Form MEVCUT DEĞERLERLE doldurulur ve `phone` her istekte gönderilir.
 * Uç PUT'tur: gövde kaydın tam halini tanımlar, gönderilmeyen alan
 * boşaltılır. Formu boş açsaydık ya da phone'u gövdeden düşürseydik,
 * yalnızca adı düzelten kullanıcı telefonu silmiş olurdu.
 *
 * Kayıt yüklenmeden form GÖSTERİLMEZ: CustomerForm başlangıç değerlerini
 * kendi state'ine kopyalar, sonradan gelen veriyle güncellenmez.
 */
export function CustomerEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      try {
        const found = await endpoints.customers.get(api, Number(id));
        if (!cancelled) setCustomer(found);
      } catch (caught) {
        if (!cancelled) setError(caught);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSubmit(values: CustomerFormValues) {
    const updated = await endpoints.customers.update(api, Number(id), values);

    navigate(`/app/customers/${updated.id}`, { replace: true });
  }

  if (loading) return <LoadingScreen />;

  if (error || !customer) {
    return (
      <div className="ft-page">
        <Card>
          <ErrorState message={customerErrorMessage(error)} />
          <Link className="ft-button ft-button--secondary" to="/app/customers">
            Müşterilere dön
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <CustomerForm
      title="Müşteriyi düzenle"
      submitLabel="Kaydet"
      initialValues={{ name: customer.name, phone: customer.phone }}
      onSubmit={handleSubmit}
    />
  );
}
