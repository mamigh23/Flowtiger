import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fireEvent,
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bodyOf, fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';

/**
 * Ödeme oluşturma.
 *
 * Backend sözleşmesi (PaymentRequest):
 *   POST /payments → 201 { data: Payment }
 *   gövde: financial_date, amount_minor, currency, method, note,
 *          customer_id, allocations[]
 *   allocations.*: { finance_entry_id, amount_minor min:1 }
 *
 * ARAYÜZ HESAP YAPMAZ. `allocated_minor` ve `remaining_minor` backend'de
 * her okumada hesaplanır ve gövdede `prohibited`'dır. Formda "kalan
 * dağıtılmamış tutar" göstergesi de YOKTUR: o göstergeyi üreten şey
 * `remaining_minor`'ın istemci tarafındaki ikinci bir kopyası olurdu ve
 * backend kuralı değiştirdiği gün sessizce yalan söylerdi. Dağıtım
 * toplamı ödemeyi aşarsa backend 422 döner ve o gösterilir.
 *
 * `currency` KULLANICIYA SORULMAZ: backend MVP'de yalnızca TRY kabul
 * ediyor (Rule::in + DB CHECK).
 *
 * DAĞITIM HEDEFİ POLİMORFİK DEĞİL: bugün yalnızca `finance_entry_id`.
 * Invoice bu fazın kapsamında değil.
 */
