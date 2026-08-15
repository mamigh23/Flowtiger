import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme/app_theme.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/login_screen.dart';
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
    final AuthState auth = ref.watch(authControllerProvider);

    switch (auth.status) {
      case AuthStatus.loading:
        return const Scaffold(body: FtLoading());
      case AuthStatus.authenticated:
        return const AppShell();
      case AuthStatus.unauthenticated:
        return const LoginScreen();
    }
  }
}
