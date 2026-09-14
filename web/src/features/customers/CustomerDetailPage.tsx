import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Button, ConfirmPanel, ErrorState } from '@/components/ui';
import { formatDateTime } from '@/features/audit/auditLabels';
import type { Customer } from '@/types/api';
import { customerErrorMessage } from './customerErrors';

/**
 * Müşteri detayı ve silme.
 *
 * Silme GERİ ALINAMAZ: customers tablosunda deleted_at yok, soft delete
 * bilinçli olarak kullanılmadı. Bu yüzden onay adımı zorunlu ve onay
 * metni müşterinin adını içeriyor — yanlış kaydı silmek geri alınamaz.
 *
 * ------------------------------------------------------------------
 * GÖRSEL DİL (UI redesign turu)
 *
 * Sınıflar `ft-customer-detail-*` önekiyle BU EKRANA özeldir ve Müşteri
 * listesi + Görev ayrıntısıyla aynı dili paylaşır: aynı hero ışığı, aynı
 * kart yüzeyi, aynı hairline, aynı onay paneli. Paylaşılan `.ft-button`,
 * `.ft-details`, `.ft-page__header` kuralları ve `.ft-customers-*` /
 * `.ft-task-detail-*` blokları DEĞİŞTİRİLMEZ; `.ft-button` üzerine
 * yalnızca sayfaya özel bir sınıfla (0,2,0 özgüllük) yazılır.
 *
 * AD VE NUMARA BİRER KEZ GÖSTERİLİR. Aynı bilgiyi hem kimlik kartında
 * hem bilgi kartında tekrarlamak, ekran okuyucuda aynı metni iki kez
 * duyurmak ve "hangisi asıl" sorusunu doğurmak olurdu.
 *
 * GERİ DÖNÜŞ TEK VE ÜSTTE: ikinci bir kopya, ekran okuyucuda aynı adı
 * taşıyan iki bağlantı demek olurdu.
 *
 * VERİ, İSTEK VE ONAY AKIŞI AYNI: aynı uç, aynı alanlar, aynı silme
 * akışı, aynı ConfirmPanel (odak yönetimi, Escape ve odak dönüşü
 * değişmedi).
 */

