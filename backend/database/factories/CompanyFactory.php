<?php

namespace Database\Factories;

use App\Models\Company;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Company>
 */
class CompanyFactory extends Factory
{
    protected $model = Company::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->company(),
        ];
    }

    /**
     * Şirkete verilen rolle bir üye ekler.
     *
     * Gerçek belongsToMany ilişkisi üzerinden çalışır; pivot tablosuna
     * elle INSERT atmaz. syncWithoutDetaching kullanıldığı için tekrar
     * çağrılması mevcut üyeleri düşürmez.
     */
    public function withMember(User $user, string $role = 'member'): static
    {
        return $this->afterCreating(function (Company $company) use ($user, $role): void {
            $company->users()->syncWithoutDetaching([
                $user->getKey() => ['role' => $role],
            ]);
        });
    }

    /**
     * Şirkete owner rolüyle bir üye ekler.
     */
    public function withOwner(User $user): static
    {
        return $this->withMember($user, 'owner');
    }
}
