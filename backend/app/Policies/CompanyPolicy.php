<?php

namespace App\Policies;

use App\Models\Company;
use App\Models\User;
use App\Services\MembershipService;

/**
 * Şirketin KENDİSİ üzerindeki yetkiler (Faz 7 / Adım 2).
 *
 * CompanyMemberPolicy ile karıştırılmamalı: orası bir owner'ın ŞİRKETİN
 * ÜYELERİNİ yönetmesini düzenler; burası şirket kaydının kendi
 * yapılandırmasını.
 *
 * ROL SORUSU AKTİF CONTEXT'E DEĞİL, ROUTE'TAN ÇÖZÜLEN ŞİRKETE SORULUR.
 * Sebebi: companies uçları bilinçli olarak company.context'in dışındadır
 * (CompanyController docblock'u) — kullanıcı henüz şirket seçmemişken de
 * şirketlerini görebilmeli. Dolayısıyla "hangi şirkette owner'ım?"
 * sorusunun cevabı aktif şirketten değil, işlem yapılan şirketten gelir.
 *
 * ÜYE OLMAYAN KULLANICI DA false ALIR ve bu 403'e çevrilir, 404'e değil.
 * 404 dönmek "böyle bir şirket var mı?" sorusunu yanıtlardı ve id
 * taramasıyla sistemdeki şirketler sayılabilirdi. CompanyController::select
 * ucundaki kararla aynı.
 */
class CompanyPolicy
{
    public function __construct(
        private readonly MembershipService $memberships,
    ) {}

    /**
     * Şirketin mali kimliğini kim değiştirebilir?
     *
     * OWNER-ONLY. Vergi numarası ve unvan fatura kesiminde yasal olarak
     * bağlayıcıdır; members/invitations/audit ile aynı yetki sınıfına
     * girer.
     *
     * Soru `Role::managesBilling()`'e sorulur, `$role === Role::Owner`
     * diye burada yazılmaz — Role enum'ının yetenek metotları deseni
     * (§3). Permission tablosu geldiğinde değişecek tek yer o metodun
     * gövdesidir.
     */
    public function updateBilling(User $user, Company $company): bool
    {
        return $this->memberships->roleOf($company, $user)?->managesBilling() ?? false;
    }
}
