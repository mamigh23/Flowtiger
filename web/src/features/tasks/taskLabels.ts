/**
 * Görev ekranlarının sözlüğü.
 *
 * TARİH BİÇİMLENDİRİCİSİ BURADA YENİDEN YAZILMADI. `scheduled_date` de
 * `financial_date` gibi bir TAKVİM GÜNÜDÜR ve aynı kurallara tabidir:
 * Date nesnesine çevrilmeden, salt dizgi işlemiyle biçimlenir (saat
 * dilimi kayması olmasın diye). O iş `financeLabels.formatFinancialDate`
 * içinde çözülmüş durumda; ikinci bir kopya, bir gün iki farklı biçim
 * demek olurdu.
 *
 * DURUM METNİ TEK YERDE: liste ve ayrıntı ekranları aynı kelimeyi
 * kullanmalı. "Tamamlandı" ile "Bitti" arasında gidip gelen bir arayüz,
 * kullanıcıya iki farklı durum varmış izlenimi verir.
 */

export const TASK_STATUS_COMPLETED = 'Tamamlandı';
export const TASK_STATUS_OPEN = 'Açık';

/**
 * Durum YANITTAN gelen `is_completed` ile belirlenir.
 *
 * Bu fonksiyon `completed_at`e BAKMAZ ve bakmamalı: backend durumu zaten
 * türetiyor. İkinci bir hesap, bir gün backend kuralı değiştiğinde
 * (ör. iptal edilmiş bir tamamlanmayı saymazsa) sessizce yanlış sonuç
 * verirdi.
 */
export function taskStatusLabel(isCompleted: boolean): string {
  return isCompleted ? TASK_STATUS_COMPLETED : TASK_STATUS_OPEN;
}
