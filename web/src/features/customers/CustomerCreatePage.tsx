import { useNavigate } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { CustomerForm, type CustomerFormValues } from './CustomerForm';

/**
 * Yeni müşteri.
 *
 * Backend 201 ile oluşturulan kaydı döndürür; kullanıcı doğrudan onun
 * detayına gider. Listeye dönmek, yeni kaydın kaçıncı sayfada olduğunu
 * aramak demek olurdu (sıralama customer_no'ya göre sabit).
 */
export function CustomerCreatePage() {
  const navigate = useNavigate();

  async function handleSubmit(values: CustomerFormValues) {
    const created = await endpoints.customers.create(api, values);

    navigate(`/app/customers/${created.id}`, { replace: true });
  }

  return (
    <CustomerForm title="Yeni müşteri" submitLabel="Kaydet" onSubmit={handleSubmit} />
  );
}
