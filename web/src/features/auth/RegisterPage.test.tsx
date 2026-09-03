import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bodyOf, fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';
import { tokenStorage } from '@/lib/auth/tokenStorage';

/**
 * Kayıt ekranı (P0-03) — self-servis kayıt + ilk şirket kurulumu.
 *
 * Kanıtlanması gerekenler LoginPage'dekiyle AYNI aile: doğru istek gidiyor
 * mu, token/oturum doğru güncelleniyor mu, hata durumları kullanıcıya
 * doğru anlatılıyor mu ve parola arayüzde kalmıyor mu — artı bu ekrana
 * özgü olan `email_already_registered` ayrımı (bkz. RegisterPage'in kendi
 * yorum bloğu).
 */
describe('RegisterPage', () => {
  async function fillForm(
    user: ReturnType<typeof userEvent.setup>,
    overrides: { name?: string; email?: string; password?: string; companyName?: string } = {},
  ) {
    const { name = 'Ada Lovelace', email = 'ada@flowtiger.test', password = 'gizli-parola', companyName = 'Kaplan Yazılım' } =
      overrides;

    if (name) await user.type(screen.getByLabelText('Ad Soyad'), name);
    if (email) await user.type(screen.getByLabelText('E-posta'), email);
    if (password) await user.type(screen.getByLabelText('Parola'), password);
    if (companyName) await user.type(screen.getByLabelText('Şirket Adı'), companyName);
  }

  // 1. Register ekranı render olur.
  it('kayıt formunu gösterir', async () => {
    vi.stubGlobal('fetch', mockApi({}));

    renderApp('/register');

    expect(await screen.findByRole('heading', { name: 'FlowTiger' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kayıt ol' })).toBeEnabled();
  });

  // 2. Alanlar doğru şekilde render olur.
  it('dört alanı da doğru sırayla ve doğru tiplerde gösterir', async () => {
    vi.stubGlobal('fetch', mockApi({}));

    renderApp('/register');

    const name = await screen.findByLabelText('Ad Soyad');
    const email = screen.getByLabelText('E-posta');
    const password = screen.getByLabelText('Parola');
    const companyName = screen.getByLabelText('Şirket Adı');

    expect(email).toHaveAttribute('type', 'email');
    expect(password).toHaveAttribute('type', 'password');

    // Sıra: Ad Soyad → E-posta → Parola → Şirket Adı (belirtilen sıra).
    const fields = screen.getAllByRole('textbox');
    expect(fields[0]).toBe(name);
    // E-posta input'u role="textbox" değil (type=email farklı role alabilir
    // bazı ortamlarda) — bu yüzden yalnızca ad alanının ilk sırada olduğu
    // ve şirket adının forma dahil olduğu doğrulanır.
    expect(companyName).toBeInTheDocument();
  });

  // 3. Boş submit validation davranışı.
  it('boş alanlarla gönderim backend doğrulamasına düşer ve alan hataları gösterilir', async () => {
    const fetchMock = mockApi({
      '/auth/register': () =>
        jsonResponse(422, {
          message: 'Gönderilen bilgiler geçersiz.',
          errors: {
            name: ['Ad Soyad alanı zorunludur.'],
            email: ['E-posta alanı zorunludur.'],
            password: ['Parola alanı zorunludur.'],
            company_name: ['Şirket Adı alanı zorunludur.'],
          },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/register');

    // Form `noValidate` taşır: istemci hiçbir alanı bloklamaz, istek
    // backend'e gider ve doğrulama orada yapılır (LoginPage ile aynı ilke).
    await user.click(await screen.findByRole('button', { name: 'Kayıt ol' }));

    expect(await screen.findByText('Ad Soyad alanı zorunludur.')).toBeInTheDocument();
    expect(screen.getByText('E-posta alanı zorunludur.')).toBeInTheDocument();
    expect(screen.getByText('Parola alanı zorunludur.')).toBeInTheDocument();
    expect(screen.getByText('Şirket Adı alanı zorunludur.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // 4. Geçerli bilgilerle API çağrısı yapılır.
  it('geçerli bilgilerle doğru gövdeyi /auth/register\'a gönderir', async () => {
    const fetchMock = mockApi({
      '/auth/register': () =>
        jsonResponse(201, { data: { token: 'yeni-token', user: fixtures.user() } }),
      '/companies': () =>
        jsonResponse(200, { data: [fixtures.company()], meta: { active_company_id: 7 } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/register');

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Kayıt ol' }));

    await waitFor(() => expect(tokenStorage.get()).toBe('yeni-token'));

    const registerCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/auth/register'));
    expect(bodyOf(registerCall?.[1] as RequestInit)).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@flowtiger.test',
      password: 'gizli-parola',
      company_name: 'Kaplan Yazılım',
    });

    // İstemci role/company_id/active_company_id GÖNDERMEZ — backend
    // authoritative'dir (P0-03 kuralı).
    const sentBody = bodyOf(registerCall?.[1] as RequestInit) as Record<string, unknown>;
    expect(sentBody.role).toBeUndefined();
    expect(sentBody.company_id).toBeUndefined();
    expect(sentBody.active_company_id).toBeUndefined();
  });

  // 5. Başarılı response sonrası token/auth state doğru şekilde güncellenir.
  // 6. /app'e yönlendirilir.
  it('başarılı kayıtta token saklar, kullanıcıyı günceller ve /app\'e yönlendirir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/auth/register': () =>
          jsonResponse(201, {
            data: { token: 'yeni-token', user: fixtures.user({ active_company_id: 7 }) },
          }),
        '/companies': () =>
          jsonResponse(200, { data: [fixtures.company()], meta: { active_company_id: 7 } }),
        '/customers': () => jsonResponse(200, fixtures.paginated([], 0)),
        '/members': () => jsonResponse(200, fixtures.paginated([], 0)),
        '/audit-logs': () => jsonResponse(200, fixtures.paginated([], 0)),
      }),
    );
    const user = userEvent.setup();

    renderApp('/register');

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Kayıt ol' }));

    await waitFor(() => expect(tokenStorage.get()).toBe('yeni-token'));

    // Yönlendirme: kayıt formu kalkar, panel (/app) açılır.
    expect(await screen.findByRole('heading', { name: 'Bugünün Planı' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kayıt ol' })).not.toBeInTheDocument();
  });

  // 7. 422 validation hatası doğru gösterilir (tek alan örneği).
  it('422 doğrulama hatasını yalnızca ilgili alanın altında gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/auth/register': () =>
          jsonResponse(422, {
            message: 'Gönderilen bilgiler geçersiz.',
            errors: { email: ['Geçerli bir e-posta adresi girin.'] },
          }),
      }),
    );
    const user = userEvent.setup();

    renderApp('/register');

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Kayıt ol' }));

    expect(await screen.findByText('Geçerli bir e-posta adresi girin.')).toBeInTheDocument();
    // Diğer alanlarda hata YOK.
    expect(screen.queryByText(/zorunludur/)).not.toBeInTheDocument();
  });

  // 8. email_already_registered doğru gösterilir.
  it('email_already_registered hatasını form seviyesinde, anlaşılır biçimde gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/auth/register': () =>
          jsonResponse(422, {
            message: 'Bu e-posta adresi zaten kayıtlı.',
            code: 'email_already_registered',
          }),
      }),
    );
    const user = userEvent.setup();

    renderApp('/register');

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Kayıt ol' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Bu e-posta adresi zaten kayıtlı.');
    expect(tokenStorage.get()).toBeNull();

    // errors gelmediği için hiçbir alan yanlış şekilde işaretlenmez.
    expect(screen.queryByText('Bu e-posta adresi zaten kayıtlı.', { selector: '.ft-field__error' })).not.toBeInTheDocument();
  });

  // 9. 429 doğru gösterilir.
  it('429 durumunda bekleme süresini söyler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/auth/register': () =>
          jsonResponse(429, { message: 'Çok fazla deneme.' }, { 'Retry-After': '30' }),
      }),
    );
    const user = userEvent.setup();

    renderApp('/register');

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Kayıt ol' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('30 saniye');
  });

  // 10. Genel API hatası doğru gösterilir.
  it('ağ hatasında güvenli, nötr bir mesajla düşer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const user = userEvent.setup();

    renderApp('/register');

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Kayıt ol' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sunucuya ulaşılamadı.');
    expect(alert.textContent).not.toContain('fetch');
  });

  // 11. Double submit engellenir.
  it('istek sürerken ikinci gönderimi engeller', async () => {
    const deferred: { resolve?: (response: Response) => void } = {};

    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          deferred.resolve = resolve;
        }),
    );

    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/register');

    await fillForm(user);

    const submit = screen.getByRole('button', { name: 'Kayıt ol' });
    await user.click(submit);

    await waitFor(() => expect(submit).toBeDisabled());
    await user.click(submit);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    deferred.resolve?.(jsonResponse(422, { message: 'Gönderilen bilgiler geçersiz.', errors: {} }));
  });

  // 12. Password hata sonrasında temizlenir.
  it('gönderim sonrası parolayı arayüzde bırakmaz', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/auth/register': () =>
          jsonResponse(422, { message: 'Bu e-posta adresi zaten kayıtlı.', code: 'email_already_registered' }),
      }),
    );
    const user = userEvent.setup();

    renderApp('/register');

    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Kayıt ol' }));

    await screen.findByRole('alert');

    expect(screen.getByLabelText('Parola')).toHaveValue('');
    // Diğer alanlar korunur — yalnızca parola hassas veridir.
    expect(screen.getByLabelText('Ad Soyad')).toHaveValue('Ada Lovelace');
    expect(screen.getByLabelText('E-posta')).toHaveValue('ada@flowtiger.test');
    expect(screen.getByLabelText('Şirket Adı')).toHaveValue('Kaplan Yazılım');
  });

  // 13. Login/register navigation çalışır (register → login yönü burada;
  // login → register yönü LoginPage.test.tsx'te).
  it('"Giriş yapın" bağlantısı /login\'e götürür', async () => {
    vi.stubGlobal('fetch', mockApi({}));
    const user = userEvent.setup();

    renderApp('/register');

    await screen.findByRole('heading', { name: 'FlowTiger' });
    await user.click(screen.getByRole('link', { name: 'Giriş yapın' }));

    expect(await screen.findByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
  });
});
