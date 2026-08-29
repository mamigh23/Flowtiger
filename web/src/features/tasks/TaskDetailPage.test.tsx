import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';
import { tokenStorage } from '@/lib/auth/tokenStorage';

/**
 * Görev ayrıntısı — tamamlama, yeniden açma ve silme.
 *
 * Backend sözleşmesi:
 *   GET    /tasks/{id}            → 200 | 404
 *   POST   /tasks/{id}/complete   → 200 | 422 task_already_completed
 *   POST   /tasks/{id}/reopen     → 200 | 422 task_not_completed
 *   DELETE /tasks/{id}            → 204 | 404
 *
 * TAMAMLAMA VE YENİDEN AÇMA AYRI UÇLARDIR ve GÖVDE ALMAZLAR: tamamlanma
 * zamanını sunucu yazar. İstemci bir işin ne zaman bitirildiğini seçemez.
 *
 * İKİSİ DE İDEMPOTENT DEĞİL. Zaten tamamlanmış bir görevi yeniden
 * tamamlamak ilk tamamlanma anını üzerine yazardı; backend 422 + kod
 * döner ve arayüz bunu BAŞARI GİBİ GÖSTERMEZ.
 *
 * GÖREV SİLİNİR, VOID EDİLMEZ — finanstan farklı olarak. Onay, mevcut
 * müşteri silme desenidir: satır içi kart, modal değil.
 *
 * 404 "bulunamadı"dır: başka tenant'ın görevi de 404 döner ve arayüz
 * "yetkiniz yok" demez — backend'in bilerek sakladığı bilgiyi geri
 * sızdırırdı.
 */
