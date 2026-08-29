import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bodyOf, fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';
import { tokenStorage } from '@/lib/auth/tokenStorage';

/**
 * Ödeme ayrıntısı ve iptal.
 *
 * Backend sözleşmesi:
 *   GET  /payments/{id}       → 200 { data } | 404
 *   POST /payments/{id}/void  → 200 { data } | 422
 *
 * 404 ile 403 BİRBİRİNE ÇEVRİLMEZ:
 *   404 → kayıt yok ya da başka tenant'ın (route model binding
 *         CompanyScope'a takılır, controller'a hiç ulaşmaz)
 *   403 → kayıt var, kullanıcı üye, ama rol yetkisi yok
 * Birini diğerinin diliyle anlatmak, backend'in bilerek sakladığı bilgiyi
 * geri sızdırmak ya da olmayan bir yetki sorunu uydurmak olurdu.
 *
 * İPTAL SİLME DEĞİLDİR VE DAĞITIMLARI SİLMEZ. "Bu para neye sayılmıştı"
 * sorusu iptalden sonra da cevaplanabilmeli; raporlarda sayılmaması iptal
 * işaretinden gelir, satırların yok olmasından değil. Aşağıda kilitli.
 *
 * İPTAL TERMİNALDİR: iptal edilmiş ödeme ne düzenlenir ne yeniden iptal
 * edilir (422 + payment_voided / payment_already_voided).
 *
 * İPTALDEN SONRA İKİNCİ BİR GET ATILMAZ: uç 204 değil 200 döner ve kaydın
 * yeni hâlini taşır.
 *
 * TEKNİK NOT: `finance_entry` özeti `currency` TAŞIMAZ; hedefin tutarı
 * ÖDEMENİN para birimiyle biçimlenir. Backend çok para birimini
 * desteklediğinde PaymentResource'un bu özetine `currency` eklenmelidir.
 */
