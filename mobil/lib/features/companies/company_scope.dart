import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_controller.dart';
import 'company_controller.dart';

// Local lifetime only. No company identifier is added to API requests.
// AuthState identity also distinguishes two logins for the same account.
typedef CompanyScope = (AuthState, int?, int?);

void resetOnCompanyScopeChange(Ref ref, void Function() reset) {
  // Listen to the state sources directly so reset completes synchronously,
  // before code can start the next company's request using a saved notifier.
  ref.listen<AuthState>(authControllerProvider, (_, __) => reset());
  ref.listen<CompanyState>(companyControllerProvider, (CompanyState? previous, CompanyState next) {
    if (previous?.activeCompanyId != next.activeCompanyId ||
        previous?.selectingId != next.selectingId) {
      reset();
    }
  });
}

final Provider<CompanyScope> companyScopeProvider = Provider<CompanyScope>((Ref ref) {
  final AuthState auth = ref.watch(authControllerProvider);
  final (int?, int?) company = ref.watch(
    companyControllerProvider.select(
      (CompanyState state) => (state.activeCompanyId, state.selectingId),
    ),
  );
  return (auth, company.$1, company.$2);
});
