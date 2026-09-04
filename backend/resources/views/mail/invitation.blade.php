{{--
    Davet e-postası.

    Kabul bağlantısı (ve içindeki token) yalnızca burada, gönderilen mail
    gövdesinde görünür. Şablona parola, oturum bilgisi ya da başka bir sır
    konmamalıdır.

    P1-05: token artık ayrı, kopyala-yapıştırılan bir KOD olarak
    GÖSTERİLMEZ — kullanıcı yalnızca aşağıdaki bağlantıya tıklar, token
    URL'in İÇİNDE frontend'e taşınır (frontend zaten ?token=... okuyor).
--}}
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="utf-8">
    <title>FlowTiger daveti</title>
</head>
<body>
    <p>Merhaba,</p>

    <p>
        <strong>{{ $companyName }}</strong> sizi FlowTiger'da
        <strong>{{ $role }}</strong> olarak çalışmaya davet etti.
    </p>

    <p>Daveti kabul etmek için aşağıdaki bağlantıya tıklayın:</p>

    <p><a href="{{ $acceptUrl }}">Daveti kabul et</a></p>

    <p>
        Bu davet
        <strong>{{ $expiresAt?->toDayDateTimeString() }}</strong>
        tarihine kadar geçerlidir. Süre dolduktan sonra bağlantı çalışmaz;
        yeni bir davet istemeniz gerekir.
    </p>

    <p>
        Bu daveti beklemiyorduysanız bu e-postayı yok sayabilirsiniz.
        Bağlantı kullanılmadığı sürece hiçbir işlem yapılmaz.
    </p>
</body>
</html>
