/**
 * FlowTiger logosu — TEK KAYNAK.
 *
 * Logo üç yerde görünür: marka perdesi, kenar çubuğu ve giriş ekranı.
 * Üçü de bu bileşeni kullanır; üç ayrı markup bir gün birbirinden
 * ayrılırdı.
 *
 * ASSET `public/` ALTINDAN, İÇE AKTARMAYLA DEĞİL.
 *
 * `import logo from '...png'` da çalışırdı ama derleme zamanında dosyanın
 * VAR OLMASINI şart koşardı: asset yerine konmadan önce hem build hem de
 * tüm test paketi çöker, üstelik hata mesajı logoyla ilgisiz görünürdü.
 * Düz URL ile eksik dosya yalnızca kırık bir görsele yol açar — arayüzün
 * geri kalanı ayakta kalır.
 *
 * ORAN KORUNUR: boyut yalnızca YÜKSEKLİKTEN verilir, genişlik `auto`
 * kalır (bkz. global.css). Her iki eksene birden ölçü vermek logoyu
 * ezerdi.
 *
 * `alt=""` + `aria-hidden`: üç kullanım yerinin de yanında görünür
 * "FlowTiger" metni var. Logoya ayrıca alternatif metin vermek, ekran
 * okuyucu kullanıcısına aynı bilgiyi iki kez duyurmak olurdu.
 */

/** Vite `public/` içeriğini kök yoldan sunar. */
export const FLOWTIGER_LOGO_SRC = '/assets/flowtiger-logo.png';

export function FlowTigerMark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <img
      className={`ft-mark ft-mark--${size}`}
      src={FLOWTIGER_LOGO_SRC}
      alt=""
      aria-hidden="true"
      data-testid="flowtiger-mark"
      // Yükleme sırasında satırın zıplamasını önler; gerçek oran CSS'te
      // `height` + `width: auto` ile korunur.
      decoding="async"
    />
  );
}
