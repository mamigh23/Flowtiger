import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Card, ErrorState, LoadingScreen } from '@/components/ui';
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
    <TaskForm
      title="Görevi düzenle"
      submitLabel="Kaydet"
      initialValues={initialValuesOf(task)}
      cancelTo={`/app/tasks/${task.id}`}
      onSubmit={handleSubmit}
    />
  );
}

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
  };
}
