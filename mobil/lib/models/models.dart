/// Backend sözleşmesinin Dart karşılığı.
///
/// Alan adları backend Resource sınıflarıyla birebir aynıdır. Foundation
/// aşamasında kod üretimi (freezed/json_serializable) kurulmadı: fazladan
/// build_runner adımı ve üretilmiş dosyalar, elle yazılmış birkaç
/// fromJson'dan daha pahalı olurdu. Model sayısı büyüdüğünde yeniden
/// değerlendirilmeli.
library;

enum Role {
  owner,
  member;

  static Role fromJson(String value) =>
      value == 'owner' ? Role.owner : Role.member;

  String get value => name;
}

class User {
  const User({
    required this.id,
    required this.name,
    required this.email,
    this.emailVerifiedAt,
    this.activeCompanyId,
  });

  factory User.fromJson(Map<String, dynamic> json) => User(
        id: json['id'] as int,
        name: json['name'] as String,
        email: json['email'] as String,
        emailVerifiedAt: json['email_verified_at'] as String?,
        activeCompanyId: json['active_company_id'] as int?,
      );

  final int id;
  final String name;
  final String email;
  final String? emailVerifiedAt;
  final int? activeCompanyId;

  bool get isEmailVerified => emailVerifiedAt != null;
}

class Company {
  const Company({required this.id, required this.name, this.role});

  factory Company.fromJson(Map<String, dynamic> json) => Company(
        id: json['id'] as int,
        name: json['name'] as String,
        role: json['role'] == null ? null : Role.fromJson(json['role'] as String),
      );

  final int id;
  final String name;

  /// Yalnızca üyelik listesinde döner.
  final Role? role;
}

class Customer {
  const Customer({
    required this.id,
    required this.customerNo,
    required this.name,
    this.phone,
    this.createdAt,
    this.updatedAt,
  });

  factory Customer.fromJson(Map<String, dynamic> json) => Customer(
        id: json['id'] as int,
        customerNo: json['customer_no'] as int,
        name: json['name'] as String,
        phone: json['phone'] as String?,
        createdAt: json['created_at'] as String?,
        updatedAt: json['updated_at'] as String?,
      );

  final int id;

  /// Kullanıcıya gösterilen numara. Şirket içinde artar; `id` DEĞİLDİR.
  final int customerNo;

  final String name;
  final String? phone;

  /// CustomerResource bu iki alanı da döndürür (ISO-8601). Detay ekranı
  /// için modelde; `company_id` resource'ta zaten YOK.
  final String? createdAt;
  final String? updatedAt;
}

class Member {
  const Member({
    required this.id,
    required this.name,
    required this.email,
    this.role,
    this.createdAt,
    this.updatedAt,
  });

  factory Member.fromJson(Map<String, dynamic> json) => Member(
        id: json['id'] as int,
        name: json['name'] as String,
        email: json['email'] as String,
        // Alan YOKSA null bırakılır; varsayım YAPILMAZ.
        role: json['role'] == null ? null : Role.fromJson(json['role'] as String),
        createdAt: json['created_at'] as String?,
        updatedAt: json['updated_at'] as String?,
      );

  final int id;
  final String name;
  final String email;

  /// Rol kullanıcının değil ÜYELİĞİN özelliğidir ve backend'de pivot'tan
  /// okunur. Pivot yüklenmemişse MemberResource bu alanı HİÇ döndürmez —
  /// bu yüzden nullable. 'member' varsaymak, kullanıcıya doğrulanmamış
  /// bir yetki bilgisi göstermek olurdu.
  final Role? role;

  final String? createdAt;
  final String? updatedAt;
}

enum InvitationStatus { pending, accepted, revoked, expired }

class Invitation {
  const Invitation({
    required this.id,
    required this.email,
    required this.role,
    required this.status,
    this.expiresAt,
    this.createdAt,
  });

  factory Invitation.fromJson(Map<String, dynamic> json) => Invitation(
        id: json['id'] as int,
        // Backend maskeli döndürür: "a***@example.com"
        email: json['email'] as String,
        role: Role.fromJson(json['role'] as String),
        status: InvitationStatus.values.firstWhere(
          (InvitationStatus status) => status.name == json['status'],
          orElse: () => InvitationStatus.pending,
        ),
        expiresAt: json['expires_at'] as String?,
        createdAt: json['created_at'] as String?,
      );

  final int id;
  final String email;
  final Role role;
  final InvitationStatus status;
  final String? expiresAt;
  final String? createdAt;
}

