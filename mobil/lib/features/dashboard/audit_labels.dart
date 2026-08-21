/// BU DOSYA SİLİNECEK — içeriği features/audit/audit_labels.dart'a TAŞINDI.
///
/// Buradaki eski tablo backend'de HİÇ OLMAYAN kodlar içeriyordu
/// ('auth.login', 'auth.logout', 'auth.password_changed',
/// 'member.invited', 'member.joined', 'company.created',
/// 'company.updated') ve gerçekten gelen on iki kodu kaçırıyordu. Sonuç:
/// panelde bazı hareketler ham kod olarak görünüyordu.
///
/// Doğru tablo backend'in AuditAction enum'ıyla birebirdir (23 değer) ve
/// features/audit/audit_labels.dart'ta yaşar. Eski içerik buraya geri
/// KONMAMALIDIR; iki kopya tutmak, bir gün yalnızca birinin
/// güncellenmesi demekti.
///
/// Sınıf/sabit tanımı buradan kaldırıldı, yalnızca yönlendirme bırakıldı;
/// çalıştığım ortamda dosya silme yetkisi yoktu.
///
/// Bu dosyayı hiçbir yer import etmiyor. Silinmesi güvenlidir ve
/// silinmelidir.
library;

export '../audit/audit_labels.dart';
