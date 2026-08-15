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
  });

  factory Customer.fromJson(Map<String, dynamic> json) => Customer(
        id: json['id'] as int,
        customerNo: json['customer_no'] as int,
        name: json['name'] as String,
        phone: json['phone'] as String?,
      );

  final int id;
  final int customerNo;
  final String name;
  final String? phone;
}

class Member {
  const Member({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
  });

  factory Member.fromJson(Map<String, dynamic> json) => Member(
        id: json['id'] as int,
        name: json['name'] as String,
        email: json['email'] as String,
        role: Role.fromJson(json['role'] as String),
      );

  final int id;
  final String name;
  final String email;
  final Role role;
}

enum InvitationStatus { pending, accepted, revoked, expired }

class Invitation {
  const Invitation({
    required this.id,
    required this.email,
    required this.role,
    required this.status,
    this.expiresAt,
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
      );

  final int id;
  final String email;
  final Role role;
  final InvitationStatus status;
  final String? expiresAt;
}

class AuditLog {
  const AuditLog({
    required this.id,
    required this.action,
    this.ipAddress,
    this.createdAt,
  });

  factory AuditLog.fromJson(Map<String, dynamic> json) => AuditLog(
        id: json['id'] as int,
        action: json['action'] as String,
        ipAddress: json['ip_address'] as String?,
        createdAt: json['created_at'] as String?,
      );

  final int id;
  final String action;
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
