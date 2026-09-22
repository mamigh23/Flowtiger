import { useNavigate } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { CustomerForm, type CustomerFormValues } from './CustomerForm';

/**
 * Yeni müşteri.
 *
 * Backend 201 ile oluşturulan kaydı döndürür; kullanıcı doğrudan onun
 * detayına gider. Listeye dönmek, yeni kaydın kaçıncı sayfada olduğunu
 * aramak demek olurdu (sıralama customer_no'ya göre sabit).
 *
 * ------------------------------------------------------------------
 * GÖRSEL DİL (UI redesign turu)
 *
 * `ft-form-page` YALNIZCA BİR KAPSAM SINIFIDIR — form işaretlemesi
 * `CustomerForm` içinde ve o dosya bu turun kapsamı dışında. Sınıf,
 * müşteri listesi ve ayrıntısıyla aynı yüzey dilini (kart, hairline,
 * kutulanmış alan, turuncu odak halkası) yalnızca BU ekrana getirir;
 * aynı formu kullanan düzenleme ekranı olduğu gibi kalır.
 *
 * ADI BİLEREK GENEL: aynı sarmalayıcı başka bir form ekranına
 * eklendiğinde tek satırla aynı dili alır, yeni bir CSS bloğu
 * gerekmez.
 *
 * FORM İÇERİĞİ DEĞİŞMEDİ: aynı alanlar, aynı doğrulama, aynı istek,
 * aynı yönlendirme. Bu dosya yalnızca kapsayıcıyı ekler.
 */
export function CustomerCreatePage() {
  const navigate = useNavigate();

  async function handleSubmit(values: CustomerFormValues) {
    const created = await endpoints.customers.create(api, values);

    navigate(`/app/customers/${created.id}`, { replace: true });
  }

  return (
    <div className="ft-form-page">
      <CustomerForm title="Yeni müşteri" submitLabel="Kaydet" onSubmit={handleSubmit} />
    </div>
  );
}
