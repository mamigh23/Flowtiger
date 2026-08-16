import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme/app_theme.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/login_screen.dart';
import 'features/companies/company_controller.dart';
import 'features/companies/company_select_screen.dart';
import 'features/shell/app_shell.dart';
import 'widgets/ui.dart';

void main() {
  runApp(const ProviderScope(child: FlowTigerApp()));
}

class FlowTigerApp extends StatelessWidget {
  const FlowTigerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'FlowTiger',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      home: const _AuthGate(),
    );
  }
}

/// Oturum durumuna göre başlangıç navigasyonu.
///
/// Named route yerine durum tabanlı geçiş: oturum düştüğünde (ör. 401)
/// kullanıcı hangi ekranda olursa olsun giriş ekranına döner ve arkada
/// açık kalmış korumalı bir sayfa kalmaz.
///
/// BU BİR GÜVENLİK SINIRI DEĞİLDİR — kullanışlılık katmanıdır. Gerçek
/// yetki kararı her istekte backend'de verilir.
class _AuthGate extends ConsumerStatefulWidget {
  const _AuthGate();

  @override
  ConsumerState<_AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends ConsumerState<_AuthGate> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(ref.read(authControllerProvider.notifier).restoreSession());
    });
  }

  @override
  Widget build(BuildContext context) {
    // Oturum kapandığında şirket durumu SIFIRLANIR. Aksi hâlde bir
    // sonraki kullanıcı, önceki oturumun aktif şirketiyle açılırdı.
    ref.listen<AuthState>(authControllerProvider, (AuthState? previous, AuthState next) {
      if (next.status == AuthStatus.unauthenticated) {
        ref.read(companyControllerProvider.notifier).reset();
      }
    });

    final AuthState auth = ref.watch(authControllerProvider);

    switch (auth.status) {
      case AuthStatus.loading:
        return const Scaffold(body: FtLoading());
      case AuthStatus.authenticated:
        return const _CompanyGate();
      case AuthStatus.unauthenticated:
        return const LoginScreen();
    }
  }
}

/// Aktif şirket yoksa ürüne girilmez.
///
/// Bu da bir güvenlik sınırı değildir: aktif şirketi olmayan bir
/// kullanıcının istekleri zaten backend'de no_active_company ile
/// reddedilir. Buradaki amaç, kullanıcıyı boş ve bozuk görünen bir
/// panele düşürmemek.
class _CompanyGate extends ConsumerStatefulWidget {
  const _CompanyGate();

  @override
  ConsumerState<_CompanyGate> createState() => _CompanyGateState();
}

class _CompanyGateState extends ConsumerState<_CompanyGate> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      // Zaten yüklenmişse (ör. şirket değiştirme sonrası) tekrar istenmez.
      if (ref.read(companyControllerProvider).status == CompanyStatus.idle) {
        unawaited(ref.read(companyControllerProvider.notifier).load());
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final CompanyState companies = ref.watch(companyControllerProvider);

    switch (companies.status) {
      case CompanyStatus.idle:
      case CompanyStatus.loading:
        return const Scaffold(body: FtLoading());

      case CompanyStatus.error:
      case CompanyStatus.ready:
        // Tek şirket varsa controller otomatik seçer ve bu ekran
        // hiç görünmez; seçim sürerken de burada kalınır.
        return companies.activeCompanyId == null
            ? const CompanySelectScreen()
            : const AppShell();
    }
  }
}
