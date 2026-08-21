import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/ui.dart';
import 'customer_controller.dart';
import 'customer_errors.dart';
import 'customer_form_screen.dart';

/// Müşteri detayı ve silme.
///
/// Silme GERİ ALINAMAZ: customers tablosunda deleted_at yok, soft delete
/// bilinçli olarak kullanılmadı. Bu yüzden onay adımı zorunlu ve onay
/// metni müşterinin adını taşıyor.
class CustomerDetailScreen extends ConsumerStatefulWidget {
  const CustomerDetailScreen({required this.customerId, super.key});

  final int customerId;

  @override
  ConsumerState<CustomerDetailScreen> createState() => _CustomerDetailScreenState();
}

class _CustomerDetailScreenState extends ConsumerState<CustomerDetailScreen> {
  Customer? _customer;
  bool _loading = true;
  Object? _error;

  bool _confirming = false;
  bool _deleting = false;

  /// Liste ekranına "yenilenmen gerekiyor" demek için taşınır.
  bool _changed = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final Customer found = await ref.read(customerRepositoryProvider).find(widget.customerId);
      if (mounted) setState(() => _customer = found);
    } on Object catch (error) {
      if (mounted) setState(() => _error = error);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _delete() async {
    setState(() {
      _deleting = true;
      _error = null;
    });

    try {
      await ref.read(customerRepositoryProvider).delete(widget.customerId);
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (error) {
      // Kayıt başka bir oturumda silinmiş olabilir → 404. Bu da
      // "bulunamadı"dır; yetki hatası değil.
      if (mounted) {
        setState(() {
          _error = error;
          _confirming = false;
        });
      }
    } finally {
      if (mounted) setState(() => _deleting = false);
    }
  }

  Future<void> _edit() async {
    final Customer? current = _customer;
    if (current == null) return;

    final bool? saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => CustomerFormScreen(existing: current),
      ),
    );

    if (saved ?? false) {
      _changed = true;
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final Customer? customer = _customer;

    return Scaffold(
      appBar: AppBar(
        title: Text(customer?.name ?? 'Müşteri'),
        leading: BackButton(onPressed: () => Navigator.of(context).pop(_changed)),
        actions: <Widget>[
          if (customer != null)
            TextButton(onPressed: _edit, child: const Text('Düzenle')),
          if (customer != null)
            TextButton(
              onPressed: () => setState(() => _confirming = true),
              child: const Text('Sil'),
            ),
        ],
      ),
      body: SafeArea(child: _body(customer)),
    );
  }

  Widget _body(Customer? customer) {
    if (_loading && customer == null) return const FtLoading();

    if (customer == null) {
      return ListView(
        padding: const EdgeInsets.all(FtTokens.space4),
        children: <Widget>[
          FtErrorState(message: customerErrorMessage(_error)),
        ],
      );
    }

    return ListView(
      padding: const EdgeInsets.all(FtTokens.space4),
      children: <Widget>[
        if (_error != null) ...<Widget>[
          FtErrorState(message: customerErrorMessage(_error)),
          const SizedBox(height: FtTokens.space4),
        ],

        FtCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              // Kullanıcıya gösterilen numara customer_no'dur, id değil.
              _Row(label: 'Müşteri no', value: '${customer.customerNo}'),
              _Row(label: 'Telefon', value: customer.phone ?? '—'),
              _Row(label: 'Oluşturulma', value: customer.createdAt ?? '—'),
              _Row(label: 'Son güncelleme', value: customer.updatedAt ?? '—'),
            ],
          ),
        ),

        if (_confirming) ...<Widget>[
          const SizedBox(height: FtTokens.space4),
          FtCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text('${customer.name} kalıcı olarak silinecek. Bu işlem geri alınamaz.'),
                const SizedBox(height: FtTokens.space4),
                Row(
                  children: <Widget>[
                    FilledButton(
                      onPressed: _deleting ? null : _delete,
                      child: _deleting
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Evet, sil'),
                    ),
                    const SizedBox(width: FtTokens.space3),
                    TextButton(
                      onPressed: () => setState(() => _confirming = false),
                      child: const Text('Vazgeç'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: FtTokens.space3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(label, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: FtTokens.space1),
          Text(value, style: Theme.of(context).textTheme.bodyLarge),
        ],
      ),
    );
  }
}
