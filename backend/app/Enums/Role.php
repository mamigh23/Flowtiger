<?php

namespace App\Enums;

/**
 * Bir kullanıcının ŞİRKET İÇİNDEKİ rolü (company_users.role).
 *
 * Rol kullanıcıya değil, ÜYELİĞE aittir: aynı kişi A şirketinde owner,
 * B şirketinde member olabilir. Bu yüzden burada global bir "kullanıcı
 * tipi" yoktur ve olmamalıdır.
 *
 * NEDEN PİVOT'A CAST EKLENMEDİ:
 * Company/User modellerindeki withPivot('role') bilinçli olarak ham string
 * döndürmeye devam ediyor. Faz 2.1'den beri var olan bir regresyon testi
 * (AuthenticationFoundationTest) pivot rolünü assertSame('owner', ...) ile
 * karşılaştırıyor; cast eklemek çalışan bir sözleşmeyi kırardı. Enum
 * SINIRLARDA kullanılır — validation, servis mantığı, policy — modelin
 * içinde değil.
 *
 * GELECEĞE AÇIK KAPI (§3):
 * Şu anda bir permission sistemi YOK ve kurulmamalı. Ama yetki soruları
 * kod içinde `$role === Role::Owner` diye dağıtılmak yerine aşağıdaki
 * yetenek metotlarından sorulur. Permission tablosu geldiğinde değişecek
 * tek yer bu metotların gövdesidir; çağıran hiçbir kod değişmez.
 */
enum Role: string
{
    case Owner = 'owner';

    case Member = 'member';

    /**
     * Bu rol şirketin üyelerini yönetebilir mi?
     *
     * Üye listeleme, ekleme, güncelleme, rol değiştirme ve çıkarmanın
     * TEK yetki kaynağı budur. Permission sistemi geldiğinde burası
     * `$this->permissions()->contains(Permission::ManageMembers)` olur.
     */
    public function managesMembers(): bool
    {
        return $this === self::Owner;
    }

    /**
     * Bu rol şirketin audit geçmişini görebilir mi?
     *
     * managesMembers()'tan AYRI bir metot olarak duruyor, ikisi şu an aynı
     * cevabı verse bile. Sebep: bunlar farklı sorular. İleride "denetçi"
     * gibi bir rol, üye yönetemeden audit okuyabilmeli; ya da tersine,
     * üye yönetebilen biri güvenlik geçmişini göremeyebilir. İki soruyu
     * tek metoda bağlamak, o ayrımı ileride imkânsız kılardı.
     */
    public function viewsAuditLogs(): bool
    {
        return $this === self::Owner;
    }

    /**
     * Bu rol şirketin MALİ KİMLİĞİNİ değiştirebilir mi? (Faz 7 / Adım 2)
     *
     * viewsAuditLogs() ile aynı sebeple ayrı bir metot: bunlar farklı
     * sorular. İleride bir "muhasebeci" rolü mali kimliği OKUYABİLİP
     * değiştiremeyebilir, ya da üye yönetemeden fatura kesebilir. İki
     * soruyu tek metoda bağlamak, o ayrımı ileride imkânsız kılardı.
     *
     * Vergi numarası ve unvan fatura kesiminde yasal olarak bağlayıcıdır;
     * bu yüzden owner'a ait.
     */
    public function managesBilling(): bool
    {
        return $this === self::Owner;
    }

    /**
     * Bu rol şirketin finans kayıtlarını GÖREBİLİR mi? (Faz 7 / Adım 3)
     */
    public function viewsFinance(): bool
    {
        return $this === self::Owner;
    }

    /**
     * Bu rol finans kaydı OLUŞTURABİLİR / DEĞİŞTİREBİLİR mi?
     *
     * viewsFinance()'tan ayrı: ileride bir "muhasebeci" rolü kayıtları
     * okuyup değiştiremeyebilir. İki soruyu tek metoda bağlamak o ayrımı
     * imkânsız kılardı — viewsAuditLogs()/managesMembers() ayrımıyla aynı
     * gerekçe.
     */
    public function managesFinance(): bool
    {
        return $this === self::Owner;
    }

    /**
     * Bu rol müşteri kaydını SİLEBİLİR mi? (P0-04 — Member Permission Hardening)
     *
     * Görüntüleme/oluşturma/güncellemeden BİLİNÇLİ OLARAK AYRI bir metot:
     * silme geri alınamaz (customers tablosunda soft delete yok), diğer
     * üçü değiştirilebilir bir düzeltmedir. Member şirketin TÜM operasyonel
     * müşteri kayıtlarını görüntüleyebilir/oluşturabilir/güncelleyebilir
     * ama silemez — ürün kararı budur. viewsTasks()/managesTasks() ayrımıyla
     * aynı gerekçe: iki soruyu tek metoda bağlamak bu ayrımı imkânsız
     * kılardı.
     */
    public function deletesCustomers(): bool
    {
        return $this === self::Owner;
    }

    /**
     * Bu rol şirketin görevlerini GÖREBİLİR mi? (Task/Planning v1)
     *
     * FİNANSTAN FARKLI OLARAK HERKESE AÇIK. Finans kayıtları şirketin
     * mali görünümüdür ve owner'a aittir; yapılacak iş listesi ise
     * operasyonel çalışmadır. Üye kendi gününü göremiyorsa ürün işe
     * yaramaz.
     *
     * Her zaman true dönen bir metot gereksiz görünebilir ama policy bir
     * şeye sormak zorunda; alternatif, `true` değerini policy'ye
     * dağıtmaktı. Salt okunur bir "mali müşavir" rolü geldiğinde
     * değişecek tek yer burasıdır.
     */
    public function viewsTasks(): bool
    {
        return true;
    }

    /**
     * Bu rol görev OLUŞTURABİLİR / DEĞİŞTİREBİLİR / TAMAMLAYABİLİR mi?
     *
     * viewsTasks()'tan ayrı: ileride bir rol günü görüp değiştiremeyebilir.
     * İki soruyu tek metoda bağlamak o ayrımı imkânsız kılardı —
     * viewsFinance()/managesFinance() ayrımıyla aynı gerekçe.
     */
    public function managesTasks(): bool
    {
        return true;
    }

    /**
     * Bu rol görev kaydını SİLEBİLİR mi? (P0-04 — Member Permission Hardening)
     *
     * managesTasks()'tan BİLİNÇLİ OLARAK AYRI: oluşturma/güncelleme/
     * tamamlama şirketin tüm operasyonel görevleri için her iki role de
     * açık kalırken, silme geri alınamaz bir kayıptır (görev void edilmez,
     * silinir) ve Owner'a ayrılmıştır — ürün kararı budur. deletesCustomers()
     * ile aynı gerekçe.
     */
    public function deletesTasks(): bool
    {
        return $this === self::Owner;
    }

    /**
     * Şirketin en az bir tanesine sahip olmak ZORUNDA olduğu rol mü?
     *
     * "Bir şirket asla ownersız kalamaz" kuralının (§5, §19) tek
     * tanımlandığı yer.
     */
    public function isRequiredForCompanySurvival(): bool
    {
        return $this === self::Owner;
    }

    /**
     * Validation ve DB constraint'i için geçerli değerler.
     *
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(fn (self $role): string => $role->value, self::cases());
    }
}
