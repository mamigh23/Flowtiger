import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * ErrorBoundary React'ın kendi mekanizmasını kullanır: bir alt bileşen
 * RENDER sırasında istisna fırlattığında `console.error`'a da kendiliğinden
 * yazar. Bu, TEST EDİLEN davranışın bir PARÇASIDIR (componentDidCatch da
 * aynısını yapar) — testin başarısızlığı DEĞİL; yalnızca test çıktısını
 * kirletmemek için burada susturulur.
 */
function silenceExpectedConsoleError() {
  vi.spyOn(console, 'error').mockImplementation(() => {});
}

/** Render sırasında HER ZAMAN patlayan bir bileşen. */
function Bomb(): never {
  throw new Error('kasıtlı test istisnası: gizli/dosya yolu bilgisi İÇERMEMELİ');
}

/**
 * Dışarıdan (testten) kontrol edilen bir bayrağa göre patlayan bileşen.
 *
 * SAYAÇ DEĞİL, DIŞARIDAN KONTROL EDİLEN BİR BAYRAK KULLANILIYOR: React,
 * geliştirme derlemesinde bir Error Boundary altında patlayan bir
 * render'ı TEŞHİS amacıyla İKİNCİ KEZ çalıştırabilir (temiz bir hata
 * mesajı üretmek için). Bir çağrı SAYACINA dayansaydı, bu iç tekrar
 * bayrağı erken çevirir ve test React'ın kendi iç mekaniğine bağımlı,
 * kırılgan hale gelirdi. Bunun yerine "düzeldi mi?" sorusu tamamen
 * testin kontrolündedir — retry gerçek dünyada da tam olarak böyle
 * çalışır: buton, düzelmiş olsun ya da olmasın alt ağacı sıfırdan
 * mount eder; düzelip düzelmediği harici bir koşuldur.
 */
let fixed = false;

function BombUntilFixed() {
  if (!fixed) {
    throw new Error('düzelene kadar patlayan test istisnası');
  }

  return <p>güvenli içerik</p>;
}

describe('ErrorBoundary', () => {
  it('hata olmadığında çocuklarını olduğu gibi render eder', () => {
    render(
      <ErrorBoundary>
        <p>güvenli içerik</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('güvenli içerik')).toBeInTheDocument();
  });

  it('render sırasında atılan bir istisnayı yakalar ve güvenli bir fallback gösterir', () => {
    silenceExpectedConsoleError();

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('heading', { name: 'Bir şeyler ters gitti.' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Beklenmeyen bir hata oluştu. Aşağıdaki düğmeyle tekrar deneyebilirsiniz.',
    );
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument();
  });

  /**
   * §5/§13 ile aynı disiplin: production'da istisna mesajı, stack trace
   * ya da dosya yolu KULLANICIYA hiçbir şekilde sızmamalı.
   */
  it('istisnanın mesajını ya da stack izini kullanıcıya hiçbir şekilde göstermez', () => {
    silenceExpectedConsoleError();

    const { container } = render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(container.textContent).not.toContain('kasıtlı test istisnası');
    expect(container.textContent).not.toContain('gizli/dosya yolu');
    expect(container.innerHTML).not.toMatch(/at Bomb/);
  });

  it('çöken alt bileşeni DOM\'dan tamamen kaldırır', () => {
    silenceExpectedConsoleError();

    render(
      <ErrorBoundary>
        <p>bu asla görünmemeli</p>
        <Bomb />
      </ErrorBoundary>,
    );

    expect(screen.queryByText('bu asla görünmemeli')).not.toBeInTheDocument();
  });

  it('"Tekrar dene" alt ağacı sıfırdan mount eder ve düzelmişse normal render geri döner', async () => {
    fixed = false;
    silenceExpectedConsoleError();
    const user = userEvent.setup();

    render(
      <ErrorBoundary>
        <BombUntilFixed />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('heading', { name: 'Bir şeyler ters gitti.' })).toBeInTheDocument();

    // Gerçek dünyada "düzelme", retry'dan bağımsız, harici bir olaydır
    // (ör. sunucu tekrar ayakta). Burada tam olarak bu simüle edilir:
    // düğmeye basmadan ÖNCE koşul düzeltilir, buton yalnızca alt ağacı
    // yeniden mount etmekten sorumludur.
    fixed = true;

    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }));

    expect(await screen.findByText('güvenli içerik')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bir şeyler ters gitti.' })).not.toBeInTheDocument();
  });

  /**
   * Retry davranışının GÜVENLİ olduğunun kanıtı: kırık bileşen retry'dan
   * SONRA DA patlamaya devam ederse (transient olmayan bir hata), boundary
   * sonsuz döngüye ya da beyaz ekrana düşmez — aynı güvenli fallback'i
   * tekrar gösterir.
   */
  it('retry sonrası hata hâlâ sürüyorsa yeniden güvenli fallback gösterir, çökmez', async () => {
    silenceExpectedConsoleError();
    const user = userEvent.setup();

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }));

    expect(await screen.findByRole('heading', { name: 'Bir şeyler ters gitti.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument();
  });
});
