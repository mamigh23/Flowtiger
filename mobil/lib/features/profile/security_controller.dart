
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../models/models.dart';

enum SessionsStatus { loading, ready, error }

class SessionsState {
  const SessionsState({
    this.sessions = const <Session>[],
    this.status = SessionsStatus.loading,
    this.error,
    this.revokingId,
    this.revokingOthers = false,
  });

  final List<Session> sessions;
  final SessionsStatus status;
  final Object? error;
  final int? revokingId;
  final bool revokingOthers;

  SessionsState copyWith({
    List<Session>? sessions,
    SessionsStatus? status,
    Object? error = _unset,
    Object? revokingId = _unset,
    bool? revokingOthers,
  }) {
    return SessionsState(
      sessions: sessions ?? this.sessions,
      status: status ?? this.status,
      error: identical(error, _unset) ? this.error : error,
      revokingId: identical(revokingId, _unset) ? this.revokingId : revokingId as int?,
      revokingOthers: revokingOthers ?? this.revokingOthers,
    );
  }
}

const Object _unset = Object();

class SessionsController extends StateNotifier<SessionsState> {
  SessionsController({required ApiClient api})
      : _api = api,
        super(const SessionsState());

  final ApiClient _api;

  Future<void> load() async {
    state = SessionsState(
      sessions: state.sessions,
      status: SessionsStatus.loading,
      error: null,
    );

    try {
      final List<dynamic> payload = await _api.get<List<dynamic>>('profile/sessions');
      final List<Session> sessions = payload
          .map((dynamic item) => Session.fromJson(item as Map<String, dynamic>))
          .toList();

      state = SessionsState(
        sessions: sessions,
        status: SessionsStatus.ready,
      );
    } on ApiException catch (error) {
      state = SessionsState(
        sessions: state.sessions,
        status: SessionsStatus.error,
        error: error,
      );
    } on NetworkException catch (error) {
      state = SessionsState(
        sessions: state.sessions,
        status: SessionsStatus.error,
        error: error,
      );
    }
  }

  Future<void> revokeSession(int id) async {
    state = state.copyWith(error: null, revokingId: id);

    try {
      await _api.delete('profile/sessions/$id');
      await load();
    } on ApiException catch (error) {
      state = state.copyWith(error: error);
    } on NetworkException catch (error) {
      state = state.copyWith(error: error);
    } finally {
      state = state.copyWith(revokingId: null);
    }
  }

  Future<void> revokeOthers() async {
    state = state.copyWith(error: null, revokingOthers: true);

    try {
      await _api.delete('profile/sessions/others');
      await load();
    } on ApiException catch (error) {
      state = state.copyWith(error: error);
    } on NetworkException catch (error) {
      state = state.copyWith(error: error);
    } finally {
      state = state.copyWith(revokingOthers: false);
    }
  }
}

final StateNotifierProvider<SessionsController, SessionsState> sessionsControllerProvider =
    StateNotifierProvider<SessionsController, SessionsState>(
  (Ref ref) => SessionsController(api: ref.watch(apiClientProvider)),
);

enum SecurityEventsStatus { loading, ready, error }

class SecurityEventsState {
  const SecurityEventsState({
    this.events = const <SecurityEvent>[],
    this.status = SecurityEventsStatus.loading,
    this.currentPage = 1,
    this.lastPage = 1,
    this.total = 0,
    this.error,
  });

  final List<SecurityEvent> events;
  final SecurityEventsStatus status;
  final int currentPage;
  final int lastPage;
  final int total;
  final Object? error;

  bool get hasPreviousPage => currentPage > 1;
  bool get hasNextPage => currentPage < lastPage;
}

class SecurityEventsController extends StateNotifier<SecurityEventsState> {
  SecurityEventsController({required ApiClient api})
      : _api = api,
        super(const SecurityEventsState());

  final ApiClient _api;

  Future<void> load({int page = 1}) async {
    state = SecurityEventsState(
      events: state.events,
      status: SecurityEventsStatus.loading,
      currentPage: page,
    );

    try {
      final Map<String, dynamic> payload = await _api.getRaw(
        'profile/security-events',
        query: <String, String>{'page': '${page}'},
      );

      final List<SecurityEvent> events =
          (payload['data'] as List<dynamic>? ?? <dynamic>[])
              .map((dynamic item) => SecurityEvent.fromJson(item as Map<String, dynamic>))
              .toList();

      final Map<String, dynamic> meta =
          payload['meta'] as Map<String, dynamic>? ?? <String, dynamic>{};

      state = SecurityEventsState(
        events: events,
        status: SecurityEventsStatus.ready,
        currentPage: meta['current_page'] as int? ?? page,
        lastPage: meta['last_page'] as int? ?? 1,
        total: meta['total'] as int? ?? events.length,
      );
    } on ApiException catch (error) {
      state = SecurityEventsState(
        events: state.events,
        status: SecurityEventsStatus.error,
        currentPage: page,
        error: error,
      );
    } on NetworkException catch (error) {
      state = SecurityEventsState(
        events: state.events,
        status: SecurityEventsStatus.error,
        currentPage: page,
        error: error,
      );
    }
  }

  Future<void> nextPage() {
    if (!state.hasNextPage) return Future<void>.value();
    return load(page: state.currentPage + 1);
  }

  Future<void> previousPage() {
    if (!state.hasPreviousPage) return Future<void>.value();
    return load(page: state.currentPage - 1);
  }

  Future<void> reload() => load(page: state.currentPage);
}

final StateNotifierProvider<SecurityEventsController, SecurityEventsState>
    securityEventsControllerProvider =
    StateNotifierProvider<SecurityEventsController, SecurityEventsState>(
  (Ref ref) => SecurityEventsController(api: ref.watch(apiClientProvider)),
);
