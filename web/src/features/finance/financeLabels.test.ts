import { describe, expect, it } from 'vitest';
import {
  VAT_RATE_OPTIONS,
  basisLabel,
  directionLabel,
  formatFinancialDate,
  vatRateLabel,
} from './financeLabels';

/**
 * Finans etiketleri — SÖZLÜK, HESAP DEĞİL.
 *
 * Bu modülde tek bir aritmetik işlem yoktur ve olmayacak. KDV oranı
 * backend'de BAZ PUAN (basis point) olarak tutulur: 2000bp = %20. Yüzdeyi
 * `bp / 100` ile üretmek küçük ama gerçek bir hesap motoru başlatmak
 * olurdu; onun yerine sabit bir eşleme tablosu var. Tablo dışında kalan
 * bir oran UYDURULMAZ, ham hâliyle gösterilir.
 *
 * KRİTİK AYRIM (§A4):
 *   vat_rate_bp = null → kayıt KDV bilgisi TAŞIMIYOR
 *   vat_rate_bp = 0    → KDV VAR, oranı sıfır
 * İkisi aynı metinle gösterilirse, sıfır oranlı bir satış ile KDV'siz bir
 * gider raporda ayırt edilemez hâle gelir.
 */
describe('directionLabel', () => {
  it('gelir ve gideri Türkçe adlandırır', () => {
    expect(directionLabel('in')).toBe('Gelir');
    expect(directionLabel('out')).toBe('Gider');
  });
});

describe('basisLabel', () => {
  /**
   * Kullanıcı tutarı hangi esastan girdi? Bu, sonucun NASIL çıktığının
   * parçasıdır (açıklanabilirlik bloğu) ve gizlenmemeli.
   */
  it('tutar esasını açıklar', () => {
    expect(basisLabel('net')).toBe('Net üzerinden');
    expect(basisLabel('gross')).toBe('Brüt üzerinden');
  });
});

describe('VAT_RATE_OPTIONS', () => {
  it('oranları baz puan olarak taşır', () => {
    expect(VAT_RATE_OPTIONS.map((option) => option.bp)).toEqual([0, 100, 1000, 2000]);
  });

  it('her oranın kullanıcıya gösterilecek bir etiketi vardır', () => {
    expect(VAT_RATE_OPTIONS.map((option) => option.label)).toEqual(['%0', '%1', '%10', '%20']);
  });

  /**
   * Liste "KDV yok" seçeneğini İÇERMEZ: o bir oran değil, oranın
   * yokluğudur (null). Tabloya konsaydı `bp` alanına uydurma bir sayı
   * yazmak gerekirdi.
   */
  it('KDV yok seçeneğini oran listesine karıştırmaz', () => {
    expect(VAT_RATE_OPTIONS.every((option) => Number.isInteger(option.bp))).toBe(true);
  });
});

describe('vatRateLabel', () => {
  it('null oranı KDV yok olarak gösterir', () => {
    expect(vatRateLabel(null)).toBe('KDV yok');
  });

  /** SIFIR ORAN KDV YOK DEĞİLDİR. */
  it('sıfır oranı KDV yoktan ayırır', () => {
    expect(vatRateLabel(0)).toBe('%0');
    expect(vatRateLabel(0)).not.toBe(vatRateLabel(null));
  });

  it('bilinen oranları yüzde olarak gösterir', () => {
    expect(vatRateLabel(100)).toBe('%1');
    expect(vatRateLabel(1000)).toBe('%10');
    expect(vatRateLabel(2000)).toBe('%20');
  });

  /**
   * Tablo dışı bir oran (mevzuat değişir, eski kayıtlar kalır) UYDURMA
   * bir yüzdeye çevrilmez. Ham baz puan gösterilir: kullanıcı yanlış bir
   * sayı görmektense alışık olmadığı bir birim görsün.
   */
  it('bilinmeyen oranı ham baz puan olarak gösterir', () => {
    expect(vatRateLabel(1800)).toBe('1800 bp');
    expect(vatRateLabel(7)).toBe('7 bp');
  });
});

/**
 * MALİ TARİH BİR TAKVİM GÜNÜDÜR, BİR AN DEĞİL.
 *
 * `financial_date` backend'de saat taşımaz (§A8). "2026-08-20" değerini
 * `new Date(...)` ile okumak onu UTC gece yarısına çevirir; UTC'nin
 * gerisindeki bir saat diliminde `getDate()` 19 döner ve kayıt bir gün
 * geriye kayar. Bir gün kayan mali tarih, yanlış döneme yazılmış bir
 * gelir demektir.
 *
 * Bu yüzden dönüşüm SALT DİZGİ işlemidir; Date hiç devreye girmez.
 * Biçim uygulamanın geri kalanıyla aynı: GG.AA.YYYY (auditLabels).
 */
describe('formatFinancialDate', () => {
  it('takvim gününü Türkçe biçimde yazar', () => {
    expect(formatFinancialDate('2026-08-20')).toBe('20.08.2026');
  });

  it('ay ve gün başındaki sıfırları korur', () => {
    expect(formatFinancialDate('2026-01-01')).toBe('01.01.2026');
    expect(formatFinancialDate('2026-12-09')).toBe('09.12.2026');
  });

  /**
   * Yılın ilk ve son günü: Date üzerinden geçen bir dönüşümde saat dilimi
   * kaymasının en görünür olduğu iki gün.
   */
  it('yıl sınırındaki günleri kaydırmaz', () => {
    expect(formatFinancialDate('2026-01-01')).toBe('01.01.2026');
    expect(formatFinancialDate('2026-12-31')).toBe('31.12.2026');
  });

  it('değer yoksa null döner', () => {
    expect(formatFinancialDate(null)).toBeNull();
  });

  /** Beklenmedik biçim UYDURULMAZ; gösterilecek bir şey yok demektir. */
  it('beklenmedik biçimde null döner', () => {
    expect(formatFinancialDate('20.08.2026')).toBeNull();
    expect(formatFinancialDate('2026-08-20T10:00:00+00:00')).toBeNull();
    expect(formatFinancialDate('')).toBeNull();
  });
});
