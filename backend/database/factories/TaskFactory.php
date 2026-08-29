<?php

namespace Database\Factories;

use App\Models\Company;
use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Task>
 */
class TaskFactory extends Factory
{
    protected $model = Task::class;

    /**
     * Varsayılan: 27 Ağustos 09:00'a planlanmış, açık bir görev.
     *
     * `completed_at` fixture'da ÜRETİLMEZ: tamamlanma sunucunun yazdığı
     * bir zaman damgasıdır ve kendi ucundan geçer. Factory'nin onu
     * doldurması, testleri gerçekte oluşmayan bir yoldan kurmak olurdu.
     * Tamamlanmış bir görev gerektiğinde `completed()` durumu kullanılır.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'company_id' => Company::factory(),
            'title' => 'Ahmet Yılmaz\'ı ara',
            'note' => null,
            'scheduled_date' => '2026-08-27',
            'scheduled_time' => '09:00:00',
            'completed_at' => null,
            'created_by' => User::factory(),
            'assigned_to' => null,
            'customer_id' => null,
        ];
    }

    public function forCompany(Company $company): static
    {
        return $this->state(fn (): array => [
            'company_id' => $company->getKey(),
        ]);
    }

    public function createdBy(User $user): static
    {
        return $this->state(fn (): array => [
            'created_by' => $user->getKey(),
        ]);
    }

    public function completed(): static
    {
        return $this->state(fn (): array => [
            'completed_at' => now(),
        ]);
    }

    /** Saatsiz görev — listede günün sonuna düşer. */
    public function untimed(): static
    {
        return $this->state(fn (): array => [
            'scheduled_time' => null,
        ]);
    }
}
