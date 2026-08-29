import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bodyOf, fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';

/**
 * Ödeme düzenleme.
 *
 * Backend sözleşmesi (PaymentRequest — store ile AYNI kurallar):
 *   PUT /payments/{id} → 200 { data: Payment }
 *
 * UÇ PUT'TUR VE DAĞITIM LİSTESİ TAMAMEN YERİNE GEÇER.
 * `PaymentService::replaceAllocations` önce `delete()` çalıştırır, sonra
 * gelen satırları yazar. Bunun iki sonucu var:
 *
 *   1. GÖVDEDE `allocations` ALANININ DÜŞMESİ YASAK. Kural `sometimes`
 *      olduğu için eksik gövde 422 vermez; servis `?? []` diyerek boş
 *      liste varsayar ve MEVCUT TÜM DAĞITIMLARI SİLER. Yani alanı
 *      düşürmek "dokunma" değil, "hepsini sil" demektir. Müşteri
 *      düzenlemedeki `phone` tuzağının aynısı, ama sonucu daha ağır.
 *
 *   2. DAĞITIM ID'LERİ HER KAYITTA DEĞİŞİR (silinip yeniden yazılıyor).
 *      Arayüz id kalıcılığına güvenmez.
 *
 * FORM MEVCUT DAĞITIMLARI EKSİKSİZ DOLDURUR: eksik doldurulsaydı,
 * yalnızca notu düzelten bir kullanıcı farkında olmadan dağıtımları
 * silerdi.
 *
 * İPTAL EDİLMİŞ ÖDEMEDE FORM HİÇ AÇILMAZ: backend 422 + `payment_voided`
 * döner; formu açıp o hatayı almak, kullanıcıya çalışmayan bir form
 * doldurtmaktır.
 */
