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
