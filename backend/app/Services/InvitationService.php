<?php

namespace App\Services;

use App\Enums\AuditAction;
use App\Enums\Role;
use App\Exceptions\InvitationException;
use App\Mail\InvitationMail;
use App\Models\Company;
use App\Models\Invitation;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

/**
 * Davet akışının tamamı.
 *
 * Invitation modeli global tenant scope taşımaz (sebebi model
 * docblock'unda); bu yüzden şirket filtresi BURADA, tek bir yerde yaşar.
 * Controller'lar Invitation::query() çağırmaz — çağırsalardı, bir gün
 * biri şirket koşulunu yazmayı unuturdu.
 *
 * Üyelik yazma işi de buraya ait DEĞİLDİR: pivot'a yazan tek kapı
 * MembershipService'tir ve davet kabulü ona devreder. Böylece "son owner"
 * gibi üyelik kuralları tek yerde kalır.
 */
class InvitationService
{
    public function __construct(
        private readonly MembershipService $memberships,
        private readonly AuditLogService $audit,
    ) {}

    /**
     * E-posta karşılaştırmalarının TEK normalizasyon noktası (§26).
     *
     * "User@Example.com" ile "user@example.com" aynı kişidir. İki ayrı
     * yerde iki farklı normalizasyon, bir gün aynı adrese iki davet ya da
     * iki kullanıcı hesabı üretir.
     */
    public static function normaliseEmail(string $email): string
    {
        return mb_strtolower(trim($email));
    }

    /**
     * Aktif şirketin davetleri (sayfalama için).
     */
    public function invitationsFor(Company $company): Builder
    {
        return Invitation::query()->where('company_id', $company->getKey());
    }

    /**
     * Şirkete ait daveti getirir; ait değilse 404.
     *
     * TENANT SINIRI BURADA ÇİZİLİR. {invitation} route model binding'i
     * daveti tenant'tan bağımsız çözer; başka şirketin daveti de bağlanır.
     * 403 yerine 404 dönmek bilinçlidir — 403, o id'de bir davetin VAR
     * OLDUĞUNU doğrular. Faz 3 (Customer) ve Faz 4 (Member) ile aynı karar.
     *
     * @throws InvitationException
     */
    public function findForCompanyOrFail(Company $company, Invitation $invitation): Invitation
    {
        if ((int) $invitation->company_id !== (int) $company->getKey()) {
            throw InvitationException::notFound();
        }

        return $invitation;
    }

    /**
     * Yeni davet oluşturur ve e-postayı gönderir.
     *
     * DUPLICATE DAVRANIŞI (§12): aynı şirket + aynı e-posta için bekleyen
     * bir davet varsa ESKİSİ İPTAL EDİLİR, yenisi oluşturulur. Sebep:
     * "yeniden davet et" isteğinin kullanıcı açısından anlamı, çalışan
     * yeni bir link almaktır. Eski daveti aynen döndürmek, kullanıcının
     * ulaşamadığı (belki silinmiş) bir maildeki token'ı yaşatmaya devam
     * ederdi. İptal ayrıca audit'e yazılır: dolaşımdaki bir token'ın
     * geçersizleşmesi izlenmesi gereken bir olaydır.
     *
     * Şirket satırı kilitlenir: iki owner aynı anda aynı adrese davet
     * gönderirse ikisi de "bekleyen davet yok" görüp iki geçerli token
     * üretemez (§19 deseni, Faz 4'ten).
     *
     * Mail, transaction DIŞINDA gönderilir. İçeride gönderilseydi, geri
     * alınan bir transaction'ın ardından var olmayan bir davetin maili
     * kullanıcıya ulaşmış olurdu.
     */
    public function create(Company $company, string $email, Role $role, User $invitedBy): Invitation
    {
        $normalisedEmail = self::normaliseEmail($email);

        // Plaintext token yalnızca bu metodun içinde ve gönderilen mail'de
        // yaşar. Hiçbir yere kaydedilmez, hiçbir yanıtta dönmez (§4).
        $plainToken = $this->generateToken();

        $invitation = DB::transaction(function () use ($company, $normalisedEmail, $role, $invitedBy, $plainToken): Invitation {
            $this->lockCompany($company);

            $this->revokeExistingPendingInvitation($company, $normalisedEmail, $invitedBy);

            $invitation = new Invitation();

            $invitation->fill([
                'company_id' => $company->getKey(),
                'invited_by' => $invitedBy->getKey(),
                'email' => $normalisedEmail,
                'role' => $role->value,
                'expires_at' => now()->addDays($this->expiryDays()),
            ]);

            // token_hash mass-assignable değil: sistem üretir.
            $invitation->token_hash = $this->hashToken($plainToken);
            $invitation->save();

            $this->audit->record(
                action: AuditAction::InvitationCreated,
                company: $company,
                auditable: $invitation,
                metadata: [
                    // Düz metin e-posta audit'e yazılmaz; davet kaydına
                    // auditable üzerinden zaten ulaşılabilir (§23).
                    'email_hash' => $this->audit->hashEmail($normalisedEmail),
                    'role' => $role->value,
                ],
                actor: $invitedBy,
            );

            return $invitation;
        });

        Mail::to($normalisedEmail)->send(new InvitationMail(
            invitation: $invitation,
            plainToken: $plainToken,
            companyName: $company->name,
        ));

        return $invitation;
    }

