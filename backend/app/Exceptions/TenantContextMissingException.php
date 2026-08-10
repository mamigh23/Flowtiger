<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * Aktif bir şirket (company context) olmadan tenant'a ait veriye
 * dokunulmaya çalışıldığında fırlatılır.
 *
 * Bilinçli olarak sessiz "boş sonuç" yerine exception kullanılıyor:
 * boş sonuç, hatayı "veri yok" gibi göstererek gizler. Fail closed
 * yaklaşımı belirsizliği gürültülü biçimde reddetmeyi gerektirir
 * (FlowTiger Anayasası §21).
 */
class TenantContextMissingException extends RuntimeException
{
    public static function forModel(string $model): self
    {
        return new self(
            "Aktif company context yokken [{$model}] sorgulanamaz."
            .' Önce CompanyContext::setForUser() ile bir şirkete girilmeli;'
            .' işlem gerçekten sistem seviyesindeyse withoutTenantScope() kullanılmalı.'
        );
    }

    public static function forContextRead(): self
    {
        return new self('Aktif company context yok. Erişim reddedildi (fail closed).');
    }
}
