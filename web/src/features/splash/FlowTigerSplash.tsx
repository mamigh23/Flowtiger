import { useLayoutEffect, useState } from 'react';
import { FlowTigerMark } from '@/features/brand/FlowTigerMark';

/**
 * Marka geçişi — yükleme ekranı DEĞİL.
 *
 * Aradaki fark önemli: yükleme ekranı "bekle, bir şey oluyor" der ve
 * beklemenin ne kadar süreceğini bilmediğini itiraf eder (spinner,
 * progress bar). Burada beklenen bir şey YOK — kimlik doğrulaması zaten
 * tamamlanmış, uygulama arkada hazır. Bu yüzden ne spinner var ne
 * ilerleme çubuğu; sahte bir meşguliyet göstermek kullanıcıyı kandırmak
 * olurdu.
 *
 * PERDE HİÇBİR İSTEĞİ BEKLEMEZ. Süresi sabittir ve ağdan bağımsızdır;
 * yavaş bir yanıt perdeyi uzatmaz, hızlı bir yanıt kısaltmaz.
 *
 * SAHNELER (tek bir opacity geçişi değil):
 *   dark    → zemin var, işaret yok
 *   mark    → işaret ölçek + opaklıkla belirir
 *   word    → marka adı işarete eşlik eder
 *   recede  → ikisi hafifçe geri çekilir, arkaya alan bırakır
 *   leaving → perde solar, uygulama görünür
 *
 * Sahneler React state'iyle sürülür, animasyonun kendisi CSS'te. Böylece
 * yeni bir animasyon kütüphanesi eklemeye gerek kalmıyor ve her adım
 * `transform` + `opacity` ile sınırlı — layout'u yeniden hesaplatan
 * pahalı özellikler kullanılmıyor.
 *
 * EKRAN OKUYUCUYA GÖSTERİLMEZ (`aria-hidden`) ve klavye odağını çalmaz:
 * hiç odaklanabilir öğe içermiyor. Aksi hâlde kullanıcının önüne iki
 * saniyelik anlamsız bir duvar konmuş olurdu.
 */

export type SplashScene = 'dark' | 'mark' | 'word' | 'recede' | 'leaving';

/** Sahne başlangıçları (ms). Son değer perdenin kalkma anıdır. */
const TIMELINE: Record<Exclude<SplashScene, 'dark'>, number> = {
  mark: 120,
  word: 780,
  recede: 1500,
  leaving: 1900,
};

const TOTAL_MS = 2350;

/**
 * Hareket azaltma tercihinde SÜRE DE KISALIR.
 *
 * Yalnızca animasyonu kapatmak yetmez: hareketten rahatsız olan
 * kullanıcıyı hareketsiz bir ekrana 2.4 saniye bakmaya zorlamak, ona
 * daha kötü bir deneyim vermek olurdu. Marka anı korunur, süresi kısalır.
 */
const REDUCED_TOTAL_MS = 600;

function prefersReducedMotion(): boolean {
  // jsdom ve eski tarayıcılar için savunmalı: matchMedia her ortamda
  // bulunmayabilir ve yokluğu bir hata değildir.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function FlowTigerSplash({ onDone }: { onDone: () => void }) {
  const [scene, setScene] = useState<SplashScene>('dark');

  /**
   * ZAMAN ÇİZELGESİ LAYOUT EFFECT'TE KURULUR, PASSIVE EFFECT'TE DEĞİL.
   *
   * Fark bu bileşen için belirleyici: layout effect commit'in İÇİNDE,
   * DOM yazıldıktan hemen sonra ve ilk boyamadan ÖNCE senkron çalışır.
   * Passive effect ise commit'ten sonra, ayrı bir tur olarak — yani perde
   * ekranda görünür ama zaman çizelgesi henüz kurulmamış olabilir.
   *
   * Bunun iki somut sonucu vardı:
   *
   *   1. İLK SAHNE UZARDI. "dark" sahnesi 120ms sürmesi gerekirken,
   *      tarayıcı yoğunsa passive effect'in gecikmesi kadar daha uzun
   *      kalıyordu. Sahne süreleri boyama ile senkron olmalı; zamanlaması
   *      boyamaya bağlı iş layout effect'e aittir.
   *
   *   2. "PERDE EKRANDA AMA SAYAÇ YOK" ARA DURUMU OLUŞUYORDU. Perdeyi
   *      DOM'da gören her gözlemci — ister tarayıcı, ister test — sayaçların
   *      da kurulduğunu varsayamıyordu. Bu ara durumda zamanı ilerleten
   *      bir gözlemci hiçbir sayaç bulamıyor, çizelge ondan SONRA
   *      kuruluyor ve perde asla kapanmıyordu.
   *
   * Layout effect ile ikisi aynı senkron commit'te olur: perde DOM'daysa
   * çizelge de kurulmuştur. Ara durum ortadan kalkar.
   */
  useLayoutEffect(() => {
    const reduced = prefersReducedMotion();

    if (reduced) {
      // Tek sahne: işaret ve ad birlikte, hareketsiz, kısa.
      setScene('word');

      const done = setTimeout(onDone, REDUCED_TOTAL_MS);
      return () => clearTimeout(done);
    }

    const timers = [
      setTimeout(() => setScene('mark'), TIMELINE.mark),
      setTimeout(() => setScene('word'), TIMELINE.word),
      setTimeout(() => setScene('recede'), TIMELINE.recede),
      setTimeout(() => setScene('leaving'), TIMELINE.leaving),
      setTimeout(onDone, TOTAL_MS),
    ];

    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [onDone]);

  return (
    <div
      className={`ft-splash ft-splash--${scene}`}
      data-testid="flowtiger-splash"
      data-scene={scene}
      aria-hidden="true"
    >
      <div className="ft-splash__brand">
        <FlowTigerMark size="lg" />
        <span className="ft-splash__word">FlowTiger</span>
      </div>
    </div>
  );
}
