import 'dart:async';
import 'dart:convert';

import 'package:flowtiger/core/network/api_client.dart';
import 'package:flowtiger/core/network/api_exception.dart';
import 'package:flowtiger/core/providers.dart';
import 'package:flowtiger/core/storage/token_storage.dart';
import 'package:flowtiger/features/auth/auth_controller.dart';
import 'package:flowtiger/features/companies/company_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'harness.dart';

// Responses are released explicitly, never by timers or real network calls.
class PendingRequest {
  PendingRequest(this.request);
  final http.Request request;
  final Completer<http.Response> response = Completer<http.Response>();

  void reply(int status, [Object? body]) => response.complete(
        http.Response(
          body == null ? '' : jsonEncode(body),
          status,
          headers: <String, String>{'content-type': 'application/json'},
        ),
      );
}

class ControlledServer {
  final StreamController<PendingRequest> requests = StreamController<PendingRequest>();
  late final StreamIterator<PendingRequest> iterator =
      StreamIterator<PendingRequest>(requests.stream);

  Future<http.Response> send(http.Request request) {
    final PendingRequest pending = PendingRequest(request);
    requests.add(pending);
    return pending.response.future;
  }

  Future<PendingRequest> next(String path) async {
    expect(await iterator.moveNext(), isTrue);
    expect(iterator.current.request.url.path, endsWith(path));
    return iterator.current;
  }

  Future<void> close() async {
    await iterator.cancel();
    await requests.close();
  }
}

class GatedStorage extends InMemoryTokenStorage {
  Completer<void>? writeGate;
  Completer<void>? clearGate;
  final Completer<void> writing = Completer<void>();
  final Completer<void> clearing = Completer<void>();

  @override
  Future<void> write(String token) async {
    if (writeGate != null) {
      if (!writing.isCompleted) writing.complete();
      await writeGate!.future;
    }
    await super.write(token);
  }

  @override
  Future<void> clear() async {
    if (clearGate != null) {
      if (!clearing.isCompleted) clearing.complete();
      await clearGate!.future;
    }
    await super.clear();
  }
}

class RaceHarness {
  RaceHarness(this.storage) {
    container = ProviderContainer(
      overrides: <Override>[
        appConfigProvider.overrideWithValue(testConfig),
        tokenStorageProvider.overrideWithValue(storage),
        httpClientProvider.overrideWithValue(MockClient(server.send)),
      ],
    );
    addTearDown(() async {
      if (!disposed) container.dispose();
      await server.close();
    });
  }
  final TokenStorage storage;
  final ControlledServer server = ControlledServer();
  late final ProviderContainer container;
  bool disposed = false;
  AuthController get auth => container.read(authControllerProvider.notifier);
  AuthState get state => container.read(authControllerProvider);
  ApiClient get api => container.read(apiClientProvider);
  CompanyController get companies => container.read(companyControllerProvider.notifier);
  CompanyState get companyState => container.read(companyControllerProvider);

  Future<void> login([int id = 2]) => auth.login(email: '$id@test.invalid', password: 'test-only');

  Future<void> signIn([int id = 2]) async {
    final Future<void> work = login(id);
    (await server.next('auth/login')).reply(200, loginPayload(id));
    await work;
  }

  void dispose() {
    container.dispose();
    disposed = true;
  }
}

Map<String, Object?> loginPayload(int id) => <String, Object?>{
      'data': <String, Object?>{
        'token': 'token-$id',
        'user': <String, Object?>{'id': id, 'name': 'User $id', 'email': '$id@test.invalid'},
      },
    };

Map<String, Object?> companyPayload(int active) => <String, Object?>{
      'data': <Object?>[companyFixture(), companyFixture(id: 9)],
      'meta': <String, Object?>{'active_company_id': active},
    };

