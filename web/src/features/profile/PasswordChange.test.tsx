import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bodyOf, fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';
import { tokenStorage } from '@/lib/auth/tokenStorage';

/**
 * Parola değiştirme — kullanıcının KENDİ parolası.
 *
 * BACKEND SÖZLEŞMESİ (PUT /profile/password):
 *   current_password          : required | current_password
 *   new_password              : required | min:8 | confirmed | different:current_password
 *   new_password_confirmation : `confirmed` kuralı bunu ZORUNLU kılar
 *
 * PUT, PATCH değil: parola kısmen güncellenmez.
 *
 * YANLIŞ MEVCUT PAROLA 422 DÖNER, 401 DEĞİL — ve bu ayrım arayüz için
 * hayatidir. Kullanıcının kimliği doğrulanmış durumda; hatalı olan tek
 * şey gönderdiği alan. 401 sanılıp oturum kapatılırsa, parolasını yanlış
 * yazan kullanıcı sistemden atılır.
 *
 * OTURUM ETKİSİ: mevcut token KORUNUR, diğerleri iptal edilir. Yanıt
 * `other_logins_revoked` sayısını taşır ve bu sayı gösterilmelidir —
 * "hesabım ele geçirilmiş miydi" sorusunu araştıran kullanıcı için tek
 * anlamlı sinyal odur.
 *
 * BU UÇ OWNER-ONLY DEĞİLDİR; 403 senaryosu yoktur. Ama 429 GERÇEKTEN
 * VARDIR: `current_password` kuralı bu ucu, oturumu ele geçirmiş ama
 * parolayı bilmeyen bir saldırgan için parola DENEME yüzeyine çevirir.
 * Sınır 6/dk (kullanıcı id bazlı) ve Laravel `Retry-After` başlığı
 * gönderir.
 *
 * YANIT PAROLA YA DA YENİ TOKEN İÇERMEZ.
 */
