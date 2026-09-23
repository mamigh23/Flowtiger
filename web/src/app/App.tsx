import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { CompanyProvider } from '@/lib/company/CompanyContext';
import { ProtectedRoute, PublicOnlyRoute, RequireActiveCompany } from '@/routes/ProtectedRoute';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { CompanySelectPage } from '@/features/companies/CompanySelectPage';
import { AppShell } from '@/features/shell/AppShell';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { CustomerListPage } from '@/features/customers/CustomerListPage';
import { CustomerCreatePage } from '@/features/customers/CustomerCreatePage';
import { CustomerDetailPage } from '@/features/customers/CustomerDetailPage';
import { CustomerEditPage } from '@/features/customers/CustomerEditPage';
import { TeamHubPage } from '@/features/team/TeamHubPage';
import { MemberDetailPage } from '@/features/team/MemberDetailPage';
import { MemberEditPage } from '@/features/team/MemberEditPage';
import { InviteMemberPage } from '@/features/invitations/InviteMemberPage';
import { AcceptInvitationPage } from '@/features/invitations/AcceptInvitationPage';
import { AuditLogListPage } from '@/features/audit/AuditLogListPage';
import { FinanceHubPage } from '@/features/finance/FinanceHubPage';
import { FinanceEntryCreatePage } from '@/features/finance/FinanceEntryCreatePage';
import { FinanceEntryDetailPage } from '@/features/finance/FinanceEntryDetailPage';
import { FinanceEntryEditPage } from '@/features/finance/FinanceEntryEditPage';
import { PaymentCreatePage } from '@/features/payments/PaymentCreatePage';
import { PaymentDetailPage } from '@/features/payments/PaymentDetailPage';
import { PaymentEditPage } from '@/features/payments/PaymentEditPage';
import { TaskListPage } from '@/features/tasks/TaskListPage';
import { TaskCreatePage } from '@/features/tasks/TaskCreatePage';
import { TaskDetailPage } from '@/features/tasks/TaskDetailPage';
import { TaskEditPage } from '@/features/tasks/TaskEditPage';
import { ProfilePage } from '@/features/profile/ProfilePage';
import { SecurityPage } from '@/features/profile/SecurityPage';

/**
 * Rota haritası.
 *
 *   /login                → herkese açık (girişliyse /app'e gider)
 *   /invitations/accept   → herkese açık, kimlik durumundan BAĞIMSIZ
 *   /password/forgot      → herkese açık (girişliyse /app'e gider)
 *   /password/reset/:token → herkese açık, kimlik durumundan BAĞIMSIZ
 *   /app/company-select   → kimlik gerekir, aktif şirket GEREKMEZ
 *   /app/*                → kimlik + aktif şirket gerekir
 *
 * company-select'in kabuğun DIŞINDA olması bilinçlidir: kullanıcı henüz
 * bir tenant seçmemişken kenar çubuğundaki tenant uçlarını göstermek,
 * tıklandığında 403 duvarına çarpan bir arayüz demek olurdu.
 *
 * /invitations/accept de kabuğun DIŞINDA VE `PublicOnlyRoute`/
 * `ProtectedRoute`'un DIŞINDADIR — ikisi de tek bir kimlik durumunu
 * varsayar, bu ekran ise İKİSİNİ DE desteklemek zorunda: hesabı olmayan
 * bir davetli de gelebilir, giriş yapmış biri de. `POST
 * /invitations/accept`'in kendisi de aynı sebeple `auth:sanctum`
 * taşımaz (backend `$request->user('sanctum')` ile isteğe bağlı çözer).
 *
 * CompanyProvider, AuthProvider'ın İÇİNDE: şirket listesi ancak kimlik
 * doğrulandıktan sonra anlamlıdır ve oturum kapanınca temizlenmelidir.
 *
 * ErrorBoundary EN DIŞTADIR (P1-04): render sırasında beklenmedik bir
 * istisna — AuthProvider/CompanyProvider'ın kendisinde dahil — beyaz
 * ekran yerine güvenli bir fallback ekrana düşer. Ayrıntı için bkz.
 * ErrorBoundary.tsx.
 */
