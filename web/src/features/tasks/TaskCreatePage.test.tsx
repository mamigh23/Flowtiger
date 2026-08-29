import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bodyOf, fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';

/**
 * Görev oluşturma.
 *
 * Backend sözleşmesi (TaskRequest):
 *   POST /tasks → 201 { data: Task }
 *   gövde: title, note, scheduled_date, scheduled_time, customer_id,
 *          assigned_to
 *
 * SUNUCUNUN YAZDIĞI ALANLAR GÖVDEYE GİRMEZ:
 *   company_id   → aktif context (§9)
 *   created_by   → oturumdaki kullanıcı
 *   completed_at → complete ucu, sunucu saatiyle
 *   is_completed → türetilen sonuç, saklanan alan değil
 * Dördü de backend'de `prohibited`; gönderilirse 422 döner.
 *
 * `scheduled_time` OPSİYONEL DEĞİL, NULLABLE: backend `present` istiyor.
 * Alanın düşmesi ile null gönderilmesi aynı şey değil — PUT tam
 * değiştirme olduğu için "saati kaldır" ancak açık null ile anlatılır.
 */
describe('TaskCreatePage', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  const created = fixtures.task({ id: 300 });

  async function fillRequired(
    user: ReturnType<typeof userEvent.setup>,
    title = 'Ahmet Yılmaz\'ı ara',
  ): Promise<void> {
    await user.type(await screen.findByLabelText('Başlık'), title);
    fireEvent.change(screen.getByLabelText('Tarih'), { target: { value: '2026-08-27' } });
  }

  function postBody(fetchMock: ReturnType<typeof mockApi>): Record<string, unknown> | undefined {
    const post = fetchMock.mock.calls.find(
      ([url, init]) =>
        (init as RequestInit | undefined)?.method === 'POST' && String(url).includes('/tasks'),
    );
    return bodyOf(post?.[1] as RequestInit | undefined) as Record<string, unknown> | undefined;
  }

  // -------------------------------------------------------------- alanlar

  it('görev alanlarını sunar', async () => {
    vi.stubGlobal('fetch', mockApi({ ...session, ...pickerRoutes }));

    renderApp('/app/tasks/new', { token: 'gecerli-token' });

    expect(await screen.findByRole('heading', { name: 'Yeni görev' })).toBeInTheDocument();
    expect(screen.getByLabelText('Başlık')).toBeInTheDocument();
    expect(screen.getByLabelText('Not')).toBeInTheDocument();
    expect(screen.getByLabelText('Tarih')).toBeInTheDocument();
    expect(screen.getByLabelText('Saat')).toBeInTheDocument();
    expect(screen.getByLabelText('Müşteri')).toBeInTheDocument();
    expect(screen.getByLabelText('Atanan kişi')).toBeInTheDocument();
  });

  /**
   * REGRESYON — TAMAMLANMA FORMUN ALANI DEĞİL.
   *
   * Tamamlama ayrı bir uçtan, sunucu saatiyle yapılır. Forma bir onay
   * kutusu koymak, istemcinin bir işin ne zaman bitirildiğini seçebilmesi
   * demek olurdu.
   */
  it('tamamlanma alanı sunmaz', async () => {
    vi.stubGlobal('fetch', mockApi({ ...session, ...pickerRoutes }));

    renderApp('/app/tasks/new', { token: 'gecerli-token' });

    await screen.findByLabelText('Başlık');

    expect(screen.queryByLabelText(/tamamland/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('varsayılan tarihi bugün olarak doldurur', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 7, 27, 9, 0, 0));

    vi.stubGlobal('fetch', mockApi({ ...session, ...pickerRoutes }));

    renderApp('/app/tasks/new', { token: 'gecerli-token' });

    expect(await screen.findByLabelText('Tarih')).toHaveValue('2026-08-27');
  });

  // --------------------------------------------------------------- gövde

  it('gövdede yalnızca sözleşmedeki alanları gönderir', async () => {
    const fetchMock = mockApi({
      ...session,
      ...pickerRoutes,
      '/tasks': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/tasks/new', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)).toBeDefined());

    expect(Object.keys(postBody(fetchMock)!).sort()).toEqual([
      'assigned_to',
      'customer_id',
      'note',
      'scheduled_date',
      'scheduled_time',
      'title',
    ]);
  });

  /** REGRESYON — SUNUCUNUN YAZDIĞI ALANLAR GÖNDERİLMEZ. */
  it('yasaklı alanları göndermez', async () => {
    const fetchMock = mockApi({
      ...session,
      ...pickerRoutes,
      '/tasks': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/tasks/new', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)).toBeDefined());

    const body = postBody(fetchMock)!;
    expect(body).not.toHaveProperty('company_id');
    expect(body).not.toHaveProperty('active_company_id');
    expect(body).not.toHaveProperty('created_by');
    expect(body).not.toHaveProperty('completed_at');
    expect(body).not.toHaveProperty('is_completed');
  });

  it('yazılan başlık, not ve tarihi gönderir', async () => {
    const fetchMock = mockApi({
      ...session,
      ...pickerRoutes,
      '/tasks': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/tasks/new', { token: 'gecerli-token' });

    await fillRequired(user, 'Teklif hazırla');
    await user.type(screen.getByLabelText('Not'), 'ABC için');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() =>
      expect(postBody(fetchMock)).toMatchObject({
        title: 'Teklif hazırla',
        note: 'ABC için',
        scheduled_date: '2026-08-27',
      }),
    );
  });

  it('boş bırakılan notu null gönderir', async () => {
    const fetchMock = mockApi({
      ...session,
      ...pickerRoutes,
      '/tasks': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/tasks/new', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)?.note).toBeNull());
  });

  /**
   * REGRESYON — SAAT ALANI HER ZAMAN GÖVDEDE, BOŞKEN null.
   *
   * Alanın düşmesi ile null gönderilmesi aynı şey değil: backend
   * `present` istiyor ve PUT tam değiştirme olduğu için "saati kaldır"
   * ancak açık null ile anlatılabilir.
   */
  it('saat girilmediğinde alanı null olarak gönderir', async () => {
    const fetchMock = mockApi({
      ...session,
      ...pickerRoutes,
      '/tasks': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/tasks/new', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)).toBeDefined());

    const body = postBody(fetchMock)!;
    expect(body.scheduled_time).toBeNull();
    expect(Object.keys(body)).toContain('scheduled_time');
  });

  it('girilen saati sözleşme biçiminde gönderir', async () => {
    const fetchMock = mockApi({
      ...session,
      ...pickerRoutes,
      '/tasks': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/tasks/new', { token: 'gecerli-token' });

    await fillRequired(user);
    fireEvent.change(screen.getByLabelText('Saat'), { target: { value: '09:00' } });
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)?.scheduled_time).toBe('09:00'));
  });

  // ------------------------------------------------------------ seçiciler

  it('müşteri seçeneklerini yalnızca müşteri ucundan doldurur', async () => {
    vi.stubGlobal('fetch', mockApi({ ...session, ...pickerRoutes }));

    renderApp('/app/tasks/new', { token: 'gecerli-token' });

    const select = await screen.findByLabelText('Müşteri');

    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Zeynep Kaya' })).toBeInTheDocument(),
    );

    // Boş seçenek + iki müşteri.
    expect(select.querySelectorAll('option')).toHaveLength(3);
  });

  it('atanan kişi seçeneklerini yalnızca üye ucundan doldurur', async () => {
    vi.stubGlobal('fetch', mockApi({ ...session, ...pickerRoutes }));

    renderApp('/app/tasks/new', { token: 'gecerli-token' });

    const select = await screen.findByLabelText('Atanan kişi');

    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Grace Hopper' })).toBeInTheDocument(),
    );

    expect(select.querySelectorAll('option')).toHaveLength(3);
  });

  it('seçicileri ucun izin verdiği en büyük sayfayla doldurur', async () => {
    const fetchMock = mockApi({ ...session, ...pickerRoutes });

    vi.stubGlobal('fetch', fetchMock);
    renderApp('/app/tasks/new', { token: 'gecerli-token' });

    await screen.findByLabelText('Atanan kişi');

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([url]) => String(url));

      expect(urls.some((url) => url.includes('/customers?') && url.includes('per_page=100'))).toBe(
        true,
      );
      expect(urls.some((url) => url.includes('/members?') && url.includes('per_page=100'))).toBe(
        true,
      );
    });
  });

  it('seçim yapılmadığında müşteri ve atananı null gönderir', async () => {
    const fetchMock = mockApi({
      ...session,
      ...pickerRoutes,
      '/tasks': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/tasks/new', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)).toBeDefined());

    const body = postBody(fetchMock)!;
    expect(body.customer_id).toBeNull();
    expect(body.assigned_to).toBeNull();
  });

  it('seçilen müşteri ve atananın kimliklerini gönderir', async () => {
    const fetchMock = mockApi({
      ...session,
      ...pickerRoutes,
      '/tasks': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/tasks/new', { token: 'gecerli-token' });

    await fillRequired(user);
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Zeynep Kaya' })).toBeInTheDocument(),
    );

    await user.selectOptions(screen.getByLabelText('Müşteri'), '501');
    await user.selectOptions(screen.getByLabelText('Atanan kişi'), '22');

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() =>
      expect(postBody(fetchMock)).toMatchObject({ customer_id: 501, assigned_to: 22 }),
    );
  });

  // ------------------------------------------------------------ doğrulama

  it('422 alan hatalarını ilgili alanların altında gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        ...pickerRoutes,
        '/tasks': () =>
          jsonResponse(422, {
            message: 'Gönderilen bilgiler geçersiz.',
            errors: {
              title: ['Başlık alanı zorunludur.'],
              scheduled_date: ['Tarih biçimi geçersiz.'],
            },
          }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/tasks/new', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Başlık alanı zorunludur.')).toBeInTheDocument();
    expect(screen.getByText('Tarih biçimi geçersiz.')).toBeInTheDocument();
  });

  it('istek sürerken ikinci gönderimi engeller', async () => {
    const deferred: { resolve?: (response: Response) => void } = {};

    const pendingPost = new Promise<Response>((resolve) => {
      deferred.resolve = resolve;
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/me')) return jsonResponse(200, { data: fixtures.user() });
      if (url.includes('/companies')) {
        return jsonResponse(200, {
          data: [fixtures.company()],
          meta: { active_company_id: 7 },
        });
      }
      if (url.includes('/customers')) return jsonResponse(200, fixtures.paginated(customers, 2));
      if (url.includes('/members')) return jsonResponse(200, fixtures.paginated(members, 2));
      if (init?.method === 'POST') return pendingPost;

      return jsonResponse(404, { message: 'Taklit edilmemiş uç' });
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/tasks/new', { token: 'gecerli-token' });

    await fillRequired(user);

    const submit = screen.getByRole('button', { name: 'Kaydet' });
    await user.click(submit);

    await waitFor(() => expect(submit).toBeDisabled());
    await user.click(submit);

    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);

    // Askıdaki istek çözülür ve SONUCU BEKLENİR: yanıt geldiğinde bileşen
    // gezinir ve form kapanır; beklenmezse bu güncellemeler act() dışında
    // kalır.
    deferred.resolve?.(jsonResponse(201, { data: created }));

    await waitForElementToBeRemoved(submit);
  });

  // ------------------------------------------------------------- sonuçlar

  it('oluşturma sonrası görevin ayrıntısına gider', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        ...pickerRoutes,
        '/tasks/300': () => jsonResponse(200, { data: created }),
        '/tasks': () => jsonResponse(201, { data: created }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/tasks/new', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(
      await screen.findByRole('heading', { name: 'Ahmet Yılmaz\'ı ara' }),
    ).toBeInTheDocument();
  });

  it('vazgeçme bağlantısı listeye döner', async () => {
    vi.stubGlobal('fetch', mockApi({ ...session, ...pickerRoutes }));

    renderApp('/app/tasks/new', { token: 'gecerli-token' });

    expect(await screen.findByRole('link', { name: 'Vazgeç' })).toHaveAttribute(
      'href',
      '/app/tasks',
    );
  });
});
