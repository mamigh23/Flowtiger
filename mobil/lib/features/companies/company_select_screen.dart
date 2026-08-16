import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/ui.dart';
import '../auth/auth_controller.dart';
import 'company_controller.dart';

/// Şirket seçimi.
///
/// Seçim yalnızca POST /companies/{id}/select ile yapılır. İstemci
/// hiçbir yerde active_company_id yazmaz (playbook §3.1).
///
/// Tek şirketi olan kullanıcı buraya hiç düşmez: CompanyController
/// otomatik seçer. Bu ekran 0 ve 2+ şirket durumlarını karşılar.
class CompanySelectScreen extends ConsumerWidget {
  const CompanySelectScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final CompanyState companies = ref.watch(companyControllerProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Şirket seçin'),
        actions: <Widget>[
          TextButton(
            onPressed: () => unawaited(ref.read(authControllerProvider.notifier).logout()),
            child: const Text('Çıkış'),
          ),
        ],
      ),
      body: SafeArea(
        child: _Body(companies: companies),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({required this.companies});

  final CompanyState companies;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (companies.status == CompanyStatus.loading && companies.companies.isEmpty) {
      return const FtLoading();
    }

    return ListView(
      padding: const EdgeInsets.all(FtTokens.space4),
      children: <Widget>[
        Text(
          'Hangi şirkette çalışacağınızı seçin.',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        const SizedBox(height: FtTokens.space4),

        if (companies.status == CompanyStatus.error && companies.error != null) ...<Widget>[
          FtErrorState(
            message: companies.error!,
            onRetry: () => unawaited(ref.read(companyControllerProvider.notifier).load()),
          ),
          const SizedBox(height: FtTokens.space4),
        ],

        if (companies.selectError != null) ...<Widget>[
          FtErrorState(message: companies.selectError!),
          const SizedBox(height: FtTokens.space4),
        ],

        if (companies.status == CompanyStatus.ready && companies.companies.isEmpty)
          const FtCard(
            child: Column(
              children: <Widget>[
                Text('Henüz hiçbir şirkete üye değilsiniz.'),
                SizedBox(height: FtTokens.space2),
                Text(
                  'Bir şirket sahibinin sizi davet etmesi gerekiyor. '
                  'Davet e-postanızı kontrol edin.',
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),

        for (final Company company in companies.companies)
          Padding(
            padding: const EdgeInsets.only(bottom: FtTokens.space3),
            child: FtCard(
              child: Row(
                children: <Widget>[
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(
                          company.name,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        if (company.role != null) ...<Widget>[
                          const SizedBox(height: FtTokens.space1),
                          FtBadge(label: roleLabel(company.role!)),
                        ],
                      ],
                    ),
                  ),
                  FilledButton(
                    // Bir seçim sürerken diğer kartlar da kilitlenir:
                    // arka arkaya iki seçim, hangisinin kazandığı belirsiz
                    // bir yarış yaratırdı.
                    onPressed: companies.selectingId != null
                        ? null
                        : () => unawaited(
                              ref.read(companyControllerProvider.notifier).select(company.id),
                            ),
                    child: companies.selectingId == company.id
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Seç'),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

/// Rolün kullanıcıya gösterilen adı.
///
/// DİKKAT: yalnızca GÖRÜNTÜLEME içindir. Rol bilgisiyle istemcide yetki
/// kararı verilmez (playbook §3.1) — yetkisiz uçlar backend'den 403 döner.
String roleLabel(Role role) => role == Role.owner ? 'Sahip' : 'Üye';
