import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bodyOf, fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';

/**
 * Finans kaydı oluşturma — gelir ve gider.
 *
 * Backend sözleşmesi (FinanceEntryRequest):
 *   POST /finance-entries → 201 { data: FinanceEntry }
 *   gövde: direction, financial_date, amount_basis, amount_minor,
 *          vat_rate_bp, currency, customer_id, category, note
 *
 * ARAYÜZ HESAP YAPMAZ. İstemci TUTARI ve ESASI verir; net/KDV/brüt
 * üçlüsünü VatCalculator üretir. `net_minor`, `vat_minor`, `gross_minor`
 * backend'de `prohibited`'dır — gönderilirse 422 döner. Bu bilinçli:
 * sessiz yok sayma, kullanıcının "gönderdiğim değer uygulandı" sanmasına
 * ve yanlış bir toplamı fark etmeden kabul etmesine yol açardı.
 *
 * YÖN ROTADAN GELİR, FORMDAN DEĞİL. "Yeni gelir" ve "Yeni gider" iki
 * ayrı kullanıcı niyetidir ve form açılmadan ÖNCE seçilir. Formun içine
 * ikinci bir yön seçici koymak, aynı kararı iki kez sordurur ve başlığı
 * yalan söyleyebilir hâle getirir ("Yeni gelir" başlıklı sayfadan gider
 * kaydı çıkması).
 *
 * KDV VARSAYILANI "KDV YOK"TUR (null), "%0" DEĞİL. İkisi backend'de
 * FARKLI şeylerdir (§A4): null "kayıt KDV bilgisi taşımıyor", 0 ise "KDV
 * var, oranı sıfır". Varsayılan olarak bir oran seçmek, kullanıcı hiçbir
 * şey söylemeden onun adına vergi beyanı yapmak olurdu.
 *
 * `currency` KULLANICIYA SORULMAZ: backend MVP'de yalnızca TRY kabul
 * ediyor (Rule::in([Currency::mvpDefault()])) ve veritabanında CHECK ile
 * kısıtlı. Seçilemeyen bir alanı seçim gibi göstermek yanlış bir vaat
 * olurdu.
 */
