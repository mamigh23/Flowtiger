<?php

namespace Tests\Feature\Api\V1;

use App\Enums\AuditAction;
use App\Enums\Role;
use App\Mail\InvitationMail;
use App\Models\Company;
use App\Models\Invitation;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\CompanySelectionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Faz 6 — davet oluşturma, listeleme ve iptal.
 *
 * Kabul akışı ayrı dosyada (InvitationAcceptTest), çünkü orada ölçülen
 * şey tamamen farklı: tenant dışından gelen, çoğu zaman hiç hesabı
 * olmayan bir kişinin token'la kimlik kazanması.
 */
class InvitationApiTest extends TestCase
{
    use RefreshDatabase;

    private const URI = '/api/v1/invitations';

    private User $owner;

    private User $member;

    private Company $company;

    private Company $foreignCompany;

    /** @var array<int, string> */
    private array $tokens = [];

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();

        $this->owner = User::factory()->create();
        $this->member = User::factory()->create();

        $this->company = Company::factory()->withOwner($this->owner)->create(['name' => 'Sirket A']);
        $this->company->users()->syncWithoutDetaching([
            $this->member->getKey() => ['role' => Role::Member->value],
        ]);

        $this->foreignCompany = Company::factory()
            ->withOwner(User::factory()->create())
            ->create(['name' => 'Sirket B']);

        $this->giveActiveCompany($this->owner);
        $this->giveActiveCompany($this->member);

