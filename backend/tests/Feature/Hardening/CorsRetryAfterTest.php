<?php

namespace Tests\Feature\Hardening;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class CorsRetryAfterTest extends TestCase
{
    private const ORIGIN = 'http://127.0.0.1:5173';

    protected function setUp(): void
    {
        parent::setUp();

        config(['cors.allowed_origins' => [self::ORIGIN]]);
        RateLimiter::for('cors-retry-test', fn () => Limit::perMinute(1)->by('cors-retry-test'));
        Route::get('/api/v1/cors-retry-test', fn () => response()->json(['ok' => true]))
            ->middleware('throttle:cors-retry-test');
    }

    public function test_allowed_origin_can_read_the_real_throttle_retry_after_header(): void
    {
        $this->withHeader('Origin', self::ORIGIN)->getJson('/api/v1/cors-retry-test')->assertOk();

        $response = $this->withHeader('Origin', self::ORIGIN)->getJson('/api/v1/cors-retry-test');

        $response->assertStatus(429)
            ->assertHeader('Access-Control-Allow-Origin', self::ORIGIN)
            ->assertHeader('Access-Control-Expose-Headers', 'Retry-After')
            ->assertHeaderMissing('Access-Control-Allow-Credentials');
        $this->assertGreaterThan(0, (int) $response->headers->get('Retry-After'));
    }

    public function test_unlisted_origin_does_not_receive_cross_origin_access(): void
    {
        config(['cors.allowed_origins' => [self::ORIGIN, 'http://localhost:5173']]);

        $this->withHeader('Origin', 'https://unlisted.example')->getJson('/api/v1/cors-retry-test')
            ->assertHeaderMissing('Access-Control-Allow-Origin')
            ->assertHeaderMissing('Access-Control-Allow-Credentials');
    }

    public function test_single_origin_configuration_never_reflects_an_unlisted_origin(): void
    {
        // CORS kitaplığı tek izinli origin'i sabit yazabilir. Tarayıcı
        // farklı Origin ile eşleşmeyen bu başlıkta erişimi reddeder.
        $this->withHeader('Origin', 'https://unlisted.example')->getJson('/api/v1/cors-retry-test')
            ->assertHeader('Access-Control-Allow-Origin', self::ORIGIN)
            ->assertHeaderMissing('Access-Control-Allow-Credentials');
    }

    public function test_allowed_origin_preflight_preserves_the_exact_origin_without_credentials(): void
    {
        $this->withHeaders([
            'Origin' => self::ORIGIN,
            'Access-Control-Request-Method' => 'GET',
            'Access-Control-Request-Headers' => 'Authorization',
        ])->options('/api/v1/cors-retry-test')
            ->assertNoContent()
            ->assertHeader('Access-Control-Allow-Origin', self::ORIGIN)
            ->assertHeaderMissing('Access-Control-Allow-Credentials');
    }
}
