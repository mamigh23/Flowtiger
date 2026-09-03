<?php

namespace App\Services;

use App\Enums\AuditAction;
use App\Enums\Role;
use App\Exceptions\RegistrationException;
use App\Models\Company;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

/**
 * Self-servis kayıt: yeni bir User + yeni bir Company + Owner üyeliği +
 * aktif şirket ataması — TEK transaction'da (P0-01).
 *
 * NEDEN AYRI BİR SERVİS, MembershipService'E YENİ BİR METOT DEĞİL:
 * MembershipService::create() VAR OLAN bir Company'yi zorunlu parametre
 * olarak alır; kendi doc-comment'i "ŞİRKET her zaman ÇAĞIRAN TARAFTAN
 * gelir" der (§22) ve bu servisin tüm sözleşmesi bu varsayıma dayanır.
 * Register'da henüz ne bir Company ne bir aktif context vardır — bu,
 * MembershipService'in sözleşmesini genişletmek değil, tamamen farklı bir
 * ön koşuldan (hiçbir şirket yok) başlayan ayrı bir akıştır. İkisini aynı
 * serviste birleştirmek "company her zaman çağırandan gelir" invariant'ını
 * belirsizleştirirdi.
 *
 * PİVOT'A YAZAN TEK KAPI YİNE DE MembershipService'TİR:
 * Bu servis company_users'a DOĞRUDAN yazmaz. Owner üyeliği
 * MembershipService::attach() üzerinden açılır — "company_users tablosuna
 * yazan HER yol MembershipService'ten geçer" kuralı (MembershipService
 * doc-comment §-) burada da korunur. Aynı şekilde active_company_id
 * CompanySelectionService::select() üzerinden atanır; bu servis o alana
 * asla doğrudan dokunmaz (User.php'de mass-assignable değildir).
 *
 * TEK TRANSACTION: User, Company, üyelik ve active_company_id'nin dördü de
 * ya birlikte var olur ya da hiçbiri var olmaz. Yarıda kalan bir istek
 * owner'sız bir Company ya da hiçbir şirkete ait olmayan öksüz bir User
 * bırakamaz. MembershipService::attach() ve CompanySelectionService::select()
 * kendi transaction'larını açsa da, Laravel/PDO bunları burada zaten açık
 * olan dış transaction'ın SAVEPOINT'i olarak yürütür — tek bir rollback
 * hepsini birden geri alır.
 */
class RegistrationService
{
    public function __construct(
        private readonly MembershipService $memberships,
        private readonly CompanySelectionService $companySelection,
        private readonly AuditLogService $audit,
    ) {}

    /**
     * @throws RegistrationException
     */
    public function register(
        string $name,
        string $email,
        #[\SensitiveParameter] string $password,
        string $companyName,
    ): User {
        try {
            return $this->registerWithinTransaction($name, $email, $password, $companyName);
        } catch (UniqueConstraintViolationException) {
            // RegisterRequest'teki `unique:users` doğrulamasını GEÇMİŞ ama
            // bu satıra ulaşana kadar başka bir istek (ör. eşzamanlı bir
            // invitation-accept guest-path kaydı) AYNI e-postayı COMMIT
            // ETMİŞ olabilir (INVITATION CONCURRENCY). Ham QueryException/500
            // yerine temiz, makine-okunur bir 422 döneriz — mevcut
            // Invitation davranışına hiç dokunulmaz, yalnızca bu servisin
            // kendi yazma yolu korunur.
            throw RegistrationException::emailAlreadyRegistered();
        }
    }

    /**
     * @throws UniqueConstraintViolationException
     */
    private function registerWithinTransaction(
        string $name,
        string $email,
        #[\SensitiveParameter] string $password,
        string $companyName,
    ): User {
        return DB::transaction(function () use ($name, $email, $password, $companyName): User {
            $user = new User();

            // password alanı modelde 'hashed' cast'ine sahiptir; düz metin
            // verilir, veritabanına hash yazılır. Parola hiçbir yerde
            // loglanmaz ve response'a çıkmaz — MembershipService::create()
            // ile aynı disiplin.
            $user->fill([
                'name' => $name,
                'email' => $email,
                'password' => $password,
            ]);
            $user->save();

            // $fillable yalnızca 'name'dir (Company.php) — mali kimlik
            // alanları burada da, hiçbir yerde de mass-assign edilmez.
            $company = new Company();
            $company->fill(['name' => $companyName]);
            $company->save();

            // "Bu şirket şu an doğdu" olgusu, üyelik ve seçim olaylarından
            // AYRI kaydedilir: ikisi de zaten kendi olaylarını üretecek
            // (member.created, company.selected), ama company.created
            // olmadan "bu company_id ne zaman var oldu" sorusunun cevabı
            // yalnızca companies.created_at'ten çıkarılabilir bir çıkarım
            // olurdu, kayıtlı bir olgu değil.
            $this->audit->record(
                action: AuditAction::CompanyCreated,
                company: $company,
                auditable: $company,
                newValues: ['name' => $company->name],
                actor: $user,
            );

            // Owner üyeliği — pivot'a yazan tek kapı MembershipService'tir.
            // $actor = $user: davet kabulünün guest-path'iyle aynı desen
            // (InvitationService::accept() da kendini üye yapan kullanıcıyı
            // actor olarak geçer) — kayıt olan kişi oturumdan OKUNAMAZ
            // (henüz token yok), bu yüzden açıkça verilir.
            $this->memberships->attach($company, $user, Role::Owner, $user);

            // active_company_id — tek meşru atama yolu budur.
            // CompanySelectionService::select() zaten $user->isMemberOf()
            // doğrulamasından geçer; bir satır yukarıda açılan üyelik aynı
            // transaction/bağlantı içinde olduğundan bu kontrol true döner.
            $this->companySelection->select($user, $company);

            return $user->fresh();
        });
    }
}
