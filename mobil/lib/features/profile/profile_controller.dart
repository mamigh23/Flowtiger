import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../models/models.dart';

/// Kullanıcının KENDİ hesabı.
///
/// HİÇBİR METOT KULLANICI KİMLİĞİ ALMAZ. Ne yolda {user} vardır, ne
/// gövdede user_id. Üzerinde işlem yapılan kişi backend'de daima
/// oturumdan gelir; istemcinin de bir kimlik parametresi göndermeye
/// imkânı olmamalı.
///
/// MembershipService/MemberController ile karıştırılmamalı: orası bir
/// owner'ın BAŞKALARININ üyeliğini yönettiği yerdir ve parolaya asla
/// dokunmaz. İkisinin ayrı kalması güvenlik modelinin taşıyıcı duvarı:
/// şirket yönetimi yetkisi, hesap sahipliği yetkisi DEĞİLDİR.

enum ProfileStatus { loading, ready, error }

class ProfileState {
  const ProfileState({this.user, this.status = ProfileStatus.loading, this.error});

  final User? user;
  final ProfileStatus status;
  final Object? error;
}

/// Parola değiştirme yanıtı.
///
/// Parola ya da yeni bir token İÇERMEZ — yalnızca kaç oturumun
/// kapatıldığını söyler. Bu sayı, "hesabım ele geçirilmiş miydi"
/// sorusunu araştıran kullanıcı için tek anlamlı sinyaldir.
class PasswordChangeResult {
  const PasswordChangeResult({required this.message, required this.otherLoginsRevoked});

  factory PasswordChangeResult.fromJson(Map<String, dynamic> json) => PasswordChangeResult(
        message: json['message'] as String? ?? 'Parola güncellendi.',
        otherLoginsRevoked: json['other_logins_revoked'] as int? ?? 0,
      );

  final String message;
  final int otherLoginsRevoked;
}

/// Doğrulama bağlantısı isteme yanıtı.
///
/// `code` KARARIN KAYNAĞIDIR, `message` değil: backend metni bir gün
/// değişebilir (dil, noktalama, kelime) ve metin eşleştiren bir arayüz o
/// gün sessizce yanlış davranır.
class VerificationResult {
  const VerificationResult({required this.code, required this.message});

  factory VerificationResult.fromJson(Map<String, dynamic> json) => VerificationResult(
        code: json['code'] as String? ?? '',
        message: json['message'] as String? ?? '',
      );

  final String code;
  final String message;

  bool get alreadyVerified => code == 'already_verified';
}

class ProfileController extends StateNotifier<ProfileState> {
  ProfileController({required ApiClient api})
      : _api = api,
        super(const ProfileState());

  final ApiClient _api;

  /// Profil GET /profile'DAN okunur, oturumdaki kullanıcıdan DEĞİL.
  ///
  /// /me ile /profile aynı gövdeyi döndürür ama aynı şey değildir: /me
  /// kimlik sorgusu, /profile profil kaynağının kökü. Ekran kendi
  /// kaynağını okumazsa, başka bir cihazdan yapılmış bir değişiklik hiç
  /// görünmez.
  Future<void> load() async {
    state = const ProfileState();

    try {
      final Map<String, dynamic> payload = await _api.get<Map<String, dynamic>>('profile');
      state = ProfileState(user: User.fromJson(payload), status: ProfileStatus.ready);
    } on ApiException catch (error) {
      // 401'de token zaten silindi ve oturum düştü; burada ek iş yok.
      state = ProfileState(status: ProfileStatus.error, error: error);
    } on NetworkException catch (error) {
      state = ProfileState(status: ProfileStatus.error, error: error);
    }
  }

  /// PUT yanıtını duruma yazar.
  ///
  /// Yeniden GET yapılmaz: e-posta değiştiğinde backend
  /// `email_verified_at`'i null'a çeker ve bunu ZATEN bu yanıtta bildirir.
  /// İkinci bir istek, aynı bilgiyi bir kez daha sormak olurdu.
  void apply(User user) => state = ProfileState(user: user, status: ProfileStatus.ready);
}

final StateNotifierProvider<ProfileController, ProfileState> profileControllerProvider =
    StateNotifierProvider<ProfileController, ProfileState>(
  (Ref ref) => ProfileController(api: ref.watch(apiClientProvider)),
);

/// Yazma işlemleri.
///
/// GÖVDE SÖZLEŞMELERİ BURADA TEK YERDE DURUR:
///   PUT /profile          → { name, email }
///   PUT /profile/password → { current_password, new_password,
///                             new_password_confirmation }
///   POST verification-notification → GÖVDE YOK
///
/// `role`, `active_company_id`, `company_id`, `user_id` ve `password`
/// hiçbir yerde gönderilmez. Backend bunlar için `prohibited` kuralı
/// YAZMAMIŞTIR (422 dönmek "hangi alan adları tanınıyor" bilgisini
/// sızdırırdı), yani göndermemek arayüzün sorumluluğudur.
class ProfileRepository {
  const ProfileRepository(this._api);

  final ApiClient _api;

  Future<User> update({required String name, required String email}) async {
    final Map<String, dynamic> payload = await _api.put<Map<String, dynamic>>(
      'profile',
      body: <String, dynamic>{'name': name, 'email': email},
    );

    return User.fromJson(payload);
  }

  Future<PasswordChangeResult> changePassword({
    required String currentPassword,
    required String newPassword,
    required String newPasswordConfirmation,
  }) async {
    final Map<String, dynamic> payload = await _api.put<Map<String, dynamic>>(
      'profile/password',
      body: <String, dynamic>{
        'current_password': currentPassword,
        'new_password': newPassword,
        'new_password_confirmation': newPasswordConfirmation,
      },
    );

    return PasswordChangeResult.fromJson(payload);
  }

  /// GÖVDE GÖNDERİLMEZ.
  ///
  /// Hedef adres parametresi yoktur ve olmamalı: kullanıcı yalnızca KENDİ
  /// adresi için bağlantı ister. Başkasının adresini hedefleyen bir alan,
  /// "bu adres sistemde kayıtlı mı?" sorusunu herkese açık hâle getirirdi.
  Future<VerificationResult> sendVerificationLink() async {
    final Map<String, dynamic> payload =
        await _api.post<Map<String, dynamic>>('auth/email/verification-notification');

    return VerificationResult.fromJson(payload);
  }
}

final Provider<ProfileRepository> profileRepositoryProvider = Provider<ProfileRepository>(
  (Ref ref) => ProfileRepository(ref.watch(apiClientProvider)),
);
