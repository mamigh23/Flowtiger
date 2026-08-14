<?php

namespace App\Services;

use App\Enums\AuditAction;
use App\Enums\Role;
use App\Exceptions\LastOwnerException;
use App\Models\Company;
use App\Models\User;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Facades\DB;

/**
 * Şirket üyeliğinin tek yetkili sahibi.
 *
 * company_users tablosuna yazan HER yol buradan geçer. Controller'lar
 * attach/detach/updateExistingPivot çağırmaz — çünkü "bir şirket asla
 * ownersız kalamaz" kuralı ancak tek bir kapıdan geçilirse korunabilir.
 * İkinci bir yazma yolu, er ya da geç kuralı atlayan bir yol olur.
 *
 * ŞİRKET burada her zaman ÇAĞIRAN TARAFTAN gelir ve çağıran taraf onu
 * daima aktif company context'ten alır — asla istek gövdesinden (§22).
 * Servis company_id'yi kullanıcı girdisinden okumaz.
 */
class MembershipService
{
    public function __construct(
        private readonly AuditLogService $audit,
    ) {}

    /**
     * Şirketin üyelerini sorgulayan ilişki (sayfalama için).
     *
     * Filtre pivot tablosunun kendisidir; sonradan eklenmiş bir where
     * koşulu değil. Bu yüzden "unutulacak bir filtre" riski yoktur ve
     * User modelini global tenant scope'a sokmaya gerek kalmaz (§6, §15).
     */
    public function membersOf(Company $company): BelongsToMany
    {
        return $company->users();
    }

    /**
     * Kullanıcının bu şirketteki rolü; üye değilse null.
     *
     * tryFrom kullanılır: veritabanında tanınmayan bir rol değeri varsa
     * (CHECK kısıtı bunu engeller ama savunma derinliği) sonuç null olur
     * ve kullanıcı hiçbir yetki kazanmaz — fail closed.
     */
    public function roleOf(Company $company, User $user): ?Role
    {
        $membership = $company->users()->whereKey($user->getKey())->first();

        if ($membership === null) {
            return null;
        }

        return Role::tryFrom((string) $membership->pivot->role);
    }

    /**
     * Şirketin üyesi olan kullanıcıyı getirir; üye değilse 404.
     *
     * BU METOT TENANT SINIRIDIR. /members/{user} route model binding'i
     * User'ı tenant'tan bağımsız çözer (User global scope'a SOKULMAZ,
     * §15) — başka şirketin kullanıcısı da bağlanabilir. Sınır burada
     * çizilir ve ModelNotFoundException 404'e dönüşür.
     *
     * Neden 403 değil 404: 403, o ID'de bir kullanıcının VAR OLDUĞUNU
     * doğrular ve ID taramasıyla sistemdeki kullanıcılar sayılabilir.
     * Faz 3'te Customer için verilen kararla aynıdır.
     *
     * @throws \Illuminate\Database\Eloquent\ModelNotFoundException<User>
     */
    public function findMemberOrFail(Company $company, User $user): User
    {
        return $company->users()->whereKey($user->getKey())->firstOrFail();
    }

    /**
     * Şirkete yeni bir kullanıcı oluşturup üye yapar.
     *
     * İlk sürüm bilinçli olarak basittir (§9): yalnızca YENİ kullanıcı
     * yaratır. E-posta zaten kayıtlıysa validation 422 döner. Mevcut bir
     * kullanıcıyı şirkete bağlamak invitation sisteminin işidir (§24) —
     * rızası olmadan birini şirkete eklemek ve 201/422 farkından e-posta
     * varlığını okumak bu ucun işi değildir.
     *
     * Kullanıcı oluşturma ve üyelik açma TEK transaction'dadır: yarıda
     * kalan bir istek, hiçbir şirkete ait olmayan öksüz bir kullanıcı
     * bırakamaz.
     */
    public function create(
        Company $company,
        string $name,
        string $email,
        #[\SensitiveParameter] string $password,
        Role $role,
    ): User {
        return DB::transaction(function () use ($company, $name, $email, $password, $role): User {
            $user = new User();

            // password alanı modelde 'hashed' cast'ine sahiptir; düz metin
            // verilir, veritabanına hash yazılır. Parola hiçbir yerde
            // loglanmaz ve response'a çıkmaz (§22).
            $user->fill([
                'name' => $name,
                'email' => $email,
                'password' => $password,
            ]);

            $user->save();

            // Rol pivot'a AÇIKÇA yazılır; mass assignment yolu yoktur.
            $company->users()->attach($user->getKey(), ['role' => $role->value]);

            $member = $this->findMemberOrFail($company, $user);

            // PAROLA AUDIT'E GİRMEZ. new_values elle seçilmiş üç alandan
            // ibarettir; $user->toArray() gibi bir kestirme, modele yarın
            // eklenecek hassas bir alanı sessizce audit'e taşırdı (§3).
            $this->audit->record(
                action: AuditAction::MemberCreated,
                company: $company,
                auditable: $member,
                newValues: [
                    'name' => $member->name,
                    'email' => $member->email,
                    'role' => $role->value,
                ],
            );

            return $member;
        });
    }

