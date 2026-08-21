import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../widgets/ui.dart';
import 'profile_controller.dart';
import 'profile_errors.dart';

/// Parola değiştirme.
///
/// GÖVDE TAM OLARAK ÜÇ ALAN:
///   current_password, new_password, new_password_confirmation
///
/// Kimlik parametresi YOKTUR: üzerinde işlem yapılan kullanıcı daima
/// oturumdan gelir.
///
/// YANLIŞ MEVCUT PAROLA 422 DÖNER, 401 DEĞİL — ve bu ayrım burada
/// hayatidir. Kullanıcının kimliği doğrulanmış durumda; hatalı olan tek
/// şey gönderdiği alan. 401 sanılıp oturum kapatılsaydı, parolasını
/// yanlış yazan kullanıcı sistemden atılırdı. Bu ekran hiçbir yerde
/// oturum kapatmaz; 401 zaten merkezî olarak ApiClient'ta ele alınır.
///
/// OTURUM ETKİSİ: backend mevcut token'ı KORUR, diğerlerini iptal eder.
/// `other_logins_revoked` gösterilir — "hesabım ele geçirilmiş miydi"
/// sorusunu araştıran kullanıcı için tek anlamlı sinyal odur.
///
/// 429 GERÇEKTİR (6/dk): `current_password` kuralı bu ucu, oturumu ele
/// geçirmiş ama parolayı bilmeyen bir saldırgan için parola DENEME
/// yüzeyine çevirir. Bekleme süresi backend'in Retry-After başlığından
/// gelir; uydurulmaz.
///
/// PAROLA HİÇBİR YERE YAZILMAZ: ne log'a, ne yanıta, ne de başarıdan
/// sonra ekranda kalan bir alana. Alanlar başarıda temizlenir.
class PasswordChangeScreen extends ConsumerStatefulWidget {
  const PasswordChangeScreen({super.key});

  @override
  ConsumerState<PasswordChangeScreen> createState() => _PasswordChangeScreenState();
}

class _PasswordChangeScreenState extends ConsumerState<PasswordChangeScreen> {
  final TextEditingController _current = TextEditingController();
  final TextEditingController _next = TextEditingController();
  final TextEditingController _confirmation = TextEditingController();

  bool _submitting = false;
  Object? _error;
  PasswordChangeResult? _result;

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
      _submitting = true;
      _error = null;
      _result = null;
    });

    try {
      final PasswordChangeResult result =
          await ref.read(profileRepositoryProvider).changePassword(
                currentPassword: _current.text,
                newPassword: _next.text,
                newPasswordConfirmation: _confirmation.text,
              );

      if (mounted) {
        // Parola ekranda gereğinden uzun durmaz.
        _current.clear();
        _next.clear();
        _confirmation.clear();

        setState(() => _result = result);
      }
    } on Object catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final String? currentError = profileFieldError(_error, 'current_password');

    // `confirmed` ve `different` kurallarının hataları da new_password
    // alanında döner; üçü aynı yerde gösterilir.
    final String? nextError = profileFieldError(_error, 'new_password');

    final bool hasFormError =
        _error != null && currentError == null && nextError == null;

    final PasswordChangeResult? result = _result;

    return Scaffold(
      appBar: AppBar(title: const Text('Parola değiştir')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(FtTokens.space4),
          children: <Widget>[
            if (hasFormError) ...<Widget>[
              FtErrorState(message: profileErrorMessage(_error)),
              const SizedBox(height: FtTokens.space4),
            ],

            // Başarı bir HATA DEĞİLDİR; FtErrorState ile gösterilmez.
            if (result != null && !hasFormError) ...<Widget>[
              Text(
                result.otherLoginsRevoked > 0
                    ? '${result.message} Diğer ${result.otherLoginsRevoked} oturum kapatıldı.'
                    : '${result.message} Başka açık oturumunuz yoktu.',
                key: const Key('password-result'),
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: FtTokens.space4),
            ],

            TextField(
              key: const Key('current-password'),
              controller: _current,
              obscureText: true,
              autocorrect: false,
              enableSuggestions: false,
              decoration: InputDecoration(
                labelText: 'Mevcut parola',
                errorText: currentError,
              ),
            ),
            const SizedBox(height: FtTokens.space4),

            TextField(
              key: const Key('new-password'),
              controller: _next,
              obscureText: true,
              autocorrect: false,
              enableSuggestions: false,
              decoration: InputDecoration(
                labelText: 'Yeni parola',
                errorText: nextError,
              ),
            ),
            const SizedBox(height: FtTokens.space4),

            TextField(
              key: const Key('new-password-confirmation'),
              controller: _confirmation,
              obscureText: true,
              autocorrect: false,
              enableSuggestions: false,
              decoration: const InputDecoration(labelText: 'Yeni parola (tekrar)'),
            ),
            const SizedBox(height: FtTokens.space5),

            FilledButton(
              key: const Key('password-submit'),
              onPressed: _submitting ? null : () => unawaited(_submit()),
              child: _submitting
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Parolayı değiştir'),
            ),
          ],
        ),
      ),
    );
  }
}
