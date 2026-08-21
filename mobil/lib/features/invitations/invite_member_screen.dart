import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/ui.dart';
import '../companies/company_select_screen.dart' show roleLabel;
import 'invitation_controller.dart';
import 'invitation_errors.dart';

/// Davet gönderme.
///
/// GÖVDE `{email, role}` — `name` DEĞİL.
///
/// ENUMERATION KORUMASI: backend, kayıtlı bir adresi davet etmekle
/// kayıtsızı davet etmeyi AYNI yanıtla karşılar. Arayüz de "bu kullanıcı
/// zaten kayıtlı" gibi bir ayrım yapmaz — yapsaydı backend'in özenle
/// kapattığı bilgi sızıntısını geri açardı.
class InviteMemberScreen extends ConsumerStatefulWidget {
  const InviteMemberScreen({super.key});

  @override
  ConsumerState<InviteMemberScreen> createState() => _InviteMemberScreenState();
}

class _InviteMemberScreenState extends ConsumerState<InviteMemberScreen> {
  final TextEditingController _email = TextEditingController();
  Role _role = Role.member;

  bool _submitting = false;
  Object? _error;

  @override
  void dispose() {
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
      await ref
          .read(invitationRepositoryProvider)
          .create(email: _email.text.trim(), role: _role);

      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final String? emailError = invitationFieldError(_error, 'email');

    // `invitation_already_member` 422 döner ama `errors` taşımaz; alan
    // altında gösterilemez, form seviyesinde gösterilir.
    final bool hasFormError = _error != null && emailError == null;

    return Scaffold(
      appBar: AppBar(title: const Text('Davet gönder')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(FtTokens.space4),
          children: <Widget>[
            if (hasFormError) ...<Widget>[
              FtErrorState(message: invitationErrorMessage(_error)),
              const SizedBox(height: FtTokens.space4),
            ],

            TextField(
              key: const Key('invitation-email'),
              controller: _email,
              autocorrect: false,
              enableSuggestions: false,
              keyboardType: TextInputType.emailAddress,
              decoration: InputDecoration(labelText: 'E-posta', errorText: emailError),
            ),
            const SizedBox(height: FtTokens.space4),

            DropdownButtonFormField<Role>(
              key: const Key('invitation-role'),
              initialValue: _role,
              decoration: const InputDecoration(labelText: 'Rol'),
              // Seçenekler Role enum'ıyla sınırlı; başka bir değer
              // backend'de zaten Rule::enum ile reddedilir.
              items: Role.values
                  .map(
                    (Role role) => DropdownMenuItem<Role>(
                      value: role,
                      child: Text(roleLabel(role)),
                    ),
                  )
                  .toList(),
              onChanged: (Role? selected) {
                if (selected != null) setState(() => _role = selected);
              },
            ),
            const SizedBox(height: FtTokens.space5),

            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Gönder'),
            ),
          ],
        ),
      ),
    );
  }
}
