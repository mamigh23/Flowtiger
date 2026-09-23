import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, endpoints, toUserMessage } from '@/lib/api';
import { ErrorState } from '@/components/ui';
import { formatDateTime } from '@/features/audit/auditLabels';
import { useCompanies } from '@/lib/company/CompanyContext';
import { roleLabel } from '@/lib/company/roleLabel';
import type { User } from '@/types/api';
import { AccountCard } from './AccountCard';
import { EmailVerificationCard } from './EmailVerificationCard';
import { PasswordCard } from './PasswordCard';

/**
 * Profil ve güvenlik ayarları — kullanıcının KENDİ hesabı.
 *
 * ÜÇ KART, ÜÇ AYRI UÇ:
 *   Hesap bilgileri  → GET/PUT /profile
 *   E-posta doğrulama → POST /auth/email/verification-notification
 *   Parola           → PUT /profile/password
 *
 * BU EKRANDA ROL KONTROLÜ YOKTUR ve olmamalı: bu uçların hiçbiri
 * owner-only değil. Kullanıcı kendi kaydını yönetiyor; yetkilendirilecek
 * bir "başkası" kavramı hiç oluşmuyor. Bu yüzden burada 403 durumu da
 * yoktur — olmayan bir duruma arayüz yazmak, bir gün yanlış yerde
 * gösterilecek bir metin yazmaktır.
 *
 * VERİ /profile'DAN GELİR, oturumdaki kullanıcıdan DEĞİL. /me ile
 * /profile aynı gövdeyi döndürür ama aynı şey değildir: /me kimlik
 * sorgusu, /profile profil kaynağının kökü. Ekran kendi kaynağını
 * okumazsa, başka bir cihazdan yapılmış bir değişiklik hiç görünmez.
 *
 * DOĞRULAMA DURUMUNUN SAHİBİ BU SAYFADIR, AuthContext DEĞİL: e-posta
 * değiştiğinde backend `email_verified_at`'i null'a çeker ve bunu PUT
 * yanıtında bildirir. Oturumdaki kullanıcı ise bir sonraki /me'ye kadar
 * eski hâlini taşıyabilir.
 *
 * ------------------------------------------------------------------
 * GÖRSEL DİL (UI redesign turu)
 *
 * ÜÇ KART DEĞİŞMEDİ. AccountCard, EmailVerificationCard ve PasswordCard
 * aynı bileşenler: aynı alanlar, aynı gövdeler, aynı hata/başarı
 * davranışı. Bu dosya yalnızca çerçeveyi değiştirir — hero, yerleşim
 * ızgarası, yükleme ve hata yüzeyleri.
 *
 * FORM DİLİ YENİDEN KULLANILIR: kartları saran ızgara `ft-form-page`
 * kapsam sınıfını da taşır, yani kutulanmış 44px alanlar, okunur
 * etiketler, turuncu odak halkası, kırmızı hata kutusu ve 375px'te tam
 * genişlik düğmeler müşteri/görev formlarıyla AYNI kurallardan gelir.
 * Yeni bir form sistemi yazılmadı.
 *
 * HERO YALNIZCA ELDE OLAN BİLGİYİ GÖSTERİR:
 *   - ad ve e-posta `/profile` yanıtından (kaydedilince güncellenir);
 *   - aktif şirket ve rol oturumun şirket listesinden — yalnızca
 *     GÖRÜNTÜLEME, bu değerle hiçbir yetki kararı verilmez. Rol pivot
 *     yüklenmediyse (alan yoksa) rozet hiç çıkmaz; "—" uydurulmaz;
 *   - hesap oluşturma tarihi `formatDateTime` ile (ham ISO gösterilmez).
 *
 * DOĞRULAMA DURUMU HERO'DA TEKRARLANMAZ. E-posta kartı "zaten
 * doğrulanmış" yanıtını kendi içinde tutuyor; hero `email_verified_at`
 * okusaydı iki yer aynı anda farklı şey söyleyebilirdi. Durumun tek bir
 * yeri var: e-posta kartı.
 *
 * OTURUMU KAPATMA BURADA YOK ve eklenmedi: kabuktaki hesap menüsünde
 * duruyor (mevcut davranış).
 */
