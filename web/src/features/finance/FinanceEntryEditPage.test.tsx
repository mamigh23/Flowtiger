import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bodyOf, fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';

/**
 * Finans kaydı düzenleme.
 *
 * Backend sözleşmesi (FinanceEntryRequest — store ile AYNI kurallar):
 *   PUT /finance-entries/{id} → 200 { data: FinanceEntry }
 *
 * UÇ PUT'TUR, PATCH DEĞİL — ve bu bilinçli bir karardır. Parasal alanlar
 * birbirine bağlıdır: yalnızca tutarı değiştiren kısmi bir istek eski KDV
 * ve brüt değerlerini yerinde bırakır, kayıt kendi içinde tutarsız olurdu.
 * Gövde kaydın TAM hâlini taşır ve üçlü her seferinde yeniden hesaplanır.
 *
 * BUNUN ARAYÜZE YANSIMASI: form TÜM alanları mevcut değerleriyle doldurur
 * ve TÜM alanları her istekte gönderir. Kullanıcı yalnızca notu düzeltse
 * bile müşteri, kategori ve tarih gövdede gider — yoksa dokunulmayan
 * alanlar sessizce silinirdi. (Müşteri düzenlemedeki `phone` kararının
 * aynısı, aynı gerekçeyle.)
 *
 * TUTAR HANGİ DEĞERDEN DOLDURULUR? `calculation.basis` söyler. Kullanıcı
 * tutarı brütten girdiyse forma brüt, netten girdiyse net gelir. Yanlış
 * olanı doldurmak, hiçbir şeyi değiştirmeden kaydeden bir kullanıcının
 * tutarını sessizce oynatırdı.
 *
 * YÖN BURADA DEĞİŞTİRİLEBİLİR (oluşturmadan farklı olarak): yanlış yönle
 * girilmiş bir kaydı düzeltmenin başka yolu yok — silme ucu da yok.
 *
 * İPTAL EDİLMİŞ KAYIT DEĞİŞTİRİLEMEZ: backend 422 +
 * `finance_entry_voided` döner. Değiştirilebilseydi iptal bir işaretten
 * ibaret kalır, tutarlar iptalden sonra da oynatılabilirdi.
 */
