import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bodyOf, jsonResponse, mockApi, renderApp } from '@/test/harness';

/**
 * "Parolamı unuttum".
 *
 * Backend sözleşmesi (PasswordResetController::sendResetLink,
 * ForgotPasswordRequest):
 *   POST /auth/password/forgot  { email }  — public, Bearer YOK
 *   200 → { data: { message, code: 'password_reset_link_requested' } }
 *         kayıtlı ve kayıtsız adres için AYNI yanıt (enumeration koruması)
 *   422 → errors.email
 *   429 → throttle (Retry-After)
 */
const NEUTRAL = 'Bu adrese ait bir hesap varsa, parola sıfırlama bağlantısı gönderildi.';

describe('ForgotPasswordPage', () => {
  it('giriş ekranındaki "Parolamı unuttum" bağlantısı yazılmış e-postayla bu ekranı açar', async () => {
    vi.stubGlobal('fetch', mockApi({}));
    const user = userEvent.setup();

    renderApp('/login');

    await user.type(await screen.findByLabelText('E-posta'), 'ada@flowtiger.test');
    await user.click(screen.getByRole('link', { name: 'Parolamı unuttum' }));

    expect(
      await screen.findByRole('heading', { name: 'Parolanızı mı unuttunuz?' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('E-posta')).toHaveValue('ada@flowtiger.test');
  });

  it("gövdede yalnızca e-postayı gönderir, Bearer eklemez; backend'in nötr mesajını gösterir", async () => {
    const fetchMock = mockApi({
      '/auth/password/forgot': () =>
        jsonResponse(200, { data: { message: NEUTRAL, code: 'password_reset_link_requested' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    renderApp('/password/forgot');

    await user.type(await screen.findByLabelText('E-posta'), '  ada@flowtiger.test ');
    await user.click(screen.getByRole('button', { name: 'Sıfırlama bağlantısı gönder' }));

    expect(await screen.findByRole('status')).toHaveTextContent(NEUTRAL);

    const call = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/auth/password/forgot'),
    );
    expect(call).toBeDefined();
    expect(bodyOf(call![1])).toEqual({ email: 'ada@flowtiger.test' });
    expect((call![1] as RequestInit).headers).not.toHaveProperty('Authorization');
    expect(screen.getByRole('link', { name: 'Giriş sayfasına dön' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('422 e-posta hatasını alanın altında gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/auth/password/forgot': () =>
          jsonResponse(422, {
            message: 'E-posta geçerli bir adres olmalıdır.',
            errors: { email: ['E-posta geçerli bir adres olmalıdır.'] },
          }),
      }),
    );
    const user = userEvent.setup();

    renderApp('/password/forgot');

    await user.type(await screen.findByLabelText('E-posta'), 'gecersiz');
    await user.click(screen.getByRole('button', { name: 'Sıfırlama bağlantısı gönder' }));

    expect(await screen.findByText('E-posta geçerli bir adres olmalıdır.')).toBeInTheDocument();
    expect(screen.getByLabelText('E-posta')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('429 için bekleme süresini gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/auth/password/forgot': () =>
          jsonResponse(429, { message: 'Too Many Attempts.' }, { 'Retry-After': '42' }),
      }),
    );
    const user = userEvent.setup();

    renderApp('/password/forgot');

    await user.type(await screen.findByLabelText('E-posta'), 'ada@flowtiger.test');
    await user.click(screen.getByRole('button', { name: 'Sıfırlama bağlantısı gönder' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('42 saniye sonra');
  });

  it('5xx için sunucu ayrıntısını değil nötr mesajı gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/auth/password/forgot': () => jsonResponse(500, { message: 'SQLSTATE[HY000] ...' }),
      }),
    );
    const user = userEvent.setup();

    renderApp('/password/forgot');

    await user.type(await screen.findByLabelText('E-posta'), 'ada@flowtiger.test');
    await user.click(screen.getByRole('button', { name: 'Sıfırlama bağlantısı gönder' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Beklenmedik bir hata oluştu');
    expect(alert).not.toHaveTextContent('SQLSTATE');
  });
});
