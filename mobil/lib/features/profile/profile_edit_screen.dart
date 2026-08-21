import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/ui.dart';
import 'profile_controller.dart';
import 'profile_errors.dart';

/// Hesap bilgileri — ad, e-posta ve doğrulama durumu.
///
/// GÖVDE TAM OLARAK { name, email }. Rol değişimi ayrı bir uçtur ve
/// owner'a aittir; kullanıcı kendi rolünü kendi değiştiremez. Aktif
/// şirket ise yalnızca POST /companies/{id}/select ile değişir.
///
/// BU EKRANDA ROL KONTROLÜ YOKTUR: uç owner-only değil, kullanıcı kendi
/// kaydını düzenliyor.
///
/// E-POSTA TRIM EDİLİR, KÜÇÜK HARFE ÇEVRİLMEZ. Baştaki/sondaki boşluk
/// backend'in `email` kuralına takılır ve kullanıcı sebebini anlamaz;
/// normalizasyonun kendisi ise backend'in tek noktasıdır. Yanıtta dönen
/// normalize adres forma geri yazılır.
///
/// DOĞRULAMA KARTI ÜSTTE: "adresin doğrulanmamış" bir durum bildirimidir
/// ve formun altında kalırsa küçük ekranda hiç görünmez.
class ProfileEditScreen extends ConsumerStatefulWidget {
  const ProfileEditScreen({super.key});

  @override
  ConsumerState<ProfileEditScreen> createState() => _ProfileEditScreenState();
}

class _ProfileEditScreenState extends ConsumerState<ProfileEditScreen> {
  final TextEditingController _name = TextEditingController();
  final TextEditingController _email = TextEditingController();

  bool _saving = false;
  bool _saved = false;
  Object? _error;

  /// Backend'in "zaten doğrulanmış" dediği adres.
  ///
  /// SAHTE ZAMAN DAMGASI ÜRETİLMEZ: `email_verified_at`'in gerçek
  /// değerini bilmiyoruz ve uydurmak, kayda bakan birine yanlış bilgi
  /// vermek olurdu. Bilinen tek şey "hangi adres için doğrulanmış
  /// denildi" — ve adres değişince bu bilgi kendiliğinden geçersizleşir.
  String? _verifiedFor;

  bool _sending = false;
  String? _verificationMessage;
  Object? _verificationError;

  @override
  void initState() {
    super.initState();
    // build sırasında provider değiştirmek Riverpod'da hatadır.
    WidgetsBinding.instance.addPostFrameCallback((_) => unawaited(_load()));
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    await ref.read(profileControllerProvider.notifier).load();

    final User? user = ref.read(profileControllerProvider).user;
    if (user != null && mounted) _syncFrom(user);
  }

  /// Alanlar build SIRASINDA değil, veri geldiğinde doldurulur:
  /// TextEditingController bir ChangeNotifier'dır ve build içinde
  /// değiştirilmesi "build sırasında markNeedsBuild" hatası doğurur.
  void _syncFrom(User user) {
    _name.text = user.name;
    _email.text = user.email;
  }

