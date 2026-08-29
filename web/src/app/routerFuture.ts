/**
 * React Router v7 davranışları — ŞİMDİDEN AÇIK.
 *
 * Bayraklar bir uyarıyı susturmak için değil, v7'nin davranışını BUGÜN
 * benimsemek için açık. Uyarı zaten bir uyarıydı: "bu davranış
 * değişecek". Onu görmezden gelmek, değişimi sürüm yükseltmesinin en
 * kötü anına — her şeyin aynı anda kırıldığı ana — ertelemek olurdu.
 *
 * v7_startTransition
 *   Router durum güncellemeleri `React.startTransition` içine alınır.
 *   Gezinme artık acil olmayan bir güncelleme: yavaş bir ekran açılırken
 *   arayüz donmaz.
 *
 * v7_relativeSplatPath
 *   Splat (`*`) rotalarının içindeki göreli yollar sezgisel biçimde
 *   çözülür. Uygulamada splat rotası yalnızca `/app`'e MUTLAK yolla
 *   yönlendiren yakalayıcıdır, dolayısıyla davranış farkı yoktur — ama
 *   bir gün splat altında göreli bir bağlantı yazılırsa doğru olanı
 *   yapar.
 *
 * ÜRETİM VE TESTLER AYNI SABİTİ KULLANIR.
 *
 * Bu, kod tekrarından kaçınmak için değil: iki taraf ayrı yazılsaydı bir
 * gün biri güncellenir diğeri unutulur ve testler ÜRETİMDEN FARKLI bir
 * router semantiğini sınamaya başlardı. O andan sonra yeşil bir suite,
 * çalışan bir uygulamanın kanıtı olmaktan çıkar.
 */
export const ROUTER_FUTURE = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;