    /**
     * Daveti kabul eder.
     *
     * Sıra güvenlik açısından önemlidir (§15):
     *   1. token → davet (yoksa 404)
     *   2. davet kullanılabilir mi (değilse 410)
     *   3. kimlik: giriş yapmışsa e-posta eşleşmeli, yapmamışsa hesabı
     *      olmayan biri olmalı
     *   4. zaten üye mi (öyleyse 422 — token TÜKETİLMEZ)
     *   5. tek transaction: kullanıcı (gerekiyorsa) + üyelik +
     *      accepted_at + audit (§24)
     *
     * @throws InvitationException
     */
    public function accept(
        string $plainToken,
        ?User $authenticated,
        ?string $name,
        #[\SensitiveParameter] ?string $password,
    ): Invitation {
        $invitation = Invitation::query()
            ->where('token_hash', $this->hashToken($plainToken))
            ->first();

        if ($invitation === null) {
            throw InvitationException::notFound();
        }

        $status = $invitation->status();

        if (! $status->isUsable()) {
            throw InvitationException::notUsable($status);
        }

        $company = $invitation->company;

        if ($company === null) {
            // company_id CASCADE olduğu için normalde ulaşılamaz; şirket
            // yoksa davet de yoktur.
            throw InvitationException::notFound();
        }

        $user = $this->resolveAcceptingUser($invitation, $authenticated);

        if ($user !== null && $user->isMemberOf($company)) {
            // Davet TÜKETİLMEZ: kabul edip rolü güncellemek, Faz 4'teki
            // rol değiştirme yetkisini davet üzerinden atlatmak olurdu.
            throw InvitationException::alreadyMember();
        }

        return DB::transaction(function () use ($invitation, $company, $user, $name, $password): Invitation {
            $member = $user ?? $this->createUserFromInvitation($invitation, (string) $name, (string) $password);

            $this->memberships->attach($company, $member, $invitation->role, $member);

            $invitation->accepted_at = now();
            $invitation->save();

            $this->audit->record(
                action: AuditAction::InvitationAccepted,
                company: $company,
                auditable: $invitation,
                metadata: [
                    'email_hash' => $this->audit->hashEmail($invitation->email),
                    'role' => $invitation->role->value,
                    // Kabul eden hesabın yeni mi oluştuğu, güvenlik
                    // incelemesinde anlamlı bir ayrımdır.
                    'created_new_account' => $user === null,
                ],
                actor: $member,
            );

            return $invitation;
        });
    }

    /**
     * Bekleyen daveti iptal eder.
     *
     * Zaten kabul edilmiş ya da iptal edilmiş bir davet için 410 döner:
     * "iptal edilecek bir şey yok" durumu sessizce başarı sayılmamalı,
     * çünkü owner o davetin hâlâ dolaşımda olduğunu sanabilir.
     * Süresi dolmuş davet de aynı şekilde — zaten kullanılamaz.
     *
     * @throws InvitationException
     */
    public function revoke(Company $company, Invitation $invitation, User $actor): Invitation
    {
        $invitation = $this->findForCompanyOrFail($company, $invitation);

        $status = $invitation->status();

        if (! $status->isUsable()) {
            throw InvitationException::notUsable($status);
        }

        return DB::transaction(function () use ($company, $invitation, $actor): Invitation {
            $invitation->revoked_at = now();
            $invitation->save();

            $this->audit->record(
                action: AuditAction::InvitationRevoked,
                company: $company,
                auditable: $invitation,
                metadata: [
                    'email_hash' => $this->audit->hashEmail($invitation->email),
                    'role' => $invitation->role->value,
                ],
                actor: $actor,
            );

            return $invitation;
        });
    }

