import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_exception.dart';
import '../../core/theme/app_theme.dart';
import '../../widgets/ui.dart';
import 'auth_controller.dart';

/// Giriş ekranı.
///
/// Hata gösterimi merkezi kurallara dayanır:
///   422 → alan bazlı hatalar
///   429 → bekleme mesajı
///   401 → backend'in tek tip mesajı; e-posta var/yok ayrımı YAPILMAZ.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final TextEditingController _email = TextEditingController();
  final TextEditingController _password = TextEditingController();

  bool _submitting = false;
  bool _passwordVisible = false;
  String? _formError;
  String? _emailError;
  String? _passwordError;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _submitting = true;
      _formError = null;
      _emailError = null;
      _passwordError = null;
    });

    try {
      await ref.read(authControllerProvider.notifier).login(
            email: _email.text.trim(),
            password: _password.text,
          );
    } on ApiException catch (error) {
      setState(() {
        if (error.isValidation) {
          _emailError = error.fieldError('email');
          _passwordError = error.fieldError('password');
        } else {
          _formError = error.userMessage;
        }
      });
    } on NetworkException catch (error) {
      setState(() => _formError = error.userMessage);
    } finally {
      // Parola arayüzde bırakılmaz — başarıda da, hatada da.
      _password.clear();

      if (mounted) {
        setState(() {
          _submitting = false;
          _passwordVisible = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(FtTokens.space5),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: FtCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    Text('FlowTiger', style: Theme.of(context).textTheme.headlineSmall),
                    const SizedBox(height: FtTokens.space2),
                    Text(
                      'Devam etmek için giriş yapın.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: FtTokens.space5),
                    if (_formError != null) ...<Widget>[
                      FtErrorState(message: _formError!),
                      const SizedBox(height: FtTokens.space4),
                    ],
                    TextField(
                      key: const Key('login-email'),
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      enableSuggestions: false,
                      textInputAction: TextInputAction.next,
                      decoration: InputDecoration(
                        labelText: 'E-posta',
                        errorText: _emailError,
                      ),
                    ),
                    const SizedBox(height: FtTokens.space4),
                    TextField(
                      key: const Key('login-password'),
                      controller: _password,
                      obscureText: !_passwordVisible,
                      // Parola alanında otomatik düzeltme ve öneri
                      // KAPALI: klavye sözlüğüne parola sızmamalı.
                      autocorrect: false,
                      enableSuggestions: false,
                      decoration: InputDecoration(
                        labelText: 'Parola',
                        errorText: _passwordError,
                        suffixIcon: IconButton(
                          tooltip: _passwordVisible ? 'Parolayı gizle' : 'Parolayı göster',
                          icon: Icon(
                            _passwordVisible
                                ? Icons.visibility_off_outlined
                                : Icons.visibility_outlined,
                          ),
                          onPressed: () =>
                              setState(() => _passwordVisible = !_passwordVisible),
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
                          : const Text('Giriş yap'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
