<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\LoginRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
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

            return $this->invalidCredentials();
        }

        if (! Hash::check($credentials['password'], $user->getAuthPassword())) {
            return $this->invalidCredentials();
        }

        // Yeni token ÜRETİLİR, mevcutlar iptal EDİLMEZ: kullanıcının diğer
        // cihazlarındaki oturumları düşürmek login'in işi değildir.
        $token = $user->createToken(self::TOKEN_NAME)->plainTextToken;

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
}
