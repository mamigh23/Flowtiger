import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { CompanyProvider } from '@/lib/company/CompanyContext';
import { ProtectedRoute, PublicOnlyRoute, RequireActiveCompany } from '@/routes/ProtectedRoute';
import { LoginPage } from '@/features/auth/LoginPage';
import { CompanySelectPage } from '@/features/companies/CompanySelectPage';
import { AppShell } from '@/features/shell/AppShell';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { CustomerListPage } from '@/features/customers/CustomerListPage';
import { CustomerCreatePage } from '@/features/customers/CustomerCreatePage';
import { CustomerDetailPage } from '@/features/customers/CustomerDetailPage';
import { CustomerEditPage } from '@/features/customers/CustomerEditPage';
import { MemberListPage } from '@/features/team/MemberListPage';
import { MemberDetailPage } from '@/features/team/MemberDetailPage';
import { MemberEditPage } from '@/features/team/MemberEditPage';
import { InvitationListPage } from '@/features/invitations/InvitationListPage';
import { InviteMemberPage } from '@/features/invitations/InviteMemberPage';
import { AuditLogListPage } from '@/features/audit/AuditLogListPage';
import { FinanceEntryListPage } from '@/features/finance/FinanceEntryListPage';
import { FinanceEntryCreatePage } from '@/features/finance/FinanceEntryCreatePage';
import { FinanceEntryDetailPage } from '@/features/finance/FinanceEntryDetailPage';
import { FinanceEntryEditPage } from '@/features/finance/FinanceEntryEditPage';
import { ProfilePage } from '@/features/profile/ProfilePage';

/**
 * Rota haritası.
 *
 *   /login                → herkese açık (girişliyse /app'e gider)
 *   /app/company-select   → kimlik gerekir, aktif şirket GEREKMEZ
 *   /app/*                → kimlik + aktif şirket gerekir
 *
 * company-select'in kabuğun DIŞINDA olması bilinçlidir: kullanıcı henüz
 * bir tenant seçmemişken kenar çubuğundaki tenant uçlarını göstermek,
 * tıklandığında 403 duvarına çarpan bir arayüz demek olurdu.
 *
 * CompanyProvider, AuthProvider'ın İÇİNDE: şirket listesi ancak kimlik
 * doğrulandıktan sonra anlamlıdır ve oturum kapanınca temizlenmelidir.
 */
export function App() {
  return (
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
              Ekip ekranları (AŞAMA 3).

              Yeni üye ekleme YOK: POST /members owner'ın başkasının
              parolasını belirlemesini gerektiriyor ve davet akışıyla
              çakışıyor; bu faz kapsamı dışında.
            */}
            <Route path="team" element={<MemberListPage />} />
            <Route path="team/:id" element={<MemberDetailPage />} />
            <Route path="team/:id/edit" element={<MemberEditPage />} />

            {/*
              Davet ekranları (AŞAMA 4) — yalnızca owner tarafı.

              POST /invitations/accept BU KAPSAMIN DIŞINDA: kimlik
              doğrulaması olmayan public bir rota, oturumlu/oturumsuz iki
              ayrı form ve kendi rate-limit'i var. Ayrı bir faz.
            */}
            <Route path="invitations" element={<InvitationListPage />} />
            <Route path="invitations/new" element={<InviteMemberPage />} />

            {/*
              Denetim (AŞAMA 5) — SALT OKUNUR.

              Tek uç var: GET /audit-logs. Tekil audit ucu olmadığı için
              /audit/:id gibi bir rota da YOK; ayrıntı listedeki satırın
              içinde açılır.
            */}
            <Route path="audit" element={<AuditLogListPage />} />

            {/*
              Finans (AŞAMA 7 / WEB-02) — gelir ve gider kayıtları.

              SİLME ROTASI YOK: backend'de DELETE ucu yok, kayıt iptal
              edilir ve iptal ayrıntı ekranından yapılır.

              Yön ROTAYLA belirlenir, prop olarak geçirilir. "Yeni gelir"
              ve "Yeni gider" iki ayrı kullanıcı niyetidir; tek bir
              /finance/new rotası olsaydı yön formda ikinci kez sorulurdu.

              Sıra: "new/..." yolları ":id"den ÖNCE gelmeli — yoksa
              /app/finance/new isteği id'si "new" olan bir kayıt araması
              olarak yorumlanabilirdi.
            */}
            <Route path="finance" element={<FinanceEntryListPage />} />
            <Route path="finance/new/income" element={<FinanceEntryCreatePage direction="in" />} />
            <Route
              path="finance/new/expense"
              element={<FinanceEntryCreatePage direction="out" />}
            />
            <Route path="finance/:id" element={<FinanceEntryDetailPage />} />
            <Route path="finance/:id/edit" element={<FinanceEntryEditPage />} />

            {/*
              Profil ve güvenlik (AŞAMA 6 — A).

              Tek rota, üç kart: hesap bilgileri, e-posta doğrulama,
              parola. Üçü de kullanıcının KENDİ hesabına ait; hiçbiri
              owner-only değil ve hiçbirinde rol kontrolü yok.
            */}
            <Route path="profile" element={<ProfilePage />} />
          </Route>

          <Route path="/" element={<Navigate to="/app" replace />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </CompanyProvider>
    </AuthProvider>
  );
}
