import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';
import { tokenStorage } from '@/lib/auth/tokenStorage';

/**
 * Görev listesi.
 *
 * Backend sözleşmesi (TaskController::index):
 *   GET /tasks?page=N&date=Y-m-d → { data, links, meta }
 *   sıralama: scheduled_time ASC NULLS LAST, id ASC — SABİT.
 *
 * SIRA FRONTEND'DE YENİDEN YAPILMAZ. Backend saatsiz işleri günün SONUNA
 * koyuyor; arayüz yeniden sıralasaydı "bir ara yapılacak" bir iş 09:00
 * randevusunun önüne geçerdi.
 *
 * GÖREVLER ŞİRKET GENELİDİR: finans ve ödemeden farklı olarak owner-only
 * değil. Bu yüzden burada "yalnızca şirket sahiplerine açıktır" metni
 * YOKTUR — 403 yalnızca "aktif şirket yok ya da üyelik iptal" demektir.
 *
 * SİLME BU EKRANDA YOK: silme ayrıntı ekranından, onaylı yapılır.
 */
describe('TaskListPage', () => {
  const session = {
    '/me': () => jsonResponse(200, { data: fixtures.user() }),
    '/companies': () =>
      jsonResponse(200, { data: [fixtures.company()], meta: { active_company_id: 7 } }),
  };

  const timed = fixtures.task({
    id: 301,
    title: 'Müşteri görüşmesi',
    scheduled_date: '2026-08-27',
    scheduled_time: '09:00',
    customer: { id: 501, customer_no: 12, name: 'Zeynep Kaya' },
  });

  const untimed = fixtures.task({
    id: 302,
    title: 'Bir ara yapılacak',
    scheduled_date: '2026-08-27',
    scheduled_time: null,
    customer: null,
  });

  const done = fixtures.task({
    id: 303,
    title: 'Teklif gönderildi',
    scheduled_date: '2026-08-26',
    scheduled_time: '11:30',
    is_completed: true,
    completed_at: '2026-08-26T09:00:00+00:00',
  });

  const threeTasks = [timed, untimed, done];

  // ------------------------------------------------------------- liste

  it('görevleri başlık, tarih ve müşteriyle listeler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...session, '/tasks': () => jsonResponse(200, fixtures.paginated(threeTasks, 3)) }),
    );

    renderApp('/app/tasks', { token: 'gecerli-token' });

    const list = await screen.findByRole('list', { name: 'Görevler' });

    expect(within(list).getByText('Müşteri görüşmesi')).toBeInTheDocument();
    expect(within(list).getByText('Zeynep Kaya')).toBeInTheDocument();
    // Tarih uygulamanın geri kalanıyla aynı biçimde: GG.AA.YYYY.
    expect(within(list).getAllByText('27.08.2026').length).toBeGreaterThan(0);
    expect(list.textContent).not.toContain('2026-08-27');
  });

  /**
   * TARİH HER SATIRDA DURUR.
   *
   * Liste `?date=` filtresi olmadan TÜM görevleri gösteriyor; dolayısıyla
   * bir satırın hangi güne ait olduğu ancak satırın kendisinde
   * görülebilir. Tek bir gün gösterilseydi başlıkta bir kez yazmak
   * yeterdi.
   */
  it('farklı günlere ait görevlerin tarihlerini ayrı ayrı gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...session, '/tasks': () => jsonResponse(200, fixtures.paginated([timed, done], 2)) }),
    );

    renderApp('/app/tasks', { token: 'gecerli-token' });

    await screen.findByRole('list', { name: 'Görevler' });

    expect(within(screen.getByTestId('task-row-301')).getByText('27.08.2026')).toBeInTheDocument();
    expect(within(screen.getByTestId('task-row-303')).getByText('26.08.2026')).toBeInTheDocument();
  });

  it('atanan kişiyi gösterir', async () => {
    const assigned = fixtures.task({
      id: 305,
      title: 'Devredilen iş',
      assigned_to: { id: 22, name: 'Grace Hopper' },
    });

    vi.stubGlobal(
      'fetch',
      mockApi({ ...session, '/tasks': () => jsonResponse(200, fixtures.paginated([assigned], 1)) }),
    );

    renderApp('/app/tasks', { token: 'gecerli-token' });

    const row = await screen.findByTestId('task-row-305');

    expect(within(row).getByTestId('task-row-assignee')).toHaveTextContent('Grace Hopper');
  });

  /**
   * `meta.total` GERÇEK BACKEND VERİSİDİR.
   *
   * Listenin bağlamını açıklayan küçük bir bilgi; KPI kartı değil.
   * Sayfada 15 kayıt görünürken toplamın 52 olduğunu bilmek, kullanıcının
   * sayfalamaya bakmadan da nerede olduğunu anlamasını sağlar.
   */
  it('toplam görev sayısını backend meta bilgisinden gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/tasks': () => jsonResponse(200, fixtures.paginated(threeTasks, 52)),
      }),
    );

    renderApp('/app/tasks', { token: 'gecerli-token' });

    expect(await screen.findByTestId('tasks-total')).toHaveTextContent('52 görev');
  });

  /** REGRESYON — SAAT BACKEND'DEN GELİR, UYDURULMAZ. */
  it('saati olan görevde saati gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...session, '/tasks': () => jsonResponse(200, fixtures.paginated([timed], 1)) }),
    );

    renderApp('/app/tasks', { token: 'gecerli-token' });

    const row = await screen.findByTestId('task-row-301');

    expect(within(row).getByText('09:00')).toBeInTheDocument();
  });

  it('saati olmayan görevde saat uydurmaz', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...session, '/tasks': () => jsonResponse(200, fixtures.paginated([untimed], 1)) }),
    );

    renderApp('/app/tasks', { token: 'gecerli-token' });

    const row = await screen.findByTestId('task-row-302');

    expect(within(row).queryByText(/\d{2}:\d{2}/)).not.toBeInTheDocument();
  });

  /**
   * REGRESYON — SIRA API'DEN GELDİĞİ GİBİ KORUNUR.
   *
   * Yanıt bilerek "saatsiz önce" sırasıyla veriliyor. Arayüz yeniden
   * sıralasaydı bu test kırılırdı.
   */
  it('görev sırasını değiştirmez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/tasks': () => jsonResponse(200, fixtures.paginated([untimed, timed, done], 3)),
      }),
    );

    renderApp('/app/tasks', { token: 'gecerli-token' });

    await screen.findByRole('list', { name: 'Görevler' });

    const ids = screen.getAllByTestId(/^task-row-\d+$/).map((node) => node.dataset.testid);

    expect(ids).toEqual(['task-row-302', 'task-row-301', 'task-row-303']);
  });

  /** REGRESYON — DURUM API'DEN OKUNUR, TÜRETİLMEZ. */
  it('tamamlanma durumunu yanıttan alır', async () => {
    const inconsistent = fixtures.task({
      id: 304,
      is_completed: false,
      completed_at: '2026-08-26T09:00:00+00:00',
    });

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/tasks': () => jsonResponse(200, fixtures.paginated([done, inconsistent], 2)),
      }),
    );

    renderApp('/app/tasks', { token: 'gecerli-token' });

    expect(await screen.findByTestId('task-row-303')).toHaveAttribute('data-completed', 'true');
    // completed_at dolu ama is_completed false: yanıta uyulur.
    expect(screen.getByTestId('task-row-304')).toHaveAttribute('data-completed', 'false');
  });

  /**
   * BAŞLIĞIN KENDİSİ BAĞLANTIDIR.
   *
   * Ayrı bir "Ayrıntılar" düğmesi, her satıra ikinci bir çağrı ekliyordu:
   * kullanıcı zaten okuduğu başlığa tıklamak isterken gözünü satırın
   * sonuna götürmek zorunda kalıyordu. Dashboard'daki desen de bu.
   */
  it('görev başlığından ayrıntıya bağlantı verir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...session, '/tasks': () => jsonResponse(200, fixtures.paginated([timed], 1)) }),
    );

    renderApp('/app/tasks', { token: 'gecerli-token' });

    const row = await screen.findByTestId('task-row-301');

    expect(within(row).getByRole('link', { name: 'Müşteri görüşmesi' })).toHaveAttribute(
      'href',
      '/app/tasks/301',
    );
  });

  /** Aynı satırda ikinci bir çağrı bulunmaz. */
  it('satırda ikinci bir eylem bağlantısı sunmaz', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...session, '/tasks': () => jsonResponse(200, fixtures.paginated([timed], 1)) }),
    );

    renderApp('/app/tasks', { token: 'gecerli-token' });

    const row = await screen.findByTestId('task-row-301');

    expect(within(row).getAllByRole('link')).toHaveLength(1);
    expect(within(row).queryByRole('link', { name: 'Ayrıntılar' })).not.toBeInTheDocument();
  });

  it('yeni görev bağlantısı sunar', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...session, '/tasks': () => jsonResponse(200, fixtures.paginated(threeTasks, 3)) }),
    );

    renderApp('/app/tasks', { token: 'gecerli-token' });

    expect(await screen.findByRole('link', { name: 'Yeni görev' })).toHaveAttribute(
      'href',
      '/app/tasks/new',
    );
  });

  /**
   * MÜŞTERİ VE ATANAN YOKSA HİÇ YAZILMAZ.
   *
   * Tabloda her satırın her hücresi dolmak zorundaydı ve boş hücreler
   * "—" ile doldurulurdu. Listede böyle bir zorunluluk yok: olmayan bilgi
   * yer kaplamaz. Uydurma değer de üretilmez — sadece satır sessiz kalır.
   */
  it('müşterisi ve atananı olmayan görevde uydurma değer göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...session, '/tasks': () => jsonResponse(200, fixtures.paginated([untimed], 1)) }),
    );

    renderApp('/app/tasks', { token: 'gecerli-token' });

    const row = await screen.findByTestId('task-row-302');

    expect(within(row).queryByTestId('task-row-customer')).not.toBeInTheDocument();
    expect(within(row).queryByTestId('task-row-assignee')).not.toBeInTheDocument();

    // Başlık ve tarih yerinde: eksik olan yalnızca olmayan bilgi.
    expect(within(row).getByText('Bir ara yapılacak')).toBeInTheDocument();
  });

  /**
   * SAAT KOLONU HER SATIRDA DURUR.
   *
   * Müşteri/atanan gibi satır içine karışmıyor; solda sabit bir sütunda.
   * Saatsiz bir görevde boş bırakılsaydı satırlar birbirine göre kayar ve
   * göz saatleri dikey olarak takip edemezdi. "—" bir SAAT DEĞİL, saatin
   * yokluğunun işareti.
   */
  it('saati olmayan görevde saat sütununu boşluk işaretiyle hizalar', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...session, '/tasks': () => jsonResponse(200, fixtures.paginated([untimed], 1)) }),
    );

    renderApp('/app/tasks', { token: 'gecerli-token' });

    const row = await screen.findByTestId('task-row-302');

    expect(within(row).getByTestId('task-row-time')).toHaveTextContent('—');
  });

  // -------------------------------------------------------- boş / bekleme

  it('hiç görev yokken boş durum gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...session, '/tasks': () => jsonResponse(200, fixtures.paginated([], 0)) }),
    );

    renderApp('/app/tasks', { token: 'gecerli-token' });

    expect(await screen.findByText('Henüz görev yok.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Görevler' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Yeni görev' })).toBeInTheDocument();
  });

  it('yüklenirken bekleme durumu gösterir, veri gelince kaldırır', async () => {
    const deferred: { resolve?: (response: Response) => void } = {};

    const pendingTasks = new Promise<Response>((resolve) => {
      deferred.resolve = resolve;
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith('/me')) return jsonResponse(200, { data: fixtures.user() });
        if (url.includes('/companies')) {
          return jsonResponse(200, {
            data: [fixtures.company()],
            meta: { active_company_id: 7 },
          });
        }
        if (url.includes('/tasks')) return pendingTasks;

        return jsonResponse(404, { message: 'Taklit edilmemiş uç' });
      }),
    );

    renderApp('/app/tasks', { token: 'gecerli-token' });

    expect(await screen.findByTestId('tasks-loading')).toBeInTheDocument();

    deferred.resolve?.(jsonResponse(200, fixtures.paginated(threeTasks, 3)));

    await screen.findByRole('list', { name: 'Görevler' });
    expect(screen.queryByTestId('tasks-loading')).not.toBeInTheDocument();
  });

  // --------------------------------------------------------------- hata

  it('sunucu hatasında ham metni göstermez ve tekrar deneme sunar', async () => {
    let attempt = 0;

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/tasks': () => {
          attempt += 1;
          return attempt === 1
            ? jsonResponse(500, { message: 'Server Error' })
            : jsonResponse(200, fixtures.paginated(threeTasks, 3));
        },
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/tasks', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Beklenmedik bir hata oluştu.');
    expect(alert.textContent).not.toContain('Server Error');

    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }));

    expect(await screen.findByRole('list', { name: 'Görevler' })).toBeInTheDocument();
  });

  /**
   * REGRESYON — 403 ROL KISITI GİBİ GÖSTERİLMEZ.
   *
   * Görevler şirket genelidir; owner-only değil. 403 yalnızca "aktif
   * şirket yok ya da üyelik iptal edilmiş" demektir.
   */
  it('403 durumunu rol yetkisi gibi göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/tasks': () =>
          jsonResponse(403, {
            message: 'Aktif şirket bulunamadı ya da doğrulanamadı. Erişim reddedildi.',
            code: 'company_context_unavailable',
          }),
      }),
    );

    renderApp('/app/tasks', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Erişim reddedildi.');
    expect(alert.textContent).not.toMatch(/şirket sahiplerine|rol/i);
  });

  it('401 durumunda oturumu kapatır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...session, '/tasks': () => jsonResponse(401, { message: 'Unauthenticated.' }) }),
    );

    renderApp('/app/tasks', { token: 'artik-gecersiz' });

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
    await waitFor(() => expect(tokenStorage.get()).toBeNull());
  });

  // ---------------------------------------------------------- sayfalama

  it('ilk sayfayı page=1 ile ister ve per_page dayatmaz', async () => {
    const fetchMock = mockApi({
      ...session,
      '/tasks': () => jsonResponse(200, fixtures.paginated(threeTasks, 3)),
    });

    vi.stubGlobal('fetch', fetchMock);
    renderApp('/app/tasks', { token: 'gecerli-token' });

    await screen.findByRole('list', { name: 'Görevler' });

    const listCall = fetchMock.mock.calls
      .map(([url]) => String(url))
      .find((url) => url.includes('/tasks?'));

    expect(listCall).toContain('page=1');
    expect(listCall).not.toContain('per_page');
  });

  it('tek sayfa varsa sayfalama göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/tasks': () => jsonResponse(200, fixtures.paginated(threeTasks, 3, { lastPage: 1 })),
      }),
    );

    renderApp('/app/tasks', { token: 'gecerli-token' });

    await screen.findByRole('list', { name: 'Görevler' });

    expect(screen.queryByRole('navigation', { name: 'Sayfalama' })).not.toBeInTheDocument();
  });

  it('sonraki sayfaya geçince page=2 ister ve o sayfanın içeriğini gösterir', async () => {
    const secondPage = [fixtures.task({ id: 350, title: 'İkinci sayfa görevi' })];

    const fetchMock = mockApi({
      ...session,
      '/tasks': (_init, url) => {
        const page = new URL(url ?? '', 'http://test.local').searchParams.get('page') ?? '1';

        return jsonResponse(
          200,
          fixtures.paginated(page === '2' ? secondPage : threeTasks, 52, {
            currentPage: Number(page),
            lastPage: 4,
            perPage: 15,
          }),
        );
      },
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/tasks', { token: 'gecerli-token' });

    const pager = await screen.findByRole('navigation', { name: 'Sayfalama' });
    expect(pager).toHaveTextContent('Sayfa 1 / 4');

    await user.click(within(pager).getByRole('button', { name: 'Sonraki' }));

    expect(await screen.findByTestId('task-row-350')).toBeInTheDocument();
    expect(screen.queryByTestId('task-row-301')).not.toBeInTheDocument();
  });

  it('son sayfada sonraki düğmesi kapalıdır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/tasks': () =>
          jsonResponse(
            200,
            fixtures.paginated(threeTasks, 52, { currentPage: 4, lastPage: 4, perPage: 15 }),
          ),
      }),
    );

    renderApp('/app/tasks', { token: 'gecerli-token' });

    const pager = await screen.findByRole('navigation', { name: 'Sayfalama' });

    expect(within(pager).getByRole('button', { name: 'Sonraki' })).toBeDisabled();
    expect(within(pager).getByRole('button', { name: 'Önceki' })).toBeEnabled();
  });

  // -------------------------------------------------------------- sınır

  /** Silme ayrıntı ekranından, onaylı yapılır. */
  it('listede silme eylemi sunmaz', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...session, '/tasks': () => jsonResponse(200, fixtures.paginated(threeTasks, 3)) }),
    );

    renderApp('/app/tasks', { token: 'gecerli-token' });

    await screen.findByRole('list', { name: 'Görevler' });

    expect(screen.queryByRole('button', { name: 'Sil' })).not.toBeInTheDocument();
  });
});
