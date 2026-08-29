import type { AmountBasis, FinanceDirection } from '@/types/api';

/**
 * Finans ekranlarının SÖZLÜĞÜ — burada hesap yapılmaz.
 *
 * Tek bir aritmetik işlem yoktur ve olmayacak. Backend'in ham sözleşme
 * değerlerini (`in`, `gross`, `2000`, `half_up`) kullanıcının okuyabileceği
 * metne çevirir; başka bir şey yapmaz.
 */

export const DIRECTION_LABELS: Record<FinanceDirection, string> = {
  in: 'Gelir',
  out: 'Gider',
};

export function directionLabel(direction: FinanceDirection): string {
  return DIRECTION_LABELS[direction];
}

/**
 * Kullanıcı tutarı hangi esastan girdi?
 *
 * Bu bilgi sonucun NASIL çıktığının parçasıdır (açıklanabilirlik) ve
 * gizlenmemeli: aynı tutar net girildiğinde ve brüt girildiğinde farklı
 * bir KDV üretir.
 */
export function basisLabel(basis: AmountBasis): string {
  return basis === 'gross' ? 'Brüt üzerinden' : 'Net üzerinden';
}

export interface VatRateOption {
  /** Baz puan: %20 → 2000. */
  bp: number;
  label: string;
}

/**
 * Seçilebilir KDV oranları.
 *
 * "KDV yok" BU LİSTEDE DEĞİLDİR: o bir oran değil, oranın yokluğudur
 * (null). Listeye konsaydı `bp` alanına uydurma bir sayı yazmak gerekirdi.
 */
export const VAT_RATE_OPTIONS: readonly VatRateOption[] = [
  { bp: 0, label: '%0' },
  { bp: 100, label: '%1' },
  { bp: 1000, label: '%10' },
  { bp: 2000, label: '%20' },
];

export const NO_VAT_LABEL = 'KDV yok';

/**
 * Oranı kullanıcıya gösterilecek metne çevirir.
 *
 * `bp / 100` YAZILMADI. Küçük ama gerçek bir hesap motoru başlatmak
 * olurdu ve tabloda olmayan bir oran için uydurma bir yüzde üretirdi.
 * Bilinmeyen oran ham baz puan olarak gösterilir: kullanıcı yanlış bir
 * sayı görmektense alışık olmadığı bir birim görsün.
 *
 * null ile 0 AYRI ŞEYLERDİR (§A4):
 *   null → kayıt KDV bilgisi taşımıyor
 *   0    → KDV var, oranı sıfır
 */
export function vatRateLabel(bp: number | null): string {
  if (bp === null) return NO_VAT_LABEL;

  const known = VAT_RATE_OPTIONS.find((option) => option.bp === bp);

  return known ? known.label : `${bp} bp`;
}

/** KDV bu kayda uygulandı mı? Sıfır oran da uygulanmış sayılır. */
export function vatApplicableLabel(applicable: boolean): string {
  return applicable ? 'KDV uygulandı' : 'KDV uygulanmadı';
}

/**
 * Yuvarlama kuralı — backend'de `RoundingPolicy::MODE`.
 *
 * Ham enum değeri kullanıcıya gösterilmez; tanınmayan bir değer ise
 * OLDUĞU GİBİ gösterilir. Uydurma bir açıklama yazmak, kuralın ne
 * olduğunu bilmediğimiz hâlde biliyormuş gibi davranmak olurdu.
 */
export function roundingLabel(mode: string): string {
  return mode === 'half_up' ? 'Yarım yukarı yuvarlama' : mode;
}

/**
 * Mali tarihi kullanıcıya gösterilecek biçime çevirir: GG.AA.YYYY.
 *
 * DATE NESNESİNE HİÇ DOKUNULMAZ. `financial_date` bir takvim günüdür,
 * bir an değil (§A8). "2026-08-20" değerini `new Date(...)` ile okumak onu
 * UTC gece yarısına çevirir; UTC'nin gerisindeki bir saat diliminde
 * `getDate()` 19 döner ve kayıt bir gün geriye kayar. Bir gün kayan mali
 * tarih, yanlış döneme yazılmış bir gelir demektir.
 *
 * Bu yüzden dönüşüm salt dizgi işlemidir. Beklenmedik bir biçim
 * UYDURULMAZ: null döner, yani "gösterilecek bir şey yok".
 */
const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Bugünün TAKVİM GÜNÜ — yerel saate göre, `YYYY-MM-DD`.
 *
 * `toISOString()` KULLANILMAZ: UTC'ye çevirir ve UTC'nin ilerisindeki bir
 * saat diliminde akşam saatlerinde yarının tarihini verir. Mali tarihin
 * bir gün kayması, yanlış döneme yazılmış bir kayıt demektir.
 *
 * Burada durur çünkü hem finans hem ödeme formları aynı varsayılana
 * ihtiyaç duyuyor; iki kopya, bir gün iki farklı davranış olurdu.
 */
export function todayAsCalendarDay(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function formatFinancialDate(date: string | null): string | null {
  if (date === null) return null;

  const match = CALENDAR_DAY.exec(date);
  if (match === null) return null;

  const [, year, month, day] = match;
  if (year === undefined || month === undefined || day === undefined) return null;

  return `${day}.${month}.${year}`;
}
