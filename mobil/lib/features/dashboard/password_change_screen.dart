import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../widgets/ui.dart';

/// Profil → Parola değiştir.
///
/// Backend sözleşmesi: PUT /profile/password
/// Gövde tam olarak current_password, new_password ve
/// new_password_confirmation alanlarından oluşur.
class PasswordChangeScreen extends ConsumerStatefulWidget {
  const PasswordChangeScreen({super.key});

  @override
  ConsumerState<PasswordChangeScreen> createState() =>
      _PasswordChangeScreenState();
}

class _PasswordChangeScreenState extends ConsumerState<PasswordChangeScreen> {
  final TextEditingController _current = TextEditingController();
  final TextEditingController _next = TextEditingController();
  final TextEditingController _confirmation = TextEditingController();

  String? _currentError;
  String? _nextError;
  String? _confirmationError;
  String? _result;
  bool _submitting = false;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirmation.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_submitting) return;

    setState(() {
      _currentError = null;
      _nextError = null;
      _confirmationError = null;
      _result = null;
      _submitting = true;
    });

    try {
      final Map<String, dynamic> response =
          await ref.read(apiClientProvider).put<Map<String, dynamic>>(
        'profile/password',
        body: <String, dynamic>{
          'current_password': _current.text,
          'new_password': _next.text,
          'new_password_confirmation': _confirmation.text,
        },
      );

      final String message =
          response['message'] as String? ?? 'Parola güncellendi.';
      final int revoked =
          (response['other_logins_revoked'] as num?)?.toInt() ?? 0;

      // Başarıdan sonra parola değerleri ekranda tutulmaz.
      _current.clear();
      _next.clear();
      _confirmation.clear();

      if (!mounted) return;
      setState(() {
        _result = revoked > 0
            ? '$message Diğer oturumlar: $revoked'
            : message;
        _submitting = false;
      });
    } on ApiException catch (error) {
      if (!mounted) return;

      if (error.isValidation) {
        setState(() {
          _currentError = error.fieldError('current_password');
          _nextError = error.fieldError('new_password');
          // Backend confirmed/different hatasını new_password üzerinde
          // döndürebilir; confirmation alanı için yalnızca kendi hatasını
          // gösteriyoruz.
          _confirmationError =
              error.fieldError('new_password_confirmation');
          _submitting = false;
        });
        return;
      }

      setState(() {
        _result = error.userMessage;
        _submitting = false;
      });
    } on NetworkException catch (error) {
      if (!mounted) return;
      setState(() {
        _result = error.userMessage;
        _submitting = false;
      });
    }
  }

  InputDecoration _decoration(String label, String? error) =>
      InputDecoration(labelText: label, errorText: error);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Parola değiştir')),
      body: ListView(
        padding: const EdgeInsets.all(FtTokens.space4),
        children: <Widget>[
          FtCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'Parolanı güncelle',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: FtTokens.space3),
                TextField(
                  key: const Key('current-password'),
                  controller: _current,
                  obscureText: true,
                  enabled: !_submitting,
                  decoration: _decoration('Mevcut parola', _currentError),
                ),
                const SizedBox(height: FtTokens.space3),
                TextField(
                  key: const Key('new-password'),
                  controller: _next,
                  obscureText: true,
                  enabled: !_submitting,
                  decoration: _decoration('Yeni parola', _nextError),
                ),
                const SizedBox(height: FtTokens.space3),
                TextField(
                  key: const Key('new-password-confirmation'),
                  controller: _confirmation,
                  obscureText: true,
                  enabled: !_submitting,
                  decoration: _decoration(
                    'Yeni parola tekrar',
                    _confirmationError,
                  ),
                ),
                const SizedBox(height: FtTokens.space4),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _submitting ? null : () => unawaited(_submit()),
                    child: _submitting
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Parolayı değiştir'),
                  ),
                ),
                if (_result != null) ...<Widget>[
                  const SizedBox(height: FtTokens.space3),
                  Text(_result!, key: const Key('password-result')),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
