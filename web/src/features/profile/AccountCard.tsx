import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, api, endpoints, toUserMessage } from '@/lib/api';
import { Button, Card, ErrorState, Input, useFocusFirstInvalidFieldOnError } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthContext';
import type { User } from '@/types/api';

/**
 * Ad ve e-posta.
 *
 * GÖVDE TAM OLARAK { name, email }. ProfileUpdateRequest başka hiçbir
 * alanı tanımaz ve tanımadığı alanlar için `prohibited` kuralı da
 * YAZILMAMIŞTIR — 422 dönmek "hangi alan adları tanınıyor" bilgisini
 * sızdırırdı. Yani `role`, `active_company_id`, `company_id`, `user_id`
 * ya da `password` göndermemek bir nezaket değil, sözleşmenin istemci
 * tarafındaki karşılığıdır.
 *
 * Rol değişimi ayrı bir uçtur ve owner'a aittir; kullanıcı kendi rolünü
 * kendi değiştiremez. Aktif şirket ise yalnızca
 * POST /companies/{id}/select ile değişir (playbook §3.1).
 *
 * E-POSTA TRIM EDİLİR, KÜÇÜK HARFE ÇEVRİLMEZ. Baştaki/sondaki boşluk
 * backend'in `email` kuralına takılır ve kullanıcı sebebini anlamaz;
 * normalizasyonun kendisi ise backend'in işidir (tek nokta). Yanıtta
 * dönen normalize adres forma geri yazılır.
 */
export function AccountCard({
  profile,
  onSaved,
}: {
  profile: User;
  onSaved: (user: User) => void;
}) {
  const { refreshUser } = useAuth();

  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // P1-06: submit başarısız olduğunda odağı ilk geçersiz alana taşır.
  useFocusFirstInvalidFieldOnError(error);

  const isValidation = error instanceof ApiError && error.isValidation;
  const nameError = isValidation ? error.fieldError('name') : undefined;
  const emailError = isValidation ? error.fieldError('email') : undefined;

  // Alan altında gösterilemeyen her hata form seviyesinde gösterilir;
  // sessizce yutulan bir hata, kullanıcıya "kaydedildi" izlenimi verir.
  const formError =
    error === null || (isValidation && (nameError || emailError)) ? null : toUserMessage(error);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const updated = await endpoints.profile.update(api, {
        name: name.trim(),
        email: email.trim(),
      });

      onSaved(updated);
      setName(updated.name);
      setEmail(updated.email);
      setSaved(true);

      // Kabuğun üst çubuğu oturumdaki kullanıcıyı gösterir; orada eski ad
      // kalırsa kullanıcı değişikliğin uygulanmadığını sanır.
      //
      // Ayrı try: tazeleme başarısız olursa bu, KAYDIN başarısız olduğu
      // anlamına gelmez ve kullanıcıya hata gibi gösterilmemeli.
      try {
        await refreshUser();
      } catch {
        // Yoksayılır — 401 ise oturum zaten merkezî olarak düşer.
      }
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="ft-section__title">Hesap bilgileri</h2>

      {formError !== null && <ErrorState message={formError} />}

      {/* Başarı bir ALERT DEĞİLDİR: role="alert" yalnızca gerçek hataya ait. */}
      {saved && formError === null && <p className="ft-muted">Profil bilgileriniz güncellendi.</p>}

      <form data-testid="profile-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <Input
          label="Ad"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={nameError}
          autoComplete="name"
        />

        <Input
          label="E-posta"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={emailError}
          autoComplete="email"
        />

        <div className="ft-form__actions">
          <Button type="submit" loading={saving}>
            Kaydet
          </Button>
        </div>
      </form>
    </Card>
  );
}
