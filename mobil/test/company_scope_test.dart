import 'dart:async';

import 'package:flowtiger/features/audit/audit_controller.dart';
import 'package:flowtiger/features/auth/auth_controller.dart';
import 'package:flowtiger/features/companies/company_controller.dart';
import 'package:flowtiger/features/customers/customer_controller.dart';
import 'package:flowtiger/features/customers/customer_detail_screen.dart';
import 'package:flowtiger/features/dashboard/dashboard_controller.dart';
import 'package:flowtiger/features/invitations/invitation_controller.dart';
import 'package:flowtiger/features/profile/profile_controller.dart';
import 'package:flowtiger/features/team/member_controller.dart';
import 'package:flowtiger/core/storage/token_storage.dart';
import 'package:flowtiger/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'harness.dart';
import 'session_race_test.dart' show RaceHarness, PendingRequest, companyPayload, loginPayload;

enum Module { customers, members, invitations, audit, profile }

Future<void> load(RaceHarness h, Module module) => switch (module) {
      Module.customers => h.container.read(customerListControllerProvider.notifier).load(),
      Module.members => h.container.read(memberListControllerProvider.notifier).load(),
      Module.invitations => h.container.read(invitationListControllerProvider.notifier).load(),
      Module.audit => h.container.read(auditListControllerProvider.notifier).load(),
      Module.profile => h.container.read(profileControllerProvider.notifier).load(),
    };

String path(Module module) => module == Module.audit ? 'audit-logs' : module.name;

Object payload(Module module, int id) => module == Module.profile
    ? <String, Object?>{
        'data': <String, Object?>{...userFixture(), 'id': id},
      }
    : paginated(
        <Map<String, dynamic>>[
          switch (module) {
            Module.customers => customerFixture(id: id),
            Module.members => memberFixture(id: id),
            Module.invitations => invitationFixture(id: id),
            Module.audit => auditLogFixture(id: id),
            Module.profile => throw StateError('profile uses a single resource'),
          },
        ],
        1,
      );

List<int> ids(RaceHarness h, Module module) => switch (module) {
      Module.customers =>
        h.container.read(customerListControllerProvider).customers.map((c) => c.id).toList(),
      Module.members =>
        h.container.read(memberListControllerProvider).members.map((c) => c.id).toList(),
      Module.invitations =>
        h.container.read(invitationListControllerProvider).invitations.map((c) => c.id).toList(),
      Module.audit => h.container.read(auditListControllerProvider).logs.map((c) => c.id).toList(),
      Module.profile => <int>[
          if (h.container.read(profileControllerProvider).user case final user?) user.id,
        ],
    };

Future<RaceHarness> setup() async {
  final RaceHarness h = RaceHarness(InMemoryTokenStorage());
  await h.signIn(1);
  final Future<void> work = h.companies.load();
  (await h.server.next('companies')).reply(200, companyPayload(7));
  await work;
  return h;
}

Future<void> switchCompany(RaceHarness h) async {
  final Future<void> select = h.companies.select(9);
  (await h.server.next('companies/9/select'))
      .reply(200, <String, Object?>{'data': companyFixture(id: 9)});
  await select;
}

