import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, api, endpoints, NetworkError, toUserMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth/AuthContext';
import type { Company } from '@/types/api';

/**
 * Aktif şirket durumu.
 *
 * KRİTİK KURAL (playbook §3.1): aktif şirket İSTEMCİDE SEÇİLMEZ.
 *
 * Buradaki değer yalnızca bir ÖNBELLEKTİR — backend'in söylediğinin
 * kopyası. Tenant kararı her istekte backend'de yeniden verilir
 * (company.context middleware'i üyeliği yeniden doğrular). İstemci
 * hiçbir istekte active_company_id göndermez; şirket değiştirmek için
 * yalnızca select ucu çağrılır.
 *
 * ŞİRKET DEĞİŞTİRME (bu turda eklendi)
 *
 * Çok şirketli bir kullanıcı aktif şirketi varken de başka şirketine
 * geçebilir; geçişin tek yolu yine `select()`tir. Geçiş, seçim
 * ekranından (CompanySelectPage) ya da kabuktaki "Şirket değiştir"
 * kontrolünden başlatılabilir; ikisi de aynı fonksiyonu çağırır.
 *
 * İKİ KURAL BURADA KORUNUR:
 *
 *   1. Backend onaylamadan yeni şirket "seçilmiş" gösterilmez:
 *      `activeCompanyId` yalnızca POST /companies/{id}/select BAŞARILI
 *      olduğunda güncellenir.
 *
 *   2. Sonucu BELİRSİZ bir hata (ağ kopması / 5xx) yerel önbelleği
 *      güvenilmez kılar: istek sunucuya ulaşıp seçim kaydedilmiş
 *      olabilir. Bu durumda `reverify()` ile aktif şirket sunucudan
 *      yeniden okunur; okunamazsa `verifyError` dolar ve arayüz kiracı
 *      işlemlerini durdurur (fail closed).
 *
 *   3. SEÇİM SÜRERKEN KİRACI İŞLEMİ BAŞLATILMAZ. Seçim (ve belirsiz
 *      sonucun doğrulaması) bitmeden hangi kiracıda olduğumuz kesin
 *      değildir; bu pencerede bir listeyi yüklemek ya da bir formu
 *      açmak yanlış şirkette işlem yapma riskidir. `selectionPending`
 *      bu pencereyi kabuğa bildirir (bkz. AppShell).
 */
export type CompanyStatus = 'idle' | 'loading' | 'ready' | 'error';

