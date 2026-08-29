import type { ApiClient } from './client';
import type {
  AuditLog,
  Company,
  CompanyBilling,
  CompanyBillingInput,
  Customer,
  CustomerBilling,
  CustomerBillingInput,
  FinanceEntry,
  FinanceEntryInput,
  Invitation,
  LoginResult,
  Member,
  Paginated,
  Payment,
  PaymentInput,
  Role,
  SecurityEvent,
  Session,
  Task,
  TaskInput,
  User,
  VoidInput,
} from '@/types/api';

/**
 * Backend sözleşmesinin tek yerde toplanmış hâli.
 *
 * Her fonksiyon bir backend ucuna karşılık gelir. URL'ler yalnızca
 * burada yazılır; özellik kodu string yol kurmaz. Backend'de bir yol
 * değişirse tek dosya güncellenir.
 *
 * Bu fazda UI'ı olmayan uçlar da tanımlandı: sözleşmenin tamamının
 * tek yerde görünür olması, ekranlar yazılırken "bu uç var mıydı?"
 * sorusunu ortadan kaldırır (§15).
 */

// ---------------------------------------------------------------- auth

export const auth = {
  /** Public — token henüz yok. */
  login: (api: ApiClient, email: string, password: string) =>
    api.post<LoginResult>('auth/login', { email, password }, { authenticated: false }),

  logout: (api: ApiClient) => api.post<void>('auth/logout'),

  me: (api: ApiClient) => api.get<User>('me'),

  forgotPassword: (api: ApiClient, email: string) =>
    api.post<{ message: string; code: string }>(
      'auth/password/forgot',
      { email },
      { authenticated: false },
    ),

  resetPassword: (
    api: ApiClient,
    input: { email: string; token: string; password: string; password_confirmation: string },
  ) => api.post<{ message: string; code: string }>('auth/password/reset', input, { authenticated: false }),

  sendVerificationEmail: (api: ApiClient) =>
    api.post<{ message: string; code: string }>('auth/email/verification-notification'),
};

// ----------------------------------------------------------- companies

export const companies = {
  list: (api: ApiClient) =>
    api.getPaginated<{ data: Company[]; meta: { active_company_id: number | null } }>('companies'),

  /**
   * Aktif şirketi DEĞİŞTİREN TEK YOL.
   *
   * İstemci hiçbir yerde active_company_id göndermez; tenant seçimi
   * bir yetki kararıdır ve backend'e aittir (§9, §21).
   */
  select: (api: ApiClient, companyId: number) =>
    api.post<Company>(`companies/${companyId}/select`),

  /**
   * Şirketin mali kimliği — OWNER-ONLY.
   *
   * PATCH'tir: gönderilmeyen alan değişmez, açık null temizler. Ayrı bir
   * uç olmasının sebebi, `PATCH /members/{user}/role` ile aynı — vergi
   * numarası fatura kesiminde bağlayıcıdır ve bir ad düzenlemesinin yan
   * etkisi olarak değişmemelidir.
   */
  updateBilling: (api: ApiClient, companyId: number, input: CompanyBillingInput) =>
    api.patch<CompanyBilling>(`companies/${companyId}/billing`, input),
};

// ----------------------------------------------------------- customers

export const customers = {
  list: (api: ApiClient, params?: { page?: number; per_page?: number }) =>
    api.getPaginated<Paginated<Customer>>('customers', { query: params }),

  get: (api: ApiClient, id: number) => api.get<Customer>(`customers/${id}`),

  create: (api: ApiClient, input: { name: string; phone?: string | null }) =>
    api.post<Customer>('customers', input),

  update: (api: ApiClient, id: number, input: { name: string; phone?: string | null }) =>
    api.put<Customer>(`customers/${id}`, input),

  remove: (api: ApiClient, id: number) => api.delete(`customers/${id}`),

  /**
   * Müşterinin fatura kimliği.
   *
   * AYRI BİR UÇ ve öyle kalmalı: `update` PUT'tur ve gönderilmeyen alanı
   * temizler. Fatura alanları o gövdeye eklenseydi, {name, phone}
   * gönderen her düzenleme vergi numarasını sessizce silerdi.
   */
  updateBilling: (api: ApiClient, id: number, input: CustomerBillingInput) =>
    api.patch<CustomerBilling>(`customers/${id}/billing`, input),
};

