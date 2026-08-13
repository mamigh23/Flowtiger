<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CompanyController;
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
| company.context BİLİNÇLİ olarak GLOBAL DEĞİLDİR. Aşağıdaki uçların
| hiçbiri tenant verisi döndürmez, bu yüzden hiçbiri aktif şirket
| gerektirmez. Tenant uçları (Customer CRUD, Faz 2.4+) şu zincirin
| arkasına alınacaktır:
|
|   Route::middleware(['auth:sanctum', 'company.context'])->group(...)
|
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
