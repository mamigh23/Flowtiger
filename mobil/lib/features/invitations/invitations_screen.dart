import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/ui.dart';
import '../companies/company_select_screen.dart' show roleLabel;
import 'invitation_controller.dart';
import 'invitation_errors.dart';
import 'invite_member_screen.dart';

/// Davet listesi ve iptal.
///
/// İSTEMCİDE YETKİ KARARI YOK: kullanıcının rolüne bakıp isteği
/// engellemiyoruz. Uçlar owner'a özeldir ama bunu backend söyler.
///
/// İPTAL DÜĞMESİ HER SATIRDA VARDIR — yalnızca `pending` olanlarda değil.
/// Durumu istemcide değerlendirip düğmeyi gizlemek geçerlilik kararını
/// istemciye taşımak olurdu; üstelik liste ile istek arasında geçen
/// sürede durum değişebilir. Karar backend'e ait, 410 da onun cevabı.
///
/// `email` MASKELİ gelir; arayüz maskeyi çözmeye çalışmaz.
class InvitationsScreen extends ConsumerStatefulWidget {
  const InvitationsScreen({super.key});

  @override
  ConsumerState<InvitationsScreen> createState() => _InvitationsScreenState();
}

class _InvitationsScreenState extends ConsumerState<InvitationsScreen> {
  /// İptal fiiline özgü hata — liste hatasından ayrı tutulur.
  String? _revokeError;
  Invitation? _confirming;
  bool _revoking = false;

  @override
  void initState() {
    super.initState();
    // build sırasında provider değiştirmek Riverpod'da hatadır.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(ref.read(invitationListControllerProvider.notifier).load());
    });
  }

  Future<void> _invite() async {
    final bool? sent = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(builder: (_) => const InviteMemberScreen()),
    );

    if ((sent ?? false) && mounted) {
      await ref.read(invitationListControllerProvider.notifier).load();
    }
  }

  Future<void> _revoke(Invitation invitation) async {
    setState(() {
      _revoking = true;
      _revokeError = null;
    });

    try {
      await ref.read(invitationRepositoryProvider).revoke(invitation.id);

      if (mounted) setState(() => _confirming = null);
      await ref.read(invitationListControllerProvider.notifier).reload();
    } on Object catch (error) {
      // 410 buraya düşer: davet zaten iptal/kabul edilmiş ya da süresi
      // dolmuş. Mesaj koda göre ayrışır.
      if (mounted) {
        setState(() {
          _revokeError = invitationErrorMessage(error);
          _confirming = null;
        });
      }
    } finally {
      if (mounted) setState(() => _revoking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final InvitationListState state = ref.watch(invitationListControllerProvider);

    return Scaffold(
      // Kabuğun Scaffold'u üstte; buradaki yalnızca kayan eylem düğmesi
      // için. Bu yüzden appBar YOK.
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton(
        tooltip: 'Davet gönder',
        onPressed: () => unawaited(_invite()),
        child: const Icon(Icons.mail_outline),
      ),
      body: _body(state),
    );
  }

  Widget _body(InvitationListState state) {
    // Onay ve hata EN ÜSTTE durur: aşağıda dursaydı ekranın altında
    // kalır, kullanıcı düğmeye basıp hiçbir şey olmamış gibi görürdü.
    final List<Widget> banners = <Widget>[
      if (_revokeError != null) ...<Widget>[
        Padding(
          padding: const EdgeInsets.fromLTRB(
            FtTokens.space4,
            FtTokens.space4,
            FtTokens.space4,
            0,
          ),
          child: FtErrorState(message: _revokeError!),
        ),
      ],
      if (_confirming != null) ...<Widget>[
        Padding(
          padding: const EdgeInsets.fromLTRB(
            FtTokens.space4,
            FtTokens.space4,
            FtTokens.space4,
            0,
          ),
          child: FtCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text('${_confirming!.email} adresine gönderilen davet iptal edilecek.'),
                const SizedBox(height: FtTokens.space4),
                Row(
                  children: <Widget>[
                    FilledButton(
                      onPressed: _revoking ? null : () => _revoke(_confirming!),
                      child: _revoking
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Evet, iptal et'),
                    ),
                    const SizedBox(width: FtTokens.space3),
                    TextButton(
                      onPressed: () => setState(() => _confirming = null),
                      child: const Text('Vazgeç'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    ];

    switch (state.status) {
      case InvitationListStatus.loading:
        return Column(children: <Widget>[...banners, const Expanded(child: FtLoading())]);

      case InvitationListStatus.error:
        return ListView(
          padding: const EdgeInsets.all(FtTokens.space4),
          children: <Widget>[
            ...banners,
            FtErrorState(message: invitationErrorMessage(state.error)),
            const SizedBox(height: FtTokens.space4),
            FilledButton(
              onPressed: () =>
                  unawaited(ref.read(invitationListControllerProvider.notifier).reload()),
              child: const Text('Tekrar dene'),
            ),
          ],
        );

      case InvitationListStatus.ready:
        if (state.invitations.isEmpty) {
          return Column(
            children: <Widget>[
              ...banners,
              const Expanded(
                child: Center(
                  child: Padding(
                    padding: EdgeInsets.all(FtTokens.space5),
                    child: Text('Henüz davet yok.'),
                  ),
                ),
              ),
            ],
          );
        }

        return Column(
          children: <Widget>[
            ...banners,
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.all(FtTokens.space3),
                itemCount: state.invitations.length,
                itemBuilder: (BuildContext context, int index) {
                  final Invitation invitation = state.invitations[index];

                  return Card(
                    elevation: 0,
                    margin: const EdgeInsets.only(bottom: FtTokens.space2),
                    shape: RoundedRectangleBorder(
                      side: BorderSide(color: Theme.of(context).colorScheme.outlineVariant),
                      borderRadius: BorderRadius.circular(FtTokens.radiusLg),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(FtTokens.space3),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          // Maskeli adres olduğu gibi gösterilir.
                          Text(invitation.email),
                          const SizedBox(height: FtTokens.space2),
                          Row(
                            children: <Widget>[
                              FtBadge(label: roleLabel(invitation.role)),
                              const SizedBox(width: FtTokens.space2),
                              FtBadge(label: invitationStatusLabel(invitation.status)),
                              const Spacer(),
                              // Durum istemcide değerlendirilmez.
                              TextButton(
                                onPressed: () =>
                                    setState(() => _confirming = invitation),
                                child: const Text('İptal et'),
                              ),
                            ],
                          ),
                        ],
                      ),
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
                                ref
                                    .read(invitationListControllerProvider.notifier)
                                    .previousPage(),
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
                                ref
                                    .read(invitationListControllerProvider.notifier)
                                    .nextPage(),
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
