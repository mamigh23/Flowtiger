import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/ui.dart';
import '../companies/company_select_screen.dart' show roleLabel;
import 'member_controller.dart';
import 'member_errors.dart';
import 'member_form_screen.dart';

/// Üye detayı — rol değişimi ve ekipten çıkarma.
///
/// ROL DEĞİŞİMİ AYRI UÇ: PATCH /members/{id}/role, gövde yalnızca
/// { role }. Bu yüzden düzenleme formunda rol alanı yok.
///
/// İKİ ÖZEL SONUÇ, İKİ FARKLI ANLAM:
///   422 + company_requires_an_owner → yetki sorunu DEĞİL; işlem şirketi
///        ownersız bırakırdı.
///   403 (çıkarma) → kullanıcı kendini çıkarmaya çalıştı. "Bölüm sahiplere
///        açık" DEĞİL; zaten owner, aksi hâlde bu ekranı göremezdi.
class MemberDetailScreen extends ConsumerStatefulWidget {
  const MemberDetailScreen({required this.memberId, super.key});

  final int memberId;

  @override
  ConsumerState<MemberDetailScreen> createState() => _MemberDetailScreenState();
}

class _MemberDetailScreenState extends ConsumerState<MemberDetailScreen> {
  Member? _member;
  bool _loading = true;
  Object? _loadError;

  /// Fiile özgü hata: rol değişimi ya da çıkarma.
  String? _actionError;

  bool _confirming = false;
  bool _removing = false;
  bool _changingRole = false;

  /// Liste ekranına "yenilenmen gerekiyor" demek için taşınır.
  bool _changed = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });

    try {
      final Member found = await ref.read(memberRepositoryProvider).find(widget.memberId);
      if (mounted) setState(() => _member = found);
    } on Object catch (error) {
      if (mounted) setState(() => _loadError = error);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _changeRole(Role role) async {
    setState(() {
      _changingRole = true;
      _actionError = null;
    });

    try {
      final Member updated =
          await ref.read(memberRepositoryProvider).changeRole(widget.memberId, role);

      if (mounted) {
        setState(() {
          _member = updated;
          _changed = true;
        });
      }
    } on Object catch (error) {
      // Son owner kuralı buraya 422 olarak düşer; mesajı backend verir.
      if (mounted) setState(() => _actionError = memberErrorMessage(error));
    } finally {
      if (mounted) setState(() => _changingRole = false);
    }
  }

  Future<void> _remove() async {
    setState(() {
      _removing = true;
      _actionError = null;
    });

    try {
      await ref.read(memberRepositoryProvider).remove(widget.memberId);
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (error) {
      // Buradaki 403 "kendini çıkaramazsın" demektir.
      if (mounted) {
        setState(() {
          _actionError = removeErrorMessage(error);
          _confirming = false;
        });
      }
    } finally {
      if (mounted) setState(() => _removing = false);
    }
  }

  Future<void> _edit() async {
    final Member? current = _member;
    if (current == null) return;

    final bool? saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(builder: (_) => MemberFormScreen(member: current)),
    );

    if (saved ?? false) {
      _changed = true;
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final Member? member = _member;

    return Scaffold(
      appBar: AppBar(
        title: Text(member?.name ?? 'Üye'),
        leading: BackButton(onPressed: () => Navigator.of(context).pop(_changed)),
        actions: <Widget>[
          if (member != null)
            TextButton(onPressed: _edit, child: const Text('Düzenle')),
          if (member != null)
            TextButton(
              onPressed: () => setState(() => _confirming = true),
              child: const Text('Ekipten çıkar'),
            ),
        ],
      ),
      body: SafeArea(child: _body(member)),
    );
  }

  Widget _body(Member? member) {
    if (_loading && member == null) return const FtLoading();

    if (member == null) {
      return ListView(
        padding: const EdgeInsets.all(FtTokens.space4),
        children: <Widget>[FtErrorState(message: memberErrorMessage(_loadError))],
      );
    }

    final Role? role = member.role;

    return ListView(
      padding: const EdgeInsets.all(FtTokens.space4),
      children: <Widget>[
        if (_actionError != null) ...<Widget>[
          FtErrorState(message: _actionError!),
          const SizedBox(height: FtTokens.space4),
        ],

        // Onay kartı listenin EN ÜSTÜNDE durur.
        //
        // Aşağıda dursaydı ekranın altında kalırdı: kullanıcı üst
        // çubuktaki 'Ekipten çıkar'a basar, hiçbir şey olmamış gibi
        // görünür ve kaydırması gerektiğini bilemezdi. Yıkıcı bir
        // işlemin onayı, tetikleyen düğmenin yanında olmalı.
        if (_confirming) ...<Widget>[
          FtCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  '${member.name} ekipten çıkarılacak. Şirket verilerine erişimi sona erer.',
                ),
                const SizedBox(height: FtTokens.space4),
                Row(
                  children: <Widget>[
                    FilledButton(
                      onPressed: _removing ? null : _remove,
                      child: _removing
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Evet, çıkar'),
                    ),
                    const SizedBox(width: FtTokens.space3),
                    TextButton(
                      onPressed: () => setState(() => _confirming = false),
                      child: const Text('Vazgeç'),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: FtTokens.space4),
        ],

        FtCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              _Row(label: 'E-posta', value: member.email),
              // Rol gelmemişse varsayım YAPILMAZ.
              _Row(label: 'Rol', value: role == null ? '—' : roleLabel(role)),
              _Row(label: 'Katılma', value: member.createdAt ?? '—'),
              _Row(label: 'Son güncelleme', value: member.updatedAt ?? '—'),
            ],
          ),
        ),

        // Rol yalnızca backend'in bildirdiği değer üzerinden değiştirilir;
        // rol bilinmiyorsa hangi yöne çevrileceği de bilinemez.
        if (role != null) ...<Widget>[
          const SizedBox(height: FtTokens.space4),
          FtCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'Rol değişimi',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: FtTokens.space2),
                Text(
                  'Rol ayrı bir işlemdir ve düzenleme formundan değiştirilemez.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: FtTokens.space4),
                FilledButton(
                  onPressed: _changingRole
                      ? null
                      : () => _changeRole(role == Role.owner ? Role.member : Role.owner),
                  child: _changingRole
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(role == Role.owner ? 'Üye yap' : 'Sahip yap'),
                ),
              ],
            ),
          ),
        ],

      ],
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: FtTokens.space3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(label, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: FtTokens.space1),
          Text(value, style: Theme.of(context).textTheme.bodyLarge),
        ],
      ),
    );
  }
}
