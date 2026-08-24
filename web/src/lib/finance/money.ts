/**
 * Para biçimlendirme ve okuma — YALNIZCA GÖSTERİM VE GİRDİ.
 *
 * BU DOSYA HESAP YAPMAZ. Backend'deki Money, RoundingPolicy ve
 * VatCalculator'ın karşılığı frontend'de YOKTUR ve olmayacak. Net, KDV ve
 * brüt her zaman sunucudan gelir; buradaki işlevler yalnızca tam sayı
 * kuruşu ekrana yazar ve kullanıcının yazdığını tam sayı kuruşa çevirir.
 *
 * İki hesaplama motoru olsaydı, bir gün ikisi farklı sonuç verir ve
 * hangisinin doğru olduğu bilinemezdi.
 *
 * FLOAT KULLANILMAZ.
 * JavaScript'in Number tipi IEEE754'tür ve 0.1 + 0.2 ≠ 0.3'tür.
 * Bu yüzden burada `parseFloat`, `toFixed`, ondalık bölme ya da ondalık
 * çarpma HİÇ GEÇMEZ — biçimlendirme ve okuma tamamen DİZGİ işlemiyle
 * yapılır. Kuruş ile lirayı ayırmak için `minor / 100` yazmak yeterdi ama
 * o bölme büyük değerlerde kesinliğini kaybederdi.
 *
 * Para değeri uygulama içinde DAİMA tam sayı kuruş olarak taşınır;
 * ondalık gösterim yalnızca ekranda ve yalnızca bir dizgidir.
 */

/**
 * JSON'da güvenle taşınabilen en büyük tam sayı: 2^53 − 1.
 *
 * Backend'deki `Money::MAX_SAFE_MINOR` ile AYNI değerdir ve aynı sebeple
 * vardır: bu sınırın üstündeki bir tam sayı JavaScript'te sessizce
 * bozulur. Sınırı iki tarafta da uygulamak, bozulmayı kullanıcının
 * yazdığı anda yakalamayı sağlar.
 */
export const MAX_SAFE_MINOR = 9007199254740991;

/**
 * Geçersiz para girdisi ya da güvenli aralık ihlali.
 *
 * Ayrı bir sınıf: çağıran taraf bunu diğer hatalardan ayırıp kullanıcıya
 * alan altında gösterebilmeli.
 */
export class MoneyFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyFormatError';
  }
}

/**
 * Para biriminin kullanıcıya gösterilen kısaltması.
 *
 * Tanınmayan bir kod olduğu gibi yazılır — uydurma bir sembol üretmek,
 * yanlış para birimini doğruymuş gibi göstermekten kötüdür.
 */
const CURRENCY_LABELS: Record<string, string> = {
  TRY: 'TL',
};

function currencyLabel(currency: string): string {
  return CURRENCY_LABELS[currency] ?? currency;
}

/**
 * Türkçe biçim: binlik ayıracı nokta, ondalık ayıracı virgül.
 *
 *   1.234,56  → gruplanmış
 *   1234,56   → gruplanmamış
 *   1234      → kuruşsuz (tam lira)
 *
 * İki ayrı desen bilinçli: gruplu biçimde her grup TAM ÜÇ hane olmalı.
 * Tek desenle yazılsaydı "12.34" gibi bir girdi geçerli sayılır ve
 * kullanıcının 12,34 mü 1234 mü demek istediği belirsiz kalırdı.
 */
const GROUPED_INPUT = /^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$/;
const PLAIN_INPUT = /^\d+(?:,\d{1,2})?$/;

/**
 * Tam sayı kuruşu okunur dizgiye çevirir — para birimi eki OLMADAN.
 *
 *   123456 → "1.234,56"
 *   100    → "1,00"
 *   0      → "0,00"
 *
 * Negatif değerler biçimlendirilebilir (ör. ileride bir fark alanı);
 * okunamazlar (bkz. parseMinorAmount).
 */
