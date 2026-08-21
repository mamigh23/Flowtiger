import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_client.dart';
import '../../core/network/api_exception.dart';
import '../../core/providers.dart';
import '../../models/models.dart';

/// Müşteri listesi durumu.
///
/// Sıralama backend'de SABİT (customer_no artan) ve uçta sort/search/filter
/// parametresi yok; bu yüzden burada da arama ya da sıralama durumu YOK.
///
/// per_page gönderilmez: backend'in kendi varsayılanı (15) kullanılır.
/// İstemcinin sayfa boyutunu dayatması için bir sebep yok.
enum CustomerListStatus { loading, ready, error }

class CustomerListState {
  const CustomerListState({
    this.customers = const <Customer>[],
    this.status = CustomerListStatus.loading,
    this.currentPage = 1,
    this.lastPage = 1,
    this.total = 0,
    this.error,
  });

  final List<Customer> customers;
  final CustomerListStatus status;
  final int currentPage;
  final int lastPage;
  final int total;
  final Object? error;

  bool get isEmpty => status == CustomerListStatus.ready && customers.isEmpty;
  bool get hasPreviousPage => currentPage > 1;
  bool get hasNextPage => currentPage < lastPage;
}

class CustomerListController extends StateNotifier<CustomerListState> {
  CustomerListController({required ApiClient api})
      : _api = api,
        super(const CustomerListState());

  final ApiClient _api;

  Future<void> load({int page = 1}) async {
    state = CustomerListState(status: CustomerListStatus.loading, currentPage: page);

    try {
      final Map<String, dynamic> payload = await _api.getRaw(
        'customers',
        query: <String, String>{'page': '$page'},
      );

      final List<Customer> customers = (payload['data'] as List<dynamic>? ?? <dynamic>[])
          .map((dynamic item) => Customer.fromJson(item as Map<String, dynamic>))
          .toList();

      final Map<String, dynamic> meta =
          payload['meta'] as Map<String, dynamic>? ?? <String, dynamic>{};

      // ÖNCE bekle, SONRA state'e yaz: `state = state.copyWith(x: await ...)`
      // yazılsaydı Dart alıcıyı argümandan önce değerlendirir ve bayat bir
      // anlık görüntü üzerine yazılırdı.
      state = CustomerListState(
        customers: customers,
        status: CustomerListStatus.ready,
        currentPage: meta['current_page'] as int? ?? page,
        lastPage: meta['last_page'] as int? ?? 1,
        total: meta['total'] as int? ?? customers.length,
      );
    } on ApiException catch (error) {
      // 401'de token zaten silindi ve oturum düştü; burada ek iş yok.
      state = CustomerListState(status: CustomerListStatus.error, error: error, currentPage: page);
    } on NetworkException catch (error) {
      state = CustomerListState(status: CustomerListStatus.error, error: error, currentPage: page);
    }
  }

  Future<void> nextPage() => load(page: state.currentPage + 1);

  Future<void> previousPage() => load(page: state.currentPage - 1);

  Future<void> reload() => load(page: state.currentPage);
}

final StateNotifierProvider<CustomerListController, CustomerListState>
    customerListControllerProvider =
    StateNotifierProvider<CustomerListController, CustomerListState>(
  (Ref ref) => CustomerListController(api: ref.watch(apiClientProvider)),
);

/// Tek müşteri işlemleri.
///
/// GÖVDE SÖZLEŞMESİ: yalnızca `name` ve `phone`. customer_no ve company_id
/// GÖNDERİLMEZ — backend bunları sessizce düşürür ama göndermek, istemcinin
/// bu alanlar üzerinde söz sahibi olduğu yanılgısını doğurur (playbook §3.1).
///
/// `phone` HER İSTEKTE gönderilir, boşsa null olarak: uç PUT'tur, gövde
/// kaydın tam halini tanımlar ve gönderilmeyen alan BOŞALTILIR.
class CustomerRepository {
  const CustomerRepository(this._api);

  final ApiClient _api;

  Future<Customer> find(int id) async {
    final Map<String, dynamic> payload =
        await _api.get<Map<String, dynamic>>('customers/$id');

    return Customer.fromJson(payload);
  }

  Future<Customer> create({required String name, required String? phone}) async {
    final Map<String, dynamic> payload = await _api.post<Map<String, dynamic>>(
      'customers',
      body: <String, dynamic>{'name': name, 'phone': phone},
    );

    return Customer.fromJson(payload);
  }

  Future<Customer> update(int id, {required String name, required String? phone}) async {
    final Map<String, dynamic> payload = await _api.put<Map<String, dynamic>>(
      'customers/$id',
      body: <String, dynamic>{'name': name, 'phone': phone},
    );

    return Customer.fromJson(payload);
  }

  Future<void> delete(int id) => _api.delete('customers/$id');
}

final Provider<CustomerRepository> customerRepositoryProvider = Provider<CustomerRepository>(
  (Ref ref) => CustomerRepository(ref.watch(apiClientProvider)),
);
