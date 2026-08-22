<?php

namespace App\Finance;

/**
 * Bir KDV hesabının sonucu VE girdileri.
 *
 * Playbook kontrol listesi: "finansal hesaplamalar açıklanabilir".
 * Kullanıcıya yalnızca "KDV: 6,67 TL" demek yetmez — hangi tutardan,
 * hangi oranla, hangi yönde (net→brüt mü, brüt→net mi) ve nasıl
 * yuvarlanarak çıktığı da taşınabilmelidir.
 *
 * Bu yüzden sonuç düz bir sayı değil, girdilerini de taşıyan bir
 * nesnedir. `toArray()` ileride API yanıtının kaynağı olacak; ama bu
 * sınıfta hiçbir HTTP bilgisi YOKTUR — saf veridir ve öyle kalmalıdır.
 *
 * `vatRateBp === null` "KDV yok" DEĞİL, "kayıt KDV bilgisi taşımıyor"
 * demektir. Oranı null olan kalem KDV özetine GİRMEZ; sıfır oranlı
 * kalem girer ve sıfır oranlı satır olarak görünür. İkisini tek "0"a
 * indirmek, "KDV'siz mi, girilmemiş mi" sorusunu cevapsız bırakırdı.
 */
final readonly class VatBreakdown
{
    public const SOURCE_NET = 'net';

    public const SOURCE_GROSS = 'gross';

    public function __construct(
        /** Hesabın hangi uçtan başladığı: net mi verildi, brüt mü? */
        public string $source,
        public Money $net,
        public Money $vat,
        public Money $gross,
        public ?int $vatRateBp,
    ) {}

    /**
     * Bu kalem KDV özetine girer mi?
     *
     * Sıfır oran GİRER (KDV'lidir, oranı sıfırdır).
     * Null oran GİRMEZ (kayıt KDV bilgisi taşımıyor).
     */
    public function isVatApplicable(): bool
    {
        return $this->vatRateBp !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'source' => $this->source,
            'currency' => $this->net->currency->value,
            'vat_rate_bp' => $this->vatRateBp,
            'vat_applicable' => $this->isVatApplicable(),
            'rounding' => RoundingPolicy::MODE,
            'net_minor' => $this->net->minor,
            'vat_minor' => $this->vat->minor,
            'gross_minor' => $this->gross->minor,
        ];
    }
}