export function formatMinorAmount(minor: number): string {
  if (!Number.isInteger(minor)) {
    throw new MoneyFormatError('Tutar tam sayı kuruş olmalıdır.');
  }

  if (!Number.isSafeInteger(minor)) {
    throw new MoneyFormatError('Tutar güvenli tam sayı aralığının dışında.');
  }

  const negative = minor < 0;

  // Dizgi üzerinden ayırma: bölme yok, dolayısıyla kesinlik kaybı da yok.
  // padStart(3) sayesinde 0 ve tek haneli kuruşlar da doğru ayrılır.
  const digits = String(negative ? -minor : minor).padStart(3, '0');
  const kurus = digits.slice(-2);
  const lira = digits.slice(0, -2);

  // Sağdan üçerli gruplama.
  const grouped = lira.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${negative ? '-' : ''}${grouped},${kurus}`;
}

/**
 * Tam sayı kuruşu para birimi ekiyle biçimlendirir.
 *
 *   formatMoney(123456, 'TRY') → "1.234,56 TL"
 */
export function formatMoney(minor: number, currency: string): string {
  return `${formatMinorAmount(minor)} ${currencyLabel(currency)}`;
}

/**
 * Kullanıcının yazdığı tutarı tam sayı kuruşa çevirir.
 *
 *   "1.234,56" → 123456
 *   "1234,56"  → 123456
 *   "1234"     → 123400
 *   "0"        → 0
 *
 * YUVARLAMA YAPILMAZ. En fazla iki ondalık hane kabul edilir; üçüncü hane
 * gelirse girdi REDDEDİLİR. Sessizce yuvarlamak, kullanıcının yazdığından
 * farklı bir tutarı kaydetmek olurdu.
 *
 * NEGATİF DEĞER OKUNMAZ. Yön ve işaret kararı alan bazında verilir
 * (finans kaydında `direction`, ödemede tutarın kendisi); burada eksi
 * kabul etmek o kararı sessizce atlatırdı.
 */
export function parseMinorAmount(input: string): number {
  const trimmed = input.trim();

  if (trimmed === '') {
    throw new MoneyFormatError('Tutar boş olamaz.');
  }

  if (!GROUPED_INPUT.test(trimmed) && !PLAIN_INPUT.test(trimmed)) {
    throw new MoneyFormatError('Geçerli bir tutar girin (örnek: 1.234,56).');
  }

  const [whole = '', fraction = ''] = trimmed.split(',');

  const wholeDigits = whole.replace(/\./g, '');
  // "5" tek haneli kuruş demektir: 0,5 TL = 50 kuruş.
  const kurusDigits = fraction.padEnd(2, '0');

  // Baştaki sıfırlar atılır ama en az bir hane kalır ("000" → "0").
  const digits = `${wholeDigits}${kurusDigits}`.replace(/^0+(?=\d)/, '');

  const minor = Number(digits);

  if (!Number.isSafeInteger(minor) || minor > MAX_SAFE_MINOR) {
    throw new MoneyFormatError('Tutar güvenli tam sayı aralığının dışında.');
  }

  return minor;
}

/**
 * Para birimi eki taşıyabilen bir girdiyi tam sayı kuruşa çevirir.
 *
 *   parseMoney("1.234,56 TL", 'TRY') → 123456
 *   parseMoney("1.234,56", 'TRY')    → 123456
 *
 * Ek isteğe bağlıdır: kullanıcı ekrandan kopyaladığı bir değeri geri
 * yapıştırdığında girdi reddedilmemeli. Bu sayede
 * `parseMoney(formatMoney(x, c), c) === x` her zaman doğrudur.
 */
export function parseMoney(input: string, currency: string): number {
  const label = currencyLabel(currency);
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const withoutLabel = input.trim().replace(new RegExp(`\\s*${escaped}$`), '');

  return parseMinorAmount(withoutLabel);
}
