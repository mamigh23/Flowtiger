import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Button, Card, ErrorState, Input, Select, Textarea, useFocusFirstInvalidFieldOnError } from '@/components/ui';
import type { Customer, Member, TaskInput } from '@/types/api';
import { fieldErrorOf, taskErrorMessage } from './taskErrors';

/**
 * Görev formu — oluşturma ve düzenleme ortak yüzeyi.
 *
 * UÇ PUT'TUR: gövde görevin TAM hâlini taşır ve gönderilmeyen alan
 * BOŞALTILIR. Bu yüzden form tüm alanları mevcut değerleriyle doldurur ve
 * hepsini her istekte gönderir — kullanıcı yalnızca başlığı düzeltse
 * bile. Aksi hâlde dokunulmayan müşteri ve saat sessizce silinirdi
 * (müşteri düzenlemedeki `phone` kararının aynısı).
 *
 * TAMAMLANMA BU FORMUN ALANI DEĞİL. `is_completed` backend'de
 * `completed_at`ten türetilir ve yalnızca kendi ucundan, sunucu saatiyle
 * değişir. Forma bir onay kutusu koymak, istemcinin bir işin NE ZAMAN
 * bitirildiğini seçebilmesi demek olurdu.
 *
 * SEÇİCİLER GERÇEK UÇLARDAN. Müşteri `/customers`, atanan kişi
 * `/members` — ikisi de aktif şirketle zaten sınırlı geliyor. Şirket
 * filtresi istemcide YENİDEN UYGULANMAZ: tenant kararı backend'e aittir
 * (playbook §3.1).
 */

export interface TaskFormInitialValues {
  title: string;
  note: string;
  scheduledDate: string;
  /** "09:00" ya da boş metin. Boş → gövdede null. */
  scheduledTime: string;
  customerId: string;
  assignedTo: string;
}

interface TaskFormProps {
  title: string;
  submitLabel: string;
  initialValues: TaskFormInitialValues;
  cancelTo: string;
  onSubmit: (values: TaskInput) => Promise<void>;
}

