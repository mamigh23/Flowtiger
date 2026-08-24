import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bodyOf, fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';
import { tokenStorage } from '@/lib/auth/tokenStorage';

/**
 * Finans kaydı ayrıntısı ve iptal.
 *
 * Backend sözleşmesi:
 *   GET  /finance-entries/{id}       → 200 { data } | 404
 *   POST /finance-entries/{id}/void  → 200 { data } | 422
 *
 * 404 KRİTİK: başka tenant'ın kaydı da 404 döner, 403 değil. Route model
 * binding sorgusu CompanyScope'un altından geçer ve kayıt hiç bulunmaz.
 * Arayüz bunu "bulunamadı" olarak gösterir; "yetkiniz yok" demek
 * backend'in bilerek sakladığı bilgiyi geri sızdırırdı.
 *
 * 403 ise BAŞKA BİR ŞEY: kayıt vardır, kullanıcı da şirketin üyesidir,
 * eksik olan yalnızca rol yetkisidir (FinanceEntryPolicy owner-only).
 * İki durum aynı metinle gösterilemez.
 *
 * SİLME YOKTUR, İPTAL VARDIR. Backend'de DELETE ucu yok. Silinmiş bir
 * gelir kaydı geçmiş bir dönemin toplamını sessizce değiştirirdi; iptal
 * ise kaydı yerinde bırakır ve neden iptal edildiğini saklar.
 *
 * İPTAL TERMİNALDİR: iptal edilmiş kayıt ne değiştirilebilir ne yeniden
 * iptal edilebilir. Backend ikisini de 422 + makine-okunur kodla
 * reddeder; arayüz de bu eylemleri hiç sunmaz.
 *
 * BU EKRANDA HESAP YAPILMAZ: net, KDV ve brüt sunucudan gelir, ekran
 * yalnızca biçimlendirir.
 */
