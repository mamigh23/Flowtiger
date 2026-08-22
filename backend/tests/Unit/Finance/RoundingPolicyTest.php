<?php

namespace Tests\Unit\Finance;

use App\Finance\RoundingPolicy;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

/**
 * Kesirin tam sayıya döndüğü TEK YER.
 *
 * Yuvarlama yalnızca burada olur. Projede bunun bir örneği zaten var:
 * parola politikası AppServiceProvider'da BİR KEZ tanımlanıp iki ayrı
 * FormRequest tarafından paylaşılıyor; politika değiştiğinde iki uç
 * birlikte değişiyor, birinin sessizce eskimesi mümkün değil. Yuvarlama
 * da aynı sebeple tek kaynaktan gelir: iki yerde yuvarlayan bir sistem,
 * bir gün iki farklı toplam üretir.
 *
 * MOD: yarım yukarı, SIFIRDAN UZAĞA (half-up, away from zero).
 * −0,5 → −1 olur, 0'a değil. Böylece bir tutarın işareti değişse bile
 * mutlak değeri aynı yuvarlanır: round(−x) === −round(x). Bu, iade
 * belgesinin aslıyla kuruşu kuruşuna örtüşmesini garanti eder.
 *
 * ARİTMETİK TAMAMEN TAM SAYIDIR. round()/floor() gibi float döndüren
 * fonksiyonlar kullanılmaz; kesinlik kaybı olasılığı hiç doğmaz.
 */
class RoundingPolicyTest extends TestCase
{
    public function test_it_rounds_down_below_the_half(): void
    {
        // 4 / 10 = 0,4
        $this->assertSame(0, RoundingPolicy::divide(4, 10));
    }

    public function test_it_rounds_up_above_the_half(): void
    {
        // 6 / 10 = 0,6
        $this->assertSame(1, RoundingPolicy::divide(6, 10));
    }

    /**
     * Tam yarım YUKARI yuvarlanır — bankacı yuvarlaması değil.
     *
     * Bankacı yuvarlaması (yarımı en yakın çifte) istatistiksel sapmayı
     * azaltır ama açıklaması zordur: aynı oran, aynı tutar, farklı sonuç
     * verir. Playbook §10.3 mali sonuçların AÇIKLANABİLİR olmasını
     * şart koşuyor; kullanıcıya "0,5 yukarı gider" demek mümkün, "0,5
     * bazen aşağı gider" demek değil.
     */
    public function test_it_rounds_a_half_up(): void
    {
        // 5 / 10 = 0,5
        $this->assertSame(1, RoundingPolicy::divide(5, 10));

        // 15 / 10 = 1,5
        $this->assertSame(2, RoundingPolicy::divide(15, 10));
    }

    public function test_it_rounds_a_negative_half_away_from_zero(): void
    {
        // −5 / 10 = −0,5
        $this->assertSame(-1, RoundingPolicy::divide(-5, 10));
    }

    /**
     * İşaret simetrisi: iade belgesi aslının aynadaki görüntüsü olmalı.
     */
    public function test_rounding_is_symmetric_around_zero(): void
    {
        foreach ([1, 4, 5, 6, 9, 12345, 99999] as $numerator) {
            $this->assertSame(
                -RoundingPolicy::divide($numerator, 10000),
                RoundingPolicy::divide(-$numerator, 10000),
                "İşaret simetrisi bozuldu: $numerator",
            );
        }
    }

    public function test_an_exact_division_is_unchanged(): void
    {
        $this->assertSame(7, RoundingPolicy::divide(70, 10));
        $this->assertSame(0, RoundingPolicy::divide(0, 10));
    }

    public function test_it_rejects_a_zero_denominator(): void
    {
        $this->expectException(InvalidArgumentException::class);

        RoundingPolicy::divide(10, 0);
    }

    public function test_it_rejects_a_negative_denominator(): void
    {
        // İşaret payda üzerinden taşınmaz; bölen daima pozitiftir.
        $this->expectException(InvalidArgumentException::class);

        RoundingPolicy::divide(10, -10);
    }

    /**
     * REGRESYON: sonuç DAİMA int'tir.
     *
     * PHP'de bir taşma sessizce float üretir ve o float bir daha asla
     * tam sayı kesinliğine dönmez. Tip iddiası bunu yakalar.
     */
    public function test_the_result_is_always_an_integer(): void
    {
        $result = RoundingPolicy::divide(9007199254740991, 10000);

        $this->assertIsInt($result);
    }

    public function test_it_is_deterministic(): void
    {
        $first = RoundingPolicy::divide(123456789, 10000);

        for ($i = 0; $i < 100; $i++) {
            $this->assertSame($first, RoundingPolicy::divide(123456789, 10000));
        }
    }

    /**
     * Politikanın adı yanıtlarda taşınabilmeli: "nasıl yuvarlandı?"
     * sorusunun cevabı hesabın kendisiyle birlikte gitmeli (§A5).
     */
    public function test_it_exposes_its_mode_for_explainability(): void
    {
        $this->assertSame('half_up', RoundingPolicy::MODE);
    }
}