describe('FinanceEntryEditPage', () => {
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

  /** Brüt esaslı kayıt: forma BRÜT tutar gelmeli. */
  const grossBased = fixtures.financeEntry({
    id: 900,
    direction: 'in',
    financial_date: '2026-08-20',
    category: 'Danışmanlık',
    note: 'Ağustos ayı hizmet bedeli',
    net_minor: 102880,
    vat_rate_bp: 2000,
    vat_minor: 20576,
    gross_minor: 123456,
    customer: { id: 501, customer_no: 12, name: 'Zeynep Kaya' },
    calculation: { basis: 'gross', rounding: 'half_up', vat_applicable: true },
  });

  /** Net esaslı kayıt: forma NET tutar gelmeli. */
  const netBased = fixtures.financeEntry({
    id: 903,
    direction: 'out',
    financial_date: '2026-08-15',
    category: null,
    note: null,
    net_minor: 50000,
    vat_rate_bp: 1000,
    vat_minor: 5000,
    gross_minor: 55000,
    customer: null,
    calculation: { basis: 'net', rounding: 'half_up', vat_applicable: true },
  });

  const voidedEntry = fixtures.financeEntry({
    id: 901,
    voided_at: '2026-08-21T08:00:00+00:00',
    void_reason: 'Yanlış tutar girilmiş',
  });

  function putBody(fetchMock: ReturnType<typeof mockApi>): Record<string, unknown> | undefined {
    const put = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PUT',
    );
    return bodyOf(put?.[1] as RequestInit | undefined) as Record<string, unknown> | undefined;
  }

  // ------------------------------------------------------------ doldurma

  it('mevcut değerleri forma doldurur', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...customerRoutes,
        '/finance-entries/900': () => jsonResponse(200, { data: grossBased }),
      }),
    );

    renderApp('/app/finance/900/edit', { token: 'gecerli-token' });

    expect(await screen.findByLabelText('Tarih')).toHaveValue('2026-08-20');
    expect(screen.getByLabelText('Kategori')).toHaveValue('Danışmanlık');
    expect(screen.getByLabelText('Not')).toHaveValue('Ağustos ayı hizmet bedeli');
    expect(screen.getByLabelText('KDV oranı')).toHaveValue('2000');
    expect(screen.getByLabelText('Yön')).toHaveValue('in');
  });

  /**
   * REGRESYON — TUTAR ESASA GÖRE DOLDURULUR.
   *
   * Brüt esaslı bir kayda net tutar doldurulsaydı, hiçbir şeyi
   * değiştirmeden "Kaydet"e basan kullanıcı tutarı sessizce düşürürdü.
   */
  it('brüt esaslı kayıtta forma brüt tutarı doldurur', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...customerRoutes,
        '/finance-entries/900': () => jsonResponse(200, { data: grossBased }),
      }),
    );

    renderApp('/app/finance/900/edit', { token: 'gecerli-token' });

    expect(await screen.findByLabelText('Tutar')).toHaveValue('1.234,56');
    expect(screen.getByLabelText('Tutar esası')).toHaveValue('gross');
  });

  it('net esaslı kayıtta forma net tutarı doldurur', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...customerRoutes,
        '/finance-entries/903': () => jsonResponse(200, { data: netBased }),
      }),
    );

    renderApp('/app/finance/903/edit', { token: 'gecerli-token' });

    expect(await screen.findByLabelText('Tutar')).toHaveValue('500,00');
    expect(screen.getByLabelText('Tutar esası')).toHaveValue('net');
  });

  it('mevcut müşteriyi seçili getirir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...customerRoutes,
        '/finance-entries/900': () => jsonResponse(200, { data: grossBased }),
      }),
    );

    renderApp('/app/finance/900/edit', { token: 'gecerli-token' });

    await waitFor(() => expect(screen.getByLabelText('Müşteri')).toHaveValue('501'));
  });

  it('KDV bilgisi olmayan kayıtta KDV yok seçili gelir', async () => {
    const noVat = fixtures.financeEntry({
      id: 904,
      vat_rate_bp: null,
      vat_minor: 0,
      net_minor: 30000,
      gross_minor: 30000,
      calculation: { basis: 'net', rounding: 'half_up', vat_applicable: false },
    });

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...customerRoutes,
        '/finance-entries/904': () => jsonResponse(200, { data: noVat }),
      }),
    );

    renderApp('/app/finance/904/edit', { token: 'gecerli-token' });

    expect(await screen.findByLabelText('KDV oranı')).toHaveValue('');
  });

  /** Yanlış yönle girilmiş kaydı düzeltmenin başka yolu yok. */
  it('yön alanını düzenlenebilir sunar', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...customerRoutes,
        '/finance-entries/900': (init) =>
          init?.method === 'PUT'
            ? jsonResponse(200, { data: { ...grossBased, direction: 'out' } })
            : jsonResponse(200, { data: grossBased }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/finance/900/edit', { token: 'gecerli-token' });

    await user.selectOptions(await screen.findByLabelText('Yön'), 'out');

    expect(screen.getByLabelText('Yön')).toHaveValue('out');
  });

  // --------------------------------------------------------------- gövde

  /**
   * REGRESYON — PUT TAM DEĞİŞTİRMEDİR.
   *
   * Kullanıcı yalnızca notu düzeltse bile gövde kaydın tamamını taşır.
   * Dokunulmayan bir alan gövdeden düşerse backend onu null yazar ve veri
   * sessizce kaybolur.
   */
  it('dokunulmayan alanları da gövdede gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...customerRoutes,
      '/finance-entries/900': (init) =>
        init?.method === 'PUT'
          ? jsonResponse(200, { data: grossBased })
          : jsonResponse(200, { data: grossBased }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/900/edit', { token: 'gecerli-token' });

    await waitFor(() => expect(screen.getByLabelText('Müşteri')).toHaveValue('501'));

    const note = screen.getByLabelText('Not');
    await user.clear(note);
    await user.type(note, 'Düzeltilmiş not');

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() =>
      expect(putBody(fetchMock)).toEqual({
        direction: 'in',
        financial_date: '2026-08-20',
        amount_basis: 'gross',
        amount_minor: 123456,
        vat_rate_bp: 2000,
        currency: 'TRY',
        customer_id: 501,
        category: 'Danışmanlık',
        note: 'Düzeltilmiş not',
      }),
    );
  });

  it('gövdede yalnızca sözleşmedeki alanları gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...customerRoutes,
      '/finance-entries/900': () => jsonResponse(200, { data: grossBased }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/900/edit', { token: 'gecerli-token' });

    await screen.findByLabelText('Tutar');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(putBody(fetchMock)).toBeDefined());

    expect(Object.keys(putBody(fetchMock)!).sort()).toEqual([
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

  /** REGRESYON — hesaplanan üçlü ve tenant kimliği gövdeye girmez. */
  it('hesaplanan alanları ve şirket kimliğini göndermez', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...customerRoutes,
      '/finance-entries/900': () => jsonResponse(200, { data: grossBased }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/900/edit', { token: 'gecerli-token' });

    await screen.findByLabelText('Tutar');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(putBody(fetchMock)).toBeDefined());

    const body = putBody(fetchMock)!;
    expect(body).not.toHaveProperty('net_minor');
    expect(body).not.toHaveProperty('vat_minor');
    expect(body).not.toHaveProperty('gross_minor');
    expect(body).not.toHaveProperty('company_id');
    expect(body).not.toHaveProperty('active_company_id');
    expect(body).not.toHaveProperty('voided_at');
    expect(body).not.toHaveProperty('void_reason');
  });

  it('değiştirilen tutarı kuruşa çevirerek gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...customerRoutes,
      '/finance-entries/900': () => jsonResponse(200, { data: grossBased }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/900/edit', { token: 'gecerli-token' });

    const amount = await screen.findByLabelText('Tutar');
    await user.clear(amount);
    await user.type(amount, '2.000,05');

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(putBody(fetchMock)?.amount_minor).toBe(200005));
  });

  it('boşaltılan kategoriyi null olarak gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...customerRoutes,
      '/finance-entries/900': () => jsonResponse(200, { data: grossBased }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/900/edit', { token: 'gecerli-token' });

    await user.clear(await screen.findByLabelText('Kategori'));
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => {
      const body = putBody(fetchMock)!;
      expect(body.category).toBeNull();
      // Alan gövdede BULUNMALI; eksik olması null göndermekle aynı değil.
      expect(Object.keys(body)).toContain('category');
    });
  });

  it('müşteri kaldırılırsa null gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...customerRoutes,
      '/finance-entries/900': () => jsonResponse(200, { data: grossBased }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/900/edit', { token: 'gecerli-token' });

    await waitFor(() => expect(screen.getByLabelText('Müşteri')).toHaveValue('501'));
    await user.selectOptions(screen.getByLabelText('Müşteri'), '');

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(putBody(fetchMock)?.customer_id).toBeNull());
  });

  // -------------------------------------------------------------- sonuç

  it('kaydedince ayrıntı ekranına döner', async () => {
    const updated = { ...grossBased, note: 'Güncellenmiş not' };

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...customerRoutes,
        '/finance-entries/900': (init) =>
          init?.method === 'PUT'
            ? jsonResponse(200, { data: updated })
            : jsonResponse(200, { data: updated }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/finance/900/edit', { token: 'gecerli-token' });

    await screen.findByLabelText('Tutar');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByRole('heading', { name: 'Gelir kaydı' })).toBeInTheDocument();
    expect(screen.getByTestId('finance-note')).toHaveTextContent('Güncellenmiş not');
  });

  it('vazgeçme bağlantısı ayrıntıya döner', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...customerRoutes,
        '/finance-entries/900': () => jsonResponse(200, { data: grossBased }),
      }),
    );

    renderApp('/app/finance/900/edit', { token: 'gecerli-token' });

    expect(await screen.findByRole('link', { name: 'Vazgeç' })).toHaveAttribute(
      'href',
      '/app/finance/900',
    );
  });

  // --------------------------------------------------------------- iptal

  /**
   * REGRESYON — İPTAL EDİLMİŞ KAYIT DÜZENLENEMEZ.
   *
   * Arayüz formu hiç açmaz. Açıp 422 almak, kullanıcıya çalışmayan bir
   * form doldurtmaktır.
   */
  it('iptal edilmiş kayıtta düzenleme formunu açmaz', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...customerRoutes,
        '/finance-entries/901': () => jsonResponse(200, { data: voidedEntry }),
      }),
    );

    renderApp('/app/finance/901/edit', { token: 'gecerli-token' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'İptal edilmiş bir finans kaydı değiştirilemez.',
    );

    expect(screen.queryByRole('button', { name: 'Kaydet' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Tutar')).not.toBeInTheDocument();
  });

  /**
   * Kayıt form açıkken başka bir oturumda iptal edilirse PUT 422 +
   * `finance_entry_voided` döner. Backend'in metni gösterilir.
   */
  it('kaydederken kayıt iptal edilmişse backendin açıklamasını gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...customerRoutes,
        '/finance-entries/900': (init) =>
          init?.method === 'PUT'
            ? jsonResponse(422, {
                message: 'İptal edilmiş bir finans kaydı değiştirilemez.',
                code: 'finance_entry_voided',
              })
            : jsonResponse(200, { data: grossBased }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/finance/900/edit', { token: 'gecerli-token' });

    await screen.findByLabelText('Tutar');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'İptal edilmiş bir finans kaydı değiştirilemez.',
    );
  });

  // ---------------------------------------------------------- doğrulama

  it('422 alan hatalarını ilgili alanların altında gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...customerRoutes,
        '/finance-entries/900': (init) =>
          init?.method === 'PUT'
            ? jsonResponse(422, {
                message: 'Gönderilen bilgiler geçersiz.',
                errors: { amount_minor: ['Tutar sıfırdan küçük olamaz.'] },
              })
            : jsonResponse(200, { data: grossBased }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/finance/900/edit', { token: 'gecerli-token' });

    await screen.findByLabelText('Tutar');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Tutar sıfırdan küçük olamaz.')).toBeInTheDocument();
  });

  it('okunamayan tutarda istek göndermez', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...customerRoutes,
      '/finance-entries/900': () => jsonResponse(200, { data: grossBased }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/900/edit', { token: 'gecerli-token' });

    const amount = await screen.findByLabelText('Tutar');
    await user.clear(amount);
    await user.type(amount, '1234.56');

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Geçerli bir tutar girin (örnek: 1.234,56).')).toBeInTheDocument();

    const puts = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === 'PUT',
    );
    expect(puts).toHaveLength(0);
  });

  // ---------------------------------------------------------------- hata

  it('bilinmeyen kayıtta bulunamadı der', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...customerRoutes,
        '/finance-entries/999': () => jsonResponse(404, { message: 'Kayıt bulunamadı.' }),
      }),
    );

    renderApp('/app/finance/999/edit', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Finans kaydı bulunamadı.');
    expect(alert.textContent).not.toMatch(/yetki/i);
  });

  it('403 durumunda bölümün sahiplere açık olduğunu söyler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...memberSession,
        ...customerRoutes,
        '/finance-entries/900': () =>
          jsonResponse(403, { message: 'This action is unauthorized.' }),
      }),
    );

    renderApp('/app/finance/900/edit', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Bu bölüm yalnızca şirket sahiplerine açıktır.');
    expect(alert.textContent).not.toContain('This action is unauthorized.');
  });
});
