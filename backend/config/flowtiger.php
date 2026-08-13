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

];