describe('FinanceEntryCreatePage', () => {
  afterEach(() => {
    // Varsayılan tarih testi sahte saat kullanıyor; sızdırırsa sonraki
    // testlerin async beklemeleri kilitlenir.
    vi.useRealTimers();
  });

  const ownerSession = {
    '/me': () => jsonResponse(200, { data: fixtures.user() }),
    '/companies': () =>
      jsonResponse(200, { data: [fixtures.company()], meta: { active_company_id: 7 } }),
  };

  const memberSession = {
    '/me': () => jsonResponse(200, { data: fixtures.user() }),
    '/companies': () =>
      jsonResponse(200, {
        data: [fixtures.company({ role: 'member' })],
        meta: { active_company_id: 7 },
      }),
  };

  const customers = [
    fixtures.customer({ id: 501, customer_no: 12, name: 'Zeynep Kaya' }),
    fixtures.customer({ id: 502, customer_no: 13, name: 'Mert Demir' }),
  ];

  const customerRoutes = {
    '/customers': () => jsonResponse(200, fixtures.paginated(customers, 2)),
  };

  const created = fixtures.financeEntry({
    id: 900,
    direction: 'out',
    financial_date: '2026-08-20',
    net_minor: 123456,
    vat_rate_bp: null,
    vat_minor: 0,
    gross_minor: 123456,
    calculation: { basis: 'net', rounding: 'half_up', vat_applicable: false },
  });

  /** Zorunlu alanları doldurur; tarih sabit tutulur ki gövde kesin olsun. */
  async function fillRequired(
    user: ReturnType<typeof userEvent.setup>,
    amount = '1.234,56',
  ): Promise<void> {
    fireEvent.change(await screen.findByLabelText('Tarih'), {
      target: { value: '2026-08-20' },
    });
    await user.type(screen.getByLabelText('Tutar'), amount);
  }

  function postBody(fetchMock: ReturnType<typeof mockApi>): Record<string, unknown> | undefined {
    const post = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
    );
    return bodyOf(post?.[1] as RequestInit | undefined) as Record<string, unknown> | undefined;
  }

  // -------------------------------------------------------------- alanlar

  it('gelir rotasında yönü gelir olarak sabitler', async () => {
    vi.stubGlobal('fetch', mockApi({ ...ownerSession, ...customerRoutes }));

    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    expect(await screen.findByRole('heading', { name: 'Yeni gelir' })).toBeInTheDocument();
    expect(screen.getByTestId('finance-direction')).toHaveTextContent('Gelir');
  });

  it('gider rotasında yönü gider olarak sabitler', async () => {
    vi.stubGlobal('fetch', mockApi({ ...ownerSession, ...customerRoutes }));

    renderApp('/app/finance/new/expense', { token: 'gecerli-token' });

    expect(await screen.findByRole('heading', { name: 'Yeni gider' })).toBeInTheDocument();
    expect(screen.getByTestId('finance-direction')).toHaveTextContent('Gider');
  });

  it('sözleşmedeki tüm girdi alanlarını sunar', async () => {
    vi.stubGlobal('fetch', mockApi({ ...ownerSession, ...customerRoutes }));

    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    expect(await screen.findByLabelText('Tarih')).toBeInTheDocument();
    expect(screen.getByLabelText('Tutar')).toBeInTheDocument();
    expect(screen.getByLabelText('Tutar esası')).toBeInTheDocument();
    expect(screen.getByLabelText('KDV oranı')).toBeInTheDocument();
    expect(screen.getByLabelText('Müşteri')).toBeInTheDocument();
    expect(screen.getByLabelText('Kategori')).toBeInTheDocument();
    expect(screen.getByLabelText('Not')).toBeInTheDocument();
  });

  /** Para birimi seçilemez; seçim gibi göstermek yanlış vaat olurdu. */
  it('para birimi alanı sunmaz', async () => {
    vi.stubGlobal('fetch', mockApi({ ...ownerSession, ...customerRoutes }));

    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    await screen.findByLabelText('Tutar');

    expect(screen.queryByLabelText('Para birimi')).not.toBeInTheDocument();
  });

  it('varsayılan tarihi bugün olarak doldurur', async () => {
    // shouldAdvanceTime: async beklemeler sahte saatte de ilerlesin.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 7, 24, 9, 0, 0));

    vi.stubGlobal('fetch', mockApi({ ...ownerSession, ...customerRoutes }));

    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    expect(await screen.findByLabelText('Tarih')).toHaveValue('2026-08-24');
  });

  // --------------------------------------------------------------- gövde

  /**
   * REGRESYON — KULLANICININ YAZDIĞI TUTAR TAM SAYI KURUŞA ÇEVRİLİR.
   *
   * "1.234,56" → 123456. Bu dönüşüm money.ts'e aittir ve float'a hiç
   * uğramaz. Ekranda gördüğü sayının yüz katı ya da yüzde biri kaydedilen
   * bir finans uygulaması işe yaramaz.
   */
  it('Türkçe yazılmış tutarı kuruşa çevirerek gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...customerRoutes,
      '/finance-entries': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/new/expense', { token: 'gecerli-token' });

    await fillRequired(user, '1.234,56');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => {
      expect(postBody(fetchMock)).toMatchObject({
        direction: 'out',
        amount_minor: 123456,
      });
    });
  });

  /**
   * REGRESYON — GÖVDE TAM OLARAK SÖZLEŞMEDEKİ ALANLARI TAŞIR.
   *
   * Fazla bir alan eklenirse (hesaplanan üçlü, tenant kimliği) backend
   * ya 422 döner ya da sessizce yok sayar; ikisi de arayüzün sözleşmeyi
   * yanlış bildiğini gizler.
   */
  it('gövdede yalnızca sözleşmedeki alanları gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...customerRoutes,
      '/finance-entries': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)).toBeDefined());

    expect(Object.keys(postBody(fetchMock)!).sort()).toEqual([
      'amount_basis',
      'amount_minor',
      'category',
      'currency',
      'customer_id',
      'direction',
      'financial_date',
      'note',
      'vat_rate_bp',
    ]);
  });

  /**
   * REGRESYON — FRONTEND HESAP MOTORU YOK.
   *
   * net/vat/gross istemcide üretilmez. Üretilseydi iki hesaplama motoru
   * olurdu ve bir gün ikisi farklı sonuç verir, hangisinin doğru olduğu
   * bilinemezdi.
   */
  it('hesaplanan parasal alanları göndermez', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...customerRoutes,
      '/finance-entries': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)).toBeDefined());

    const body = postBody(fetchMock)!;
    expect(body).not.toHaveProperty('net_minor');
    expect(body).not.toHaveProperty('vat_minor');
    expect(body).not.toHaveProperty('gross_minor');
  });

  /**
   * REGRESYON — TENANT KİMLİĞİ GÖVDEDEN GİTMEZ (playbook §3.1, §9).
   *
   * Aktif şirket backend'de belirlenir. Gövdeye konsaydı istemci tenant
   * seçebiliyormuş izlenimi doğardı — üstelik backend `company_id` için
   * `prohibited` yazdığı hâlde.
   */
  it('şirket kimliğini gövdeye koymaz', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...customerRoutes,
      '/finance-entries': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)).toBeDefined());

    const body = postBody(fetchMock)!;
    expect(body).not.toHaveProperty('company_id');
    expect(body).not.toHaveProperty('active_company_id');
    expect(body).not.toHaveProperty('customer_no');
  });

  it('para birimini her zaman TRY olarak gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...customerRoutes,
      '/finance-entries': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)?.currency).toBe('TRY'));
  });

  // ----------------------------------------------------------------- KDV

  /**
   * REGRESYON — VARSAYILAN null, 0 DEĞİL.
   *
   * null "KDV bilgisi yok", 0 "KDV var, oranı sıfır" demektir. Varsayılan
   * 0 olsaydı, KDV'ye hiç girmemiş her kayıt raporda sıfır oranlı bir
   * işlem gibi görünürdü.
   */
  it('KDV seçilmediyse null gönderir, sıfır değil', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...customerRoutes,
      '/finance-entries': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)).toBeDefined());

    const body = postBody(fetchMock)!;
    expect(body.vat_rate_bp).toBeNull();
    // Alan gövdede BULUNMALI: backend `present` istiyor.
    expect(Object.keys(body)).toContain('vat_rate_bp');
  });

  it('sıfır oran seçilirse sıfır gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...customerRoutes,
      '/finance-entries': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.selectOptions(screen.getByLabelText('KDV oranı'), '0');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)?.vat_rate_bp).toBe(0));
  });

  /** Oran BAZ PUAN gider: %20 → 2000. Yüzde göndermek 100 kat hata olurdu. */
  it('seçilen oranı baz puan olarak gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...customerRoutes,
      '/finance-entries': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.selectOptions(screen.getByLabelText('KDV oranı'), '2000');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)?.vat_rate_bp).toBe(2000));
  });

  // ---------------------------------------------------------- tutar esası

  it('tutar esasını varsayılan olarak net gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...customerRoutes,
      '/finance-entries': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)?.amount_basis).toBe('net'));
  });

  it('brüt seçilirse esası brüt gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...customerRoutes,
      '/finance-entries': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.selectOptions(screen.getByLabelText('Tutar esası'), 'gross');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)?.amount_basis).toBe('gross'));
  });

  // -------------------------------------------------------------- müşteri

  /**
   * MÜŞTERİ SEÇENEKLERİ YALNIZCA GERÇEK API'DEN GELİR.
   *
   * Yanıtta olmayan bir müşteriyi listelemek, var olmayan bir id
   * göndermek demektir — backend `exists` kuralına takılır ve kullanıcı
   * sebebini anlamaz.
   */
  it('müşteri seçeneklerini yalnızca müşteri ucundan doldurur', async () => {
    vi.stubGlobal('fetch', mockApi({ ...ownerSession, ...customerRoutes }));

    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    const select = await screen.findByLabelText('Müşteri');

    await waitFor(() => expect(screen.getByRole('option', { name: 'Zeynep Kaya' })).toBeInTheDocument());
    expect(screen.getByRole('option', { name: 'Mert Demir' })).toBeInTheDocument();

    // Boş seçenek + iki müşteri. Uydurma bir kayıt eklenmemeli.
    expect(select.querySelectorAll('option')).toHaveLength(3);
  });

  /**
   * Seçici müşteri ucunun ÜST SINIRINI ister (per_page=100).
   *
   * Liste ekranı per_page dayatmaz çünkü orada sayfalama var. Burada yok:
   * varsayılan 15 ile gelen bir seçici, on altıncı müşteriyi seçilemez
   * hâle getirir ve kullanıcı sebebini göremez. 100 backend'in izin
   * verdiği en büyük değerdir (MAX_PER_PAGE); üstü 422 döner.
   */
  it('müşteri seçicisini ucun izin verdiği en büyük sayfayla doldurur', async () => {
    const fetchMock = mockApi({ ...ownerSession, ...customerRoutes });

    vi.stubGlobal('fetch', fetchMock);
    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    await screen.findByLabelText('Müşteri');

    await waitFor(() => {
      const call = fetchMock.mock.calls
        .map(([url]) => String(url))
        .find((url) => url.includes('/customers?'));

      expect(call).toContain('per_page=100');
    });
  });

  it('müşteri seçilmediyse null gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...customerRoutes,
      '/finance-entries': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)).toBeDefined());

    const body = postBody(fetchMock)!;
    expect(body.customer_id).toBeNull();
  });

  it('seçilen müşterinin kimliğini gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...customerRoutes,
      '/finance-entries': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    await fillRequired(user);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Zeynep Kaya' })).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Müşteri'), '501');

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)?.customer_id).toBe(501));
  });

  // ------------------------------------------------------ kategori ve not

  it('boş bırakılan kategori ve notu null gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...customerRoutes,
      '/finance-entries': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)).toBeDefined());

    const body = postBody(fetchMock)!;
    expect(body.category).toBeNull();
    expect(body.note).toBeNull();
  });

  it('yazılan kategori ve notu gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...customerRoutes,
      '/finance-entries': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.type(screen.getByLabelText('Kategori'), 'Danışmanlık');
    await user.type(screen.getByLabelText('Not'), 'Ağustos ayı');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() =>
      expect(postBody(fetchMock)).toMatchObject({
        category: 'Danışmanlık',
        note: 'Ağustos ayı',
      }),
    );
  });

  it('seçilen tarihi sözleşme biçiminde gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...customerRoutes,
      '/finance-entries': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    fireEvent.change(await screen.findByLabelText('Tarih'), { target: { value: '2026-07-01' } });
    await user.type(screen.getByLabelText('Tutar'), '100');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)?.financial_date).toBe('2026-07-01'));
  });

  // ------------------------------------------------------------ doğrulama

  /**
   * Okunamayan tutar SUNUCUYA GÖNDERİLMEZ.
   *
   * Gönderilseydi ya NaN giderdi ya da alan hiç gitmezdi; ikisi de
   * kullanıcıya "tutarı anlamadım" demekten kötü.
   */
  it('okunamayan tutarda istek göndermez ve alan altında uyarır', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...customerRoutes,
      '/finance-entries': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    fireEvent.change(await screen.findByLabelText('Tarih'), { target: { value: '2026-08-20' } });
    await user.type(screen.getByLabelText('Tutar'), 'bin lira');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Geçerli bir tutar girin (örnek: 1.234,56).')).toBeInTheDocument();

    const posts = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(posts).toHaveLength(0);
  });

  it('422 alan hatalarını ilgili alanların altında gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...customerRoutes,
        '/finance-entries': () =>
          jsonResponse(422, {
            message: 'Gönderilen bilgiler geçersiz.',
            errors: {
              amount_minor: ['Tutar alanı zorunludur.'],
              financial_date: ['Tarih biçimi geçersiz.'],
            },
          }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Tutar alanı zorunludur.')).toBeInTheDocument();
    expect(screen.getByText('Tarih biçimi geçersiz.')).toBeInTheDocument();
  });

  /** Başka tenant'ın müşterisi 422 alır (`exists` kuralı); metin gizlenmez. */
  it('müşteri doğrulama hatasını gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...customerRoutes,
        '/finance-entries': () =>
          jsonResponse(422, {
            message: 'Gönderilen bilgiler geçersiz.',
            errors: { customer_id: ['Seçilen müşteri geçersiz.'] },
          }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Seçilen müşteri geçersiz.')).toBeInTheDocument();
  });

  it('403 durumunda bölümün sahiplere açık olduğunu söyler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...memberSession,
        ...customerRoutes,
        '/finance-entries': () => jsonResponse(403, { message: 'This action is unauthorized.' }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Bu bölüm yalnızca şirket sahiplerine açıktır.');
    expect(alert.textContent).not.toContain('This action is unauthorized.');
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
      if (init?.method === 'POST') return pendingPost;

      return jsonResponse(404, { message: 'Taklit edilmemiş uç' });
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    await fillRequired(user);

    const submit = screen.getByRole('button', { name: 'Kaydet' });
    await user.click(submit);

    await waitFor(() => expect(submit).toBeDisabled());
    await user.click(submit);

    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);

    deferred.resolve?.(jsonResponse(201, { data: created }));
  });

  // ------------------------------------------------------------- sonuçlar

  /**
   * REGRESYON — GÖNDERMEDEN ÖNCE HESAP GÖSTERİLMEZ.
   *
   * Formda bir "KDV: … / Brüt: …" önizlemesi olsaydı, o sayıyı üreten
   * ikinci bir hesaplama motoru olurdu. Kullanıcı hesabı ancak sunucu
   * yanıtından sonra görür.
   */
  it('gönderim öncesi KDV ya da brüt önizlemesi göstermez', async () => {
    vi.stubGlobal('fetch', mockApi({ ...ownerSession, ...customerRoutes }));

    const user = userEvent.setup();
    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.selectOptions(screen.getByLabelText('KDV oranı'), '2000');

    expect(screen.queryByTestId('finance-vat')).not.toBeInTheDocument();
    expect(screen.queryByTestId('finance-gross')).not.toBeInTheDocument();
    expect(screen.queryByTestId('finance-net')).not.toBeInTheDocument();
  });

  /**
   * Kayıt oluşunca kullanıcı SUNUCUNUN hesabını görür: net, KDV, brüt ve
   * hesabın nasıl yapıldığı.
   */
  it('oluşturma sonrası sunucunun hesabını gösterir', async () => {
    const withVat = fixtures.financeEntry({
      id: 900,
      direction: 'in',
      net_minor: 102880,
      vat_rate_bp: 2000,
      vat_minor: 20576,
      gross_minor: 123456,
      calculation: { basis: 'gross', rounding: 'half_up', vat_applicable: true },
    });

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...customerRoutes,
        '/finance-entries/900': () => jsonResponse(200, { data: withVat }),
        '/finance-entries': () => jsonResponse(201, { data: withVat }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByTestId('finance-net')).toHaveTextContent('1.028,80 TL');
    expect(screen.getByTestId('finance-vat')).toHaveTextContent('205,76 TL');
    expect(screen.getByTestId('finance-gross')).toHaveTextContent('1.234,56 TL');
    expect(screen.getByTestId('finance-calculation')).toHaveTextContent('Brüt üzerinden');
  });

  /** Yeni kayıt listeye döndüğünde görünür. */
  it('oluşturulan kayıt listeye dönüldüğünde görünür', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...customerRoutes,
        '/finance-entries/900': () => jsonResponse(200, { data: created }),
        '/finance-entries': (init) =>
          init?.method === 'POST'
            ? jsonResponse(201, { data: created })
            : jsonResponse(200, fixtures.paginated([created], 1)),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/finance/new/expense', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await user.click(await screen.findByRole('link', { name: 'Finans kayıtlarına dön' }));

    expect(await screen.findByTestId('finance-row-900')).toBeInTheDocument();
  });

  it('vazgeçme bağlantısı listeye döner', async () => {
    vi.stubGlobal('fetch', mockApi({ ...ownerSession, ...customerRoutes }));

    renderApp('/app/finance/new/income', { token: 'gecerli-token' });

    expect(await screen.findByRole('link', { name: 'Vazgeç' })).toHaveAttribute(
      'href',
      '/app/finance',
    );
  });
});
