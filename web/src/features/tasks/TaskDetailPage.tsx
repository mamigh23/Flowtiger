import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Button, Card, ConfirmPanel, ErrorState, LoadingScreen } from '@/components/ui';
import { formatFinancialDate } from '@/features/finance/financeLabels';
import { formatDateTime } from '@/features/audit/auditLabels';
import type { Task } from '@/types/api';
import { taskStatusLabel } from './taskLabels';
import { taskErrorMessage } from './taskErrors';

/**
 * Görev ayrıntısı — tamamlama, yeniden açma ve silme.
 *
 * TAMAMLAMA VE YENİDEN AÇMA AYRI UÇLARDIR ve GÖVDE ALMAZLAR: tamamlanma
 * zamanını sunucu yazar. İstemci bir işin ne zaman bitirildiğini seçemez.
 *
 * İKİSİ DE İDEMPOTENT DEĞİL. Zaten tamamlanmış bir görevi yeniden
 * tamamlamak ilk tamamlanma anını üzerine yazardı; backend 422 + kod
 * döner. Arayüz bunu başarı gibi göstermez — ve zaten o eylemi hiç
 * sunmaz: tamamlanmış görevde "Tamamla" yerine "Yeniden aç" bulunur.
 *
 * İSTEK SONRASI İKİNCİ BİR GET ATILMAZ: uç 200 döner ve kaydın yeni
 * hâlini taşır. Yeniden okumak aynı bilgiyi ikinci kez istemek olurdu.
 *
 * GÖREV SİLİNİR, VOID EDİLMEZ — finanstan farklı olarak. Onay, mevcut
 * müşteri silme desenidir: satır içi kart, modal değil.
 */
export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  /** Onay paneli kapanınca odağın döneceği düğme. */
  const deleteTriggerRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setTask(await endpoints.tasks.get(api, Number(id)));
    } catch (caught) {
      setError(caught);
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Tamamla / yeniden aç.
   *
   * İkisi tek fonksiyonda çünkü tek bir soruyu yanıtlıyorlar: "işin
   * durumunu değiştir". Yanıt kaydın yeni hâlini taşıdığı için doğrudan
   * state'e yazılır.
   */
  async function changeCompletion(action: 'complete' | 'reopen') {
    setBusy(true);
    setError(null);

    try {
      const updated =
        action === 'complete'
          ? await endpoints.tasks.complete(api, Number(id))
          : await endpoints.tasks.reopen(api, Number(id));

      setTask(updated);
    } catch (caught) {
      // Görev başka bir oturumda değişmiş olabilir → 422 + kod.
      // Backend'in metni gösterilir; durum SESSİZCE değişmez.
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);

    try {
      await endpoints.tasks.remove(api, Number(id));
      navigate('/app/tasks', { replace: true });
    } catch (caught) {
      // Kayıt başka bir oturumda silinmiş olabilir → 404.
      setError(caught);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingScreen />;

  if (task === null) {
    return (
      <div className="ft-page">
        <Card>
          <ErrorState message={taskErrorMessage(error)} />
          <Link className="ft-button ft-button--secondary" to="/app/tasks">
            Görevlere dön
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="ft-page">
      <header className="ft-page__header">
        <h1 className="ft-page__title">{task.title}</h1>

        <div className="ft-page__actions">
          {/*
            Tamamlanmış görevde "Tamamla" GÖSTERİLMEZ: ikinci çağrı 422
            alırdı ve kullanıcıya çalışmayan bir düğme göstermek olurdu.
          */}
          {task.is_completed ? (
            <Button
              variant="secondary"
              onClick={() => void changeCompletion('reopen')}
              loading={busy}
            >
              Yeniden aç
            </Button>
          ) : (
            <Button onClick={() => void changeCompletion('complete')} loading={busy}>
              Tamamla
            </Button>
          )}

          <Link className="ft-button ft-button--secondary" to={`/app/tasks/${task.id}/edit`}>
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

      {error !== null && <ErrorState message={taskErrorMessage(error)} />}

      <Card>
        <dl className="ft-details">
          <dt>Durum</dt>
          {/* Durum YANITTAN okunur, `completed_at`ten türetilmez. */}
          <dd data-testid="task-status">{taskStatusLabel(task.is_completed)}</dd>

          <dt>Tarih</dt>
          <dd data-testid="task-date">{formatFinancialDate(task.scheduled_date) ?? '—'}</dd>

          <dt>Saat</dt>
          <dd data-testid="task-time">{task.scheduled_time ?? '—'}</dd>

          <dt>Not</dt>
          <dd data-testid="task-note">{task.note ?? '—'}</dd>

          <dt>Müşteri</dt>
          <dd data-testid="task-customer">
            {task.customer ? `#${task.customer.customer_no} ${task.customer.name}` : '—'}
          </dd>

          <dt>Atanan kişi</dt>
          <dd data-testid="task-assignee">{task.assigned_to?.name ?? '—'}</dd>

          <dt>Oluşturan</dt>
          <dd data-testid="task-creator">{task.created_by?.name ?? '—'}</dd>

          {task.completed_at !== null && (
            <>
              <dt>Tamamlanma</dt>
              <dd data-testid="task-completed-at">{formatDateTime(task.completed_at) ?? '—'}</dd>
            </>
          )}

          <dt>Oluşturulma</dt>
          <dd>{formatDateTime(task.created_at) ?? '—'}</dd>
        </dl>
      </Card>

      {confirming && (
        <Card>
          <ConfirmPanel
            data-testid="task-delete-confirm"
            triggerRef={deleteTriggerRef}
            onCancel={() => setConfirming(false)}
          >
            {/*
              Onay metni görevin BAŞLIĞINI taşır: yanlış kaydı silmek geri
              alınamaz — görevin void gibi bir geri dönüşü yok.
            */}
            <p>
              <strong>{task.title}</strong> kalıcı olarak silinecek. Bu işlem geri alınamaz.
            </p>

            <div className="ft-form__actions">
              {/* Vazgeç ilk kontrol: yıkıcı aksiyon Tab sırasında ilk
                  durak olmamalı. */}
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Vazgeç
              </Button>
              <Button onClick={() => void handleDelete()} loading={busy}>
                Evet, sil
              </Button>
            </div>
          </ConfirmPanel>
        </Card>
      )}

      <Link className="ft-button ft-button--ghost" to="/app/tasks">
        Görevlere dön
      </Link>
    </div>
  );
}
