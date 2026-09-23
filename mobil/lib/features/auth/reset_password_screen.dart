import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/ui.dart';
import 'auth_controller.dart';

class ResetPasswordScreen extends ConsumerStatefulWidget {
  const ResetPasswordScreen({this.email = '', super.key});

  final String email;

  @override
  ConsumerState<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends ConsumerState<ResetPasswordScreen> {
  late final TextEditingController _email;
  final TextEditingController _resetInput = TextEditingController();
  final TextEditingController _password = TextEditingController();
  final TextEditingController _confirmation = TextEditingController();

  bool _submitting = false;
  bool _passwordVisible = false;
  bool _confirmationVisible = false;
  String? _formError;
  String? _emailError;
  String? _resetError;
  String? _passwordError;
  String? _successMessage;

  @override
  void initState() {
    super.initState();
    _email = TextEditingController(text: widget.email);
  }

  @override
  void dispose() {
    _email.dispose();
    _resetInput.dispose();
    _password.dispose();
    _confirmation.dispose();
    super.dispose();
  }

  String _resolveToken() {
    final raw = _resetInput.text.trim();
    final uri = Uri.tryParse(raw);

    if (uri != null && uri.pathSegments.isNotEmpty) {
      final resetIndex = uri.pathSegments.lastIndexOf('reset');
      if (resetIndex >= 0 && resetIndex + 1 < uri.pathSegments.length) {
        return uri.pathSegments[resetIndex + 1];
      }
    }

    return raw;
  }

  String _resolveEmail() {
    final raw = _resetInput.text.trim();
    final uri = Uri.tryParse(raw);
    return uri?.queryParameters['email'] ?? _email.text.trim();
  }

  Future<void> _submit() async {
    setState(() {
      _submitting = true;
      _formError = null;
      _emailError = null;
      _resetError = null;
      _passwordError = null;
      _successMessage = null;
    });

    try {
      final message = await ref.read(authControllerProvider.notifier).resetPassword(
        email: _resolveEmail(),
        token: _resolveToken(),
        password: _password.text,
        passwordConfirmation: _confirmation.text,
      );

      if (ref.read(authControllerProvider).isAuthenticated) {
        await ref.read(authControllerProvider.notifier).logout();
      }

      _password.clear();
      _confirmation.clear();
      setState(() => _successMessage = message);
    } on ApiException catch (error) {
      setState(() {
        _emailError = error.isValidation ? error.fieldError('email') : null;
        _resetError = error.isValidation ? error.fieldError('token') : null;
        _passwordError = error.isValidation ? error.fieldError('password') : null;
        _formError = error.isValidation ? null : error.userMessage;
      });
      _password.clear();
      _confirmation.clear();
    } on NetworkException catch (error) {
      setState(() => _formError = error.userMessage);
      _password.clear();
      _confirmation.clear();
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
          _passwordVisible = false;
          _confirmationVisible = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_successMessage != null) {
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
                    Text('Parola güncellendi', style: Theme.of(context).textTheme.headlineSmall),
                    const SizedBox(height: FtTokens.space3),
                    Text(_successMessage!, key: const Key('reset-success')),
                    const SizedBox(height: FtTokens.space3),
                    const Text(
                      'Tüm oturumlar kapatıldı. Yeni parolanızla tekrar giriş yapabilirsiniz.',
                    ),
                    const SizedBox(height: FtTokens.space4),
                    FilledButton(
                      onPressed: () => Navigator.of(context).popUntil((route) => route.isFirst),
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

    return Scaffold(
      appBar: AppBar(title: const Text('Yeni parola belirleyin')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(FtTokens.space4),
          children: [
            FtCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Yeni parola belirleyin', style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: FtTokens.space2),
                  const Text(
                    'E-postadaki sıfırlama bağlantısını veya bağlantıdaki kodu kullanabilirsiniz.',
                  ),
                  if (_formError != null) ...[
                    const SizedBox(height: FtTokens.space4),
                    FtErrorState(message: _formError!),
                  ],
                  const SizedBox(height: FtTokens.space4),
                  TextField(
                    key: const Key('reset-email'),
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
                  TextField(
                    key: const Key('reset-input'),
                    controller: _resetInput,
                    obscureText: true,
                    autocorrect: false,
                    enableSuggestions: false,
                    decoration: InputDecoration(
                      labelText: 'Sıfırlama bağlantısı veya kodu',
                      errorText: _resetError,
                    ),
                  ),
                  const SizedBox(height: FtTokens.space4),
                  TextField(
                    key: const Key('reset-password'),
                    controller: _password,
                    obscureText: !_passwordVisible,
                    autocorrect: false,
                    enableSuggestions: false,
                    decoration: InputDecoration(
                      labelText: 'Yeni parola',
                      errorText: _passwordError,
                      suffixIcon: IconButton(
                        tooltip: _passwordVisible ? 'Parolayı gizle' : 'Parolayı göster',
                        icon: Icon(
                          _passwordVisible
                              ? Icons.visibility_off_outlined
                              : Icons.visibility_outlined,
                        ),
                        onPressed: () => setState(() => _passwordVisible = !_passwordVisible),
                      ),
                    ),
                  ),
                  const SizedBox(height: FtTokens.space4),
                  TextField(
                    key: const Key('reset-confirmation'),
                    controller: _confirmation,
                    obscureText: !_confirmationVisible,
                    autocorrect: false,
                    enableSuggestions: false,
                    decoration: InputDecoration(
                      labelText: 'Yeni parola tekrar',
                      suffixIcon: IconButton(
                        tooltip:
                            _confirmationVisible ? 'Parolayı gizle' : 'Parolayı göster',
                        icon: Icon(
                          _confirmationVisible
                              ? Icons.visibility_off_outlined
                              : Icons.visibility_outlined,
                        ),
                        onPressed: () =>
                            setState(() => _confirmationVisible = !_confirmationVisible),
                      ),
                    ),
                    onSubmitted: (_) => _submitting ? null : _submit(),
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
                        : const Text('Parolayı sıfırla'),
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
