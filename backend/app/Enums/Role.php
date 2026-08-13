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