  Future<void> _save() async {
    if (_saving) return;

    setState(() {
      _saving = true;
      _error = null;
      _saved = false;
    });

    try {
      final User updated = await ref.read(profileRepositoryProvider).update(
            name: _name.text.trim(),
            email: _email.text.trim(),
          );

      ref.read(profileControllerProvider.notifier).apply(updated);

      if (mounted) {
        _syncFrom(updated);
        setState(() => _saved = true);
      }

      // OTURUMDAKİ KULLANICI BURADA TAZELENMEZ.
      //
      // AuthController.restoreSession() tek yol olurdu ama o metot
      // BAŞARISIZLIKTA OTURUMU KAPATIYOR (fail-closed, açılış için doğru
      // bir tercih). Kaydetmeden sonra çağrılsaydı, geçici bir ağ hatası
      // profilini güncelleyen kullanıcıyı sistemden atardı.
      //
      // Bedeli: Profil sekmesindeki ad bir sonraki açılışa kadar eski
      // kalabilir. Bu, yanlışlıkla çıkış yaptırmaktan çok daha ucuz.
    } on Object catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _sendVerification() async {
    if (_sending) return;

    setState(() {
      _sending = true;
      _verificationError = null;
      _verificationMessage = null;
    });

    try {
      final VerificationResult result =
          await ref.read(profileRepositoryProvider).sendVerificationLink();

      if (mounted) {
        setState(() {
          // KARAR `code` ALANINA GÖRE, mesaj metnine göre DEĞİL.
          if (result.alreadyVerified) {
            // Form alanı değil, KAYITTAKİ adres: kullanıcı alanı
            // düzenlemiş ama kaydetmemiş olabilir ve backend'in
            // doğruladığı adres o değildir.
            _verifiedFor = ref.read(profileControllerProvider).user?.email;
            _verificationMessage = 'E-posta adresiniz zaten doğrulanmış.';
          } else {
            _verificationMessage = 'Doğrulama bağlantısı e-posta adresinize gönderildi.';
          }
        });
      }
    } on Object catch (error) {
      // 429 buraya düşer: sınır 6/dk ve profileErrorMessage backend'in
      // Retry-After başlığındaki saniyeyi kullanır.
      if (mounted) setState(() => _verificationError = error);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ProfileState state = ref.watch(profileControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Hesap bilgileri')),
      body: SafeArea(child: _body(state)),
    );
  }

  Widget _body(ProfileState state) {
    switch (state.status) {
      case ProfileStatus.loading:
        return const FtLoading();

      case ProfileStatus.error:
        return ListView(
          padding: const EdgeInsets.all(FtTokens.space4),
          children: <Widget>[
            FtErrorState(message: profileErrorMessage(state.error)),
            const SizedBox(height: FtTokens.space4),
            FilledButton(
              onPressed: () => unawaited(_load()),
              child: const Text('Tekrar dene'),
            ),
          ],
        );

      case ProfileStatus.ready:
        final User user = state.user!;

        return ListView(
          padding: const EdgeInsets.all(FtTokens.space4),
          children: <Widget>[
            _verificationCard(user),
            const SizedBox(height: FtTokens.space4),
            _accountCard(),
          ],
        );
    }
  }

  Widget _verificationCard(User user) {
    // Adres değişince "zaten doğrulanmış" işareti kendiliğinden düşer:
    // işaret bir boole değil, BİR ADRESE bağlı.
    final bool verified = user.isEmailVerified || _verifiedFor == user.email;

    return FtCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text('E-posta doğrulama', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: FtTokens.space2),
          FtBadge(label: verified ? 'Doğrulandı' : 'Doğrulama bekliyor'),

          if (_verificationError != null) ...<Widget>[
            const SizedBox(height: FtTokens.space3),
            FtErrorState(message: profileErrorMessage(_verificationError)),
          ],

          // Başarı bir HATA DEĞİLDİR; FtErrorState ile gösterilmez.
          if (_verificationMessage != null && _verificationError == null) ...<Widget>[
            const SizedBox(height: FtTokens.space3),
            Text(_verificationMessage!, style: Theme.of(context).textTheme.bodySmall),
          ],

          if (!verified) ...<Widget>[
            const SizedBox(height: FtTokens.space3),
            FilledButton(
              key: const Key('verification-send'),
              onPressed: _sending ? null : () => unawaited(_sendVerification()),
              child: _sending
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Doğrulama bağlantısı gönder'),
            ),
          ],
        ],
      ),
    );
  }

  Widget _accountCard() {
    final String? nameError = profileFieldError(_error, 'name');
    final String? emailError = profileFieldError(_error, 'email');

    // Alan altında gösterilemeyen her hata form seviyesinde gösterilir;
    // sessizce yutulan bir hata, kullanıcıya "kaydedildi" izlenimi verir.
    final bool hasFormError =
        _error != null && nameError == null && emailError == null;

    return FtCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          if (hasFormError) ...<Widget>[
            FtErrorState(message: profileErrorMessage(_error)),
            const SizedBox(height: FtTokens.space3),
          ],

          if (_saved && !hasFormError) ...<Widget>[
            Text(
              'Profil bilgileriniz güncellendi.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: FtTokens.space3),
          ],

          TextField(
            key: const Key('profile-name'),
            controller: _name,
            decoration: InputDecoration(labelText: 'Ad', errorText: nameError),
          ),
          const SizedBox(height: FtTokens.space4),

          TextField(
            key: const Key('profile-email'),
            controller: _email,
            autocorrect: false,
            enableSuggestions: false,
            keyboardType: TextInputType.emailAddress,
            decoration: InputDecoration(labelText: 'E-posta', errorText: emailError),
          ),
          const SizedBox(height: FtTokens.space5),

          FilledButton(
            key: const Key('profile-save'),
            onPressed: _saving ? null : () => unawaited(_save()),
            child: _saving
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Kaydet'),
          ),
        ],
      ),
    );
  }
}
