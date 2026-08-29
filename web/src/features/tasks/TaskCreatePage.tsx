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
 */
export function TaskCreatePage() {
  const navigate = useNavigate();

  async function handleSubmit(values: TaskInput): Promise<void> {
    const created = await endpoints.tasks.create(api, values);
    navigate(`/app/tasks/${created.id}`, { replace: true });
  }

  return (
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
  );
}
