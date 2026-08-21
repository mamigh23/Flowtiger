import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/ui.dart';
import 'customer_controller.dart';
import 'customer_errors.dart';

/// Müşteri formu — oluşturma ve düzenleme ortak ekranı.
///
/// [existing] verilirse düzenleme, verilmezse oluşturma.
///
/// Düzenlemede alanlar MEVCUT DEĞERLERLE dolar ve `phone` her istekte
/// gönderilir. Uç PUT'tur: gövde kaydın tam halini tanımlar, gönderilmeyen
/// alan boşaltılır. Formu boş açsaydık ya da phone'u gövdeden düşürseydik,
/// yalnızca adı düzelten kullanıcı telefonu silmiş olurdu.
class CustomerFormScreen extends ConsumerStatefulWidget {
  const CustomerFormScreen({this.existing, super.key});

  final Customer? existing;

  @override
  ConsumerState<CustomerFormScreen> createState() => _CustomerFormScreenState();
}

class _CustomerFormScreenState extends ConsumerState<CustomerFormScreen> {
  late final TextEditingController _name =
      TextEditingController(text: widget.existing?.name ?? '');
  late final TextEditingController _phone =
      TextEditingController(text: widget.existing?.phone ?? '');

  bool _submitting = false;
  Object? _error;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_submitting) return;

    setState(() {
      _submitting = true;
      _error = null;
    });

    final String trimmedPhone = _phone.text.trim();

    try {
      final CustomerRepository repository = ref.read(customerRepositoryProvider);

      // Boş metin null'a çevrilir: backend `nullable` bekler, boş string
      // bir telefon numarası değildir.
      final String? phone = trimmedPhone.isEmpty ? null : trimmedPhone;
      final Customer? existing = widget.existing;

      if (existing == null) {
        await repository.create(name: _name.text.trim(), phone: phone);
      } else {
        await repository.update(existing.id, name: _name.text.trim(), phone: phone);
      }

      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bool isEdit = widget.existing != null;

    final String? nameError = customerFieldError(_error, 'name');
    final String? phoneError = customerFieldError(_error, 'phone');
    final bool hasFormError = _error != null && nameError == null && phoneError == null;

    return Scaffold(
      appBar: AppBar(title: Text(isEdit ? 'Müşteriyi düzenle' : 'Yeni müşteri')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(FtTokens.space4),
          children: <Widget>[
            if (hasFormError) ...<Widget>[
              FtErrorState(message: customerErrorMessage(_error)),
              const SizedBox(height: FtTokens.space4),
            ],

            TextField(
              key: const Key('customer-name'),
              controller: _name,
              autocorrect: false,
              textInputAction: TextInputAction.next,
              decoration: InputDecoration(labelText: 'Ad', errorText: nameError),
            ),
            const SizedBox(height: FtTokens.space4),

            TextField(
              key: const Key('customer-phone'),
              controller: _phone,
              autocorrect: false,
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(labelText: 'Telefon', errorText: phoneError),
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
                  : const Text('Kaydet'),
            ),
          ],
        ),
      ),
    );
  }
}
