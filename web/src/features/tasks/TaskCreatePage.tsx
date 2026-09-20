import { useNavigate } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { todayAsCalendarDay } from '@/features/finance/financeLabels';
import type { TaskInput } from '@/types/api';
import { TaskForm } from './TaskForm';

/**
 * Yeni görev.
 *
 * Kayıt oluşunca AYRINTIYA gidilir — müşteri, finans ve ödeme
 * ekranlarındaki desenin aynısı. Kullanıcı eklediği işi görür ve oradan
 * tamamlayabilir.
 *
 * VARSAYILAN TARİH BUGÜN: görevlerin ezici çoğunluğu bugüne planlanıyor.
 * `todayAsCalendarDay` yerel saate göre çalışır ve `toISOString()`
 * kullanmaz — UTC'ye çevirmek, akşam saatlerinde yarının tarihini
 * verirdi.
 *
 * Bu YALNIZCA formun varsayılanıdır; "bugün hangi gün" sorusunun ürün
 * cevabı değil. Dashboard'un günlük listesi `GET /tasks/today` ile,
 * şirketin saat diliminde, backend'de belirlenir.
 *
 * ------------------------------------------------------------------
 * GÖRSEL DİL (UI redesign turu)
 *
 * YENİ BİR TASARIM SİSTEMİ YOK. Bu ekran, müşteri oluşturma ve
 * düzenleme ekranlarının kullandığı `ft-form-page` kapsam sınıfını
 * OLDUĞU GİBİ devralır: yükseltilmiş kart yüzeyi, hairline kenar, xl
 * yarıçap, yumuşak gölge, 44px kutulanmış alanlar, okunur etiketler,
 * turuncu odak halkası, geçersiz alanda kırmızı kutu, çerçeveli ve altı
 * çizgisiz "Vazgeç", 375px'te tam genişlik eylemler. Hepsi zaten
 * yazılmış kurallardan gelir; bu dosya yalnızca sarmalayıcıyı ekler.
 *
 * `TaskForm` DEĞİŞMEDİ: aynı alanlar, aynı seçiciler, aynı doğrulama,
 * aynı gövde, aynı yönlendirme, aynı 403 davranışı. Form işaretlemesi
 * düzenleme ekranıyla ORTAKTIR ve o ekran bu turun kapsamı dışında —
 * sarmalayıcı sınıf sayesinde yalnızca bu ekran giydirildi.
 */
export function TaskCreatePage() {
  const navigate = useNavigate();

  async function handleSubmit(values: TaskInput): Promise<void> {
    const created = await endpoints.tasks.create(api, values);
    navigate(`/app/tasks/${created.id}`, { replace: true });
  }

  return (
    <div className="ft-form-page">
      <TaskForm
        title="Yeni görev"
        submitLabel="Kaydet"
        initialValues={{
          title: '',
          note: '',
          scheduledDate: todayAsCalendarDay(),
          // Saatsiz başlar: her iş bir randevu değildir.
          scheduledTime: '',
          customerId: '',
          assignedTo: '',
        }}
        cancelTo="/app/tasks"
        onSubmit={handleSubmit}
      />
    </div>
  );
}