describe('Parola değiştirme', () => {
  const session = {
    '/me': () => jsonResponse(200, { data: fixtures.user() }),
    '/companies': () =>
      jsonResponse(200, { data: [fixtures.company()], meta: { active_company_id: 7 } }),
    '/profile': () => jsonResponse(200, { data: fixtures.user() }),
  };

  /** Formu doldurup gönderir. */
  async function submit(
    user: ReturnType<typeof userEvent.setup>,
    values: { current?: string; next?: string; confirm?: string } = {},
  ) {
    await user.type(await screen.findByLabelText('Mevcut parola'), values.current ?? 'eski-parola');
    await user.type(screen.getByLabelText('Yeni parola'), values.next ?? 'yeni-parola-123');
    await user.type(
      screen.getByLabelText('Yeni parola (tekrar)'),
      values.confirm ?? 'yeni-parola-123',
    );

    await user.click(screen.getByRole('button', { name: 'Parolayı değiştir' }));
  }

  // --------------------------------------------------------------- form

  it('üç parola alanı ve bir düğme gösterir', async () => {
    vi.stubGlobal('fetch', mockApi(session));
    renderApp('/app/profile', { token: 'gecerli-token' });

    expect(await screen.findByLabelText('Mevcut parola')).toBeInTheDocument();
    expect(screen.getByLabelText('Yeni parola')).toBeInTheDocument();
    expect(screen.getByLabelText('Yeni parola (tekrar)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Parolayı değiştir' })).toBeInTheDocument();
  });

  /**
   * REGRESYON: alanlar parola tipindedir. Düz metin bir alan, omuz
   * üstünden okunabilir ve tarayıcı otomatik doldurma geçmişine düşer.
   */
  it('alanlar varsayılan olarak parola tipindedir', async () => {
    vi.stubGlobal('fetch', mockApi(session));
    renderApp('/app/profile', { token: 'gecerli-token' });

    expect(await screen.findByLabelText('Mevcut parola')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Yeni parola')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Yeni parola (tekrar)')).toHaveAttribute('type', 'password');
  });

  /**
   * REGRESYON — GÖVDE TAM OLARAK ÜÇ ALAN.
   *
   * `email` ya da `user_id` eklenseydi, kimliğin gövdeden gelebileceği
   * izlenimi doğardı. Kimlik DAİMA oturumdan gelir; bu uçta hiçbir
   * kullanıcı parametresi yoktur.
   */
  it('yalnızca üç parola alanını gönderir', async () => {
    const fetchMock = mockApi({
      ...session,
      '/profile/password': () =>
        jsonResponse(200, { data: { message: 'Parola güncellendi.', other_logins_revoked: 0 } }),
    });

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/app/profile', { token: 'gecerli-token' });
    await submit(user);

    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/profile/password'));
    const body = bodyOf(call?.[1]) as Record<string, unknown>;

    expect(call?.[1]?.method).toBe('PUT');
    expect(Object.keys(body).sort()).toEqual([
      'current_password',
      'new_password',
      'new_password_confirmation',
    ]);
    expect(body).toEqual({
      current_password: 'eski-parola',
      new_password: 'yeni-parola-123',
      new_password_confirmation: 'yeni-parola-123',
    });
  });

  // --------------------------------------------------------- doğrulama

  /**
   * EN KRİTİK TEST: yanlış mevcut parola bir doğrulama hatasıdır,
   * oturum sorunu DEĞİLDİR. Kullanıcı ekranda kalır.
   */
  it('yanlış mevcut parolada alan hatası gösterir ve oturumu kapatmaz', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/profile/password': () =>
          jsonResponse(422, {
            message: 'Gönderilen bilgiler geçersiz.',
            errors: { current_password: ['Parola hatalı.'] },
          }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/profile', { token: 'gecerli-token' });
    await submit(user);

    expect(await screen.findByText('Parola hatalı.')).toBeInTheDocument();

    expect(tokenStorage.get()).toBe('gecerli-token');
    expect(screen.queryByRole('button', { name: 'Giriş yap' })).not.toBeInTheDocument();
  });

  it('kısa yeni parolada alan hatası gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/profile/password': () =>
          jsonResponse(422, {
            message: 'Gönderilen bilgiler geçersiz.',
            errors: { new_password: ['Parola en az 8 karakter olmalıdır.'] },
          }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/profile', { token: 'gecerli-token' });
    await submit(user, { next: 'kisa', confirm: 'kisa' });

    expect(await screen.findByText('Parola en az 8 karakter olmalıdır.')).toBeInTheDocument();
  });

  /** `confirmed` kuralının hatası `new_password` alanında döner. */
  it('onay eşleşmediğinde alan hatası gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/profile/password': () =>
          jsonResponse(422, {
            message: 'Gönderilen bilgiler geçersiz.',
            errors: { new_password: ['Parola tekrarı eşleşmiyor.'] },
          }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/profile', { token: 'gecerli-token' });
    await submit(user, { confirm: 'baska-bir-parola' });

    expect(await screen.findByText('Parola tekrarı eşleşmiyor.')).toBeInTheDocument();
  });

  /** `different:current_password` kuralı. */
  it('yeni parola eskisiyle aynıysa alan hatası gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/profile/password': () =>
          jsonResponse(422, {
            message: 'Gönderilen bilgiler geçersiz.',
            errors: { new_password: ['Yeni parola mevcut parolayla aynı olamaz.'] },
          }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/profile', { token: 'gecerli-token' });
    await submit(user, { next: 'eski-parola', confirm: 'eski-parola' });

    expect(await screen.findByText('Yeni parola mevcut parolayla aynı olamaz.')).toBeInTheDocument();
  });

  // ------------------------------------------------------------ başarı

  it('kapatılan diğer oturum sayısını gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/profile/password': () =>
          jsonResponse(200, { data: { message: 'Parola güncellendi.', other_logins_revoked: 3 } }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/profile', { token: 'gecerli-token' });
    await submit(user);

    const result = await screen.findByTestId('password-result');

    expect(result).toHaveTextContent('Parola güncellendi.');
    expect(result).toHaveTextContent('3');
  });

  /**
   * Mevcut oturum KORUNUR: parolasını değiştiren kullanıcıyı sistemden
   * atmak, doğru davranışı cezalandırmak olurdu.
   */
  it('başarıdan sonra oturum açık kalır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/profile/password': () =>
          jsonResponse(200, { data: { message: 'Parola güncellendi.', other_logins_revoked: 1 } }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/profile', { token: 'gecerli-token' });
    await submit(user);

    await screen.findByTestId('password-result');

    expect(tokenStorage.get()).toBe('gecerli-token');
    expect(screen.queryByRole('button', { name: 'Giriş yap' })).not.toBeInTheDocument();
  });

  /**
   * REGRESYON: alanlar temizlenir. Parolanın DOM'da gereğinden uzun
   * durması, ekranı açık bırakan kullanıcı için gereksiz bir risktir.
   */
  it('başarıdan sonra parola alanlarını temizler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/profile/password': () =>
          jsonResponse(200, { data: { message: 'Parola güncellendi.', other_logins_revoked: 0 } }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/profile', { token: 'gecerli-token' });
    await submit(user);

    await screen.findByTestId('password-result');

    expect(screen.getByLabelText('Mevcut parola')).toHaveValue('');
    expect(screen.getByLabelText('Yeni parola')).toHaveValue('');
    expect(screen.getByLabelText('Yeni parola (tekrar)')).toHaveValue('');
  });

  // -------------------------------------------------------------- 429

  /**
   * GERÇEK SÖZLEŞME: sınır 6/dk ve Laravel `Retry-After` başlığını
   * saniye olarak gönderir. ApiClient bunu okur; arayüz uydurma bir
   * bekleme süresi üretmez.
   */
  it('429 durumunda backendin bildirdiği bekleme süresini gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/profile/password': () =>
          jsonResponse(429, { message: 'Too Many Attempts.' }, { 'Retry-After': '42' }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/profile', { token: 'gecerli-token' });
    await submit(user);

    const alert = await screen.findByRole('alert');

    expect(alert).toHaveTextContent('42 saniye');
    // Backend'in ham İngilizce metni gösterilmez.
    expect(alert.textContent).not.toContain('Too Many Attempts.');
  });

  it('429 durumunda oturumu kapatmaz', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/profile/password': () =>
          jsonResponse(429, { message: 'Too Many Attempts.' }, { 'Retry-After': '42' }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/profile', { token: 'gecerli-token' });
    await submit(user);

    await screen.findByRole('alert');

    expect(tokenStorage.get()).toBe('gecerli-token');
    expect(screen.queryByRole('button', { name: 'Giriş yap' })).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------- 401

  it('401 durumunda oturumu kapatır', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...session,
        '/profile/password': () => jsonResponse(401, { message: 'Unauthenticated.' }),
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/profile', { token: 'artik-gecersiz' });
    await submit(user);

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

        if (url.endsWith('/me')) return jsonResponse(200, { data: fixtures.user() });
        if (url.includes('/companies')) {
          return jsonResponse(200, {
            data: [fixtures.company()],
            meta: { active_company_id: 7 },
          });
        }
        if (url.endsWith('/profile/password')) {
          return new Promise<Response>((resolve) => {
            deferred.resolve = resolve;
          });
        }
        if (url.endsWith('/profile')) return jsonResponse(200, { data: fixtures.user() });

        return jsonResponse(404, { message: 'Taklit edilmemiş uç' });
      }),
    );

    const user = userEvent.setup();
    renderApp('/app/profile', { token: 'gecerli-token' });
    await submit(user);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Parolayı değiştir' })).toBeDisabled(),
    );

    deferred.resolve?.(
      jsonResponse(200, { data: { message: 'Parola güncellendi.', other_logins_revoked: 0 } }),
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Parolayı değiştir' })).toBeEnabled(),
    );
  });
});
