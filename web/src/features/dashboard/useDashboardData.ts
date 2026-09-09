import { useEffect, useState } from 'react';
import { api, ApiError, endpoints } from '@/lib/api';
import type { AuditLog, Task } from '@/types/api';

/**
 * Panel verisi.
 *
 * SAHTE VERİ YOK (playbook §11): her değer gerçek bir uçtan gelir.
 *   bugünün işleri  → GET /tasks/today            → data[] + meta.total
 *   son hareketler  → GET /audit-logs?per_page=5  → data[]
 *   özet sayılar    → GET <liste>?per_page=1      → meta.total
 *
 * ÖZET SAYILAR GERİ GELDİ (UI-01 GERİ ALINDI — ürün sahibi kararı).
 * UI-01 "128 müşteri bugüne dair bir şey söylemiyor" diyerek sayımları
 * kaldırmıştı. Yeni karar, ana ekranın işletmenin BÜYÜKLÜĞÜNÜ de bir
 * bakışta göstermesi yönünde. Sayımlar geri geldi; ama karar yalnızca
 * sayımları kapsıyor:
 *
 *   YALNIZCA `meta.total` OKUNUR. Bu, backend'in TÜM kayıtlar için
 *   döndürdüğü gerçek toplamdır — sayfadaki satırlar sayılmaz.
 *
 *   PARA TOPLAMI ÜRETİLMEZ. "Bu ay ₺84.250 gelir" için bir uç YOK
 *   (routes/api.php'de summary/stats/totals/metrics ucu bulunmuyor) ve
 *   sayfalanmış listenin ilk sayfasını toplamak eksik bir tutarı gerçek
 *   gibi gösterirdi. Finans ve Ödemeler kartları KAYIT SAYISI taşır,
 *   tutar değil — ve etiketleri bunu açıkça söyler.
 *
 *   YÜZDE / DÖNEM FARKI ÜRETİLMEZ. "%20 bu ay" bir önceki dönemin
 *   toplamını gerektirir; onu veren bir uç da yok.
 *
 * KART BAZINDA DURUM: /finance-entries, /payments, /members ve
 * /audit-logs yalnızca owner'a açıktır. Member rolündeki kullanıcı 403
 * alır — bu bir ARIZA DEĞİL, beklenen bir sonuçtur. 403 alan sayım
 * kartı GÖSTERİLMEZ: "yetkiniz yok" yazan beş kutu, üyeye kendi
 * ekranında göremeyeceği şeylerin listesini çıkarmak olurdu.
 */
export type PanelStatus = 'loading' | 'ready' | 'forbidden' | 'error';

export interface Panel<T> {
  status: PanelStatus;
  data: T | null;
}

/** Bir listenin `meta.total` değeri — sayfadaki satır sayısı DEĞİL. */
export type CountPanel = Panel<number>;

export interface DashboardCounts {
  /** GET /tasks/today → meta.total (ek istek YAPILMAZ, aynı yanıttan). */
  todayTasks: CountPanel;
  customers: CountPanel;
  financeEntries: CountPanel;
  payments: CountPanel;
  members: CountPanel;
}

export interface DashboardData {
  todayTasks: Panel<Task[]>;
  recentActivity: Panel<AuditLog[]>;
  counts: DashboardCounts;
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

/**
 * `meta.total` GÜVENLİ OKUNUR.
 *
 * Beklenmedik bir gövde (uç bir gün zarfı değiştirirse) `undefined`
 * verirse kart sayı yerine hata durumuna düşer — ekranda `NaN` ya da 0
 * göstermek, olmayan bir bilgiyi varmış gibi sunmak olurdu.
 */
function totalOf(page: { meta?: { total?: number } }): number {
  const total = page.meta?.total;

  if (typeof total !== 'number' || !Number.isFinite(total)) {
    throw new Error('meta.total okunamadı');
  }

  return total;
}

export function useDashboardData(activeCompanyId: number | null): DashboardData {
  const [todayTasks, setTodayTasks] = useState<Panel<Task[]>>(initial);
  const [recentActivity, setRecentActivity] = useState<Panel<AuditLog[]>>(initial);

  const [todayTasksCount, setTodayTasksCount] = useState<CountPanel>(initial);
  const [customers, setCustomers] = useState<CountPanel>(initial);
  const [financeEntries, setFinanceEntries] = useState<CountPanel>(initial);
  const [payments, setPayments] = useState<CountPanel>(initial);
  const [members, setMembers] = useState<CountPanel>(initial);

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
     *
     * "Görevler" kartının sayısı da BU yanıttan okunur — ikinci bir
     * istek yapılmaz. Görünen liste ile karttaki sayı aynı yanıttan
     * geldiği için birbirleriyle asla çelişemezler.
     */
    void endpoints.tasks
      .today(api)
      .then((page) => {
        if (cancelled) return;
        setTodayTasks(toPanel(page.data));
        setTodayTasksCount(toPanel(totalOf(page)));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setTodayTasks(toFailedPanel(error));
        setTodayTasksCount(toFailedPanel(error));
      });

    void endpoints.auditLogs
      .list(api, { per_page: 5 })
      .then((page) => !cancelled && setRecentActivity(toPanel(page.data)))
      .catch((error: unknown) => !cancelled && setRecentActivity(toFailedPanel(error)));

    /*
     * SAYIMLAR `per_page=1` İLE İSTENİR.
     *
     * Ekranda tek bir sayı görünüyor; 15 kaydın gövdesini indirmek o
     * sayıyı almak için gereksiz. `meta.total` sayfa boyutundan
     * bağımsızdır ve her zaman TÜM kayıtları sayar.
     */
    const count = (
      request: Promise<{ meta?: { total?: number } }>,
      set: (panel: CountPanel) => void,
    ) => {
      void request
        .then((page) => !cancelled && set(toPanel(totalOf(page))))
        .catch((error: unknown) => !cancelled && set(toFailedPanel(error)));
    };

    count(endpoints.customers.list(api, { per_page: 1 }), setCustomers);
    count(endpoints.financeEntries.list(api, { per_page: 1 }), setFinanceEntries);
    count(endpoints.payments.list(api, { per_page: 1 }), setPayments);
    count(endpoints.members.list(api, { per_page: 1 }), setMembers);

    return () => {
      cancelled = true;
    };
  }, [activeCompanyId]);

  return {
    todayTasks,
    recentActivity,
    counts: {
      todayTasks: todayTasksCount,
      customers,
      financeEntries,
      payments,
      members,
    },
  };
}
