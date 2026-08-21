import { describe, expect, it } from 'vitest';
import { auditActionLabel } from './auditLabels';
import { describeChanges, visibleMetadata } from './auditFormat';

/**
 * Denetim ayrıntısının GÖRÜNÜRLÜK KURALLARI.
 *
 * Bu dosya saf fonksiyonları test eder, çünkü buradaki kural bir görsel
 * tercih değil bir GÜVENLİK SINIRI: audit kaydı serbest biçimli sözlükler
 * taşır (`metadata`, `old_values`, `new_values`) ve bu sözlüklerin içeriği
 * zamanla değişir. Ham JSON basmak, bugün zararsız görünen bir alanın
 * yarın ekrana düşmesi demektir.
 *
 * BACKEND ZATEN TEMİZLİYOR (AuditLogService::filterSensitive): parola,
 * token, secret, authorization gibi anahtarlar YAZILMADAN önce düşürülür;
 * `email` ise `email_hash`e çevrilir. Buradaki beyaz liste o temizliğin
 * yerine geçmez, ÜSTÜNE gelir — ve farklı bir amaca hizmet eder:
 *
 *   backend  → sır sızmasın                (güvenlik)
 *   burada   → anlamsız veri gösterilmesin (netlik) + ikinci savunma
 *
 * `email_hash` bunun en iyi örneği: sızıntı değil, ama kullanıcıya 64
 * karakterlik bir sha256 göstermek hiçbir şey anlatmaz.
 *
 * KURAL: BEYAZ LİSTE, kara liste değil. Kara liste yeni eklenen bir alanı
 * varsayılan olarak GÖSTERİR; beyaz liste varsayılan olarak GİZLER.
 */
describe('visibleMetadata', () => {
  it('bilinen anahtarları Türkçe etiketle döner', () => {
    expect(
      visibleMetadata({ device_name: 'Ada MacBook', was_current_device: false }),
    ).toEqual([
      { label: 'Cihaz', value: 'Ada MacBook' },
      { label: 'Bu cihaz', value: 'Hayır' },
    ]);
  });

  it('rol değerini Türkçe etiketler', () => {
    expect(visibleMetadata({ role: 'owner' })).toEqual([{ label: 'Rol', value: 'Sahip' }]);
    expect(visibleMetadata({ role: 'member' })).toEqual([{ label: 'Rol', value: 'Üye' }]);
  });

  it('mantıksal değerleri Evet/Hayır olarak yazar', () => {
    expect(visibleMetadata({ created_new_account: true })).toEqual([
      { label: 'Yeni hesap oluşturuldu', value: 'Evet' },
    ]);
    expect(visibleMetadata({ verification_reset: true })).toEqual([
      { label: 'Doğrulama sıfırlandı', value: 'Evet' },
    ]);
  });

  it('sayısal değeri olduğu gibi yazar', () => {
    expect(visibleMetadata({ other_logins_revoked: 3 })).toEqual([
      { label: 'Kapatılan diğer oturum', value: '3' },
    ]);
  });

  /**
   * `email_hash` audit'te GERÇEKTEN vardır (davet, parola sıfırlama,
   * başarısız giriş). Sızıntı değil — ama kullanıcıya gösterilecek bir
   * şey de değil.
   */
  it('email_hash göstermez', () => {
    expect(
      visibleMetadata({
        email_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        role: 'member',
      }),
    ).toEqual([{ label: 'Rol', value: 'Üye' }]);
  });

  /**
   * Beyaz listenin asıl sınavı: yarın backend'e eklenecek bir anahtar
   * bu arayüzde KENDİLİĞİNDEN görünmemeli.
   */
  it('tanınmayan anahtarları göstermez', () => {
    expect(visibleMetadata({ internal_ref: 'X-9912', queue: 'default' })).toEqual([]);
  });

  /**
   * SAVUNMA AMAÇLI REGRESYON. Bu anahtarlar backend'de zaten düşürülüyor,
   * yani buraya normalde hiç ulaşmazlar. Test yine de var: filtrenin tek
   * bir yerde durması bilinçli bir tercih, ama arayüz o tercihe körü
   * körüne güvenmemeli.
   */
  it('hassas görünümlü anahtarları göstermez', () => {
    expect(
      visibleMetadata({
        password: 'gizli',
        token: 'plain-token',
        authorization: 'Bearer x',
        secret: 's',
      }),
    ).toEqual([]);
  });

  it('metadata yoksa boş liste döner', () => {
    expect(visibleMetadata(null)).toEqual([]);
    expect(visibleMetadata({})).toEqual([]);
  });

  /**
   * Sıra, anahtarın sözlükteki rastgele sırasına değil beyaz listeye
   * bağlıdır; aynı olay her seferinde aynı biçimde okunur.
   */
  it('çıktıyı beyaz liste sırasına göre üretir', () => {
    expect(
      visibleMetadata({ other_logins_revoked: 2, role: 'member', device_name: 'iPhone' }),
    ).toEqual([
      { label: 'Rol', value: 'Üye' },
      { label: 'Cihaz', value: 'iPhone' },
      { label: 'Kapatılan diğer oturum', value: '2' },
    ]);
  });
});

