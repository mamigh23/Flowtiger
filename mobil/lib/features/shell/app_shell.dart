import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/ui.dart';
import '../companies/company_controller.dart';
import '../companies/company_select_screen.dart' show roleLabel;
import '../dashboard/dashboard_screen.dart';

/// Aktif şirketi olan kullanıcının kabuğu.
///
/// Üst çubuk aktif şirketi ve rolü KALICI olarak gösterir; bu bilgi
/// başka hiçbir ekranda tekrarlanmaz. Sebebi bir tasarım tercihi değil:
/// çok kiracılı bir üründe "hangi şirkette çalışıyorum" sorusunun cevabı
/// her an görünür olmalı, yoksa yanlış şirkete kayıt girilir.
class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key});

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final CompanyState companies = ref.watch(companyControllerProvider);
    final Company? active = companies.activeCompany;

    return Scaffold(
      appBar: AppBar(
        titleSpacing: FtTokens.space4,
        title: Text(
          active?.name ?? 'FlowTiger',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        actions: <Widget>[
          if (active?.role != null)
            Padding(
              padding: const EdgeInsets.only(right: FtTokens.space4),
              child: Center(child: FtBadge(label: roleLabel(active!.role!))),
            ),
        ],
      ),

      // IndexedStack YERİNE switch: yalnızca açık bölüm ağaçta durur.
      // Böylece görünmeyen bir bölüm arka planda istek atmaz ve ekranda
      // olmayan bir metin testlerde/erişilebilirlik ağacında görünmez.
      body: SafeArea(child: _section(_index)),

      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (int value) => setState(() => _index = value),
        destinations: const <NavigationDestination>[
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'Panel',
          ),
          NavigationDestination(
            icon: Icon(Icons.people_outline),
            selectedIcon: Icon(Icons.people),
            label: 'Müşteriler',
          ),
          NavigationDestination(
            icon: Icon(Icons.groups_outlined),
            selectedIcon: Icon(Icons.groups),
            label: 'Ekip',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Profil',
          ),
        ],
      ),
    );
  }

  Widget _section(int index) => switch (index) {
        1 => const _ComingSoon(
            title: 'Müşteriler',
            description: 'Müşteri listesi ve kayıt ekranı bir sonraki aşamada geliyor.',
          ),
        2 => const _ComingSoon(
            title: 'Ekip',
            description: 'Ekip üyeleri ve davetler bir sonraki aşamada geliyor.',
          ),
        3 => const ProfileSection(),
        _ => const DashboardScreen(),
      };
}

/// Henüz yapılmamış bölüm.
///
/// Boş bir sekme yerine ne olacağını söyleyen bir yüzey gösterilir —
/// ama SAHTE VERİ ile doldurulmaz.
class _ComingSoon extends StatelessWidget {
  const _ComingSoon({required this.title, required this.description});

  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(FtTokens.space5),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: FtTokens.space2),
            Text(
              description,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}