// ------------------------------------------------------------- members

export const members = {
  list: (api: ApiClient, params?: { page?: number; per_page?: number }) =>
    api.getPaginated<Paginated<Member>>('members', { query: params }),

  get: (api: ApiClient, userId: number) => api.get<Member>(`members/${userId}`),

  create: (
    api: ApiClient,
    input: { name: string; email: string; password: string; role: Role },
  ) => api.post<Member>('members', input),

  update: (api: ApiClient, userId: number, input: { name: string; email: string }) =>
    api.put<Member>(`members/${userId}`, input),

  /** Rol değişimi ayrı uç, ayrı yetki. */
  changeRole: (api: ApiClient, userId: number, role: Role) =>
    api.patch<Member>(`members/${userId}/role`, { role }),

  remove: (api: ApiClient, userId: number) => api.delete(`members/${userId}`),
};

// --------------------------------------------------------- invitations

export const invitations = {
  list: (api: ApiClient, params?: { page?: number; per_page?: number }) =>
    api.getPaginated<Paginated<Invitation>>('invitations', { query: params }),

  create: (api: ApiClient, input: { email: string; role: Role }) =>
    api.post<Invitation>('invitations', input),

  revoke: (api: ApiClient, invitationId: number) => api.delete(`invitations/${invitationId}`),

  /**
   * Public uç. Hesabı olmayan davetli name+password gönderir; hesabı
   * olan ise giriş yapmış olmalıdır (o durumda token başlığı eklenir).
   */
  accept: (
    api: ApiClient,
    input: { token: string; name?: string; password?: string },
    authenticated = false,
  ) => api.post<Invitation>('invitations/accept', input, { authenticated }),
};

// ---------------------------------------------------------- audit logs

export const auditLogs = {
  list: (api: ApiClient, params?: { page?: number; per_page?: number }) =>
    api.getPaginated<Paginated<AuditLog>>('audit-logs', { query: params }),
};

// ------------------------------------------------------- finans kayıtları

/**
 * Gelir ve gider kayıtları — OWNER-ONLY (AŞAMA 7 / Adım 3).
 *
 * DELETE UCU YOKTUR: finans kaydı silinmez, iptal edilir. Silinmiş bir
 * gelir kaydı geçmiş bir dönemin toplamını sessizce değiştirirdi.
 *
 * İSTEMCİ HESAP YAPMAZ: gövde `amount_minor` + `amount_basis` taşır,
 * net/KDV/brüt üçlüsünü backend üretir. Frontend'de VatCalculator
 * karşılığı YOKTUR ve olmayacak.
 */
export const financeEntries = {
  list: (api: ApiClient, params?: { page?: number; per_page?: number }) =>
    api.getPaginated<Paginated<FinanceEntry>>('finance-entries', { query: params }),

  get: (api: ApiClient, id: number) => api.get<FinanceEntry>(`finance-entries/${id}`),

  create: (api: ApiClient, input: FinanceEntryInput) =>
    api.post<FinanceEntry>('finance-entries', input),

  /** PUT: tam değiştirme; parasal üçlü yeniden hesaplanır. */
  update: (api: ApiClient, id: number, input: FinanceEntryInput) =>
    api.put<FinanceEntry>(`finance-entries/${id}`, input),

  /** 204 değil 200 döner: silme değil, durum değişikliği. */
  void: (api: ApiClient, id: number, input: VoidInput = {}) =>
    api.post<FinanceEntry>(`finance-entries/${id}/void`, input),
};

// -------------------------------------------------------------- ödemeler

/**
 * Tahsilat ve ödemeler — OWNER-ONLY (AŞAMA 7 / Adım 4).
 *
 * Ödeme hedefine DOĞRUDAN bağlanmaz; bağlantı `allocations` üzerinden
 * kurulur. Böylece hedefsiz avans, bir ödemenin iki hedefe bölünmesi ve
 * bir hedefin iki ödemeyle kapatılması mümkün olur.
 *
 * Dağıtımların AYRI BİR UCU YOKTUR: ödemenin gövdesiyle birlikte
 * yazılırlar ve PUT'ta liste eskisinin TAMAMEN yerine geçer.
 */
