<?php

/*
|--------------------------------------------------------------------------
| FlowTiger — uygulamaya özgü ayarlar
|--------------------------------------------------------------------------
|
| Laravel'in kendi config dosyalarına dokunmamak için açılan tek dosya.
| Buraya yalnızca FlowTiger'ın iş kurallarına ait, ortama göre değişebilen
| değerler girer. Kod içine dağılmış sihirli sayılar burada toplanır.
|
*/

return [

    'invitations' => [

        /*
         * Bir davetin geçerlilik süresi (gün).
         *
         * Süre sınırı güvenlik gereğidir: e-posta kutuları arşivlenir,
         * cihazlar el değiştirir, çalışanlar işten ayrılır. Süresiz bir
         * davet linki, bir gün yanlış ellerde şirkete açılan kalıcı bir
         * kapıya dönüşür.
         *
         * 7 gün: kullanıcının daveti fark edip yanıtlaması için fazlasıyla
         * yeterli, unutulmuş bir linkin aylarca yaşaması için fazlasıyla
         * kısa.
         */
        'expires_after_days' => (int) env('FLOWTIGER_INVITATION_EXPIRY_DAYS', 7),

    ],

    'password_reset' => [

        /*
         * Parola sıfırlama bağlantısının şablonu.
         *
         * {token} ve {email} yer tutucuları gönderim anında doldurulur
         * (bkz. AppServiceProvider::configurePasswordResetLink).
         *
         * Bağlantı FRONTEND'e işaret eder, API'ye değil: kullanıcı bir
         * form doldurup yeni parolasını girer, frontend de token'ı
         * POST /api/v1/auth/password/reset'e taşır. Bu fazda henüz
         * frontend yok (§25), bu yüzden varsayılan APP_URL tabanlı bir
         * yer tutucudur — frontend geldiğinde değişecek tek şey bu
         * satırdır, kodun hiçbir yeri değil.
         *
         * Sıfırlama süresi burada DEĞİL config/auth.php'de yaşar
         * (passwords.users.expire); Laravel'in broker'ı onu okur ve
         * ikinci bir yerde tanımlamak iki gerçek kaynağı yaratırdı.
         */
        'url' => env(
            'FLOWTIGER_PASSWORD_RESET_URL',
            env('APP_URL', 'http://localhost').'/password/reset/{token}?email={email}',
        ),

    ],

];
