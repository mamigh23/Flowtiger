import { describe, expect, it, vi } from 'vitest';
import { createInMemoryTokenStorage } from './tokenStorage';

describe('tokenStorage', () => {
  it('token saklar ve döndürür', () => {
    const storage = createInMemoryTokenStorage();

    expect(storage.get()).toBeNull();

    storage.set('abc');
    expect(storage.get()).toBe('abc');

    storage.clear();
    expect(storage.get()).toBeNull();
  });

  it('değişiklikleri abonelere bildirir', () => {
    const storage = createInMemoryTokenStorage();
    const listener = vi.fn();

    const unsubscribe = storage.subscribe(listener);

    storage.set('abc');
    expect(listener).toHaveBeenCalledWith('abc');

    storage.clear();
    expect(listener).toHaveBeenCalledWith(null);

    unsubscribe();
    storage.set('def');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  /**
   * Güvenlik gereği: token hiçbir tarayıcı deposuna yazılmaz.
   * Bu test, ileride "kullanışlılık olsun" diye localStorage eklenmesini
   * fark edilir kılar.
   */
  it('tarayıcı depolarına hiçbir şey yazmaz', () => {
    const localSpy = vi.spyOn(Storage.prototype, 'setItem');

    const storage = createInMemoryTokenStorage();
    storage.set('gizli-token');

    expect(localSpy).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
