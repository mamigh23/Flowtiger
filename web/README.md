# FlowTiger — Web

React 18 + TypeScript + Vite. Backend: `../backend` (Laravel + Sanctum).

## Kurulum

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

`.env.local` içindeki `VITE_API_BASE_URL` backend adresinizi göstermeli
(varsayılan `http://localhost:8000/api/v1`).

> `VITE_` önekli her değişken tarayıcı paketine **gömülür**. Buraya sır
> yazılmaz. API adresi sır değildir.

## Doğrulama

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run build       # tsc -b && vite build
```

## Yapı

```
src/
├── app/            # App + rota haritası
├── components/ui/  # Button, Input, Card, Spinner, ErrorState
├── features/
│   ├── auth/       # Giriş ekranı
│   └── shell/      # Kimlik doğrulanmış kabuk
├── lib/
│   ├── api/        # ApiClient, hatalar, endpoint sözleşmesi
│   ├── auth/       # AuthContext + TokenStorage
│   └── company/    # CompanyContext
├── routes/         # ProtectedRoute / PublicOnlyRoute
├── styles/         # Tasarım token'ları (CSS değişkenleri)
└── types/          # Backend sözleşmesinin TS karşılığı
```

## Kararlar

**Sıfır UI bağımlılığı** — tasarım token'ları CSS custom property olarak,
bileşenler küçük React fonksiyonları. Tailwind/MUI eklemek kolay,
çıkarmak zordur; foundation aşamasında henüz ekran yokken kazanımı
sınırlıydı.

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
