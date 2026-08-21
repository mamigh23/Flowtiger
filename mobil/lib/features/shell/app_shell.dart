import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/ui.dart';
import '../companies/company_controller.dart';
import '../companies/company_select_screen.dart' show roleLabel;
import '../customers/customers_screen.dart';
import '../dashboard/dashboard_screen.dart';
import '../invitations/invitations_screen.dart';
import '../team/members_screen.dart';

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
            icon: Icon(Icons.mail_outline),
            selectedIcon: Icon(Icons.mail),
            label: 'Davetler',
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

  /// BEŞ SEKME — altıncısı eklenmez.
  ///
  /// Denetim geçmişi ve hesap ekranları bilinçli olarak burada değil,
  /// Profil sekmesinin içinde: NavigationBar altıncı destinasyonda
  /// etiketleri sıkıştırır, üstelik ikisi de günlük iş değil ara sıra
  /// bakılan bölümler.
  ///
  /// _ComingSoon KALDIRILDI: bütün sekmeler gerçek ekranlara bağlandı ve
  /// kullanılmayan bir yer tutucu, bir sonraki fazda "burada ne vardı?"
  /// sorusunu doğuran ölü koda dönüşürdü.
  Widget _section(int index) => switch (index) {
        1 => const CustomersScreen(),
        2 => const MembersScreen(),
        3 => const InvitationsScreen(),
        4 => const ProfileSection(),
        _ => const DashboardScreen(),
      };
}
