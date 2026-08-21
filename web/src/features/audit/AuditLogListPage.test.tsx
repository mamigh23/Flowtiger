import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';
import { tokenStorage } from '@/lib/auth/tokenStorage';

/**
 * Denetim kayıtları listesi.
 *
 * BACKEND SÖZLEŞMESİ (AuditLogController::index):
 *   GET /audit-logs?page=N&per_page=M → { data, links, meta }
 *   sıralama created_at DESC, id DESC — SABİT.
 *   per_page dışında query parametresi YOK: arama, filtre, tarih aralığı,
 *   eylem seçimi hiçbiri yok. Arayüz de bunları göstermez; gösterseydi
 *   çalışmayan bir özellik vaat etmiş olurdu.
 *
 * UÇ SALT OKUNURDUR: store/update/destroy yoktur, POST 405 döner. Bu
 * yüzden bu ekranda hiçbir yazma eylemi bulunmaz.
 *
 * ALAN LİSTESİ (AuditLogResource, backend testiyle sabitlenmiş):
 *   id, action, actor?, auditable?, old_values, new_values, metadata,
 *   ip_address, created_at
 * `company_id` yanıtta HİÇ YOKTUR. `actor` yalnızca id+name taşır;
 * e-posta, aktif şirket, doğrulama durumu gibi alanlar backend'de
 * bilinçli olarak dışarıda bırakılmıştır. `user_agent` saklanır ama
 * yanıta konmaz.
 *
 * `actor` ve `auditable` KOŞULLU alanlardır ($this->when): aktörü olmayan
 * bir kayıtta `actor` anahtarı hiç gelmez. Arayüz varsayım yapmaz.
 *
 * "GİRİŞ GEÇMİŞİ" BU EKRANDA YOKTUR: login/logout kayıtlarının company_id
 * değeri NULL'dur ve CompanyScope onları bu uçtan tamamen dışarıda
 * bırakır (backend: test_company_less_system_logs_are_not_visible).
 * Arayüz böyle bir vaatte bulunmaz.
 *
 * 403 Team ve Invitation ile aynı anlamda: uç owner'a özeldir
 * (AuditLogPolicy → Role::viewsAuditLogs()). Ama bu bilgi İSTEMCİDE
 * KARAR VERİLMEZ (playbook §3.1) — istek yapılır, backend 403 dönerse
 * açıklanır.
 */
