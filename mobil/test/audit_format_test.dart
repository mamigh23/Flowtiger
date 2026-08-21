import 'package:flowtiger/features/audit/audit_format.dart';
import 'package:flowtiger/features/audit/audit_labels.dart';
import 'package:flutter_test/flutter_test.dart';

/// Denetim ayrıntısının GÖRÜNÜRLÜK KURALLARI — web'deki auditFormat.ts
/// ile birebir aynı sözleşme.
///
/// Bu dosya saf fonksiyonları test eder, çünkü buradaki kural bir görsel
/// tercih değil bir GÜVENLİK SINIRI: audit kaydı serbest biçimli sözlükler
/// taşır (`metadata`, `old_values`, `new_values`) ve içerikleri eyleme
/// göre değişir, zamanla genişler. Ham sözlüğü ekrana dökmek, bugün
/// zararsız görünen bir alanın yarın kullanıcıya görünmesi demektir.
///
/// BACKEND ZATEN TEMİZLİYOR (AuditLogService::filterSensitive): parola,
/// token, secret, authorization, cookie, session, credential, api_key,
/// private_key, signature, otp içeren anahtarlar YAZILMADAN önce
/// düşürülür; `email` ise tek yönlü `email_hash`e çevrilir.
///
/// Buradaki liste o temizliğin yerine geçmez, ÜSTÜNE gelir:
///
///   backend  → sır sızmasın                (güvenlik)
///   burada   → anlamsız veri gösterilmesin (netlik) + ikinci savunma
///
/// KURAL: BEYAZ LİSTE, kara liste değil. Kara liste yeni eklenen bir alanı
/// varsayılan olarak GÖSTERİR; beyaz liste varsayılan olarak GİZLER.
void main() {
  List<String> entries(List<MetadataEntry> list) =>
      list.map((MetadataEntry entry) => '${entry.label}=${entry.value}').toList();

  List<String> changes(List<ChangeEntry> list) => list
      .map((ChangeEntry change) => '${change.label}: ${change.from ?? '∅'} → ${change.to ?? '∅'}')
      .toList();

  group('visibleMetadata', () {
    test('bilinen anahtarları Türkçe etiketle döner', () {
      expect(
        entries(
          visibleMetadata(<String, dynamic>{
            'device_name': 'Ada MacBook',
            'was_current_device': false,
          }),
        ),
        <String>['Cihaz=Ada MacBook', 'Bu cihaz=Hayır'],
      );
    });

    test('rol değerini Türkçe etiketler', () {
      expect(entries(visibleMetadata(<String, dynamic>{'role': 'owner'})), <String>['Rol=Sahip']);
      expect(entries(visibleMetadata(<String, dynamic>{'role': 'member'})), <String>['Rol=Üye']);
    });

    test('mantıksal değerleri Evet/Hayır olarak yazar', () {
      expect(
        entries(visibleMetadata(<String, dynamic>{'created_new_account': true})),
        <String>['Yeni hesap oluşturuldu=Evet'],
      );
      expect(
        entries(visibleMetadata(<String, dynamic>{'verification_reset': true})),
        <String>['Doğrulama sıfırlandı=Evet'],
      );
    });

    test('sayısal değeri olduğu gibi yazar', () {
      expect(
        entries(visibleMetadata(<String, dynamic>{'other_logins_revoked': 3})),
        <String>['Kapatılan diğer oturum=3'],
      );
    });

    /// `email_hash` audit'te GERÇEKTEN vardır (davet, parola sıfırlama,
    /// başarısız giriş). Sızıntı değil — ama kullanıcıya gösterilecek bir
    /// şey de değil: 64 karakterlik bir sha256 hiçbir şey anlatmaz.
    test('email_hash göstermez', () {
      expect(
        entries(
          visibleMetadata(<String, dynamic>{
            'email_hash': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            'role': 'member',
          }),
        ),
        <String>['Rol=Üye'],
      );
    });

    /// Beyaz listenin asıl sınavı: yarın backend'e eklenecek bir anahtar
    /// bu arayüzde KENDİLİĞİNDEN görünmemeli.
    test('tanınmayan anahtarları göstermez', () {
      expect(
        entries(
          visibleMetadata(<String, dynamic>{'internal_ref': 'X-9912', 'queue': 'default'}),
        ),
        isEmpty,
      );
    });

    /// SAVUNMA AMAÇLI REGRESYON. Bu anahtarlar backend'de zaten düşürülüyor,
    /// yani buraya normalde hiç ulaşmazlar. Test yine de var: filtrenin tek
    /// bir yerde durması bilinçli bir tercih, ama arayüz o tercihe körü
    /// körüne güvenmemeli.
    test('hassas görünümlü anahtarları göstermez', () {
      expect(
        entries(
          visibleMetadata(<String, dynamic>{
            'password': 'gizli',
            'token': 'plain-token',
            'authorization': 'Bearer x',
            'secret': 's',
            'company_id': 4242,
          }),
        ),
        isEmpty,
      );
    });

    test('metadata yoksa boş liste döner', () {
      expect(visibleMetadata(null), isEmpty);
      expect(visibleMetadata(<String, dynamic>{}), isEmpty);
    });

    /// Sıra, sözlüğün rastgele anahtar sırasına değil beyaz listeye
    /// bağlıdır; aynı olay her seferinde aynı biçimde okunur.
    test('çıktıyı beyaz liste sırasına göre üretir', () {
      expect(
        entries(
          visibleMetadata(<String, dynamic>{
            'other_logins_revoked': 2,
            'role': 'member',
            'device_name': 'iPhone',
          }),
        ),
        <String>['Rol=Üye', 'Cihaz=iPhone', 'Kapatılan diğer oturum=2'],
      );
    });
  });

  /// old_values / new_values → insan okunur fark.
  ///
  /// Yalnızca kullanıcının ANLAYABİLECEĞİ alanlar gösterilir. `id`,
  /// `company_id`, `created_at`, `email_hash` gibi alanlar gürültüdür ve
  /// bazıları (company_id) zaten hiç gösterilmemeli.
  group('describeChanges', () {
    test('güvenli alanların eski → yeni farkını çıkarır', () {
      expect(
        changes(
          describeChanges(
            <String, dynamic>{'name': 'Zeynep Kaya', 'phone': '05551112233'},
            <String, dynamic>{'name': 'Zeynep Demir', 'phone': '05559998877'},
          ),
        ),
        <String>[
          'Ad: Zeynep Kaya → Zeynep Demir',
          'Telefon: 05551112233 → 05559998877',
        ],
      );
    });

    /// Oluşturma: eski değer YOKTUR. Boş tarafa "—" koyup sahte bir
    /// değişim iddiası kurulmaz.
    test('yalnızca yeni değer varsa eski tarafı boş bırakır', () {
      expect(
        changes(describeChanges(null, <String, dynamic>{'name': 'Zeynep Kaya'})),
        <String>['Ad: ∅ → Zeynep Kaya'],
      );
    });

    /// Silme: yeni değer YOKTUR.
    test('yalnızca eski değer varsa yeni tarafı boş bırakır', () {
      expect(
        changes(describeChanges(<String, dynamic>{'name': 'Zeynep Kaya'}, null)),
        <String>['Ad: Zeynep Kaya → ∅'],
      );
    });

    /// "Ad: Zeynep → Zeynep" satırı, gerçek değişikliği gözden kaçırtan
    /// bir gürültüdür.
    test('değişmemiş alanı listelemez', () {
      expect(
        changes(
          describeChanges(
            <String, dynamic>{'name': 'Zeynep Kaya', 'phone': '0555'},
            <String, dynamic>{'name': 'Zeynep Kaya', 'phone': '0666'},
          ),
        ),
        <String>['Telefon: 0555 → 0666'],
      );
    });

    test('rol değişimini Türkçe etiketlerle yazar', () {
      expect(
        changes(
          describeChanges(
            <String, dynamic>{'role': 'member'},
            <String, dynamic>{'role': 'owner'},
          ),
        ),
        <String>['Rol: Üye → Sahip'],
      );
    });

    /// REGRESYON: `company_id` ASLA gösterilmez. Kullanıcı zaten aktif
    /// şirkette; iç kimlik numarasını göstermek hem anlamsız hem de çok
    /// kiracılı bir sistemde gereksiz bir iç yapı sızıntısı.
    test('güvenli olmayan ve anlamsız alanları farka almaz', () {
      expect(
        describeChanges(
          <String, dynamic>{
            'id': 5,
            'company_id': 7,
            'email_hash': 'abc',
            'password': 'gizli',
            'created_at': '2026-08-01T00:00:00+00:00',
          },
          <String, dynamic>{
            'id': 5,
            'company_id': 7,
            'email_hash': 'def',
            'password': 'gizli2',
            'updated_at': '2026-08-02T00:00:00+00:00',
          },
        ),
        isEmpty,
      );
    });

    test('iki taraf da yoksa boş liste döner', () {
      expect(describeChanges(null, null), isEmpty);
    });

    test('çıktıyı beyaz liste sırasına göre üretir', () {
      expect(
        changes(
          describeChanges(null, <String, dynamic>{'phone': '0555', 'name': 'Zeynep'}),
        ),
        <String>['Ad: ∅ → Zeynep', 'Telefon: ∅ → 0555'],
      );
    });
  });

  /// Eylem etiketleri.
  ///
  /// Liste backend'in AuditAction enum'ından birebir alınmıştır (23 değer).
  /// DİKKAT: mobil tarafta bu liste daha önce backend'de HİÇ OLMAYAN
  /// kodlar içeriyordu ('auth.login', 'member.invited', 'company.created').
  /// Bu test o durumun geri gelmesini engeller.
  group('auditActionLabel', () {
    const List<String> backendActions = <String>[
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

    test('backend enum değerlerinin hepsini çevirir', () {
      final List<String> untranslated = backendActions
          .where((String action) => auditActionLabel(action) == action)
          .toList();

      expect(untranslated, isEmpty);
    });

    test('etiketleri beklenen metinlerle verir', () {
      expect(auditActionLabel('customer.created'), 'Müşteri oluşturuldu');
      expect(auditActionLabel('member.role_changed'), 'Üye rolü değiştirildi');
      expect(auditActionLabel('invitation.revoked'), 'Davet iptal edildi');
    });

    /// Tanınmayan kod UYDURULMAZ. Backend yeni bir eylem eklediğinde
    /// kullanıcı ham kodu görür — hiçbir şey görmemekten ya da yanlış bir
    /// metin görmekten iyidir.
    test('tanınmayan eylem kodunu ham hâliyle döner', () {
      expect(auditActionLabel('warehouse.exported'), 'warehouse.exported');
    });
  });

  group('formatDateTime', () {
    /// Biçim ortamdan bağımsız olmalı: Intl kullanılırsa Node/Dart'ın ICU
    /// derlemesine göre sessizce başka bir biçime düşebilir.
    test('okunur biçim üretir, ham ISO dizgesi döndürmez', () {
      final String? formatted = formatDateTime('2026-08-16T09:15:00Z');

      expect(formatted, isNotNull);
      expect(formatted, matches(RegExp(r'^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$')));
      expect(formatted, isNot(contains('T')));
    });

    test('boş ya da bozuk tarihte null döner', () {
      expect(formatDateTime(null), isNull);
      expect(formatDateTime('bozuk-tarih'), isNull);
    });
  });
}