export const payments = {
  list: (api: ApiClient, params?: { page?: number; per_page?: number }) =>
    api.getPaginated<Paginated<Payment>>('payments', { query: params }),

  get: (api: ApiClient, id: number) => api.get<Payment>(`payments/${id}`),

  create: (api: ApiClient, input: PaymentInput) => api.post<Payment>('payments', input),

  update: (api: ApiClient, id: number, input: PaymentInput) =>
    api.put<Payment>(`payments/${id}`, input),

  /** İptal dağıtımları SİLMEZ; yerinde kalırlar. */
  void: (api: ApiClient, id: number, input: VoidInput = {}) =>
    api.post<Payment>(`payments/${id}/void`, input),
};

// -------------------------------------------------------------- görevler

/**
 * Günün işleri (Task/Planning v1) — ŞİRKET GENELİ.
 *
 * Finans ve ödeme uçları owner-only'dir; görevler değil. Üye de görür,
 * oluşturur ve tamamlar (playbook §3.1: karar backend'de, istemcide rol
 * kapısı yok).
 *
 * DELETE UCU VARDIR — finanstan farklı olarak. Finans kaydı iptal edilir
 * çünkü silinmesi geçmiş bir dönemin toplamını sessizce değiştirir;
 * yapılacak bir işin böyle bir özelliği yok.
 */
export const tasks = {
  list: (api: ApiClient, params?: { page?: number; per_page?: number; date?: string }) =>
    api.getPaginated<Paginated<Task>>('tasks', { query: params }),

  /**
   * BUGÜN — ŞİRKETİN SAAT DİLİMİNE GÖRE, SUNUCUDA BELİRLENİR.
   *
   * İstemci `?date=` ile kendi "bugün"ünü göndermez. Gönderseydi, saat
   * dilimi şirketinkinden farklı bir kullanıcı yanlış günün işlerini
   * görürdü — "bu işletme için bugün hangi gün" sorusunun cevabı
   * backend'e aittir (playbook §3.1).
   */
  today: (api: ApiClient, params?: { page?: number; per_page?: number }) =>
    api.getPaginated<Paginated<Task>>('tasks/today', { query: params }),

  get: (api: ApiClient, id: number) => api.get<Task>(`tasks/${id}`),

  create: (api: ApiClient, input: TaskInput) => api.post<Task>('tasks', input),

  /** PUT: tam değiştirme; gövdede olmayan alan boşaltılır. */
  update: (api: ApiClient, id: number, input: TaskInput) => api.put<Task>(`tasks/${id}`, input),

  remove: (api: ApiClient, id: number) => api.delete(`tasks/${id}`),

  /**
   * Gövde ALMAZ: tamamlanma zamanını sunucu yazar. İstemci bir işin ne
   * zaman bitirildiğini seçemez.
   *
   * İDEMPOTENT DEĞİL: zaten tamamlanmış bir görev 422 +
   * `task_already_completed` döner — ikinci bir çağrı ilk tamamlanma
   * anını üzerine yazardı.
   */
  complete: (api: ApiClient, id: number) => api.post<Task>(`tasks/${id}/complete`),

  reopen: (api: ApiClient, id: number) => api.post<Task>(`tasks/${id}/reopen`),
};

// ------------------------------------------------------------- profile

export const profile = {
  get: (api: ApiClient) => api.get<User>('profile'),

  update: (api: ApiClient, input: { name: string; email: string }) =>
    api.put<User>('profile', input),

  changePassword: (
    api: ApiClient,
    input: { current_password: string; new_password: string; new_password_confirmation: string },
  ) => api.put<{ message: string; other_logins_revoked: number }>('profile/password', input),

  sessions: (api: ApiClient) => api.get<Session[]>('profile/sessions'),

  revokeSession: (api: ApiClient, sessionId: number) =>
    api.delete(`profile/sessions/${sessionId}`),

  revokeOtherSessions: (api: ApiClient) => api.delete('profile/sessions/others'),

  securityEvents: (api: ApiClient, params?: { page?: number; per_page?: number }) =>
    api.getPaginated<Paginated<SecurityEvent>>('profile/security-events', { query: params }),
};
