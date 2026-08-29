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

// ===================================================================
// MALİ KİMLİK (AŞAMA 7 / Adım 2)
// ===================================================================

/**
 * PATCH /companies/{company}/billing yanıtı.
 *
 * CompanyResource'tan AYRI bir kaynak: mali kimlik alanları liste ucuna
 * eklenmedi. `timezone` ve `default_currency` backend'de NOT NULL'dur,
 * bu yüzden burada da nullable değiller.
 */
export interface CompanyBilling {
  id: number;
  name: string;
  legal_name: string | null;
  tax_number: string | null;
  tax_office: string | null;
  billing_address: string | null;
  country: string | null;
  timezone: string;
  default_currency: string;
}

/**
 * PATCH /customers/{customer}/billing yanıtı.
 *
 * CustomerResource'tan AYRI: fatura alanları liste/detay yanıtına
 * eklenmedi, böylece mevcut müşteri sözleşmesi bozulmadı.
 */
export interface CustomerBilling {
  id: number;
  customer_no: number;
  name: string;
  billing_email: string | null;
  tax_number: string | null;
  tax_office: string | null;
  billing_address: string | null;
  country: string | null;
}

// ===================================================================
// FİNANS (AŞAMA 7 / Adım 3–4)
// ===================================================================

/** Para giriyor mu, çıkıyor mu? */
export type FinanceDirection = 'in' | 'out';

/** Kullanıcı tutarı net olarak mı brüt olarak mı girdi? */
export type AmountBasis = 'net' | 'gross';

/**
 * Müşteri ÖZETİ — tam kayıt değil.
 *
 * Finans uçları müşteri verisini dolaylı yoldan dışarı veren bir yüzey
 * hâline gelmemeli; backend bilinçli olarak yalnızca bu üç alanı
 * döndürüyor.
 */
export interface CustomerSummary {
  id: number;
  customer_no: number;
  name: string;
}

/**
 * Hesabın NASIL yapıldığı — açıklanabilirlik bloğu.
 *
 * SAKLANMAZ, her okumada hesaplanır. Frontend bu bloğu yalnızca
 * GÖSTERİR; hesabı yeniden yapmaz.
 */
export interface FinanceCalculation {
  basis: AmountBasis;
  rounding: 'half_up';
  /**
   * Sıfır oran true'dur (KDV var, oranı sıfır).
   * null oran false'tur (kayıt KDV bilgisi taşımıyor).
   */
  vat_applicable: boolean;
}

