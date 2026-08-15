/**
 * Backend sözleşmesinin TypeScript karşılığı.
 *
 * Alan adları backend Resource sınıflarıyla birebir aynıdır; buradaki
 * bir isim değişikliği sessiz bir kırılma demektir. Backend'de karşılığı
 * OLMAYAN alan buraya eklenmez.
 */

/** Başarılı yanıt zarfı: { "data": ... } */
export interface ApiEnvelope<T> {
  data: T;
}

/** Sayfalanmış yanıtlar links + meta da taşır. */
export interface Paginated<T> {
  data: T[];
  links: {
    first: string | null;
    last: string | null;
    prev: string | null;
    next: string | null;
  };
  meta: {
    current_page: number;
    from: number | null;
    last_page: number;
    path: string;
    per_page: number;
    to: number | null;
    total: number;
  };
}

export type Role = 'owner' | 'member';

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface User {
  id: number;
  name: string;
  email: string;
  email_verified_at: string | null;
  active_company_id: number | null;
  created_at: string | null;
}

export interface Company {
  id: number;
  name: string;
  /** Yalnızca üyelik listesinde döner (pivot yüklüyse). */
  role?: Role;
  created_at: string | null;
}

export interface Customer {
  id: number;
  customer_no: number;
  name: string;
  phone: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Member {
  id: number;
  name: string;
  email: string;
  role: Role;
  created_at: string | null;
  updated_at: string | null;
}

export interface Invitation {
  id: number;
  /** Maskeli gelir: "a***@example.com" */
  email: string;
  role: Role;
  status: InvitationStatus;
  expires_at: string | null;
  created_at: string | null;
}

export interface AuditLog {
  id: number;
  action: string;
  actor?: { id: number; name: string } | null;
  auditable?: { type: string; id: number } | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string | null;
}

export interface Session {
  id: number;
  name: string;
  /** İsteği yapan oturum mu? */
  current: boolean;
  abilities: string[] | null;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string | null;
}

export interface SecurityEvent {
  id: number;
  action: string;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
}

/** POST /auth/login yanıtı */
export interface LoginResult {
  token: string;
  user: User;
}