void main() {
  testWidgets('failed company switch keeps the current company and displays its error', (WidgetTester tester) async {
    await tester.pumpWidget(appWith(
      storage: await signedInStorage(),
      handler: routes(<String, ApiRoute>{
        '/me': (_) => jsonResponse(200, <String, Object?>{'data': userFixture()}),
        '/companies/9/select': (_) => jsonResponse(403, <String, Object?>{'message': 'Şirket geçişi reddedildi.'}),
        '/companies': (_) => jsonResponse(200, companyPayload(7)),
        '/customers': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        '/members': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
        '/audit-logs': (_) => jsonResponse(200, paginated(<Map<String, dynamic>>[], 0)),
      }),
    ),);
    await settle(tester);
    final ProviderContainer container = ProviderScope.containerOf(tester.element(find.byType(FlowTigerApp)));
    unawaited(container.read(companyControllerProvider.notifier).select(9));
    await settle(tester);
    expect(container.read(companyControllerProvider).activeCompanyId, 7);
    expect(find.text('Şirket geçişi reddedildi.'), findsOneWidget);
    expect(find.text('Müşteriler'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('old profile save cannot fill the next account cache before its route is removed',
      (WidgetTester tester) async {
    final Completer<http.Response> saved = Completer<http.Response>();
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        asyncHandler: (http.Request request) async {
          if (request.url.path.endsWith('/auth/login')) return jsonResponse(200, loginPayload(2));
          if (request.url.path.endsWith('/me') || request.url.path.endsWith('/profile')) {
            if (request.method == 'PUT') return saved.future;
            return jsonResponse(200, <String, Object?>{'data': userFixture()});
          }
          if (request.url.path.endsWith('/companies')) return jsonResponse(200, companyPayload(7));
          return jsonResponse(200, paginated(<Map<String, dynamic>>[], 0));
        },
      ),
    );
    await settle(tester);
    await tester.tap(find.text('Profil'));
    await settle(tester);
    await tester.tap(find.text('Hesap bilgileri'));
    await settle(tester, advance: const Duration(milliseconds: 50));
    await tester.tap(find.widgetWithText(FilledButton, 'Kaydet'));
    await settle(tester);
    final ProviderContainer container =
        ProviderScope.containerOf(tester.element(find.byType(FlowTigerApp)));
    await container
        .read(authControllerProvider.notifier)
        .login(email: '2@test.invalid', password: 'test-only');
    saved.complete(jsonResponse(200, <String, Object?>{'data': userFixture()}));
    await settle(tester, advance: const Duration(milliseconds: 50));
    expect(container.read(profileControllerProvider).user, isNull);
    expect(container.read(authControllerProvider).user?.id, 2);
    expect(find.widgetWithText(FilledButton, 'Kaydet'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  for (final Module module in Module.values) {
    test('${module.name}: ready data clears when company selection starts and on logout', () async {
      final RaceHarness h = await setup();
      final Future<void> work = load(h, module);
      (await h.server.next(path(module))).reply(200, payload(module, 11));
      await work;
      expect(ids(h, module), <int>[11]);
      final Future<void> select = h.companies.select(9);
      final PendingRequest pending = await h.server.next('companies/9/select');
      expect(ids(h, module), isEmpty);
      pending.reply(200, <String, Object?>{'data': companyFixture(id: 9)});
      await select;
      final Future<void> second = load(h, module);
      (await h.server.next(path(module))).reply(200, payload(module, 22));
      await second;
      expect(ids(h, module), <int>[22]);
      final Future<void> logout = h.auth.logout();
      final PendingRequest exit = await h.server.next('auth/logout');
      expect(ids(h, module), isEmpty);
      exit.reply(204);
      await logout;
    });

    for (final int status in <int>[200, 403, 500, 0]) {
      test('${module.name}: old $status response cannot overwrite new company data', () async {
        final RaceHarness h = await setup();
        final Future<void> first = load(h, module);
        final PendingRequest old = await h.server.next(path(module));
        await switchCompany(h);
        final Future<void> second = load(h, module);
        (await h.server.next(path(module))).reply(200, payload(module, 22));
        await second;
        if (status == 0) {
          old.response.completeError(http.ClientException('test disconnect'));
        } else {
          old.reply(status, payload(module, 11));
        }
        await first;
        expect(ids(h, module), <int>[22]);
      });
    }

    test('${module.name}: same-account relogin invalidates a pending old response', () async {
      final RaceHarness h = await setup();
      final Future<void> first = load(h, module);
      final PendingRequest old = await h.server.next(path(module));
      await h.signIn(1);
      old.reply(200, payload(module, 11));
      await first;
      expect(ids(h, module), isEmpty);
    });
  }

  test('all dashboard panels ignore success/error from a previous company', () async {
    final RaceHarness h = await setup();
    final DashboardController dashboard = h.container.read(dashboardControllerProvider.notifier);
    final Future<void> first = dashboard.load();
    final PendingRequest customers = await h.server.next('customers');
    final PendingRequest members = await h.server.next('members');
    final PendingRequest audit = await h.server.next('audit-logs');
    await switchCompany(h);
    final Future<void> second = dashboard.load();
    (await h.server.next('customers')).reply(200, paginated(<Map<String, dynamic>>[], 22));
    (await h.server.next('members')).reply(200, paginated(<Map<String, dynamic>>[], 33));
    (await h.server.next('audit-logs'))
        .reply(200, paginated(<Map<String, dynamic>>[auditLogFixture(id: 44)], 1));
    await second;
    customers.reply(200, paginated(<Map<String, dynamic>>[], 11));
    members.reply(403);
    audit.response.completeError(http.ClientException('test disconnect'));
    await first;
    final DashboardState state = h.container.read(dashboardControllerProvider);
    expect(state.customerCount.data, 22);
    expect(state.memberCount.data, 33);
    expect(state.recentActivity.data!.single.id, 44);
  });

  testWidgets('company transition closes an open customer route and waits for server selection',
      (WidgetTester tester) async {
    final Completer<http.Response> selected = Completer<http.Response>();
    bool switched = false;
    await tester.pumpWidget(
      appWith(
        storage: await signedInStorage(),
        asyncHandler: (http.Request request) async {
          if (request.url.path.endsWith('/me')) {
            return jsonResponse(200, <String, Object?>{'data': userFixture()});
          }
          if (request.url.path.endsWith('/companies/9/select')) {
            final http.Response response = await selected.future;
            switched = true;
            return response;
          }
          if (request.url.path.endsWith('/companies')) return jsonResponse(200, companyPayload(7));
          if (request.url.path.endsWith('/customers/501')) {
            return jsonResponse(
              200,
              <String, Object?>{'data': customerFixture(name: 'Eski şirket müşterisi')},
            );
          }
          if (request.url.path.endsWith('/customers')) {
            return jsonResponse(
              200,
              paginated(
                <Map<String, dynamic>>[
                  customerFixture(
                    name: switched ? 'Yeni şirket müşterisi' : 'Eski şirket müşterisi',
                  ),
                ],
                1,
              ),
            );
          }
          return jsonResponse(200, paginated(<Map<String, dynamic>>[], 0));
        },
      ),
    );
    await settle(tester);
    await tester.tap(find.text('Müşteriler'));
    await settle(tester);
    await tester.tap(find.text('Eski şirket müşterisi'));
    await settle(tester, advance: const Duration(milliseconds: 50));
    expect(find.byType(CustomerDetailScreen), findsOneWidget);
    final ProviderContainer container =
        ProviderScope.containerOf(tester.element(find.byType(FlowTigerApp)));
    final Future<void> change = container.read(companyControllerProvider.notifier).select(9);
    await settle(tester, advance: const Duration(milliseconds: 50));
    expect(find.byType(CustomerDetailScreen), findsNothing);
    expect(find.text('Eski şirket müşterisi'), findsNothing);
    expect(find.text('Müşteriler'), findsNothing);
    selected.complete(jsonResponse(200, <String, Object?>{'data': companyFixture(id: 9)}));
    await change;
    await settle(tester);
    await tester.tap(find.text('Müşteriler'));
    await settle(tester);
    expect(find.text('Yeni şirket müşterisi'), findsOneWidget);
    expect(find.text('Eski şirket müşterisi'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
