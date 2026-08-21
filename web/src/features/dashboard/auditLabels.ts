/**
 * BU DOSYA SİLİNECEK — içeriği features/audit/auditLabels.ts'e TAŞINDI.
 *
 * Paralel bir oturum ortak dosyaları eski hâline döndürürken bu kopyayı
 * da geri getirdi. İki kopya tutmak, bir gün yalnızca birinin
 * güncellenmesi demektir: panel son hareket akışında, denetim ekranı tam
 * listede AYNI etiketleri kullanıyor.
 *
 * Tablo tanımı buradan KALDIRILDI, yalnızca yönlendirme bırakıldı;
 * çalıştığım ortamda dosya silme yetkisi yoktu.
 *
 * Bu dosyayı hiçbir yer import etmiyor. Silinmesi güvenlidir ve
 * silinmelidir.
 */
export { auditActionLabel, auditableTypeLabel, relativeTime, formatDateTime } from '@/features/audit/auditLabels';
