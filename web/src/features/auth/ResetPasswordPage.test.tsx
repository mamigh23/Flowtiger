import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bodyOf, fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';

/**
 * Yeni parola belirleme — e-postadaki bağlantının hedefi.
 *
 * Bağlantı biçimi backend'den: config('flowtiger.password_reset.url')
 *   = "<taban>/password/reset/{token}?email={email}"
 *
 * Backend sözleşmesi (PasswordResetController::reset, ResetPasswordRequest):
 *   POST /auth/password/reset { email, token, password, password_confirmation }
 *   200 → { data: { message, code: 'password_reset_completed' } }
 *   422 + errors → alan hataları
 *   422 + code=invalid_password_reset_token (errors YOK) → geçersiz/süresi
 *         dolmuş/kullanılmış token — backend bilerek ayırmaz
 */
const RESET_TOKEN = 'a1b2c3d4e5f6sifirlama';
const RESET_PATH = `/password/reset/${RESET_TOKEN}?email=ada%40flowtiger.test`;

const completed = () =>
  jsonResponse(200, {
    data: {
      message: 'Parolanız güncellendi. Tüm oturumlar kapatıldı, yeniden giriş yapın.',
      code: 'password_reset_completed',
    },
  });

async function fillPasswords(
  user: ReturnType<typeof userEvent.setup>,
  confirmation = 'yeni-parola-123',
) {
  await user.type(await screen.findByLabelText('Yeni parola'), 'yeni-parola-123');
  await user.type(screen.getByLabelText('Yeni parola (tekrar)'), confirmation);
}

describe('ResetPasswordPage', () => {
  it('e-postayı bağlantıdan doldurur; token ekranda HİÇBİR alanda görünmez', async () => {
    vi.stubGlobal('fetch', mockApi({}));

    renderApp(RESET_PATH);

    expect(await screen.findByLabelText('E-posta')).toHaveValue('ada@flowtiger.test');
    expect(screen.getByLabelText('Yeni parola')).toHaveAttribute('type', 'password');
    expect(document.body.innerHTML).not.toContain(RESET_TOKEN);
  });

  it('dört alanı gönderir, Bearer eklemez; başarıda bilgi notuyla girişe yönlendirir', async () => {
    const fetchMock = mockApi({ '/auth/password/reset': completed });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp(RESET_PATH);

    await fillPasswords(user);
    await user.click(screen.getByRole('button', { name: 'Parolayı sıfırla' }));

    expect(await screen.findByTestId('password-reset-done')).toHaveTextContent(
      'Parolanız güncellendi',
    );
    expect(screen.getByRole('button', { name: 'Giriş yap' })).toBeInTheDocument();
    expect(screen.getByLabelText('E-posta')).toHaveValue('ada@flowtiger.test');

    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/auth/password/reset'));
    expect(bodyOf(call![1])).toEqual({
      email: 'ada@flowtiger.test',
      token: RESET_TOKEN,
      password: 'yeni-parola-123',
      password_confirmation: 'yeni-parola-123',
    });
    expect((call![1] as RequestInit).headers).not.toHaveProperty('Authorization');

    // Token hiçbir kalıcı depoya yazılmadı.
    expect(JSON.stringify({ ...window.localStorage })).not.toContain(RESET_TOKEN);
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain(RESET_TOKEN);
  });

  it('geçersiz/süresi dolmuş token: backend mesajı + yeni bağlantı isteme yolu; parolalar temizlenir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/auth/password/reset': () =>
          jsonResponse(422, {
            message: 'Parola sıfırlama bağlantısı geçersiz ya da süresi dolmuş.',
            code: 'invalid_password_reset_token',
          }),
      }),
    );
    const user = userEvent.setup();

    renderApp(RESET_PATH);

    await fillPasswords(user);
    await user.click(screen.getByRole('button', { name: 'Parolayı sıfırla' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Parola sıfırlama bağlantısı geçersiz ya da süresi dolmuş.',
    );
    expect(screen.getByLabelText('Yeni parola')).toHaveValue('');
    expect(screen.getByLabelText('Yeni parola (tekrar)')).toHaveValue('');

    await user.click(screen.getByRole('link', { name: 'Yeni sıfırlama bağlantısı isteyin' }));

    expect(
      await screen.findByRole('heading', { name: 'Parolanızı mı unuttunuz?' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('E-posta')).toHaveValue('ada@flowtiger.test');
  });

  it('422 alan hatasını (confirmed) "Yeni parola" altında gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/auth/password/reset': () =>
          jsonResponse(422, {
            message: 'Parola onayı eşleşmiyor.',
            errors: { password: ['Parola onayı eşleşmiyor.'] },
          }),
      }),
    );
    const user = userEvent.setup();

    renderApp(RESET_PATH);

    await fillPasswords(user, 'baska-bir-parola');
    await user.click(screen.getByRole('button', { name: 'Parolayı sıfırla' }));

    expect(await screen.findByText('Parola onayı eşleşmiyor.')).toBeInTheDocument();
    expect(screen.getByLabelText('Yeni parola')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('link', { name: 'Yeni sıfırlama bağlantısı isteyin' })).toBeNull();
  });

  it("girişliyken açılan bağlantı /app'e atmaz; başarıda yerel oturum da kapatılır", async () => {
    const fetchMock = mockApi({
      '/me': () => jsonResponse(200, { data: fixtures.user() }),
      '/companies': () =>
        jsonResponse(200, { data: [fixtures.company()], meta: { active_company_id: 7 } }),
      '/auth/logout': () => jsonResponse(401, { message: 'Unauthenticated.' }),
      '/auth/password/reset': completed,
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp(RESET_PATH, { token: 'eski-oturum-tokeni' });

    await fillPasswords(user);
    await user.click(screen.getByRole('button', { name: 'Parolayı sıfırla' }));

    expect(await screen.findByTestId('password-reset-done')).toBeInTheDocument();
    // Kasıtlı çıkış: "oturumunuz sona erdi" uyarısı çıkmaz.
    expect(screen.queryByTestId('session-expired')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/auth/logout'))).toBe(true),
    );
  });
});
