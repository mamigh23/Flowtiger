import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { tokenStorage } from './tokenStorage';

const oldUser = { id: 1, name: 'Eski', email: 'old@example.test' };
const newUser = { id: 2, name: 'Yeni', email: 'new@example.test' };
const response = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status, headers: { 'Content-Type': 'application/json' } });
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}
function wrapper({ children }: { children: ReactNode }) { return <AuthProvider>{children}</AuthProvider>; }

describe('Oturum yanıt sıraları', () => {
  it('kapanmış providerın gecikmiş girişi token yazamaz', async () => {
    const pending = deferred();
    vi.stubGlobal('fetch', vi.fn(() => pending.promise));
    const { result, unmount } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    let auth!: Promise<void>;
    act(() => { auth = result.current.login('new@example.test', 'password'); });
    unmount();
    await act(async () => { pending.resolve(response({ token: 'new', user: newUser })); await auth; });
    expect(tokenStorage.get()).toBeNull();
  });
  it('çıkış sonrası geciken bootstrap başarısı kullanıcıyı geri getirmez', async () => {
    const pending = deferred();
    tokenStorage.set('old');
    vi.stubGlobal('fetch', vi.fn((url) => String(url).endsWith('/me') ? pending.promise : Promise.resolve(response(null))));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => { await result.current.logout(); });
    await act(async () => { pending.resolve(response(oldUser)); });
    expect(result.current.status).toBe('unauthenticated');
    expect(result.current.user).toBeNull();
    expect(tokenStorage.get()).toBeNull();
  });

  it.each([200, 500, 401])('yeni girişten sonra eski bootstrap %s yanıtı oturumu değiştirmez', async (status) => {
    const pending = deferred();
    tokenStorage.set('old');
    vi.stubGlobal('fetch', vi.fn((url) => String(url).endsWith('/me') ? pending.promise : Promise.resolve(response({ token: 'new', user: newUser }))));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => { await result.current.login('new@example.test', 'password'); });
    await act(async () => { pending.resolve(response(oldUser, status)); });
    expect(tokenStorage.get()).toBe('new');
    expect(result.current.user?.id).toBe(2);
    expect(result.current.status).toBe('authenticated');
    expect(result.current.sessionExpired).toBe(false);
  });

  it('eski token açılışta reddedilse bile bekleyen yeni giriş tamamlanabilir', async () => {
    const bootstrap = deferred();
    const login = deferred();
    tokenStorage.set('old');
    vi.stubGlobal('fetch', vi.fn((url) => String(url).endsWith('/me') ? bootstrap.promise : login.promise));
    const { result } = renderHook(() => useAuth(), { wrapper });
    let auth!: Promise<void>;
    act(() => { auth = result.current.login('new@example.test', 'password'); });
    await act(async () => { bootstrap.resolve(response(null, 401)); });
    await act(async () => { login.resolve(response({ token: 'new', user: newUser })); await auth; });
    expect(tokenStorage.get()).toBe('new');
    expect(result.current.user?.id).toBe(2);
    expect(result.current.status).toBe('authenticated');
    expect(result.current.sessionExpired).toBe(false);
  });

  it('eski logout yanıtı yeni girişin tokenını temizlemez', async () => {
    const pending = deferred();
    tokenStorage.set('old');
    vi.stubGlobal('fetch', vi.fn((url) => Promise.resolve(String(url).endsWith('/me') ? response(oldUser) : response({ token: 'new', user: newUser }))));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    vi.stubGlobal('fetch', vi.fn((url) => String(url).endsWith('/logout') ? pending.promise : Promise.resolve(response({ token: 'new', user: newUser }))));
    let logout!: Promise<void>;
    act(() => { logout = result.current.logout(); });
    await act(async () => { await result.current.login('new@example.test', 'password'); });
    await act(async () => { pending.resolve(response(null)); await logout; });
    expect(tokenStorage.get()).toBe('new');
    expect(result.current.user?.id).toBe(2);
    expect(result.current.status).toBe('authenticated');
  });

  it('başarısız yeni giriş, devam eden çıkışı iptal edemez', async () => {
    tokenStorage.set('old');
    vi.stubGlobal('fetch', vi.fn(async () => response(oldUser)));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    const pending = deferred();
    vi.stubGlobal('fetch', vi.fn((url) => String(url).endsWith('/logout') ? pending.promise : Promise.resolve(response(null, 500))));
    let logout!: Promise<void>;
    act(() => { logout = result.current.logout(); });
    await act(async () => { await expect(result.current.login('new@example.test', 'password')).rejects.toBeDefined(); });
    await act(async () => { pending.resolve(response(null)); await logout; });
    expect(tokenStorage.get()).toBeNull();
    expect(result.current.user).toBeNull();
    expect(result.current.status).toBe('unauthenticated');
    expect(result.current.sessionExpired).toBe(false);
  });

  it('çıkıştan sonra geciken refresh kullanıcıyı geri yazmaz', async () => {
    tokenStorage.set('old');
    vi.stubGlobal('fetch', vi.fn(async () => response(oldUser)));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    const pending = deferred();
    vi.stubGlobal('fetch', vi.fn((url) => String(url).endsWith('/me') ? pending.promise : Promise.resolve(response(null))));
    let refresh!: Promise<void>;
    act(() => { refresh = result.current.refreshUser(); });
    await act(async () => { await result.current.logout(); });
    await act(async () => { pending.resolve(response(oldUser)); await refresh; });
    expect(result.current.user).toBeNull();
    expect(result.current.status).toBe('unauthenticated');
  });

  it('aynı oturumda en son başlatılan refresh yanıtı korunur', async () => {
    tokenStorage.set('old');
    vi.stubGlobal('fetch', vi.fn(async () => response(oldUser)));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    const first = deferred();
    const second = deferred();
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise));
    let a!: Promise<void>;
    let b!: Promise<void>;
    act(() => { a = result.current.refreshUser(); b = result.current.refreshUser(); });
    await act(async () => { second.resolve(response({ ...oldUser, name: 'Güncel' })); await b; });
    await act(async () => { first.resolve(response(oldUser)); await a; });
    expect(result.current.user?.name).toBe('Güncel');
  });

  it.each(['login', 'register'] as const)('çıkıştan önce başlayan gecikmiş %s oturum açamaz', async (operation) => {
    const pending = deferred();
    vi.stubGlobal('fetch', vi.fn((url) => String(url).endsWith('/logout') ? Promise.resolve(response(null)) : pending.promise));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    let auth!: Promise<void>;
    act(() => { auth = operation === 'login' ? result.current.login('new@example.test', 'password') : result.current.register('Yeni', 'new@example.test', 'password', 'Şirket'); });
    await act(async () => { await result.current.logout(); });
    await act(async () => { pending.resolve(response({ token: 'new', user: newUser })); await auth; });
    expect(result.current.user).toBeNull();
    expect(tokenStorage.get()).toBeNull();
  });
});
