<?php

namespace App\Services;

use App\Enums\AuditAction;
use App\Models\Company;
use Illuminate\Support\Facades\DB;

/**
 * Faz 7 / Adım 2 — şirketin mali kimliği.
 *
 * NEDEN CompanySelectionService'e EKLENMEDİ:
 * O servisin tek işi aktif şirket seçimidir ve öyle kalmalıdır. Mali
 * kimlik yazımı ilgisiz bir sorumluluktur; aynı sınıfa koymak, ileride
 * "şirketle ilgili her şey" çöplüğüne dönüşecek bir sınıfın ilk adımı
 * olurdu.
 *
 * DEĞİŞİKLİK VE AUDIT AYNI TRANSACTION'DADIR (§9, CustomerService ile
 * aynı desen): vergi numarası değişip iz kaybolursa, "bu şirketin vergi
 * numarasını kim değiştirdi" sorusu — ki fatura kesildikten sonra
 * sorulacak ilk sorudur — cevapsız kalır.
 */
class CompanyBillingService
{
    public function __construct(
        private readonly AuditLogService $audit,
    ) {}

    /**
     * Yalnızca VERİLEN alanları yazar.
     *
     * PATCH semantiğinin taşıyıcısı burasıdır: dizide bulunmayan alan
     * okunmaz, yazılmaz ve audit'e girmez. Gövdede hangi alanların
     * bulunduğu FormRequest'in `sometimes` kurallarıyla belirlenir.
     *
     * @param  array<string, mixed>  $attributes
     */
    public function update(Company $company, array $attributes): Company
    {
        if ($attributes === []) {
            // Değişiklik yok: boş bir audit satırı yazmak, olmamış bir
            // olayı olmuş gibi göstermek olurdu.
            return $company;
        }

        return DB::transaction(function () use ($company, $attributes): Company {
            $oldValues = [];

            foreach ($attributes as $key => $value) {
                $oldValues[$key] = $company->getAttribute($key);
                // setAttribute: bu alanlar bilinçli olarak fillable
                // DEĞİLDİR (Anayasa §9), sistem tarafından açıkça atanır.
                $company->setAttribute($key, $value);
            }

            $company->save();

            $this->audit->record(
                action: AuditAction::CompanyBillingUpdated,
                company: $company,
                auditable: $company,
                oldValues: $oldValues,
                newValues: $attributes,
            );

            return $company;
        });
    }
}