describe('PaymentDetailPage', () => {
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

  const advance = fixtures.payment({
    id: 801,
    method: null,
    note: null,
    customer: null,
    allocations: [],
    allocated_minor: 0,
    remaining_minor: 120000,
  });

  const voidedPayment = fixtures.payment({
    id: 802,
    amount_minor: 45000,
    allocations: [fixtures.paymentAllocation({ id: 2, amount_minor: 45000 })],
    allocated_minor: 45000,
    remaining_minor: 0,
    voided_at: '2026-08-23T08:00:00+00:00',
    void_reason: 'Mükerrer tahsilat',
  });

  function voidBody(fetchMock: ReturnType<typeof mockApi>): Record<string, unknown> | undefined {
    const call = fetchMock.mock.calls.find(([url, init]) => {
      const method = (init as RequestInit | undefined)?.method;
      return method === 'POST' && String(url).includes('/void');
    });
    return bodyOf(call?.[1] as RequestInit | undefined) as Record<string, unknown> | undefined;
  }

  // ------------------------------------------------------------ gösterim

  it('ödemenin tarihini, yöntemini ve notunu gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...ownerSession, '/payments/800': () => jsonResponse(200, { data: payment }) }),
    );

    renderApp('/app/payments/800', { token: 'gecerli-token' });

    expect(await screen.findByRole('heading', { name: 'Ödeme' })).toBeInTheDocument();
    expect(screen.getByTestId('payment-date')).toHaveTextContent('22.08.2026');
    expect(screen.getByTestId('payment-method')).toHaveTextContent('Havale');
    expect(screen.getByTestId('payment-note')).toHaveTextContent('Ağustos tahsilatı');
  });

  /**
   * REGRESYON — ÜÇ TUTAR DA YANITTAN GELİR.
   *
   * Değişmez: amount = allocated + remaining. Arayüz birini diğerlerinden
   * çıkarmaz; çıkarsaydı backend kuralı değiştirdiği gün sessizce yanlış
   * sonuç gösterirdi.
   */
  it('tutar, dağıtılan ve kalanı Türkçe para biçiminde gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...ownerSession, '/payments/800': () => jsonResponse(200, { data: payment }) }),
    );

    renderApp('/app/payments/800', { token: 'gecerli-token' });

    expect(await screen.findByTestId('payment-amount')).toHaveTextContent('1.200,00 TL');
    expect(screen.getByTestId('payment-allocated')).toHaveTextContent('500,00 TL');
    expect(screen.getByTestId('payment-remaining')).toHaveTextContent('700,00 TL');
  });

  it('dağıtımları hedefi ve tutarıyla listeler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...ownerSession, '/payments/800': () => jsonResponse(200, { data: payment }) }),
    );

    renderApp('/app/payments/800', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Dağıtımlar' });
    const row = within(table).getByTestId('allocation-row-1');

    expect(within(row).getByTestId('allocation-target')).toHaveTextContent('#900');
    expect(within(row).getByTestId('allocation-target')).toHaveTextContent('20.08.2026');
    expect(within(row).getByTestId('allocation-amount')).toHaveTextContent('500,00 TL');
  });

  /**
   * REGRESYON — HEDEFİN TUTARI ÖDEMENİN PARA BİRİMİYLE BİÇİMLENİR.
   *
   * `finance_entry` özeti `currency` taşımıyor. Uydurma bir birim
   * yazmaktansa ödemenin birimi devredilir; ikisi bugün DB kısıtıyla
   * zaten aynı.
   */
  it('hedef tutarını ödemenin para birimiyle biçimlendirir', async () => {
    const euroPayment = fixtures.payment({
      id: 803,
      currency: 'EUR',
      amount_minor: 120000,
      allocations: [fixtures.paymentAllocation({ id: 3, amount_minor: 50000 })],
      allocated_minor: 50000,
      remaining_minor: 70000,
    });

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/payments/803': () => jsonResponse(200, { data: euroPayment }),
      }),
    );

    renderApp('/app/payments/803', { token: 'gecerli-token' });

    const target = await screen.findByTestId('allocation-target');

    expect(target).toHaveTextContent('1.234,56 EUR');
  });

  /**
   * `finance_entry` yanıtta NULL olabilir (FK nullable). Arayüz çökmez ve
   * uydurma bir hedef yazmaz.
   */
  it('hedefi olmayan dağıtımda uydurma bilgi üretmez', async () => {
    const orphan = fixtures.payment({
      id: 804,
      allocations: [fixtures.paymentAllocation({ id: 4, amount_minor: 10000, finance_entry: null })],
      allocated_minor: 10000,
      remaining_minor: 110000,
    });

    vi.stubGlobal(
      'fetch',
      mockApi({ ...ownerSession, '/payments/804': () => jsonResponse(200, { data: orphan }) }),
    );

    renderApp('/app/payments/804', { token: 'gecerli-token' });

    const target = await screen.findByTestId('allocation-target');

    expect(target).toHaveTextContent('Hedef kaydı görüntülenemiyor');
    expect(screen.getByTestId('allocation-amount')).toHaveTextContent('100,00 TL');
  });

  /** Hedefsiz avans geçerli bir durumdur; hata gibi gösterilmez. */
  it('hiç dağıtımı olmayan ödemede boş durum gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...ownerSession, '/payments/801': () => jsonResponse(200, { data: advance }) }),
    );

    renderApp('/app/payments/801', { token: 'gecerli-token' });

    expect(await screen.findByText('Bu ödeme henüz bir kayda dağıtılmadı.')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Dağıtımlar' })).not.toBeInTheDocument();
  });

  it('müşteriyi numarası ve adıyla gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...ownerSession, '/payments/800': () => jsonResponse(200, { data: payment }) }),
    );

    renderApp('/app/payments/800', { token: 'gecerli-token' });

    const customer = await screen.findByTestId('payment-customer');

    expect(customer).toHaveTextContent('Zeynep Kaya');
    expect(customer).toHaveTextContent('12');
  });

  it('müşterisi, yöntemi ve notu olmayan ödemede uydurma değer göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...ownerSession, '/payments/801': () => jsonResponse(200, { data: advance }) }),
    );

    renderApp('/app/payments/801', { token: 'gecerli-token' });

    expect(await screen.findByTestId('payment-customer')).toHaveTextContent('—');
    expect(screen.getByTestId('payment-method')).toHaveTextContent('—');
    expect(screen.getByTestId('payment-note')).toHaveTextContent('—');
  });

  // -------------------------------------------------------------- durum

  it('aktif ödemede düzenleme ve iptal eylemlerini sunar', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...ownerSession, '/payments/800': () => jsonResponse(200, { data: payment }) }),
    );

    renderApp('/app/payments/800', { token: 'gecerli-token' });

    expect(await screen.findByTestId('payment-status')).toHaveTextContent('Aktif');
    expect(screen.getByRole('link', { name: 'Düzenle' })).toHaveAttribute(
      'href',
      '/app/payments/800/edit',
    );
    expect(screen.getByRole('button', { name: 'İptal et' })).toBeInTheDocument();
  });

  /**
   * REGRESYON — İPTAL TERMİNALDİR.
   *
   * Backend hem düzenlemeyi hem yeniden iptali 422 ile reddediyor.
   * Arayüz bu eylemleri hiç sunmamalı: sunup 422 almak, kullanıcıya
   * çalışmayan bir düğme göstermektir.
   */
  it('iptal edilmiş ödemede düzenleme ve iptal eylemlerini sunmaz', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/payments/802': () => jsonResponse(200, { data: voidedPayment }),
      }),
    );

    renderApp('/app/payments/802', { token: 'gecerli-token' });

    expect(await screen.findByTestId('payment-status')).toHaveTextContent('İptal edildi');
    expect(screen.queryByRole('link', { name: 'Düzenle' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'İptal et' })).not.toBeInTheDocument();
  });

  it('iptal tarihini ve sebebini gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/payments/802': () => jsonResponse(200, { data: voidedPayment }),
      }),
    );

    renderApp('/app/payments/802', { token: 'gecerli-token' });

    expect(await screen.findByTestId('payment-void-reason')).toHaveTextContent(
      'Mükerrer tahsilat',
    );
    expect(screen.getByTestId('payment-voided-at')).toBeInTheDocument();
  });

  /**
   * REGRESYON — İPTAL EDİLMİŞ ÖDEMENİN DAĞITIMLARI KORUNUR.
   *
   * Backend `void` sırasında dağıtımlara DOKUNMUYOR: "bu para neye
   * sayılmıştı" sorusu iptalden sonra da cevaplanabilmeli. Arayüz de
   * onları gizlemez — gizlemek, veritabanında duran bir gerçeği ekranda
   * yok saymak olurdu.
   */
  it('iptal edilmiş ödemenin dağıtımlarını göstermeye devam eder', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/payments/802': () => jsonResponse(200, { data: voidedPayment }),
      }),
    );

    renderApp('/app/payments/802', { token: 'gecerli-token' });

    const table = await screen.findByRole('table', { name: 'Dağıtımlar' });

    expect(within(table).getByTestId('allocation-row-2')).toBeInTheDocument();
    expect(screen.getByTestId('payment-allocated')).toHaveTextContent('450,00 TL');
  });

  /** Silme YOKTUR: backend'de DELETE ucu yok. */
  it('silme eylemi sunmaz', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...ownerSession, '/payments/800': () => jsonResponse(200, { data: payment }) }),
    );

    renderApp('/app/payments/800', { token: 'gecerli-token' });

    await screen.findByTestId('payment-status');

    expect(screen.queryByRole('button', { name: 'Sil' })).not.toBeInTheDocument();
  });

  // --------------------------------------------------------------- iptal

  it('iptal onay ister ve onaysız istek göndermez', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      '/payments/800': () => jsonResponse(200, { data: payment }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/800', { token: 'gecerli-token' });

    await screen.findByTestId('payment-status');
    await user.click(screen.getByRole('button', { name: 'İptal et' }));

    expect(await screen.findByTestId('payment-void-confirm')).toHaveTextContent(
      /iptal edilecek ve geri alınamayacak/i,
    );

    const voids = fetchMock.mock.calls.filter(([url]) => String(url).includes('/void'));
    expect(voids).toHaveLength(0);
  });

  it('vazgeçilirse iptal isteği göndermez', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      '/payments/800': () => jsonResponse(200, { data: payment }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/800', { token: 'gecerli-token' });

    await screen.findByTestId('payment-status');
    await user.click(screen.getByRole('button', { name: 'İptal et' }));

    const confirm = await screen.findByTestId('payment-void-confirm');
    await user.click(within(confirm).getByRole('button', { name: 'Vazgeç' }));

    await waitFor(() =>
      expect(screen.queryByTestId('payment-void-confirm')).not.toBeInTheDocument(),
    );

    const voids = fetchMock.mock.calls.filter(([url]) => String(url).includes('/void'));
    expect(voids).toHaveLength(0);
  });

  /**
   * Sebep BOŞ BIRAKILSA BİLE alan gövdede gider (null olarak). "Bazen
   * gönder, bazen gönderme" iki farklı gövde şekli demektir ve biri er ya
   * da geç test edilmemiş kalır.
   */
  it('onaylanınca iptal isteği gönderir ve sebebi null olarak taşır', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      '/payments/800/void': () =>
        jsonResponse(200, {
          data: { ...payment, voided_at: '2026-08-24T10:00:00+00:00', void_reason: null },
        }),
      '/payments/800': () => jsonResponse(200, { data: payment }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/800', { token: 'gecerli-token' });

    await screen.findByTestId('payment-status');
    await user.click(screen.getByRole('button', { name: 'İptal et' }));
    await user.click(await screen.findByRole('button', { name: 'Evet, iptal et' }));

    await waitFor(() => expect(voidBody(fetchMock)).toEqual({ reason: null }));
  });

  it('yazılan iptal sebebini gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      '/payments/800/void': () =>
        jsonResponse(200, {
          data: {
            ...payment,
            voided_at: '2026-08-24T10:00:00+00:00',
            void_reason: 'Mükerrer tahsilat',
          },
        }),
      '/payments/800': () => jsonResponse(200, { data: payment }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/800', { token: 'gecerli-token' });

    await screen.findByTestId('payment-status');
    await user.click(screen.getByRole('button', { name: 'İptal et' }));

    await user.type(await screen.findByLabelText('İptal sebebi'), 'Mükerrer tahsilat');
    await user.click(screen.getByRole('button', { name: 'Evet, iptal et' }));

    await waitFor(() => expect(voidBody(fetchMock)).toEqual({ reason: 'Mükerrer tahsilat' }));
  });

  /**
   * İptal 200 döner ve kaydın yeni hâlini taşır; ekran o hâli gösterir,
   * ikinci bir GET atmaz. Dağıtımlar yanıtta yerinde durur.
   */
  it('iptalden sonra yeni durumu gösterir ve dağıtımları korur', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      '/payments/800/void': () =>
        jsonResponse(200, {
          data: {
            ...payment,
            voided_at: '2026-08-24T10:00:00+00:00',
            void_reason: 'Mükerrer tahsilat',
          },
        }),
      '/payments/800': () => jsonResponse(200, { data: payment }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/payments/800', { token: 'gecerli-token' });

    await screen.findByTestId('payment-status');
    await user.click(screen.getByRole('button', { name: 'İptal et' }));
    await user.click(await screen.findByRole('button', { name: 'Evet, iptal et' }));

    await waitFor(() =>
      expect(screen.getByTestId('payment-status')).toHaveTextContent('İptal edildi'),
    );

    expect(screen.getByTestId('payment-void-reason')).toHaveTextContent('Mükerrer tahsilat');
    expect(screen.getByTestId('allocation-row-1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'İptal et' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Düzenle' })).not.toBeInTheDocument();
  });

  /**
   * Kayıt başka bir oturumda iptal edilmişse 422 + `payment_already_voided`
   * döner. Backend'in metni gösterilmeye uygun yazılmıştır; uydurma bir
   * metinle değiştirilmez.
   */
  it('zaten iptal edilmiş ödemede backendin açıklamasını gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/payments/800/void': () =>
          jsonResponse(422, {
            message: 'Bu ödeme zaten iptal edilmiş.',
            code: 'payment_already_voided',
          }),
        '/payments/800': () => jsonResponse(200, { data: payment }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/payments/800', { token: 'gecerli-token' });

    await screen.findByTestId('payment-status');
    await user.click(screen.getByRole('button', { name: 'İptal et' }));
    await user.click(await screen.findByRole('button', { name: 'Evet, iptal et' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Bu ödeme zaten iptal edilmiş.');
  });

  // ---------------------------------------------------------------- hata

  it('bilinmeyen ödemede bulunamadı der, yetki hatası demez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/payments/999': () => jsonResponse(404, { message: 'Kayıt bulunamadı.' }),
      }),
    );

    renderApp('/app/payments/999', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Ödeme bulunamadı.');
    expect(alert.textContent).not.toMatch(/yetki|erişim reddedildi/i);

    expect(screen.getByRole('link', { name: 'Ödemelere dön' })).toHaveAttribute(
      'href',
      '/app/payments',
    );
  });

  /** 403 kaydın VAR OLDUĞUNU ama yetkinin eksik olduğunu söyler. */
  it('403 durumunda bölümün sahiplere açık olduğunu söyler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...memberSession,
        '/payments/800': () => jsonResponse(403, { message: 'This action is unauthorized.' }),
      }),
    );

    renderApp('/app/payments/800', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Bu bölüm yalnızca şirket sahiplerine açıktır.');
    expect(alert.textContent).not.toMatch(/bulunamadı/i);
  });

  it('sunucu hatasında ham metni göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/payments/800': () => jsonResponse(500, { message: 'Server Error' }),
      }),
    );

    renderApp('/app/payments/800', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Beklenmedik bir hata oluştu.');
    expect(alert.textContent).not.toContain('Server Error');
  });

  it('401 durumunda oturumu kapatır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/payments/800': () => jsonResponse(401, { message: 'Unauthenticated.' }),
      }),
    );

    renderApp('/app/payments/800', { token: 'artik-gecersiz' });

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
    await waitFor(() => expect(tokenStorage.get()).toBeNull());
  });

  it('listeye dönüş bağlantısı verir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...ownerSession, '/payments/800': () => jsonResponse(200, { data: payment }) }),
    );

    renderApp('/app/payments/800', { token: 'gecerli-token' });

    expect(await screen.findByRole('link', { name: 'Ödemelere dön' })).toHaveAttribute(
      'href',
      '/app/payments',
    );
  });
});