describe('PaymentCreatePage', () => {
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

  const activeEntry = fixtures.financeEntry({
    id: 900,
    direction: 'in',
    financial_date: '2026-08-20',
    gross_minor: 123456,
    currency: 'TRY',
  });

  const voidedEntry = fixtures.financeEntry({
    id: 901,
    direction: 'in',
    financial_date: '2026-08-19',
    gross_minor: 50000,
    currency: 'TRY',
    voided_at: '2026-08-21T08:00:00+00:00',
    void_reason: 'Yanlış tutar',
  });

  const pickerRoutes = {
    '/customers': () => jsonResponse(200, fixtures.paginated(customers, 2)),
    '/finance-entries': () => jsonResponse(200, fixtures.paginated([activeEntry, voidedEntry], 2)),
  };

  const created = fixtures.payment({ id: 800 });

  async function fillRequired(
    user: ReturnType<typeof userEvent.setup>,
    amount = '1.200,00',
  ): Promise<void> {
    fireEvent.change(await screen.findByLabelText('Tarih'), {
      target: { value: '2026-08-22' },
    });
    await user.type(screen.getByLabelText('Tutar'), amount);
  }

  function postBody(fetchMock: ReturnType<typeof mockApi>): Record<string, unknown> | undefined {
    const post = fetchMock.mock.calls.find(
      ([url, init]) =>
        (init as RequestInit | undefined)?.method === 'POST' && String(url).includes('/payments'),
    );
    return bodyOf(post?.[1] as RequestInit | undefined) as Record<string, unknown> | undefined;
  }

  // -------------------------------------------------------------- alanlar

  it('ödeme alanlarını sunar', async () => {
    vi.stubGlobal('fetch', mockApi({ ...ownerSession, ...pickerRoutes }));

    renderApp('/app/payments/new', { token: 'gecerli-token' });

    expect(await screen.findByRole('heading', { name: 'Yeni ödeme' })).toBeInTheDocument();
    expect(screen.getByLabelText('Tarih')).toBeInTheDocument();
    expect(screen.getByLabelText('Tutar')).toBeInTheDocument();
    expect(screen.getByLabelText('Yöntem')).toBeInTheDocument();
    expect(screen.getByLabelText('Müşteri')).toBeInTheDocument();
    expect(screen.getByLabelText('Not')).toBeInTheDocument();
  });

  it('para birimi alanı sunmaz', async () => {
    vi.stubGlobal('fetch', mockApi({ ...ownerSession, ...pickerRoutes }));

    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await screen.findByLabelText('Tutar');

    expect(screen.queryByLabelText('Para birimi')).not.toBeInTheDocument();
  });

  it('varsayılan tarihi bugün olarak doldurur', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 7, 24, 9, 0, 0));

    vi.stubGlobal('fetch', mockApi({ ...ownerSession, ...pickerRoutes }));

    renderApp('/app/payments/new', { token: 'gecerli-token' });

    expect(await screen.findByLabelText('Tarih')).toHaveValue('2026-08-24');
  });

  /**
   * REGRESYON — FORMDA CANLI DAĞITIM HESABI YOK.
   *
   * "Kalan dağıtılmamış tutar" göstergesi, backend'in ürettiği
   * `remaining_minor`'ın istemci kopyası olurdu. İki kaynak, bir gün iki
   * farklı sayı.
   */
  it('gönderim öncesi dağıtılan ya da kalan tutar göstermez', async () => {
    vi.stubGlobal('fetch', mockApi({ ...ownerSession, ...pickerRoutes }));

    const user = userEvent.setup();
    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await fillRequired(user);

    expect(screen.queryByTestId('payment-allocated')).not.toBeInTheDocument();
    expect(screen.queryByTestId('payment-remaining')).not.toBeInTheDocument();
  });

  // --------------------------------------------------------------- gövde

  /**
   * REGRESYON — KULLANICININ YAZDIĞI TUTAR TAM SAYI KURUŞA ÇEVRİLİR.
   * Dönüşüm money.ts'e aittir ve float'a hiç uğramaz.
   */
  it('Türkçe yazılmış tutarı kuruşa çevirerek gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...pickerRoutes,
      '/payments': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await fillRequired(user, '1.234,56');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)?.amount_minor).toBe(123456));
  });

  it('gövdede yalnızca sözleşmedeki alanları gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...pickerRoutes,
      '/payments': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)).toBeDefined());

    expect(Object.keys(postBody(fetchMock)!).sort()).toEqual([
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
   * REGRESYON — TÜRETİLEN ALANLAR VE TENANT KİMLİĞİ GÖVDEYE GİRMEZ.
   *
   * Backend `allocated_minor`, `remaining_minor` ve `company_id` için
   * `prohibited` yazıyor: gönderilirse 422. Sessizce yok saymak,
   * kullanıcının "gönderdiğim değer uygulandı" sanmasına yol açardı.
   */
  it('türetilen alanları ve şirket kimliğini göndermez', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...pickerRoutes,
      '/payments': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)).toBeDefined());

    const body = postBody(fetchMock)!;
    expect(body).not.toHaveProperty('allocated_minor');
    expect(body).not.toHaveProperty('remaining_minor');
    expect(body).not.toHaveProperty('company_id');
    expect(body).not.toHaveProperty('active_company_id');
    expect(body).not.toHaveProperty('voided_at');
    expect(body).not.toHaveProperty('void_reason');
  });

  it('para birimini her zaman TRY olarak gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...pickerRoutes,
      '/payments': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)?.currency).toBe('TRY'));
  });

  it('boş bırakılan yöntem ve notu null gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...pickerRoutes,
      '/payments': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)).toBeDefined());

    const body = postBody(fetchMock)!;
    expect(body.method).toBeNull();
    expect(body.note).toBeNull();
  });

  /** `method` serbest metindir; arayüz bir listeye zorlamaz. */
  it('yazılan yöntemi serbest metin olarak gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...pickerRoutes,
      '/payments': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.type(screen.getByLabelText('Yöntem'), 'Kredi kartı');
    await user.type(screen.getByLabelText('Not'), 'Ağustos tahsilatı');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() =>
      expect(postBody(fetchMock)).toMatchObject({
        method: 'Kredi kartı',
        note: 'Ağustos tahsilatı',
      }),
    );
  });

  it('yöntem alanını seçim listesine dönüştürmez', async () => {
    vi.stubGlobal('fetch', mockApi({ ...ownerSession, ...pickerRoutes }));

    renderApp('/app/payments/new', { token: 'gecerli-token' });

    // Serbest metin: backend'de enum yok, arayüz de uydurmaz.
    expect(await screen.findByLabelText('Yöntem')).toHaveProperty('tagName', 'INPUT');
  });

  it('seçilen tarihi sözleşme biçiminde gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...pickerRoutes,
      '/payments': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/new', { token: 'gecerli-token' });

    fireEvent.change(await screen.findByLabelText('Tarih'), { target: { value: '2026-07-01' } });
    await user.type(screen.getByLabelText('Tutar'), '100');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)?.financial_date).toBe('2026-07-01'));
  });

  /** `amount_minor` min:0 — sıfır tutar sözleşmeye uygundur, engellenmez. */
  it('sıfır tutarı istemcide engellemez', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...pickerRoutes,
      '/payments': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await fillRequired(user, '0');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)?.amount_minor).toBe(0));
  });

  // -------------------------------------------------------------- müşteri

  it('müşteri seçeneklerini yalnızca müşteri ucundan doldurur', async () => {
    vi.stubGlobal('fetch', mockApi({ ...ownerSession, ...pickerRoutes }));

    renderApp('/app/payments/new', { token: 'gecerli-token' });

    const select = await screen.findByLabelText('Müşteri');

    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Zeynep Kaya' })).toBeInTheDocument(),
    );

    // Boş seçenek + iki müşteri.
    expect(select.querySelectorAll('option')).toHaveLength(3);
  });

  it('müşteri seçicisini ucun izin verdiği en büyük sayfayla doldurur', async () => {
    const fetchMock = mockApi({ ...ownerSession, ...pickerRoutes });

    vi.stubGlobal('fetch', fetchMock);
    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await screen.findByLabelText('Müşteri');

    await waitFor(() => {
      const call = fetchMock.mock.calls
        .map(([url]) => String(url))
        .find((url) => url.includes('/customers?'));

      expect(call).toContain('per_page=100');
    });
  });

  /** Müşterisiz ödeme geçerlidir: hedefsiz avans. */
  it('müşteri seçilmediyse null gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...pickerRoutes,
      '/payments': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)?.customer_id).toBeNull());
  });

  it('seçilen müşterinin kimliğini gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...pickerRoutes,
      '/payments': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await fillRequired(user);
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Zeynep Kaya' })).toBeInTheDocument(),
    );
    await user.selectOptions(screen.getByLabelText('Müşteri'), '501');

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)?.customer_id).toBe(501));
  });

  // ------------------------------------------------------------ dağıtımlar

  /**
   * REGRESYON — DAĞITIM YOKSA `allocations: []` GÖNDERİLİR.
   *
   * Alanın DÜŞMESİ YASAK. Backend kuralı `sometimes` olduğu için eksik
   * gövde 422 vermez; servis `$attributes['allocations'] ?? []` diyerek
   * boş liste varsayar ve `replaceAllocations` önce hepsini SİLER. Yani
   * alanı düşürmek "dokunma" değil, "hepsini sil" demektir. Oluşturmada
   * sonucu aynı görünse de sözleşme tek olmalı: alan her zaman gider.
   */
  it('hiç dağıtım yokken allocations alanını boş dizi olarak gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...pickerRoutes,
      '/payments': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)).toBeDefined());

    const body = postBody(fetchMock)!;
    expect(body.allocations).toEqual([]);
    // Alan gövdede BULUNMALI; eksik olması boş dizi göndermekle aynı değil.
    expect(Object.keys(body)).toContain('allocations');
  });

  it('başlangıçta hiç dağıtım satırı göstermez', async () => {
    vi.stubGlobal('fetch', mockApi({ ...ownerSession, ...pickerRoutes }));

    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await screen.findByLabelText('Tutar');

    expect(screen.getByRole('button', { name: 'Dağıtım ekle' })).toBeInTheDocument();
    expect(screen.queryByTestId('allocation-row-1')).not.toBeInTheDocument();
  });

  it('dağıtım satırı ekler ve gövdede gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...pickerRoutes,
      '/payments': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Dağıtım ekle' }));

    await screen.findByTestId('allocation-row-1');
    await user.selectOptions(screen.getByLabelText('Finans kaydı 1'), '900');
    await user.type(screen.getByLabelText('Dağıtım tutarı 1'), '500,00');

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() =>
      expect(postBody(fetchMock)?.allocations).toEqual([
        { finance_entry_id: 900, amount_minor: 50000 },
      ]),
    );
  });

  it('birden çok dağıtım satırını sırayla gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...pickerRoutes,
      '/payments': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await fillRequired(user);

    await user.click(screen.getByRole('button', { name: 'Dağıtım ekle' }));
    await screen.findByTestId('allocation-row-1');
    await user.selectOptions(screen.getByLabelText('Finans kaydı 1'), '900');
    await user.type(screen.getByLabelText('Dağıtım tutarı 1'), '500,00');

    await user.click(screen.getByRole('button', { name: 'Dağıtım ekle' }));
    await screen.findByTestId('allocation-row-2');
    await user.selectOptions(screen.getByLabelText('Finans kaydı 2'), '901');
    await user.type(screen.getByLabelText('Dağıtım tutarı 2'), '700,00');

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() =>
      expect(postBody(fetchMock)?.allocations).toEqual([
        { finance_entry_id: 900, amount_minor: 50000 },
        { finance_entry_id: 901, amount_minor: 70000 },
      ]),
    );
  });

  it('silinen dağıtım satırını gövdeye koymaz', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...pickerRoutes,
      '/payments': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await fillRequired(user);

    await user.click(screen.getByRole('button', { name: 'Dağıtım ekle' }));
    await screen.findByTestId('allocation-row-1');
    await user.selectOptions(screen.getByLabelText('Finans kaydı 1'), '900');
    await user.type(screen.getByLabelText('Dağıtım tutarı 1'), '500,00');

    const row = screen.getByTestId('allocation-row-1');
    await user.click(within(row).getByRole('button', { name: 'Satırı sil' }));

    await waitFor(() => expect(screen.queryByTestId('allocation-row-1')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() => expect(postBody(fetchMock)?.allocations).toEqual([]));
  });

  /** Dağıtım tutarı da money.ts'ten geçer; float'a uğramaz. */
  it('dağıtım tutarını kuruşa çevirir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...pickerRoutes,
      '/payments': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Dağıtım ekle' }));

    await screen.findByTestId('allocation-row-1');
    await user.selectOptions(screen.getByLabelText('Finans kaydı 1'), '900');
    await user.type(screen.getByLabelText('Dağıtım tutarı 1'), '1.234,56');

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    await waitFor(() =>
      expect(postBody(fetchMock)?.allocations).toEqual([
        { finance_entry_id: 900, amount_minor: 123456 },
      ]),
    );
  });

  it('okunamayan dağıtım tutarında istek göndermez', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...pickerRoutes,
      '/payments': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Dağıtım ekle' }));

    await screen.findByTestId('allocation-row-1');
    await user.selectOptions(screen.getByLabelText('Finans kaydı 1'), '900');
    await user.type(screen.getByLabelText('Dağıtım tutarı 1'), 'beş yüz');

    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(
      await screen.findByText('Geçerli bir tutar girin (örnek: 1.234,56).'),
    ).toBeInTheDocument();

    const posts = fetchMock.mock.calls.filter(
      ([url, init]) =>
        (init as RequestInit | undefined)?.method === 'POST' && String(url).includes('/payments'),
    );
    expect(posts).toHaveLength(0);
  });

  // ------------------------------------------------------ hedef seçicisi

  it('finans kaydı seçeneklerini yalnızca finans ucundan doldurur', async () => {
    vi.stubGlobal('fetch', mockApi({ ...ownerSession, ...pickerRoutes }));

    const user = userEvent.setup();
    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await screen.findByLabelText('Tutar');
    await user.click(screen.getByRole('button', { name: 'Dağıtım ekle' }));

    const select = await screen.findByLabelText('Finans kaydı 1');

    // Boş seçenek + iki kayıt. Uydurma bir hedef eklenmemeli.
    await waitFor(() => expect(select.querySelectorAll('option')).toHaveLength(3));
  });

  it('finans kaydı seçicisini ucun izin verdiği en büyük sayfayla doldurur', async () => {
    const fetchMock = mockApi({ ...ownerSession, ...pickerRoutes });

    vi.stubGlobal('fetch', fetchMock);
    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await screen.findByLabelText('Tutar');

    await waitFor(() => {
      const call = fetchMock.mock.calls
        .map(([url]) => String(url))
        .find((url) => url.includes('/finance-entries?'));

      expect(call).toContain('per_page=100');
    });
  });

  /**
   * REGRESYON — İPTAL EDİLMİŞ FİNANS KAYDI GİZLENMEZ, ETİKETLENİR.
   *
   * Backend'in `exists` kuralı iptal edilmiş kayıtları dışlamıyor: yani
   * sözleşmeye göre onlara dağıtım yapılabilir. Seçenekten çıkarmak,
   * backend'de olmayan bir kuralı istemcide uygulamak olurdu (playbook
   * §3.1). Ama kullanıcı ne seçtiğini bilmeli.
   */
  it('iptal edilmiş finans kaydını seçenekte gösterir ve etiketler', async () => {
    vi.stubGlobal('fetch', mockApi({ ...ownerSession, ...pickerRoutes }));

    const user = userEvent.setup();
    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await screen.findByLabelText('Tutar');
    await user.click(screen.getByRole('button', { name: 'Dağıtım ekle' }));

    const select = await screen.findByLabelText('Finans kaydı 1');

    await waitFor(() => expect(select.querySelectorAll('option')).toHaveLength(3));

    const voidedOption = within(select).getByRole('option', { name: /İptal edildi/ });
    expect(voidedOption).toHaveValue('901');

    const activeOption = within(select).getByRole('option', { name: /#900/ });
    expect(activeOption.textContent).not.toContain('İptal edildi');
  });

  // ------------------------------------------------------------ doğrulama

  it('okunamayan tutarda istek göndermez ve alan altında uyarır', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      ...pickerRoutes,
      '/payments': () => jsonResponse(201, { data: created }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/new', { token: 'gecerli-token' });

    fireEvent.change(await screen.findByLabelText('Tarih'), { target: { value: '2026-08-22' } });
    await user.type(screen.getByLabelText('Tutar'), 'bin lira');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(
      await screen.findByText('Geçerli bir tutar girin (örnek: 1.234,56).'),
    ).toBeInTheDocument();

    const posts = fetchMock.mock.calls.filter(
      ([url, init]) =>
        (init as RequestInit | undefined)?.method === 'POST' && String(url).includes('/payments'),
    );
    expect(posts).toHaveLength(0);
  });

  it('422 alan hatalarını ilgili alanların altında gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...pickerRoutes,
        '/payments': () =>
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
    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Tutar alanı zorunludur.')).toBeInTheDocument();
    expect(screen.getByText('Tarih biçimi geçersiz.')).toBeInTheDocument();
  });

  /**
   * AŞIM HATASININ BİRİNCİ ŞEKLİ — FormRequest yolu.
   *
   * Normal akışta gelen budur: 422 + `errors.allocations`, `code` YOK.
   * Hata satırlara değil TOPLAMA aittir; hangi satırın "fazla" olduğu
   * söylenemez, bu yüzden dağıtım bölümünün altında gösterilir.
   */
  it('dağıtım aşımını alan hatası şeklinde gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...pickerRoutes,
        '/payments': () =>
          jsonResponse(422, {
            message: 'Gönderilen bilgiler geçersiz.',
            errors: { allocations: ['Dağıtım toplamı ödeme tutarını aşamaz.'] },
          }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Dağıtım toplamı ödeme tutarını aşamaz.')).toBeInTheDocument();
  });

  /**
   * AŞIM HATASININ İKİNCİ ŞEKLİ — servis yolu.
   *
   * Eşzamanlı iki istek FormRequest kontrolünü atlatırsa devreye giren
   * son savunma: 422 + `code: payment_over_allocated`, `errors` YOK.
   * Aynı kural, farklı gövde. Yalnızca birine göre yazılmış bir arayüzde
   * bu hata sessizce kaybolurdu.
   */
  it('dağıtım aşımını makine kodlu şekliyle de gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...pickerRoutes,
        '/payments': () =>
          jsonResponse(422, {
            message: 'Dağıtım toplamı ödeme tutarını aşamaz.',
            code: 'payment_over_allocated',
          }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Dağıtım toplamı ödeme tutarını aşamaz.',
    );
  });

  /** Başka tenant'ın kaydı `exists` kuralına takılır: 422, 404 değil. */
  it('başka tenanta ait hedef için 422 metnini gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...pickerRoutes,
        '/payments': () =>
          jsonResponse(422, {
            message: 'Gönderilen bilgiler geçersiz.',
            errors: { 'allocations.0.finance_entry_id': ['Seçilen finans kaydı geçersiz.'] },
          }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByText('Seçilen finans kaydı geçersiz.')).toBeInTheDocument();
  });

  it('403 durumunda bölümün sahiplere açık olduğunu söyler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...memberSession,
        ...pickerRoutes,
        '/payments': () => jsonResponse(403, { message: 'This action is unauthorized.' }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/payments/new', { token: 'gecerli-token' });

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
      if (url.includes('/finance-entries')) {
        return jsonResponse(200, fixtures.paginated([activeEntry], 1));
      }
      if (init?.method === 'POST') return pendingPost;

      return jsonResponse(404, { message: 'Taklit edilmemiş uç' });
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await fillRequired(user);

    const submit = screen.getByRole('button', { name: 'Kaydet' });
    await user.click(submit);

    await waitFor(() => expect(submit).toBeDisabled());
    await user.click(submit);

    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);

    /**
     * ASKIDAKİ İSTEK ÇÖZÜLÜR VE SONUCU BEKLENİR.
     *
     * Yalnızca `resolve` çağırıp testi bitirmek, isteği başlattığı hâlde
     * bitişini beklemeyen bir test bırakıyordu. Yanıt geldiğinde bileşen
     * `setSubmitting(false)` yapar ve ödemeye gezinir; ikisi de testin son
     * iddiasından SONRA, `act()` dışında çalışıyordu.
     *
     * Düğmenin kaybolmasını beklemek bunu gerçek bir iddiaya çevirir:
     * gönderim tamamlanınca form kapanır. İddia gevşemedi, arttı.
     */
    deferred.resolve?.(jsonResponse(201, { data: created }));

    await waitForElementToBeRemoved(submit);
  });

  // ------------------------------------------------------------- sonuçlar

  /**
   * Kayıt oluşunca kullanıcı SUNUCUNUN dağıtım hesabını görür.
   */
  it('oluşturma sonrası ödemenin ayrıntısına gider', async () => {
    const withAllocation = fixtures.payment({
      id: 800,
      amount_minor: 120000,
      allocations: [fixtures.paymentAllocation({ id: 1, amount_minor: 50000 })],
      allocated_minor: 50000,
      remaining_minor: 70000,
    });

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        ...pickerRoutes,
        '/payments/800': () => jsonResponse(200, { data: withAllocation }),
        '/payments': () => jsonResponse(201, { data: withAllocation }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/payments/new', { token: 'gecerli-token' });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(await screen.findByTestId('payment-allocated')).toHaveTextContent('500,00 TL');
    expect(screen.getByTestId('payment-remaining')).toHaveTextContent('700,00 TL');
  });

  it('vazgeçme bağlantısı listeye döner', async () => {
    vi.stubGlobal('fetch', mockApi({ ...ownerSession, ...pickerRoutes }));

    renderApp('/app/payments/new', { token: 'gecerli-token' });

    expect(await screen.findByRole('link', { name: 'Vazgeç' })).toHaveAttribute(
      'href',
      '/app/payments',
    );
  });
});
