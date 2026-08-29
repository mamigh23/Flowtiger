import { describe, expect, it } from 'vitest';
import {
  GREETING_AFTERNOON,
  GREETING_EVENING,
  GREETING_MORNING,
  formatToday,
  greetingFor,
} from './greeting';

/**
 * Karşılama metinleri.
 *
 * Saat DIŞARIDAN veriliyor; bu yüzden burada sahte saat kurmaya gerek
 * yok. Fonksiyon `new Date()` çağırsaydı en basit kural en pahalı
 * yöntemle sınanırdı.
 */
describe('greetingFor', () => {
  it('sabah saatlerinde günaydın der', () => {
    expect(greetingFor(5)).toBe(GREETING_MORNING);
    expect(greetingFor(9)).toBe(GREETING_MORNING);
    expect(greetingFor(11)).toBe(GREETING_MORNING);
  });

  it('öğleden sonra iyi günler der', () => {
    expect(greetingFor(12)).toBe(GREETING_AFTERNOON);
    expect(greetingFor(15)).toBe(GREETING_AFTERNOON);
    expect(greetingFor(17)).toBe(GREETING_AFTERNOON);
  });

  it('akşam iyi akşamlar der', () => {
    expect(greetingFor(18)).toBe(GREETING_EVENING);
    expect(greetingFor(23)).toBe(GREETING_EVENING);
  });

  /**
   * Gece yarısından sonrası da AKŞAMDIR. Saat üçte "günaydın" demek,
   * kullanıcının o an yaşadığı günü yanlış adlandırmaktır.
   */
  it('gece yarısından sonra günaydın demez', () => {
    expect(greetingFor(0)).toBe(GREETING_EVENING);
    expect(greetingFor(3)).toBe(GREETING_EVENING);
    expect(greetingFor(4)).toBe(GREETING_EVENING);
  });

  /** Sınırlar kapalı biçimde kilitli: 11→12 ve 17→18 geçişleri. */
  it('sınırlarda doğru tarafa düşer', () => {
    expect(greetingFor(11)).not.toBe(greetingFor(12));
    expect(greetingFor(17)).not.toBe(greetingFor(18));
  });
});

describe('formatToday', () => {
  it('tarihi Türkçe ay ve gün adıyla yazar', () => {
    // 22 Ağustos 2026 bir Cumartesi.
    expect(formatToday(new Date(2026, 7, 22))).toBe('22 Ağustos 2026, Cumartesi');
  });

  it('ayın ilk gününü doğru yazar', () => {
    expect(formatToday(new Date(2026, 0, 1))).toBe('1 Ocak 2026, Perşembe');
  });

  it('yılın son gününü doğru yazar', () => {
    expect(formatToday(new Date(2026, 11, 31))).toBe('31 Aralık 2026, Perşembe');
  });
});
