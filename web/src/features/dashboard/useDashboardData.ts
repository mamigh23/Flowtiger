import { useEffect, useState } from 'react';
import { api, ApiError, endpoints } from '@/lib/api';
import type { AuditLog, Task } from '@/types/api';

/**
 * Panel verisi.
 *
 * SAHTE VERİ YOK (playbook §11): her değer gerçek bir uçtan gelir.
 *   son hareketler → GET /audit-logs?per_page=5 → data[]
 *
 * MÜŞTERİ VE EKİP SAYIMLARI KALDIRILDI (UI-01). "128 müşteri" bilgisi
 * doğruydu ama ana ekranın sorusuna — "bugün ne yapmam gerekiyor?" —
 * cevap vermiyordu; bir yönetim panelinin sorusuna cevap veriyordu.
 * Sayılar kendi ekranlarında zaten var.
 *
 * GÖREV/PLAN UCU YOK. Bu yüzden bu hook bir görev listesi DÖNDÜRMEZ ve
 * uydurmaz. Backend bir task ucu açtığında buraya eklenir; o güne kadar
 * ana ekran boş durum gösterir.
 *
 * KART BAZINDA DURUM: /audit-logs yalnızca owner'a açıktır. Member
 * rolündeki kullanıcı 403 alır — bu bir ARIZA DEĞİL, beklenen bir
 * sonuçtur.
 */
export type PanelStatus = 'loading' | 'ready' | 'forbidden' | 'error';

export interface Panel<T> {
  status: PanelStatus;
  data: T | null;
}

export interface DashboardData {
  todayTasks: Panel<Task[]>;
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
  const [todayTasks, setTodayTasks] = useState<Panel<Task[]>>(initial);
  const [recentActivity, setRecentActivity] = useState<Panel<AuditLog[]>>(initial);

  useEffect(() => {
    if (activeCompanyId === null) return;

    let cancelled = false;

    /*
     * BUGÜNÜN İŞLERİ — `/tasks/today`, `?date=` DEĞİL.
     *
     * İstemci kendi "bugün"ünü hesaplayıp göndermez: saat dilimi
     * şirketinkinden farklı bir kullanıcı yanlış günün işlerini görürdü.
     * Gün sınırı şirketin saat diliminde, sunucuda belirlenir.
     *
     * per_page GÖNDERİLMEZ: backend'in varsayılanı (15) yeterli. Ana
     * ekran bir görev yönetim ekranı değil; günün ilk sayfası gösterilir.
     */
    void endpoints.tasks
      .today(api)
      .then((page) => !cancelled && setTodayTasks(toPanel(page.data)))
      .catch((error: unknown) => !cancelled && setTodayTasks(toFailedPanel(error)));

    void endpoints.auditLogs
      .list(api, { per_page: 5 })
      .then((page) => !cancelled && setRecentActivity(toPanel(page.data)))
      .catch((error: unknown) => !cancelled && setRecentActivity(toFailedPanel(error)));

    return () => {
      cancelled = true;
    };
  }, [activeCompanyId]);

  return { todayTasks, recentActivity };
}