/// Denetim kaydının aktörü — TAM kullanıcı değil ÖZET.
///
/// Backend bilinçli olarak yalnızca id ve name gönderir: audit listesi,
/// kullanıcı verisini dolaylı yoldan dışarı sızdıran bir uç hâline
/// gelmemeli. E-POSTA ALANI YOKTUR ve burada da OKUNMAZ — yanıt bir gün
/// fazladan alan taşısa bile modele girmez.
class AuditActor {
  const AuditActor({required this.id, required this.name});

  factory AuditActor.fromJson(Map<String, dynamic> json) => AuditActor(
        id: json['id'] as int,
        name: json['name'] as String,
      );

  final int id;
  final String name;
}

/// Kaydın konusu: hangi nesneye ne yapıldı.
///
/// `type` sınıf yolu DEĞİL kısa addır ('customer', 'user'); kısaltmayı
/// backend yapar, iç sınıf yapısı API'ye sızmaz.
class AuditableRef {
  const AuditableRef({required this.type, required this.id});

  factory AuditableRef.fromJson(Map<String, dynamic> json) => AuditableRef(
        type: json['type'] as String,
        id: json['id'] as int,
      );

  final String type;
  final int id;
}

/// Denetim kaydı — AuditLogResource ile birebir.
///
/// Yanıtın TAM alan listesi (backend testiyle sabitlenmiş):
///   id, action, actor?, auditable?, old_values, new_values, metadata,
///   ip_address, created_at
///
/// `company_id` ve `user_agent` yanıtta HİÇ YOKTUR; bu yüzden modelde de
/// yok.
///
/// `actor` ve `auditable` KOŞULLU alanlardır ($this->when): aktörü olmayan
/// bir kayıtta anahtar hiç gelmez. Bu yüzden nullable — 'Sistem' gibi bir
/// varsayım yapmak, doğrulanmamış bilgi göstermek olurdu.
///
/// Üç sözlük (`metadata`, `old_values`, `new_values`) HAM hâlleriyle
/// taşınır ama ham hâlleriyle GÖSTERİLMEZ: gösterim beyaz listeden geçer
/// (features/audit/audit_format.dart).
class AuditLog {
  const AuditLog({
    required this.id,
    required this.action,
    this.actor,
    this.auditable,
    this.oldValues,
    this.newValues,
    this.metadata,
    this.ipAddress,
    this.createdAt,
  });

  factory AuditLog.fromJson(Map<String, dynamic> json) => AuditLog(
        id: json['id'] as int,
        action: json['action'] as String,
        actor: json['actor'] == null
            ? null
            : AuditActor.fromJson(json['actor'] as Map<String, dynamic>),
        auditable: json['auditable'] == null
            ? null
            : AuditableRef.fromJson(json['auditable'] as Map<String, dynamic>),
        oldValues: json['old_values'] as Map<String, dynamic>?,
        newValues: json['new_values'] as Map<String, dynamic>?,
        metadata: json['metadata'] as Map<String, dynamic>?,
        ipAddress: json['ip_address'] as String?,
        createdAt: json['created_at'] as String?,
      );

  final int id;

  /// Makine-okunur kod ('customer.created'). Kullanıcıya etiketi
  /// gösterilir; tanınmayan kod ham hâliyle kalır, uydurulmaz.
  final String action;

  final AuditActor? actor;
  final AuditableRef? auditable;

  final Map<String, dynamic>? oldValues;
  final Map<String, dynamic>? newValues;
  final Map<String, dynamic>? metadata;

  final String? ipAddress;
  final String? createdAt;
}

class Session {
  const Session({
    required this.id,
    required this.name,
    required this.current,
    this.lastUsedAt,
    this.createdAt,
  });

  factory Session.fromJson(Map<String, dynamic> json) => Session(
        id: json['id'] as int,
        name: json['name'] as String,
        current: json['current'] as bool? ?? false,
        lastUsedAt: json['last_used_at'] as String?,
        createdAt: json['created_at'] as String?,
      );

  final int id;
  final String name;
  final bool current;
  final String? lastUsedAt;
  final String? createdAt;
}

/// POST /auth/login yanıtı.
class LoginResult {
  const LoginResult({required this.token, required this.user});

  factory LoginResult.fromJson(Map<String, dynamic> json) => LoginResult(
        token: json['token'] as String,
        user: User.fromJson(json['user'] as Map<String, dynamic>),
      );

  final String token;
  final User user;
}