void main() {
  Future<RaceHarness> seeded() async {
    final InMemoryTokenStorage storage = InMemoryTokenStorage();
    await storage.write('old-token');
    return RaceHarness(storage);
  }

  for (final int status in <int>[200, 401, 500]) {
    test('late bootstrap $status cannot replace a newer login', () async {
      final RaceHarness h = await seeded();
      final Future<void> restore = h.auth.restoreSession();
      final PendingRequest old = await h.server.next('me');
      await h.signIn();
      old.reply(status, <String, Object?>{'data': userFixture()});
      await restore;
      expect(h.state.user?.id, 2);
      expect(await h.storage.read(), 'token-2');
    });
  }

  test('late bootstrap success cannot restore a logged out user', () async {
    final RaceHarness h = await seeded();
    final Future<void> restore = h.auth.restoreSession();
    final PendingRequest me = await h.server.next('me');
    final Future<void> logout = h.auth.logout();
    final PendingRequest exit = await h.server.next('auth/logout');
    me.reply(200, <String, Object?>{'data': userFixture()});
    exit.reply(204);
    await Future.wait(<Future<void>>[restore, logout]);
    expect(h.state.status, AuthStatus.unauthenticated);
    expect(await h.storage.read(), isNull);
  });

  test('latest bootstrap wins over an older failure', () async {
    final RaceHarness h = await seeded();
    final Future<void> first = h.auth.restoreSession();
    final PendingRequest older = await h.server.next('me');
    final Future<void> second = h.auth.restoreSession();
    (await h.server.next('me')).reply(200, <String, Object?>{'data': userFixture()});
    await second;
    older.reply(500);
    await first;
    expect(h.state.isAuthenticated, isTrue);
    expect(await h.storage.read(), 'old-token');
  });

  test('latest login wins when responses arrive in reverse order', () async {
    final RaceHarness h = RaceHarness(InMemoryTokenStorage());
    final Future<void> first = h.login(1);
    final PendingRequest old = await h.server.next('auth/login');
    await h.signIn(2);
    old.reply(200, loginPayload(1));
    await first;
    expect(h.state.user?.id, 2);
    expect(await h.storage.read(), 'token-2');
  });

  test('pending login cannot reauthenticate after logout', () async {
    final RaceHarness h = RaceHarness(InMemoryTokenStorage());
    final Future<void> login = h.login();
    final PendingRequest pending = await h.server.next('auth/login');
    await h.auth.logout();
    pending.reply(200, loginPayload(2));
    await login;
    expect(h.state.status, AuthStatus.unauthenticated);
    expect(await h.storage.read(), isNull);
  });

  for (final int status in <int>[204, 401, 500]) {
    test('late logout $status leaves a new token and user intact', () async {
      final RaceHarness h = await seeded();
      final Future<void> logout = h.auth.logout();
      final PendingRequest exit = await h.server.next('auth/logout');
      expect(exit.request.headers['Authorization'], 'Bearer old-token');
      expect(h.state.status, AuthStatus.unauthenticated);
      expect(await h.storage.read(), isNull);
      await h.signIn();
      exit.reply(status);
      await logout;
      expect(h.state.user?.id, 2);
      expect(await h.storage.read(), 'token-2');
    });
  }

  test('failed login during logout does not undo local logout', () async {
    final RaceHarness h = await seeded();
    final Future<void> logout = h.auth.logout();
    final PendingRequest exit = await h.server.next('auth/logout');
    final Future<void> login = h.login();
    final Future<void> rejected = expectLater(login, throwsA(isA<ApiException>()));
    (await h.server.next('auth/login')).reply(401);
    await rejected;
    exit.reply(500);
    await logout;
    expect(h.state.status, AuthStatus.unauthenticated);
    expect(await h.storage.read(), isNull);
  });

  test('old authenticated request 401 cannot expire a new login', () async {
    final RaceHarness h = await seeded();
    final Future<void> request = h.api.get<void>('customers');
    final Future<void> rejected = expectLater(request, throwsA(isA<ApiException>()));
    final PendingRequest old = await h.server.next('customers');
    await h.signIn();
    old.reply(401);
    await rejected;
    expect(h.state.user?.id, 2);
    expect(await h.storage.read(), 'token-2');
  });

  test('current token 401 clears token and auth without a widget listener', () async {
    final RaceHarness h = RaceHarness(InMemoryTokenStorage());
    await h.signIn();
    final Future<void> request = h.api.get<void>('customers');
    final Future<void> rejected = expectLater(request, throwsA(isA<ApiException>()));
    (await h.server.next('customers')).reply(401);
    await rejected;
    expect(h.state.status, AuthStatus.unauthenticated);
    expect(await h.storage.read(), isNull);
  });

  test('expired old token does not cancel a pending explicit login', () async {
    final RaceHarness h = await seeded();
    final Future<void> request = h.api.get<void>('customers');
    final Future<void> rejected = expectLater(request, throwsA(isA<ApiException>()));
    final PendingRequest old = await h.server.next('customers');
    final Future<void> login = h.login(2);
    final PendingRequest pending = await h.server.next('auth/login');
    old.reply(401);
    await rejected;
    expect(await h.storage.read(), isNull);
    pending.reply(200, loginPayload(2));
    await login;
    expect(h.state.user?.id, 2);
    expect(await h.storage.read(), 'token-2');
  });

  test('unauthenticated login 401 does not expire an existing session', () async {
    final RaceHarness h = RaceHarness(InMemoryTokenStorage());
    await h.signIn(1);
    final Future<void> login = h.login(2);
    final Future<void> rejected = expectLater(login, throwsA(isA<ApiException>()));
    (await h.server.next('auth/login')).reply(401);
    await rejected;
    expect(h.state.user?.id, 1);
    expect(await h.storage.read(), 'token-1');
  });

  test('logout and new login survive a delayed secure-storage write', () async {
    final GatedStorage storage = GatedStorage()..writeGate = Completer<void>();
    final RaceHarness h = RaceHarness(storage);
    final Future<void> first = h.login(1);
    (await h.server.next('auth/login')).reply(200, loginPayload(1));
    await storage.writing.future;
    final Future<void> logout = h.auth.logout();
    final Future<void> second = h.login(2);
    (await h.server.next('auth/login')).reply(200, loginPayload(2));
    storage.writeGate!.complete();
    await Future.wait(<Future<void>>[first, logout, second]);
    expect(h.state.user?.id, 2);
    expect(await storage.read(), 'token-2');
  });

  test('slow 401 clear finishes before a new secure-storage write', () async {
    final GatedStorage storage = GatedStorage();
    final RaceHarness h = RaceHarness(storage);
    await h.signIn(1);
    storage.clearGate = Completer<void>();
    final Future<void> request = h.api.get<void>('customers');
    final Future<void> rejected = expectLater(request, throwsA(isA<ApiException>()));
    (await h.server.next('customers')).reply(401);
    await storage.clearing.future;
    final Future<void> login = h.login(2);
    (await h.server.next('auth/login')).reply(200, loginPayload(2));
    storage.clearGate!.complete();
    await Future.wait(<Future<void>>[rejected, login]);
    expect(h.state.user?.id, 2);
    expect(await storage.read(), 'token-2');
  });

  test('disposed controller does not persist a pending login', () async {
    final RaceHarness h = RaceHarness(InMemoryTokenStorage());
    final Future<void> login = h.login();
    final PendingRequest pending = await h.server.next('auth/login');
    h.dispose();
    pending.reply(200, loginPayload(2));
    await login;
    expect(await h.storage.read(), isNull);
  });

  for (final int status in <int>[200, 500, 401]) {
    test('company reset ignores delayed load $status', () async {
      final RaceHarness h = await seeded();
      final Future<void> load = h.companies.load();
      final PendingRequest pending = await h.server.next('companies');
      h.companies.reset();
      pending.reply(status, companyPayload(7));
      await load;
      expect(h.companyState.status, CompanyStatus.idle);
      expect(h.companyState.companies, isEmpty);
      expect(h.companyState.activeCompanyId, isNull);
    });
  }

  test('company load started last wins', () async {
    final RaceHarness h = await seeded();
    final Future<void> first = h.companies.load();
    final PendingRequest old = await h.server.next('companies');
    final Future<void> second = h.companies.load();
    (await h.server.next('companies')).reply(200, companyPayload(9));
    await second;
    old.reply(200, companyPayload(7));
    await first;
    expect(h.companyState.activeCompanyId, 9);
  });

  test('company reset ignores a delayed select', () async {
    final RaceHarness h = await seeded();
    final Future<void> select = h.companies.select(9);
    final PendingRequest pending = await h.server.next('companies/9/select');
    h.companies.reset();
    pending.reply(200, <String, Object?>{'data': companyFixture(id: 9)});
    await select;
    expect(h.companyState.status, CompanyStatus.idle);
    expect(h.companyState.activeCompanyId, isNull);
    expect(h.companyState.selectingId, isNull);
  });

  test('only one company selection is sent at a time', () async {
    final RaceHarness h = await seeded();
    final Future<void> first = h.companies.select(9);
    final PendingRequest pending = await h.server.next('companies/9/select');
    await h.companies.select(7);
    await h.companies.load();
    expect(h.companyState.selectingId, 9);
    pending.reply(200, <String, Object?>{'data': companyFixture(id: 9)});
    await first;
    expect(h.companyState.activeCompanyId, 9);
  });

  test('auth transition invalidates pending company data without UI listeners', () async {
    final RaceHarness h = RaceHarness(InMemoryTokenStorage());
    await h.signIn(1);
    final Future<void> load = h.companies.load();
    final PendingRequest old = await h.server.next('companies');
    await h.signIn(2);
    old.reply(200, companyPayload(7));
    await load;
    expect(h.companyState.status, CompanyStatus.idle);
    expect(h.companyState.companies, isEmpty);
  });
}
