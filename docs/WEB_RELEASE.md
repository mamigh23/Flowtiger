# Mevcut web sürümü — yayın ve kabul

Hedef: `https://flowt.gemnative.com`. Aşama 9 açık kalır; mobil, Finance V2,
AI ve abonelikler bu yayının kapsamına girmez.

## 1. Sunucu açıldığında salt okunur envanter

Sunucuda mevcut proje klasöründen çalıştırın:

```sh
pwd
git status -sb
git branch --show-current
git log -1 --oneline
git remote -v
```

Proje yolu bilinmiyorsa paneldeki site/document root bilgisini bulun.
Güncellemeden önce web document root, API origin, PHP sürümü, web sunucusu,
web/API'nin kullandığı commit ve mevcut yayın yöntemi kaydedilmelidir.
`.env`, parolalar, anahtarlar veya tüm sunucu yapılandırması paylaşılmaz.
Yerel sunucu değişiklikleri varsa çekme/dal değiştirme işlemini durdurun;
`reset --hard`, `clean`, zorla checkout veya force push kullanmayın.

İlk aday `6b6283d`; sonraki düzeltmelerin doğrulanmış commit'i ayrıca seçilir.
`master` ile stabilizasyon dalı aynı kabul edilmez. Sunucuda yeni commit
varsa eski adaya düşürülmez; önce farklar incelenir.

## 2. Test ve derleme kapısı

Backend testi yalnızca ayrı PostgreSQL `flowtiger_test` veritabanında
çalıştırılır. Aynı test veritabanında iki PHPUnit süreci eşzamanlı çalıştırılmaz.
Canlı sunucunun production ortamında test/migrate:fresh çalıştırılmaz.

```sh
# Ayrı geliştirme/test ortamında backend/ içinde
php vendor/bin/phpunit

# web/ içinde
npm ci
npm test
npm run test:release
npm run typecheck

# Depo kökünde
git diff --check
```

Sunucunun gerçek API kökü belirlenmeden yayın paketi oluşturulmaz. `web/`
içinde ortamın `VITE_API_BASE_URL` değeri gerçek HTTPS API adresine
(`/api/v1` dahil) ayarlandıktan sonra:

```sh
npm run build:release
```

Bu komut Vite'ın production env dosyalarını ve süreç ortamını kullanır.
Eksik, HTTP, loopback/test adresi, kimlik bilgisi, sorgu/fragment veya yanlış
API kökünü reddeder. Adres tarayıcı paketine gömülür; değişince yeniden
derleme gerekir. Normal `npm run build` geliştirme doğrulamasıdır, yayın
kapısının yerine geçmez. Yapılandırma kontrolü DNS, TLS veya API sağlığı
kontrolü değildir. CI bilinen bir production API olmadığı için geliştirme
derlemesini ve yayın kontrolünün testlerini çalıştırır.

## 3. Gerçek API ve tarayıcı turu

İzole test ortamında iki şirket ve owner/member hesaplarıyla kontrol edin.
Canlı ortamda gerçek müşteri verisiyle test yapılmaz; test şirketi ve
izinli test e-posta alıcıları ayrıca belirlenir.

- Kayıt/giriş, şirket seçimi ve değiştirme; gecikmiş eski istekler.
- Müşteri oluşturma/düzenleme, görev atama/tamamlama/yeniden açma.
- Gelir/gider tutarı ve KDV; ödeme dağıtımları ve sınırların reddedilmesi.
- İptal sonrası düzenlemenin ve ikinci iptalin reddedilmesi; ilk audit'in korunması.
- Owner/member yetkileri ve diğer şirket kayıtlarına 404/403 davranışı.
- Davet gönderme/kabul/iptal, gerçek e-postada HTTPS frontend bağlantısı.
- Parola kurtarma/doğrulama, gerçek alıcıya teslim ve doğru frontend adresi.
- Audit/profil; 401, 403, 422, 429 ve sunucu hataları.
- 375px ekran, klavye/focus/Escape, doğrudan URL açma, yenileme ve geri tuşu.

Backend CORS origin'i frontend ile eşleşmeli; `APP_DEBUG=false`, gerçek
mail sağlayıcısı, `FRONTEND_URL`, davet ve parola sıfırlama URL şablonları
kontrol edilmelidir. Sırların çıktısı alınmaz. Canlı TLS kontrolünde
sertifika adı ve zinciri doğrulanmalı; `curl -k`/sertifika atlama kullanılmaz.

## 4. Yayın ve geri dönüş

Sunucunun mevcut yöntemi doğrulanmadan varsayımsal dizine kopyalama yapılmaz.
Canlı veri yedeği, önceki çalışan commit ve önceki web paketi korunur.
Doğrulanmış aday commit alınır; gerçek API ile derlenen `web/dist` mevcut
yayın yöntemine göre devreye alınır. Bu düzeltmeler migration gerektirmez.

Ardından HTTPS, API `/up`, giriş, şirket seçimi, müşteri/görev/finans okuma,
izinli test şirketinde temel yazma ve e-posta bağlantıları kontrol edilir.
Kontroller başarısızsa önceki uygulama paketine dönülür; migration rollback
ve APP_KEY yeniden üretimi yapılmaz.

Checkpoint: aday/yayımlanan commit, test sonuçları, API origin, yayın yöntemi,
TLS ve kullanıcı turu sonucu, yedek/geri dönüş referansı kaydedilir; sır yazılmaz.
Sunucuda kabul doğrulanmadan release veya Aşama 9 tamamlandı denmez.
