import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/ui.dart';
import '../auth/auth_controller.dart';
import '../companies/company_controller.dart';

/// Kimlik doğrulanmış alanın kabuğu.
///
/// Bu fazda ekran YOK (§20) — yalnızca foundation'ın çalıştığını gösteren
/// asgari yüzey: kim giriş yaptı, hangi şirketler var, aktif şirket
/// hangisi ve nasıl değiştiriliyor.
class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key});

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  @override
  void initState() {
    super.initState();
    // Şirket listesi ilk çerçeveden sonra yüklenir; build sırasında
    // provider değiştirmek Riverpod'da hatadır.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(ref.read(companyControllerProvider.notifier).load());
    });
  }

  @override
  Widget build(BuildContext context) {
    final AuthState auth = ref.watch(authControllerProvider);
    final CompanyState companies = ref.watch(companyControllerProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('FlowTiger'),
        actions: <Widget>[
          IconButton(
            tooltip: 'Çıkış',
            icon: const Icon(Icons.logout),
            onPressed: () => unawaited(ref.read(authControllerProvider.notifier).logout()),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(FtTokens.space4),
        children: <Widget>[
          if (auth.user != null)
            Text(auth.user!.email, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: FtTokens.space4),

          FtCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Text('Aktif şirket', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: FtTokens.space3),

                if (companies.loading) const FtLoading(),

                if (companies.error != null)
                  FtErrorState(
                    message: companies.error!,
                    onRetry: () =>
                        unawaited(ref.read(companyControllerProvider.notifier).load()),
                  ),

                if (!companies.loading &&
                    companies.error == null &&
                    companies.companies.isEmpty)
                  const Text('Henüz hiçbir şirkete üye değilsiniz.'),

                for (final Company company in companies.companies)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(company.name),
                    subtitle: company.role == null ? null : Text(company.role!.value),
                    trailing: company.id == companies.activeCompanyId
                        ? const Text('aktif')
                        : TextButton(
                            // Şirket değişimi YALNIZCA backend ucu
                            // üzerinden; istemci active_company_id yazmaz.
                            onPressed: () => unawaited(
                              ref.read(companyControllerProvider.notifier).select(company.id),
                            ),
                            child: const Text('Seç'),
                          ),
                  ),
              ],
            ),
          ),

          const SizedBox(height: FtTokens.space4),
          Text(
            'Foundation aşaması: müşteri, ekip, davet ve denetim ekranları henüz yok.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}
