import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/ui.dart';
import '../auth/auth_controller.dart';
import '../companies/company_controller.dart';
import 'audit_labels.dart';
import 'dashboard_controller.dart';

/// Panel.
///
/// Her sayı gerçek bir uçtan gelir; tahmin, örnek ya da yer tutucu veri
/// gösterilmez. Bir kart 403 alırsa bu bir arıza değildir — o bölüme
/// yetkisi olmayan bir rolle bakılıyor demektir.
class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  @override
  void initState() {
    super.initState();
    // build sırasında provider değiştirmek Riverpod'da hatadır.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(ref.read(dashboardControllerProvider.notifier).load());
    });
  }

  @override
  Widget build(BuildContext context) {
    final AuthState auth = ref.watch(authControllerProvider);
    final CompanyState companies = ref.watch(companyControllerProvider);
    final DashboardState data = ref.watch(dashboardControllerProvider);

    final Company? active = companies.activeCompany;

    return RefreshIndicator(
      onRefresh: () => ref.read(dashboardControllerProvider.notifier).load(),
      child: ListView(
        padding: const EdgeInsets.all(FtTokens.space4),
        children: <Widget>[
          Text(
            'Hoş geldin, ${auth.user?.name ?? ''}',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: FtTokens.space1),
          if (active != null)
            Text(active.name, style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: FtTokens.space4),

          Row(
            children: <Widget>[
              Expanded(
                child: _StatPanel(label: 'Müşteri', panel: data.customerCount),
              ),
              const SizedBox(width: FtTokens.space3),
              Expanded(
                child: _StatPanel(label: 'Ekip üyesi', panel: data.memberCount),
              ),
            ],
          ),

          const SizedBox(height: FtTokens.space4),
          _RecentActivity(panel: data.recentActivity),
        ],
      ),
    );
  }
}

class _StatPanel extends StatelessWidget {
  const _StatPanel({required this.label, required this.panel});

  final String label;
  final Panel<int> panel;

  @override
  Widget build(BuildContext context) {
    return FtStatCard(
      label: label,
      loading: panel.isLoading,
      value: switch (panel.status) {
        PanelStatus.loading => '',
        PanelStatus.forbidden => 'Yetkiniz yok',
        PanelStatus.failed => 'Alınamadı',
        PanelStatus.ready => '${panel.data ?? 0}',
      },
    );
  }
}

class _RecentActivity extends StatelessWidget {
  const _RecentActivity({required this.panel});

  final Panel<List<AuditLog>> panel;

  @override
  Widget build(BuildContext context) {
    final List<AuditLog> logs = panel.data ?? <AuditLog>[];

    return FtCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text('Son hareketler', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: FtTokens.space3),

          if (panel.isLoading) const FtLoading(),

          // 403 bir hata değil: kırmızı uyarı yerine sade bir durum metni.
          if (panel.isForbidden)
            Text('Yetkiniz yok', style: Theme.of(context).textTheme.bodyMedium),

          if (panel.isFailed)
            Text('Alınamadı', style: Theme.of(context).textTheme.bodyMedium),

          if (panel.status == PanelStatus.ready && logs.isEmpty)
            const Text('Henüz hareket yok.'),

          for (final AuditLog log in logs)
            ListTile(
              contentPadding: EdgeInsets.zero,
              dense: true,
              title: Text(auditActionLabel(log.action)),
              subtitle: log.createdAt == null ? null : Text(log.createdAt!),
            ),
        ],
      ),
    );
  }
}

/// Profil sekmesi — oturum bilgisi ve çıkış.
class ProfileSection extends ConsumerWidget {
  const ProfileSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AuthState auth = ref.watch(authControllerProvider);
    final CompanyState companies = ref.watch(companyControllerProvider);

    return ListView(
      padding: const EdgeInsets.all(FtTokens.space4),
      children: <Widget>[
        FtCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                auth.user?.name ?? '',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: FtTokens.space1),
              Text(
                auth.user?.email ?? '',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ),
        ),
        const SizedBox(height: FtTokens.space4),

        // Birden fazla şirket varsa değiştirme imkânı sunulur; seçim
        // yine yalnızca select ucu üzerinden yapılır.
        if (companies.companies.length > 1)
          FtCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text('Şirket', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: FtTokens.space2),
                for (final Company company in companies.companies)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    title: Text(company.name),
                    trailing: company.id == companies.activeCompanyId
                        ? const FtBadge(label: 'Aktif')
                        : TextButton(
                            onPressed: companies.selectingId != null
                                ? null
                                : () => unawaited(
                                      ref
                                          .read(companyControllerProvider.notifier)
                                          .select(company.id),
                                    ),
                            child: const Text('Geç'),
                          ),
                  ),
              ],
            ),
          ),

        const SizedBox(height: FtTokens.space4),
        OutlinedButton(
          onPressed: () => unawaited(ref.read(authControllerProvider.notifier).logout()),
          child: const Text('Çıkış yap'),
        ),
      ],
    );
  }
}
