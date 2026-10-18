# FlowTiger — Mobil (Flutter)

Android + iOS, tek Dart kod tabanı. Backend: `../backend` (Laravel + Sanctum).

## Güncel durum ve yol haritası

18.10.2026: kullanıcı Android ve iOS çalışmasını önce planla başlatmayı
istedi. [Mobil yol haritası](../docs/MOBILE_ROADMAP.md) mevcut envanteri,
M0–M7 sırasını ve iki platformun kabul kapılarını içerir. Web'in canlı
yayın kabulü ayrı ve açıktır; mobil temel mağazaya hazır kabul edilmez.

Depoda `android/` ve `ios/` klasörleri **mevcuttur**. Yeniden platform
üretmek yerine mevcut projeler korunur. İlk adım SDK/cihaz envanteri ve
mevcut testlerin başlangıç sonucudur:

```bash
cd mobil
flutter pub get
flutter analyze
flutter test
```

Android release şu anda debug imzasını kullanır; üretime hazır değildir.
iOS için macOS/Xcode ve signing doğrulaması gerekir. Aşağıdaki production
API adresi yalnızca örnektir; gerçek sunucu adresi doğrulanmalıdır.

## Çalıştırma

API adresi derleme zamanında verilir; kaynak kodda sabit adres yoktur.

```bash
# Android emülatör (10.0.2.2 = host makinenin localhost'u)
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8000/api/v1

# iOS simülatör
flutter run --dart-define=API_BASE_URL=http://localhost:8000/api/v1

# Production derlemesi
flutter build apk \
  --dart-define=API_BASE_URL=https://api.flowtiger.com/api/v1 \
  --dart-define=APP_ENV=production
```

> `--dart-define` ile verilen değerler derlenmiş pakete **gömülür** ve
> APK/IPA açılarak okunabilir. Buraya yalnızca sır olmayan değerler
> girer. API adresi sır değildir; API anahtarı, parola, token asla.

## Doğrulama

```bash
flutter pub get
flutter analyze
flutter test
```

## Yapı

```
lib/
├── core/
│   ├── config/      # AppConfig — ortam değişkenleri
│   ├── network/     # ApiClient + ApiException
│   ├── storage/     # TokenStorage (Keystore / Keychain)
│   ├── theme/       # Tasarım token'ları
│   └── providers.dart   # Bağımlılık kökü (Riverpod)
├── features/
│   ├── auth/        # AuthController + giriş ekranı
│   ├── companies/   # CompanyController
│   └── shell/       # Kimlik doğrulanmış kabuk
├── models/          # Backend sözleşmesinin Dart karşılığı
├── widgets/         # Ortak bileşenler
└── main.dart        # AuthGate: duruma göre navigasyon
```

## Kararlar

**Riverpod** — Bloc'un event/state boilerplate'i foundation için ağır,
Provider'ın test edilebilirliği zayıf kalıyordu. `ProviderContainer` ile
widget ağacı kurmadan controller testi yazılabiliyor.

**http (dio değil)** — ihtiyacımız olan tek interceptor davranışı (token
ekleme, 401 yakalama) `ApiClient` içinde zaten var; dio'nun ek yüzeyi bu
aşamada gereksiz.

**flutter_secure_storage** — token Android Keystore / iOS Keychain'de
tutulur. SharedPreferences düz metin saklar ve root'lu cihazda okunabilir.

## Güvenlik kuralları

- Token yalnızca `TokenStorage` üzerinden okunur/yazılır; ekranlar
  depolamaya doğrudan dokunmaz.
- `print()` analiz kurallarında **hata** — loglara sır sızmasının en
  yaygın yolu budur.
- Navigasyon bir güvenlik sınırı **değildir**; yetki kararı her istekte
  backend'de verilir.
- Aktif şirket istemcide seçilmez: yalnızca `POST /companies/{id}/select`
  çağrılır, hiçbir istekte `active_company_id` gönderilmez.
