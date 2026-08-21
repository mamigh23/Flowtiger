import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../models/models.dart';

/// Ekip listesi durumu.
///
/// Arama/sıralama/filtre YOK: uçta böyle bir parametre yok.
/// per_page gönderilmez; backend'in kendi varsayılanı (15) kullanılır.
enum MemberListStatus { loading, ready, error }

class MemberListState {
  const MemberListState({
    this.members = const <Member>[],
    this.status = MemberListStatus.loading,
    this.currentPage = 1,
    this.lastPage = 1,
    this.total = 0,
    this.error,
  });

  final List<Member> members;
  final MemberListStatus status;
  final int currentPage;
  final int lastPage;
  final int total;
  final Object? error;

  bool get isEmpty => status == MemberListStatus.ready && members.isEmpty;
  bool get hasPreviousPage => currentPage > 1;
  bool get hasNextPage => currentPage < lastPage;
}

class MemberListController extends StateNotifier<MemberListState> {
  MemberListController({required ApiClient api})
      : _api = api,
        super(const MemberListState());

  final ApiClient _api;

  Future<void> load({int page = 1}) async {
    state = MemberListState(status: MemberListStatus.loading, currentPage: page);

    try {
      final Map<String, dynamic> payload = await _api.getRaw(
        'members',
        query: <String, String>{'page': '$page'},
      );

      final List<Member> members = (payload['data'] as List<dynamic>? ?? <dynamic>[])
          .map((dynamic item) => Member.fromJson(item as Map<String, dynamic>))
          .toList();

      final Map<String, dynamic> meta =
          payload['meta'] as Map<String, dynamic>? ?? <String, dynamic>{};

      state = MemberListState(
        members: members,
        status: MemberListStatus.ready,
        currentPage: meta['current_page'] as int? ?? page,
        lastPage: meta['last_page'] as int? ?? 1,
        total: meta['total'] as int? ?? members.length,
      );
    } on ApiException catch (error) {
      // 401'de token zaten silindi ve oturum düştü; burada ek iş yok.
      state = MemberListState(status: MemberListStatus.error, error: error, currentPage: page);
    } on NetworkException catch (error) {
      state = MemberListState(status: MemberListStatus.error, error: error, currentPage: page);
    }
  }

  Future<void> nextPage() => load(page: state.currentPage + 1);

  Future<void> previousPage() => load(page: state.currentPage - 1);

  Future<void> reload() => load(page: state.currentPage);
}

final StateNotifierProvider<MemberListController, MemberListState>
    memberListControllerProvider =
    StateNotifierProvider<MemberListController, MemberListState>(
  (Ref ref) => MemberListController(api: ref.watch(apiClientProvider)),
);

/// Tek üye işlemleri.
///
/// GÖVDE SÖZLEŞMELERİ:
///   güncelleme → PUT   /members/{id}       { name, email }
///   rol        → PATCH /members/{id}/role  { role }
///
/// İkisi AYRI. Backend bunu bilinçli ayırmış: rol kaydın en tehlikeli
/// özniteliği ve kazara başka bir güncellemenin içine karışmamalı. Bu
/// yüzden düzenleme gövdesinde rol YOKTUR.
///
/// Yeni üye oluşturma (POST /members) burada YOK: owner'ın başkasının
/// parolasını belirlemesini gerektiriyor ve davet akışıyla çakışıyor.
class MemberRepository {
  const MemberRepository(this._api);

  final ApiClient _api;

  Future<Member> find(int id) async {
    final Map<String, dynamic> payload =
        await _api.get<Map<String, dynamic>>('members/$id');

    return Member.fromJson(payload);
  }

  Future<Member> update(int id, {required String name, required String email}) async {
    final Map<String, dynamic> payload = await _api.put<Map<String, dynamic>>(
      'members/$id',
      body: <String, dynamic>{'name': name, 'email': email},
    );

    return Member.fromJson(payload);
  }

  Future<Member> changeRole(int id, Role role) async {
    final Map<String, dynamic> payload = await _api.patch<Map<String, dynamic>>(
      'members/$id/role',
      body: <String, dynamic>{'role': role.value},
    );

    return Member.fromJson(payload);
  }

  Future<void> remove(int id) => _api.delete('members/$id');
}

final Provider<MemberRepository> memberRepositoryProvider = Provider<MemberRepository>(
  (Ref ref) => MemberRepository(ref.watch(apiClientProvider)),
);
