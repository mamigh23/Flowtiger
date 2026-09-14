import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Button, ConfirmPanel, ErrorState } from '@/components/ui';
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
 *
 * ------------------------------------------------------------------
 * GÖRSEL DİL (UI redesign turu)
 *
 * Sınıflar `ft-task-detail-*` önekiyle BU EKRANA özeldir ve Görevler
 * listesiyle aynı dili paylaşır: aynı hero ışığı, aynı kart yüzeyi, aynı
 * hairline ve rozet. Paylaşılan `.ft-button`, `.ft-details`,
 * `.ft-page__header` kuralları ve listenin `.ft-tasks-*` blokları
 * DEĞİŞTİRİLMEZ; `.ft-button` üzerine yalnızca sayfaya özel bir sınıfla
 * (0,2,0 özgüllük) yazılır.
 *
 * DURUM BİR KEZ GÖSTERİLİR — başlığın yanındaki rozette. Hem rozet hem
 * ayrı bir "Durum" alanı olsaydı aynı bilgi ekran okuyucuda iki kez
 * duyulur ve "hangisi asıl" sorusu doğardı.
 *
 * GERİ DÖNÜŞ TEK VE ÜSTTE: ikinci bir kopya, ekran okuyucuda aynı adı
 * taşıyan iki bağlantı demek olurdu.
 *
 * VERİ, İSTEK VE ONAY AKIŞI AYNI: aynı uçlar, aynı alanlar, aynı
 * ConfirmPanel (odak yönetimi, Escape ve odak dönüşü değişmedi).
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

  /*
   * YÜKLEME EKRANIN İSKELETİDİR, ortada dönen bir çark değil: kartların
   * yeri baştan bellidir, veri gelince sayfa zıplamaz.
   */
  if (loading) {
    return (
      <div className="ft-page ft-task-detail" aria-hidden="true">
        <span className="ft-skeleton ft-task-detail__skeleton-back" />
        <div className="ft-task-detail__hero">
          <div className="ft-task-detail__headline">
            <span className="ft-skeleton ft-task-detail__skeleton-title" />
            <span className="ft-skeleton ft-task-detail__skeleton-state" />
          </div>
        </div>
        <div className="ft-task-detail__grid">
          {[0, 1, 2].map((index) => (
            <div key={index} className="ft-task-detail__card">
              <span className="ft-skeleton ft-task-detail__skeleton-card-title" />
              <span className="ft-skeleton ft-task-detail__skeleton-line" />
              <span className="ft-skeleton ft-task-detail__skeleton-line" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (task === null) {
    return (
      <div className="ft-page ft-task-detail">
        <div className="ft-task-detail__notice">
          <ErrorState message={taskErrorMessage(error)} />
          <Link className="ft-task-detail__action" to="/app/tasks">
            Görevlere dön
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="ft-page ft-task-detail">
      {/* Geri dönüş TEK ve ÜSTTE. */}
      <Link className="ft-task-detail__back" to="/app/tasks">
        <span aria-hidden="true">‹</span> Görevlere dön
      </Link>

      {/* ------------------------------------------------ kimlik kartı */}
      <header className="ft-task-detail__hero">
        <div className="ft-task-detail__headline">
          <span className="ft-task-detail__eyebrow">Görev</span>
          <h1 className="ft-task-detail__title">{task.title}</h1>

          {/*
            Durum YANITTAN okunur, `completed_at`ten türetilmez. Rozet
            metni taskLabels'tan gelir — liste ve ayrıntı aynı kelimeyi
            kullanır; renk tek başına anlam taşımaz.
          */}
          <span
            className={`ft-task-detail__state ft-task-detail__state--${
              task.is_completed ? 'done' : 'open'
            }`}
            data-testid="task-status"
          >
            {taskStatusLabel(task.is_completed)}
          </span>
        </div>

        <div className="ft-task-detail__actions">
          {/*
            Tamamlanmış görevde "Tamamla" GÖSTERİLMEZ: ikinci çağrı 422
            alırdı ve kullanıcıya çalışmayan bir düğme göstermek olurdu.
          */}
          {task.is_completed ? (
            <Button
              className="ft-task-detail__btn ft-task-detail__btn--secondary"
              variant="secondary"
              onClick={() => void changeCompletion('reopen')}
              loading={busy}
            >
              Yeniden aç
            </Button>
          ) : (
            <Button
              className="ft-task-detail__btn ft-task-detail__btn--primary"
              onClick={() => void changeCompletion('complete')}
              loading={busy}
            >
              Tamamla
            </Button>
          )}

          <Link className="ft-task-detail__action" to={`/app/tasks/${task.id}/edit`}>
            Düzenle
          </Link>

          <Button
            className="ft-task-detail__btn ft-task-detail__btn--danger"
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

      {/*
        Onay, eylemin HEMEN ALTINDA: kullanıcının bastığı düğmeyle
        cevapladığı soru arasına kart yığını girmesin. ConfirmPanel aynı
        bileşendir — odak yönetimi, Escape ve odak dönüşü değişmedi.
      */}
      {confirming && (
        <ConfirmPanel
          className="ft-task-detail__confirm"
          data-testid="task-delete-confirm"
          triggerRef={deleteTriggerRef}
          onCancel={() => setConfirming(false)}
        >
          {/*
            Onay metni görevin BAŞLIĞINI taşır: yanlış kaydı silmek geri
            alınamaz — görevin void gibi bir geri dönüşü yok.
          */}
          <p className="ft-task-detail__confirm-text">
            <strong>{task.title}</strong> kalıcı olarak silinecek. Bu işlem geri alınamaz.
          </p>

          <div className="ft-task-detail__confirm-actions">
            {/* Vazgeç ilk kontrol: yıkıcı aksiyon Tab sırasında ilk
                durak olmamalı. */}
            <Button
              className="ft-task-detail__btn ft-task-detail__btn--secondary"
              variant="ghost"
              onClick={() => setConfirming(false)}
            >
              Vazgeç
            </Button>
            <Button
              className="ft-task-detail__btn ft-task-detail__btn--confirm"
              onClick={() => void handleDelete()}
              loading={busy}
            >
              Evet, sil
            </Button>
          </div>
        </ConfirmPanel>
      )}

      {/* ---------------------------------------------- bilgi kartları */}
      <div className="ft-task-detail__grid">
        <section className="ft-task-detail__card" aria-labelledby="ft-task-when">
          <h2 className="ft-task-detail__card-title" id="ft-task-when">
            Zamanlama
          </h2>
          <dl className="ft-task-detail__facts">
            <div className="ft-task-detail__fact">
              <dt className="ft-task-detail__label">Tarih</dt>
              {/* Takvim günü Date'e çevrilmeden biçimlenir. */}
              <dd className="ft-task-detail__value" data-testid="task-date">
                {formatFinancialDate(task.scheduled_date) ?? '—'}
              </dd>
            </div>

            <div className="ft-task-detail__fact">
              <dt className="ft-task-detail__label">Saat</dt>
              {/* Saatsiz görev meşrudur; saat UYDURULMAZ. */}
              <dd className="ft-task-detail__value" data-testid="task-time">
                {task.scheduled_time ?? '—'}
              </dd>
            </div>
          </dl>
        </section>

        <section className="ft-task-detail__card" aria-labelledby="ft-task-people">
          <h2 className="ft-task-detail__card-title" id="ft-task-people">
            İlgililer
          </h2>
          <dl className="ft-task-detail__facts">
            <div className="ft-task-detail__fact">
              <dt className="ft-task-detail__label">Müşteri</dt>
              {/* Kullanıcıya gösterilen numara customer_no'dur, id değil. */}
              <dd className="ft-task-detail__value" data-testid="task-customer">
                {task.customer ? `#${task.customer.customer_no} ${task.customer.name}` : '—'}
              </dd>
            </div>

            <div className="ft-task-detail__fact">
              <dt className="ft-task-detail__label">Atanan kişi</dt>
              <dd className="ft-task-detail__value" data-testid="task-assignee">
                {task.assigned_to?.name ?? '—'}
              </dd>
            </div>

            <div className="ft-task-detail__fact">
              <dt className="ft-task-detail__label">Oluşturan</dt>
              <dd className="ft-task-detail__value" data-testid="task-creator">
                {task.created_by?.name ?? '—'}
              </dd>
            </div>
          </dl>
        </section>

        <section className="ft-task-detail__card" aria-labelledby="ft-task-record">
          <h2 className="ft-task-detail__card-title" id="ft-task-record">
            Kayıt bilgileri
          </h2>
          {/*
            TARİHLER BİÇİMLENDİRİLİR — ham ISO metni kullanıcıya
            gösterilmez. `formatDateTime` denetim ekranıyla AYNI
            fonksiyondur (Intl kullanmaz: Node'un ICU derlemesi ortama
            göre değişir ve tr-TR'siz bir derlemede sessizce en-US
            biçimine düşer).
          */}
          <dl className="ft-task-detail__facts">
            {task.completed_at !== null && (
              <div className="ft-task-detail__fact">
                <dt className="ft-task-detail__label">Tamamlanma</dt>
                <dd className="ft-task-detail__value" data-testid="task-completed-at">
                  {formatDateTime(task.completed_at) ?? '—'}
                </dd>
              </div>
            )}

            <div className="ft-task-detail__fact">
              <dt className="ft-task-detail__label">Oluşturulma</dt>
              <dd className="ft-task-detail__value">{formatDateTime(task.created_at) ?? '—'}</dd>
            </div>

            <div className="ft-task-detail__fact">
              <dt className="ft-task-detail__label">Son güncelleme</dt>
              <dd className="ft-task-detail__value">{formatDateTime(task.updated_at) ?? '—'}</dd>
            </div>
          </dl>
        </section>
      </div>

      {/*
        NOT KENDİ KARTINDA: serbest metindir, uzayabilir ve iki kolonlu
        bir etiket/değer ızgarasında okunaksızlaşırdı.
      */}
      <section
        className="ft-task-detail__card ft-task-detail__card--note"
        aria-labelledby="ft-task-note"
      >
        <h2 className="ft-task-detail__card-title" id="ft-task-note">
          Not
        </h2>
        {/* Not yoksa uydurma değer değil, boşluk işareti. */}
        <p className="ft-task-detail__note" data-testid="task-note">
          {task.note ?? '—'}
        </p>
      </section>
    </div>
  );
}
