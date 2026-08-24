import { describe, expect, it } from 'vitest';
import {
  MAX_SAFE_MINOR,
  MoneyFormatError,
  formatMinorAmount,
  formatMoney,
  parseMinorAmount,
  parseMoney,
} from './money';

/**
 * Para biçimlendirme ve okuma.
 *
 * BU KATMAN HESAP YAPMAZ. Backend'deki Money/RoundingPolicy/VatCalculator
 * frontend'de yeniden yazılmadı; buradaki testler yalnızca "tam sayı
 * kuruş ↔ okunur dizgi" dönüşümünü sınar. İki hesaplama motoru olsaydı
 * bir gün ikisi farklı sonuç verir ve hangisinin doğru olduğu
 * bilinemezdi.
 *
 * FLOAT YOK: dönüşüm tamamen dizgi işlemiyle yapılıyor. `0.1 + 0.2` gibi
 * bir sorun buraya hiç giremez.
 */
describe('formatMinorAmount', () => {
  it('kuruşu Türkçe biçimde yazar', () => {
    expect(formatMinorAmount(123456)).toBe('1.234,56');
  });

  it('tam lirayı iki ondalık haneyle yazar', () => {
    expect(formatMinorAmount(100)).toBe('1,00');
  });

  it('sıfırı sıfır olarak yazar', () => {
    expect(formatMinorAmount(0)).toBe('0,00');
  });

  it('tek haneli kuruşu doğru ayırır', () => {
    expect(formatMinorAmount(5)).toBe('0,05');
    expect(formatMinorAmount(50)).toBe('0,50');
  });

  it('binlik ayıracını sağdan üçerli koyar', () => {
    expect(formatMinorAmount(100000000)).toBe('1.000.000,00');
    expect(formatMinorAmount(99999)).toBe('999,99');
  });

  /**
   * Negatif değer BİÇİMLENDİRİLEBİLİR ama OKUNAMAZ (bkz. parse testleri).
   * Gösterim tarafında bir fark ya da düzeltme tutarı eksi olabilir.
   */
  it('negatif tutarı işaretiyle yazar', () => {
    expect(formatMinorAmount(-123456)).toBe('-1.234,56');
  });

  it('güvenli aralığın en büyük değerini yazabilir', () => {
    expect(formatMinorAmount(MAX_SAFE_MINOR)).toBe('90.071.992.547.409,91');
  });

  it('tam sayı olmayan tutarı reddeder', () => {
    expect(() => formatMinorAmount(1.5)).toThrow(MoneyFormatError);
  });

  it('güvenli aralığın dışındaki tutarı reddeder', () => {
    expect(() => formatMinorAmount(MAX_SAFE_MINOR + 1)).toThrow(MoneyFormatError);
  });
});

describe('formatMoney', () => {
  it('TRY için TL ekini kullanır', () => {
    expect(formatMoney(123456, 'TRY')).toBe('1.234,56 TL');
    expect(formatMoney(100, 'TRY')).toBe('1,00 TL');
    expect(formatMoney(0, 'TRY')).toBe('0,00 TL');
  });

  /**
   * Tanınmayan para birimi kodu OLDUĞU GİBİ yazılır. Uydurma bir sembol
   * üretmek, yanlış para birimini doğruymuş gibi göstermek olurdu.
   */
  it('tanınmayan para birimini kodu ile yazar', () => {
    expect(formatMoney(123456, 'EUR')).toBe('1.234,56 EUR');
  });
});