    // ---------------------------------------------------------------
    // İÇ YARDIMCILAR
    // ---------------------------------------------------------------

    /**
     * Daveti kabul eden kullanıcıyı belirler.
     *
     * null dönerse: davet edilen e-postanın hesabı yok, yeni hesap
     * açılacak.
     *
     * @throws InvitationException
     */
    private function resolveAcceptingUser(Invitation $invitation, ?User $authenticated): ?User
    {
        if ($authenticated !== null) {
            // Giriş yapmış biri, YALNIZCA kendi adresine gelen daveti
            // kabul edebilir. Aksi halde token'ı ele geçiren herhangi bir
            // kullanıcı kendini şirkete ekleyebilirdi.
            if (self::normaliseEmail($authenticated->email) !== $invitation->email) {
                throw InvitationException::emailMismatch();
            }

            return $authenticated;
        }

        $existing = User::query()->where('email', $invitation->email)->first();

        if ($existing !== null) {
            // Hesabı olan davetli giriş yapmalı. Sızan bir davet linki,
            // hesabın sahibinden habersiz o hesabı bir şirkete bağlamamalı.
            throw InvitationException::authenticationRequired();
        }

        return null;
    }

    /**
     * Davetten yeni kullanıcı hesabı oluşturur.
     *
     * E-posta DAVETTEN gelir, istekten değil: kullanıcı kendi adresini
     * seçseydi, bir davetle istediği adrese hesap açabilirdi.
     * Parola 'hashed' cast'i ile yazılır; düz metin ne veritabanına ne
     * audit'e girer (§16).
     */
    private function createUserFromInvitation(
        Invitation $invitation,
        string $name,
        #[\SensitiveParameter] string $password,
    ): User {
        $user = new User();

        $user->fill([
            'name' => $name,
            'email' => $invitation->email,
            'password' => $password,
        ]);

        $user->save();

        return $user;
    }

    /**
     * Aynı adrese ait bekleyen daveti iptal eder.
     */
    private function revokeExistingPendingInvitation(Company $company, string $email, User $actor): void
    {
        $pending = $this->invitationsFor($company)
            ->where('email', $email)
            ->whereNull('accepted_at')
            ->whereNull('revoked_at')
            ->first();

        if ($pending === null) {
            return;
        }

        $pending->revoked_at = now();
        $pending->save();

        $this->audit->record(
            action: AuditAction::InvitationRevoked,
            company: $company,
            auditable: $pending,
            metadata: [
                'email_hash' => $this->audit->hashEmail($email),
                // Bu iptal bir kullanıcı kararı değil, yeniden davetin
                // yan etkisidir. Audit okuyan kişi ayrımı görebilmeli.
                'superseded_by_new_invitation' => true,
            ],
            actor: $actor,
        );
    }

    /**
     * 256 bit entropi, hex gösterim (64 karakter).
     *
     * random_bytes() kriptografik olarak güvenlidir; tahmin edilebilir
     * bir kaynak (uniqid, mt_rand, Str::uuid) davet linkini kırılabilir
     * yapardı.
     */
    private function generateToken(): string
    {
        return bin2hex(random_bytes(32));
    }

    private function hashToken(string $plainToken): string
    {
        return hash('sha256', $plainToken);
    }

    private function expiryDays(): int
    {
        return (int) config('flowtiger.invitations.expires_after_days', 7);
    }

    /**
     * Şirket satırını kilitler — Faz 0'dan beri kullanılan eşzamanlılık
     * deseni (CustomerService, MembershipService).
     */
    private function lockCompany(Company $company): void
    {
        Company::whereKey($company->getKey())->lockForUpdate()->firstOrFail();
    }
}
