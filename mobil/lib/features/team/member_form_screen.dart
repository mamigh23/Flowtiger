import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/ui.dart';
import 'member_controller.dart';
import 'member_errors.dart';

/// Üye düzenleme.
///
/// GÖVDE: yalnızca `name` ve `email`.
///
/// ROL BU FORMDA YOKTUR ve olmayacaktır. Rol ayrı bir uçla değişir
/// (PATCH /members/{id}/role, üye detayında). Forma bir rol alanı koymak,
/// backend'in özenle ayırdığı iki işlemi istemcide yeniden birleştirmek
/// olurdu.
class MemberFormScreen extends ConsumerStatefulWidget {
  const MemberFormScreen({required this.member, super.key});

  final Member member;

  @override
  ConsumerState<MemberFormScreen> createState() => _MemberFormScreenState();
}

class _MemberFormScreenState extends ConsumerState<MemberFormScreen> {
  late final TextEditingController _name = TextEditingController(text: widget.member.name);
  late final TextEditingController _email = TextEditingController(text: widget.member.email);

  bool _submitting = false;
  Object? _error;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_submitting) return;

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ref.read(memberRepositoryProvider).update(
            widget.member.id,
            name: _name.text.trim(),
            email: _email.text.trim(),
          );

      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final String? nameError = memberFieldError(_error, 'name');
    final String? emailError = memberFieldError(_error, 'email');
    final bool hasFormError = _error != null && nameError == null && emailError == null;

    return Scaffold(
      appBar: AppBar(title: const Text('Üyeyi düzenle')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(FtTokens.space4),
          children: <Widget>[
            if (hasFormError) ...<Widget>[
              FtErrorState(message: memberErrorMessage(_error)),
              const SizedBox(height: FtTokens.space4),
            ],

            TextField(
              key: const Key('member-name'),
              controller: _name,
              autocorrect: false,
              textInputAction: TextInputAction.next,
              decoration: InputDecoration(labelText: 'Ad', errorText: nameError),
            ),
            const SizedBox(height: FtTokens.space4),

            TextField(
              key: const Key('member-email'),
              controller: _email,
              autocorrect: false,
              enableSuggestions: false,
              keyboardType: TextInputType.emailAddress,
              decoration: InputDecoration(labelText: 'E-posta', errorText: emailError),
            ),

            // Rol alanı BİLEREK yok — PATCH /members/{id}/role ile,
            // üye detayından değişir.

            const SizedBox(height: FtTokens.space5),

            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Kaydet'),
            ),
          ],
        ),
      ),
    );
  }
}
