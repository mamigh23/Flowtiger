import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/ui.dart';
import 'customer_controller.dart';
import 'customer_detail_screen.dart';
import 'customer_errors.dart';
import 'customer_form_screen.dart';

/// Müşteri listesi.
///
/// Arama kutusu ya da sıralama kontrolü YOK: backend'de sort/search/filter
/// parametresi yok ve olmayan bir özelliği göstermek hem kullanıcıyı hem
/// sonraki geliştiriciyi yanıltır (playbook §11).
class CustomersScreen extends ConsumerStatefulWidget {
  const CustomersScreen({super.key});

  @override
  ConsumerState<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends ConsumerState<CustomersScreen> {
  @override
  void initState() {
    super.initState();
    // build sırasında provider değiştirmek Riverpod'da hatadır.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(ref.read(customerListControllerProvider.notifier).load());
    });
  }

  Future<void> _openDetail(Customer customer) async {
    final bool? changed = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(
        builder: (_) => CustomerDetailScreen(customerId: customer.id),
      ),
    );

    if ((changed ?? false) && mounted) {
      await ref.read(customerListControllerProvider.notifier).reload();
    }
  }

  Future<void> _create() async {
    final bool? created = await Navigator.of(context).push<bool>(
      MaterialPageRoute<bool>(builder: (_) => const CustomerFormScreen()),
    );

    if ((created ?? false) && mounted) {
      await ref.read(customerListControllerProvider.notifier).load();
    }
  }

  @override
  Widget build(BuildContext context) {
    final CustomerListState state = ref.watch(customerListControllerProvider);

    return Scaffold(
      // Kabuğun Scaffold'u üstte; buradaki yalnızca kayan eylem düğmesi
      // için. Bu yüzden appBar YOK — aktif şirket üst çubukta zaten var.
      backgroundColor: Colors.transparent,
      floatingActionButton: FloatingActionButton(
        tooltip: 'Yeni müşteri',
        onPressed: () => unawaited(_create()),
        child: const Icon(Icons.add),
      ),
      body: _body(state),
    );
  }

  Widget _body(CustomerListState state) {
    switch (state.status) {
      case CustomerListStatus.loading:
        return const FtLoading();

      case CustomerListStatus.error:
        return ListView(
          padding: const EdgeInsets.all(FtTokens.space4),
          children: <Widget>[
            FtErrorState(message: customerErrorMessage(state.error)),
            const SizedBox(height: FtTokens.space4),
            FilledButton(
              onPressed: () =>
                  unawaited(ref.read(customerListControllerProvider.notifier).reload()),
              child: const Text('Tekrar dene'),
            ),
          ],
        );

      case CustomerListStatus.ready:
        if (state.customers.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(FtTokens.space5),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  const Text('Henüz müşteri yok.'),
                  const SizedBox(height: FtTokens.space2),
                  Text(
                    'İlk müşteriyi ekleyerek başlayın.',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          );
        }

        return Column(
          children: <Widget>[
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.all(FtTokens.space3),
                itemCount: state.customers.length,
                itemBuilder: (BuildContext context, int index) {
                  final Customer customer = state.customers[index];

                  return Card(
                    elevation: 0,
                    margin: const EdgeInsets.only(bottom: FtTokens.space2),
                    shape: RoundedRectangleBorder(
                      side: BorderSide(color: Theme.of(context).colorScheme.outlineVariant),
                      borderRadius: BorderRadius.circular(FtTokens.radiusLg),
                    ),
                    child: ListTile(
                      // Kullanıcıya gösterilen numara customer_no'dur.
                      leading: Text(
                        '#${customer.customerNo}',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      title: Text(customer.name),
                      // Telefon yoksa uydurma değer değil, boşluk işareti.
                      subtitle: Text(customer.phone ?? '—'),
                      onTap: () => unawaited(_openDetail(customer)),
                    ),
                  );
                },
              ),
            ),

            if (state.lastPage > 1)
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: FtTokens.space4,
                  vertical: FtTokens.space2,
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: <Widget>[
                    TextButton(
                      onPressed: state.hasPreviousPage
                          ? () => unawaited(
                                ref.read(customerListControllerProvider.notifier).previousPage(),
                              )
                          : null,
                      child: const Text('Önceki'),
                    ),
                    Text(
                      'Sayfa ${state.currentPage} / ${state.lastPage}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    TextButton(
                      onPressed: state.hasNextPage
                          ? () => unawaited(
                                ref.read(customerListControllerProvider.notifier).nextPage(),
                              )
                          : null,
                      child: const Text('Sonraki'),
                    ),
                  ],
                ),
              ),
          ],
        );
    }
  }
}
