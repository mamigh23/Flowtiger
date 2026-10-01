import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { useCompanies } from '@/lib/company/CompanyContext';
import { Badge, Button, Card, ErrorState, LoadingScreen } from '@/components/ui';
import { roleLabel } from '@/lib/company/roleLabel';

/**
 * Şirket seçimi.
 *
 * Seçim yalnızca POST /companies/{id}/select ile yapılır. İstemci
 * hiçbir yerde active_company_id yazmaz (playbook §3.1).
 *
 * İKİ KİP, TEK EKRAN
 *
 *   İLK SEÇİM (varsayılan) — kullanıcının aktif şirketi yoktur. Tek
 *   şirketi olan kullanıcı buraya hiç düşmez: CompanyProvider otomatik
 *   seçer. Bu kip 0 ve 2+ şirket durumlarını karşılar; seçim sonrası
 *   kullanıcı panele gider.
 *
 *   GEÇİŞ (`?switch=1`) — kullanıcının aktif bir şirketi VARDIR ve
 *   başka bir şirkete geçmek istiyor. Ekran bu kipte panele geri
 *   yönlendirmez (yoksa "Şirket değiştir" bağlantısı anında geri
 *   dönerdi); aktif şirketi işaretler ve "Vazgeç" ile panele dönüş
 *   sunar. Seçim başarılı olduğunda yine panele gidilir.
 *
 * KİP NEDEN ADRESTE: kullanıcı geri tuşuna bastığında seçim ekranından
 * değil, panele dönmelidir. Kipi bileşen state'inde tutmak, gezinme
 * geçmişinde "geri dönülecek bir ekran" bırakırdı.
 */
