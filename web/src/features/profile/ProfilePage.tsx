import { useCallback, useEffect, useState } from 'react';
import { api, endpoints, toUserMessage } from '@/lib/api';
import { Card, ErrorState, Skeleton } from '@/components/ui';
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
    <div className="ft-page">
      <header className="ft-page__header">
        <h1 className="ft-page__title">Profil</h1>
      </header>

      {loading && (
        <Card>
          <div data-testid="profile-loading" className="ft-stack">
            <Skeleton />
            <Skeleton width="80%" />
            <Skeleton width="60%" />
          </div>
        </Card>
      )}

      {!loading && error !== null && (
        <Card>
          <ErrorState message={toUserMessage(error)} />
        </Card>
      )}

      {!loading && !error && profile && (
        <>
          <AccountCard profile={profile} onSaved={setProfile} />

          {/*
            key: e-posta değişince kart YENİDEN KURULUR ve içindeki
            "backend zaten doğrulanmış dedi" işareti sıfırlanır. Aksi
            halde adresini değiştiren bir kullanıcı, yeni adresi
            doğrulanmış sanırdı.
          */}
          <EmailVerificationCard key={profile.email} profile={profile} />

          <PasswordCard />
        </>
      )}
    </div>
  );
}
