import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/ui.dart';
import '../auth/auth_controller.dart';
import '../companies/company_controller.dart';
import '../companies/company_select_screen.dart' show roleLabel;
import 'invitation_controller.dart';
import 'invitation_errors.dart';

class AcceptInvitationScreen extends ConsumerStatefulWidget {
  const AcceptInvitationScreen({super.key});

  @override
  ConsumerState<AcceptInvitationScreen> createState() =>
      _AcceptInvitationScreenState();
}

class _AcceptInvitationScreenState
    extends ConsumerState<AcceptInvitationScreen> {
  final TextEditingController _token = TextEditingController();
  final TextEditingController _name = TextEditingController();
  final TextEditingController _password = TextEditingController();

  bool _submitting = false;
  bool _passwordVisible = false;
  Object? _error;
  Invitation? _result;

  @override
  void dispose() {
    _token.dispose();
    _name.dispose();
    _password.dispose();
    super.dispose();
  }

  bool get _authenticated =>
      ref.watch(authControllerProvider).status == AuthStatus.authenticated;

  String _errorMessage(Object? error) {
    if (error is ApiException) {
      if (error.statusCode == 403) {
        switch (error.code) {
          case 'invitation_requires_authentication':
            return 'Bu e-postanın zaten bir hesabı var. Önce o hesapla giriş yapın.';
          case 'invitation_email_mismatch':
            return 'Bu davet başka bir e-posta adresi için oluşturulmuş.';
        }
      }
      if (error.statusCode == 410) return invitationErrorMessage(error);
      return error.userMessage;
    }

    return invitationErrorMessage(error);
  }

  Future<void> _submit() async {
    if (_submitting) return;

    final bool authenticated = _authenticated;

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final Invitation result =
          await ref.read(invitationRepositoryProvider).accept(
                token: _token.text.trim(),
                name: authenticated ? null : _name.text.trim(),
                password: authenticated ? null : _password.text,
                authenticated: authenticated,
              );

      if (authenticated) {
        await ref.read(companyControllerProvider.notifier).load();
        if (mounted) Navigator.of(context).pop(true);
      } else if (mounted) {
        _password.clear();
        setState(() => _result = result);
      }
    } on Object catch (error) {
      if (mounted) {
        _password.clear();
        setState(() => _error = error);
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_result != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Daveti kabul et')),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(FtTokens.space4),
            children: [
              FtCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Daveti kabul edildi',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: FtTokens.space3),
                    const Text(
                      'Hesabınız oluşturuldu ve şirkete katıldınız. Devam etmek için giriş yapın.',
                    ),
                    const SizedBox(height: FtTokens.space4),
                    Text(
                      _result!.email,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: FtTokens.space2),
                    Text(
                      'Rol: \${roleLabel(_result!.role)}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: FtTokens.space4),
                    FilledButton(
                      onPressed: () => Navigator.of(context).popUntil(
                        (Route<dynamic> route) => route.isFirst,
                      ),
                      child: const Text('Giriş yap'),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }

    final bool authenticated = _authenticated;

    return Scaffold(
      appBar: AppBar(title: const Text('Daveti kabul et')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(FtTokens.space4),
          children: [
            FtCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Şirkete katılın',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: FtTokens.space2),
                  Text(
                    authenticated
                        ? 'Davet kodunu bu hesapla onaylayın.'
                        : 'Davet kodunu ve hesap bilgilerinizi girin.',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: FtTokens.space4),
                    FtErrorState(message: _errorMessage(_error)),
                  ],
                  const SizedBox(height: FtTokens.space4),
                  TextField(
                    key: const Key('invitation-accept-token'),
                    controller: _token,
                    autocorrect: false,
                    enableSuggestions: false,
                    decoration: InputDecoration(
                      labelText: 'Davet kodu',
                      errorText: invitationFieldError(_error, 'token'),
                    ),
                  ),
                  if (!authenticated) ...[
                    const SizedBox(height: FtTokens.space4),
                    TextField(
                      key: const Key('invitation-accept-name'),
                      controller: _name,
                      textInputAction: TextInputAction.next,
                      decoration: InputDecoration(
                        labelText: 'Ad Soyad',
                        errorText: invitationFieldError(_error, 'name'),
                      ),
                    ),
                    const SizedBox(height: FtTokens.space4),
                    TextField(
                      key: const Key('invitation-accept-password'),
                      controller: _password,
                      obscureText: !_passwordVisible,
                      autocorrect: false,
                      enableSuggestions: false,
                      decoration: InputDecoration(
                        labelText: 'Parola',
                        errorText: invitationFieldError(_error, 'password'),
                        suffixIcon: IconButton(
                          tooltip: _passwordVisible
                              ? 'Parolayı gizle'
                              : 'Parolayı göster',
                          icon: Icon(
                            _passwordVisible
                                ? Icons.visibility_off_outlined
                                : Icons.visibility_outlined,
                          ),
                          onPressed: () => setState(
                            () => _passwordVisible = !_passwordVisible,
                          ),
                        ),
                      ),
                      onSubmitted: (_) => _submitting ? null : _submit(),
                    ),
                    const SizedBox(height: FtTokens.space2),
                    const Text(
                      'Yeni hesap davetin gönderildiği e-posta adresiyle oluşturulur.',
                    ),
                  ],
                  const SizedBox(height: FtTokens.space4),
                  FilledButton(
                    onPressed: _submitting ? null : _submit,
                    child: _submitting
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Daveti kabul et'),
                  ),
                  if (authenticated) ...[
                    const SizedBox(height: FtTokens.space2),
                    TextButton(
                      onPressed: () => ref
                          .read(authControllerProvider.notifier)
                          .logout(),
                      child: const Text('Farklı hesapla devam et'),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