export function CompanySelectPage() {
  const { logout } = useAuth();
  const {
    companies,
    activeCompanyId,
    status,
    error,
    selectingId,
    selectionPending,
    selectError,
    verifyError,
    select,
    reload,
    reverify,
  } = useCompanies();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const switching = searchParams.get('switch') === '1';

  /*
   * İLK SEÇİMDE aktif şirket belirirse (ör. başka bir sekmede seçim
   * yapılmış, ya da tek şirketli otomatik seçim tamamlanmış) panele
   * dönülür. GEÇİŞ kipinde bu yönlendirme YOKTUR: kullanıcı bilerek
   * buraya geldi ve aktif şirket zaten dolu.
   */
  if (!switching && activeCompanyId !== null) {
    return <Navigate to="/app" replace />;
  }

  if (status === 'idle' || status === 'loading') {
    return <LoadingScreen />;
  }

  async function handleSelect(companyId: number) {
    try {
      await select(companyId);
      navigate('/app', { replace: true });
    } catch {
      // Hata selectError üzerinden gösteriliyor. Seçim başarısızsa
      // kullanıcı bu ekranda kalır ve mevcut şirketi değişmez.
    }
  }

  return (
    <div className="ft-auth">
      <Card className="ft-auth__card ft-auth__card--wide">
        <div className="ft-stack">
          <header>
            <h1 className="ft-auth__title">
              {switching ? 'Şirket değiştir' : 'Şirket seçin'}
            </h1>
            <p className="ft-muted">
              {switching
                ? 'Geçmek istediğiniz şirketi seçin. Seçim, sunucu onayladıktan sonra geçerli olur.'
                : 'Hangi şirkette çalışacağınızı seçin.'}
            </p>
          </header>

          {status === 'error' && error && <ErrorState message={error} />}
          {selectError && <ErrorState message={selectError} />}

          {/*
            BELİRSİZ SONUÇ UYARISI.

            Bir seçim denemesi ağ/5xx ile belirsiz kaldıysa ve sunucudaki
            durum doğrulanamadıysa, kullanıcı hangi şirkette olduğunu
            bilmiyor demektir. Uyarı bu belirsizliği açıkça söyler;
            listedeki "Aktif şirket" işareti en son BİLİNEN durumu
            gösterir, kesinleşmiş hâli değil.
          */}
          {verifyError && (
            <ErrorState message="Sunucudaki aktif şirketiniz doğrulanamadı. Aşağıdaki işaret son bilinen durumdur; seçiminizi yeniden yapın." />
          )}

          {status === 'ready' && companies.length === 0 && (
            <div className="ft-empty">
              <p>Henüz hiçbir şirkete üye değilsiniz.</p>
              <p className="ft-muted">
                Bir şirket sahibinin sizi davet etmesi gerekiyor. Davet e-postanızı kontrol edin.
              </p>
            </div>
          )}

          <ul className="ft-company-list">
            {companies.map((company) => {
              const isActive = company.id === activeCompanyId;

              return (
                <li key={company.id}>
                  <div className="ft-company">
                    <div className="ft-company__info">
                      <span className="ft-company__name">{company.name}</span>
                      {company.role && <Badge>{roleLabel(company.role)}</Badge>}
                      {/* Aktiflik yalnızca renkle değil, metinle de bildirilir. */}
                      {isActive && <Badge tone="accent">Aktif şirket</Badge>}
                    </div>

                    <Button
                      variant="secondary"
                      onClick={() => void handleSelect(company.id)}
                      loading={selectingId === company.id}
                      // Aktif şirketi yeniden seçmek bir istek atmaz:
                      // durum değişmez, kullanıcıya sahte bir işlem
                      // gösterilmez.
                      disabled={isActive || selectingId !== null}
                    >
                      {isActive ? 'Seçili' : 'Seç'}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="ft-auth__footer">
            {status === 'error' && (
              <Button
                variant="ghost"
                onClick={() => void reload()}
                // Liste yeniden yüklenirken SEÇİM SÜRÜYORSA beklenir:
                // `reload` durumu 'loading'e çeker ve taze bir okuma
                // başlatır — süren bir seçimin sonucunu ezmemesi için
                // aynı `companyListSeq` kuralına girer, ama kullanıcıya
                // iki işi aynı anda yaptırmamak daha az şaşırtıcıdır.
                disabled={selectionPending}
              >
                Tekrar dene
              </Button>
            )}
            {switching && activeCompanyId !== null && (
              <Button
                variant="ghost"
                onClick={() => navigate('/app', { replace: true })}
                disabled={selectingId !== null}
              >
                Vazgeç
              </Button>
            )}

            {/*
              GEÇİŞ KİPİNDE LİSTE BOŞSA bile panele dönüş yolu kalmalı:
              aksi hâlde kullanıcı seçim yapamayacağı bir ekranda
              kilitlenirdi. (Aktif şirketi varken listesi boş gelmesi
              beklenmez; bu yalnızca savunmalı bir çıkış.)
            */}
            {switching && activeCompanyId === null && (
              <Button variant="ghost" onClick={() => navigate('/app', { replace: true })}>
                Panele dön
              </Button>
            )}

            {verifyError && (
              <Button variant="ghost" onClick={() => void reverify()}>
                Durumu doğrula
              </Button>
            )}

            {/*
              GELEN DAVETLER — bu ekrandan erişilebilir olması GEREKLİDİR.

              Davet bağlantısı hesap menüsünde duruyor ama menü KABUKTA
              yaşar; aktif şirketi olmayan kullanıcı ise `RequireActiveCompany`
              tarafından tam bu ekrana gönderilir ve kabuğu hiç görmez.
              Bağlantı yalnızca menüde olsaydı, "aktif şirketi olmayan
              kullanıcı gelen davetlerini görebilsin" kuralı kâğıt üstünde
              kalırdı: daveti olan kişi çoğu zaman henüz hiçbir şirketin
              üyesi değildir ve tam bu ekrandadır.
            */}
            <Link className="ft-button ft-button--ghost" to="/app/invitations/incoming">
              Gelen davetler
            </Link>

            <Button variant="ghost" onClick={() => void logout()}>
              Çıkış yap
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