describe('PaymentEditPage', () => {
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

  const entryA = fixtures.financeEntry({ id: 900, financial_date: '2026-08-20', gross_minor: 123456 });
  const entryB = fixtures.financeEntry({ id: 901, financial_date: '2026-08-19', gross_minor: 50000 });

  const pickerRoutes = {
    '/customers': () => jsonResponse(200, fixtures.paginated(customers, 2)),
    '/finance-entries': () => jsonResponse(200, fixtures.paginated([entryA, entryB], 2)),
  };

  const payment = fixtures.payment({
    id: 800,
    financial_date: '2026-08-22',
    amount_minor: 120000,
    method: 'Havale',
    note: 'Ağustos tahsilatı',
    customer: { id: 501, customer_no: 12, name: 'Zeynep Kaya' },
    allocations: [
      fixtures.paymentAllocation({
        id: 1,
        amount_minor: 50000,
        finance_entry: {
          id: 900,
          direction: 'in',
          financial_date: '2026-08-20',
          gross_minor: 123456,
        },
      }),
    ],
    allocated_minor: 50000,
    remaining_minor: 70000,
  });

  const voidedPayment = fixtures.payment({
    id: 802,
    voided_at: '2026-08-23T08:00:00+00:00',
    void_reason: 'Mükerrer tahsilat',
  });

  function putBody(fetchMock: ReturnType<typeof mockApi>): Record<string, unknown> | undefined {
    const put = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PUT',
    );
    return bodyOf(put?.[1] as RequestInit | undefined) as Record<string, unknown> | undefined;
  }

  const routes = {
    ...ownerSession,
    ...pickerRoutes,
    '/payments/800': () => jsonResponse(200, { data: payment }),
  };

  // ------------------------------------------------------------ doldurma

  it('mevcut değerleri forma doldurur', async () => {
    vi.stubGlobal('fetch', mockApi(routes));

    renderApp('/app/payments/800/edit', { token: 'gecerli-token' });

    expect(await screen.findByRole('heading', { name: 'Ödemeyi düzenle' })).toBeInTheDocument();
    expect(screen.getByLabelText('Tarih')).toHaveValue('2026-08-22');
    expect(screen.getByLabelText('Tutar')).toHaveValue('1.200,00');
    expect(screen.getByLabelText('Yöntem')).toHaveValue('Havale');
    expect(screen.getByLabelText('Not')).toHaveValue('Ağustos tahsilatı');
  });

  it('mevcut müşteriyi seçili getirir', async () => {
    vi.stubGlobal('fetch', mockApi(routes));

    renderApp('/app/payments/800/edit', { token: 'gecerli-token' });

    await waitFor(() => expect(screen.getByLabelText('Müşteri')).toHaveValue('501'));
  });

  /**
   * REGRESYON — MEVCUT DAĞITIMLAR EKSİKSİZ DOLDURULUR.
   *
   * Doldurulmasaydı, formu açıp kaydeden kullanıcı dağıtımların hepsini
   * silmiş olurdu (PUT tam değiştirme).
   */
  it('mevcut dağıtım satırlarını eksiksiz doldurur', async () => {
    vi.stubGlobal('fetch', mockApi(routes));

    renderApp('/app/payments/800/edit', { token: 'gecerli-token' });

    await screen.findByTestId('allocation-row-1');

    await waitFor(() => expect(screen.getByLabelText('Finans kaydı 1')).toHaveValue('900'));
    expect(screen.getByLabelText('Dağıtım tutarı 1')).toHaveValue('500,00');

    // Fazladan boş satır uydurulmaz.
    expect(screen.queryByTestId('allocation-row-2')).not.toBeInTheDocument();
  });

  /**
   * REGRESYON — HEDEF KAYBOLMAZ (gerçek bir veri kaybı yolu).
   *
   * Finans seçicisi `per_page=100` ile TEK sayfa çekiyor; backend'de arama
   * ucu yok. Mevcut bir dağıtımın hedefi o ilk 100 kaydın DIŞINDAysa,
   * seçenekler yalnızca uçtan kurulsaydı:
   *   1. <select> o değeri gösteremez ve seçim boşa düşer,
   *   2. kullanıcı hiçbir şeyi değiştirmeden "Kaydet"e basar,
   *   3. PUT tam değiştirme olduğu için o dağıtım SESSİZCE YOK OLUR.
   *
   * Bu yüzden seçenek havuzu iki kaynağın ID bazında birleşimidir: uçtan
   * gelen kayıtlar VE ödemenin kendi `allocations[].finance_entry`
   * özetleri. Özet id, tarih, yön ve tutarı taşıyor — seçenek çizmeye
   * yetiyor.
   */
  it('hedefi ilk 100 kaydın dışında kalan dağıtımı korur', async () => {
    // Uç, ödemenin hedefini (#900) İÇERMEYEN bir sayfa döndürüyor.
    const otherEntries = [
      fixtures.financeEntry({ id: 902, financial_date: '2026-08-10', gross_minor: 10000 }),
      fixtures.financeEntry({ id: 903, financial_date: '2026-08-09', gross_minor: 20000 }),
    ];

    const fetchMock = mockApi({
      ...ownerSession,
      '/customers': () => jsonResponse(200, fixtures.paginated(customers, 2)),
      '/finance-entries': () => jsonResponse(200, fixtures.paginated(otherEntries, 2)),
      '/payments/800': () => jsonResponse(200, { data: payment }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/800/edit', { token: 'gecerli-token' });

    const select = await screen.findByLabelText('Finans kaydı 1');

    // Seçenek VAR ve SEÇİLİ: uçtan gelmemesine rağmen.
    await waitFor(() => expect(select).toHaveValue('900'));
    expect(within(select).getByRole('option', { name: /#900/ })).toBeInTheDocument();

    // Boş seçenek + uçtan iki kayıt + ödemenin kendi hedefi = 4.
    // Aynı kayıt iki kaynakta olsaydı TEK seçenek gösterilirdi.
    expect(select.querySelectorAll('option')).toHaveLength(4);

    // Hiçbir şey değiştirilmeden kaydedilince hedef KORUNUR.
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() =>
      expect(putBody(fetchMock)?.allocations).toEqual([
        { finance_entry_id: 900, amount_minor: 50000 },
      ]),
    );
  });

  /** Aynı kayıt iki kaynakta varsa seçenek TEKRARLANMAZ. */
  it('hedef iki kaynakta da varsa tek seçenek gösterir', async () => {
    vi.stubGlobal('fetch', mockApi(routes));

    renderApp('/app/payments/800/edit', { token: 'gecerli-token' });

    const select = await screen.findByLabelText('Finans kaydı 1');

    // Uç #900 ve #901 döndürüyor; ödemenin hedefi de #900.
    // Boş seçenek + iki kayıt = 3.
    await waitFor(() => expect(select.querySelectorAll('option')).toHaveLength(3));
    expect(within(select).getAllByRole('option', { name: /#900/ })).toHaveLength(1);
  });

  it('dağıtımı olmayan ödemede boş satır göstermez', async () => {
    const advance = fixtures.payment({
      id: 801,
      allocations: [],
      allocated_minor: 0,
      remaining_minor: 120000,
    });

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...pickerRoutes,
        '/payments/801': () => jsonResponse(200, { data: advance }),
      }),
    );

    renderApp('/app/payments/801/edit', { token: 'gecerli-token' });

    await screen.findByLabelText('Tutar');

    expect(screen.queryByTestId('allocation-row-1')).not.toBeInTheDocument();
  });

  /** Formda canlı dağıtım hesabı YOK — oluşturma ekranıyla aynı karar. */
  it('dağıtılan ya da kalan tutarı formda hesaplayıp göstermez', async () => {
    vi.stubGlobal('fetch', mockApi(routes));

    renderApp('/app/payments/800/edit', { token: 'gecerli-token' });

    await screen.findByLabelText('Tutar');

    expect(screen.queryByTestId('payment-allocated')).not.toBeInTheDocument();
    expect(screen.queryByTestId('payment-remaining')).not.toBeInTheDocument();
  });

  // --------------------------------------------------------------- gövde

  /**
   * REGRESYON — PUT TAM DEĞİŞTİRMEDİR.
   *
   * Kullanıcı yalnızca notu düzeltse bile gövde ödemenin tamamını taşır:
   * müşteri, yöntem, tarih VE dağıtım listesi.
   */
  it('dokunulmayan alanları ve dağıtımları da gövdede gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...pickerRoutes,
      '/payments/800': () => jsonResponse(200, { data: payment }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/800/edit', { token: 'gecerli-token' });

    await waitFor(() => expect(screen.getByLabelText('Finans kaydı 1')).toHaveValue('900'));

    const note = screen.getByLabelText('Not');
    await user.clear(note);
    await user.type(note, 'Düzeltilmiş not');

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() =>
      expect(putBody(fetchMock)).toEqual({
        financial_date: '2026-08-22',
        amount_minor: 120000,
        currency: 'TRY',
        method: 'Havale',
        note: 'Düzeltilmiş not',
        customer_id: 501,
        allocations: [{ finance_entry_id: 900, amount_minor: 50000 }],
      }),
    );
  });

  it('gövdede yalnızca sözleşmedeki alanları gönderir', async () => {
    const fetchMock = mockApi(routes);

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/800/edit', { token: 'gecerli-token' });

    await screen.findByLabelText('Tutar');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(putBody(fetchMock)).toBeDefined());

    expect(Object.keys(putBody(fetchMock)!).sort()).toEqual([
      'allocations',
      'amount_minor',
      'currency',
      'customer_id',
      'financial_date',
      'method',
      'note',
    ]);
  });

  /**
   * REGRESYON — `allocations` ALANI ASLA DÜŞMEZ.
   *
   * Tüm satırlar silinse bile alan gövdede AÇIKÇA `[]` olarak gider.
   * Alanı düşürmek backend'de aynı sonucu verirdi ama sözleşme tek
   * olmalı: iki farklı gövde şekli, biri er ya da geç test edilmemiş
   * kalan iki yol demektir.
   */
  it('tüm dağıtımlar silinse bile allocations alanını boş dizi olarak gönderir', async () => {
    const fetchMock = mockApi(routes);

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/800/edit', { token: 'gecerli-token' });

    const row = await screen.findByTestId('allocation-row-1');
    await user.click(within(row).getByRole('button', { name: 'Satırı sil' }));

    await waitFor(() => expect(screen.queryByTestId('allocation-row-1')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(putBody(fetchMock)).toBeDefined());

    const body = putBody(fetchMock)!;
    expect(body.allocations).toEqual([]);
    expect(Object.keys(body)).toContain('allocations');
  });

  it('eklenen dağıtım satırını gövdeye katar', async () => {
    const fetchMock = mockApi(routes);

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/800/edit', { token: 'gecerli-token' });

    await waitFor(() => expect(screen.getByLabelText('Finans kaydı 1')).toHaveValue('900'));

    await user.click(screen.getByRole('button', { name: 'Dağıtım ekle' }));
    await screen.findByTestId('allocation-row-2');
    await user.selectOptions(screen.getByLabelText('Finans kaydı 2'), '901');
    await user.type(screen.getByLabelText('Dağıtım tutarı 2'), '700,00');

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() =>
      expect(putBody(fetchMock)?.allocations).toEqual([
        { finance_entry_id: 900, amount_minor: 50000 },
        { finance_entry_id: 901, amount_minor: 70000 },
      ]),
    );
  });

  it('değiştirilen dağıtım tutarını kuruşa çevirerek gönderir', async () => {
    const fetchMock = mockApi(routes);

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/800/edit', { token: 'gecerli-token' });

    await waitFor(() => expect(screen.getByLabelText('Finans kaydı 1')).toHaveValue('900'));

    const amount = screen.getByLabelText('Dağıtım tutarı 1');
    await user.clear(amount);
    await user.type(amount, '1.234,56');

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() =>
      expect(putBody(fetchMock)?.allocations).toEqual([
        { finance_entry_id: 900, amount_minor: 123456 },
      ]),
    );
  });

  it('değiştirilen ödeme tutarını kuruşa çevirerek gönderir', async () => {
    const fetchMock = mockApi(routes);

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/800/edit', { token: 'gecerli-token' });

    const amount = await screen.findByLabelText('Tutar');
    await user.clear(amount);
    await user.type(amount, '2.000,05');

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(putBody(fetchMock)?.amount_minor).toBe(200005));
  });

  it('boşaltılan yöntemi null olarak gönderir', async () => {
    const fetchMock = mockApi(routes);

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/800/edit', { token: 'gecerli-token' });

    await user.clear(await screen.findByLabelText('Yöntem'));
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => {
      const body = putBody(fetchMock)!;
      expect(body.method).toBeNull();
      expect(Object.keys(body)).toContain('method');
    });
  });

  it('müşteri kaldırılırsa null gönderir', async () => {
    const fetchMock = mockApi(routes);

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/800/edit', { token: 'gecerli-token' });

    await waitFor(() => expect(screen.getByLabelText('Müşteri')).toHaveValue('501'));
    await user.selectOptions(screen.getByLabelText('Müşteri'), '');

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(putBody(fetchMock)?.customer_id).toBeNull());
  });

  it('türetilen alanları ve şirket kimliğini göndermez', async () => {
    const fetchMock = mockApi(routes);

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/800/edit', { token: 'gecerli-token' });

    await screen.findByLabelText('Tutar');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(putBody(fetchMock)).toBeDefined());

    const body = putBody(fetchMock)!;
    expect(body).not.toHaveProperty('allocated_minor');
    expect(body).not.toHaveProperty('remaining_minor');
    expect(body).not.toHaveProperty('company_id');
    expect(body).not.toHaveProperty('active_company_id');
    expect(body).not.toHaveProperty('voided_at');
    expect(body).not.toHaveProperty('void_reason');
  });

  it('para birimini her zaman TRY olarak gönderir', async () => {
    const fetchMock = mockApi(routes);

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/800/edit', { token: 'gecerli-token' });

    await screen.findByLabelText('Tutar');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(putBody(fetchMock)?.currency).toBe('TRY'));
  });

  // -------------------------------------------------------------- sonuç

  it('kaydedince ayrıntı ekranına döner', async () => {
    const updated = { ...payment, note: 'Güncellenmiş not' };

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...pickerRoutes,
        '/payments/800': (init) =>
          init?.method === 'PUT'
            ? jsonResponse(200, { data: updated })
            : jsonResponse(200, { data: updated }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/payments/800/edit', { token: 'gecerli-token' });

    await screen.findByLabelText('Tutar');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByRole('heading', { name: 'Ödeme' })).toBeInTheDocument();
    expect(screen.getByTestId('payment-note')).toHaveTextContent('Güncellenmiş not');
  });

  it('vazgeçme bağlantısı ayrıntıya döner', async () => {
    vi.stubGlobal('fetch', mockApi(routes));

    renderApp('/app/payments/800/edit', { token: 'gecerli-token' });

    expect(await screen.findByRole('link', { name: 'Vazgeç' })).toHaveAttribute(
      'href',
      '/app/payments/800',
    );
  });

  // --------------------------------------------------------------- iptal

  /**
   * REGRESYON — İPTAL EDİLMİŞ ÖDEME DÜZENLENEMEZ.
   */
  it('iptal edilmiş ödemede düzenleme formunu açmaz', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...pickerRoutes,
        '/payments/802': () => jsonResponse(200, { data: voidedPayment }),
      }),
    );

    renderApp('/app/payments/802/edit', { token: 'gecerli-token' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'İptal edilmiş bir ödeme değiştirilemez.',
    );

    expect(screen.queryByRole('button', { name: 'Kaydet' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Tutar')).not.toBeInTheDocument();
  });

  /**
   * Ödeme form açıkken başka bir oturumda iptal edilirse PUT 422 +
   * `payment_voided` döner. Backend'in metni gösterilir.
   */
  it('kaydederken ödeme iptal edilmişse backendin açıklamasını gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...pickerRoutes,
        '/payments/800': (init) =>
          init?.method === 'PUT'
            ? jsonResponse(422, {
                message: 'İptal edilmiş bir ödeme değiştirilemez.',
                code: 'payment_voided',
              })
            : jsonResponse(200, { data: payment }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/payments/800/edit', { token: 'gecerli-token' });

    await screen.findByLabelText('Tutar');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'İptal edilmiş bir ödeme değiştirilemez.',
    );
  });

  // ---------------------------------------------------------- doğrulama

  it('dağıtım aşımını alan hatası şeklinde gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...pickerRoutes,
        '/payments/800': (init) =>
          init?.method === 'PUT'
            ? jsonResponse(422, {
                message: 'Gönderilen bilgiler geçersiz.',
                errors: { allocations: ['Dağıtım toplamı ödeme tutarını aşamaz.'] },
              })
            : jsonResponse(200, { data: payment }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/payments/800/edit', { token: 'gecerli-token' });

    await screen.findByLabelText('Tutar');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Dağıtım toplamı ödeme tutarını aşamaz.')).toBeInTheDocument();
  });

  /** Eşzamanlılık yolundan gelen aynı kural, farklı gövde. */
  it('dağıtım aşımını makine kodlu şekliyle de gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...pickerRoutes,
        '/payments/800': (init) =>
          init?.method === 'PUT'
            ? jsonResponse(422, {
                message: 'Dağıtım toplamı ödeme tutarını aşamaz.',
                code: 'payment_over_allocated',
              })
            : jsonResponse(200, { data: payment }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/payments/800/edit', { token: 'gecerli-token' });

    await screen.findByLabelText('Tutar');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Dağıtım toplamı ödeme tutarını aşamaz.',
    );
  });

  it('422 alan hatalarını ilgili alanların altında gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...pickerRoutes,
        '/payments/800': (init) =>
          init?.method === 'PUT'
            ? jsonResponse(422, {
                message: 'Gönderilen bilgiler geçersiz.',
                errors: { amount_minor: ['Tutar sıfırdan küçük olamaz.'] },
              })
            : jsonResponse(200, { data: payment }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/payments/800/edit', { token: 'gecerli-token' });

    await screen.findByLabelText('Tutar');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Tutar sıfırdan küçük olamaz.')).toBeInTheDocument();
  });

  it('okunamayan tutarda istek göndermez', async () => {
    const fetchMock = mockApi(routes);

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/800/edit', { token: 'gecerli-token' });

    const amount = await screen.findByLabelText('Tutar');
    await user.clear(amount);
    await user.type(amount, '1200.00');

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(
      await screen.findByText('Geçerli bir tutar girin (örnek: 1.234,56).'),
    ).toBeInTheDocument();

    const puts = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PUT',
    );
    expect(puts).toHaveLength(0);
  });

  // ---------------------------------------------------------------- hata

  it('bilinmeyen ödemede bulunamadı der', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...pickerRoutes,
        '/payments/999': () => jsonResponse(404, { message: 'Kayıt bulunamadı.' }),
      }),
    );

    renderApp('/app/payments/999/edit', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Ödeme bulunamadı.');
    expect(alert.textContent).not.toMatch(/yetki/i);
  });

  it('403 durumunda bölümün sahiplere açık olduğunu söyler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...memberSession,
        ...pickerRoutes,
        '/payments/800': () => jsonResponse(403, { message: 'This action is unauthorized.' }),
      }),
    );

    renderApp('/app/payments/800/edit', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Bu bölüm yalnızca şirket sahiplerine açıktır.');
    expect(alert.textContent).not.toMatch(/bulunamadı/i);
  });
});
