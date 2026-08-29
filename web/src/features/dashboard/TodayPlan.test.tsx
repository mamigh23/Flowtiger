import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { fixtures, renderElement } from '@/test/harness';
import type { Task } from '@/types/api';
import { TodayPlan } from './TodayPlan';
import type { Panel } from './useDashboardData';

/**
 * Bugünün Planı — ana ekranın odak alanı.
 *
 * Bileşen SAF: router, API ve context olmadan sınanır. Veri prop olarak
 * gelir, böylece "boş durum", "yetki yok" ve "dolu liste" halleri tek tek
 * kanıtlanabilir.
 *
 * ÜÇ KURAL BU DOSYADA KİLİTLİ:
 *
 *   1. SAAT UYDURULMAZ. `scheduled_time` null gelen bir görev saatsiz
 *      görünür. Arayüz 00:00 ya da "sabah" gibi bir şey yazmaz — saatsiz
 *      iş meşrudur ve uydurulan bir saat listede gerçek bir randevu gibi
 *      görünürdü.
 *
 *   2. `is_completed` API'DEN OKUNUR, TÜRETİLMEZ. Backend onu
 *      `completed_at`ten hesaplıyor; arayüzün ikinci bir hesap yapması
 *      iki kaynak demek olurdu ve bir gün ikisi farklı cevap verirdi.
 *
 *   3. SIRA API'DEN GELDİĞİ GİBİ KORUNUR. Backend `scheduled_time ASC
 *      NULLS LAST, id ASC` sıralıyor; arayüzün yeniden sıralaması, saatsiz
 *      işleri günün başına taşır ve randevuların önüne geçirirdi.
 */
