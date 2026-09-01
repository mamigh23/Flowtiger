import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bodyOf, fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';

/**
 * Davet kabul ekranı.
 *
 * Backend sözleşmesi (InvitationController::accept +
 * InvitationAcceptRequest + InvitationService::accept):
 *
 *   POST /invitations/accept  { token* (string), name, password }
 *
 *   Giriş yapmamış davetli  → name + password ZORUNLU, `authenticated`
 *                             gönderilmez (Bearer eklenmez)
 *   Giriş yapmış kullanıcı  → name + password YASAK (prohibited),
 *                             `authenticated: true` (Bearer eklenir)
 *
 *   → 201 (yeni hesap) ya da 200 (mevcut hesap) — İKİSİ DE AYNI gövde:
 *     { data: { id, email(maskeli), role, status, expires_at, created_at } }
 *     Token/oturum/şirket bilgisi YOK; hangi dalın izlendiği İSTEMCİDE
 *     zaten (auth durumu üzerinden) bilinir, yanıtın durum koduna
 *     bakılmaz.
 *
 * Hatalar:
 *   404 invitation_not_found            → "Davet bulunamadı."
 *   410 invitation_revoked/accepted/expired → üç ayrı mesaj
 *   403 invitation_requires_authentication  → "önce giriş yapın" mesajı
 *   403 invitation_email_mismatch           → "başka bir e-posta" mesajı
 *   422 alan hataları (token/name/password) → alan altında
 *   422 invitation_already_member           → form seviyesinde (errors yok)
 *
 * BU EKRANIN 403 MESAJLARI `InvitationListPage`/`InviteMemberPage`'in
 * "owner-only" mesajıYLA AYNI DEĞİLDİR — kabul ucu owner-only değildir,
 * kendi iki farklı 403 sebebi vardır (bkz. invitationAcceptErrors.ts).
 */