describe('FinanceEntryDetailPage', () => {
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

  const entry = fixtures.financeEntry({
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

  const voidedEntry = fixtures.financeEntry({
    id: 901,
    direction: 'out',
    financial_date: '2026-08-18',
    category: null,
    note: null,
    net_minor: 30000,
    vat_rate_bp: null,
    vat_minor: 0,
    gross_minor: 30000,
    calculation: { basis: 'net', rounding: 'half_up', vat_applicable: false },
    voided_at: '2026-08-21T08:00:00+00:00',
    void_reason: 'Yanlış tutar girilmiş',
  });

  function voidBody(fetchMock: ReturnType<typeof mockApi>): Record<string, unknown> | undefined {
    const call = fetchMock.mock.calls.find(([url, init]) => {
      const method = (init as RequestInit | undefined)?.method;
      return method === 'POST' && String(url).includes('/void');
    });
    return bodyOf(call?.[1] as RequestInit | undefined) as Record<string, unknown> | undefined;
  }

  // ------------------------------------------------------------ gösterim

  it('kaydın yönünü, tarihini, kategorisini ve notunu gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...ownerSession, '/finance-entries/900': () => jsonResponse(200, { data: entry }) }),
    );

    renderApp('/app/finance/900', { token: 'gecerli-token' });

    expect(await screen.findByRole('heading', { name: 'Gelir kaydı' })).toBeInTheDocument();
    expect(screen.getByTestId('finance-date')).toHaveTextContent('20.08.2026');
    expect(screen.getByTestId('finance-category')).toHaveTextContent('Danışmanlık');
    expect(screen.getByTestId('finance-note')).toHaveTextContent('Ağustos ayı hizmet bedeli');
  });

  /**
   * REGRESYON — ÜÇ TUTAR DA GÖSTERİLİR VE HEPSİ SUNUCUDAN GELİR.
   *
   * Yalnızca brüt gösterilseydi kullanıcı KDV'yi göremezdi; net'i
   * istemcide çıkarmak ise ikinci bir hesaplama motoru demek olurdu.
   */
  it('net, KDV ve brüt tutarları Türkçe para biçiminde gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...ownerSession, '/finance-entries/900': () => jsonResponse(200, { data: entry }) }),
    );

    renderApp('/app/finance/900', { token: 'gecerli-token' });

    expect(await screen.findByTestId('finance-net')).toHaveTextContent('1.028,80 TL');
    expect(screen.getByTestId('finance-vat')).toHaveTextContent('205,76 TL');
    expect(screen.getByTestId('finance-gross')).toHaveTextContent('1.234,56 TL');
  });

  it('KDV oranını yüzde olarak gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...ownerSession, '/finance-entries/900': () => jsonResponse(200, { data: entry }) }),
    );

    renderApp('/app/finance/900', { token: 'gecerli-token' });

    expect(await screen.findByTestId('finance-vat-rate')).toHaveTextContent('%20');
    // Ham baz puan kullanıcıya gösterilmez.
    expect(screen.getByTestId('finance-vat-rate').textContent).not.toContain('2000');
  });

  /**
   * AÇIKLANABİLİRLİK: sonucun NASIL çıktığı gösterilir — hangi esastan,
   * nasıl yuvarlanarak, KDV uygulanmış mı. Bu blok backend'de saklanmaz,
   * her okumada hesaplanır; arayüz onu yalnızca yansıtır.
   */
  it('hesabın nasıl yapıldığını açıklar', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...ownerSession, '/finance-entries/900': () => jsonResponse(200, { data: entry }) }),
    );

    renderApp('/app/finance/900', { token: 'gecerli-token' });

    const calculation = await screen.findByTestId('finance-calculation');

    expect(calculation).toHaveTextContent('Brüt üzerinden');
    expect(calculation).toHaveTextContent('Yarım yukarı yuvarlama');
    expect(calculation).toHaveTextContent('KDV uygulandı');
  });

  /**
   * REGRESYON — null ORAN İLE SIFIR ORAN AYRI GÖSTERİLİR (§A4).
   */
  it('KDV bilgisi taşımayan kaydı KDV yok olarak gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/finance-entries/901': () => jsonResponse(200, { data: voidedEntry }),
      }),
    );

    renderApp('/app/finance/901', { token: 'gecerli-token' });

    expect(await screen.findByTestId('finance-vat-rate')).toHaveTextContent('KDV yok');
    expect(screen.getByTestId('finance-calculation')).toHaveTextContent('KDV uygulanmadı');
  });

  it('sıfır oranlı kaydı KDV yoktan ayırır', async () => {
    const zeroRated = fixtures.financeEntry({
      id: 902,
      net_minor: 30000,
      vat_rate_bp: 0,
      vat_minor: 0,
      gross_minor: 30000,
      calculation: { basis: 'net', rounding: 'half_up', vat_applicable: true },
    });

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/finance-entries/902': () => jsonResponse(200, { data: zeroRated }),
      }),
    );

    renderApp('/app/finance/902', { token: 'gecerli-token' });

    expect(await screen.findByTestId('finance-vat-rate')).toHaveTextContent('%0');
    expect(screen.getByTestId('finance-calculation')).toHaveTextContent('KDV uygulandı');
  });

  it('müşteriyi numarası ve adıyla gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...ownerSession, '/finance-entries/900': () => jsonResponse(200, { data: entry }) }),
    );

    renderApp('/app/finance/900', { token: 'gecerli-token' });

    const customer = await screen.findByTestId('finance-customer');

    expect(customer).toHaveTextContent('Zeynep Kaya');
    expect(customer).toHaveTextContent('12');
  });

  it('müşterisi, kategorisi ve notu olmayan kayıtta uydurma değer göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/finance-entries/901': () => jsonResponse(200, { data: voidedEntry }),
      }),
    );

    renderApp('/app/finance/901', { token: 'gecerli-token' });

    expect(await screen.findByTestId('finance-customer')).toHaveTextContent('—');
    expect(screen.getByTestId('finance-category')).toHaveTextContent('—');
    expect(screen.getByTestId('finance-note')).toHaveTextContent('—');
  });

  // -------------------------------------------------------------- durum

  it('aktif kayıtta düzenleme ve iptal eylemlerini sunar', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...ownerSession, '/finance-entries/900': () => jsonResponse(200, { data: entry }) }),
    );

    renderApp('/app/finance/900', { token: 'gecerli-token' });

    expect(await screen.findByTestId('finance-status')).toHaveTextContent('Aktif');
    expect(screen.getByRole('link', { name: 'Düzenle' })).toHaveAttribute(
      'href',
      '/app/finance/900/edit',
    );
    expect(screen.getByRole('button', { name: 'İptal et' })).toBeInTheDocument();
  });

  /**
   * REGRESYON — İPTAL EDİLMİŞ KAYIT NE DÜZENLENİR NE YENİDEN İPTAL
   * EDİLİR.
   *
   * Backend ikisini de 422 ile reddediyor. Arayüz bu eylemleri hiç
   * sunmamalı: sunup 422 almak, kullanıcıya çalışmayan bir düğme
   * göstermektir.
   */
  it('iptal edilmiş kayıtta düzenleme ve iptal eylemlerini sunmaz', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/finance-entries/901': () => jsonResponse(200, { data: voidedEntry }),
      }),
    );

    renderApp('/app/finance/901', { token: 'gecerli-token' });

    expect(await screen.findByTestId('finance-status')).toHaveTextContent('İptal edildi');
    expect(screen.queryByRole('link', { name: 'Düzenle' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'İptal et' })).not.toBeInTheDocument();
  });

  it('iptal sebebini gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/finance-entries/901': () => jsonResponse(200, { data: voidedEntry }),
      }),
    );

    renderApp('/app/finance/901', { token: 'gecerli-token' });

    expect(await screen.findByTestId('finance-void-reason')).toHaveTextContent(
      'Yanlış tutar girilmiş',
    );
  });

  /** Silme YOKTUR: backend'de DELETE ucu yok. */
  it('silme eylemi sunmaz', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...ownerSession, '/finance-entries/900': () => jsonResponse(200, { data: entry }) }),
    );

    renderApp('/app/finance/900', { token: 'gecerli-token' });

    await screen.findByTestId('finance-status');

    expect(screen.queryByRole('button', { name: 'Sil' })).not.toBeInTheDocument();
  });

  // --------------------------------------------------------------- iptal

  it('iptal onay ister ve onaysız istek göndermez', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      '/finance-entries/900': () => jsonResponse(200, { data: entry }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/900', { token: 'gecerli-token' });

    await screen.findByTestId('finance-status');
    await user.click(screen.getByRole('button', { name: 'İptal et' }));

    // Onay metni geri alınamaz bir işlem yaptığını söylemeli.
    expect(await screen.findByTestId('finance-void-confirm')).toHaveTextContent(
      /iptal edilecek ve geri alınamayacak/i,
    );

    const voids = fetchMock.mock.calls.filter(([url]) => String(url).includes('/void'));
    expect(voids).toHaveLength(0);
  });

  it('vazgeçilirse iptal isteği göndermez', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      '/finance-entries/900': () => jsonResponse(200, { data: entry }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/900', { token: 'gecerli-token' });

    await screen.findByTestId('finance-status');
    await user.click(screen.getByRole('button', { name: 'İptal et' }));

    const confirm = await screen.findByTestId('finance-void-confirm');
    await user.click(within(confirm).getByRole('button', { name: 'Vazgeç' }));

    await waitFor(() =>
      expect(screen.queryByTestId('finance-void-confirm')).not.toBeInTheDocument(),
    );

    const voids = fetchMock.mock.calls.filter(([url]) => String(url).includes('/void'));
    expect(voids).toHaveLength(0);
  });

  /**
   * Sebep BOŞ BIRAKILSA BİLE alan gövdede gider (null olarak).
   *
   * "Bazen gönder, bazen gönderme" iki farklı gövde şekli demektir ve
   * ikisinden biri er ya da geç test edilmemiş kalır.
   */
  it('onaylanınca iptal isteği gönderir ve sebebi null olarak taşır', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      '/finance-entries/900/void': () =>
        jsonResponse(200, {
          data: { ...entry, voided_at: '2026-08-24T10:00:00+00:00', void_reason: null },
        }),
      '/finance-entries/900': () => jsonResponse(200, { data: entry }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/900', { token: 'gecerli-token' });

    await screen.findByTestId('finance-status');
    await user.click(screen.getByRole('button', { name: 'İptal et' }));
    await user.click(await screen.findByRole('button', { name: 'Evet, iptal et' }));

    await waitFor(() => expect(voidBody(fetchMock)).toEqual({ reason: null }));
  });

  it('yazılan iptal sebebini gönderir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      '/finance-entries/900/void': () =>
        jsonResponse(200, {
          data: {
            ...entry,
            voided_at: '2026-08-24T10:00:00+00:00',
            void_reason: 'Mükerrer kayıt',
          },
        }),
      '/finance-entries/900': () => jsonResponse(200, { data: entry }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/900', { token: 'gecerli-token' });

    await screen.findByTestId('finance-status');
    await user.click(screen.getByRole('button', { name: 'İptal et' }));

    await user.type(await screen.findByLabelText('İptal sebebi'), 'Mükerrer kayıt');
    await user.click(screen.getByRole('button', { name: 'Evet, iptal et' }));

    await waitFor(() => expect(voidBody(fetchMock)).toEqual({ reason: 'Mükerrer kayıt' }));
  });

  /**
   * İptal 204 değil 200 döner ve kaydın yeni hâlini taşır. Ekran o hâli
   * gösterir; ikinci bir GET atmaz.
   */
  it('iptalden sonra kaydın yeni durumunu gösterir', async () => {
    const fetchMock = mockApi({
      ...ownerSession,
      '/finance-entries/900/void': () =>
        jsonResponse(200, {
          data: {
            ...entry,
            voided_at: '2026-08-24T10:00:00+00:00',
            void_reason: 'Mükerrer kayıt',
          },
        }),
      '/finance-entries/900': () => jsonResponse(200, { data: entry }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/finance/900', { token: 'gecerli-token' });

    await screen.findByTestId('finance-status');
    await user.click(screen.getByRole('button', { name: 'İptal et' }));
    await user.click(await screen.findByRole('button', { name: 'Evet, iptal et' }));

    await waitFor(() =>
      expect(screen.getByTestId('finance-status')).toHaveTextContent('İptal edildi'),
    );

    expect(screen.getByTestId('finance-void-reason')).toHaveTextContent('Mükerrer kayıt');
    expect(screen.queryByRole('button', { name: 'İptal et' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Düzenle' })).not.toBeInTheDocument();
  });

  /**
   * Kayıt başka bir oturumda iptal edilmişse backend 422 +
   * `finance_entry_already_voided` döner. Backend'in metni kullanıcıya
   * gösterilmeye uygun yazılmıştır; uydurma bir metinle değiştirilmez.
   */
  it('zaten iptal edilmiş kayıtta backendin açıklamasını gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/finance-entries/900/void': () =>
          jsonResponse(422, {
            message: 'Bu finans kaydı zaten iptal edilmiş.',
            code: 'finance_entry_already_voided',
          }),
        '/finance-entries/900': () => jsonResponse(200, { data: entry }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/finance/900', { token: 'gecerli-token' });

    await screen.findByTestId('finance-status');
    await user.click(screen.getByRole('button', { name: 'İptal et' }));
    await user.click(await screen.findByRole('button', { name: 'Evet, iptal et' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Bu finans kaydı zaten iptal edilmiş.',
    );
  });

  // ---------------------------------------------------------------- hata

  it('bilinmeyen kayıtta bulunamadı der, yetki hatası demez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/finance-entries/999': () => jsonResponse(404, { message: 'Kayıt bulunamadı.' }),
      }),
    );

    renderApp('/app/finance/999', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Finans kaydı bulunamadı.');
    expect(alert.textContent).not.toMatch(/yetki|erişim reddedildi/i);

    expect(screen.getByRole('link', { name: 'Finans kayıtlarına dön' })).toHaveAttribute(
      'href',
      '/app/finance',
    );
  });

  it('403 durumunda bölümün sahiplere açık olduğunu söyler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...memberSession,
        '/finance-entries/900': () =>
          jsonResponse(403, { message: 'This action is unauthorized.' }),
      }),
    );

    renderApp('/app/finance/900', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Bu bölüm yalnızca şirket sahiplerine açıktır.');
    expect(alert.textContent).not.toContain('This action is unauthorized.');
  });

  it('sunucu hatasında ham metni göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/finance-entries/900': () => jsonResponse(500, { message: 'Server Error' }),
      }),
    );

    renderApp('/app/finance/900', { token: 'gecerli-token' });

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('Beklenmedik bir hata oluştu.');
    expect(alert.textContent).not.toContain('Server Error');
  });

  it('401 durumunda oturumu kapatır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerSession,
        '/finance-entries/900': () => jsonResponse(401, { message: 'Unauthenticated.' }),
      }),
    );

    renderApp('/app/finance/900', { token: 'artik-gecersiz' });

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
    await waitFor(() => expect(tokenStorage.get()).toBeNull());
  });

  it('listeye dönüş bağlantısı verir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({ ...ownerSession, '/finance-entries/900': () => jsonResponse(200, { data: entry }) }),
    );

    renderApp('/app/finance/900', { token: 'gecerli-token' });

    expect(await screen.findByRole('link', { name: 'Finans kayıtlarına dön' })).toHaveAttribute(
      'href',
      '/app/finance',
    );
  });
});