/** GET/POST/PUT /finance-entries yanıtı */
export interface FinanceEntry {
  id: number;
  direction: FinanceDirection;
  /** Takvim günü (Y-m-d); saat taşımaz. */
  financial_date: string | null;
  category: string | null;
  note: string | null;
  net_minor: number;
  /** null → KDV uygulanmıyor. 0 → KDV var, oranı sıfır. */
  vat_rate_bp: number | null;
  vat_minor: number;
  gross_minor: number;
  currency: string;
  customer: CustomerSummary | null;
  calculation: FinanceCalculation;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Dağıtım hedefinin özeti. */
export interface FinanceEntrySummary {
  id: number;
  direction: FinanceDirection;
  financial_date: string | null;
  gross_minor: number;
}

/**
 * Bir ödemenin hangi kayda ne kadar sayıldığı.
 *
 * DİKKAT: backend `finance_entry_id`'yi AYRI bir alan olarak DÖNDÜRMEZ;
 * hedef `finance_entry` özeti içinde gelir. İstek gövdesinde ise
 * `finance_entry_id` gönderilir (bkz. PaymentAllocationInput).
 */
export interface PaymentAllocation {
  id: number;
  amount_minor: number;
  finance_entry: FinanceEntrySummary | null;
}

/** GET/POST/PUT /payments yanıtı */
export interface Payment {
  id: number;
  financial_date: string | null;
  amount_minor: number;
  currency: string;
  method: string | null;
  note: string | null;
  customer: CustomerSummary | null;
  allocations: PaymentAllocation[];
  /** Türetilir, saklanmaz: dağıtımların toplamı. */
  allocated_minor: number;
  /** Türetilir: amount_minor − allocated_minor. */
  remaining_minor: number;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// ===================================================================
// İSTEK GÖVDELERİ
// ===================================================================
//
// Yanıt tipleriyle aynı dosyada duruyorlar çünkü ikisi de AYNI
// sözleşmenin parçası. Bir uçta gövde ile yanıtın şekli farklıdır ve bu
// fark bilinçlidir — örneğin finans kaydında istemci `amount_minor` +
// `amount_basis` gönderir, sunucu net/vat/gross üçlüsünü döndürür.

/**
 * POST ve PUT /finance-entries gövdesi.
 *
 * `net_minor`, `vat_minor`, `gross_minor` GÖNDERİLMEZ — backend onları
 * `prohibited` ile reddeder. Hesabı sunucu yapar.
 *
 * PUT tam değiştirmedir: gövde kaydın tam hâlini taşır.
 */
export interface FinanceEntryInput {
  direction: FinanceDirection;
  financial_date: string;
  amount_basis: AmountBasis;
  amount_minor: number;
  vat_rate_bp: number | null;
  currency: string;
  customer_id?: number | null;
  category?: string | null;
  note?: string | null;
}

/** Ödeme gövdesindeki tek dağıtım satırı. */
export interface PaymentAllocationInput {
  finance_entry_id: number;
  amount_minor: number;
}

/**
 * POST ve PUT /payments gövdesi.
 *
 * PUT'ta `allocations` listesi eskisinin TAMAMEN yerine geçer.
 * `allocated_minor` ve `remaining_minor` gönderilmez; backend reddeder.
 */
export interface PaymentInput {
  financial_date: string;
  amount_minor: number;
  currency: string;
  method?: string | null;
  note?: string | null;
  customer_id?: number | null;
  allocations?: PaymentAllocationInput[];
}

/** İptal gövdesi — sebep opsiyoneldir. */
export interface VoidInput {
  reason?: string | null;
}

/**
 * PATCH /companies/{company}/billing gövdesi.
 *
 * PATCH'tir: gönderilmeyen alan DEĞİŞMEZ, açık null TEMİZLER.
 * `timezone` ve `default_currency` NOT NULL olduğu için null kabul
 * etmezler.
 */
export interface CompanyBillingInput {
  legal_name?: string | null;
  tax_number?: string | null;
  tax_office?: string | null;
  billing_address?: string | null;
  country?: string | null;
  timezone?: string;
  default_currency?: string;
}

/** PATCH /customers/{customer}/billing gövdesi — aynı PATCH semantiği. */
export interface CustomerBillingInput {
  billing_email?: string | null;
  tax_number?: string | null;
  tax_office?: string | null;
  billing_address?: string | null;
  country?: string | null;
}

// ===================================================================
// GÖREVLER (Task/Planning v1)
// ===================================================================

/**
 * Kişi ÖZETİ — tam kullanıcı kaydı değil.
 *
 * Backend bilinçli olarak yalnızca id ve ad döndürüyor: görev listesi,
 * kullanıcı verisini dolaylı yoldan dışarı veren bir uç hâline gelmemeli.
 * E-posta, rol ve aktif şirket yanıtta YOKTUR.
 */
export interface UserSummary {
  id: number;
  name: string;
}

/**
 * GET/POST/PUT /tasks yanıtı.
 *
 * DİKKAT — `company_id` YANITTA YOKTUR. TaskResource beyaz listesinde
 * bulunmuyor; tenant kimliği istemciye hiç açılmıyor.
 *
 * DİKKAT — `assigned_to` İSTEK VE YANITTA FARKLI TİPTEDİR:
 *   istek : number | null         (kullanıcı kimliği)
 *   yanıt : { id, name } | null   (özet)
 * Aynı ad, iki şekil. Backend'de gerçekten böyle; uydurulmadı.
 */
export interface Task {
  id: number;
  title: string;
  note: string | null;
  /** Takvim günü (Y-m-d); saat taşımaz. */
  scheduled_date: string | null;
  /**
   * Gün içindeki saat, "09:00". Saatsiz görev meşrudur — null geldiğinde
   * arayüz SAAT UYDURMAZ.
   */
  scheduled_time: string | null;
  completed_at: string | null;
  /**
   * Backend'de `completed_at`ten TÜRETİLİR. Arayüz bunu yeniden
   * hesaplamaz: iki kaynak, bir gün iki farklı cevap demektir.
   */
  is_completed: boolean;
  customer: CustomerSummary | null;
  created_by: UserSummary | null;
  assigned_to: UserSummary | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * POST ve PUT /tasks gövdesi.
 *
 * `company_id`, `created_by`, `completed_at` ve `is_completed`
 * GÖNDERİLMEZ — backend onları `prohibited` ile reddeder.
 *
 * `scheduled_time` OPSİYONEL DEĞİL, NULLABLE: backend `present` istiyor.
 * Alanın düşmesi ile null gönderilmesi aynı şey değil — PUT tam
 * değiştirme olduğu için "saati kaldır" ancak açık null ile anlatılır.
 */
export interface TaskInput {
  title: string;
  note?: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  customer_id?: number | null;
  assigned_to?: number | null;
}
