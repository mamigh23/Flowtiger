<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CompanyController;
use App\Http\Controllers\Api\V1\CustomerController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes — v1
|--------------------------------------------------------------------------
|
| Prefix (api/v1) bootstrap/app.php içindeki withRouting(apiPrefix:) ile
| verilir; burada tekrar yazılmaz.
|
| ÜÇ AYRI KATMAN, ÜÇ AYRI SORU (Anayasa'nın ana güvenlik kuralı):
|
|   1. Kimsin?            → auth:sanctum
|   2. Hangi şirkettesin? → company.context
|   3. Ne yapabilirsin?   → Policy (Customer uçları açıldığında)
|
| company.context BİLİNÇLİ olarak GLOBAL DEĞİLDİR. Dosya iki bölüme
| ayrılır:
|
|   A) TENANT DIŞI uçlar  → yalnızca auth:sanctum
|      (kullanıcı henüz şirket seçmemiş olabilir)
|
|   B) TENANT uçları      → auth:sanctum + company.context
|      (aktif şirket ve üyelik doğrulanmadan geçilmez)
|
*/

/*
|--------------------------------------------------------------------------
| A) TENANT DIŞI
|--------------------------------------------------------------------------
*/

Route::prefix('auth')->name('api.v1.auth.')->group(function (): void {
    // Kimlik doğrulamadan ÖNCEKİ tek uç. throttle, brute-force denemelerini
    // e-posta + IP bazında sınırlar (Laravel yerleşik; yeni bağımlılık yok).
    Route::post('login', [AuthController::class, 'login'])
        ->middleware('throttle:login')
        ->name('login');

    Route::post('logout', [AuthController::class, 'logout'])
        ->middleware('auth:sanctum')
        ->name('logout');
});

Route::middleware('auth:sanctum')->name('api.v1.')->group(function (): void {
    Route::get('me', [AuthController::class, 'me'])
        ->name('me');

    // company.context YOK: kullanıcı şirket seçmeden önce de listeyi
    // görebilmeli ve seçim yapabilmelidir.
    Route::get('companies', [CompanyController::class, 'index'])
        ->name('companies.index');

    Route::post('companies/{company}/select', [CompanyController::class, 'select'])
        ->name('companies.select');
});

/*
|--------------------------------------------------------------------------
| B) TENANT UÇLARI
|--------------------------------------------------------------------------
|
| Zincir: auth:sanctum → company.context → SubstituteBindings → controller
|
| Sıralama tesadüf değildir. {customer} binding sorgusu CompanyScope'un
| altından geçer; scope ise aktif company context'e ihtiyaç duyar. Bu
| yüzden company.context, SubstituteBindings'ten ÖNCE koşmak ZORUNDADIR
| ve bu bootstrap/app.php'deki middleware priority kaydıyla garanti
| edilmiştir. Sıra bozulursa her {customer} isteği 403 döner.
|
*/
Route::middleware(['auth:sanctum', 'company.context'])->name('api.v1.')->group(function (): void {
    Route::get('customers', [CustomerController::class, 'index'])
        ->name('customers.index');

    Route::post('customers', [CustomerController::class, 'store'])
        ->name('customers.store');

    Route::get('customers/{customer}', [CustomerController::class, 'show'])
        ->name('customers.show');

    Route::put('customers/{customer}', [CustomerController::class, 'update'])
        ->name('customers.update');

    Route::delete('customers/{customer}', [CustomerController::class, 'destroy'])
        ->name('customers.destroy');
});