describe('parseMinorAmount', () => {
  it('gruplanmış Türkçe girdiyi okur', () => {
    expect(parseMinorAmount('1.234,56')).toBe(123456);
  });

  it('gruplanmamış girdiyi okur', () => {
    expect(parseMinorAmount('1234,56')).toBe(123456);
  });

  /** Kuruşsuz girdi TAM LİRA demektir. */
  it('kuruşsuz girdiyi tam lira olarak okur', () => {
    expect(parseMinorAmount('1234')).toBe(123400);
  });

  it('sıfırı okur', () => {
    expect(parseMinorAmount('0')).toBe(0);
    expect(parseMinorAmount('0,00')).toBe(0);
  });

  /** Tek ondalık hane onda birdir: 0,5 TL = 50 kuruş. */
  it('tek ondalık haneyi kuruşa tamamlar', () => {
    expect(parseMinorAmount('0,5')).toBe(50);
    expect(parseMinorAmount('12,3')).toBe(1230);
  });

  it('baştaki ve sondaki boşluğu yok sayar', () => {
    expect(parseMinorAmount('  1.234,56  ')).toBe(123456);
  });

  it('boş girdiyi reddeder', () => {
    expect(() => parseMinorAmount('')).toThrow(MoneyFormatError);
    expect(() => parseMinorAmount('   ')).toThrow(MoneyFormatError);
  });

  it('sayı olmayan girdiyi reddeder', () => {
    expect(() => parseMinorAmount('abc')).toThrow(MoneyFormatError);
    expect(() => parseMinorAmount('1.2a3')).toThrow(MoneyFormatError);
  });

  /**
   * YUVARLAMA YAPILMAZ. Üçüncü ondalık hane sessizce atılsaydı,
   * kullanıcının yazdığından farklı bir tutar kaydedilirdi.
   */
  it('ikiden fazla ondalık haneyi reddeder', () => {
    expect(() => parseMinorAmount('1,234')).toThrow(MoneyFormatError);
    expect(() => parseMinorAmount('0,001')).toThrow(MoneyFormatError);
  });

  /**
   * "12.34" belirsizdir: kullanıcı 12,34 mü 1234 mü demek istedi?
   * Gruplu biçimde her grup TAM ÜÇ hane olmalıdır.
   */
  it('geçersiz binlik gruplamasını reddeder', () => {
    expect(() => parseMinorAmount('12.34')).toThrow(MoneyFormatError);
    expect(() => parseMinorAmount('1.23456')).toThrow(MoneyFormatError);
  });

  /**
   * NEGATİF OKUNMAZ. Yön kararı alan bazında verilir (finans kaydında
   * `direction`); burada eksi kabul etmek o kararı sessizce atlatırdı.
   */
  it('negatif girdiyi reddeder', () => {
    expect(() => parseMinorAmount('-1')).toThrow(MoneyFormatError);
    expect(() => parseMinorAmount('-1.234,56')).toThrow(MoneyFormatError);
  });

  it('nokta ile ondalık yazımını reddeder', () => {
    // İngilizce biçim (1234.56) Türkçe girdi alanında binlik ayıracı
    // gibi görünür; sessizce kabul etmek 100 kat hataya yol açardı.
    expect(() => parseMinorAmount('1234.56')).toThrow(MoneyFormatError);
  });

  it('güvenli tam sayı sınırını aşan girdiyi reddeder', () => {
    expect(() => parseMinorAmount('99999999999999999,99')).toThrow(MoneyFormatError);
  });

  it('güvenli sınırdaki değeri kabul eder', () => {
    expect(parseMinorAmount('90.071.992.547.409,91')).toBe(MAX_SAFE_MINOR);
  });
});

describe('parseMoney', () => {
  it('para birimi eki olmadan okur', () => {
    expect(parseMoney('1.234,56', 'TRY')).toBe(123456);
  });

  /**
   * Ekranda gösterilen değeri geri yapıştıran kullanıcı reddedilmemeli.
   */
  it('para birimi ekiyle birlikte okur', () => {
    expect(parseMoney('1.234,56 TL', 'TRY')).toBe(123456);
    expect(parseMoney('0,00 TL', 'TRY')).toBe(0);
  });

  it('geçersiz girdiyi reddeder', () => {
    expect(() => parseMoney('abc TL', 'TRY')).toThrow(MoneyFormatError);
  });

  /**
   * GİDİŞ-DÖNÜŞ DEĞİŞMEZİ: biçimlendirilen bir tutar geri okunduğunda
   * aynı kuruşu vermeli. Bu, iki fonksiyonun aynı biçim kuralına
   * dayandığının kanıtı.
   */
  it('biçimlendirme ve okuma birbirinin tersidir', () => {
    for (const minor of [0, 1, 50, 100, 999, 1000, 123456, 100000000, MAX_SAFE_MINOR]) {
      expect(parseMoney(formatMoney(minor, 'TRY'), 'TRY')).toBe(minor);
    }
  });
});
