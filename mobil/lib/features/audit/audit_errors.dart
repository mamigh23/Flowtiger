import '../../core/network/api_exception.dart';

/// Denetim ekranının hata metinleri — web'deki auditErrors.ts ile birebir
/// aynı kurallar.
///
/// BU UÇTA 404 YOKTUR: tekil audit ucu yok, yalnızca liste var. 429 da
/// yoktur: uçta throttle tanımlı değil. Bu yüzden burada onlara karşılık
/// gelen özel bir metin de yok — olmayan bir duruma metin yazmak, bir gün
/// yanlış yerde gösterilecek bir metin yazmaktır.
///
/// 403 Team ve Invitation ile aynı anlamda GERÇEKTEN rol kısıtıdır
/// (AuditLogPolicy → Role::viewsAuditLogs() → yalnızca owner). Ama bu
/// bilgi İSTEMCİDE KARAR VERİLMEZ (playbook §3.1): arayüz kullanıcının
/// rolüne bakıp isteği engellemez, isteği yapar ve backend 403 dönerse
/// açıklar.
///
/// 401 burada ele alınmaz; ApiClient merkezî olarak token'ı siler ve
/// oturumu düşürür.
const String auditOwnerOnly = 'Bu bölüm yalnızca şirket sahiplerine açıktır.';
const String auditUnexpected = 'Beklenmedik bir hata oluştu. Lütfen tekrar deneyin.';

String auditErrorMessage(Object? error) {
  if (error is ApiException) {
    if (error.isForbidden) return auditOwnerOnly;

    // userMessage 500'ü maskeler (production'da "Server Error" gelir ve
    // kullanıcıya hiçbir şey anlatmaz), 422'yi ise OLDUĞU GİBİ geçirir.
    //
    // 422 bu uçta yalnızca `per_page` geçersizse doğar ve arayüz
    // `per_page` göndermez — yani normal kullanımda hiç görülmez. Yine de
    // maskelenmez: maskelenirse, bir gün gerçekten olduğunda kimse
    // sebebini öğrenemez.
    return error.userMessage;
  }

  if (error is NetworkException) return error.userMessage;

  return auditUnexpected;
}