    /**
     * MEVCUT bir kullanıcıyı şirkete üye yapar.
     *
     * create()'ten farkı: burada kullanıcı zaten vardır. Faz 6'daki davet
     * kabulünün ihtiyaç duyduğu yol budur — hesabı olan biri daveti kabul
     * ettiğinde yeni kullanıcı YARATILMAZ, sadece üyelik açılır. Parolası,
     * adı, oturumları hiçbir şekilde değişmez (§17).
     *
     * Pivot'a yazan tek kapı hâlâ bu servistir: InvitationService attach/
     * detach çağırmaz, buraya devreder. İkinci bir yazma yolu, "son owner"
     * gibi kuralların atlanabileceği bir yol olurdu.
     *
     * $actor: olayı gerçekleştiren kişi oturumdan okunamayabilir (davet
     * kabulünde kullanıcı henüz giriş yapmamıştır), bu yüzden açıkça
     * geçilebilir.
     */
    public function attach(Company $company, User $user, Role $role, ?User $actor = null): User
    {
        return DB::transaction(function () use ($company, $user, $role, $actor): User {
            $company->users()->attach($user->getKey(), ['role' => $role->value]);

            $member = $this->findMemberOrFail($company, $user);

            $this->audit->record(
                action: AuditAction::MemberCreated,
                company: $company,
                auditable: $member,
                newValues: [
                    'name' => $member->name,
                    'email' => $member->email,
                    'role' => $role->value,
                ],
                actor: $actor,
            );

            return $member;
        });
    }

    /**
     * Üyenin adını ve e-postasını günceller.
     *
     * Bu iş Faz 4'te controller'daydı. Faz 5'te buraya taşındı çünkü
     * güncelleme ile audit kaydının AYNI transaction'da olması gerekiyor
     * (§9): profil değişip iz kaybolursa, "bu e-posta ne zaman değişti"
     * sorusu cevapsız kalır.
     *
     * Rol BURADA DEĞİŞTİRİLEMEZ; onun ayrı bir metodu ve ayrı yetkisi var.
     */
    public function updateProfile(Company $company, User $member, string $name, string $email): User
    {
        return DB::transaction(function () use ($company, $member, $name, $email): User {
            $membership = $this->findMemberOrFail($company, $member);

            $oldValues = [
                'name' => $membership->name,
                'email' => $membership->email,
            ];

            $membership->fill([
                'name' => $name,
                'email' => $email,
            ])->save();

            $this->audit->record(
                action: AuditAction::MemberUpdated,
                company: $company,
                auditable: $membership,
                oldValues: $oldValues,
                newValues: ['name' => $membership->name, 'email' => $membership->email],
            );

            return $membership;
        });
    }

    /**
     * Üyenin rolünü değiştirir.
     *
     * Son owner member'a düşürülemez. Kontrol ve yazma AYNI transaction
     * ve AYNI kilit altındadır (§19): iki owner'ın aynı anda kendini
     * member yapmaya çalıştığı yarışta, ikisi de "başka owner var" görüp
     * şirketi ownersız bırakamaz.
     *
     * @throws LastOwnerException
     */
    public function changeRole(Company $company, User $member, Role $newRole): User
    {
        return DB::transaction(function () use ($company, $member, $newRole): User {
            $this->lockCompany($company);

            $membership = $this->findMemberOrFail($company, $member);
            $currentRole = Role::tryFrom((string) $membership->pivot->role);

            // Aynı rol: hiçbir şey değişmiyor. Erken dönmezsek, tek owner'a
            // "owner" atamak son-owner kuralına takılırdı.
            if ($currentRole === $newRole) {
                return $membership;
            }

            if ($this->wouldLeaveCompanyWithout($company, $currentRole)) {
                throw LastOwnerException::cannotDemote($company);
            }

            $company->users()->updateExistingPivot($member->getKey(), [
                'role' => $newRole->value,
            ]);

            // Pivot'u tazelemek için yeniden okunur; yanıt gerçekten
            // veritabanındaki rolü göstermeli.
            $updated = $this->findMemberOrFail($company, $member);

            // Yetki değişimi audit'in en kritik kaydıdır: birinin owner
            // olması, şirketin kontrolünün el değiştirmesidir.
            $this->audit->record(
                action: AuditAction::MemberRoleChanged,
                company: $company,
                auditable: $updated,
                oldValues: ['role' => $currentRole?->value],
                newValues: ['role' => $newRole->value],
            );

            return $updated;
        });
    }

