<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\AuditAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\LoginRequest;
use App\Http\Requests\Api\V1\RegisterRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\AuditLogService;
use App\Services\RegistrationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Faz 2.3 — kimlik doğrulamanın HTTP yüzü.
 *
 * Bu controller AUTHENTICATION yapar; AUTHORIZATION ya da TENANT CONTEXT
 * ile ilgilenmez (Anayasa'nın ana güvenlik kuralı: bu üçü ayrı şeylerdir).
 * Giriş yapmış olmak hiçbir şirketin verisine erişim vermez; aktif şirket
 * ayrı bir adımdır (bkz. CompanyController).
 *
 * Custom guard ya da custom authentication sistemi YOKTUR: Laravel'in
 * yerleşik hash doğrulaması ve Sanctum'un token mekanizması kullanılır.
 */
class AuthController extends Controller
{
    /**
     * Sanctum token adı. Cihaz bazlı isimlendirme (ve token yönetimi ekranı)
     * sonraki fazların konusu.
     */
    private const TOKEN_NAME = 'api';

    public function __construct(
        private readonly AuditLogService $audit,
        private readonly RegistrationService $registration,
    ) {}

    /**
     * Self-servis kayıt (P0-01): yeni User + yeni Company + Owner üyeliği +
     * aktif şirket, TEK istekte.
     *
     * İş mantığının TAMAMI RegistrationService'tedir (§13 ile aynı ilke:
     * bu controller'ın iş mantığı yoktur). Buradaki tek sorumluluk, doğrulanmış
     * DÖRT alanı servise geçirmek ve login() ile AYNI şekilde bir token
     * üretip AYNI yanıt zarfını döndürmek.
     *
     * role / company_id / active_company_id request'ten OKUNMAZ:
     * RegisterRequest::rules() bu alanları hiç tanımlamaz, bu yüzden
     * validated() içlerinde ne olursa olsun bu üçünü asla döndürmez.
     * Rol, RegistrationService içinde SABİT olarak Role::Owner'dır.
     *
     * 201 Created: login'den farklı olarak burada yeni bir kaynak (User +
     * Company) yaratılıyor — MemberController::store() ile aynı durum kodu.
     */
    public function register(RegisterRequest $request): JsonResponse
    {
        $user = $this->registration->register(
            $request->validated('name'),
            $request->validated('email'),
            $request->validated('password'),
            $request->validated('company_name'),
        );

        // Token ÜRETİLİR; login() ile aynı mekanizma, aynı isim. Kayıt
        // olmak zaten "ilk giriş" anlamına gelir — ayrıca login isteği
        // atmaya zorlamak istemciye gereksiz bir tur ekletirdi.
        $token = $user->createToken(self::TOKEN_NAME)->plainTextToken;

        // Token audit'e GİRMEZ (login() ile aynı disiplin). Kayıt olayının
        // izi zaten RegistrationService içinde company.created ve
        // member.created ile tutulur; burada tekrar bir audit çağrısı
        // YAPILMAZ — aynı olayı iki kez, iki farklı action'la kaydetmek
        // audit'i yanıltıcı hale getirirdi.
        return response()->json([
            'data' => [
                'token' => $token,
                'user' => UserResource::make($user),
            ],
        ], Response::HTTP_CREATED);
    }

    /**
     * E-posta + parola karşılığında bir personal access token üretir.
     *
     * Yanıttaki token, plaintext olarak SADECE burada, bir kez görünür;
     * veritabanına SHA-256 hash'i yazılır (Sanctum'un kendi davranışı,
     * Faz 2.1'de doğrulandı).
     */
    public function login(LoginRequest $request): JsonResponse
    {
        $credentials = $request->validated();

        $user = User::query()->where('email', $credentials['email'])->first();

        if ($user === null) {
            // Zamanlama sızıntısına karşı: kullanıcı yokken de bir hash
            // maliyeti ödenir, böylece "e-posta kayıtlı mı?" sorusu yanıt
            // süresinden okunamaz.
            Hash::make($credentials['password']);

            return $this->failedLogin(null, $credentials['email']);
        }

        if (! Hash::check($credentials['password'], $user->getAuthPassword())) {
            return $this->failedLogin($user, $credentials['email']);
        }

        // Yeni token ÜRETİLİR, mevcutlar iptal EDİLMEZ: kullanıcının diğer
        // cihazlarındaki oturumları düşürmek login'in işi değildir.
        $token = $user->createToken(self::TOKEN_NAME)->plainTextToken;

        // Token audit'e GİRMEZ; yalnızca olayın kendisi kaydedilir.
        $this->audit->recordAuthEvent(AuditAction::LoginSucceeded, $user);

        return response()->json([
            'data' => [
                'token' => $token,
                'user' => UserResource::make($user),
            ],
        ]);
    }

    /**
     * Yalnızca isteği yapan token'ı iptal eder.
     *
     * tokens()->delete() BİLİNÇLİ olarak kullanılmaz: bir cihazdan çıkış
     * yapmak diğer cihazları düşürmemelidir.
     */
    public function logout(Request $request): Response
    {
        $token = $request->user()->currentAccessToken();

        // Session tabanlı kimlik doğrulamada Sanctum TransientToken döndürür;
        // silinecek bir kayıt yoktur. Bu uç token tabanlı olsa da kontrol
        // savunma amaçlı bırakıldı.
        if ($token instanceof PersonalAccessToken) {
            $token->delete();
        }

        $this->audit->recordAuthEvent(AuditAction::LoggedOut, $request->user());

        return response()->noContent();
    }

    /**
     * Kimliği doğrulanmış kullanıcı.
     *
     * Tenant verisi döndürmez, bu yüzden aktif şirket GEREKTİRMEZ:
     * kullanıcı şirket seçmeden de kim olduğunu öğrenebilmelidir.
     */
    public function me(Request $request): UserResource
    {
        return UserResource::make($request->user());
    }

    /**
     * Başarısız kimlik doğrulamanın TEK yanıtı.
     *
     * "e-posta bulunamadı" ile "parola yanlış" ayrımı yapılmaz; ayrım,
     * geçerli e-posta adreslerinin sayılmasına (user enumeration) izin
     * verirdi. Parola veya token yanıta ya da loga hiçbir şekilde yazılmaz.
     */
    private function invalidCredentials(): JsonResponse
    {
        return response()->json([
            'message' => 'Kimlik bilgileri hatalı.',
            'code' => 'invalid_credentials',
        ], Response::HTTP_UNAUTHORIZED);
    }

    /**
     * Başarısız girişi kaydeder ve tek tip 401'i döndürür.
     *
     * PAROLA AUDIT'E GİRMEZ. E-POSTA DA DÜZ METİN GİRMEZ (§3, §12).
     *
     * Denenen adres kayıtlı bir kullanıcıya aitse user_id yazılır — "bu
     * hesaba saldırı var mı?" sorusunun cevabı budur. Değilse yalnızca
     * tek yönlü özet kalır: başarısız denemeler sistemde hesabı olmayan
     * kişilerin adreslerini de içerir (yanlış yazım, credential stuffing
     * listeleri) ve onları saklamak, saldırganın listesini bizim adımıza
     * arşivlemek olurdu.
     *
     * Yanıt her iki durumda da BİRE BİR aynıdır; audit'in içeriği
     * dışarıdan gözlemlenemez, user enumeration koruması bozulmaz.
     */
    private function failedLogin(?User $user, string $attemptedEmail): JsonResponse
    {
        $this->audit->recordAuthEvent(
            AuditAction::LoginFailed,
            $user,
            ['email_hash' => $this->audit->hashEmail($attemptedEmail)],
        );

        return $this->invalidCredentials();
    }
}
