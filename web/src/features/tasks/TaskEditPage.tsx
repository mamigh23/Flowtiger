import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Card, ErrorState } from '@/components/ui';
import type { Task, TaskInput } from '@/types/api';
import { TaskForm } from './TaskForm';
import type { TaskFormInitialValues } from './TaskForm';
import { taskErrorMessage } from './taskErrors';

/**
 * Görev düzenleme.
 *
 * UÇ PUT'TUR: gövde görevin TAM hâlini taşır ve gönderilmeyen alan
 * BOŞALTILIR. Form bu yüzden tüm alanları mevcut değerleriyle doldurur;
 * eksik doldurulsaydı, yalnızca başlığı düzelten bir kullanıcı farkında
 * olmadan saati ve müşteriyi silerdi.
 *
 * TAMAMLANMA DURUMUNA DOKUNULMAZ. Form `is_completed` göndermiyor ve
 * backend de güncellemede ona dokunmuyor: tamamlanmış bir görevin notunu
 * düzeltmek onu yeniden açmaz.
 *
 * İPTAL EDİLMİŞ KAYIT KAVRAMI YOK — finanstan farklı olarak görev
 * silinir, void edilmez. Bu yüzden burada "değiştirilemez" bir hâl de
 * yok; her görev düzenlenebilir.
 *
 * ------------------------------------------------------------------
 * GÖRSEL DİL (UI redesign turu)
 *
 * YENİ BİR CSS SİSTEMİ YOK. Ekran, "Yeni görev" ve müşteri formlarının
 * kullandığı `ft-form-page` kapsam sınıfını OLDUĞU GİBİ devralır:
 * yükseltilmiş charcoal kart, hairline kenar, yumuşak gölge, xl yarıçap,
 * 44px kutulanmış alanlar, okunur etiketler, turuncu odak halkası,
 * geçersiz alanda kırmızı kenar + kırmızı halka, çerçeveli ve altı
 * çizgisiz "Vazgeç", 375px'te tam genişlik eylemler.
 *
 * `TaskForm` DEĞİŞMEDİ: aynı altı alan, aynı seçiciler, aynı doğrulama,
 * aynı PUT gövdesi, aynı 403 davranışı, aynı yönlendirme. Form
 * işaretlemesi oluşturma ekranıyla ORTAKTIR; sarmalayıcı sınıf sayesinde
 * iki ekran da aynı dili aynı kaynaktan alıyor.
 *
 * DÜZENLEMEYE ÖZEL İKİ DURUM — oluşturma ekranında karşılığı yok ve
 * müşteri düzenleme ekranındaki çözümün aynısı:
 *
 *   YÜKLEME ortada dönen bir çark değil, FORMUN İSKELETİ. Çark, kaydın
 *   yerine boş bir ekran koyup veri gelince sayfayı zıplatıyordu; iskelet
 *   kartın, altı alanın ve düğme sırasının yerini baştan tutar. Davranış
 *   aynı: kayıt gelmeden form render EDİLMEZ (TaskForm başlangıç
 *   değerlerini kendi state'ine kopyalar, sonradan güncellenmez).
 *
 *   HATA kartı da aynı yüzeye taşındı ve "Görevlere dön" artık altı
 *   çizili bir bağlantı değil, formdaki "Vazgeç" ile aynı çerçeveli
 *   ikincil kontrol. Metin, hedef ve hata çevirisi değişmedi.
 */
export function TaskEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

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

  async function handleSubmit(values: TaskInput): Promise<void> {
    await endpoints.tasks.update(api, Number(id), values);
    navigate(`/app/tasks/${id}`, { replace: true });
  }

  /*
   * İSKELET EKRANIN KENDİSİDİR: başlık, kart, altı alan ve düğme sırası
   * gerçek formla aynı yerdedir — ikinci sıra "Not" alanı olduğu için
   * daha yüksek. `aria-hidden` çünkü burada okunacak bir bilgi yok;
   * ekran okuyucu boş kutuları saymamalı.
   */
  if (loading) {
    return (
      <div className="ft-page ft-form-page" aria-hidden="true">
        <header className="ft-page__header">
          <span className="ft-skeleton ft-form-page__skeleton-title" />
        </header>

        <Card className="ft-form-page__skeleton-card">
          {SKELETON_FIELDS.map((tall, index) => (
            <span key={index} className="ft-form-page__skeleton-field">
              <span className="ft-skeleton ft-form-page__skeleton-label" />
              <span
                className={
                  tall
                    ? 'ft-skeleton ft-form-page__skeleton-input ft-form-page__skeleton-input--tall'
                    : 'ft-skeleton ft-form-page__skeleton-input'
                }
              />
            </span>
          ))}

          <span className="ft-skeleton ft-form-page__skeleton-action" />
        </Card>
      </div>
    );
  }

  if (task === null) {
    return (
      <div className="ft-page ft-form-page">
        <Card className="ft-form-page__notice">
          <ErrorState message={taskErrorMessage(error)} />
          {/* Formdaki "Vazgeç" ile aynı ikincil kontrol: çerçeveli,
              altı çizgisiz. Metin ve hedef değişmedi. */}
          <Link className="ft-button ft-button--ghost" to="/app/tasks">
            Görevlere dön
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="ft-form-page">
      <TaskForm
        title="Görevi düzenle"
        submitLabel="Kaydet"
        initialValues={initialValuesOf(task)}
        cancelTo={`/app/tasks/${task.id}`}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

/**
 * İskeletteki alan sırası — `true` olan satır "Not" (textarea), gerçek
 * formdaki gibi daha yüksek. Sıra TaskForm'daki sırayla aynı: Başlık,
 * Not, Tarih, Saat, Müşteri, Atanan kişi.
 */
const SKELETON_FIELDS = [false, true, false, false, false, false];

function initialValuesOf(task: Task): TaskFormInitialValues {
  return {
    title: task.title,
    note: task.note ?? '',
    // Sözleşmede nullable; boş tarihli bir kayıt uydurma bir güne
    // doldurulmaz, alan boş açılır ve kullanıcı seçer.
    scheduledDate: task.scheduled_date ?? '',
    // Boş metin "saat yok" demektir; gövdede null'a çevrilir.
    scheduledTime: task.scheduled_time ?? '',
    customerId: task.customer === null ? '' : String(task.customer.id),
    assignedTo: task.assigned_to === null ? '' : String(task.assigned_to.id),
    /*
     * Seçili kaydın ADI da taşınır.
     *
     * Seçenek listesi yüklenemediğinde (üye rolü `/members`ten 403 alır)
     * form, atanmış bir görevi "Kimseye atanmadı" gibi gösteriyordu.
     * Gönderilen gövde doğruydu — değer state'te duruyor — ama ekran
     * kaydın gerçek hâlini yanlış anlatıyordu. Ad zaten yanıtta var.
     */
    customerLabel: task.customer?.name,
    assignedToLabel: task.assigned_to?.name,
  };
}