        $this->clearAuditLog();
    }

    // ---------------------------------------------------------------
    // YARDIMCILAR
    // ---------------------------------------------------------------

    private function giveActiveCompany(User $user, ?Company $company = null): void
    {
        app(CompanySelectionService::class)->select($user, $company ?? $this->company);
        app(CompanyContext::class)->clear();
    }

    private function clearAuditLog(): void
    {
        DB::table('audit_logs')->delete();
    }

    private function apiAs(User $user): self
    {
        Auth::forgetGuards();

        $this->tokens[$user->getKey()] ??= $user->createToken('test-cihaz')->plainTextToken;

        return $this->withHeader('Authorization', 'Bearer '.$this->tokens[$user->getKey()]);
    }

    /**
     * Gönderilen davet mailinden plaintext token'ı okur.
     *
     * Token'ın var olduğu TEK yer budur: veritabanında hash'i, API
     * yanıtında hiçbir şey vardır.
     */
    private function capturedToken(): string
    {
        $token = null;

        Mail::assertSent(InvitationMail::class, function (InvitationMail $mail) use (&$token): bool {
            $token = $mail->plainToken;

            return true;
        });

        $this->assertIsString($token, 'Davet maili gönderilmedi ya da token taşımıyor.');

        return $token;
    }

    /**
     * @return list<object>
     */
    private function auditRows(AuditAction $action): array
    {
        return DB::table('audit_logs')->where('action', $action->value)->orderBy('id')->get()->all();
    }

    private function auditTableAsText(): string
    {
        return DB::table('audit_logs')->get()->toJson();
    }

    // ===============================================================
    // OLUŞTURMA
    // ===============================================================

    public function test_an_owner_can_create_an_invitation(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, ['email' => 'davetli@flowtiger.test', 'role' => 'member'])
            ->assertCreated()
            ->assertJsonPath('data.role', 'member')
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonStructure(['data' => ['id', 'email', 'role', 'status', 'expires_at', 'created_at']]);

        $this->assertDatabaseHas('invitations', [
            'company_id' => $this->company->getKey(),
            'email' => 'davetli@flowtiger.test',
            'role' => 'member',
            'invited_by' => $this->owner->getKey(),
        ]);
    }

    /**
     * §3, §4: veritabanında yalnızca hash.
     */
    public function test_the_plaintext_token_is_never_stored(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, ['email' => 'davetli@flowtiger.test', 'role' => 'member'])
            ->assertCreated();

        $plainToken = $this->capturedToken();
        $row = DB::table('invitations')->where('email', 'davetli@flowtiger.test')->firstOrFail();

        $this->assertNotSame($plainToken, $row->token_hash);
        $this->assertSame(hash('sha256', $plainToken), $row->token_hash);

        $this->assertFalse(
            DB::table('invitations')->where('token_hash', $plainToken)->exists(),
            'Plaintext token veritabanında bulundu.'
        );
    }

    public function test_the_create_response_never_contains_the_token(): void
    {
        $response = $this->apiAs($this->owner)
            ->postJson(self::URI, ['email' => 'davetli@flowtiger.test', 'role' => 'member'])
            ->assertCreated();

        $plainToken = $this->capturedToken();
        $body = $response->getContent();

        $this->assertStringNotContainsString($plainToken, $body);
        $this->assertStringNotContainsString('token', $body);
        $this->assertStringNotContainsString(hash('sha256', $plainToken), $body);
    }

    public function test_the_invitation_mail_is_sent_to_the_invited_address(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, ['email' => 'davetli@flowtiger.test', 'role' => 'owner'])
            ->assertCreated();

        Mail::assertSent(InvitationMail::class, function (InvitationMail $mail): bool {
            return $mail->hasTo('davetli@flowtiger.test')
                && $mail->plainToken !== ''
                && $mail->companyName === 'Sirket A';
        });
    }

    /**
     * Mail::fake() mailable'ı RENDER ETMEZ; şablondaki bir hata bütün
     * testlerden sessizce geçer ve yalnızca production'da patlar.
     * Bu test şablonu gerçekten derler.
     */
    public function test_the_invitation_mail_renders_and_carries_the_token(): void
    {
        $invitation = Invitation::factory()
            ->forCompany($this->company)
            ->forEmail('davetli@flowtiger.test')
            ->asRole(Role::Owner)
            ->create();

        $rendered = (new InvitationMail(
            invitation: $invitation,
            plainToken: 'ornek-token-degeri',
            companyName: 'Sirket A',
        ))->render();

        $this->assertStringContainsString('ornek-token-degeri', $rendered);
        $this->assertStringContainsString('Sirket A', $rendered);
        $this->assertStringContainsString('owner', $rendered);

        // Şablona sır sızmamalı.
        $this->assertStringNotContainsString($invitation->token_hash, $rendered);
    }

    // ===============================================================
    // KABUL BAĞLANTISI (P1-05)
    // ===============================================================

    /**
     * Mail artık ham token yerine frontend'e giden TIKLANABİLİR bir
     * bağlantı taşıyor. Bağlantı config/flowtiger.php'deki
     * invitations.accept_url şablonundan üretilir — burada config
     * BİLİNÇLİ OLARAK bilinen bir değere sabitlenir ki test, gerçek
     * .env'in o anki içeriğine değil, ÜRETİM MANTIĞINA bağlı kalsın.
     */
    public function test_the_invitation_mail_links_to_the_configured_frontend_accept_url(): void
    {
        config(['flowtiger.invitations.accept_url' => 'https://ornek-frontend.test/invitations/accept?token={token}']);

        $invitation = Invitation::factory()
            ->forCompany($this->company)
            ->forEmail('davetli@flowtiger.test')
            ->asRole(Role::Member)
            ->create();

        $rendered = (new InvitationMail(
            invitation: $invitation,
            plainToken: 'abc123token',
            companyName: 'Sirket A',
        ))->render();

        $this->assertStringContainsString(
            'href="https://ornek-frontend.test/invitations/accept?token=abc123token"',
            $rendered,
        );
    }

    /**
     * Token bir SORGU PARAMETRESİ olarak taşınır; url-encode edilmemiş
     * özel karakterler (&, +, /, =) bağlantıyı BOZAR — örneğin bir `&`
     * kendi sorgu parametresi gibi yorumlanır ve token yarıda kesilir.
     *
     * Gerçek üretim (bin2hex) yalnızca [0-9a-f] üretir, ama encode adımı
     * ÜRETİM BİÇİMİNE bağımlı olmamalı: bu test doğrudan sentetik, özel
     * karakterli bir token vererek encode mantığının kendisini sınar.
     */
    public function test_the_invitation_mail_url_encodes_the_token(): void
    {
        config(['flowtiger.invitations.accept_url' => 'https://ornek-frontend.test/invitations/accept?token={token}']);

        $invitation = Invitation::factory()
            ->forCompany($this->company)
            ->forEmail('davetli@flowtiger.test')
            ->asRole(Role::Member)
            ->create();

        $specialToken = 'tok+en/with&special=chars';

        $rendered = (new InvitationMail(
            invitation: $invitation,
            plainToken: $specialToken,
            companyName: 'Sirket A',
        ))->render();

        $this->assertStringContainsString(urlencode($specialToken), $rendered);
        $this->assertStringNotContainsString('token='.$specialToken, $rendered);
    }

    /**
     * accept_url şablonu FRONTEND_URL ortam değişkeninden üretilir —
     * sabit bir localhost/production adresi KOD İÇİNE yazılmaz.
     *
     * config() facade'i BİLİNÇLİ OLARAK kullanılmıyor: Laravel config'i
     * bir kez, uygulama boot olurken önbelleğe alır; test ortasında
     * `putenv()` çağırmak o önbelleği DEĞİŞTİRMEZ. Bu yüzden config
     * dosyası ham bir PHP dosyası olarak — env() çağrılarının GERÇEKTEN
     * o anki ortam değişkenlerini okuduğu şekilde — doğrudan `require`
     * edilir. Orijinal ortam değişkeni `finally` içinde geri yüklenir.
     */
    public function test_the_accept_url_is_derived_from_the_frontend_url_environment_variable(): void
    {
        $original = getenv('FRONTEND_URL');

        putenv('FRONTEND_URL=https://ozel-frontend.test');
        $_ENV['FRONTEND_URL'] = 'https://ozel-frontend.test';

        try {
            $config = require base_path('config/flowtiger.php');

            $this->assertSame(
                'https://ozel-frontend.test/invitations/accept?token={token}',
                $config['invitations']['accept_url'],
            );
        } finally {
            if ($original === false) {
                putenv('FRONTEND_URL');
                unset($_ENV['FRONTEND_URL']);
            } else {
                putenv("FRONTEND_URL={$original}");
                $_ENV['FRONTEND_URL'] = $original;
            }
        }

        $this->assertSame($original, getenv('FRONTEND_URL'), 'Ortam değişkeni bir sonraki teste sızdı.');
    }

    /**
     * P1-05'in ÇEKİRDEK kuralı: ham token artık e-postada AYRI, kopyala-
     * yapıştırılan bir kod olarak GÖSTERİLMEZ. Token yalnızca bağlantının
     * (href) İÇİNDE var olabilir; `<code>` bloğu ya da bağımsız bir metin
     * satırı olarak asla.
     */
    public function test_the_invitation_mail_does_not_show_the_raw_token_as_a_separate_code(): void
    {
        $invitation = Invitation::factory()
            ->forCompany($this->company)
            ->forEmail('davetli@flowtiger.test')
            ->asRole(Role::Member)
            ->create();

        $plainToken = 'ayrica-gosterilmeyen-token';

        $rendered = (new InvitationMail(
            invitation: $invitation,
            plainToken: $plainToken,
            companyName: 'Sirket A',
        ))->render();

        // Eski davranış: <code>{{ $token }}</code>. Artık böyle bir blok yok.
        $this->assertStringNotContainsString('<code>'.$plainToken.'</code>', $rendered);
        $this->assertStringNotContainsString('<code>', $rendered);

        // Token YALNIZCA bağlantının içinde geçmeli, başka hiçbir yerde.
        $occurrences = substr_count($rendered, $plainToken);
        $this->assertSame(1, $occurrences, 'Token birden fazla yerde ya da bağlantı dışında görünüyor.');
        $this->assertStringContainsString('href="', $rendered);
    }

    /**
     * §26: normalizasyon tek yerde. "User@Example.com" ile
     * "user@example.com" aynı kişidir.
     */
    public function test_the_invited_email_is_normalised(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, ['email' => '  Davetli@FlowTiger.TEST  ', 'role' => 'member'])
            ->assertCreated();

        $this->assertDatabaseHas('invitations', ['email' => 'davetli@flowtiger.test']);
        $this->assertDatabaseMissing('invitations', ['email' => '  Davetli@FlowTiger.TEST  ']);
    }

    public function test_a_member_cannot_create_an_invitation(): void
    {
        $this->apiAs($this->member)
            ->postJson(self::URI, ['email' => 'davetli@flowtiger.test', 'role' => 'member'])
            ->assertForbidden();

        $this->assertDatabaseCount('invitations', 0);
        Mail::assertNothingSent();
    }

    public function test_creating_an_invitation_requires_authentication(): void
    {
        $this->postJson(self::URI, ['email' => 'davetli@flowtiger.test', 'role' => 'member'])
            ->assertUnauthorized();

        $this->assertDatabaseCount('invitations', 0);
    }

    public function test_creating_an_invitation_requires_an_active_company(): void
    {
        $stranger = User::factory()->create();

        $this->apiAs($stranger)
            ->postJson(self::URI, ['email' => 'davetli@flowtiger.test', 'role' => 'member'])
            ->assertForbidden();
    }

    public function test_an_invalid_email_is_rejected(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, ['email' => 'e-posta-degil', 'role' => 'member'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    public function test_an_invalid_role_is_rejected(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, ['email' => 'davetli@flowtiger.test', 'role' => 'superadmin'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['role']);

        $this->assertDatabaseCount('invitations', 0);
    }

    public function test_missing_fields_are_rejected(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email', 'role']);
    }

    /**
     * §11: davet edilen adresin sistemde kayıtlı olup olmadığı
     * yanıttan ANLAŞILAMAMALI.
     */
    public function test_inviting_an_existing_account_gives_the_same_response(): void
    {
        $existing = User::factory()->create(['email' => 'mevcut@flowtiger.test']);

        $forNewAddress = $this->apiAs($this->owner)
            ->postJson(self::URI, ['email' => 'yepyeni@flowtiger.test', 'role' => 'member'])
            ->assertCreated();

        $forExistingAccount = $this->apiAs($this->owner)
            ->postJson(self::URI, ['email' => $existing->email, 'role' => 'member'])
            ->assertCreated();

        // Kimlik ve zaman damgaları doğal olarak farklı; şeklin ve
        // durumun aynı olması gerekir.
        $this->assertSame(
            array_keys($forNewAddress->json('data')),
            array_keys($forExistingAccount->json('data')),
        );
        $this->assertSame(
            $forNewAddress->json('data.status'),
            $forExistingAccount->json('data.status'),
        );
        $this->assertSame(201, $forExistingAccount->getStatusCode());
    }

    /**
     * §12: aynı adrese yeniden davet, eskisini iptal eder ve yeni bir
     * token üretir. Dolaşımda aynı anda iki geçerli token kalmaz.
     */
    public function test_reinviting_the_same_address_revokes_the_previous_invitation(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, ['email' => 'davetli@flowtiger.test', 'role' => 'member'])
            ->assertCreated();

        $firstToken = $this->capturedToken();

        $this->apiAs($this->owner)
            ->postJson(self::URI, ['email' => 'davetli@flowtiger.test', 'role' => 'owner'])
            ->assertCreated();

        $invitations = DB::table('invitations')
            ->where('email', 'davetli@flowtiger.test')
            ->orderBy('id')
            ->get();

        $this->assertCount(2, $invitations);
        $this->assertNotNull($invitations[0]->revoked_at, 'Eski davet iptal edilmeliydi.');
        $this->assertNull($invitations[1]->revoked_at);
        $this->assertNotSame(hash('sha256', $firstToken), $invitations[1]->token_hash);

        // Yalnızca bir tane bekleyen davet kalmalı (partial unique index
        // de bunu zorlar).
        $this->assertSame(
            1,
            DB::table('invitations')
                ->where('email', 'davetli@flowtiger.test')
                ->whereNull('accepted_at')->whereNull('revoked_at')->count()
        );
    }

    public function test_the_superseding_revocation_is_audited_as_such(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, ['email' => 'davetli@flowtiger.test', 'role' => 'member'])
            ->assertCreated();

        $this->apiAs($this->owner)
            ->postJson(self::URI, ['email' => 'davetli@flowtiger.test', 'role' => 'member'])
            ->assertCreated();

        $revocations = $this->auditRows(AuditAction::InvitationRevoked);

        $this->assertCount(1, $revocations);

        $metadata = (array) json_decode($revocations[0]->metadata, true);

        $this->assertTrue($metadata['superseded_by_new_invitation']);
    }

    // ===============================================================
    // AUDIT
    // ===============================================================

    public function test_creating_an_invitation_is_audited_without_leaking(): void
    {
        $this->apiAs($this->owner)
            ->postJson(self::URI, ['email' => 'davetli@flowtiger.test', 'role' => 'owner'])
            ->assertCreated();

        $plainToken = $this->capturedToken();
        $rows = $this->auditRows(AuditAction::InvitationCreated);

        $this->assertCount(1, $rows);
        $this->assertSame($this->company->getKey(), (int) $rows[0]->company_id);
        $this->assertSame($this->owner->getKey(), (int) $rows[0]->user_id);

        $metadata = (array) json_decode($rows[0]->metadata, true);

        $this->assertSame(hash('sha256', 'davetli@flowtiger.test'), $metadata['email_hash']);
        $this->assertSame('owner', $metadata['role']);

        $table = $this->auditTableAsText();

        $this->assertStringNotContainsString($plainToken, $table, 'Token audit\'e yazılmış.');
        $this->assertStringNotContainsString('davetli@flowtiger.test', $table, 'Düz metin e-posta audit\'e yazılmış.');
    }

    // ===============================================================
    // LİSTELEME
    // ===============================================================

    public function test_an_owner_can_list_the_invitations(): void
    {
        Invitation::factory()->forCompany($this->company)->count(3)->createMany();

        $this->apiAs($this->owner)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonStructure(['data' => [['id', 'email', 'role', 'status']], 'links', 'meta']);
    }

    public function test_a_member_cannot_list_the_invitations(): void
    {
        Invitation::factory()->forCompany($this->company)->create();

        $this->apiAs($this->member)->getJson(self::URI)->assertForbidden();
    }

    public function test_listing_requires_authentication(): void
    {
        $this->getJson(self::URI)->assertUnauthorized();
    }

    public function test_another_tenants_invitations_are_never_listed(): void
    {
        $mine = Invitation::factory()->forCompany($this->company)->create();
        $foreign = Invitation::factory()
            ->forCompany($this->foreignCompany)
            ->forEmail('gizli@flowtiger.test')
            ->create();

        $response = $this->apiAs($this->owner)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $mine->getKey());

        $ids = collect($response->json('data'))->pluck('id')->all();

        $this->assertNotContains($foreign->getKey(), $ids);
        $this->assertStringNotContainsString('gizli', $response->getContent());
    }

    /**
     * §27: liste, sisteme hiç girmemiş insanların tam adreslerini
     * biriktiren bir kaynağa dönüşmemeli.
     */
    public function test_the_invited_email_is_masked_in_the_response(): void
    {
        Invitation::factory()->forCompany($this->company)->forEmail('ahmet@example.com')->create();

        $response = $this->apiAs($this->owner)->getJson(self::URI)->assertOk();

        $this->assertSame('a***@example.com', $response->json('data.0.email'));
        $this->assertStringNotContainsString('ahmet@example.com', $response->getContent());
    }

    public function test_the_token_hash_is_never_exposed(): void
    {
        $invitation = Invitation::factory()->forCompany($this->company)->create();

        $body = $this->apiAs($this->owner)->getJson(self::URI)->assertOk()->getContent();

        $this->assertStringNotContainsString($invitation->token_hash, $body);
        $this->assertStringNotContainsString('token', $body);
    }

    public function test_the_list_is_paginated(): void
    {
        Invitation::factory()->forCompany($this->company)->count(25)->createMany();

        $this->apiAs($this->owner)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonCount(20, 'data')
            ->assertJsonPath('meta.per_page', 20)
            ->assertJsonPath('meta.total', 25);

        $this->apiAs($this->owner)
            ->getJson(self::URI.'?per_page=5')
            ->assertOk()
            ->assertJsonCount(5, 'data');
    }

    public function test_the_page_size_cannot_exceed_one_hundred(): void
    {
        $this->apiAs($this->owner)
            ->getJson(self::URI.'?per_page=500')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['per_page']);
    }

    public function test_the_list_reports_computed_statuses(): void
    {
        Invitation::factory()->forCompany($this->company)->expired()->create();

        $this->apiAs($this->owner)
            ->getJson(self::URI)
            ->assertOk()
            ->assertJsonPath('data.0.status', 'expired');
    }

    // ===============================================================
    // İPTAL
    // ===============================================================

    public function test_an_owner_can_revoke_a_pending_invitation(): void
    {
        $invitation = Invitation::factory()->forCompany($this->company)->create();

        $this->apiAs($this->owner)
            ->deleteJson(self::URI.'/'.$invitation->getKey())
            ->assertNoContent();

        $this->assertNotNull($invitation->fresh()->revoked_at);
        $this->assertSame('revoked', $invitation->fresh()->status()->value);
    }

    public function test_revoking_is_audited(): void
    {
        $invitation = Invitation::factory()->forCompany($this->company)->create();

        $this->apiAs($this->owner)
            ->deleteJson(self::URI.'/'.$invitation->getKey())
            ->assertNoContent();

        $rows = $this->auditRows(AuditAction::InvitationRevoked);

        $this->assertCount(1, $rows);
        $this->assertSame($this->owner->getKey(), (int) $rows[0]->user_id);
        $this->assertSame($this->company->getKey(), (int) $rows[0]->company_id);
    }

    public function test_a_member_cannot_revoke_an_invitation(): void
    {
        $invitation = Invitation::factory()->forCompany($this->company)->create();

        $this->apiAs($this->member)
            ->deleteJson(self::URI.'/'.$invitation->getKey())
            ->assertForbidden();

        $this->assertNull($invitation->fresh()->revoked_at);
    }

    public function test_another_tenants_invitation_cannot_be_revoked(): void
    {
        $foreign = Invitation::factory()->forCompany($this->foreignCompany)->create();

        $this->apiAs($this->owner)
            ->deleteJson(self::URI.'/'.$foreign->getKey())
            ->assertNotFound();

        $this->assertNull(
            $foreign->fresh()->revoked_at,
            'Başka tenant\'ın daveti iptal edilmiş.'
        );
    }

    public function test_an_already_revoked_invitation_cannot_be_revoked_again(): void
    {
        $invitation = Invitation::factory()->forCompany($this->company)->revoked()->create();

        $this->apiAs($this->owner)
            ->deleteJson(self::URI.'/'.$invitation->getKey())
            ->assertStatus(410)
            ->assertJsonPath('code', 'invitation_revoked');
    }

    public function test_an_accepted_invitation_cannot_be_revoked(): void
    {
        $invitation = Invitation::factory()->forCompany($this->company)->accepted()->create();

        $this->apiAs($this->owner)
            ->deleteJson(self::URI.'/'.$invitation->getKey())
            ->assertStatus(410)
            ->assertJsonPath('code', 'invitation_accepted');
    }

    public function test_revoking_requires_authentication(): void
    {
        $invitation = Invitation::factory()->forCompany($this->company)->create();

        $this->deleteJson(self::URI.'/'.$invitation->getKey())->assertUnauthorized();

        $this->assertNull($invitation->fresh()->revoked_at);
    }
}