export function ProfilePage() {
  const [profile, setProfile] = useState<User | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setProfile(await endpoints.profile.get(api));
    } catch (caught) {
      // 401 merkezî olarak ApiClient'ta ele alınır.
      setError(caught);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="ft-page ft-profile">
      {/* ----------------------------------------------------- başlık */}
      <header className="ft-profile-hero">
        <div className="ft-profile-hero__text">
          <span className="ft-profile-hero__eyebrow">Hesap</span>
          <h1 className="ft-profile-hero__title">Profil</h1>
          <p className="ft-profile-hero__lead">
            Ad, e-posta ve parola — yalnızca sizin hesabınız.
          </p>
        </div>
      </header>

      {/* ---------------------------------------------------- yükleme */}
      {loading && (
        <div className="ft-profile-panel" data-testid="profile-loading" aria-hidden="true">
          <span className="ft-skeleton ft-profile-skeleton__avatar" />
          <span className="ft-profile-skeleton__lines">
            <span className="ft-skeleton ft-profile-skeleton__name" />
            <span className="ft-skeleton ft-profile-skeleton__meta" />
          </span>
        </div>
      )}

      {/* ------------------------------------------------------- hata */}
      {!loading && error !== null && (
        <div className="ft-profile-panel ft-profile-panel--notice">
          <ErrorState message={toUserMessage(error)} />
        </div>
      )}

      {!loading && !error && profile && (
        <>
          <ProfileIdentity profile={profile} />

          {/*
            IZGARA `ft-form-page` KAPSAMINI TAŞIR: kartların içindeki
            alanlar, etiketler, düğmeler ve hata kutuları diğer
            formlarla aynı kurallardan gelir.
          */}
          <div className="ft-form-page ft-profile-grid">
            <div className="ft-profile-slot ft-profile-slot--account">
              <AccountCard profile={profile} onSaved={setProfile} />
            </div>

            <div className="ft-profile-slot ft-profile-slot--verify">
              {/*
                key: e-posta değişince kart YENİDEN KURULUR ve içindeki
                "backend zaten doğrulanmış dedi" işareti sıfırlanır. Aksi
                halde adresini değiştiren bir kullanıcı, yeni adresi
                doğrulanmış sanırdı.
              */}
              <EmailVerificationCard key={profile.email} profile={profile} />
            </div>

            <div className="ft-profile-slot ft-profile-slot--password">
              <PasswordCard />
            </div>
          </div>

          <div className="ft-profile-security-link">
            <div>
              <h2>Güvenlik</h2>
              <p>Aktif oturumları ve güvenlik hareketlerini görüntüleyin.</p>
            </div>
            <Link className="ft-button ft-button--secondary" to="/app/profile/security">
              Güvenlik ve oturumlar
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Kimlik kartı — kim olduğunuz ve hangi şirkette olduğunuz.
 *
 * YALNIZCA GÖRÜNTÜLEME. Rol ve şirket burada düzenlenmez (rol owner'ın
 * ayrı ucudur, şirket kabuktaki seçiciden değişir) ve bu değerlerle
 * istemcide hiçbir karar verilmez.
 *
 * Etiketler `<dt>`dir, `<label>` DEĞİL: ekranda "E-posta" adlı ikinci bir
 * form denetimi olsaydı, formdaki gerçek alanla karışırdı.
 */
function ProfileIdentity({ profile }: { profile: User }) {
  const { activeCompany } = useCompanies();
  const joined = formatDateTime(profile.created_at);

  return (
    <section className="ft-profile-identity" aria-labelledby="ft-profile-identity-name">
      {/* Baş harfler görsel işaret; adın erişilebilir okunuşuna karışmaz. */}
      <span className="ft-profile-identity__avatar" aria-hidden="true">
        {initials(profile.name)}
      </span>

      <div className="ft-profile-identity__main">
        <h2 className="ft-profile-identity__name" id="ft-profile-identity-name">
          {profile.name}
        </h2>
        <p className="ft-profile-identity__email">{profile.email}</p>
      </div>

      <dl className="ft-profile-identity__facts">
        {activeCompany && (
          <div className="ft-profile-identity__fact">
            <dt>Aktif şirket</dt>
            <dd>
              <span className="ft-profile-identity__company">{activeCompany.name}</span>
              {activeCompany.role && (
                <span
                  className={`ft-profile-role${
                    activeCompany.role === 'owner' ? ' ft-profile-role--owner' : ''
                  }`}
                >
                  {roleLabel(activeCompany.role)}
                </span>
              )}
            </dd>
          </div>
        )}

        {joined !== null && (
          <div className="ft-profile-identity__fact">
            <dt>Hesap oluşturma</dt>
            <dd className="ft-profile-identity__date">{joined}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

/**
 * Ad baş harfleri — ekip, müşteri ve denetim listelerindeki rozetle AYNI
 * kural. `toLocaleUpperCase('tr-TR')`: "istanbul" → "İS", "IS" değil.
 */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toLocaleUpperCase('tr-TR');
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toLocaleUpperCase('tr-TR');
}