    /**
     * Üyeliği kaldırır. Kullanıcı kaydı SİLİNMEZ (§12).
     *
     * Kullanıcı başka şirketlerin üyesi olabilir; onu fiziksel olarak
     * silmek bu ucun yetkisini kat kat aşardı.
     *
     * @throws LastOwnerException
     */
    public function remove(Company $company, User $member): void
    {
        DB::transaction(function () use ($company, $member): void {
            $this->lockCompany($company);

            $membership = $this->findMemberOrFail($company, $member);
            $currentRole = Role::tryFrom((string) $membership->pivot->role);

            if ($this->wouldLeaveCompanyWithout($company, $currentRole)) {
                throw LastOwnerException::cannotRemove($company);
            }

            $company->users()->detach($member->getKey());

            $this->clearStaleActiveCompany($company, $membership);

            // Çıkarılan üyenin hangi rolde olduğu kaydedilir: bir owner'ın
            // çıkarılması ile bir member'ın çıkarılması aynı ağırlıkta
            // olaylar değildir.
            $this->audit->record(
                action: AuditAction::MemberRemoved,
                company: $company,
                auditable: $membership,
                oldValues: [
                    'name' => $membership->name,
                    'email' => $membership->email,
                    'role' => $currentRole?->value,
                ],
            );
        });
    }

    /**
     * Bu rolü taşıyan üyeyi kaybetmek şirketi zorunlu bir rolden yoksun
     * bırakır mı?
     *
     * "En az bir owner" kuralının tek uygulandığı yer. Kuralın hangi role
     * ait olduğu Role enum'ında tanımlıdır; burası rol adı bilmez.
     */
    private function wouldLeaveCompanyWithout(Company $company, ?Role $currentRole): bool
    {
        if ($currentRole === null || ! $currentRole->isRequiredForCompanySurvival()) {
            return false;
        }

        return $this->countRole($company, $currentRole) <= 1;
    }

    private function countRole(Company $company, Role $role): int
    {
        return $company->users()->wherePivot('role', $role->value)->count();
    }

    /**
     * Şirket satırını kilitler.
     *
     * Üyelik değişiklikleri company_users'ın FARKLI satırlarına dokunur,
     * bu yüzden satır kilitleri birbirini görmez; ortak bir noktada
     * buluşmaları gerekir. Şirket satırı bu ortak noktadır. Aynı desen
     * Faz 0'dan beri CustomerService'te customer_no üretimi için
     * kullanılıyor — bilinçli olarak tekrarlandı.
     */
    private function lockCompany(Company $company): void
    {
        Company::whereKey($company->getKey())->lockForUpdate()->firstOrFail();
    }

    /**
     * Çıkarılan kullanıcının aktif şirketi buysa referansı temizler.
     *
     * Bırakılsaydı güvenlik açığı olmazdı — CompanySelectionService
     * üyeliği her istekte yeniden doğrular ve erişimi keser. Ama kullanıcı
     * artık üyesi olmadığı bir şirkete işaret eden bayat bir kayıtla
     * kalırdı. Şirket silindiğinde veritabanının yaptığı temizliğin
     * (nullOnDelete) aynısı burada elle yapılır.
     *
     * active_company_id mass assignable DEĞİLDİR; açıkça atanır (§16).
     */
    private function clearStaleActiveCompany(Company $company, User $member): void
    {
        if ((int) $member->active_company_id !== (int) $company->getKey()) {
            return;
        }

        $member->active_company_id = null;
        $member->save();
    }
}
