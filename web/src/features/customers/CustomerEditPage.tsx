import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Card, ErrorState } from '@/components/ui';
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
 *
 * ------------------------------------------------------------------
 * GÖRSEL DİL (UI redesign turu)
 *
 * YENİ BİR TASARIM SİSTEMİ YOK. Bu ekran, "Yeni müşteri" ekranının
 * kullandığı `ft-form-page` kapsam sınıfını OLDUĞU GİBİ devralır:
 * yükseltilmiş kart yüzeyi, hairline kenar, xl yarıçap, kutulanmış
 * alanlar, okunur etiketler, turuncu odak halkası, çerçeveli "Vazgeç"
 * ve 375px'te tam genişlik düğmeler — hepsi zaten yazılmış kurallardan
 * gelir. Bu dosya yalnızca sarmalayıcıyı ekler.
 *
 * `CustomerForm` DEĞİŞMEDİ: aynı alanlar, aynı doğrulama, aynı PUT
 * gövdesi, aynı yönlendirme. Oluşturma ekranıyla ortak olan form
 * işaretlemesine dokunulmadı; iki ekran aynı dili aynı kaynaktan alıyor.
 *
 * DÜZENLEMEYE ÖZEL İKİ DURUM — oluşturma ekranında karşılığı yok:
 *
 *   YÜKLEME artık ortada dönen bir çark değil, FORMUN İSKELETİ. Çark,
 *   kaydın yerine boş bir ekran koyup veri gelince sayfayı zıplatıyordu;
 *   iskelet kartın, alanların ve düğme sırasının yerini baştan tutar.
 *   Davranış aynı: kayıt gelmeden form render EDİLMEZ.
 *
 *   HATA kartı da aynı yüzeye taşındı ve "Müşterilere dön" artık altı
 *   çizili bir bağlantı değil, formdaki "Vazgeç" ile aynı çerçeveli
 *   ikincil kontrol. Metin, hedef ve yönlendirme değişmedi.
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

  /*
   * İSKELET EKRANIN KENDİSİDİR: başlık, kart, iki alan ve düğme sırası
   * gerçek formla aynı yerdedir. `aria-hidden` çünkü burada okunacak bir
   * bilgi yok — ekran okuyucu boş kutuları saymamalı.
   */
  if (loading) {
    return (
      <div className="ft-page ft-form-page" aria-hidden="true">
        <header className="ft-page__header">
          <span className="ft-skeleton ft-form-page__skeleton-title" />
        </header>

        <Card className="ft-form-page__skeleton-card">
          {[0, 1].map((index) => (
            <span key={index} className="ft-form-page__skeleton-field">
              <span className="ft-skeleton ft-form-page__skeleton-label" />
              <span className="ft-skeleton ft-form-page__skeleton-input" />
            </span>
          ))}

          <span className="ft-skeleton ft-form-page__skeleton-action" />
        </Card>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="ft-page ft-form-page">
        <Card className="ft-form-page__notice">
          <ErrorState message={customerErrorMessage(error)} />
          {/* Formdaki "Vazgeç" ile aynı ikincil kontrol: çerçeveli,
              altı çizgisiz. Metin ve hedef değişmedi. */}
          <Link className="ft-button ft-button--ghost" to="/app/customers">
            Müşterilere dön
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="ft-form-page">
      <CustomerForm
        title="Müşteriyi düzenle"
        submitLabel="Kaydet"
        initialValues={{ name: customer.name, phone: customer.phone }}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
