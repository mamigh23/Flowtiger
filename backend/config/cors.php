<?php

/*
|--------------------------------------------------------------------------
| CORS — Cross-Origin Resource Sharing
|--------------------------------------------------------------------------
|
| NEDEN BU DOSYA VAR (Faz 10 denetim bulgusu):
|
| Bu dosya yayınlanmadığında Laravel kendi varsayılanını kullanır ve o
| varsayılan şudur:
|
|     'paths'           => ['api/*', 'sanctum/csrf-cookie'],
|     'allowed_origins' => ['*'],
|
| Yani İNTERNETTEKİ HERHANGİ BİR SİTE, tarayıcıdaki JavaScript ile
| FlowTiger API'sine istek atabilir. Token tabanlı bir API'de bu tek
| başına hesap ele geçirme demek değildir (tarayıcı Bearer başlığını
| kendiliğinden eklemez), ama saldırgan bir sitede çalışan koda —
| örneğin XSS ile çalınmış bir token'la — serbest bir kanal açar.
| Faz 10 §22 bunu açıkça yasaklıyor.
|
| VARSAYILAN: HİÇBİR ORIGIN.
| Liste boş bırakıldığında tarayıcı hiçbir cross-origin isteğe izin
| vermez. Bu, henüz frontend'i olmayan bir API için doğru varsayılandır.
|
| ÖNEMLİ: CORS yalnızca TARAYICI mekanizmasıdır. Boş liste; mobil
| uygulamaları, sunucudan sunucuya çağrıları, curl'ü ya da Postman'i
| ETKİLEMEZ. Flutter istemcisi bu ayardan bağımsız çalışır.
|
| Frontend geldiğinde CORS_ALLOWED_ORIGINS ortam değişkenine virgülle
| ayrılmış tam origin'ler yazılır:
|
|     CORS_ALLOWED_ORIGINS=https://app.flowtiger.com,https://admin.flowtiger.com
|
| Wildcard ('*') buraya PRODUCTION'DA ASLA yazılmamalıdır.
|
*/

return [

    /*
     * Yalnızca API yolları.
     *
     * 'sanctum/csrf-cookie' bilinçli olarak ÇIKARILDI: FlowTiger,
     * Sanctum'u SPA cookie kimlik doğrulamasıyla değil, personal access
     * token'larla kullanıyor (Faz 2.1). O uç hiç çağrılmıyor; CORS
     * yüzeyinde tutmanın bir gerekçesi yok.
     */
    'paths' => ['api/*'],

    'allowed_methods' => ['*'],

    /*
     * Boş dizi = hiçbir cross-origin tarayıcı isteğine izin verilmez.
     */
    'allowed_origins' => array_values(array_filter(
        array_map('trim', explode(',', (string) env('CORS_ALLOWED_ORIGINS', ''))),
    )),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    /*
     * false — ve öyle kalmalı.
     *
     * FlowTiger kimliği Authorization başlığındaki Bearer token ile
     * taşır, çerezle değil. true yapmak, çerez tabanlı kimlik doğrulama
     * kurulduğu anlamına gelir ve CSRF yüzeyi açar. Sanctum'un token
     * yolu ile SPA çerez yolu arasındaki ayrım bilinçlidir (§21).
     */
    'supports_credentials' => false,

];
