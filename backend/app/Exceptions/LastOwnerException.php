<?php

namespace App\Exceptions;

use App\Models\Company;
use RuntimeException;

/**
 * Bir şirketin son owner'ını kaybetmesine yol açacak her işlemde fırlatılır.
 *
 * Bu bir YETKİ hatası değildir — isteği yapan kullanıcının owner olduğu
 * kesindir, aksi halde policy zaten reddederdi. Bu bir SİSTEM KURALI
 * ihlalidir: "bir şirket her zaman en az bir owner'a sahip olmalıdır"
 * (§5, §19). Bu yüzden 403 değil 422 döner.
 *
 * Kural neden bu kadar önemli: ownersız kalan bir şirket kendini bir daha
 * asla yönetemez. Üye ekleyemez, rol değiştiremez, kimseyi çıkaramaz.
 * Veritabanına elle müdahale etmeden geri dönüşü yoktur.
 *
 * HTTP karşılığı bootstrap/app.php'de atanır; exception sınıfı HTTP
 * katmanını tanımaz.
 */
class LastOwnerException extends RuntimeException
{
    /**
     * Son owner'ın üyeliği kaldırılmaya çalışıldı.
     */
    public static function cannotRemove(Company $company): self
    {
        return new self(
            "Company #{$company->getKey()} şirketinin son owner'ı çıkarılamaz. ".
            'Önce başka bir üyeye owner rolü verilmelidir.'
        );
    }

    /**
     * Son owner member'a düşürülmeye çalışıldı.
     */
    public static function cannotDemote(Company $company): self
    {
        return new self(
            "Company #{$company->getKey()} şirketinin son owner'ı member yapılamaz. ".
            'Önce başka bir üyeye owner rolü verilmelidir.'
        );
    }
}
