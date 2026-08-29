/**
 * Karşılama ve tarih metinleri.
 *
 * SAAT DIŞARIDAN VERİLİR, içeride okunmaz. `new Date()` bu modülün içinde
 * çağrılsaydı fonksiyonlar saf olmaktan çıkar ve test edilmeleri için
 * sahte saat kurmak gerekirdi — yani en basit kural bile en pahalı
 * yöntemle sınanırdı.
 *
 * Intl KULLANILMIYOR: Node'un ICU derlemesi ortama göre değişir ve tr-TR
 * desteği olmayan bir derlemede sessizce en-US biçimine düşer. Ay ve gün
 * adları burada sabit; her ortamda aynı.
 */

const MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
] as const;

/** Dizinin sırası `Date.getDay()` ile aynı: 0 = Pazar. */
const WEEKDAYS = [
  'Pazar',
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
] as const;

export const GREETING_MORNING = 'Günaydın';
export const GREETING_AFTERNOON = 'İyi günler';
export const GREETING_EVENING = 'İyi akşamlar';

/**
 * Saate göre selamlama.
 *
 * Sınırlar: 05–11 sabah, 12–17 öğleden sonra, kalanı akşam. Gece
 * yarısından sonrası da "akşam"dır — saat üçte "günaydın" demek,
 * kullanıcının o an yaşadığı günü yanlış adlandırmaktır.
 */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return GREETING_MORNING;
  if (hour >= 12 && hour < 18) return GREETING_AFTERNOON;

  return GREETING_EVENING;
}

/** "22 Ağustos 2026, Cumartesi" */
export function formatToday(date: Date): string {
  const month = MONTHS[date.getMonth()];
  const weekday = WEEKDAYS[date.getDay()];

  // Beklenmedik bir tarih nesnesinde uydurma metin üretilmez.
  if (month === undefined || weekday === undefined) return '';

  return `${date.getDate()} ${month} ${date.getFullYear()}, ${weekday}`;
}