describe('AcceptInvitationPage', () => {
  describe('giriş yapmamış davetli', () => {
    it('davet kodu, ad ve parola alanlarını gösterir; oturum uçları çağrılmaz', async () => {
      const fetchMock = mockApi({});
      vi.stubGlobal('fetch', fetchMock);

      renderApp('/invitations/accept');

      expect(await screen.findByLabelText('Davet kodu')).toBeInTheDocument();
      expect(screen.getByLabelText('Ad Soyad')).toBeInTheDocument();
      expect(screen.getByLabelText('Parola')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Daveti kabul et' })).toBeEnabled();

      // /me ya da /companies'e hiç istek atılmamalı: kimliksiz ziyaretçi
      // için bu uçların hiçbir anlamı yok.
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('?token= sorgu parametresiyle davet kodunu doldurur', async () => {
      vi.stubGlobal('fetch', mockApi({}));

      renderApp('/invitations/accept?token=abc123');

      expect(await screen.findByLabelText('Davet kodu')).toHaveValue('abc123');
    });

    it('gövdede token+name+password gönderir, authenticated:false ile (Bearer eklenmez)', async () => {
      const fetchMock = mockApi({
        '/invitations/accept': () =>
          jsonResponse(201, { data: fixtures.invitation({ status: 'accepted' }) }),
      });
      vi.stubGlobal('fetch', fetchMock);
      const user = userEvent.setup();

      renderApp('/invitations/accept?token=abc123');

      await user.type(await screen.findByLabelText('Ad Soyad'), 'Yeni Kullanıcı');
      await user.type(screen.getByLabelText('Parola'), 'gecerli-parola');
      await user.click(screen.getByRole('button', { name: 'Daveti kabul et' }));

      await waitFor(() => {
        const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
        expect(call).toBeDefined();

        const [, init] = call!;
        expect(bodyOf(init)).toEqual({
          token: 'abc123',
          name: 'Yeni Kullanıcı',
          password: 'gecerli-parola',
        });
        expect((init as RequestInit).headers).not.toHaveProperty('Authorization');
      });
    });

    it('başarılı kabulde "şimdi giriş yapın" ekranını gösterir ve /app\'e OTOMATİK gitmez', async () => {
      vi.stubGlobal(
        'fetch',
        mockApi({
          '/invitations/accept': () => jsonResponse(201, { data: fixtures.invitation() }),
        }),
      );
      const user = userEvent.setup();

      renderApp('/invitations/accept?token=abc123');

      await user.type(await screen.findByLabelText('Ad Soyad'), 'Yeni Kullanıcı');
      await user.type(screen.getByLabelText('Parola'), 'gecerli-parola');
      await user.click(screen.getByRole('button', { name: 'Daveti kabul et' }));

      expect(await screen.findByRole('status')).toHaveTextContent('Hesabınız oluşturuldu');
      expect(screen.getByRole('link', { name: 'Giriş yap' })).toHaveAttribute('href', '/login');

      // Backend'den dönen yanıtta oturum/token bilgisi yoktur; ekran
      // kendiliğinden oturum açmaya ÇALIŞMAZ, formun kendisi de kaybolur.
      expect(screen.queryByLabelText('Davet kodu')).not.toBeInTheDocument();
    });

    it('404 invitation_not_found için "Davet bulunamadı." gösterir', async () => {
      vi.stubGlobal(
        'fetch',
        mockApi({
          '/invitations/accept': () =>
            jsonResponse(404, { message: 'Davet bulunamadı.', code: 'invitation_not_found' }),
        }),
      );
      const user = userEvent.setup();

      renderApp('/invitations/accept');

      await user.type(await screen.findByLabelText('Davet kodu'), 'yanlis-kod');
      await user.type(screen.getByLabelText('Ad Soyad'), 'Yeni Kullanıcı');
      await user.type(screen.getByLabelText('Parola'), 'gecerli-parola');
      await user.click(screen.getByRole('button', { name: 'Daveti kabul et' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Davet bulunamadı.');
    });

    it.each([
      ['invitation_revoked', 'Bu davet zaten iptal edilmiş.'],
      ['invitation_accepted', 'Bu davet zaten kabul edilmiş.'],
      ['invitation_expired', 'Bu davetin süresi dolmuş.'],
    ])('410 %s için doğru mesajı gösterir', async (code, expectedMessage) => {
      vi.stubGlobal(
        'fetch',
        mockApi({
          '/invitations/accept': () =>
            jsonResponse(410, { message: `Davet artık kullanılamaz (durum: x).`, code }),
        }),
      );
      const user = userEvent.setup();

      renderApp('/invitations/accept');

      await user.type(await screen.findByLabelText('Davet kodu'), 'bir-kod');
      await user.type(screen.getByLabelText('Ad Soyad'), 'Yeni Kullanıcı');
      await user.type(screen.getByLabelText('Parola'), 'gecerli-parola');
      await user.click(screen.getByRole('button', { name: 'Daveti kabul et' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(expectedMessage);
    });

    it('403 invitation_requires_authentication için owner-only mesajını GÖSTERMEZ', async () => {
      vi.stubGlobal(
        'fetch',
        mockApi({
          '/invitations/accept': () =>
            jsonResponse(403, {
              message: 'Bu davet, davet edilen e-postaya ait hesapla giriş yapıldıktan sonra kabul edilebilir.',
              code: 'invitation_requires_authentication',
            }),
        }),
      );
      const user = userEvent.setup();

      renderApp('/invitations/accept');

      await user.type(await screen.findByLabelText('Davet kodu'), 'bir-kod');
      await user.type(screen.getByLabelText('Ad Soyad'), 'Yeni Kullanıcı');
      await user.type(screen.getByLabelText('Parola'), 'gecerli-parola');
      await user.click(screen.getByRole('button', { name: 'Daveti kabul et' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('önce o hesapla giriş yapın');
      expect(alert.textContent).not.toContain('Bu bölüm yalnızca şirket sahiplerine açıktır.');
    });

    it('403 invitation_email_mismatch için farklı bir mesaj gösterir', async () => {
      vi.stubGlobal(
        'fetch',
        mockApi({
          '/invitations/accept': () =>
            jsonResponse(403, {
              message: 'Bu davet başka bir e-posta adresi için oluşturulmuş.',
              code: 'invitation_email_mismatch',
            }),
        }),
      );
      const user = userEvent.setup();

      renderApp('/invitations/accept');

      await user.type(await screen.findByLabelText('Davet kodu'), 'bir-kod');
      await user.type(screen.getByLabelText('Ad Soyad'), 'Yeni Kullanıcı');
      await user.type(screen.getByLabelText('Parola'), 'gecerli-parola');
      await user.click(screen.getByRole('button', { name: 'Daveti kabul et' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('başka bir e-posta adresi için oluşturulmuş');
    });

    it('422 alan hatalarını (token/name/password) alan altında gösterir', async () => {
      vi.stubGlobal(
        'fetch',
        mockApi({
          '/invitations/accept': () =>
            jsonResponse(422, {
              message: 'Gönderilen bilgiler geçersiz.',
              errors: {
                token: ['Davet kodu alanı zorunludur.'],
                name: ['Ad alanı zorunludur.'],
                password: ['Parola en az 8 karakter olmalıdır.'],
              },
            }),
        }),
      );
      const user = userEvent.setup();

      renderApp('/invitations/accept');

      await user.type(await screen.findByLabelText('Ad Soyad'), 'x');
      await user.type(screen.getByLabelText('Parola'), 'kisa');
      await user.click(screen.getByRole('button', { name: 'Daveti kabul et' }));

      expect(await screen.findByText('Davet kodu alanı zorunludur.')).toBeInTheDocument();
      expect(screen.getByText('Ad alanı zorunludur.')).toBeInTheDocument();
      expect(screen.getByText('Parola en az 8 karakter olmalıdır.')).toBeInTheDocument();
    });

    it('422 invitation_already_member için form seviyesinde backend mesajını gösterir', async () => {
      vi.stubGlobal(
        'fetch',
        mockApi({
          '/invitations/accept': () =>
            jsonResponse(422, {
              message: 'Bu kullanıcı zaten şirketin üyesi.',
              code: 'invitation_already_member',
            }),
        }),
      );
      const user = userEvent.setup();

      renderApp('/invitations/accept');

      await user.type(await screen.findByLabelText('Davet kodu'), 'bir-kod');
      await user.type(screen.getByLabelText('Ad Soyad'), 'Yeni Kullanıcı');
      await user.type(screen.getByLabelText('Parola'), 'gecerli-parola');
      await user.click(screen.getByRole('button', { name: 'Daveti kabul et' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Bu kullanıcı zaten şirketin üyesi.');
    });

    it('başarısız denemeden sonra parolayı ekranda bırakmaz', async () => {
      vi.stubGlobal(
        'fetch',
        mockApi({
          '/invitations/accept': () =>
            jsonResponse(404, { message: 'Davet bulunamadı.', code: 'invitation_not_found' }),
        }),
      );
      const user = userEvent.setup();

      renderApp('/invitations/accept');

      await user.type(await screen.findByLabelText('Davet kodu'), 'bir-kod');
      await user.type(screen.getByLabelText('Ad Soyad'), 'Yeni Kullanıcı');
      await user.type(screen.getByLabelText('Parola'), 'gecerli-parola');
      await user.click(screen.getByRole('button', { name: 'Daveti kabul et' }));

      await screen.findByRole('alert');
      expect(screen.getByLabelText('Parola')).toHaveValue('');
    });

    it('istek sürerken ikinci gönderimi engeller', async () => {
      const deferred: { resolve?: (response: Response) => void } = {};

      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/invitations/accept') && init?.method === 'POST') {
          return new Promise<Response>((resolve) => {
            deferred.resolve = resolve;
          });
        }
        return jsonResponse(404, { message: 'Taklit edilmemiş uç' });
      });

      vi.stubGlobal('fetch', fetchMock);
      const user = userEvent.setup();

      renderApp('/invitations/accept');

      await user.type(await screen.findByLabelText('Davet kodu'), 'bir-kod');
      await user.type(screen.getByLabelText('Ad Soyad'), 'Yeni Kullanıcı');
      await user.type(screen.getByLabelText('Parola'), 'gecerli-parola');

      const submit = screen.getByRole('button', { name: 'Daveti kabul et' });
      await user.click(submit);

      await waitFor(() => expect(submit).toBeDisabled());
      await user.click(submit);

      const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
      expect(posts).toHaveLength(1);

      deferred.resolve?.(jsonResponse(201, { data: fixtures.invitation() }));
      await screen.findByRole('status');
    });
  });

  describe('giriş yapmış kullanıcı', () => {
    const session = {
      '/me': () => jsonResponse(200, { data: fixtures.user() }),
      '/companies': () =>
        jsonResponse(200, { data: [fixtures.company()], meta: { active_company_id: 7 } }),
    };

    it('yalnızca davet kodu alanını gösterir; ad/parola YOKTUR', async () => {
      vi.stubGlobal('fetch', mockApi(session));

      renderApp('/invitations/accept', { token: 'gecerli-oturum-tokeni' });

      expect(await screen.findByLabelText('Davet kodu')).toBeInTheDocument();
      expect(screen.queryByLabelText('Ad Soyad')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Parola')).not.toBeInTheDocument();
    });

    it('gövdede yalnızca token gönderir, Authorization başlığı ekler', async () => {
      const fetchMock = mockApi({
        ...session,
        '/invitations/accept': () => jsonResponse(200, { data: fixtures.invitation() }),
      });
      vi.stubGlobal('fetch', fetchMock);
      const user = userEvent.setup();

      renderApp('/invitations/accept', { token: 'gecerli-oturum-tokeni' });

      await user.type(await screen.findByLabelText('Davet kodu'), 'bir-kod');
      await user.click(screen.getByRole('button', { name: 'Daveti kabul et' }));

      await waitFor(() => {
        const call = fetchMock.mock.calls.find(
          ([url, init]) => String(url).includes('/invitations/accept') && init?.method === 'POST',
        );
        expect(call).toBeDefined();

        const [, init] = call!;
        expect(bodyOf(init)).toEqual({ token: 'bir-kod' });
        expect((init as RequestInit).headers).toMatchObject({
          Authorization: 'Bearer gecerli-oturum-tokeni',
        });
      });
    });

    it('başarılı kabulde şirket listesini tazeler ve /app\'e yönlendirir', async () => {
      vi.stubGlobal(
        'fetch',
        mockApi({
          ...session,
          '/invitations/accept': () => jsonResponse(200, { data: fixtures.invitation() }),
        }),
      );
      const user = userEvent.setup();

      renderApp('/invitations/accept', { token: 'gecerli-oturum-tokeni' });

      await user.type(await screen.findByLabelText('Davet kodu'), 'bir-kod');
      await user.click(screen.getByRole('button', { name: 'Daveti kabul et' }));

      // /app'e ulaştığının kanıtı: panel açılır (RequireActiveCompany
      // aktif şirketi zaten seçili görür, company-select'e SAPMAZ).
      expect(await screen.findByRole('heading', { name: 'Bugünün Planı' })).toBeInTheDocument();
    });

    it('403 invitation_email_mismatch mesajını gösterir (owner-only mesajı DEĞİL)', async () => {
      vi.stubGlobal(
        'fetch',
        mockApi({
          ...session,
          '/invitations/accept': () =>
            jsonResponse(403, {
              message: 'Bu davet başka bir e-posta adresi için oluşturulmuş.',
              code: 'invitation_email_mismatch',
            }),
        }),
      );
      const user = userEvent.setup();

      renderApp('/invitations/accept', { token: 'gecerli-oturum-tokeni' });

      await user.type(await screen.findByLabelText('Davet kodu'), 'bir-kod');
      await user.click(screen.getByRole('button', { name: 'Daveti kabul et' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('başka bir e-posta adresi için oluşturulmuş');
      expect(alert.textContent).not.toContain('Bu bölüm yalnızca şirket sahiplerine açıktır.');
    });

    it('422 invitation_already_member mesajını form seviyesinde gösterir', async () => {
      vi.stubGlobal(
        'fetch',
        mockApi({
          ...session,
          '/invitations/accept': () =>
            jsonResponse(422, {
              message: 'Bu kullanıcı zaten şirketin üyesi.',
              code: 'invitation_already_member',
            }),
        }),
      );
      const user = userEvent.setup();

      renderApp('/invitations/accept', { token: 'gecerli-oturum-tokeni' });

      await user.type(await screen.findByLabelText('Davet kodu'), 'bir-kod');
      await user.click(screen.getByRole('button', { name: 'Daveti kabul et' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Bu kullanıcı zaten şirketin üyesi.');
    });
  });
});
