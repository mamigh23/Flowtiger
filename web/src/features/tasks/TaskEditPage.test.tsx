import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bodyOf, fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';

/**
 * Görev düzenleme.
 *
 * Backend sözleşmesi (TaskRequest — store ile AYNI kurallar):
 *   PUT /tasks/{id} → 200 { data: Task }
 *
 * UÇ PUT'TUR, PATCH DEĞİL: gövde görevin TAM hâlini taşır. Kullanıcı
 * yalnızca başlığı düzeltse bile müşteri, atanan ve saat gövdede gider —
 * yoksa dokunulmayan alanlar sessizce silinirdi (müşteri düzenlemedeki
 * `phone` kararının aynısı).
 *
 * `is_completed` BU FORMUN ALANI DEĞİL. Tamamlama ayrı bir uçtan, sunucu
 * saatiyle yapılır. Forma bir onay kutusu koymak, istemcinin bir işin ne
 * zaman bitirildiğini seçebilmesi demek olurdu.
 */
describe('TaskEditPage', () => {
  const session = {
    '/me': () => jsonResponse(200, { data: fixtures.user() }),
    '/companies': () =>
      jsonResponse(200, { data: [fixtures.company()], meta: { active_company_id: 7 } }),
  };

  const customers = [
    fixtures.customer({ id: 501, customer_no: 12, name: 'Zeynep Kaya' }),
    fixtures.customer({ id: 502, customer_no: 13, name: 'Mert Demir' }),
  ];

  const members = [
    fixtures.member({ id: 21, name: 'Ada Lovelace' }),
    fixtures.member({ id: 22, name: 'Grace Hopper' }),
  ];

  const pickerRoutes = {
    '/customers': () => jsonResponse(200, fixtures.paginated(customers, 2)),
    '/members': () => jsonResponse(200, fixtures.paginated(members, 2)),
  };

  const task = fixtures.task({
    id: 300,
    title: 'Ahmet Yılmaz\'ı ara',
    note: 'Teklif hakkında geri dönüş',
    scheduled_date: '2026-08-27',
    scheduled_time: '09:00',
    customer: { id: 501, customer_no: 12, name: 'Zeynep Kaya' },
    assigned_to: { id: 22, name: 'Grace Hopper' },
  });

  const routes = {
    ...session,
    ...pickerRoutes,
    '/tasks/300': () => jsonResponse(200, { data: task }),
  };

  function putBody(fetchMock: ReturnType<typeof mockApi>): Record<string, unknown> | undefined {
    const put = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PUT',
    );
    return bodyOf(put?.[1] as RequestInit | undefined) as Record<string, unknown> | undefined;
  }

  // ------------------------------------------------------------ doldurma

  it('mevcut değerleri forma doldurur', async () => {
    vi.stubGlobal('fetch', mockApi(routes));

    renderApp('/app/tasks/300/edit', { token: 'gecerli-token' });

    expect(await screen.findByRole('heading', { name: 'Görevi düzenle' })).toBeInTheDocument();
    expect(screen.getByLabelText('Başlık')).toHaveValue('Ahmet Yılmaz\'ı ara');
    expect(screen.getByLabelText('Not')).toHaveValue('Teklif hakkında geri dönüş');
    expect(screen.getByLabelText('Tarih')).toHaveValue('2026-08-27');
    expect(screen.getByLabelText('Saat')).toHaveValue('09:00');
  });

  it('mevcut müşteri ve atananı seçili getirir', async () => {
    vi.stubGlobal('fetch', mockApi(routes));

    renderApp('/app/tasks/300/edit', { token: 'gecerli-token' });

    await waitFor(() => expect(screen.getByLabelText('Müşteri')).toHaveValue('501'));
    expect(screen.getByLabelText('Atanan kişi')).toHaveValue('22');
  });

  it('tamamlanma alanı sunmaz', async () => {
    vi.stubGlobal('fetch', mockApi(routes));

    renderApp('/app/tasks/300/edit', { token: 'gecerli-token' });

    await screen.findByLabelText('Başlık');

    expect(screen.queryByLabelText(/tamamland/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  // --------------------------------------------------------------- gövde

  /**
   * REGRESYON — PUT TAM DEĞİŞTİRMEDİR.
   *
   * Kullanıcı yalnızca başlığı düzeltiyor; gövde yine görevin tamamını
   * taşıyor. Dokunulmayan bir alan gövdeden düşerse backend onu null
   * yazar ve veri sessizce kaybolur.
   */
  it('dokunulmayan alanları da gövdede gönderir', async () => {
    const fetchMock = mockApi(routes);

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/tasks/300/edit', { token: 'gecerli-token' });

    await waitFor(() => expect(screen.getByLabelText('Müşteri')).toHaveValue('501'));

    const title = screen.getByLabelText('Başlık');
    await user.clear(title);
    await user.type(title, 'Ahmet Yılmaz\'ı tekrar ara');

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() =>
      expect(putBody(fetchMock)).toEqual({
        title: 'Ahmet Yılmaz\'ı tekrar ara',
        note: 'Teklif hakkında geri dönüş',
        scheduled_date: '2026-08-27',
        scheduled_time: '09:00',
        customer_id: 501,
        assigned_to: 22,
      }),
    );
  });

  it('gövdede yalnızca sözleşmedeki alanları gönderir', async () => {
    const fetchMock = mockApi(routes);

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/tasks/300/edit', { token: 'gecerli-token' });

    await screen.findByLabelText('Başlık');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(putBody(fetchMock)).toBeDefined());

    expect(Object.keys(putBody(fetchMock)!).sort()).toEqual([
      'assigned_to',
      'customer_id',
      'note',
      'scheduled_date',
      'scheduled_time',
      'title',
    ]);
  });

  it('yasaklı alanları göndermez', async () => {
    const fetchMock = mockApi(routes);

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/tasks/300/edit', { token: 'gecerli-token' });

    await screen.findByLabelText('Başlık');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(putBody(fetchMock)).toBeDefined());

    const body = putBody(fetchMock)!;
    expect(body).not.toHaveProperty('company_id');
    expect(body).not.toHaveProperty('created_by');
    expect(body).not.toHaveProperty('completed_at');
    expect(body).not.toHaveProperty('is_completed');
  });

  it('saat silinirse null gönderir', async () => {
    const fetchMock = mockApi(routes);

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/tasks/300/edit', { token: 'gecerli-token' });

    fireEvent.change(await screen.findByLabelText('Saat'), { target: { value: '' } });
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => {
      const body = putBody(fetchMock)!;
      expect(body.scheduled_time).toBeNull();
      // Alan gövdede BULUNMALI; eksik olması null göndermekle aynı değil.
      expect(Object.keys(body)).toContain('scheduled_time');
    });
  });

  it('müşteri ve atanan kaldırılırsa null gönderir', async () => {
    const fetchMock = mockApi(routes);

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/tasks/300/edit', { token: 'gecerli-token' });

    await waitFor(() => expect(screen.getByLabelText('Müşteri')).toHaveValue('501'));

    await user.selectOptions(screen.getByLabelText('Müşteri'), '');
    await user.selectOptions(screen.getByLabelText('Atanan kişi'), '');

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() =>
      expect(putBody(fetchMock)).toMatchObject({ customer_id: null, assigned_to: null }),
    );
  });

  /**
   * REGRESYON — DÜZENLEME TAMAMLANMA DURUMUNU BOZMAZ.
   *
   * Tamamlanmış bir görevin notunu düzeltmek onu yeniden açmamalı;
   * tamamlanma yalnızca kendi ucundan değişir (backend de böyle davranıyor).
   */
  it('tamamlanmış görevi düzenlemek onu yeniden açmaz', async () => {
    const completed = fixtures.task({
      id: 301,
      title: 'Teklif gönderildi',
      is_completed: true,
      completed_at: '2026-08-26T09:00:00+00:00',
    });

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        ...pickerRoutes,
        '/tasks/301': (init) =>
          init?.method === 'PUT'
            ? jsonResponse(200, { data: { ...completed, title: 'Düzeltilmiş' } })
            : jsonResponse(200, { data: { ...completed, title: 'Düzeltilmiş' } }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/tasks/301/edit', { token: 'gecerli-token' });

    await screen.findByLabelText('Başlık');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByTestId('task-status')).toHaveTextContent('Tamamlandı');
  });

  // -------------------------------------------------------------- sonuç

  it('kaydedince ayrıntı ekranına döner', async () => {
    const updated = { ...task, title: 'Güncellenmiş başlık' };

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        ...pickerRoutes,
        '/tasks/300': () => jsonResponse(200, { data: updated }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/tasks/300/edit', { token: 'gecerli-token' });

    await screen.findByLabelText('Başlık');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(
      await screen.findByRole('heading', { name: 'Güncellenmiş başlık' }),
    ).toBeInTheDocument();
  });

  it('vazgeçme bağlantısı ayrıntıya döner', async () => {
    vi.stubGlobal('fetch', mockApi(routes));

    renderApp('/app/tasks/300/edit', { token: 'gecerli-token' });

    expect(await screen.findByRole('link', { name: 'Vazgeç' })).toHaveAttribute(
      'href',
      '/app/tasks/300',
    );
  });

  // ---------------------------------------------------------- doğrulama

  it('422 alan hatasını alan altında gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        ...pickerRoutes,
        '/tasks/300': (init) =>
          init?.method === 'PUT'
            ? jsonResponse(422, {
                message: 'Gönderilen bilgiler geçersiz.',
                errors: { title: ['Başlık alanı zorunludur.'] },
              })
            : jsonResponse(200, { data: task }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/tasks/300/edit', { token: 'gecerli-token' });

    await user.clear(await screen.findByLabelText('Başlık'));
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Başlık alanı zorunludur.')).toBeInTheDocument();
  });

  it('bilinmeyen görevde bulunamadı der', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        ...pickerRoutes,
        '/tasks/999': () => jsonResponse(404, { message: 'Kayıt bulunamadı.' }),
      }),
    );

    renderApp('/app/tasks/999/edit', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Görev bulunamadı.');
    expect(alert.textContent).not.toMatch(/yetki/i);
  });
});
