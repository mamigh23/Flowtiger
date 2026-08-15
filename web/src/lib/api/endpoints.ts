import type { ApiClient } from './client';
import type {
  AuditLog,
  Company,
  Customer,
  Invitation,
  LoginResult,
  Member,
  Paginated,
  Role,
  SecurityEvent,
  Session,
  User,
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
