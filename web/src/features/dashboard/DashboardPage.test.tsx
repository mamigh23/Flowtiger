import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { fixtures, jsonResponse, mockApi, renderApp } from '@/test/harness';

/**
 * Ana ekran — "bugün ne yapmam gerekiyor?" sorusunun cevabı.
 *
 * BU BİR YÖNETİM PANELİ DEĞİL (UI-01). Müşteri sayısı, ekip sayısı ve
 * hızlı erişim listesi kaldırıldı; hepsi doğru bilgilerdi ama hiçbiri
 * bugüne dair bir şey söylemiyordu.
 *
 * SAHTE VERİ YOK ve bu, ekranın büyük kısmının BOŞ olması demek:
 * backend'de görev/plan ucu YOK. Örnek bir gün çizmek en kolay yoldu ve
 * en yanlış olanı — kullanıcı kendi işletmesine ait olmayan bir takvim
 * görürdü. Aşağıdaki testler boşluğun kasıtlı olduğunu kilitliyor.
 *
 * Gerçek veriyle gelen TEK bölüm son hareketlerdir:
 *   GET /audit-logs?per_page=5 → data[]
 * Bu uç yalnızca owner'a açıktır; member 403 alır ve bu bir arıza değil.
 */
describe('DashboardPage', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const ownerRoutes = {
    '/me': () => jsonResponse(200, { data: fixtures.user() }),
    '/companies': () =>
      jsonResponse(200, { data: [fixtures.company()], meta: { active_company_id: 7 } }),
    /*
     * Görev ucu artık GERÇEK. Varsayılan olarak BOŞ döner: bu dosyadaki
     * mevcut iddiaların çoğu "API görev göndermiyorsa ekranda görev de
     * saat de yok" diyor ve o iddialar aynen geçerli.
     */
    '/tasks/today': () => jsonResponse(200, fixtures.paginated([], 0)),
    '/audit-logs': () => jsonResponse(200, fixtures.paginated([], 0)),
  };

  /** Sahte saati kurup uygulamayı açar. */
  function renderAtHour(hour: number) {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 7, 22, hour, 0, 0));

    renderApp('/app', { token: 'gecerli-token' });
  }

  // ---------------------------------------------------------- karşılama

  /**
   * REGRESYON — İSİM OTURUMDAKİ GERÇEK KULLANICIDAN GELİR.
   *
   * Yer tutucu bir ad ("Kullanıcı", "Muhammed") yazmak, ekranı dolu
   * göstermek için kimliği uydurmak olurdu.
   */
  it('selamlamada oturumdaki kullanıcının adını kullanır', async () => {
    vi.stubGlobal('fetch', mockApi(ownerRoutes));

    renderAtHour(9);

    expect(await screen.findByRole('heading', { name: /Ada Lovelace/ })).toBeInTheDocument();
  });

  it('sabah saatinde günaydın der', async () => {
    vi.stubGlobal('fetch', mockApi(ownerRoutes));

    renderAtHour(9);

    expect(
      await screen.findByRole('heading', { name: 'Günaydın, Ada Lovelace.' }),
    ).toBeInTheDocument();
  });

  it('öğleden sonra iyi günler der', async () => {
    vi.stubGlobal('fetch', mockApi(ownerRoutes));

    renderAtHour(15);

    expect(
      await screen.findByRole('heading', { name: 'İyi günler, Ada Lovelace.' }),
    ).toBeInTheDocument();
  });

  it('akşam iyi akşamlar der', async () => {
    vi.stubGlobal('fetch', mockApi(ownerRoutes));

    renderAtHour(21);

    expect(
      await screen.findByRole('heading', { name: 'İyi akşamlar, Ada Lovelace.' }),
    ).toBeInTheDocument();
  });

  it('karşılamanın altında hoş geldiniz yazar', async () => {
    vi.stubGlobal('fetch', mockApi(ownerRoutes));

    renderAtHour(9);

    expect(await screen.findByText('Hoş geldiniz.')).toBeInTheDocument();
    expect(screen.getByText('Bugün işletmeniz için neler var?')).toBeInTheDocument();
  });

  /**
   * REGRESYON — EL İŞARETİ ERİŞİLEBİLİR ADA GİRMEZ.
   *
   * Dekoratif bir emoji `aria-hidden` olmazsa ekran okuyucu onu okur ve
   * selamlama "Günaydın, Ada Lovelace. el sallama" olur. Süs, cümlenin
   * parçası değildir.
   */
  it('selamlamadaki el işaretini ekran okuyucuya okutmaz', async () => {
    vi.stubGlobal('fetch', mockApi(ownerRoutes));

    renderAtHour(9);

    const heading = await screen.findByRole('heading', { name: 'Günaydın, Ada Lovelace.' });

    // Süs DOM'da var ama erişilebilir adın dışında.
    expect(heading.textContent).toContain('👋');
  });

  /**
   * REGRESYON — ANA EKRANDA YALNIZCA İKİ BÖLÜM VAR.
   *
   * Referans tasarımda dört blok var; üçünün (görev listesi, "dikkat
   * gerekenler", gün özeti) backend'de karşılığı YOK. Bu test o üçünün
   * sessizce geri sızmasını engelliyor: yeni bir bölüm ancak gerçek bir
   * veri kaynağıyla birlikte gelebilir.
   */
  it('yalnızca gerçek veri kaynağı olan bölümleri gösterir', async () => {
    vi.stubGlobal('fetch', mockApi(ownerRoutes));

    renderAtHour(9);

    await screen.findByTestId('plan-empty');

    const sections = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent);

    expect(sections).toEqual(['Bugünün Planı', 'Son hareketler']);
  });

  // -------------------------------------------------------------- bugün

  it('bugünün planı bölümünü tarihiyle gösterir', async () => {
    vi.stubGlobal('fetch', mockApi(ownerRoutes));

    renderAtHour(9);

    expect(
      await screen.findByRole('heading', { name: 'Bugünün Planı' }),
    ).toBeInTheDocument();
    expect(screen.getByText('22 Ağustos 2026, Cumartesi')).toBeInTheDocument();
  });

  /**
   * REGRESYON — API GÖREV GÖNDERMİYORSA SAHTE PLAN ÜRETİLMEZ.
   *
   * Bu iddia görev ucu YOKKEN yazılmıştı ve "arayüz örnek bir gün
   * çizmesin" diyordu. Uç geldi; iddia SİLİNMEDİ, anlamı KESİNLEŞTİ:
   * artık "API boş liste döndüğünde ekranda ne görev ne saat olur" diyor.
   * Aynı mimari garanti, gerçek veri modeline oturmuş hâli.
   */
  it('API görev göndermediğinde sahte plan göstermez', async () => {
    vi.stubGlobal('fetch', mockApi(ownerRoutes));

    renderAtHour(9);

    expect(await screen.findByTestId('plan-empty')).toHaveTextContent(
      'Bugün için planlanmış bir iş yok.',
    );

    // Örnek saat/isim kalıpları ekranda BULUNMAMALI.
    expect(screen.queryByText(/\d{2}:\d{2}/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ahmet Yılmaz|ABC Ltd/)).not.toBeInTheDocument();
  });

  /**
   * REGRESYON — SAAT YALNIZCA API'DEN GELİR.
   *
   * Yukarıdaki testin diğer yarısı. İkisi birlikte tek bir kuralı
   * kilitliyor: ekrandaki her saat backend'in gönderdiği bir saattir.
   */
  it('API saat gönderdiğinde o saati gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerRoutes,
        '/tasks/today': () =>
          jsonResponse(
            200,
            fixtures.paginated(
              [fixtures.task({ id: 1, title: 'Müşteri görüşmesi', scheduled_time: '09:00' })],
              1,
            ),
          ),
      }),
    );

    renderAtHour(9);

    expect(await screen.findByText('Müşteri görüşmesi')).toBeInTheDocument();
    expect(screen.getByText('09:00')).toBeInTheDocument();
    expect(screen.queryByTestId('plan-empty')).not.toBeInTheDocument();
  });

  it('API saatsiz görev gönderdiğinde saat uydurmaz', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerRoutes,
        '/tasks/today': () =>
          jsonResponse(
            200,
            fixtures.paginated(
              [fixtures.task({ id: 1, title: 'Bir ara yapılacak', scheduled_time: null })],
              1,
            ),
          ),
      }),
    );

    renderAtHour(9);

    expect(await screen.findByText('Bir ara yapılacak')).toBeInTheDocument();
    expect(screen.queryByText(/\d{2}:\d{2}/)).not.toBeInTheDocument();
  });

  /**
   * REGRESYON — "BUGÜN"Ü SUNUCU BELİRLER.
   *
   * Arayüz kendi tarihini hesaplayıp `?date=` göndermez. Gönderseydi,
   * saat dilimi şirketinkinden farklı bir kullanıcı yanlış günün işlerini
   * görürdü — gün sınırı şirketin saat diliminde, backend'de belirlenir
   * (playbook §3.1).
   */
  it('bugünün işlerini kendi tarihini üreterek istemez', async () => {
    const fetchMock = mockApi(ownerRoutes);

    vi.stubGlobal('fetch', fetchMock);
    renderAtHour(9);

    await screen.findByTestId('plan-empty');

    const urls = fetchMock.mock.calls.map(([url]) => String(url));

    expect(urls.some((url) => url.includes('/tasks/today'))).toBe(true);
    expect(urls.some((url) => url.includes('/tasks?') && url.includes('date='))).toBe(false);
  });

  /**
   * REGRESYON — PLAN VE İŞ LİSTESİ TEK BÖLÜM (UI-02).
   *
   * İkisi de AYNI eksik backend için boş kutuydu. Tek bir eksiklik için
   * iki boş kart göstermek, ekranı doldurmak yerine boşluğu iki katına
   * çıkarıyordu.
   */
  it('boş plan için ikinci bir boş bölüm göstermez', async () => {
    vi.stubGlobal('fetch', mockApi(ownerRoutes));

    renderAtHour(9);

    await screen.findByTestId('plan-empty');

    expect(screen.queryByRole('heading', { name: 'Bugünkü İşlerimiz' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('tasks-empty')).not.toBeInTheDocument();
  });

  /**
   * REGRESYON — "DİKKAT GEREKENLER" HİÇ RENDER EDİLMEZ.
   *
   * Mevcut API "kaç ödeme kontrol bekliyor" sorusuna cevap vermiyor.
   * Sayfalanmış bir listenin ilk sayfasını sayıp uyarı üretmek, eksik bir
   * sayıyı gerçekmiş gibi göstermek olurdu. Boş bir "her şey yolunda"
   * kutusu da yanlış olurdu: bilmediğimiz bir şey hakkında güvence vermek.
   */
  it('veri kaynağı olmayan dikkat bölümünü hiç göstermez', async () => {
    vi.stubGlobal('fetch', mockApi(ownerRoutes));

    renderAtHour(9);

    await screen.findByTestId('plan-empty');

    expect(screen.queryByText(/Dikkat Gerekenler/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/kontrol bekliyor/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/geri dönüş bekliyor/i)).not.toBeInTheDocument();
  });

  // ------------------------------------------------- kaldırılan bölümler

  /**
   * REGRESYON — ESKİ KPI KARTLARI ANA EKRANDA YOK.
   *
   * Kartlar kalkınca sayım istekleri de kalkmalı: ekranda görünmeyen bir
   * veri için ağ isteği yapmak, kullanıcının bant genişliğini ve
   * veritabanını görünmez bir şey için harcamaktır.
   */
  it('müşteri ve ekip sayım kartlarını göstermez', async () => {
    const fetchMock = mockApi(ownerRoutes);

    vi.stubGlobal('fetch', fetchMock);
    renderAtHour(9);

    await screen.findByTestId('plan-empty');

    expect(screen.queryByTestId('stat-customers')).not.toBeInTheDocument();
    expect(screen.queryByTestId('stat-members')).not.toBeInTheDocument();

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes('/customers?per_page=1'))).toBe(false);
    expect(urls.some((url) => url.includes('/members?per_page=1'))).toBe(false);
  });

  /** Hızlı erişim listesi kalktı: kenar çubuğu zaten aynı işi yapıyor. */
  it('hızlı erişim listesini göstermez', async () => {
    vi.stubGlobal('fetch', mockApi(ownerRoutes));

    renderAtHour(9);

    await screen.findByTestId('plan-empty');

    expect(screen.queryByRole('heading', { name: 'Hızlı erişim' })).not.toBeInTheDocument();
  });

  // ------------------------------------------------------ son hareketler

  it('son hareketleri audit kayıtlarından listeler', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerRoutes,
        '/audit-logs': () =>
          jsonResponse(
            200,
            fixtures.paginated(
              [
                fixtures.auditLog({ id: 1, action: 'customer.created' }),
                fixtures.auditLog({ id: 2, action: 'member.role_changed' }),
              ],
              2,
            ),
          ),
      }),
    );

    renderAtHour(9);

    expect(await screen.findByText('Müşteri oluşturuldu')).toBeInTheDocument();
    expect(screen.getByText('Üye rolü değiştirildi')).toBeInTheDocument();
  });

  it('son hareketleri per_page=5 ile ister', async () => {
    const fetchMock = mockApi(ownerRoutes);

    vi.stubGlobal('fetch', fetchMock);
    renderAtHour(9);

    await screen.findByTestId('recent-activity');

    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([url]) => String(url));
      expect(urls.some((url) => url.includes('/audit-logs?per_page=5'))).toBe(true);
    });
  });

  /**
   * Son hareketler "Gün Özeti" DİYE ETİKETLENMEZ: audit kayıtları
   * "tamamlanan iş" değildir ve öyle adlandırmak veriyi olmadığı bir şeye
   * dönüştürmek olurdu.
   */
  it('son hareketleri tamamlanan iş gibi adlandırmaz', async () => {
    vi.stubGlobal('fetch', mockApi(ownerRoutes));

    renderAtHour(9);

    expect(await screen.findByRole('heading', { name: 'Son hareketler' })).toBeInTheDocument();
    expect(screen.queryByText(/tamamlanan iş/i)).not.toBeInTheDocument();
  });

  it('hiç hareket yokken boş durum gösterir', async () => {
    vi.stubGlobal('fetch', mockApi(ownerRoutes));

    renderAtHour(9);

    expect(await screen.findByText('Henüz hareket yok.')).toBeInTheDocument();
  });

  /**
   * Member rolündeki kullanıcı için /audit-logs 403 döner. Bu bir arıza
   * değil; bölüm kendi durumunu göstermeli ve ekranın geri kalanı
   * çalışmaya devam etmeli.
   */
  it('403 dönen bölümü hata değil yetki durumu olarak gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        '/me': () => jsonResponse(200, { data: fixtures.user() }),
        '/companies': () =>
          jsonResponse(200, {
            data: [fixtures.company({ role: 'member' })],
            meta: { active_company_id: 7 },
          }),
        /*
         * Görev ucu BAŞARILI ve BOŞ döner.
         *
         * Bu test denetim ucunun 403'ünü ölçüyor; görev ucunun değil.
         * Mock'suz bırakılırsa `/tasks/today` 404 alır ve plan bölümü hata
         * durumuna düşer — test o zaman ölçmek istediği şeyi değil,
         * kurulumundaki eksiği ölçmüş olur.
         *
         * Rota haritası `ownerRoutes`u spread ETMİYOR çünkü burada rol
         * `member`; o yüzden görev ucu ayrıca yazılıyor.
         */
        '/tasks/today': () => jsonResponse(200, fixtures.paginated([], 0)),
        '/audit-logs': () => jsonResponse(403, { message: 'Bu işlem için yetkiniz yok.' }),
      }),
    );

    renderAtHour(9);

    await waitFor(() =>
      expect(screen.getByTestId('recent-activity')).toHaveTextContent('Yetkiniz yok'),
    );

    // Karşılama ve bugün bölümleri etkilenmez.
    expect(screen.getByTestId('plan-empty')).toBeInTheDocument();

    // Hata uyarısı gösterilmemeli — bu beklenen bir durum.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sunucu hatasında bölüm bazında hata durumu gösterir', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...ownerRoutes,
        '/audit-logs': () => jsonResponse(500, { message: 'Server Error' }),
      }),
    );

    renderAtHour(9);

    await waitFor(() =>
      expect(screen.getByTestId('recent-activity')).toHaveTextContent('Alınamadı'),
    );

    // Ham sunucu metni kullanıcıya gösterilmez.
    expect(screen.getByTestId('recent-activity').textContent).not.toContain('Server Error');
  });
});
