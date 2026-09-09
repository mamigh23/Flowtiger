import { greetingFor } from './greeting';

/**
 * Karşılama — ana ekranın ilk ve en güçlü bloğu.
 *
 * İSİM OTURUMDAKİ GERÇEK KULLANICIDAN GELİR. Yer tutucu bir ad yazmak,
 * ekranı dolu göstermek için kimliği uydurmak olurdu; kullanıcı ilk
 * saniyede kendi adı yerine bir örnek görürse ekranın geri kalanına da
 * güvenmez.
 *
 * TARİH BURADA DEĞİL, PLAN BAŞLIĞINDA. Aynı bilgiyi iki yerde göstermek
 * hem gürültü, hem de ekran okuyucu için aynı cümlenin tekrarı.
 *
 * SAAT DIŞARIDAN VERİLİR: bileşen `new Date()` çağırmaz, böylece saf
 * kalır ve sahte saat kurmadan sınanabilir.
 */
export function DashboardWelcome({ name, hour }: { name: string | null; hour: number }) {
  const greeting = greetingFor(hour);

  return (
    <header className="ft-hero">
      <div className="ft-hero__content">
        <h1 className="ft-hero__title">
          {name ? (
            <>
              <span className="ft-hero__greeting">{greeting},</span>{' '}
              <span className="ft-hero__name">{name}.</span>
            </>
          ) : (
            /* Ad henüz yüklenmediyse yalnızca selamlama; boş bir virgül
               ya da yer tutucu bir ad yazılmaz. */
            <span className="ft-hero__greeting">{greeting}.</span>
          )}
          {/*
            El işareti DEKORATİFTİR ve erişilebilir addan çıkarılır.
            Aksi hâlde ekran okuyucu "el sallama" diye okur ve selamlama
            cümlesi bozulur.
          */}
          <span className="ft-hero__wave" aria-hidden="true">
            👋
          </span>
        </h1>

        <p className="ft-hero__lead">Hoş geldiniz.</p>
        <p className="ft-hero__sub ft-muted">Bugün işletmeniz için neler var?</p>
      </div>

      {/* Marka rengini taşıyan sakin bir ışık; içerik değil, atmosfer. */}
      <div className="ft-hero__glow" aria-hidden="true" />

      {/*
        MARKA GÖRSELİ — hero'nun sağ yarısındaki boşluğu dolduran şey.

        Görsel MEVCUT asset'tir (`public/assets/flowtiger-logo.png`) ve
        CSS arka planı olarak veriliyor; yeni bir görsel üretilmedi.

        `FlowTigerMark` BİLEŞENİ KULLANILMADI ve bu bilinçli: o bileşen
        markanın KİMLİK işaretidir ve AppShell testi "perde kalktıktan
        sonra ekranda tek marka işareti kalır" kuralını kilitliyor.
        Buradaki kaplan bir kimlik işareti değil, `ft-hero__glow` ile
        aynı kategoriden bir ATMOSFER katmanı — bu yüzden aynı şekilde
        dekoratif ve erişilebilirlik ağacının dışında.
      */}
      <div className="ft-hero__art" aria-hidden="true" />
    </header>
  );
}
