<?php

namespace App\Models;

use Database\Factories\CompanyFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Company extends Model
{
    /** @use HasFactory<CompanyFactory> */
    use HasFactory;

    /**
     * MALİ KİMLİK ALANLARI BİLİNÇLİ OLARAK DIŞARIDA (Faz 7 / Adım 2).
     *
     * legal_name, tax_number, tax_office, billing_address, country,
     * timezone ve default_currency buraya EKLENMEMELİDİR. Bunlar kendi
     * ucundan (PATCH /companies/{company}/billing) ve kendi
     * doğrulamasından geçerek yazılır. Fillable olsalardı, gövdesine
     * fazladan alan koyan herhangi bir istek şirketin vergi numarasını
     * sessizce değiştirebilirdi — company_id ve customer_no için verilen
     * kararla aynı gerekçe (Anayasa §9).
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
    ];

    public function customers(): HasMany
    {
        return $this->hasMany(Customer::class);
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'company_users')
            ->withPivot('role')
            ->withTimestamps();
    }
}