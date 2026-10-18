# FlowTiger — Web

React 18 + TypeScript + Vite. Backend: `../backend` (Laravel + Sanctum).

Güncel aşama **Aşama 9 — Web Release Stabilization**. Günlük rehber,
müşteri/görev, finans/ödeme, ekip/davet, denetim ve profil akışları vardır;
canlı yayın kabulü bekliyor. Durum ve test kanıtları
[playbook checkpoint'inde](../FLOWTIGER_PROJECT_PLAYBOOK.md#11-güncel-checkpoint),
kalan işler [yol haritasında](../docs/ROADMAP.md) izlenir. Mobil, AI ve
abonelik geliştirmeleri mevcut web yayınının kapsamına girmez.

## Kurulum

```bash
cd web
cp .env.example .env.local
npm ci
npm run dev
```

`.env.local` içindeki `VITE_API_BASE_URL` backend adresinizi göstermeli
(varsayılan `http://localhost:8000/api/v1`).

Backend `CORS_ALLOWED_ORIGINS` listesinde tarayıcıdaki adres tam olarak
bulunmalı. Yerel geliştirmede kullanılan adrese göre
`http://localhost:5173` ve/veya `http://127.0.0.1:5173` yazılır; ikisi
farklı origin'dir. Bu listeye wildcard eklenmez.

> `VITE_` önekli her değişken tarayıcı paketine **gömülür**. Buraya sır
> yazılmaz. API adresi sır değildir.

## Doğrulama

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run build       # tsc -b && vite build
```

## Mevcut web sürümünün yayını

Canlı API kökü (`VITE_API_BASE_URL`, HTTPS ve `/api/v1` dahil) production
ortamında doğrulandıktan sonra `npm run build:release` kullanılır.
Eksik/yerel API adresiyle yayın derlemesi durur. Kontrol testleri:
`npm run test:release`. Normal `npm run build` tek başına yayın onayı değildir.
Sunucu envanteri, kabul turu ve geri dönüş için
[web yayın adımları](../docs/WEB_RELEASE.md) izlenir.

## Yapı

```
src/
├── app/            # App + rota haritası
├── components/ui/  # Button, Input, Card, Spinner, ErrorState
├── features/
│   ├── auth/       # Kayıt/giriş, parola kurtarma
│   ├── dashboard/  # Günlük rehber, şirket planı
│   ├── customers/ # Müşteri akışları
│   ├── tasks/      # Günlük plan, görev ve atama
│   ├── finance/    # Gelir/gider kayıtları
│   ├── payments/   # Ödeme ve dağıtım
│   ├── team/       # Üyelik ve roller
│   ├── invitations/ # Davet gönderme/kabul
│   ├── audit/      # Salt okunur işlem geçmişi
│   ├── profile/    # Hesap ve güvenlik
│   └── shell/      # Kimlik doğrulanmış kabuk
├── lib/
│   ├── api/        # ApiClient, hatalar, endpoint sözleşmesi
│   ├── auth/       # AuthContext + TokenStorage
│   └── company/    # CompanyContext
├── routes/         # ProtectedRoute / PublicOnlyRoute
├── styles/         # Ortak stiller ve workspace.css
└── types/          # Backend sözleşmesinin TS karşılığı
```

## Kararlar

**Sıfır UI bağımlılığı** — tasarım token'ları CSS custom property olarak,
bileşenler küçük React fonksiyonları. Ortak kabuk, listeler ve formlar
mevcut bileşenler ve `workspace.css` üzerinden düzenlenir.

**Context, ağır state kütüphanesi değil** — foundation'ın ihtiyacı iki
durum (oturum, aktif şirket). Redux/Zustand/React Query şu an çözdüğünden
fazla karmaşıklık getirirdi; veri katmanı büyüdüğünde yeniden
değerlendirilmeli.

**Token yalnızca bellekte** — bkz. `src/lib/auth/tokenStorage.ts`.

## Token saklama — bilinçli tercih

Token hiçbir tarayıcı deposuna yazılmaz; bir JavaScript değişkeninde
yaşar.

Gerekçe: backend Sanctum **Bearer token** kullanıyor, SPA çerez kimlik
doğrulaması açık değil. `localStorage`/`sessionStorage`'daki her değer
XSS ile okunabilir ve `localStorage` bunu **kalıcı** hâle getirir —
kullanıcı tarayıcıyı kapatsa bile saldırgan token'a sahip olur.

**Bedeli:** sayfa yenilendiğinde oturum kaybolur, kullanıcı tekrar giriş
yapar. Kullanışlılık için güvenlik gevşetilmedi.

**Değiştirmek gerekirse:** `tokenStorage.ts` tek dokunma noktasıdır;
uygulama kodu hiçbir yerde storage API'sini doğrudan çağırmaz. Doğru
kalıcı çözüm backend'in httpOnly cookie desteği eklemesidir — o zaman bu
dosya boş bir adaptöre dönüşür.

## Güvenlik kuralları

- `ProtectedRoute` bir güvenlik sınırı **değildir**; yetki kararı her
  istekte backend'de verilir. Atlanırsa saldırgan hiçbir şey kazanmaz.
- Aktif şirket istemcide seçilmez: yalnızca
  `POST /companies/{id}/select` çağrılır, hiçbir istekte
  `active_company_id` gönderilmez.
- 401 tek noktadan işlenir: `ApiClient` token'ı düşürür, `AuthContext`
  bunu görüp oturumu kapatır.
- Token, parola ve `Authorization` başlığı hiçbir yerde loglanmaz.
