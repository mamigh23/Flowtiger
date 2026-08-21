import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bodyOf, fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';
import { tokenStorage } from '@/lib/auth/tokenStorage';

/**
 * E-posta doğrulama — YALNIZCA "yeniden gönder" tarafı.
 *
 * BACKEND SÖZLEŞMESİ:
 *   POST /auth/email/verification-notification → 200, gövde BOŞ
 *
 * GET /auth/email/verify/{id}/{hash} BU ALT FAZIN DIŞINDADIR: kimlik
 * doğrulaması olmayan, imzalı bir uçtur ve bağlantı mail istemcisinden
 * tıklanır. Üstelik backend'de o bağlantı için bir frontend URL şablonu
 * tanımlı değil — link doğrudan API'ye gidiyor. Bunu arayüzde taklit
 * etmek, olmayan bir akışı varmış gibi göstermek olurdu.
 *
 * AYRI BİR "DURUM" UCU YOKTUR. Doğrulama durumu `email_verified_at`
 * alanından okunur; GET /profile zaten onu döndürüyor, ek istek yok.
 *
 * HEDEF ADRES PARAMETRESİ YOKTUR ve olmamalı: kullanıcı yalnızca KENDİ
 * adresi için bağlantı ister. Başkasının adresini hedefleyen bir alan,
 * "bu adres sistemde kayıtlı mı?" sorusunu herkese açık hâle getirirdi.
 *
 * ZATEN DOĞRULANMIŞ HESAP HATA DÖNDÜRMEZ: yanıt yine 200'dür ve durumu
 * makine-okunur bir `code` ile bildirir. İstenen sonuç (adres doğrulanmış
 * olsun) zaten sağlanmış durumda.
 *
 * THROTTLE GERÇEKTİR: 6/dk, kullanıcı id bazlı. Amaç kendi gelen
 * kutusunu dolduran kullanıcıyı ve mail sağlayıcısında itibar kaybını
 * önlemek.
 */
