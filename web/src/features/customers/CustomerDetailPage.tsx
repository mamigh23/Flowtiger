import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Button, Card, ConfirmPanel, ErrorState, LoadingScreen } from '@/components/ui';
import type { Customer } from '@/types/api';
import { customerErrorMessage } from './customerErrors';

/**
 * Müşteri detayı ve silme.
 *
 * Silme GERİ ALINAMAZ: customers tablosunda deleted_at yok, soft delete
 * bilinçli olarak kullanılmadı. Bu yüzden onay adımı zorunlu ve onay
 * metni müşterinin adını içeriyor — yanlış kaydı silmek geri alınamaz.
 */
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

  if (loading) return <LoadingScreen />;

  if (error && !customer) {
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

  if (!customer) return null;

  return (
    <div className="ft-page">
      <header className="ft-page__header">
        <h1 className="ft-page__title">{customer.name}</h1>
        <div className="ft-page__actions">
          <Link className="ft-button ft-button--secondary" to={`/app/customers/${customer.id}/edit`}>
            Düzenle
          </Link>
          <Button
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

      <Card>
        <dl className="ft-details">
          <dt>Müşteri no</dt>
          {/* Kullanıcıya gösterilen numara customer_no'dur, id değil. */}
          <dd data-testid="customer-no">{customer.customer_no}</dd>

          <dt>Telefon</dt>
          <dd data-testid="customer-phone">{customer.phone ?? '—'}</dd>

          <dt>Oluşturulma</dt>
          <dd>{customer.created_at ?? '—'}</dd>

          <dt>Son güncelleme</dt>
          <dd>{customer.updated_at ?? '—'}</dd>
        </dl>
      </Card>

      {confirming && (
        <Card>
          <ConfirmPanel
            data-testid="delete-confirm-panel"
            triggerRef={deleteTriggerRef}
            onCancel={() => setConfirming(false)}
          >
            {/* Onay metni müşterinin adını taşır: yanlış kaydı silmek geri
                alınamaz, çünkü backend'de soft delete yok. */}
            <p data-testid="delete-confirm">
              <strong>{customer.name}</strong> kalıcı olarak silinecek. Bu işlem geri alınamaz.
            </p>
            <div className="ft-form__actions">
              {/* Vazgeç ilk kontrol: yıkıcı aksiyon Tab sırasında ilk
                  durak olmamalı. */}
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Vazgeç
              </Button>
              <Button onClick={() => void handleDelete()} loading={deleting}>
                Evet, sil
              </Button>
            </div>
          </ConfirmPanel>
        </Card>
      )}
    </div>
  );
}
