<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Database\Factories\CustomerFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Customer extends Model
{
    /** @use HasFactory<CustomerFactory> */
    use BelongsToCompany, HasFactory;

    /**
     * company_id ve customer_no bilinçli olarak DIŞARIDA bırakıldı.
     *
     * company_id: tenant sahipliğidir; request gövdesinden değil, aktif
     *             company context'ten belirlenir (Anayasa §9).
     * customer_no: sistem tarafından üretilir (CustomerService, §7).
     *
     * FATURA KİMLİĞİ ALANLARI DA DIŞARIDA (Faz 7 / Adım 2):
     * billing_email, tax_number, tax_office, billing_address, country.
     * Bunlar kendi ucundan (PATCH /customers/{customer}/billing) yazılır.
     * Buraya eklenirlerse PUT /customers/{customer} — ki bilinçli olarak
     * TAM DEĞİŞTİRME semantiğindedir — onları her güncellemede silerdi;
     * mevcut web ve Flutter istemcileri o uca yalnızca {name, phone}
     * gönderiyor.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'phone',
    ];

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
