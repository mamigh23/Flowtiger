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

        /*
         * Davet kabul bağlantısının şablonu (P1-05).
         *
         * {token} yer tutucusu gönderim anında InvitationMail tarafından
         * doldurulur (bkz. InvitationMail::acceptUrl()) — password_reset.url
         * ile AYNI desen: yer tutucu + str_replace, ayrı bir config sistemi
         * DEĞİL.
         *
         * Bağlantı FRONTEND'e işaret eder, API'ye değil: kullanıcı linke
         * tıklar, frontend (web/src/features/invitations/AcceptInvitationPage.tsx)
         * token'ı POST /api/v1/invitations/accept'e taşır.
         *
         * FRONTEND_URL öncelikli kaynaktır (frontend backend'den FARKLI bir
         * origin'de yaşayabilir); tanımlı değilse APP_URL'e, o da yoksa
         * localhost'a düşer — password_reset.url'ün kullandığı AYNI kademeli
         * varsayılan zinciri. Hiçbir yerde sabit bir localhost/production
         * adresi YAZILMAZ; hepsi env()'den gelir.
         */
        'accept_url' => env(
            'FLOWTIGER_INVITATION_ACCEPT_URL',
            rtrim((string) env('FRONTEND_URL', env('APP_URL', 'http://localhost')), '/')
                .'/invitations/accept?token={token}',
        ),

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