/**
 * old_values / new_values → insan okunur fark.
 *
 * Backend bu iki sözlüğü ham hâliyle taşır. Kaydın hangi alanları
 * içerdiği eyleme göre değişir: müşteri güncellemesinde `name`/`phone`,
 * rol değişiminde `role`, üye oluşturmada `email_hash` ve zaman damgaları.
 *
 * Yalnızca kullanıcının ANLAYABİLECEĞİ alanlar gösterilir. `id`,
 * `company_id`, `created_at`, `email_hash` gibi alanlar gürültüdür ve
 * bazıları (company_id) zaten hiç gösterilmemeli.
 */
describe('describeChanges', () => {
  it('güvenli alanların eski → yeni farkını çıkarır', () => {
    expect(
      describeChanges({ name: 'Zeynep Kaya', phone: '05551112233' }, { name: 'Zeynep Demir', phone: '05559998877' }),
    ).toEqual([
      { label: 'Ad', from: 'Zeynep Kaya', to: 'Zeynep Demir' },
      { label: 'Telefon', from: '05551112233', to: '05559998877' },
    ]);
  });

  /** Oluşturma: eski değer yoktur. */
  it('yalnızca yeni değer varsa eski tarafı boş bırakır', () => {
    expect(describeChanges(null, { name: 'Zeynep Kaya' })).toEqual([
      { label: 'Ad', from: null, to: 'Zeynep Kaya' },
    ]);
  });

  /** Silme: yeni değer yoktur. */
  it('yalnızca eski değer varsa yeni tarafı boş bırakır', () => {
    expect(describeChanges({ name: 'Zeynep Kaya' }, null)).toEqual([
      { label: 'Ad', from: 'Zeynep Kaya', to: null },
    ]);
  });

  /**
   * Değişmemiş alan listelenmez: "Ad: Zeynep → Zeynep" satırı, gerçek
   * değişikliği gözden kaçırtan bir gürültüdür.
   */
  it('değişmemiş alanı listelemez', () => {
    expect(
      describeChanges({ name: 'Zeynep Kaya', phone: '0555' }, { name: 'Zeynep Kaya', phone: '0666' }),
    ).toEqual([{ label: 'Telefon', from: '0555', to: '0666' }]);
  });

  it('rol değişimini Türkçe etiketlerle yazar', () => {
    expect(describeChanges({ role: 'member' }, { role: 'owner' })).toEqual([
      { label: 'Rol', from: 'Üye', to: 'Sahip' },
    ]);
  });

  /**
   * REGRESYON: `company_id` ASLA gösterilmez. Kullanıcı zaten aktif
   * şirkette; iç kimlik numarasını göstermek hem anlamsız hem de çok
   * kiracılı bir sistemde gereksiz bir iç yapı sızıntısı.
   */
  it('güvenli olmayan ve anlamsız alanları farka almaz', () => {
    expect(
      describeChanges(
        { id: 5, company_id: 7, email_hash: 'abc', created_at: '2026-08-01T00:00:00+00:00' },
        { id: 5, company_id: 7, email_hash: 'def', updated_at: '2026-08-02T00:00:00+00:00' },
      ),
    ).toEqual([]);
  });

  it('iki taraf da yoksa boş liste döner', () => {
    expect(describeChanges(null, null)).toEqual([]);
  });

  /** Çıktı sırası beyaz listeye bağlıdır, sözlük sırasına değil. */
  it('çıktıyı beyaz liste sırasına göre üretir', () => {
    expect(describeChanges(null, { phone: '0555', name: 'Zeynep' })).toEqual([
      { label: 'Ad', from: null, to: 'Zeynep' },
      { label: 'Telefon', from: null, to: '0555' },
    ]);
  });
});

/**
 * Eylem etiketleri.
 *
 * Liste backend'in AuditAction enum'ından birebir alınmıştır (23 değer).
 * Buradaki test, enum'a yeni bir değer eklendiğinde etiketin unutulmasını
 * yakalamaz — bunu ancak backend testi yapabilir. Yakaladığı şey, mevcut
 * eylemlerden birinin etiketinin silinmesi ya da bozulmasıdır.
 */
describe('auditActionLabel', () => {
  const BACKEND_ACTIONS = [
    'login.success',
    'login.failed',
    'logout',
    'profile.updated',
    'email.changed',
    'email.verification_requested',
    'email.verified',
    'password.changed',
    'password.reset.requested',
    'password.reset.completed',
    'session.revoked',
    'sessions.revoked_others',
    'company.selected',
    'member.created',
    'member.updated',
    'member.removed',
    'member.role_changed',
    'invitation.created',
    'invitation.revoked',
    'invitation.accepted',
    'customer.created',
    'customer.updated',
    'customer.deleted',
  ];

  it('backend enum değerlerinin hepsini çevirir', () => {
    const untranslated = BACKEND_ACTIONS.filter((action) => auditActionLabel(action) === action);

    expect(untranslated).toEqual([]);
  });

  it('etiketleri beklenen metinlerle verir', () => {
    expect(auditActionLabel('customer.created')).toBe('Müşteri oluşturuldu');
    expect(auditActionLabel('member.role_changed')).toBe('Üye rolü değiştirildi');
    expect(auditActionLabel('invitation.revoked')).toBe('Davet iptal edildi');
  });

  /**
   * Tanınmayan kod UYDURULMAZ. Backend yeni bir eylem eklediğinde
   * kullanıcı ham kodu görür — hiçbir şey görmemekten ya da yanlış bir
   * metin görmekten iyidir.
   */
  it('tanınmayan eylem kodunu ham hâliyle döner', () => {
    expect(auditActionLabel('warehouse.exported')).toBe('warehouse.exported');
  });
});
