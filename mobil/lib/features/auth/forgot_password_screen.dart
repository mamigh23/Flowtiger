import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/ui.dart';
import 'auth_controller.dart';
import 'reset_password_screen.dart';

class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({this.initialEmail = '', super.key});

  final String initialEmail;

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  late final TextEditingController _email;
  bool _submitting = false;
  String? _formError;
  String? _emailError;
  String? _successMessage;

  @override
  void initState() {
    super.initState();
    _email = TextEditingController(text: widget.initialEmail);
  }

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _submitting = true;
      _formError = null;
      _emailError = null;
      _successMessage = null;
    });

    try {
      final message = await ref.read(authControllerProvider.notifier).requestPasswordReset(
        email: _email.text.trim(),
      );
      setState(() => _successMessage = message);
    } on ApiException catch (error) {
      setState(() {
        _emailError = error.isValidation ? error.fieldError('email') : null;
        _formError = error.isValidation ? null : error.userMessage;
      });
    } on NetworkException catch (error) {
      setState(() => _formError = error.userMessage);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final sent = _successMessage != null;

    return Scaffold(
      appBar: AppBar(title: const Text('Parola sıfırlama')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(FtTokens.space4),
          children: [
            FtCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    sent ? 'Gelen kutunuzu kontrol edin' : 'Parolanızı mı unuttunuz?',
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: FtTokens.space2),
                  Text(
                    sent
                        ? (_successMessage ?? '')
                        : 'Hesabınızın e-posta adresini girin; sıfırlama bağlantısı isteyelim.',
                    key: sent ? const Key('forgot-success') : null,
                  ),
                  if (_formError != null) ...[
                    const SizedBox(height: FtTokens.space4),
                    FtErrorState(message: _formError!),
                  ],
                  if (!sent) ...[
                    const SizedBox(height: FtTokens.space4),
                    TextField(
                      key: const Key('forgot-email'),
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      enableSuggestions: false,
                      decoration: InputDecoration(
                        labelText: 'E-posta',
                        errorText: _emailError,
                      ),
                    ),
                    const SizedBox(height: FtTokens.space4),
                    FilledButton(
                      onPressed: _submitting ? null : _submit,
                      child: _submitting
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Sıfırlama bağlantısı gönder'),
                    ),
                  ] else ...[
                    const SizedBox(height: FtTokens.space3),
                    const Text(
                      'Mobil uygulamada sıfırlamak için e-postadaki bağlantıyı kopyalayıp bir sonraki ekranda yapıştırabilirsiniz.',
                    ),
                    const SizedBox(height: FtTokens.space4),
                    FilledButton(
                      onPressed: () => Navigator.of(context).push<void>(
                        MaterialPageRoute<void>(
                          builder: (_) => ResetPasswordScreen(email: _email.text.trim()),
                        ),
                      ),
                      child: const Text('Sıfırlama ekranını aç'),
                    ),
                    const SizedBox(height: FtTokens.space2),
                    OutlinedButton(
                      onPressed: () => setState(() {
                        _successMessage = null;
                        _formError = null;
                      }),
                      child: const Text('Başka bir e-posta gir'),
                    ),
                  ],
                  const SizedBox(height: FtTokens.space3),
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('Girişe dön'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
