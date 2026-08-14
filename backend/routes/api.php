<?php

use App\Http\Controllers\Api\V1\AuditLogController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CompanyController;
use App\Http\Controllers\Api\V1\CustomerController;
use App\Http\Controllers\Api\V1\EmailVerificationController;
use App\Http\Controllers\Api\V1\InvitationController;
use App\Http\Controllers\Api\V1\MemberController;
use App\Http\Controllers\Api\V1\PasswordResetController;
use App\Http\Controllers\Api\V1\ProfileController;
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

    /*
    | PAROLA SIFIRLAMA — ikisi de HERKESE AÇIK.
    |
    | Parolasını unutmuş kullanıcı tanım gereği giriş yapamaz;
    | auth:sanctum eklemek akışı imkânsız kılardı. Kimlik, sıfırlama
    | token'ıyla kanıtlanır ve token GÖVDEDE taşınır (URL'ler loglara,
    | proxy'lere ve tarayıcı geçmişine düşer).
    |
    | Her ikisi de rate limit'lidir: forgot bir mail gönderim yüzeyi,
    | reset ise token tahmin etme yüzeyidir.
    */
    Route::post('password/forgot', [PasswordResetController::class, 'sendResetLink'])
        ->middleware('throttle:password-forgot')
        ->name('password.forgot');

    Route::post('password/reset', [PasswordResetController::class, 'reset'])
        ->middleware('throttle:password-reset')
        ->name('password.reset');
});

/*
| E-POSTA DOĞRULAMA BAĞLANTISI — kimlik doğrulaması YOK, imza VAR.
|
| Bağlantı mail istemcisinden tıklanır; orada Bearer token yoktur.
| auth:sanctum eklenirse akış mail'den hiç çalışmaz. Kanıt imzadan gelir:
| Laravel'in temporarySignedRoute'u (süreli) + sha1(email) eşleşmesi.
|
| Route adı 'verification.verify' OLMAK ZORUNDA: Laravel'in yerleşik
| VerifyEmail bildirimi bağlantıyı tam olarak bu isimden üretir. Ad
| değişirse doğrulama mailleri sessizce kırılır — bu yüzden route
| bilinçli olarak api.v1.* ad ön ekli grubun DIŞINDADIR.
*/
Route::get('auth/email/verify/{id}/{hash}', [EmailVerificationController::class, 'verify'])
    ->middleware(['signed', 'throttle:email-verification'])
    ->name('verification.verify');

Route::middleware('auth:sanctum')->name('api.v1.')->group(function (): void {
    Route::get('me', [AuthController::class, 'me'])
        ->name('me');

    /*
    | KENDİ HESABI — tenant DIŞI.
    |
    | company.context YOK ve olmamalı: kullanıcının kendi profilini ve
    | parolasını yönetmesi hiçbir şirkete üye olmasını gerektirmez.
    | Davetle gelmiş, henüz hiçbir şirket seçmemiş bir kullanıcı da
    | hesabını yönetebilmeli.
    |
    | Hiçbir uçta {user} parametresi YOKTUR — kimlik daima oturumdan.
    */
    Route::post('auth/email/verification-notification', [EmailVerificationController::class, 'send'])
        ->middleware('throttle:verification-notification')
        ->name('auth.email.verification-notification');

    Route::get('profile', [ProfileController::class, 'show'])
        ->name('profile.show');

    Route::put('profile', [ProfileController::class, 'update'])
        ->name('profile.update');

    // PUT: parola tamamen değiştirilir, kısmen güncellenmez.
    Route::put('profile/password', [ProfileController::class, 'updatePassword'])
        ->middleware('throttle:password-change')
        ->name('profile.password.update');

    // company.context YOK: kullanıcı şirket seçmeden önce de listeyi
    // görebilmeli ve seçim yapabilmelidir.
    Route::get('companies', [CompanyController::class, 'index'])
        ->name('companies.index');

    Route::post('companies/{company}/select', [CompanyController::class, 'select'])
        ->name('companies.select');
});

/*
| DAVET KABULÜ — tenant DIŞI ve kimlik doğrulaması ZORUNLU DEĞİL.
|
| Daveti kabul eden kişi çoğu zaman hiçbir şirketin üyesi değildir;
| sıklıkla hiç hesabı da yoktur. auth:sanctum ya da company.context
| eklenirse davet sistemi hiç çalışmaz. Bu ucun anahtarı token'dır ve
| doğrulaması InvitationService'te yapılır.
|
| Token GÖVDEDE taşınır, URL'de değil: URL'ler erişim loglarına,
| proxy'lere, Referer başlığına ve tarayıcı geçmişine düşer.
|
| throttle: bu uç kimlik doğrulaması olmadan çalıştığı için token deneme
| saldırılarına açık tek yüzeydir. Token 256 bit olduğundan kaba kuvvet
| pratikte imkânsız; sınır yine de ucuz bir sigorta.
*/
Route::post('invitations/accept', [InvitationController::class, 'accept'])
    ->middleware('throttle:invitation-accept')
    ->name('api.v1.invitations.accept');

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

    /*
    | ÜYELİK YÖNETİMİ
    |
    | {user} binding'i BİLİNÇLİ olarak tenant'tan bağımsızdır: User modeli
    | global tenant scope'a sokulmaz, çünkü kullanıcı birden fazla şirketin
    | üyesi olabilir ve login/me gibi uçlar şirketsiz de çalışmalıdır.
    | Tenant sınırı MembershipService::findMemberOrFail'de çizilir → 404.
    |
    | Rol değişimi ayrı uçtur: PATCH, çünkü kaydın tamamı değil tek bir
    | özniteliği değişir — ve çünkü en tehlikeli işlem kazara başka bir
    | güncellemenin içine karışmamalıdır.
    */
    Route::get('members', [MemberController::class, 'index'])
        ->name('members.index');

    Route::post('members', [MemberController::class, 'store'])
        ->name('members.store');

    Route::get('members/{user}', [MemberController::class, 'show'])
        ->name('members.show');

    Route::put('members/{user}', [MemberController::class, 'update'])
        ->name('members.update');

    Route::patch('members/{user}/role', [MemberController::class, 'updateRole'])
        ->name('members.role.update');

    Route::delete('members/{user}', [MemberController::class, 'destroy'])
        ->name('members.destroy');

    /*
    | AUDIT GEÇMİŞİ — salt okunur.
    |
    | Yalnızca listeleme var: audit kaydı API'den yazılamaz, güncellenemez,
    | silinemez. Yazılabilseydi iz uydurmak mümkün olurdu.
    |
    | company.context ZORUNLU: AuditLog'un global scope'u aktif şirkete
    | filtreler ve context yoksa fail-closed patlar. Bu uç asla o
    | zincirin dışına çıkarılmamalı (§25).
    */
    Route::get('audit-logs', [AuditLogController::class, 'index'])
        ->name('audit-logs.index');

    /*
    | DAVETLER — owner yönetimi.
    |
    | Kabul ucu bilinçli olarak bu grubun DIŞINDADIR (yukarıya bakınız).
    |
    | {invitation} binding'i daveti tenant'tan bağımsız çözer; Invitation
    | global scope taşımaz çünkü kabul akışı company context olmadan
    | çalışmak zorundadır. Tenant sınırı InvitationService'te çizilir
    | ve başka şirketin daveti 404 döner.
    */
    Route::get('invitations', [InvitationController::class, 'index'])
        ->name('invitations.index');

    Route::post('invitations', [InvitationController::class, 'store'])
        ->name('invitations.store');

    Route::delete('invitations/{invitation}', [InvitationController::class, 'destroy'])
        ->name('invitations.destroy');
});