interface CompanyContextValue {
  companies: Company[];
  activeCompanyId: number | null;
  activeCompany: Company | null;
  status: CompanyStatus;
  error: string | null;
  /** Seçim süren şirketin kimliği (kart bazında disable için). */
  selectingId: number | null;
  /**
   * BİR SEÇİM (ve varsa belirsiz sonucunun doğrulaması) SÜRÜYOR.
   *
   * Doğrulama da kapsanır: `select()` belirsiz bir hatadan sonra
   * `reverify()`i BEKLER, dolayısıyla seçim ancak ikisi de bitince
   * tamamlanmış sayılır. Kabuk bu bayrak doluyken kiracı ekranlarını
   * kurmaz — kullanıcı seçim sürerken seçim ekranından geri dönse bile
   * (tarayıcı geri tuşu) hiçbir tenant isteği atılmaz.
   */
  selectionPending: boolean;
  selectError: string | null;
  /**
   * Belirsiz bir hatadan sonra sunucudaki aktif şirket DOĞRULANAMADI.
   *
   * Bu bayrak doluyken istemci hangi kiracıda olduğunu bilmiyor: ekranlar
   * veri işlemi başlatmamalı ve kullanıcıya durum açıkça gösterilmelidir.
   * Doğrulama başarılı olur olmaz temizlenir.
   */
  verifyError: string | null;
  /**
   * Şirket listesini sunucudan yeniden okur.
   *
   * `autoSelect` (varsayılan `true`): tek şirketli kullanıcı için OTOMATİK
   * seçim de denenir — giriş anındaki mevcut davranış.
   *
   * `autoSelect: false` YALNIZCA kullanıcının davet kabul ettiği gibi,
   * "listeyi tazele ama karar verme" gereken anlar içindir: kabul etmek
   * o şirkete GEÇMEK anlamına gelmez, geçiş açık bir kullanıcı kararıdır.
   *
   * Dönüş: okuma BAŞARILI olduysa `true`. Hata FIRLATILMAZ — hata zaten
   * `status`/`error` üzerinden ekranlara ulaşır ve çağıranların çoğu
   * sonucu umursamaz (`void reload()`). Ama davet kabulü gibi, "işlem
   * başarılı ama tazeleme başarısız" ayrımını YAPMASI gereken çağıranlar
   * için bu bilgi gerekir: hatayı yutup `void` dönmek, tazeleme
   * başarısızlığını sessizce yok sayardı.
   */
  reload(options?: { autoSelect?: boolean; background?: boolean }): Promise<boolean>;
  select(companyId: number): Promise<void>;
  /**
   * Sunucudaki aktif şirketi yeniden okur (belirsiz hata sonrası).
   *
   * Dönüş: sunucunun bildirdiği aktif şirket kimliği; okuma başarısız
   * olursa `null` ve `verifyError` dolar. `null` iki durumu birden
   * temsil eder (okunamadı ya da gerçekten aktif şirket yok) — `select`
   * yalnızca gerçek bir kimlikle eşitlik kurduğu için bu ayrım orada
   * önemsizdir; ekranlar ise `verifyError`ı gösterir.
   */
  reverify(): Promise<number | null>;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { status: authStatus } = useAuth();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<number | null>(null);
  const [status, setStatus] = useState<CompanyStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<number | null>(null);
  const [selectionPending, setSelectionPending] = useState(false);
  const [selectError, setSelectError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  /**
   * Otomatik seçim yalnızca BİR KEZ denenir.
   *
   * Deneme başarısız olursa (ör. 403) tekrar tekrar denemek sonsuz
   * istek döngüsü yaratırdı; kullanıcı o durumda seçim ekranında
   * hatayı görür.
   */
  const autoSelectAttempted = useRef(false);

  /**
   * Bir seçim sürerken ikincisi BAŞLATILMAZ.
   *
   * Düğmeler `selectingId` üzerinden zaten kilitlenir; bu bayrak, aynı
   * karede gelen iki çağrıyı (ör. hızlı çift tıklama, ya da bir kartla
   * "Şirket değiştir"in aynı anda tetiklenmesi) React'in yeniden
   * render'ından bağımsız olarak keser. İki istek yarışırsa hangisinin
   * kazandığı belirsiz kalırdı.
   */
  const selectionInFlight = useRef(false);

  /**
   * SEÇİM NESLİ — bir seçim girişimini tekilleştirir.
   *
   * Her `select()` çağrısı nesli artırır ve KENDİ neslini yanında taşır.
   * Geç gelen bir yanıt, nesli artık kendisininki değilse durumu YAZMAZ.
   * Bu, üç ayrı yarışı tek kuralla kapatır:
   *
   *   - Çıkış yapıldığında nesil artar: uçuşta olan bir seçim yanıtı
   *     geldiğinde artık geçersizdir ve şirket durumunu yeniden doldurmaz
   *     (yoksa çıkıştan sonra arka planda bir "oturum" kurulmuş gibi
   *     görünürdü).
   *   - Yeni bir seçim başladığında nesil artar: öncekinin gecikmiş
   *     yanıtı yeni ve ONAYLANMIŞ seçimi geriye çevirmez.
   *   - Belirsiz sonucun doğrulaması (`reverify`) da nesle bağlıdır:
   *     doğrulama beklerken tamamlanan yeni bir seçimin üstüne yazmaz.
   */
  const selectionEpoch = useRef(0);

  /**
   * `/companies` okumalarının sıra numarası — EN SON OKUMA KAZANIR.
   *
   * `reload` ve `reverify` birbirinden bağımsız zamanlanır; ikisi de
   * aktif şirketi yazar. Sıra numarası olmadan, önce başlamış ama SONRA
   * dönmüş bir okuma (ör. yavaş bir reload, ondan önce dönmüş bir
   * doğrulamanın) üstüne yazabilirdi. Sıra, her çağrıda artırılır ve
   * yalnızca kendi sırası hâlâ güncel olan yanıt durumu yazar.
   *
   * `select()` başarısı da sırayı artırır: sunucunun ONAYLADIĞI taze bir
   * seçim, uçuşta olan eski bir okumanın bayat yanıtıyla ezilemez.
   */
  const companyListSeq = useRef(0);

  /**
   * `autoSelect: false` ile gelen çağrı, tek şirketli otomatik seçimi
   * ATLAR. Bayrak ref'te tutulur çünkü kararı veren efekt, `reload` ile
   * AYNI karede değil, yanıt geldikten sonra çalışır.
   */
  const suppressAutoSelect = useRef(false);

  const reload = useCallback(async (options?: { autoSelect?: boolean; background?: boolean }) => {
    const requestId = ++companyListSeq.current;

    /*
      YALNIZCA AÇIKÇA VERİLDİYSE DEĞİŞTİRİLİR.

      `suppressAutoSelect.current = options?.autoSelect === false` yazmak
      cazipti ama YANLIŞTI: seçenek vermeyen sıradan bir `reload()` da
      bayrağı `false`a çekerdi ve az önce `autoSelect: false` ile
      istenmiş baskılamayı iptal ederdi. İki çağrı yarıştığında (ör.
      davet kabulünden sonraki tazeleme ile efektin yeniden çalışması)
      kazanan, bayrağı en son yazan değil, kullanıcının gerçek niyeti
      olmalıdır.
    */
    if (options?.autoSelect !== undefined) {
      suppressAutoSelect.current = options.autoSelect === false;
    }

    if (!options?.background) setStatus('loading');
    setError(null);

    try {
      const response = await endpoints.companies.list(api);

      // Daha yeni bir okuma (ya da onaylanmış bir seçim) başladıysa bu
      // yanıt bayattır; durumu yazmaz. Bayat yanıt "başarılı" da
      // sayılmaz: sonucu hakkında söylenebilecek bir şey yoktur.
      if (requestId !== companyListSeq.current) return false;

      setCompanies(response.data);
      setActiveCompanyId(response.meta.active_company_id);
      setStatus('ready');
      return true;
    } catch (cause) {
      if (requestId !== companyListSeq.current) return false;

      // 401 ise ApiClient token'ı zaten düşürdü; AuthContext oturumu
      // kapatacak. Burada yalnızca ekranın kilitlenmemesi sağlanır.
      setStatus('error');
      setError(toUserMessage(cause));
      return false;
    }
  }, []);

  /**
   * Sunucudaki aktif şirketi yeniden okur — DURUM EKRANINI BOZMADAN.
   *
   * `reload()`tan farkı: `status`u 'loading'e çekmez. Belirsiz bir
   * hatadan sonra kabuk zaten ayaktadır; `status`u oynatmak
   * `RequireActiveCompany`i bir an için yükleme ekranına düşürür ve
   * kabuğu söküp yeniden kurardı (marka geçişi de boşuna tekrarlanırdı).
   */
  const reverify = useCallback(async (): Promise<number | null> => {
    const requestId = ++companyListSeq.current;

    try {
      const response = await endpoints.companies.list(api);

      if (requestId !== companyListSeq.current) return null;

      setCompanies(response.data);
      setActiveCompanyId(response.meta.active_company_id);
      setVerifyError(null);
      return response.meta.active_company_id;
    } catch (cause) {
      // Bayat bir doğrulamanın hatası, güncel duruma dair bir şey
      // söylemez: bu yüzden yalnızca sırası güncel olan yanıt yazar.
      if (requestId !== companyListSeq.current) return null;

      setVerifyError(toUserMessage(cause));
      return null;
    }
  }, []);

  const select = useCallback(
    async (companyId: number) => {
      /*
       * Çift gönderim: süren bir seçim varsa yeni istek atılmaz.
       *
       * HATA FIRLATILIR, sessizce dönülmez: çağıranlar (`handleSelect`,
       * otomatik seçim) başarıyı "istisna atmadı" diye okur. Sessiz bir
       * dönüş, ikinci tıklamayı başarı sanıp sunucu henüz onaylamadan
       * panele yönlendirirdi.
       */
      if (selectionInFlight.current) {
        throw new Error('Şirket seçimi zaten sürüyor.');
      }

      selectionInFlight.current = true;

      /*
        Bu girişimin nesli. Yanıt geldiğinde nesil hâlâ bu ise seçim
        geçerlidir; artmışsa (çıkış yapıldı ya da daha yeni bir seçim
        başladı) yanıt bayattır ve duruma YAZILMAZ.
      */
      const epoch = ++selectionEpoch.current;

      setSelectingId(companyId);
      setSelectionPending(true);
      setSelectError(null);

      try {
        // Backend seçimi doğrular ve kaydeder; biz yalnızca sonucu
        // yansıtırız. İyimser (optimistic) güncelleme YOK: başarısız
        // bir seçim, kullanıcıya hiç geçmediği bir şirkette olduğunu
        // düşündürmemeli.
        const selected = await endpoints.companies.select(api, companyId);

        // Çıkış yapıldı ya da daha yeni bir seçim başladı: bu yanıt
        // artık güncel durumu değil, GEÇMİŞ bir kararı temsil ediyor.
        if (epoch !== selectionEpoch.current) return;

        // Onaylanmış seçim, uçuşta olan bir okumanın bayat yanıtından
        // DAHA YENİDİR: sırayı ilerleterek o yanıtı geçersiz kılar.
        companyListSeq.current += 1;

        setActiveCompanyId(selected.id);
        setVerifyError(null);
      } catch (cause) {
        /*
          SONUCU BELİRSİZ HATA: ağ kopması ya da 5xx.

          İstek sunucuya ulaşmış ve seçim KAYDEDİLMİŞ olabilir; yalnızca
          yanıt elimize geçmemiştir. Bu andan sonra yerel önbellek
          sunucunun söylediğinin kopyası olmayabilir — eski bağlamda
          işlem yaptırmak yanlış kiracıya yazmak demektir. Bu yüzden
          devam etmeden önce aktif şirketi sunucudan doğrularız.
        */
        const ambiguous =
          cause instanceof NetworkError || (cause instanceof ApiError && cause.isServerError);

        /*
          GÜNCELLİK KONTROLÜ HATANIN SINIFINDAN ÖNCE GELİR.

          Bu girişim bayatladıysa (çıkış yapıldı ya da daha yeni bir
          seçim başladı) hata üzerinde YAPILACAK HİÇBİR ŞEY yoktur —
          `reverify()` dahil. Doğrulama, yeni ve AÇIK oturumda taze bir
          `/companies` isteği başlatır ve `verifyError`ı yazabilir; yani
          kapanmış bir oturumun isteği, açık olan oturumun durumunu
          değiştirirdi. Bu yüzden önce dönülür.
        */
        if (epoch !== selectionEpoch.current) return;

        if (ambiguous) {
          /*
            DOĞRULAMA DA BU GİRİŞİME BAĞLIDIR.

            `reverify()` beklerken daha yeni bir seçim tamamlanabilir ya
            da kullanıcı çıkış yapabilir. İkisinde de bu girişimin
            sonucu artık bir şey ifade etmez: ne hata gösterilmeli ne de
            "aslında seçilmiş" diye bir sonuç yazılmalı. (Awaited
            olduğu için kontrol burada TEKRARLANIR.)
          */
          const serverCompanyId = await reverify();

          if (epoch !== selectionEpoch.current) return;

          if (serverCompanyId === companyId) {
            // Seçim aslında gerçekleşmiş; hata göstermek yanıltıcı olur.
            setSelectError(null);
            return;
          }
        }

        if (epoch !== selectionEpoch.current) return;

        setSelectError(toUserMessage(cause));
        throw cause;
      } finally {
        /*
          YALNIZCA EN GÜNCEL GİRİŞİM TEMİZLER.

          Bayat bir yanıtın `finally`si, sürmekte olan YENİ bir seçimin
          "sürüyor" işaretini kaldırmamalıdır — o işaret kalkarsa kabuk
          kiracı ekranlarını yanlış anda yeniden kurar.
        */
        if (epoch === selectionEpoch.current) {
          selectionInFlight.current = false;
          setSelectingId(null);
          setSelectionPending(false);
        }
      }
    },
    [reverify],
  );

  /** Oturum açıldığında yükle, kapandığında temizle. */
  useEffect(() => {
    if (authStatus === 'authenticated') {
      void reload();
      return;
    }

    if (authStatus === 'unauthenticated') {
      /*
        UÇUŞTAKİ İŞ GEÇERSİZLEŞTİRİLİR — İKİSİ DE.

        `selectionEpoch`: çıkıştan SONRA dönen bir SEÇİM yanıtı neslini
        eşleştiremez ve durumu geri yazmaz.

        `companyListSeq`: çıkıştan SONRA dönen bir OKUMA (uçuştaki
        `reverify` ya da `reload`) sırasını eşleştiremez ve durumu geri
        yazmaz. BU, GÖRÜNÜR BİR HATAYI KAPATIR: belirsiz bir seçimden
        sonra başlayan doğrulama askıda kalmışken kullanıcı çıkıp
        yeniden giriş yaparsa, geç dönen doğrulamanın HATASI
        `verifyError`a yazılır ve yeni oturumda kabuk, doğrulanamayan
        kiracı ekranıyla kilitlenir — oysa yeni oturumun şirketi
        `reload` ile zaten taze okunmuştur.

        `selectionInFlight` ELLE SIFIRLANIR — nesil artırmak yetmez.
        `select()`ın `finally`si bayrağı yalnızca nesli hâlâ güncelken
        temizler; çıkışta nesil arttığı için ESKİ girişimin `finally`si
        hiçbir şey temizlemez ve bayrak `true` kalır. Bir sonraki
        oturumda her seçim "Şirket seçimi zaten sürüyor." diye anında
        reddedilir — kullanıcı yeniden giriş yaptığı hâlde şirket
        değiştiremez.

        `selectionPending` de temizlenir: çıkışta kabuk zaten sökülür,
        ama bayrak kalsaydı bir sonraki oturumda ilk render'ı bloklardı.
      */
      selectionEpoch.current += 1;
      companyListSeq.current += 1;
      selectionInFlight.current = false;

      setCompanies([]);
      setActiveCompanyId(null);
      setStatus('idle');
      setError(null);
      setSelectError(null);
      setVerifyError(null);
      setSelectingId(null);
      setSelectionPending(false);
      autoSelectAttempted.current = false;
    }
  }, [authStatus, reload]);

  /**
   * Tek şirketi olan kullanıcıya seçim ekranı gösterilmez.
   *
   * Backend zaten tek şirkette otomatik seçime izin veriyor; istemci
   * de kullanıcıyı tek seçenekli bir ekranda bekletmemeli.
   */
  useEffect(() => {
    if (status !== 'ready') return;
    if (activeCompanyId !== null) return;
    if (companies.length !== 1) return;
    if (autoSelectAttempted.current) return;
    // Bir seçim sürerken (ör. kullanıcı seçim ekranından çıkarken)
    // otomatik seçim başlatılmaz: `selectionInFlight` üzerinden zaten
    // hata fırlatırdı ve yakalanmasız bir istisna olurdu.
    if (selectionPending) return;

    /*
      ÇAĞIRAN OTOMATİK SEÇİMİ İSTEMEDİYSE ATLANIR.

      Tek şirketli kullanıcıyı otomatik seçmek GİRİŞ ANI için doğrudur:
      kullanıcının gidecek başka yeri yoktur. Ama davet kabulü gibi
      anlarda aynı davranış YANLIŞ olurdu — kabul etmek o şirkete geçmek
      anlamına gelmez; "hangi şirkette çalışıyorum" kararı kullanıcıya
      aittir (bkz. IncomingInvitationsPage'deki "Şirkete geç").

      Bayrak BİR KEZ tüketilir ve `autoSelectAttempted` işaretlenir:
      aksi hâlde bir sonraki render'da otomatik seçim yine devreye
      girerdi. İşaret çıkışta sıfırlanır, dolayısıyla bir sonraki girişte
      mevcut davranış aynen çalışır.
    */
    if (suppressAutoSelect.current) {
      suppressAutoSelect.current = false;
      autoSelectAttempted.current = true;
      return;
    }

    autoSelectAttempted.current = true;

    void select(companies[0]!.id).catch(() => {
      // Hata seçim ekranında gösterilir.
    });
  }, [status, activeCompanyId, companies, select, selectionPending]);

  const activeCompany = useMemo(
    () => companies.find((company) => company.id === activeCompanyId) ?? null,
    [companies, activeCompanyId],
  );

  const value = useMemo<CompanyContextValue>(
    () => ({
      companies,
      activeCompanyId,
      activeCompany,
      status,
      error,
      selectingId,
      selectionPending,
      selectError,
      verifyError,
      reload,
      select,
      reverify,
    }),
    [
      companies,
      activeCompanyId,
      activeCompany,
      status,
      error,
      selectingId,
      selectionPending,
      selectError,
      verifyError,
      reload,
      select,
      reverify,
    ],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompanies(): CompanyContextValue {
  const context = useContext(CompanyContext);

  if (!context) {
    throw new Error('useCompanies, CompanyProvider içinde kullanılmalıdır.');
  }

  return context;
}