describe('E-posta doğrulama', () => {
  const VERIFICATION_PATH = '/auth/email/verification-notification';

  const unverified = fixtures.user({ email_verified_at: null });

  const session = {
    '/me': () => jsonResponse(200, { data: unverified }),
    '/companies': () =>
      jsonResponse(200, { data: [fixtures.company()], meta: { active_company_id: 7 } }),
    '/profile': () => jsonResponse(200, { data: unverified }),
  };

  const verifiedSession = {
    ...session,
    '/me': () => jsonResponse(200, { data: fixtures.user() }),
    '/profile': () => jsonResponse(200, { data: fixtures.user() }),
  };

  // -------------------------------------------------------------- durum

  it('doğrulanmamış hesapta durumu ve gönder düğmesini gösterir', async () => {
    vi.stubGlobal('fetch', mockApi(session));
    renderApp('/app/profile', { token: 'gecerli-token' });

    expect(await screen.findByTestId('verification-status')).toHaveTextContent(
      'Doğrulama bekliyor',
    );
    expect(
      screen.getByRole('button', { name: 'Doğrulama bağlantısı gönder' }),
    ).toBeInTheDocument();
  });

  it('doğrulanmış hesapta gönder düğmesi göstermez', async () => {
    vi.stubGlobal('fetch', mockApi(verifiedSession));
    renderApp('/app/profile', { token: 'gecerli-token' });

    expect(await screen.findByTestId('verification-status')).toHaveTextContent('Doğrulandı');
    expect(
      screen.queryByRole('button', { name: 'Doğrulama bağlantısı gönder' }),
    ).not.toBeInTheDocument();
  });

  // ------------------------------------------------------------ gönderim

  /**
   * REGRESYON — GÖVDE BOŞ.
   *
   * `email` alanı eklenseydi uç, kimliği doğrulanmış bir çağıran için
   * adres sayım (enumeration) yüzeyine dönüşürdü.
   */
  it('boş gövdeyle POST eder, hedef adres göndermez', async () => {
    const fetchMock = mockApi({
      ...session,
      [VERIFICATION_PATH]: () =>
        jsonResponse(200, {
          data: {
            message: 'Doğrulama bağlantısı e-posta adresinize gönderildi.',
            code: 'verification_link_sent',
          },
        }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/profile', { token: 'gecerli-token' });

    await user.click(
      await screen.findByRole('button', { name: 'Doğrulama bağlantısı gönder' }),
    );

    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith(VERIFICATION_PATH));

    expect(call?.[1]?.method).toBe('POST');

    const body = bodyOf(call?.[1]);
    expect(body === undefined || Object.keys(body as object).length === 0).toBe(true);
  });

  it('verification_link_sent kodunda gönderildi bilgisi gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        [VERIFICATION_PATH]: () =>
          jsonResponse(200, {
            data: {
              message: 'Doğrulama bağlantısı e-posta adresinize gönderildi.',
              code: 'verification_link_sent',
            },
          }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/profile', { token: 'gecerli-token' });

    await user.click(
      await screen.findByRole('button', { name: 'Doğrulama bağlantısı gönder' }),
    );

    expect(
      await screen.findByText('Doğrulama bağlantısı e-posta adresinize gönderildi.'),
    ).toBeInTheDocument();
  });

  /**
   * Zaten doğrulanmış hesap HATA DEĞİLDİR: 200 döner. Arayüz bunu bir
   * hata gibi göstermemeli.
   */
  it('already_verified kodunda hata göstermez', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        [VERIFICATION_PATH]: () =>
          jsonResponse(200, {
            data: {
              message: 'E-posta adresiniz zaten doğrulanmış.',
              code: 'already_verified',
            },
          }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/profile', { token: 'gecerli-token' });

    await user.click(
      await screen.findByRole('button', { name: 'Doğrulama bağlantısı gönder' }),
    );

    expect(await screen.findByText('E-posta adresiniz zaten doğrulanmış.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  /**
   * REGRESYON — KARAR `code` ALANINA GÖRE VERİLİR, METNE GÖRE DEĞİL.
   *
   * Backend mesajı bir gün değişebilir (dil, noktalama, kelime).
   * Metin eşleştirmesi yapan bir arayüz o gün sessizce yanlış davranır.
   * Burada backend bilerek "gönderildi" diyen bir mesajla
   * `already_verified` kodu döndürüyor; arayüz koda uymalı.
   */
  it('kararını backend metnine değil code alanına göre verir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        [VERIFICATION_PATH]: () =>
          jsonResponse(200, {
            data: {
              message: 'Doğrulama bağlantısı e-posta adresinize gönderildi.',
              code: 'already_verified',
            },
          }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/profile', { token: 'gecerli-token' });

    await user.click(
      await screen.findByRole('button', { name: 'Doğrulama bağlantısı gönder' }),
    );

    await waitFor(() =>
      expect(screen.getByTestId('verification-status')).toHaveTextContent('Doğrulandı'),
    );
  });

  /**
   * `already_verified` geldiyse adres başka bir sekmede doğrulanmış
   * demektir. Durum güncellenir ve gönder düğmesi kalkar.
   */
  it('already_verified sonrası gönder düğmesini kaldırır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        [VERIFICATION_PATH]: () =>
          jsonResponse(200, {
            data: {
              message: 'E-posta adresiniz zaten doğrulanmış.',
              code: 'already_verified',
            },
          }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/profile', { token: 'gecerli-token' });

    await user.click(
      await screen.findByRole('button', { name: 'Doğrulama bağlantısı gönder' }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Doğrulama bağlantısı gönder' }),
      ).not.toBeInTheDocument(),
    );
  });

  // --------------------------------------------------------------- 429

  /**
   * GERÇEK SÖZLEŞME: 6/dk ve Laravel `Retry-After` başlığı. Arayüz
   * uydurma bir bekleme süresi üretmez.
   */
  it('429 durumunda backendin bildirdiği bekleme süresini gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        [VERIFICATION_PATH]: () =>
          jsonResponse(429, { message: 'Too Many Attempts.' }, { 'Retry-After': '30' }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/profile', { token: 'gecerli-token' });

    await user.click(
      await screen.findByRole('button', { name: 'Doğrulama bağlantısı gönder' }),
    );

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('30 saniye');
    expect(alert.textContent).not.toContain('Too Many Attempts.');
    expect(tokenStorage.get()).toBe('gecerli-token');
  });

  // --------------------------------------------------------------- 401

  it('401 durumunda oturumu kapatır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        [VERIFICATION_PATH]: () => jsonResponse(401, { message: 'Unauthenticated.' }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/profile', { token: 'artik-gecersiz' });

    await user.click(
      await screen.findByRole('button', { name: 'Doğrulama bağlantısı gönder' }),
    );

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
    await waitFor(() => expect(tokenStorage.get()).toBeNull());
  });

  // ---------------------------------------------------------- gönderim

  it('gönderim sürerken düğmeyi kapatır', async () => {
    const deferred: { resolve?: (response: Response) => void } = {};

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith(VERIFICATION_PATH)) {
          return new Promise<Response>((resolve) => {
            deferred.resolve = resolve;
          });
        }
        if (url.endsWith('/me')) return jsonResponse(200, { data: unverified });
        if (url.includes('/companies')) {
          return jsonResponse(200, {
            data: [fixtures.company()],
            meta: { active_company_id: 7 },
          });
        }
        if (url.endsWith('/profile')) return jsonResponse(200, { data: unverified });

        return jsonResponse(404, { message: 'Taklit edilmemiş uç' });
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/profile', { token: 'gecerli-token' });

    await user.click(
      await screen.findByRole('button', { name: 'Doğrulama bağlantısı gönder' }),
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Doğrulama bağlantısı gönder' })).toBeDisabled(),
    );

    deferred.resolve?.(
      jsonResponse(200, {
        data: {
          message: 'Doğrulama bağlantısı e-posta adresinize gönderildi.',
          code: 'verification_link_sent',
        },
      }),
    );

    expect(
      await screen.findByText('Doğrulama bağlantısı e-posta adresinize gönderildi.'),
    ).toBeInTheDocument();
  });
});