describe('TaskDetailPage', () => {
  const session = {
    '/me': () => jsonResponse(200, { data: fixtures.user() }),
    '/companies': () =>
      jsonResponse(200, { data: [fixtures.company()], meta: { active_company_id: 7 } }),
  };

  const openTask = fixtures.task({
    id: 300,
    title: 'Ahmet Yılmaz\'ı ara',
    note: 'Teklif hakkında geri dönüş',
    scheduled_date: '2026-08-27',
    scheduled_time: '09:00',
    customer: { id: 501, customer_no: 12, name: 'Zeynep Kaya' },
    assigned_to: { id: 22, name: 'Grace Hopper' },
    created_by: { id: 21, name: 'Ada Lovelace' },
  });

  const completedTask = fixtures.task({
    id: 301,
    title: 'Teklif gönderildi',
    note: null,
    scheduled_time: null,
    customer: null,
    assigned_to: null,
    is_completed: true,
    completed_at: '2026-08-26T09:00:00+00:00',
  });

  // ------------------------------------------------------------ gösterim

  it('görevin başlığını, notunu, tarihini ve saatini gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...session, '/tasks/300': () => jsonResponse(200, { data: openTask }) }),
    );

    renderApp('/app/tasks/300', { token: 'gecerli-token' });

    expect(
      await screen.findByRole('heading', { name: 'Ahmet Yılmaz\'ı ara' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('task-note')).toHaveTextContent('Teklif hakkında geri dönüş');
    expect(screen.getByTestId('task-date')).toHaveTextContent('27.08.2026');
    expect(screen.getByTestId('task-time')).toHaveTextContent('09:00');
  });

  it('müşteriyi, atananı ve oluşturanı gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...session, '/tasks/300': () => jsonResponse(200, { data: openTask }) }),
    );

    renderApp('/app/tasks/300', { token: 'gecerli-token' });

    expect(await screen.findByTestId('task-customer')).toHaveTextContent('Zeynep Kaya');
    expect(screen.getByTestId('task-assignee')).toHaveTextContent('Grace Hopper');
    expect(screen.getByTestId('task-creator')).toHaveTextContent('Ada Lovelace');
  });

  it('eksik alanlarda uydurma değer göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...session, '/tasks/301': () => jsonResponse(200, { data: completedTask }) }),
    );

    renderApp('/app/tasks/301', { token: 'gecerli-token' });

    expect(await screen.findByTestId('task-note')).toHaveTextContent('—');
    expect(screen.getByTestId('task-time')).toHaveTextContent('—');
    expect(screen.getByTestId('task-customer')).toHaveTextContent('—');
    expect(screen.getByTestId('task-assignee')).toHaveTextContent('—');
  });

  /** REGRESYON — DURUM API'DEN OKUNUR, TÜRETİLMEZ. */
  it('tamamlanma durumunu yanıttan alır', async () => {
    const inconsistent = fixtures.task({
      id: 302,
      is_completed: false,
      completed_at: '2026-08-26T09:00:00+00:00',
    });

    vi.stubGlobal(
      'fetch',
      mockApi({ ...session, '/tasks/302': () => jsonResponse(200, { data: inconsistent }) }),
    );

    renderApp('/app/tasks/302', { token: 'gecerli-token' });

    expect(await screen.findByTestId('task-status')).toHaveTextContent('Açık');
  });

  // -------------------------------------------------------------- eylemler

  it('açık görevde tamamla, düzenle ve sil eylemlerini sunar', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...session, '/tasks/300': () => jsonResponse(200, { data: openTask }) }),
    );

    renderApp('/app/tasks/300', { token: 'gecerli-token' });

    expect(await screen.findByTestId('task-status')).toHaveTextContent('Açık');
    expect(screen.getByRole('button', { name: 'Tamamla' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Düzenle' })).toHaveAttribute(
      'href',
      '/app/tasks/300/edit',
    );
    expect(screen.getByRole('button', { name: 'Sil' })).toBeInTheDocument();
  });

  /**
   * Tamamlanmış görevde "Tamamla" GÖSTERİLMEZ: ikinci çağrı 422 alırdı ve
   * kullanıcıya çalışmayan bir düğme göstermek olurdu.
   */
  it('tamamlanmış görevde yeniden aç eylemini sunar', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...session, '/tasks/301': () => jsonResponse(200, { data: completedTask }) }),
    );

    renderApp('/app/tasks/301', { token: 'gecerli-token' });

    expect(await screen.findByTestId('task-status')).toHaveTextContent('Tamamlandı');
    expect(screen.getByRole('button', { name: 'Yeniden aç' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tamamla' })).not.toBeInTheDocument();
  });

  // ----------------------------------------------------------- tamamlama

  it('tamamlama isteğini gövdesiz gönderir', async () => {
    const fetchMock = mockApi({
      ...session,
      '/tasks/300/complete': () =>
        jsonResponse(200, {
          data: { ...openTask, is_completed: true, completed_at: '2026-08-27T10:00:00+00:00' },
        }),
      '/tasks/300': () => jsonResponse(200, { data: openTask }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/tasks/300', { token: 'gecerli-token' });

    await screen.findByTestId('task-status');
    await user.click(screen.getByRole('button', { name: 'Tamamla' }));

    await waitFor(() =>
      expect(screen.getByTestId('task-status')).toHaveTextContent('Tamamlandı'),
    );

    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/complete'));

    // `completed_at` GÖNDERİLMEZ: zamanı sunucu yazar.
    expect((call?.[1] as RequestInit | undefined)?.body).toBeUndefined();
  });

  it('yeniden açma isteğini gövdesiz gönderir', async () => {
    const fetchMock = mockApi({
      ...session,
      '/tasks/301/reopen': () =>
        jsonResponse(200, { data: { ...completedTask, is_completed: false, completed_at: null } }),
      '/tasks/301': () => jsonResponse(200, { data: completedTask }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/tasks/301', { token: 'gecerli-token' });

    await screen.findByTestId('task-status');
    await user.click(screen.getByRole('button', { name: 'Yeniden aç' }));

    await waitFor(() => expect(screen.getByTestId('task-status')).toHaveTextContent('Açık'));

    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/reopen'));
    expect((call?.[1] as RequestInit | undefined)?.body).toBeUndefined();
  });

  /**
   * REGRESYON — İKİNCİ TAMAMLAMA BAŞARI GİBİ GÖSTERİLMEZ.
   *
   * Görev başka bir oturumda tamamlanmışsa backend 422 +
   * `task_already_completed` döner. Backend'in metni gösterilir.
   */
  it('zaten tamamlanmış görevde backendin açıklamasını gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/tasks/300/complete': () =>
          jsonResponse(422, {
            message: 'Bu görev zaten tamamlanmış.',
            code: 'task_already_completed',
          }),
        '/tasks/300': () => jsonResponse(200, { data: openTask }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/tasks/300', { token: 'gecerli-token' });

    await screen.findByTestId('task-status');
    await user.click(screen.getByRole('button', { name: 'Tamamla' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Bu görev zaten tamamlanmış.');
    // Durum sessizce değişmemeli.
    expect(screen.getByTestId('task-status')).toHaveTextContent('Açık');
  });

  it('zaten açık görevde yeniden açma hatasını gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/tasks/301/reopen': () =>
          jsonResponse(422, { message: 'Bu görev zaten açık.', code: 'task_not_completed' }),
        '/tasks/301': () => jsonResponse(200, { data: completedTask }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/tasks/301', { token: 'gecerli-token' });

    await screen.findByTestId('task-status');
    await user.click(screen.getByRole('button', { name: 'Yeniden aç' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Bu görev zaten açık.');
  });

  // --------------------------------------------------------------- silme

  it('silme onay ister ve onaysız istek göndermez', async () => {
    const fetchMock = mockApi({
      ...session,
      '/tasks/300': () => jsonResponse(200, { data: openTask }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/tasks/300', { token: 'gecerli-token' });

    await screen.findByTestId('task-status');
    await user.click(screen.getByRole('button', { name: 'Sil' }));

    // Onay metni görevin başlığını taşımalı: yanlış kaydı silmek geri
    // alınamaz.
    expect(await screen.findByTestId('task-delete-confirm')).toHaveTextContent(
      /Ahmet Yılmaz'ı ara/,
    );

    const deletes = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'DELETE',
    );
    expect(deletes).toHaveLength(0);
  });

  it('vazgeçilirse silme isteği göndermez', async () => {
    const fetchMock = mockApi({
      ...session,
      '/tasks/300': () => jsonResponse(200, { data: openTask }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/tasks/300', { token: 'gecerli-token' });

    await screen.findByTestId('task-status');
    await user.click(screen.getByRole('button', { name: 'Sil' }));

    const confirm = await screen.findByTestId('task-delete-confirm');
    await user.click(within(confirm).getByRole('button', { name: 'Vazgeç' }));

    await waitFor(() =>
      expect(screen.queryByTestId('task-delete-confirm')).not.toBeInTheDocument(),
    );

    const deletes = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'DELETE',
    );
    expect(deletes).toHaveLength(0);
  });

  it('onaylanınca siler ve listeye döner', async () => {
    const fetchMock = mockApi({
      ...session,
      '/tasks/300': (init) =>
        init?.method === 'DELETE'
          ? new Response(null, { status: 204 })
          : jsonResponse(200, { data: openTask }),
      '/tasks': () => jsonResponse(200, fixtures.paginated([], 0)),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/tasks/300', { token: 'gecerli-token' });

    await screen.findByTestId('task-status');
    await user.click(screen.getByRole('button', { name: 'Sil' }));
    await user.click(await screen.findByRole('button', { name: 'Evet, sil' }));

    expect(await screen.findByText('Henüz görev yok.')).toBeInTheDocument();

    const deletes = fetchMock.mock.calls.filter(
      ([url, init]) =>
        (init as RequestInit | undefined)?.method === 'DELETE' && String(url).endsWith('/tasks/300'),
    );
    expect(deletes).toHaveLength(1);
  });

  // ---------------------------------------------------------------- hata

  it('bilinmeyen görevde bulunamadı der, yetki hatası demez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...session, '/tasks/999': () => jsonResponse(404, { message: 'Kayıt bulunamadı.' }) }),
    );

    renderApp('/app/tasks/999', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Görev bulunamadı.');
    expect(alert.textContent).not.toMatch(/yetki|erişim reddedildi/i);

    expect(screen.getByRole('link', { name: 'Görevlere dön' })).toHaveAttribute(
      'href',
      '/app/tasks',
    );
  });

  it('sunucu hatasında ham metni göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...session, '/tasks/300': () => jsonResponse(500, { message: 'Server Error' }) }),
    );

    renderApp('/app/tasks/300', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Beklenmedik bir hata oluştu.');
    expect(alert.textContent).not.toContain('Server Error');
  });

  it('401 durumunda oturumu kapatır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...session, '/tasks/300': () => jsonResponse(401, { message: 'Unauthenticated.' }) }),
    );

    renderApp('/app/tasks/300', { token: 'artik-gecersiz' });

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
    await waitFor(() => expect(tokenStorage.get()).toBeNull());
  });

  it('listeye dönüş bağlantısı verir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...session, '/tasks/300': () => jsonResponse(200, { data: openTask }) }),
    );

    renderApp('/app/tasks/300', { token: 'gecerli-token' });

    expect(await screen.findByRole('link', { name: 'Görevlere dön' })).toHaveAttribute(
      'href',
      '/app/tasks',
    );
  });
});