describe('AuditLogListPage', () => {
  const ownerSession = {
    '/me': () => jsonResponse(200, { data: fixtures.user() }),
    '/companies': () =>
      jsonResponse(200, { data: [fixtures.company()], meta: { active_company_id: 7 } }),
  };

  /** Aktif şirketteki rolü `member` olan oturum. */
  const memberSession = {
    '/me': () => jsonResponse(200, { data: fixtures.user() }),
    '/companies': () =>
      jsonResponse(200, {
        data: [fixtures.company({ role: 'member' })],
        meta: { active_company_id: 7 },
      }),
  };

  const threeLogs = [
    fixtures.auditLog({
      id: 100,
      action: 'customer.created',
      actor: { id: 21, name: 'Ada Lovelace' },
      auditable: { type: 'customer', id: 5 },
      new_values: { name: 'Zeynep Kaya', phone: '05551112233' },
      ip_address: '203.0.113.10',
    }),
    fixtures.auditLog({
      id: 101,
      action: 'member.role_changed',
      actor: { id: 21, name: 'Ada Lovelace' },
      auditable: { type: 'user', id: 22 },
      old_values: { role: 'member' },
      new_values: { role: 'owner' },
      ip_address: '203.0.113.11',
    }),
    fixtures.auditLog({
      id: 102,
      action: 'invitation.created',
      actor: { id: 22, name: 'Mert Demir' },
      auditable: { type: 'invitation', id: 41 },
      metadata: { email_hash: 'a'.repeat(64), role: 'member' },
      ip_address: '203.0.113.12',
    }),
  ];

  // --------------------------------------------------------------- liste

  it('kayıtları eylem, aktör ve IP ile listeler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () => jsonResponse(200, fixtures.paginated(threeLogs, 3)),
      }),
    );

    renderApp('/app/audit', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Denetim kayıtları' });

    expect(within(table).getByText('Müşteri oluşturuldu')).toBeInTheDocument();
    expect(within(table).getByText('Üye rolü değiştirildi')).toBeInTheDocument();
    expect(within(table).getByText('Davet gönderildi')).toBeInTheDocument();

    // Aktör adı gösterilir (kabuktaki hesap menüsüyle karışmasın diye
    // tabloya sınırlandırıldı).
    expect(within(table).getAllByText('Ada Lovelace')).toHaveLength(2);
    expect(within(table).getByText('Mert Demir')).toBeInTheDocument();

    expect(within(table).getByText('203.0.113.10')).toBeInTheDocument();
  });

  /**
   * Tanınmayan kod UYDURULMAZ. Backend enum'a yeni bir değer eklediğinde
   * kullanıcı ham kodu görür; boş bir hücre ya da yanlış bir metin
   * görmez.
   */
  it('tanınmayan eylem kodunu ham hâliyle gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () =>
          jsonResponse(
            200,
            fixtures.paginated([fixtures.auditLog({ id: 200, action: 'warehouse.exported' })], 1),
          ),
      }),
    );

    renderApp('/app/audit', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Denetim kayıtları' });

    expect(within(table).getByText('warehouse.exported')).toBeInTheDocument();
  });

  /**
   * `actor` KOŞULLU bir alandır: user_id null olan kayıtta anahtar hiç
   * gelmez. Boş bırakmak yerine belirsizlik işareti konur; "Sistem" gibi
   * bir metin yazmak, doğrulanmamış bir varsayım olurdu.
   */
  it('aktör alanı gelmeyen kayıtta ad yerine belirsizlik işareti gösterir', async () => {
    const noActor = { ...fixtures.auditLog({ id: 201 }) };
    delete (noActor as Record<string, unknown>).actor;

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () => jsonResponse(200, fixtures.paginated([noActor], 1)),
      }),
    );

    renderApp('/app/audit', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Denetim kayıtları' });

    expect(within(table).getByText('—')).toBeInTheDocument();
  });

  /**
   * REGRESYON — AKTÖR E-POSTASI GÖSTERİLMEZ.
   *
   * Backend `actor` içinde yalnızca id ve name gönderir; e-posta oraya
   * bilinçli olarak konmamıştır. Bu test, yanıt bir gün fazladan alan
   * taşısa bile arayüzün onu ekrana basmayacağını sabitler: arayüz
   * `actor.name` okur, `actor` nesnesini dökmez.
   */
  it('aktörün e-postası yanıtta olsa bile ekrana yazılmaz', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () =>
          jsonResponse(
            200,
            fixtures.paginated(
              [
                fixtures.auditLog({
                  id: 202,
                  actor: { id: 21, name: 'Ada Lovelace', email: 'ada@flowtiger.test' },
                }),
              ],
              1,
            ),
          ),
      }),
    );

    renderApp('/app/audit', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Denetim kayıtları' });

    expect(within(table).getByText('Ada Lovelace')).toBeInTheDocument();
    expect(table.textContent).not.toContain('ada@flowtiger.test');
  });

  /**
   * REGRESYON — company_id GÖSTERİLMEZ.
   *
   * Backend zaten göndermiyor. Yine de sabitleniyor: çok kiracılı bir
   * üründe iç tenant kimliğini ekrana basmak, kullanıcıya hiçbir şey
   * anlatmayan bir iç yapı sızıntısıdır.
   */
  it('company_id yanıtta olsa bile ekrana yazılmaz', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () =>
          jsonResponse(
            200,
            fixtures.paginated([fixtures.auditLog({ id: 203, company_id: 4242 })], 1),
          ),
      }),
    );

    renderApp('/app/audit', { token: 'gecerli-token' });

    await screen.findByRole('table', { name: 'Denetim kayıtları' });

    expect(screen.queryByText('4242')).not.toBeInTheDocument();
    expect(screen.queryByText(/company_id/)).not.toBeInTheDocument();
  });

  it('ip_address boşsa belirsizlik işareti gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () =>
          jsonResponse(
            200,
            fixtures.paginated([fixtures.auditLog({ id: 204, ip_address: null })], 1),
          ),
      }),
    );

    renderApp('/app/audit', { token: 'gecerli-token' });

    const row = await screen.findByTestId('audit-row-204');

    expect(within(row).getByText('—')).toBeInTheDocument();
  });

  /**
   * Tarih okunur biçime çevrilir; ham ISO dizgesi kullanıcıya
   * gösterilmez.
   *
   * Beklenti saat dilimine BAĞIMLI YAZILMAZ: test ortamında TZ sabit
   * değil, sabitleseydik de gerçek kullanıcıda başka bir dilimde
   * çalışacaktı. Sabitlenen şey biçim.
   */
  it('tarihi okunur biçimde gösterir, ham ISO dizgesini değil', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () =>
          jsonResponse(
            200,
            fixtures.paginated(
              [fixtures.auditLog({ id: 205, created_at: '2026-08-16T09:30:00+00:00' })],
              1,
            ),
          ),
      }),
    );

    renderApp('/app/audit', { token: 'gecerli-token' });

    const row = await screen.findByTestId('audit-row-205');

    expect(row.textContent).toMatch(/\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}/);
    expect(row.textContent).not.toContain('2026-08-16T09:30:00+00:00');
  });

  it('created_at boşsa belirsizlik işareti gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () =>
          jsonResponse(
            200,
            fixtures.paginated([fixtures.auditLog({ id: 206, created_at: null })], 1),
          ),
      }),
    );

    renderApp('/app/audit', { token: 'gecerli-token' });

    const row = await screen.findByTestId('audit-row-206');

    expect(within(row).getByText('—')).toBeInTheDocument();
  });

  // ------------------------------------------------------ istek sözleşmesi

  it('ilk sayfayı page=1 ile ister', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      '/audit-logs': () => jsonResponse(200, fixtures.paginated(threeLogs, 3)),
    });

    vi.stubGlobal('fetch', fetchMock);
    renderApp('/app/audit', { token: 'gecerli-token' });

    await screen.findByRole('table', { name: 'Denetim kayıtları' });

    const listCall = fetchMock.mock.calls
      .map(([url]) => String(url))
      .find((url) => url.includes('/audit-logs?'));

    expect(listCall).toContain('page=1');
  });

  /**
   * REGRESYON — UÇTA OLMAYAN PARAMETRE GÖNDERİLMEZ.
   *
   * AuditLogController yalnızca `per_page`'i doğrular; başka bir
   * parametre yok. Uydurma bir parametre göndermek sessizce yok sayılır
   * ve arayüzde "filtreledim" yanılsaması yaratır.
   */
  it('sıralama, arama veya filtre parametresi göndermez', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      '/audit-logs': () => jsonResponse(200, fixtures.paginated(threeLogs, 3)),
    });

    vi.stubGlobal('fetch', fetchMock);
    renderApp('/app/audit', { token: 'gecerli-token' });

    await screen.findByRole('table', { name: 'Denetim kayıtları' });

    const listCall =
      fetchMock.mock.calls.map(([url]) => String(url)).find((url) => url.includes('/audit-logs?')) ??
      '';

    expect(listCall).not.toContain('sort');
    expect(listCall).not.toContain('search');
    expect(listCall).not.toContain('filter');
    expect(listCall).not.toContain('action=');
    expect(listCall).not.toContain('from=');
  });

  /** Arayüzde de bu denetimler bulunmaz. */
  it('arama, filtre ve sıralama denetimi göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () => jsonResponse(200, fixtures.paginated(threeLogs, 3)),
      }),
    );

    renderApp('/app/audit', { token: 'gecerli-token' });

    await screen.findByRole('table', { name: 'Denetim kayıtları' });

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /sırala/i })).not.toBeInTheDocument();
  });

  /**
   * SALT OKUNUR UÇ: bu ekranda silme, düzenleme ya da dışa aktarma
   * eylemi yoktur. Backend POST'a 405 döner.
   */
  it('hiçbir yazma eylemi sunmaz', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () => jsonResponse(200, fixtures.paginated(threeLogs, 3)),
      }),
    );

    renderApp('/app/audit', { token: 'gecerli-token' });

    await screen.findByRole('table', { name: 'Denetim kayıtları' });

    expect(screen.queryByRole('button', { name: /sil/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /düzenle/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /yeni/i })).not.toBeInTheDocument();
  });

  // ------------------------------------------------- yükleme / boş / hata

  /**
   * Yanıt bilerek askıda tutulur: anında çözülen bir yanıtta React,
   * yükleme karesini hiç DOM'a yazmadan sonuca geçebilir.
   */
  it('yüklenirken bekleme durumu gösterir, veri gelince kaldırır', async () => {
    const deferred: { resolve?: (response: Response) => void } = {};

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
        if (url.includes('/audit-logs')) {
          return new Promise<Response>((resolve) => {
            deferred.resolve = resolve;
          });
        }

        return jsonResponse(404, { message: 'Taklit edilmemiş uç' });
      }),
    );

    renderApp('/app/audit', { token: 'gecerli-token' });

    expect(await screen.findByTestId('audit-loading')).toBeInTheDocument();

    deferred.resolve?.(jsonResponse(200, fixtures.paginated(threeLogs, 3)));

    await screen.findByRole('table', { name: 'Denetim kayıtları' });
    expect(screen.queryByTestId('audit-loading')).not.toBeInTheDocument();
  });

  it('hiç kayıt yokken boş durum gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () => jsonResponse(200, fixtures.paginated([], 0)),
      }),
    );

    renderApp('/app/audit', { token: 'gecerli-token' });

    expect(await screen.findByText('Henüz denetim kaydı yok.')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Denetim kayıtları' })).not.toBeInTheDocument();
  });

  it('sunucu hatasında hata durumu ve tekrar deneme sunar', async () => {
    let attempt = 0;

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () => {
          attempt += 1;
          return attempt === 1
            ? jsonResponse(500, { message: 'Server Error' })
            : jsonResponse(200, fixtures.paginated(threeLogs, 3));
        },
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/audit', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Beklenmedik bir hata oluştu.');
    // Ham sunucu metni kullanıcıya gösterilmez.
    expect(alert.textContent).not.toContain('Server Error');

    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }));

    const table = await screen.findByRole('table', { name: 'Denetim kayıtları' });
    expect(within(table).getByText('Müşteri oluşturuldu')).toBeInTheDocument();
  });

  it('403 durumunda bölümün sahiplere açık olduğunu söyler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...memberSession,
        '/audit-logs': () => jsonResponse(403, { message: 'This action is unauthorized.' }),
      }),
    );

    renderApp('/app/audit', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Bu bölüm yalnızca şirket sahiplerine açıktır.');
    expect(alert.textContent).not.toContain('This action is unauthorized.');
  });

  /**
   * İSTEMCİDE YETKİ KARARI YOK: rol `member` olsa bile istek yapılır.
   * Rolüne bakıp isteği engellemek, backend'in yetki kararını istemcide
   * yeniden uygulamak olurdu (playbook §3.1).
   */
  it('rol member olsa bile isteği yapar, istemcide engellemez', async () => {
    const fetchMock = mockApi({
      ...memberSession,
      '/audit-logs': () => jsonResponse(403, { message: 'This action is unauthorized.' }),
    });

    vi.stubGlobal('fetch', fetchMock);
    renderApp('/app/audit', { token: 'gecerli-token' });

    await screen.findByRole('alert');

    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/audit-logs'))).toBe(true);
  });

  it('401 durumunda oturumu kapatır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () => jsonResponse(401, { message: 'Unauthenticated.' }),
      }),
    );

    renderApp('/app/audit', { token: 'artik-gecersiz' });

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
    await waitFor(() => expect(tokenStorage.get()).toBeNull());
  });

  /**
   * 422 bu uçta YALNIZCA `per_page` geçersizse doğar ve arayüz
   * `per_page` göndermez — yani normal kullanımda hiç görülmez.
   *
   * Test yine de var: hata eşlemesinin 422'yi 500 gibi maskelemediğini
   * sabitler. Doğrulama mesajı backend'in kendi metnidir; maskelenirse
   * kullanıcı neyin yanlış olduğunu asla öğrenemez.
   */
  it('422 durumunda backend doğrulama mesajını olduğu gibi gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () =>
          jsonResponse(422, {
            message: 'Sayfa boyutu en fazla 100 olabilir.',
            errors: { per_page: ['Sayfa boyutu en fazla 100 olabilir.'] },
          }),
      }),
    );

    renderApp('/app/audit', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Sayfa boyutu en fazla 100 olabilir.');
    expect(alert.textContent).not.toContain('Beklenmedik bir hata');
  });

  // ------------------------------------------------------- ayrıntı paneli

  /**
   * AYRI ROTA YOK. Backend'de tekil audit ucu yoktur; `/app/audit/:id`
   * gibi bir rota, ancak listedeki nesneyi taşıyarak ya da uydurma bir
   * istekle çalışırdı. Ayrıntı satırın içinde açılır.
   */
  it('ayrıntı için ayrı bir bağlantı vermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () => jsonResponse(200, fixtures.paginated(threeLogs, 3)),
      }),
    );

    renderApp('/app/audit', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Denetim kayıtları' });

    expect(within(table).queryByRole('link')).not.toBeInTheDocument();
  });

  it('ayrıntılar varsayılan olarak kapalıdır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () => jsonResponse(200, fixtures.paginated(threeLogs, 3)),
      }),
    );

    renderApp('/app/audit', { token: 'gecerli-token' });

    const row = await screen.findByTestId('audit-row-100');

    expect(within(row).getByRole('button', { name: 'Ayrıntı' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByTestId('audit-detail-100')).not.toBeInTheDocument();
  });

  it('ayrıntı düğmesine basınca satırın ayrıntısı açılır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () => jsonResponse(200, fixtures.paginated(threeLogs, 3)),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/audit', { token: 'gecerli-token' });

    const row = await screen.findByTestId('audit-row-100');
    await user.click(within(row).getByRole('button', { name: 'Ayrıntı' }));

    expect(await screen.findByTestId('audit-detail-100')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Ayrıntı' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('tekrar basınca ayrıntı kapanır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () => jsonResponse(200, fixtures.paginated(threeLogs, 3)),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/audit', { token: 'gecerli-token' });

    const row = await screen.findByTestId('audit-row-100');
    const toggle = within(row).getByRole('button', { name: 'Ayrıntı' });

    await user.click(toggle);
    await screen.findByTestId('audit-detail-100');

    await user.click(toggle);

    await waitFor(() =>
      expect(screen.queryByTestId('audit-detail-100')).not.toBeInTheDocument(),
    );
  });

  it('yalnızca basılan satırın ayrıntısı açılır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () => jsonResponse(200, fixtures.paginated(threeLogs, 3)),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/audit', { token: 'gecerli-token' });

    const row = await screen.findByTestId('audit-row-101');
    await user.click(within(row).getByRole('button', { name: 'Ayrıntı' }));

    await screen.findByTestId('audit-detail-101');

    expect(screen.queryByTestId('audit-detail-100')).not.toBeInTheDocument();
    expect(screen.queryByTestId('audit-detail-102')).not.toBeInTheDocument();
  });

  /**
   * Gösterilecek hiçbir güvenli ayrıntı yoksa düğme HİÇ ÇIKMAZ. Boş bir
   * paneli açan bir düğme, kullanıcıya bilgi gizlendiği izlenimi verir.
   */
  it('gösterilecek ayrıntı yoksa ayrıntı düğmesi göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () =>
          jsonResponse(
            200,
            fixtures.paginated(
              [
                fixtures.auditLog({
                  id: 300,
                  action: 'company.selected',
                  old_values: null,
                  new_values: null,
                  metadata: null,
                }),
              ],
              1,
            ),
          ),
      }),
    );

    renderApp('/app/audit', { token: 'gecerli-token' });

    const row = await screen.findByTestId('audit-row-300');

    expect(within(row).queryByRole('button', { name: 'Ayrıntı' })).not.toBeInTheDocument();
  });

  it('ayrıntıda metadata anahtarlarını etiketli gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () =>
          jsonResponse(
            200,
            fixtures.paginated(
              [
                fixtures.auditLog({
                  id: 301,
                  action: 'invitation.created',
                  metadata: { role: 'member', created_new_account: true },
                }),
              ],
              1,
            ),
          ),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/audit', { token: 'gecerli-token' });

    const row = await screen.findByTestId('audit-row-301');
    await user.click(within(row).getByRole('button', { name: 'Ayrıntı' }));

    const detail = await screen.findByTestId('audit-detail-301');

    expect(within(detail).getByText('Rol')).toBeInTheDocument();
    expect(within(detail).getByText('Üye')).toBeInTheDocument();
    expect(within(detail).getByText('Yeni hesap oluşturuldu')).toBeInTheDocument();
    expect(within(detail).getByText('Evet')).toBeInTheDocument();
  });

  /**
   * REGRESYON — HAM JSON YOK.
   *
   * Ham JSON basmak, bugün zararsız görünen bir alanın yarın ekrana
   * düşmesi demektir. Ayrıca `email_hash` gibi alanlar kullanıcıya
   * hiçbir şey anlatmaz.
   */
  it('ayrıntıda ham JSON göstermez ve email_hash sızdırmaz', async () => {
    const hash = 'b'.repeat(64);

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () =>
          jsonResponse(
            200,
            fixtures.paginated(
              [
                fixtures.auditLog({
                  id: 302,
                  action: 'invitation.created',
                  metadata: { email_hash: hash, role: 'member', internal_ref: 'X-9912' },
                }),
              ],
              1,
            ),
          ),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/audit', { token: 'gecerli-token' });

    const row = await screen.findByTestId('audit-row-302');
    await user.click(within(row).getByRole('button', { name: 'Ayrıntı' }));

    const detail = await screen.findByTestId('audit-detail-302');

    expect(detail.textContent).not.toContain(hash);
    expect(detail.textContent).not.toContain('email_hash');
    expect(detail.textContent).not.toContain('internal_ref');
    // Ham sözlük basılsaydı süslü parantez görünürdü.
    expect(detail.textContent).not.toContain('{');
  });

  it('ayrıntıda eski ve yeni değeri insan okunur fark olarak gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () => jsonResponse(200, fixtures.paginated(threeLogs, 3)),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/audit', { token: 'gecerli-token' });

    const row = await screen.findByTestId('audit-row-101');
    await user.click(within(row).getByRole('button', { name: 'Ayrıntı' }));

    const detail = await screen.findByTestId('audit-detail-101');

    expect(within(detail).getByText('Rol')).toBeInTheDocument();
    expect(detail).toHaveTextContent(/Üye\s*→\s*Sahip/);
  });

  it('oluşturma kaydında yalnızca yeni değerleri gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () => jsonResponse(200, fixtures.paginated(threeLogs, 3)),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/audit', { token: 'gecerli-token' });

    const row = await screen.findByTestId('audit-row-100');
    await user.click(within(row).getByRole('button', { name: 'Ayrıntı' }));

    const detail = await screen.findByTestId('audit-detail-100');

    expect(within(detail).getByText('Ad')).toBeInTheDocument();
    expect(within(detail).getByText('Zeynep Kaya')).toBeInTheDocument();
    expect(within(detail).getByText('Telefon')).toBeInTheDocument();
    // Eski değer yok; ok işareti tek yönlü bir değişim iddiası kurmaz.
    expect(detail.textContent).not.toContain('→');
  });

  it('silme kaydında yalnızca eski değerleri gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () =>
          jsonResponse(
            200,
            fixtures.paginated(
              [
                fixtures.auditLog({
                  id: 303,
                  action: 'customer.deleted',
                  old_values: { name: 'Silinen Müşteri', phone: '05551112233' },
                  new_values: null,
                }),
              ],
              1,
            ),
          ),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/audit', { token: 'gecerli-token' });

    const row = await screen.findByTestId('audit-row-303');
    await user.click(within(row).getByRole('button', { name: 'Ayrıntı' }));

    const detail = await screen.findByTestId('audit-detail-303');

    expect(within(detail).getByText('Silinen Müşteri')).toBeInTheDocument();
    expect(detail.textContent).not.toContain('→');
  });

  /**
   * REGRESYON: `old_values` içinde hassas görünümlü bir anahtar bulunsa
   * bile ekrana çıkmaz. Backend bunları zaten yazmadan düşürüyor; bu
   * test arayüzün beyaz listesinin çalıştığını sabitler.
   */
  it('ayrıntıda güvenli olmayan değer alanlarını göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () =>
          jsonResponse(
            200,
            fixtures.paginated(
              [
                fixtures.auditLog({
                  id: 304,
                  action: 'member.updated',
                  old_values: { name: 'Eski Ad', password: 'gizli', company_id: 4242 },
                  new_values: { name: 'Yeni Ad', password: 'gizli2', company_id: 4242 },
                }),
              ],
              1,
            ),
          ),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/audit', { token: 'gecerli-token' });

    const row = await screen.findByTestId('audit-row-304');
    await user.click(within(row).getByRole('button', { name: 'Ayrıntı' }));

    const detail = await screen.findByTestId('audit-detail-304');

    expect(detail).toHaveTextContent(/Eski Ad\s*→\s*Yeni Ad/);
    expect(detail.textContent).not.toContain('gizli');
    expect(detail.textContent).not.toContain('4242');
    expect(detail.textContent).not.toContain('password');
  });

  // ------------------------------------------------------------ sayfalama

  it('tek sayfa varsa sayfalama göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () => jsonResponse(200, fixtures.paginated(threeLogs, 3)),
      }),
    );

    renderApp('/app/audit', { token: 'gecerli-token' });

    await screen.findByRole('table', { name: 'Denetim kayıtları' });

    expect(screen.queryByRole('navigation', { name: 'Sayfalama' })).not.toBeInTheDocument();
  });

  it('birden çok sayfa varsa sayfa bilgisini gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () =>
          jsonResponse(
            200,
            fixtures.paginated(threeLogs, 45, { currentPage: 1, lastPage: 3, perPage: 20 }),
          ),
      }),
    );

    renderApp('/app/audit', { token: 'gecerli-token' });

    const pager = await screen.findByRole('navigation', { name: 'Sayfalama' });

    expect(pager).toHaveTextContent('Sayfa 1 / 3');
    expect(within(pager).getByRole('button', { name: 'Önceki' })).toBeDisabled();
    expect(within(pager).getByRole('button', { name: 'Sonraki' })).toBeEnabled();
  });

  it('sonraki sayfaya geçince page=2 ister ve o sayfanın içeriğini gösterir', async () => {
    const secondPage = [
      fixtures.auditLog({
        id: 400,
        action: 'customer.deleted',
        actor: { id: 21, name: 'Ada Lovelace' },
      }),
    ];

    const fetchMock = mockApi({
      ...ownerSession,
      '/audit-logs': (_init, url) => {
        const page = new URL(url ?? '', 'http://test.local').searchParams.get('page') ?? '1';

        return jsonResponse(
          200,
          fixtures.paginated(page === '2' ? secondPage : threeLogs, 45, {
            currentPage: Number(page),
            lastPage: 3,
            perPage: 20,
          }),
        );
      },
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/audit', { token: 'gecerli-token' });

    const pager = await screen.findByRole('navigation', { name: 'Sayfalama' });
    await user.click(within(pager).getByRole('button', { name: 'Sonraki' }));

    expect(await screen.findByText('Müşteri silindi')).toBeInTheDocument();
    expect(screen.queryByText('Müşteri oluşturuldu')).not.toBeInTheDocument();

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes('/audit-logs?') && url.includes('page=2'))).toBe(true);
  });

  it('son sayfada sonraki düğmesi kapalıdır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/audit-logs': () =>
          jsonResponse(
            200,
            fixtures.paginated(threeLogs, 45, { currentPage: 3, lastPage: 3, perPage: 20 }),
          ),
      }),
    );

    renderApp('/app/audit', { token: 'gecerli-token' });

    const pager = await screen.findByRole('navigation', { name: 'Sayfalama' });

    expect(within(pager).getByRole('button', { name: 'Sonraki' })).toBeDisabled();
    expect(within(pager).getByRole('button', { name: 'Önceki' })).toBeEnabled();
  });

  /**
   * Sayfa değişince açık ayrıntı kapanır: aynı `id`ye sahip başka bir
   * kayıt gelmez ama açık kalan bir panel, yeni sayfanın satırıyla
   * ilgisiz bir ayrıntı gösteriyormuş izlenimi verirdi.
   */
  it('sayfa değişince açık ayrıntı kapanır', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      '/audit-logs': (_init, url) => {
        const page = new URL(url ?? '', 'http://test.local').searchParams.get('page') ?? '1';

        return jsonResponse(
          200,
          fixtures.paginated(
            page === '2' ? [fixtures.auditLog({ id: 401, action: 'customer.deleted' })] : threeLogs,
            45,
            { currentPage: Number(page), lastPage: 3, perPage: 20 },
          ),
        );
      },
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/audit', { token: 'gecerli-token' });

    const row = await screen.findByTestId('audit-row-100');
    await user.click(within(row).getByRole('button', { name: 'Ayrıntı' }));
    await screen.findByTestId('audit-detail-100');

    const pager = screen.getByRole('navigation', { name: 'Sayfalama' });
    await user.click(within(pager).getByRole('button', { name: 'Sonraki' }));

    await screen.findByTestId('audit-row-401');
    expect(screen.queryByTestId('audit-detail-100')).not.toBeInTheDocument();
  });
});