describe('TodayPlan', () => {
  const today = '22 Ağustos 2026, Cumartesi';

  function ready(tasks: Task[]): Panel<Task[]> {
    return { status: 'ready', data: tasks };
  }

  /**
   * Router SARMALAYICISIYLA render edilir.
   *
   * Görev başlıkları ayrıntıya götüren birer bağlantı; `<Link>` router
   * bağlamı olmadan çalışmaz. `renderElement` uygulamanın kendi
   * MemoryRouter'ını kurar ve ROUTER_FUTURE bayraklarını da taşır —
   * testin üretimden farklı bir router semantiği sınamaması için.
   */
  function renderPlan(panel: Panel<Task[]>) {
    return renderElement(<TodayPlan today={today} panel={panel} />);
  }

  // -------------------------------------------------------------- başlık

  it('başlığı ve bugünün tarihini gösterir', () => {
    renderPlan(ready([]));

    expect(screen.getByRole('heading', { name: 'Bugünün Planı' })).toBeInTheDocument();
    expect(screen.getByText(today)).toBeInTheDocument();
  });

  // ---------------------------------------------------------- boş durum

  /**
   * Boş durum bir HATA değil. Kırmızı yok, ünlem yok: "burası henüz
   * dolmadı" diyor, "bir şey ters gitti" değil.
   */
  it('hiç görev yokken boş durumu korur', () => {
    renderPlan(ready([]));

    expect(screen.getByTestId('plan-empty')).toHaveTextContent(
      'Bugün için planlanmış bir iş yok.',
    );
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('boş durumda saat ya da uydurma görev göstermez', () => {
    renderPlan(ready([]));

    expect(screen.queryByText(/\d{2}:\d{2}/)).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------- liste

  it('gelen görevleri listeler', () => {
    renderPlan(
      ready([
        fixtures.task({ id: 1, title: 'Teklif hazırla' }) as Task,
        fixtures.task({ id: 2, title: 'Ödeme kontrolü' }) as Task,
      ]),
    );

    expect(screen.getByText('Teklif hazırla')).toBeInTheDocument();
    expect(screen.getByText('Ödeme kontrolü')).toBeInTheDocument();
    expect(screen.queryByTestId('plan-empty')).not.toBeInTheDocument();
  });

  /**
   * REGRESYON — DASHBOARD OKUMA YÜZEYİDİR.
   *
   * Görev başlığı ayrıntıya götüren SADE bir bağlantı. Ana ekranda
   * tamamla/düzenle/sil kontrolü YOKTUR: dashboard "bugün ne yapmam
   * gerekiyor" sorusunun cevabı, bir görev yönetim aracı değil.
   */
  it('görev başlığından ayrıntıya bağlantı verir', () => {
    renderPlan(ready([fixtures.task({ id: 42, title: 'Teklif hazırla' }) as Task]));

    expect(screen.getByRole('link', { name: 'Teklif hazırla' })).toHaveAttribute(
      'href',
      '/app/tasks/42',
    );
  });

  it('görev satırında yönetim kontrolü sunmaz', () => {
    renderPlan(ready([fixtures.task({ id: 42 }) as Task]));

    expect(screen.queryByRole('button', { name: 'Tamamla' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sil' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Düzenle' })).not.toBeInTheDocument();
  });

  /**
   * REGRESYON — SAAT BACKEND'DEN GELİR.
   *
   * Ekranda görünen saat, API'nin gönderdiği `scheduled_time`'dır.
   * Arayüz onu ne biçimlendirir ne de üretir.
   */
  it('API saat gönderdiğinde o saati gösterir', () => {
    renderPlan(ready([fixtures.task({ id: 1, scheduled_time: '11:30' }) as Task]));

    expect(screen.getByText('11:30')).toBeInTheDocument();
  });

  /**
   * REGRESYON — SAATSİZ GÖREVE SAAT UYDURULMAZ.
   *
   * Uydurulan bir saat listede gerçek bir randevu gibi görünürdü.
   */
  it('API saat göndermediğinde saat göstermez', () => {
    renderPlan(ready([fixtures.task({ id: 1, scheduled_time: null }) as Task]));

    expect(screen.queryByText(/\d{2}:\d{2}/)).not.toBeInTheDocument();
  });

  /** Saatli ve saatsiz görevler aynı listede karışmaz. */
  it('saatli ve saatsiz görevleri birlikte doğru gösterir', () => {
    renderPlan(
      ready([
        fixtures.task({ id: 1, title: 'Randevu', scheduled_time: '09:00' }) as Task,
        fixtures.task({ id: 2, title: 'Bir ara yapılacak', scheduled_time: null }) as Task,
      ]),
    );

    const timed = screen.getByTestId('task-1');
    const untimed = screen.getByTestId('task-2');

    expect(within(timed).getByText('09:00')).toBeInTheDocument();
    expect(within(untimed).queryByText(/\d{2}:\d{2}/)).not.toBeInTheDocument();
  });

  /**
   * REGRESYON — SIRA API'DEN GELDİĞİ GİBİ.
   *
   * Backend saatsiz işleri günün SONUNA koyuyor. Arayüz yeniden
   * sıralasaydı "bir ara yapılacak" bir iş, 09:00 randevusunun önüne
   * geçerdi.
   */
  it('görev sırasını değiştirmez', () => {
    renderPlan(
      ready([
        fixtures.task({ id: 1, title: 'Önce', scheduled_time: '09:00' }) as Task,
        fixtures.task({ id: 2, title: 'Sonra', scheduled_time: '16:30' }) as Task,
        fixtures.task({ id: 3, title: 'Saatsiz', scheduled_time: null }) as Task,
      ]),
    );

    const titles = screen
      .getAllByTestId(/^task-\d+$/)
      .map((node) => within(node).getByTestId('task-title').textContent);

    expect(titles).toEqual(['Önce', 'Sonra', 'Saatsiz']);
  });

  // ----------------------------------------------------------- tamamlama

  it('tamamlanmış görevi işaretler', () => {
    renderPlan(
      ready([
        fixtures.task({
          id: 1,
          title: 'Bitti',
          is_completed: true,
          completed_at: '2026-08-22T10:00:00+00:00',
        }) as Task,
      ]),
    );

    expect(screen.getByTestId('task-1')).toHaveAttribute('data-completed', 'true');
  });

  it('açık görevi tamamlanmış göstermez', () => {
    renderPlan(ready([fixtures.task({ id: 1, is_completed: false }) as Task]));

    expect(screen.getByTestId('task-1')).toHaveAttribute('data-completed', 'false');
  });

  /**
   * REGRESYON — DURUM API'DEN OKUNUR, `completed_at`TEN TÜRETİLMEZ.
   *
   * Yanıt bilerek TUTARSIZ kuruldu: `completed_at` dolu ama
   * `is_completed` false. Arayüz durumu kendisi hesaplasaydı bu görevi
   * tamamlanmış gösterirdi. Backend bir gün kuralı değiştirirse (ör.
   * iptal edilmiş bir tamamlanmayı saymazsa), istemcideki kopya sessizce
   * yanlış sonuç verirdi.
   */
  it('tamamlanma durumunu kendisi hesaplamaz', () => {
    renderPlan(
      ready([
        fixtures.task({
          id: 1,
          is_completed: false,
          completed_at: '2026-08-22T10:00:00+00:00',
        }) as Task,
      ]),
    );

    expect(screen.getByTestId('task-1')).toHaveAttribute('data-completed', 'false');
  });

  // -------------------------------------------------------------- müşteri

  it('görevin müşterisini gösterir', () => {
    renderPlan(
      ready([
        fixtures.task({
          id: 1,
          customer: { id: 501, customer_no: 12, name: 'Zeynep Kaya' },
        }) as Task,
      ]),
    );

    expect(within(screen.getByTestId('task-1')).getByText('Zeynep Kaya')).toBeInTheDocument();
  });

  it('müşterisi olmayan görevde uydurma değer göstermez', () => {
    renderPlan(ready([fixtures.task({ id: 1, customer: null }) as Task]));

    expect(within(screen.getByTestId('task-1')).queryByTestId('task-customer')).not
      .toBeInTheDocument();
  });

  // -------------------------------------------------------------- durum

  it('yüklenirken bekleme durumu gösterir', () => {
    renderPlan({ status: 'loading', data: null });

    expect(screen.getByTestId('plan-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('plan-empty')).not.toBeInTheDocument();
  });

  /**
   * Yetki eksikliği bir arıza değil, beklenen bir sonuçtur — uyarı kutusu
   * gösterilseydi kullanıcı arızalı bir ekran gördüğünü sanırdı.
   */
  it('yetki yokken durumu açıklar, hata göstermez', () => {
    renderPlan({ status: 'forbidden', data: null });

    expect(screen.getByTestId('plan-forbidden')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sunucu hatasında alınamadı der', () => {
    renderPlan({ status: 'error', data: null });

    expect(screen.getByTestId('plan-error')).toHaveTextContent('Alınamadı');
  });
});
