import '../../core/network/api_exception.dart';

/// Ekip ekranlarının hata metinleri — web'deki memberErrors.ts ile
/// birebir aynı kurallar.
///
/// Customer'ın TERSİ bir 403 anlamı var ve bu ayrımı kaybetmemek önemli:
///
///   Customer: 403 = "aktif şirket yok / üyelik iptal". Rol kısıtı DEĞİL.
///   Team:     403 = ROL kısıtı. CompanyMemberPolicy → Role.managesMembers()
///             → owner. Member rolündeki kullanıcı viewAny dahil her şeyde
///             403 alır.
///
/// Bu yüzden burada "yalnızca şirket sahiplerine açık" demek doğrudur.
/// AMA bu bilgi İSTEMCİDE KARAR VERİLMEZ (playbook §3.1): arayüz rolüne
/// bakıp isteği engellemez, isteği yapar ve backend 403 dönerse açıklar.
/// Aksi hâlde yetki kuralı iki ayrı yerde tanımlı olur ve zamanla ayrışır.
///
/// Laravel'in ham "This action is unauthorized." metni kullanıcıya
/// gösterilmez: İngilizce ve hiçbir şey anlatmıyor.
const String memberNotFound = 'Üye bulunamadı.';
const String ownerOnlySection = 'Bu bölüm yalnızca şirket sahiplerine açıktır.';
const String cannotRemoveSelf = 'Kendinizi ekipten çıkaramazsınız.';

/// Son owner kuralının backend'deki makine-okunur kodu.
const String lastOwnerCode = 'company_requires_an_owner';

/// Genel (liste / detay / düzenleme) hata metni.
String memberErrorMessage(Object? error) {
  if (error is ApiException) {
    if (error.isNotFound) return memberNotFound;
    if (error.isForbidden) return ownerOnlySection;

    // Son owner kuralı: yetki sorunu DEĞİL (422). İsteği yapanın yetkisi
    // tamdır, ama işlem şirketi ownersız bırakırdı. Backend'in mesajı
    // kullanıcıya uygun; olduğu gibi gösterilir. userMessage 500'ü
    // maskeler, 422'yi olduğu gibi geçirir.
    return error.userMessage;
  }

  if (error is NetworkException) return error.userMessage;

  return 'Beklenmedik bir hata oluştu. Lütfen tekrar deneyin.';
}

/// Ekipten çıkarma fiiline özgü hata metni.
///
/// Buradaki 403 "bölüm sahiplere açık" demek DEĞİLDİR — kullanıcı zaten
/// owner, aksi hâlde detayı bile göremezdi. Policy, kendini çıkarma
/// kontrolünü yetki kontrolünden ÖNCE yapar ve 403 döner.
String removeErrorMessage(Object? error) {
  if (error is ApiException && error.isForbidden) return cannotRemoveSelf;

  return memberErrorMessage(error);
}

/// 422 alan hatası; son owner kuralında `errors` gelmez, null döner.
String? memberFieldError(Object? error, String field) {
  if (error is ApiException && error.isValidation) return error.fieldError(field);
  return null;
}
