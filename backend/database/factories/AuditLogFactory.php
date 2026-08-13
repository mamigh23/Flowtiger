<?php

namespace Database\Factories;

use App\Enums\AuditAction;
use App\Models\AuditLog;
use App\Models\Company;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AuditLog>
 *
 * Yalnızca TEST VERİSİ üretir. Gerçek audit kayıtları AuditLogService
 * üzerinden, domain işlemlerinin yan etkisi olarak doğar — üretim
 * mantığının hiçbir parçası buraya kopyalanmaz (§21). Bu factory'nin
 * varlık sebebi, tenant izolasyonunu test edebilmek için başka bir
 * şirkete ait kayıt üretebilmektir.
 */
class AuditLogFactory extends Factory
{
    protected $model = AuditLog::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'company_id' => Company::factory(),
            'user_id' => User::factory(),
            'action' => AuditAction::CustomerCreated->value,
            'auditable_type' => null,
            'auditable_id' => null,
            'old_values' => null,
            'new_values' => null,
            'metadata' => null,
            'ip_address' => '203.0.113.10',
            'user_agent' => 'FlowTiger Test Agent',
            'created_at' => now(),
        ];
    }

    public function forCompany(Company $company): static
    {
        return $this->state(fn (): array => [
            'company_id' => $company->getKey(),
        ]);
    }

    public function by(User $user): static
    {
        return $this->state(fn (): array => [
            'user_id' => $user->getKey(),
        ]);
    }

    public function action(AuditAction $action): static
    {
        return $this->state(fn (): array => [
            'action' => $action->value,
        ]);
    }

    /**
     * Şirkete bağlı olmayan sistem kaydı (login/logout gibi).
     */
    public function withoutCompany(): static
    {
        return $this->state(fn (): array => [
            'company_id' => null,
        ]);
    }
}
