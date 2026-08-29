import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { FLOWTIGER_LOGO_SRC } from '@/features/brand/FlowTigerMark';
import { FlowTigerSplash } from './FlowTigerSplash';

/**
 * Marka perdesi — yükleme ekranı DEĞİL.
 *
 * Bileşen izole edilerek sınanır: kabuk, router ve API olmadan. Sahne
 * geçişleri zamanlayıcıya bağlı olduğu için sahte saat kullanılıyor;
 * gerçek saatle beklemek testi 2.4 saniye yavaşlatır ve zamanlamayı
 * makinenin hızına bağlar.
 */
describe('FlowTigerSplash', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** Perdenin sahne sırası: zemin → işaret → ad → geri çekilme → çıkış. */
  function sceneOf(): string | null {
    return screen.getByTestId('flowtiger-splash').getAttribute('data-scene');
  }

  it('marka işaretiyle birlikte görünür', () => {
    vi.useFakeTimers();

    render(<FlowTigerSplash onDone={() => {}} />);

    const splash = screen.getByTestId('flowtiger-splash');

    expect(splash).toBeInTheDocument();
    expect(within(splash).getByTestId('flowtiger-mark')).toBeInTheDocument();
    expect(within(splash).getByText('FlowTiger')).toBeInTheDocument();
  });

  /**
   * REGRESYON — GERÇEK LOGO ASSET'İ KULLANILIR.
   *
   * Perde uygulamanın ilk gösterdiği şey; burada bir yer tutucu kalırsa
   * kullanıcı ürünü sahte bir markayla tanır.
   */
  it('gerçek logo asset dosyasını kullanır', () => {
    vi.useFakeTimers();

    render(<FlowTigerSplash onDone={() => {}} />);

    const mark = within(screen.getByTestId('flowtiger-splash')).getByTestId('flowtiger-mark');

    expect(mark.tagName).toBe('IMG');
    expect(mark).toHaveAttribute('src', FLOWTIGER_LOGO_SRC);
    expect(FLOWTIGER_LOGO_SRC).toContain('flowtiger-logo');
  });

  /**
   * REGRESYON — ESKİ "FT" YER TUTUCUSU KALMADI.
   *
   * Metinden çizilmiş geçici işaret gerçek logoyla değiştirildi; ikisinin
   * bir arada bulunması iki farklı markanın yan yana durması olurdu.
   */
  it('eski FT yer tutucusunu göstermez', () => {
    vi.useFakeTimers();

    render(<FlowTigerSplash onDone={() => {}} />);

    expect(screen.queryByText('FT')).not.toBeInTheDocument();
  });

  /**
   * Logo DEKORATİF: yanında görünür "FlowTiger" metni var. Ayrıca
   * alternatif metin vermek aynı bilgiyi iki kez duyurmak olurdu.
   */
  it('logoyu ekran okuyucuya ikinci kez duyurmaz', () => {
    vi.useFakeTimers();

    render(<FlowTigerSplash onDone={() => {}} />);

    const mark = screen.getByTestId('flowtiger-mark');

    expect(mark).toHaveAttribute('alt', '');
    expect(mark).toHaveAttribute('aria-hidden', 'true');
  });

  /**
   * SAHNELER SIRAYLA İLERLER.
   *
   * Tek bir opacity geçişi değil: işaret önce gelir, ad sonra eşlik eder,
   * ikisi birlikte geri çekilir, sonra perde kalkar. Sıra bozulursa marka
   * anı bir "yükleme bitti" bildirimine dönüşür.
   */
  it('sahneleri sırayla ilerletir', () => {
    vi.useFakeTimers();

    render(<FlowTigerSplash onDone={() => {}} />);

    expect(sceneOf()).toBe('dark');

    act(() => void vi.advanceTimersByTime(150));
    expect(sceneOf()).toBe('mark');

    act(() => void vi.advanceTimersByTime(700));
    expect(sceneOf()).toBe('word');

    act(() => void vi.advanceTimersByTime(750));
    expect(sceneOf()).toBe('recede');

    act(() => void vi.advanceTimersByTime(450));
    expect(sceneOf()).toBe('leaving');
  });

  it('süre dolunca tamamlandığını bildirir', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();

    render(<FlowTigerSplash onDone={onDone} />);

    expect(onDone).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(2400));

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  /**
   * Deneyim 2–3 saniye aralığında kalır. Daha kısası marka anı olmaz,
   * daha uzunu kullanıcıyı bekletir.
   */
  it('iki saniyeden önce kapanmaz', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();

    render(<FlowTigerSplash onDone={onDone} />);

    act(() => void vi.advanceTimersByTime(1999));
    expect(onDone).not.toHaveBeenCalled();
  });

  /**
   * Perde DEKORATİFTİR: ekran okuyucuya gösterilmez, klavye odağını
   * çalmaz. Aksi hâlde kullanıcının önüne iki saniyelik anlamsız bir
   * duvar konmuş olurdu.
   */
  it('ekran okuyucudan gizlidir ve odaklanabilir öğe içermez', () => {
    vi.useFakeTimers();

    render(<FlowTigerSplash onDone={() => {}} />);

    const splash = screen.getByTestId('flowtiger-splash');

    expect(splash).toHaveAttribute('aria-hidden', 'true');
    expect(within(splash).queryByRole('button')).not.toBeInTheDocument();
    expect(within(splash).queryByRole('link')).not.toBeInTheDocument();
  });

  /** Sahte meşguliyet göstergesi YOK: beklenen bir şey yok. */
  it('yükleme göstergesi içermez', () => {
    vi.useFakeTimers();

    render(<FlowTigerSplash onDone={() => {}} />);

    const splash = screen.getByTestId('flowtiger-splash');

    expect(within(splash).queryByRole('status')).not.toBeInTheDocument();
    expect(within(splash).queryByRole('progressbar')).not.toBeInTheDocument();
  });

  /** Sökülünce zamanlayıcı kalmaz: kapanmış bir bileşen state yazamaz. */
  it('sökülünce tamamlandı demez', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();

    const { unmount } = render(<FlowTigerSplash onDone={onDone} />);
    unmount();

    act(() => void vi.advanceTimersByTime(5000));

    expect(onDone).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------ hareket azaltma

  /**
   * REGRESYON — HAREKET AZALTMA TERCİHİNDE SÜRE DE KISALIR.
   *
   * Yalnızca animasyonu kapatmak yetmez: hareketten rahatsız olan
   * kullanıcıyı hareketsiz bir ekrana 2.4 saniye bakmaya zorlamak, ona
   * daha kötü bir deneyim vermek olur. Marka anı korunur, süresi kısalır.
   */
  it('hareket azaltma tercihinde kısa sürer', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));

    const onDone = vi.fn();
    render(<FlowTigerSplash onDone={onDone} />);

    act(() => void vi.advanceTimersByTime(700));

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  /** Perde yine gösterilir — atlanmaz, yalnızca sadeleşir. */
  it('hareket azaltma tercihinde de marka görünür', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));

    render(<FlowTigerSplash onDone={() => {}} />);

    const splash = screen.getByTestId('flowtiger-splash');

    expect(within(splash).getByTestId('flowtiger-mark')).toBeInTheDocument();
    // Ara sahneler atlanır: işaret ve ad birlikte, hareketsiz.
    expect(sceneOf()).toBe('word');
  });

  /**
   * `matchMedia` her ortamda bulunmayabilir (eski tarayıcı, sunucu
   * tarafı render). Yokluğu bir hata değildir; perde normal çalışır.
   */
  it('matchMedia yoksa çökmez', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', undefined);

    const onDone = vi.fn();
    render(<FlowTigerSplash onDone={onDone} />);

    expect(screen.getByTestId('flowtiger-splash')).toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(2400));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