export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <CompanyProvider>
          <Routes>
            <Route
              path="/login"
              element={
                <PublicOnlyRoute>
                  <LoginPage />
                </PublicOnlyRoute>
              }
            />

            {/*
              Self-servis kayıt (P0-03) — /login ile AYNI koruma:
              PublicOnlyRoute, zaten girişli kullanıcıyı burada TUTMAZ.
              Backend'in kendisi de register'ı public tutuyor (auth:sanctum
              taşımaz) — istemci tarafı bunun yalnızca kullanışlılık yansımasıdır.
            */}
            <Route
              path="/register"
              element={
                <PublicOnlyRoute>
                  <RegisterPage />
                </PublicOnlyRoute>
              }
            />

            <Route path="/invitations/accept" element={<AcceptInvitationPage />} />

            {/*
              Parola sıfırlama. Yollar BACKEND'İN bağlantı şablonuyla
              aynıdır: config('flowtiger.password_reset.url') =
              "<taban>/password/reset/{token}?email={email}".

              "Unuttum" ekranı /login ile aynı korumayı taşır. Sıfırlama
              ekranı ise PublicOnlyRoute'un DIŞINDADIR: bağlantıya aynı
              tarayıcıda girişliyken tıklayan kullanıcı /app'e atılsaydı
              parolasını hiç sıfırlayamazdı. Backend uçları da public.
            */}
            <Route
              path="/password/forgot"
              element={
                <PublicOnlyRoute>
                  <ForgotPasswordPage />
                </PublicOnlyRoute>
              }
            />

            <Route path="/password/reset/:token" element={<ResetPasswordPage />} />

            <Route
              path="/app/company-select"
              element={
                <ProtectedRoute>
                  <CompanySelectPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <RequireActiveCompany>
                    <AppShell />
                  </RequireActiveCompany>
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />

              {/*
                Müşteri ekranları (AŞAMA 2).

                Sıra önemli: "new" yolu ":id"den ÖNCE gelmeli, yoksa
                /app/customers/new isteği id'si "new" olan bir müşteri
                araması olarak yorumlanırdı.
              */}
              <Route path="customers" element={<CustomerListPage />} />
              <Route path="customers/new" element={<CustomerCreatePage />} />
              <Route path="customers/:id" element={<CustomerDetailPage />} />
              <Route path="customers/:id/edit" element={<CustomerEditPage />} />

              {/*
                Ekip (AŞAMA 3 + 4) — üyeler VE davetler, TEK EKRANDA.

                `TeamHubPage` başlığı, şirket geneli özeti ve bölüm
                seçimini taşır; açık bölüm URL'den gelir:
                  /app/team              → üyeler
                  /app/team/invitations  → davetler
                Mimari Finans ekranıyla (FinanceHubPage) aynı.

                `team/invitations` ile `team/:id` ÇAKIŞMAZ: React Router
                rotaları bildirim sırasına değil ÖZGÜLLÜĞE göre sıralar ve
                sabit segment dinamik olanı yener. Üye ayrıntı ve
                düzenleme rotaları değişmedi.

                Yeni üye ekleme YOK: POST /members owner'ın başkasının
                parolasını belirlemesini gerektiriyor ve davet akışıyla
                çakışıyor; ekibe katılım davetle yürür.
              */}
              <Route path="team" element={<TeamHubPage segment="members" />} />
              <Route path="team/invitations" element={<TeamHubPage segment="invitations" />} />
              <Route path="team/:id" element={<MemberDetailPage />} />
              <Route path="team/:id/edit" element={<MemberEditPage />} />

              {/*
                Davet ekranları (AŞAMA 4) — owner tarafı (gönder/listele/iptal).

                LİSTE ROTASI ARTIK YÖNLENDİRİR. Davet listesi birleşik Ekip
                ekranının bir bölümü oldu; `/app/invitations` KALDI ve
                oraya yönlendiriyor. Rotayı silmek, davet gönderme
                formunun "Vazgeç" bağlantısını ve başarı sonrası dönüşünü,
                yer imlerini ve dışarıdan gelen her linki kırardı.
                `replace`: geri tuşu kullanıcıyı yönlendirme sayfasına
                geri sokmasın.

                Kabul tarafı (/invitations/accept) BURADA DEĞİL: kimlik
                doğrulaması olmayan, kabuğun ve owner yetkisinin dışında
                ayrı bir rota (yukarıda, /login'in yanında) — DEĞİŞMEDİ.
              */}
              <Route path="invitations" element={<Navigate to="/app/team/invitations" replace />} />
              <Route path="invitations/new" element={<InviteMemberPage />} />

              {/*
                Denetim (AŞAMA 5) — SALT OKUNUR.

                Tek uç var: GET /audit-logs. Tekil audit ucu olmadığı için
                /audit/:id gibi bir rota da YOK; ayrıntı listedeki satırın
                içinde açılır.
              */}
              <Route path="audit" element={<AuditLogListPage />} />

              {/*
                Finans (AŞAMA 7 / WEB-02) — gelir/gider kayıtları VE
                tahsilatlar, TEK EKRANDA.

                `FinanceHubPage` başlığı, özet kartlarını ve bölüm
                seçimini taşır; açık bölüm URL'den gelir:
                  /app/finance           → gelir/gider kayıtları
                  /app/finance/payments  → tahsilatlar
                Bölümü state yerine URL'de tutmak, onu paylaşılabilir ve
                yer imlenebilir kılar; tarayıcı geri tuşu da çalışır.

                `finance/payments` ile `finance/:id` ÇAKIŞMAZ: React
                Router rotaları bildirim sırasına değil ÖZGÜLLÜĞE göre
                sıralar ve sabit segment dinamik olanı yener.

                SİLME ROTASI YOK: backend'de DELETE ucu yok, kayıt iptal
                edilir ve iptal ayrıntı ekranından yapılır.

                Yön ROTAYLA belirlenir, prop olarak geçirilir. "Yeni gelir"
                ve "Yeni gider" iki ayrı kullanıcı niyetidir; tek bir
                /finance/new rotası olsaydı yön formda ikinci kez sorulurdu.

                Sıra: "new/..." yolları ":id"den ÖNCE gelmeli — yoksa
                /app/finance/new isteği id'si "new" olan bir kayıt araması
                olarak yorumlanabilirdi.
              */}
              <Route path="finance" element={<FinanceHubPage segment="entries" />} />
              <Route path="finance/payments" element={<FinanceHubPage segment="payments" />} />
              <Route path="finance/new/income" element={<FinanceEntryCreatePage direction="in" />} />
              <Route
                path="finance/new/expense"
                element={<FinanceEntryCreatePage direction="out" />}
              />
              <Route path="finance/:id" element={<FinanceEntryDetailPage />} />
              <Route path="finance/:id/edit" element={<FinanceEntryEditPage />} />

              {/*
                Ödemeler (AŞAMA 7 / WEB-03) — tahsilat ve dağıtım.

                LİSTE ROTASI ARTIK YÖNLENDİRİR. Ödeme listesi birleşik
                Finans ekranının bir bölümü oldu; `/app/payments` KALDI ve
                oraya yönlendiriyor. Rotayı silmek, kenar çubuğundaki
                bağlantıyı, yer imlerini ve dışarıdan gelen her linki
                kırardı. `replace`: geri tuşu kullanıcıyı yönlendirme
                sayfasına geri sokmasın.

                OLUŞTURMA, AYRINTI VE DÜZENLEME KENDİ ROTALARINDA KALDI:
                ödeme iptali (void) geri alınamaz bir karardır ve bir
                liste satırının içine sıkıştırılmaz.

                SİLME ROTASI YOK: backend'de DELETE ucu yok, ödeme iptal
                edilir ve dağıtımları yerinde kalır.

                Dağıtımların AYRI ROTASI DA YOK: ödemenin gövdesiyle
                birlikte yazılırlar. Ayrı bir uç olsaydı "toplam dağıtım
                ödemeyi aşamaz" kuralı iki isteğe yayılır ve arada geçersiz
                bir ara durum oluşurdu.
              */}
              <Route path="payments" element={<Navigate to="/app/finance/payments" replace />} />
              <Route path="payments/new" element={<PaymentCreatePage />} />
              <Route path="payments/:id" element={<PaymentDetailPage />} />
              <Route path="payments/:id/edit" element={<PaymentEditPage />} />

              {/*
                Görevler (Task/Planning v1) — günün işleri.

                SİLME VARDIR, finans ve ödemeden farklı olarak. Finans kaydı
                iptal edilir çünkü silinmesi geçmiş bir dönemin toplamını
                sessizce değiştirir; yapılacak bir işin böyle bir özelliği
                yok.

                ŞİRKET GENELİ: owner-only değil. Rol kapısı istemcide de
                yok — karar backend'de (playbook §3.1).

                Sıra: "new" yolu ":id"den ÖNCE gelmeli, yoksa
                /app/tasks/new isteği id'si "new" olan bir görev araması
                olarak yorumlanabilirdi.
              */}
              <Route path="tasks" element={<TaskListPage />} />
              <Route path="tasks/new" element={<TaskCreatePage />} />
              <Route path="tasks/:id" element={<TaskDetailPage />} />
              <Route path="tasks/:id/edit" element={<TaskEditPage />} />

              {/*
                Profil ve güvenlik (AŞAMA 6 — A).

                Tek rota, üç kart: hesap bilgileri, e-posta doğrulama,
                parola. Üçü de kullanıcının KENDİ hesabına ait; hiçbiri
                owner-only değil ve hiçbirinde rol kontrolü yok.
              */}
              <Route path="profile" element={<ProfilePage />} />
              <Route path="profile/security" element={<SecurityPage />} />
            </Route>

            <Route path="/" element={<Navigate to="/app" replace />} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
        </CompanyProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
