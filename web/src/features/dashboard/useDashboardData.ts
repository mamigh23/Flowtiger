import { useEffect, useState } from 'react';
import { api, ApiError, endpoints } from '@/lib/api';
import type { AuditLog } from '@/types/api';

/**
 * Panel verisi.
 *
 * SAHTE VERİ YOK (playbook §11): her değer gerçek bir uçtan gelir.
 *   müşteri sayısı → GET /customers?per_page=1  → meta.total
 *   ekip sayısı    → GET /members?per_page=1    → meta.total
 *   son hareketler → GET /audit-logs?per_page=5 → data[]
 *
 * per_page=1: yalnızca toplam sayı gerekiyor; tüm listeyi çekmek
 * gereksiz bant genişliği ve gereksiz veritabanı yükü olurdu.
 *
 * KART BAZINDA DURUM: /members ve /audit-logs yalnızca owner'a açıktır.
 * Member rolündeki kullanıcı 403 alır — bu bir ARIZA DEĞİL, beklenen
 * bir sonuçtur. Bu yüzden her kart kendi durumunu taşır ve biri
 * yetkisiz olduğunda diğerleri çalışmaya devam eder.
 */
export type PanelStatus = 'loading' | 'ready' | 'forbidden' | 'error';

export interface Panel<T> {
  status: PanelStatus;
  data: T | null;
}

export interface DashboardData {
  customerCount: Panel<number>;
  memberCount: Panel<number>;
  recentActivity: Panel<AuditLog[]>;
}

const initial = <T,>(): Panel<T> => ({ status: 'loading', data: null });

/** 403'ü hatadan ayırır: yetki eksikliği beklenen bir sonuçtur. */
function toPanel<T>(value: T): Panel<T> {
  return { status: 'ready', data: value };
}

function toFailedPanel<T>(error: unknown): Panel<T> {
  if (error instanceof ApiError && error.isForbidden) {
    return { status: 'forbidden', data: null };
  }

  // 401 ise ApiClient token'ı zaten düşürdü; oturum kapanacağı için
  // burada ayrıca bir şey yapılmaz.
  return { status: 'error', data: null };
}

export function useDashboardData(activeCompanyId: number | null): DashboardData {
  const [customerCount, setCustomerCount] = useState<Panel<number>>(initial);
  const [memberCount, setMemberCount] = useState<Panel<number>>(initial);
  const [recentActivity, setRecentActivity] = useState<Panel<AuditLog[]>>(initial);

  useEffect(() => {
    if (activeCompanyId === null) return;

    let cancelled = false;

    // Kartlar birbirini beklemez: biri yavaşsa ya da yetkisizse
    // diğerleri anında görünür.
    void endpoints.customers
      .list(api, { per_page: 1 })
      .then((page) => !cancelled && setCustomerCount(toPanel(page.meta.total)))
      .catch((error: unknown) => !cancelled && setCustomerCount(toFailedPanel(error)));

    void endpoints.members
      .list(api, { per_page: 1 })
      .then((page) => !cancelled && setMemberCount(toPanel(page.meta.total)))
      .catch((error: unknown) => !cancelled && setMemberCount(toFailedPanel(error)));

    void endpoints.auditLogs
      .list(api, { per_page: 5 })
      .then((page) => !cancelled && setRecentActivity(toPanel(page.data)))
      .catch((error: unknown) => !cancelled && setRecentActivity(toFailedPanel(error)));

    return () => {
      cancelled = true;
    };
  }, [activeCompanyId]);

  return { customerCount, memberCount, recentActivity };
}