/**
 * Ad baş harfleri — yalnızca GÖRSEL bir işaret, listedeki rozetle aynı
 * kural. `aria-hidden` ile sunulur: başlığın erişilebilir adına
 * karışmamalı.
 */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toLocaleUpperCase('tr-TR');
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toLocaleUpperCase('tr-TR');
}

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /** Onay paneli kapanınca odağın döneceği düğme. */
  const deleteTriggerRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setCustomer(await endpoints.customers.get(api, Number(id)));
    } catch (caught) {
      setError(caught);
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    try {
      await endpoints.customers.remove(api, Number(id));
      navigate('/app/customers', { replace: true });
    } catch (caught) {
      // Kayıt başka bir oturumda silinmiş olabilir → 404. Bu da
      // "bulunamadı"dır; yetki hatası değil.
      setError(caught);
      setConfirming(false);
    } finally {
      setDeleting(false);
    }
  }

  /*
   * YÜKLEME EKRANIN İSKELETİDİR, ortada dönen bir çark değil: kartların
   * yeri baştan bellidir, veri gelince sayfa zıplamaz.
   */
  if (loading) {
    return (
      <div className="ft-page ft-customer-detail" aria-hidden="true">
        <span className="ft-skeleton ft-customer-detail__skeleton-back" />
        <div className="ft-customer-detail__hero">
          <div className="ft-customer-detail__identity">
            <span className="ft-skeleton ft-customer-detail__skeleton-avatar" />
            <span className="ft-customer-detail__headline">
              <span className="ft-skeleton ft-customer-detail__skeleton-title" />
              <span className="ft-skeleton ft-customer-detail__skeleton-no" />
            </span>
          </div>
        </div>
        <div className="ft-customer-detail__grid">
          {[0, 1].map((index) => (
            <div key={index} className="ft-customer-detail__card">
              <span className="ft-skeleton ft-customer-detail__skeleton-card-title" />
              <span className="ft-skeleton ft-customer-detail__skeleton-line" />
              <span className="ft-skeleton ft-customer-detail__skeleton-line" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && !customer) {
    return (
      <div className="ft-page ft-customer-detail">
        <div className="ft-customer-detail__notice">
          <ErrorState message={customerErrorMessage(error)} />
          <Link className="ft-customer-detail__action" to="/app/customers">
            Müşterilere dön
          </Link>
        </div>
      </div>
    );
  }

  if (!customer) return null;

  return (
    <div className="ft-page ft-customer-detail">
      {/* Geri dönüş TEK ve ÜSTTE. */}
      <Link className="ft-customer-detail__back" to="/app/customers">
        <span aria-hidden="true">‹</span> Müşterilere dön
      </Link>

      {/* ------------------------------------------------ kimlik kartı */}
      <header className="ft-customer-detail__hero">
        <div className="ft-customer-detail__identity">
          {/* Baş harfler görsel işaret; başlığın adına karışmaz. */}
          <span className="ft-customer-detail__avatar" aria-hidden="true">
            {initials(customer.name)}
          </span>

          <div className="ft-customer-detail__headline">
            <span className="ft-customer-detail__eyebrow">Müşteri</span>
            <h1 className="ft-customer-detail__title">{customer.name}</h1>
            {/*
              Kullanıcıya gösterilen numara customer_no'dur, id değil.
              Kimlik kartında bir kez görünür; bilgi kartında tekrar
              edilmez.
            */}
            <span className="ft-customer-detail__no" data-testid="customer-no">
              #{customer.customer_no}
            </span>
          </div>
        </div>

        <div className="ft-customer-detail__actions">
          <Link
            className="ft-customer-detail__action"
            to={`/app/customers/${customer.id}/edit`}
          >
            Düzenle
          </Link>

          <Button
            className="ft-customer-detail__btn ft-customer-detail__btn--danger"
            variant="ghost"
            onClick={(event) => {
              deleteTriggerRef.current = event.currentTarget;
              setConfirming(true);
            }}
          >
            Sil
          </Button>
        </div>
      </header>

      {error !== null && <ErrorState message={customerErrorMessage(error)} />}

      {/*
        Onay, eylemin HEMEN ALTINDA: kullanıcının bastığı düğmeyle
        cevapladığı soru arasına kart yığını girmesin. ConfirmPanel aynı
        bileşendir — odak yönetimi, Escape ve odak dönüşü değişmedi.
      */}
      {confirming && (
        <ConfirmPanel
          className="ft-customer-detail__confirm"
          data-testid="delete-confirm-panel"
          triggerRef={deleteTriggerRef}
          onCancel={() => setConfirming(false)}
        >
          {/* Onay metni müşterinin adını taşır: yanlış kaydı silmek geri
              alınamaz, çünkü backend'de soft delete yok. */}
          <p data-testid="delete-confirm" className="ft-customer-detail__confirm-text">
            <strong>{customer.name}</strong> kalıcı olarak silinecek. Bu işlem geri alınamaz.
          </p>

          <div className="ft-customer-detail__confirm-actions">
            {/* Vazgeç ilk kontrol: yıkıcı aksiyon Tab sırasında ilk
                durak olmamalı. */}
            <Button
              className="ft-customer-detail__btn ft-customer-detail__btn--secondary"
              variant="ghost"
              onClick={() => setConfirming(false)}
            >
              Vazgeç
            </Button>
            <Button
              className="ft-customer-detail__btn ft-customer-detail__btn--confirm"
              onClick={() => void handleDelete()}
              loading={deleting}
            >
              Evet, sil
            </Button>
          </div>
        </ConfirmPanel>
      )}

      {/* ---------------------------------------------- bilgi kartları */}
      <div className="ft-customer-detail__grid">
        <section className="ft-customer-detail__card" aria-labelledby="ft-customer-contact">
          <h2 className="ft-customer-detail__card-title" id="ft-customer-contact">
            İletişim
          </h2>
          <dl className="ft-customer-detail__facts">
            <div className="ft-customer-detail__fact">
              <dt className="ft-customer-detail__label">Telefon</dt>
              {/* Telefon yoksa uydurma değer değil, boşluk işareti. */}
              <dd className="ft-customer-detail__value" data-testid="customer-phone">
                {customer.phone ?? '—'}
              </dd>
            </div>
          </dl>
        </section>

        <section className="ft-customer-detail__card" aria-labelledby="ft-customer-record">
          <h2 className="ft-customer-detail__card-title" id="ft-customer-record">
            Kayıt bilgileri
          </h2>
          {/*
            TARİHLER BİÇİMLENDİRİLİR — ham ISO metni kullanıcıya
            gösterilmez.

            REGRESYON: bu iki alan yanıttaki değeri olduğu gibi basıyordu
            ve ekranda "2026-09-11T18:23:49+00:00" görünüyordu (gerçek
            tarayıcıda ölçüldü). Görev ayrıntısı aynı bilgiyi
            "11.09.2026 17:47" olarak gösteriyor; aynı üründe aynı alan
            iki farklı biçimde okunmamalı.

            `formatDateTime` denetim ekranıyla AYNI fonksiyondur (Intl
            kullanmaz: Node'un ICU derlemesi ortama göre değişir ve
            tr-TR'siz bir derlemede sessizce en-US biçimine düşer).
          */}
          <dl className="ft-customer-detail__facts">
            <div className="ft-customer-detail__fact">
              <dt className="ft-customer-detail__label">Oluşturulma</dt>
              <dd className="ft-customer-detail__value" data-testid="customer-created-at">
                {formatDateTime(customer.created_at) ?? '—'}
              </dd>
            </div>

            <div className="ft-customer-detail__fact">
              <dt className="ft-customer-detail__label">Son güncelleme</dt>
              <dd className="ft-customer-detail__value" data-testid="customer-updated-at">
                {formatDateTime(customer.updated_at) ?? '—'}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
