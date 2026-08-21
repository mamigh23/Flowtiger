import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/ui.dart';
import '../companies/company_select_screen.dart' show roleLabel;
import 'member_controller.dart';
import 'member_detail_screen.dart';
import 'member_errors.dart';

/// Ekip listesi.
///
/// İSTEMCİDE YETKİ KARARI YOK: kullanıcının rolüne bakıp isteği
/// engellemiyoruz. Ekip uçları owner'a özeldir ama bunu backend söyler —
/// istek yapılır, 403 gelirse açıklanır. Rolü istemcide kontrol etseydik
/// yetki kuralı iki ayrı yerde tanımlı olur ve zamanla ayrışırdı
/// (playbook §3.1).
///
/// Arama/sıralama/filtre YOK: uçta böyle bir parametre yok.
/// Yeni üye ekleme YOK: POST /members bu faz kapsamı dışında.
class MembersScreen extends ConsumerStatefulWidget {
  const MembersScreen({super.key});

  @override
  ConsumerState<MembersScreen> createState() => _MembersScreenState();
}

class _MembersScreenState extends ConsumerState<MembersScreen> {
  @override
  void initState() {
    super.initState();
    // build sırasında provider değiştirmek Riverpod'da hatadır.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(ref.read(memberListControllerProvider.notifier).load());
    });
  }

  Future<void> _openDetail(Member member) async {
    final bool? changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => MemberDetailScreen(memberId: member.id),
      ),
    );

    if ((changed ?? false) && mounted) {
      await ref.read(memberListControllerProvider.notifier).reload();
    }
  }

  @override
  Widget build(BuildContext context) {
    final MemberListState state = ref.watch(memberListControllerProvider);

    switch (state.status) {
      case MemberListStatus.loading:
        return const FtLoading();

      case MemberListStatus.error:
        return ListView(
          padding: const EdgeInsets.all(FtTokens.space4),
          children: <Widget>[
            FtErrorState(message: memberErrorMessage(state.error)),
            const SizedBox(height: FtTokens.space4),
            FilledButton(
              onPressed: () =>
                  unawaited(ref.read(memberListControllerProvider.notifier).reload()),
              child: const Text('Tekrar dene'),
            ),
          ],
        );

      case MemberListStatus.ready:
        if (state.members.isEmpty) {
          return const Center(
            child: Padding(
              padding: EdgeInsets.all(FtTokens.space5),
              child: Text('Ekipte görüntülenecek üye yok.'),
            ),
          );
        }

        return Column(
          children: <Widget>[
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.all(FtTokens.space3),
                itemCount: state.members.length,
                itemBuilder: (BuildContext context, int index) {
                  final Member member = state.members[index];
                  final Role? role = member.role;

                  return Card(
                    elevation: 0,
                    margin: const EdgeInsets.only(bottom: FtTokens.space2),
                    shape: RoundedRectangleBorder(
                      side: BorderSide(color: Theme.of(context).colorScheme.outlineVariant),
                      borderRadius: BorderRadius.circular(FtTokens.radiusLg),
                    ),
                    child: ListTile(
                      title: Text(member.name),
                      subtitle: Text(member.email),
                      // Rol gelmemişse varsayım YAPILMAZ; yalnızca
                      // görüntüleme, yetki kararı değil.
                      trailing: FtBadge(label: role == null ? '—' : roleLabel(role)),
                      onTap: () => unawaited(_openDetail(member)),
                    ),
                  );
                },
              ),
            ),

            if (state.lastPage > 1)
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: FtTokens.space4,
                  vertical: FtTokens.space2,
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: <Widget>[
                    TextButton(
                      onPressed: state.hasPreviousPage
                          ? () => unawaited(
                                ref.read(memberListControllerProvider.notifier).previousPage(),
                              )
                          : null,
                      child: const Text('Önceki'),
                    ),
                    Text(
                      'Sayfa ${state.currentPage} / ${state.lastPage}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    TextButton(
                      onPressed: state.hasNextPage
                          ? () => unawaited(
                                ref.read(memberListControllerProvider.notifier).nextPage(),
                              )
                          : null,
                      child: const Text('Sonraki'),
                    ),
                  ],
                ),
              ),
          ],
        );
    }
  }
}
