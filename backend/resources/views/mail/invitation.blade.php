{{--
    Davet e-postası.

    Token yalnızca burada, gönderilen mail gövdesinde görünür. Şablona
    parola, oturum bilgisi ya da başka bir sır konmamalıdır.

    Bu faz bir frontend içermediği için token tam bir bağlantı yerine
    ham hâliyle veriliyor; frontend geldiğinde burası davet URL'ine
    dönüşecek.
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

    <p>Daveti kabul etmek için aşağıdaki davet kodunu kullanın:</p>

    <p><code>{{ $token }}</code></p>

    <p>
        Bu davet
        <strong>{{ $expiresAt?->toDayDateTimeString() }}</strong>
        tarihine kadar geçerlidir. Süre dolduktan sonra kod çalışmaz;
        yeni bir davet istemeniz gerekir.
    </p>

    <p>
        Bu daveti beklemiyorduysanız bu e-postayı yok sayabilirsiniz.
        Kod kullanılmadığı sürece hiçbir işlem yapılmaz.
    </p>
</body>
</html>