export function TaskForm({
  title,
  submitLabel,
  initialValues,
  cancelTo,
  onSubmit,
}: TaskFormProps) {
  const [taskTitle, setTaskTitle] = useState(initialValues.title);
  const [note, setNote] = useState(initialValues.note);
  const [scheduledDate, setScheduledDate] = useState(initialValues.scheduledDate);
  const [scheduledTime, setScheduledTime] = useState(initialValues.scheduledTime);
  const [customerId, setCustomerId] = useState(initialValues.customerId);
  const [assignedTo, setAssignedTo] = useState(initialValues.assignedTo);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersError, setCustomersError] = useState<unknown>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersError, setMembersError] = useState<unknown>(null);

  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  // P1-06: submit başarısız olduğunda odağı ilk geçersiz alana taşır.
  useFocusFirstInvalidFieldOnError(error);

  // Çift gönderim koruması ref ile: state güncellemesi asenkrondur ve
  // hızlı iki tıklama arasında henüz uygulanmamış olabilir.
  const inFlight = useRef(false);

  /**
   * Seçenek kaynakları — ikisi de "izin verilen en büyük sayfa" ile.
   *
   * Bu formda sayfalama YOK: varsayılan 15 ile gelen bir seçici, on
   * altıncı kaydı seçilemez hâle getirir ve kullanıcı sebebini göremez.
   * 100 backend'in üst sınırı. Arama ucu olmadığı için 100'den fazla
   * kaydı olan kiracıda sınır gerçek bir kısıt olarak kalıyor.
   */
  const loadPickers = useCallback(async () => {
    try {
      const result = await endpoints.customers.list(api, { per_page: 100 });
      setCustomers(result.data);
      setCustomersError(null);
    } catch (caught) {
      // Yutulmaz: seçicinin altında gösterilir.
      setCustomersError(caught);
      setCustomers([]);
    }

    try {
      const result = await endpoints.members.list(api, { per_page: 100 });
      setMembers(result.data);
      setMembersError(null);
    } catch (caught) {
      setMembersError(caught);
      setMembers([]);
    }
  }, []);

  useEffect(() => {
    void loadPickers();
  }, [loadPickers]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (inFlight.current) return;

    inFlight.current = true;
    setSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        title: taskTitle.trim(),
        // Boş metin null'a çevrilir: backend `nullable` bekler, boş string
        // bir not değildir.
        note: note.trim() === '' ? null : note.trim(),
        scheduled_date: scheduledDate,
        // Alan HER ZAMAN gövdede, boşken null: "saati kaldır" ancak açık
        // null ile anlatılır.
        scheduled_time: scheduledTime === '' ? null : scheduledTime,
        customer_id: customerId === '' ? null : Number(customerId),
        assigned_to: assignedTo === '' ? null : Number(assignedTo),
      });
    } catch (caught) {
      setError(caught);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  const titleError = fieldErrorOf(error, 'title');
  const noteError = fieldErrorOf(error, 'note');
  const dateError = fieldErrorOf(error, 'scheduled_date');
  const timeError = fieldErrorOf(error, 'scheduled_time');
  const customerError = fieldErrorOf(error, 'customer_id');
  const assigneeError = fieldErrorOf(error, 'assigned_to');

  const hasFieldError = Boolean(
    titleError || noteError || dateError || timeError || customerError || assigneeError,
  );

  // Alan altında gösterilemeyen her hata form seviyesinde gösterilir;
  // sessizce yutulan bir hata kullanıcıya "kaydedildi" izlenimi verir.
  const formError = error !== null && !hasFieldError ? taskErrorMessage(error) : null;

  return (
    <div className="ft-page">
      <header className="ft-page__header">
        <h1 className="ft-page__title">{title}</h1>
      </header>

      <Card>
        <form onSubmit={(event) => void handleSubmit(event)} noValidate>
          {formError && <ErrorState message={formError} />}

          <Input
            label="Başlık"
            value={taskTitle}
            onChange={(event) => setTaskTitle(event.target.value)}
            error={titleError}
            autoComplete="off"
          />

          <Textarea
            label="Not"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            error={noteError}
            rows={3}
          />

          <Input
            label="Tarih"
            type="date"
            value={scheduledDate}
            onChange={(event) => setScheduledDate(event.target.value)}
            error={dateError}
          />

          {/*
            Saat OPSİYONEL: her iş bir randevu değildir. Boş bırakıldığında
            gövdeye null gider ve listede saat gösterilmez.
          */}
          <Input
            label="Saat"
            type="time"
            value={scheduledTime}
            onChange={(event) => setScheduledTime(event.target.value)}
            error={timeError}
          />

          <Select
            label="Müşteri"
            value={customerId}
            onChange={(event) => setCustomerId(event.target.value)}
            error={
              customerError ?? (customersError ? taskErrorMessage(customersError) : undefined)
            }
          >
            <option value="">Müşteri seçilmedi</option>
            {customers.map((customer) => (
              <option key={customer.id} value={String(customer.id)}>
                {customer.name}
              </option>
            ))}
          </Select>

          <Select
            label="Atanan kişi"
            value={assignedTo}
            onChange={(event) => setAssignedTo(event.target.value)}
            error={assigneeError ?? (membersError ? taskErrorMessage(membersError) : undefined)}
          >
            <option value="">Kimseye atanmadı</option>
            {members.map((member) => (
              <option key={member.id} value={String(member.id)}>
                {member.name}
              </option>
            ))}
          </Select>

          <div className="ft-form__actions">
            <Button type="submit" loading={submitting}>
              {submitLabel}
            </Button>
            <Link className="ft-button ft-button--ghost" to={cancelTo}>
              Vazgeç
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
