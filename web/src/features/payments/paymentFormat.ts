import { formatMoney } from '@/lib/finance/money';
import { directionLabel, formatFinancialDate } from '@/features/finance/financeLabels';
import type { FinanceEntry, FinanceEntrySummary } from '@/types/api';

/**
 * Dağıtım hedefinin kullanıcıya nasıl yazıldığı.
 *
 * İKİ FONKSİYON, İKİ VERİ ŞEKLİ — backend sözleşmesinin dayattığı ayrım:
 *
 *   financeEntryLabel       ← PaymentResource'un `finance_entry` ÖZETİ
 *                             {id, direction, financial_date, gross_minor}
 *                             `currency` ve `voided_at` TAŞIMAZ.
 *
 *   financeEntryOptionLabel ← GET /finance-entries'ten gelen TAM kayıt
 *                             kendi `currency`'sini ve iptal durumunu taşır.
 *
 * Tek fonksiyona indirgemek, özette olmayan alanlar için varsayım yapmak
 * olurdu.
 *
 * TEKNİK NOT — ÇOK PARA BİRİMİ:
 * Özet `currency` taşımadığı için hedefin tutarı ÖDEMENİN para birimiyle
 * biçimlenir. Bugün doğru: backend MVP'de her şeyi TRY'ye kısıtlıyor
 * (Rule::in([Currency::mvpDefault()]) + veritabanı CHECK). Backend çok
 * para birimini desteklediği anda PaymentResource'un `finance_entry`
 * özetine `currency` EKLENMELİDİR; aksi hâlde bu satır sessizce yanlış
 * para birimi gösterir.
 *
 * Biçimlendirme money.ts'e, tarih ve yön etiketleri finans modülüne ait.
 * Burada tek bir aritmetik işlem ya da ikinci bir kopya yoktur.
 */

/**
 * Hedef okunamadığında yazılan metin.
 *
 * `finance_entry` yanıtta NULL olabilir (FK nullable). Uydurma bir hedef
 * yazmak, olmayan bir kayda atıfta bulunmak olurdu.
 */
export const MISSING_TARGET_LABEL = 'Hedef kaydı görüntülenemiyor';

export function financeEntryLabel(
  summary: FinanceEntrySummary | null,
  currency: string,
): string {
  if (summary === null) return MISSING_TARGET_LABEL;

  const date = formatFinancialDate(summary.financial_date) ?? '—';

  return [
    `#${summary.id}`,
    date,
    directionLabel(summary.direction),
    formatMoney(summary.gross_minor, currency),
  ].join(' · ');
}

/**
 * Seçici için etiket — tam kayıttan.
 *
 * İPTAL EDİLMİŞ KAYIT GİZLENMEZ, ETİKETLENİR. Backend'in `exists` kuralı
 * iptal edilmiş kayıtları dışlamıyor; yani sözleşmeye göre onlara dağıtım
 * YAPILABİLİR. Seçenekten çıkarmak, backend'de olmayan bir kuralı
 * istemcide uygulamak olurdu (playbook §3.1). Ama kullanıcı ne seçtiğini
 * bilmeli.
 */
export function financeEntryOptionLabel(entry: FinanceEntry): string {
  const base = financeEntryLabel(
    {
      id: entry.id,
      direction: entry.direction,
      financial_date: entry.financial_date,
      gross_minor: entry.gross_minor,
    },
    // Tam kayıt kendi para birimini taşır; devretmeye gerek yok.
    entry.currency,
  );

  return entry.voided_at === null ? base : `${base} (İptal edildi)`;
}
