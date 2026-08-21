import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Button, Card, ErrorState, Input, LoadingScreen } from '@/components/ui';
import type { Member } from '@/types/api';
import { memberErrorMessage, memberFieldError } from './memberErrors';

/**
 * Üye düzenleme.
 *
 * GÖVDE SÖZLEŞMESİ: yalnızca `name` ve `email`.
 *
 * ROL BU FORMDA YOKTUR ve olmayacaktır. Rol ayrı bir uçla değişir
 * (PATCH /members/{id}/role, üye detayında). Backend bu ayrımı bilinçli
 * yapmış: rol kaydın en tehlikeli özniteliği ve kazara başka bir
 * güncellemenin içine karışmamalı. Forma bir rol alanı koymak, backend'in
 * özenle ayırdığı iki işlemi istemcide yeniden birleştirmek olurdu.
 */
export function MemberEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);

  // Çift gönderim koruması ref ile: state güncellemesi asenkrondur.
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      try {
        const found = await endpoints.members.get(api, Number(id));

        if (!cancelled) {
          setMember(found);
          setName(found.name);
          setEmail(found.email);
        }
      } catch (caught) {
        if (!cancelled) setLoadError(caught);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (inFlight.current) return;
    inFlight.current = true;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const updated = await endpoints.members.update(api, Number(id), {
        name: name.trim(),
        email: email.trim(),
      });

      navigate(`/app/team/${updated.id}`, { replace: true });
    } catch (caught) {
      setSubmitError(caught);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingScreen />;

  if (loadError || !member) {
    return (
      <div className="ft-page">
        <Card>
          <ErrorState message={memberErrorMessage(loadError)} />
          <Link className="ft-button ft-button--secondary" to="/app/team">
            Ekibe dön
          </Link>
        </Card>
      </div>
    );
  }

  const nameError = memberFieldError(submitError, 'name');
  const emailError = memberFieldError(submitError, 'email');
  const formError =
    submitError && !nameError && !emailError ? memberErrorMessage(submitError) : null;

  return (
    <div className="ft-page">
      <header className="ft-page__header">
        <h1 className="ft-page__title">Üyeyi düzenle</h1>
      </header>

      <Card>
        <form onSubmit={handleSubmit} noValidate>
          {formError && <ErrorState message={formError} />}

          <Input
            label="Ad"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={nameError}
            autoComplete="off"
          />

          <Input
            label="E-posta"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={emailError}
            autoComplete="off"
          />

          {/*
            Rol alanı BİLEREK yok — PATCH /members/{id}/role ile,
            üye detayından değişir.
          */}

          <div className="ft-form__actions">
            <Button type="submit" loading={submitting}>
              Kaydet
            </Button>
            <Link className="ft-button ft-button--ghost" to={`/app/team/${member.id}`}>
              Vazgeç
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
