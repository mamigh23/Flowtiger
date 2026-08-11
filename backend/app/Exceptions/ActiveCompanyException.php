<?php

namespace App\Exceptions;

use App\Models\User;
use RuntimeException;

/**
 * Aktif şirket çözümlenemediğinde fırlatılır.
 *
 * CrossTenantAccessException'dan ayrıdır: orada kullanıcı erişemeyeceği bir
 * tenant'a *ulaşmaya çalışır*; burada ise kullanıcı kötü niyetli olmayabilir —
 * henüz şirket seçmemiştir ya da seçtiği şirketteki üyeliği sonradan
 * kaldırılmıştır. Sonuç her iki durumda da aynıdır: erişim yok (§21).
 *
 * HTTP karşılığı bilinçli olarak atanmadı; API katmanı Faz 2.3'te
 * kurulduğunda uygun yanıta orada dönüştürülecek.
 */
class ActiveCompanyException extends RuntimeException
{
    /**
     * İstekte kimlik doğrulanmış bir kullanıcı yok.
     *
     * Normalde bu duruma gelinmez: middleware her zaman authentication
     * middleware'inden sonra çalışmalıdır. Yine de sessizce geçmek yerine
     * reddediyoruz — yanlış sıralanmış bir middleware zinciri, tenant
     * verisini context'siz bırakmak yerine gürültülü biçimde patlamalı.
     */
    public static function unauthenticated(): self
    {
        return new self(
            'Company context yalnızca kimliği doğrulanmış bir kullanıcı için kurulabilir.'
        );
    }

    /**
     * Kullanıcı henüz bir şirket seçmemiş.
     */
    public static function notSelected(User $user): self
    {
        return new self(
            "Kullanıcı #{$user->getKey()} için aktif şirket seçilmemiş. Erişim reddedildi."
        );
    }

    /**
     * Aktif şirket artık doğrulanamıyor: üyelik kaldırılmış ya da şirket yok.
     */
    public static function membershipNoLongerValid(User $user, int $companyId): self
    {
        return new self(
            "Kullanıcı #{$user->getKey()} artık Company #{$companyId} şirketinin üyesi değil ".
            'ya da şirket mevcut değil. Aktif şirket geçersiz, erişim reddedildi.'
        );
    }
}
