<?php

namespace Database\Factories;

use App\Enums\Role;
use App\Models\Company;
use App\Models\Invitation;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Invitation>
 *
 * Test verisi üretir; üretim mantığı taşımaz.
 *
 * TOKEN ÜRETİMİ BURADA YOKTUR. Gerçek token'ı yalnızca
 * InvitationService üretir ve yalnızca mail'e verir. Bu factory,
 * testin BİLDİĞİ bir plaintext'ten hash türeten withToken() durumunu
 * sunar — böylece testler mail akışından geçmeden de süresi dolmuş,
 * iptal edilmiş ya da kabul edilmiş davet senaryolarını kurabilir.
 */
class InvitationFactory extends Factory
{
    protected $model = Invitation::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'company_id' => Company::factory(),
            'invited_by' => User::factory(),
            'email' => fake()->unique()->safeEmail(),
            'role' => Role::Member->value,
            'token_hash' => hash('sha256', 'test-token-'.fake()->unique()->uuid()),
            'expires_at' => now()->addDays(7),
            'accepted_at' => null,
            'revoked_at' => null,
        ];
    }

    public function forCompany(Company $company): static
    {
        return $this->state(fn (): array => [
            'company_id' => $company->getKey(),
        ]);
    }

    public function invitedBy(User $user): static
    {
        return $this->state(fn (): array => [
            'invited_by' => $user->getKey(),
        ]);
    }

    /**
     * E-posta her zaman normalize edilmiş (küçük harf) saklanır.
     */
    public function forEmail(string $email): static
    {
        return $this->state(fn (): array => [
            'email' => mb_strtolower(trim($email)),
        ]);
    }

    public function asRole(Role $role): static
    {
        return $this->state(fn (): array => [
            'role' => $role->value,
        ]);
    }

    /**
     * Testin elindeki plaintext'ten hash türetir.
     */
    public function withToken(string $plainToken): static
    {
        return $this->state(fn (): array => [
            'token_hash' => hash('sha256', $plainToken),
        ]);
    }

    public function expired(): static
    {
        return $this->state(fn (): array => [
            'expires_at' => now()->subDay(),
        ]);
    }

    public function revoked(): static
    {
        return $this->state(fn (): array => [
            'revoked_at' => now()->subHour(),
        ]);
    }

    public function accepted(): static
    {
        return $this->state(fn (): array => [
            'accepted_at' => now()->subHour(),
        ]);
    }
}
