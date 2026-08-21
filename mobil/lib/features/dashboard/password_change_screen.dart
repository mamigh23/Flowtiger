/// BU DOSYA SİLİNECEK — gerçek ekran features/profile/ altındadır.
///
/// Paralel bir oturumda aynı test sözleşmesine karşı ikinci bir
/// PasswordChangeScreen yazılmış ve bu klasöre konmuştu. İki canlı
/// sürümün aynı anda bulunması, hangisinin gerçek olduğunu belirsiz
/// bırakıyordu; seçilen sürüm features/profile/password_change_screen.dart
/// (repository katmanını kullanan ve `password-submit` anahtarını taşıyan
/// sürüm — çift gönderim kilidi testi onu gerektiriyor).
///
/// Sınıf tanımı buradan KALDIRILDI: aynı adı taşıyan iki sınıf, yanlış
/// import edilmesi an meselesi olan bir tuzaktır. Yerine yalnızca
/// yönlendirme bırakıldı; çalıştığım ortamda dosya silme yetkisi yoktu.
///
/// Bu dosyayı hiçbir yer import etmiyor. Silinmesi güvenlidir ve
/// silinmelidir.
library;

export '../profile/password_change_screen.dart';
