<?php

namespace Tests\Feature\Audit;

use App\Enums\AuditAction;
use App\Enums\Role;
use App\Exceptions\CrossTenantAccessException;
use App\Models\AuditLog;
use App\Models\Company;
use App\Models\Customer;
use App\Models\User;
use App\Services\CompanyContext;
use App\Services\CompanySelectionService;
use App\Services\CustomerService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use LogicException;
use Tests\TestCase;

/**
 * Faz 5 — kritik operasyonlar gerçekten iz bırakıyor mu?
 *
 * Bu dosya audit'in ÜRETİM tarafını ölçer: doğru olay, doğru şirket,
 * doğru aktör, doğru eski/yeni değerler — ve her şeyden önce SIRRIN
 * SIZMADIĞI. Okuma tarafı (API, yetki, tenant filtresi) ayrı dosyada.
 *
 * Bütün doğrulamalar DB::table üzerinden yapılır, Eloquent üzerinden
 * değil: AuditLog'un global tenant scope'u testin gördüğünü filtreleyip
 * bir sızıntıyı gizleyebilirdi. Test, ölçtüğü mekanizmaya güvenmemeli.
 */
class AuditTrailTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $member;

    private Company $company;

    /** @var array<int, string> */
    private array $tokens = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::factory()->create(['email' => 'owner@flowtiger.test']);
        $this->member = User::factory()->create(['email' => 'member@flowtiger.test']);

        $this->company = Company::factory()->withOwner($this->owner)->create();
        $this->company->users()->syncWithoutDetaching([
            $this->member->getKey() => ['role' => Role::Member->value],
        ]);

        $this->giveActiveCompany($this->owner);
        $this->giveActiveCompany($this->member);

        // Hazırlık sırasında oluşan kayıtlar (company.selected) temizlenir;
        // her test yalnızca KENDİ tetiklediği izi ölçsün.
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

    /**
     * Fixture sıfırlama. Query builder kullanılır çünkü AuditLog modeli
     * silmeyi bilinçli olarak yasaklar — bu yasak üretim davranışıdır ve
     * testin onu delmesi değil, ETRAFINDAN dolaşması gerekir.
     */
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
     * @return list<object>
     */
    private function auditRows(?AuditAction $action = null): array
    {
        $query = DB::table('audit_logs')->orderBy('id');

        if ($action !== null) {
            $query->where('action', $action->value);
        }

        return $query->get()->all();
    }

    private function singleAuditRow(AuditAction $action): object
    {
        $rows = $this->auditRows($action);

        $this->assertCount(1, $rows, "[{$action->value}] için tam olarak bir audit kaydı bekleniyordu.");

        return $rows[0];
    }

    /**
     * @return array<string, mixed>
     */
    private function decode(?string $json): array
    {
        return $json === null ? [] : (array) json_decode($json, true);
    }

    private function wholeAuditTableAsText(): string
    {
        return DB::table('audit_logs')->get()->toJson();
    }

    // ===============================================================
    // KİMLİK DOĞRULAMA
    // ===============================================================

    public function test_a_successful_login_is_audited(): void
    {
        $this->postJson('/api/v1/auth/login', [
            'email' => 'owner@flowtiger.test',
            'password' => 'password',
        ])->assertOk();

        $row = $this->singleAuditRow(AuditAction::LoginSucceeded);

        $this->assertSame($this->owner->getKey(), (int) $row->user_id);
        $this->assertNull($row->company_id, 'Login olayı bir şirkete bağlanmamalıydı (§5).');
    }

    public function test_a_successful_login_audit_never_contains_the_token(): void
    {
        $token = $this->postJson('/api/v1/auth/login', [
            'email' => 'owner@flowtiger.test',
            'password' => 'password',
        ])->assertOk()->json('data.token');

        [, $plainTextPart] = explode('|', $token, 2);

        $table = $this->wholeAuditTableAsText();

        $this->assertStringNotContainsString($token, $table);
        $this->assertStringNotContainsString($plainTextPart, $table);
    }

    public function test_a_failed_login_for_an_existing_user_records_the_user(): void
    {
        $this->postJson('/api/v1/auth/login', [
            'email' => 'owner@flowtiger.test',
            'password' => 'yanlis-parola',
        ])->assertUnauthorized();

        $row = $this->singleAuditRow(AuditAction::LoginFailed);

        $this->assertSame($this->owner->getKey(), (int) $row->user_id);
        $this->assertNull($row->company_id);
    }

    public function test_a_failed_login_for_an_unknown_email_records_no_user(): void
    {
        $this->postJson('/api/v1/auth/login', [
            'email' => 'olmayan@flowtiger.test',
            'password' => 'herhangi-bir-parola',
        ])->assertUnauthorized();

        $row = $this->singleAuditRow(AuditAction::LoginFailed);

        $this->assertNull($row->user_id);
    }

    /**
     * §12: denenen e-posta düz metin olarak SAKLANMAZ, yalnızca tek yönlü
     * özeti tutulur.
     */
    public function test_a_failed_login_stores_a_hash_instead_of_the_email(): void
    {
        $this->postJson('/api/v1/auth/login', [
            'email' => 'Kurban@FlowTiger.test',
            'password' => 'yanlis-parola',
        ])->assertUnauthorized();

        $row = $this->singleAuditRow(AuditAction::LoginFailed);
        $metadata = $this->decode($row->metadata);

        $this->assertArrayHasKey('email_hash', $metadata);

        // Büyük/küçük harf normalize edilmeli: aynı hesaba yapılan
        // denemeler korele edilebilmeli.
        $this->assertSame(hash('sha256', 'kurban@flowtiger.test'), $metadata['email_hash']);

        $table = $this->wholeAuditTableAsText();

        $this->assertStringNotContainsString('Kurban@FlowTiger.test', $table);
        $this->assertStringNotContainsString('kurban@flowtiger.test', $table);
    }

    public function test_a_failed_login_never_records_the_attempted_password(): void
    {
        $this->postJson('/api/v1/auth/login', [
            'email' => 'owner@flowtiger.test',
            'password' => 'cok-gizli-deneme-parolasi',
        ])->assertUnauthorized();

        $this->assertStringNotContainsString(
            'cok-gizli-deneme-parolasi',
            $this->wholeAuditTableAsText(),
            'Denenen parola audit tablosuna yazılmış.'
        );
    }

    public function test_a_logout_is_audited(): void
    {
        $this->apiAs($this->owner)
            ->postJson('/api/v1/auth/logout')
            ->assertNoContent();

        $row = $this->singleAuditRow(AuditAction::LoggedOut);

        $this->assertSame($this->owner->getKey(), (int) $row->user_id);
        $this->assertNull($row->company_id);
    }

    // ===============================================================
    // ŞİRKET SEÇİMİ
    // ===============================================================

    public function test_selecting_a_company_is_audited_against_that_company(): void
    {
        $secondCompany = Company::factory()->withOwner($this->owner)->create();
        $this->clearAuditLog();

        $this->apiAs($this->owner)
            ->postJson('/api/v1/companies/'.$secondCompany->getKey().'/select')
            ->assertOk();

        $row = $this->singleAuditRow(AuditAction::CompanySelected);

        $this->assertSame($secondCompany->getKey(), (int) $row->company_id);
        $this->assertSame($this->owner->getKey(), (int) $row->user_id);
    }

    public function test_a_rejected_company_selection_leaves_no_audit(): void
    {
        $foreign = Company::factory()->withOwner(User::factory()->create())->create();
        $this->clearAuditLog();

        $this->apiAs($this->owner)
            ->postJson('/api/v1/companies/'.$foreign->getKey().'/select')
            ->assertForbidden();

        $this->assertCount(
            0,
            $this->auditRows(AuditAction::CompanySelected),
            'Reddedilen seçim audit kaydı bırakmış.'
        );
    }

    // ===============================================================
    // ÜYELİK
    // ===============================================================

    public function test_creating_a_member_is_audited_without_the_password(): void
    {
        $this->apiAs($this->owner)
            ->postJson('/api/v1/members', [
                'name' => 'Yeni Uye',
                'email' => 'yeni@flowtiger.test',
                'password' => 'super-gizli-parola',
                'role' => 'member',
            ])
            ->assertCreated();

        $row = $this->singleAuditRow(AuditAction::MemberCreated);
        $newValues = $this->decode($row->new_values);

        $this->assertSame($this->company->getKey(), (int) $row->company_id);
        $this->assertSame($this->owner->getKey(), (int) $row->user_id);
        $this->assertSame('Yeni Uye', $newValues['name']);
        $this->assertSame('member', $newValues['role']);

        // E-posta özet olarak saklanır, düz metin olarak değil.
        $this->assertSame(hash('sha256', 'yeni@flowtiger.test'), $newValues['email_hash']);
        $this->assertArrayNotHasKey('email', $newValues);

        $this->assertArrayNotHasKey('password', $newValues);
        $this->assertStringNotContainsString('yeni@flowtiger.test', $this->wholeAuditTableAsText());
        $this->assertStringNotContainsString(
            'super-gizli-parola',
            $this->wholeAuditTableAsText(),
            'Parola audit tablosuna yazılmış.'
        );
    }

    public function test_updating_a_member_records_old_and_new_values(): void
    {
        $this->apiAs($this->owner)
            ->putJson('/api/v1/members/'.$this->member->getKey(), [
                'name' => 'Yeni Ad',
                'email' => 'yeni-adres@flowtiger.test',
            ])
            ->assertOk();

        $row = $this->singleAuditRow(AuditAction::MemberUpdated);

        $old = $this->decode($row->old_values);
        $new = $this->decode($row->new_values);

        // Fixture adı factory'den geliyor; sabit yazmak yerine okunur.
        $this->assertSame($this->member->name, $old['name']);
        $this->assertSame('Yeni Ad', $new['name']);

        // E-posta değişimi izlenebilir olmalı — ama DÜZ METİN DEĞİL.
        // Audit kalıcı ve silinemez olduğu için oraya yazılan bir adres
        // bir daha asla silinemez; tek yönlü özet hem izlenebilirliği
        // hem silinebilirliği korur.
        $this->assertSame(hash('sha256', 'member@flowtiger.test'), $old['email_hash']);
        $this->assertSame(hash('sha256', 'yeni-adres@flowtiger.test'), $new['email_hash']);

        $this->assertArrayNotHasKey('email', $old);
        $this->assertArrayNotHasKey('email', $new);

        $this->assertStringNotContainsString('member@flowtiger.test', $this->wholeAuditTableAsText());
        $this->assertStringNotContainsString('yeni-adres@flowtiger.test', $this->wholeAuditTableAsText());
    }

    public function test_changing_a_role_records_the_old_and_new_role(): void
    {
        $this->apiAs($this->owner)
            ->patchJson('/api/v1/members/'.$this->member->getKey().'/role', ['role' => 'owner'])
            ->assertOk();

        $row = $this->singleAuditRow(AuditAction::MemberRoleChanged);

        $this->assertSame(['role' => 'member'], $this->decode($row->old_values));
        $this->assertSame(['role' => 'owner'], $this->decode($row->new_values));
        $this->assertSame($this->member->getKey(), (int) $row->auditable_id);
    }

    public function test_removing_a_member_records_the_role_they_held(): void
    {
        $this->apiAs($this->owner)
            ->deleteJson('/api/v1/members/'.$this->member->getKey())
            ->assertNoContent();

        $row = $this->singleAuditRow(AuditAction::MemberRemoved);

        $this->assertSame('member', $this->decode($row->old_values)['role']);
        $this->assertSame($this->company->getKey(), (int) $row->company_id);
    }

    /**
     * §20.11: başarısız bir işlem BAŞARI kaydı bırakmamalı.
     */
    public function test_a_rejected_role_change_leaves_no_audit(): void
    {
        // Son owner kendini member yapamaz → 422.
        $this->apiAs($this->owner)
            ->patchJson('/api/v1/members/'.$this->owner->getKey().'/role', ['role' => 'member'])
            ->assertStatus(422);

        $this->assertCount(0, $this->auditRows(AuditAction::MemberRoleChanged));
    }

    public function test_a_forbidden_member_creation_leaves_no_audit(): void
    {
        $this->apiAs($this->member)
            ->postJson('/api/v1/members', [
                'name' => 'Kacak',
                'email' => 'kacak@flowtiger.test',
                'password' => 'gizli-parola',
                'role' => 'owner',
            ])
            ->assertForbidden();

        $this->assertCount(0, $this->auditRows(AuditAction::MemberCreated));
    }

    // ===============================================================
    // MÜŞTERİ
    // ===============================================================

    public function test_creating_a_customer_is_audited(): void
    {
        $this->apiAs($this->owner)
            ->postJson('/api/v1/customers', ['name' => 'Yeni Musteri', 'phone' => '05551112233'])
            ->assertCreated();

        $row = $this->singleAuditRow(AuditAction::CustomerCreated);

        $this->assertSame($this->company->getKey(), (int) $row->company_id);
        $this->assertSame(Customer::class, $row->auditable_type);
        $this->assertSame('Yeni Musteri', $this->decode($row->new_values)['name']);
    }

    public function test_updating_a_customer_records_safe_old_and_new_values(): void
    {
        $customer = Customer::factory()->forCompany($this->company)->create([
            'name' => 'Eski Ad',
            'phone' => '05550000000',
        ]);

        $this->clearAuditLog();

        $this->apiAs($this->owner)
            ->putJson('/api/v1/customers/'.$customer->getKey(), [
                'name' => 'Yeni Ad',
                'phone' => '05559998877',
            ])
            ->assertOk();

        $row = $this->singleAuditRow(AuditAction::CustomerUpdated);

        $this->assertSame(
            ['name' => 'Eski Ad', 'phone' => '05550000000'],
            $this->decode($row->old_values)
        );
        $this->assertSame(
            ['name' => 'Yeni Ad', 'phone' => '05559998877'],
            $this->decode($row->new_values)
        );
    }

    public function test_deleting_a_customer_records_what_was_deleted(): void
    {
        $customer = Customer::factory()->forCompany($this->company)->create(['name' => 'Silinecek']);
        $this->clearAuditLog();

        $this->apiAs($this->owner)
            ->deleteJson('/api/v1/customers/'.$customer->getKey())
            ->assertNoContent();

        $row = $this->singleAuditRow(AuditAction::CustomerDeleted);

        // Kayıt artık yok; "ne silindi" sorusunun tek cevabı bu satır.
        $this->assertSame('Silinecek', $this->decode($row->old_values)['name']);
        $this->assertSame($customer->getKey(), (int) $row->auditable_id);
    }

    // ===============================================================
    // BÜTÜNLÜK
    // ===============================================================

    /**
     * §20.24/25: iş işlemi başarısız olursa ne değişiklik ne de audit
     * kalır — ikisi aynı transaction'dadır. Ve hata YUTULMAZ; çağırana
     * exception olarak döner.
     */
    public function test_a_failed_operation_leaves_neither_a_change_nor_an_audit(): void
    {
        $customer = Customer::factory()->forCompany($this->company)->create(['name' => 'Degismeyecek']);
        $this->clearAuditLog();

        // Aktif şirket A iken B şirketi için yazma girişimi: servis
        // CrossTenantAccessException fırlatır.
        $foreign = Company::factory()->withOwner(User::factory()->create())->create();

        app(CompanyContext::class)->setForUser($this->owner, $this->company);

        try {
            app(CustomerService::class)->update($foreign, $customer, 'Ele Gecirildi', null);
            $this->fail('Tenant dışı yazma engellenmeliydi.');
        } catch (CrossTenantAccessException) {
            // beklenen
        }

        $this->assertCount(0, $this->auditRows(), 'Başarısız işlem audit kaydı bırakmış.');
        $this->assertSame('Degismeyecek', $customer->fresh()->name);
    }

    public function test_every_recorded_action_is_a_known_enum_value(): void
    {
        // Birkaç farklı olay üret.
        $this->postJson('/api/v1/auth/login', [
            'email' => 'owner@flowtiger.test',
            'password' => 'password',
        ])->assertOk();

        $this->apiAs($this->owner)
            ->postJson('/api/v1/customers', ['name' => 'Musteri'])
            ->assertCreated();

        $this->apiAs($this->owner)
            ->patchJson('/api/v1/members/'.$this->member->getKey().'/role', ['role' => 'owner'])
            ->assertOk();

        $recorded = DB::table('audit_logs')->distinct()->pluck('action')->all();

        $this->assertNotEmpty($recorded);

        foreach ($recorded as $action) {
            $this->assertContains(
                $action,
                AuditAction::values(),
                "Tanınmayan audit action veritabanına yazılmış: [{$action}]"
            );
        }
    }

    /**
     * Bir audit satırını değiştirebilen sistem audit tutmuyordur.
     */
    public function test_an_audit_record_cannot_be_modified(): void
    {
        $log = AuditLog::factory()->forCompany($this->company)->create();

        $this->expectException(LogicException::class);

        $log->update(['action' => AuditAction::LoginSucceeded->value]);
    }

    public function test_an_audit_record_cannot_be_deleted(): void
    {
        $log = AuditLog::factory()->forCompany($this->company)->create();

        $this->expectException(LogicException::class);

        $log->delete();
    }
}
