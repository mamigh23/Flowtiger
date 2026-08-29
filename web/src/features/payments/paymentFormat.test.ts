import { describe, expect, it } from 'vitest';
import type { FinanceEntry, FinanceEntrySummary } from '@/types/api';
import { financeEntryLabel, financeEntryOptionLabel } from './paymentFormat';

/**
 * Dağıtım hedefinin kullanıcıya nasıl yazıldığı.
 *
 * İKİ AYRI FONKSİYON, İKİ AYRI VERİ ŞEKLİ — ve bu bir tasarım tercihi
 * değil, backend sözleşmesinin dayattığı bir ayrım:
 *
 *   financeEntryLabel        → PaymentResource'un `finance_entry` ÖZETİ
 *                              {id, direction, financial_date, gross_minor}
 *                              `currency` TAŞIMAZ ve iptal durumunu bilmez.
 *
 *   financeEntryOptionLabel  → GET /finance-entries'ten gelen TAM kayıt
 *                              kendi `currency`'sini ve `voided_at`ini taşır.
 *
 * Tek bir fonksiyona indirgemek, özette olmayan alanlar için uydurma
 * varsayımlar yapmak demek olurdu.
 *
 * TEKNİK NOT — ÇOK PARA BİRİMİ:
 * Özet `currency` taşımadığı için hedefin tutarı ÖDEMENİN para birimiyle
 * biçimlenir. Bugün doğru: backend MVP'de her şeyi TRY'ye kısıtlıyor
 * (Rule::in + DB CHECK). Backend çok para birimini desteklediği anda
 * PaymentResource'un `finance_entry` özetine `currency` EKLENMESİ gerekir;
 * aksi hâlde bu satır sessizce yanlış para birimi gösterir.
 */
describe('financeEntryLabel', () => {
  const summary: FinanceEntrySummary = {
    id: 900,
    direction: 'in',
    financial_date: '2026-08-20',
    gross_minor: 123456,
  };

  it('hedefi numarası, tarihi, yönü ve tutarıyla yazar', () => {
    const label = financeEntryLabel(summary, 'TRY');

    expect(label).toContain('#900');
    expect(label).toContain('20.08.2026');
    expect(label).toContain('Gelir');
    expect(label).toContain('1.234,56 TL');
  });

  it('gider yönünü doğru yazar', () => {
    expect(financeEntryLabel({ ...summary, direction: 'out' }, 'TRY')).toContain('Gider');
  });

  /**
   * Özet `currency` taşımıyor; ödemenin para birimi devredilir.
   */
  it('verilen para birimini kullanır', () => {
    expect(financeEntryLabel(summary, 'EUR')).toContain('1.234,56 EUR');
  });

  /**
   * `finance_entry` yanıtta NULL olabilir (FK nullable, ilişki
   * yüklenemeyebilir). Uydurma bir hedef yazılmaz.
   */
  it('hedef yoksa uydurma bilgi üretmez', () => {
    const label = financeEntryLabel(null, 'TRY');

    expect(label).toBe('Hedef kaydı görüntülenemiyor');
    expect(label).not.toContain('#');
  });

  it('tarihi olmayan hedefte tarih yerine boşluk işareti koyar', () => {
    const label = financeEntryLabel({ ...summary, financial_date: null }, 'TRY');

    expect(label).toContain('—');
    expect(label).toContain('#900');
  });
});

describe('financeEntryOptionLabel', () => {
  const entry: FinanceEntry = {
    id: 900,
    direction: 'in',
    financial_date: '2026-08-20',
    category: 'Danışmanlık',
    note: null,
    net_minor: 102880,
    vat_rate_bp: 2000,
    vat_minor: 20576,
    gross_minor: 123456,
    currency: 'TRY',
    customer: null,
    calculation: { basis: 'gross', rounding: 'half_up', vat_applicable: true },
    voided_at: null,
    void_reason: null,
    created_at: '2026-08-20T10:00:00+00:00',
    updated_at: '2026-08-20T10:00:00+00:00',
  };

  /** Tam kayıt kendi para birimini taşır; devretmeye gerek yok. */
  it('kaydın kendi para birimini kullanır', () => {
    expect(financeEntryOptionLabel(entry)).toContain('1.234,56 TL');
  });

  /**
   * İPTAL EDİLMİŞ KAYIT SEÇENEKTEN GİZLENMEZ, ETİKETLENİR.
   *
   * Backend `exists` kuralı iptal edilmiş kayıtları dışlamıyor — yani
   * sözleşmeye göre onlara dağıtım YAPILABİLİR. Gizlemek, backend'de
   * olmayan bir kuralı istemcide uygulamak olurdu (playbook §3.1).
   * Ama kullanıcı ne seçtiğini bilmeli.
   */
  it('iptal edilmiş kaydı açıkça etiketler', () => {
    const voided = { ...entry, voided_at: '2026-08-21T08:00:00+00:00' };

    expect(financeEntryOptionLabel(voided)).toContain('(İptal edildi)');
  });

  it('aktif kayda iptal etiketi koymaz', () => {
    expect(financeEntryOptionLabel(entry)).not.toContain('İptal edildi');
  });
});
