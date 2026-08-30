import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import { Badge, Button, Card, ConfirmPanel, ErrorState, LoadingScreen } from '@/components/ui';
import { roleLabel } from '@/lib/company/roleLabel';
import type { Member, Role } from '@/types/api';
import { memberErrorMessage, removeErrorMessage } from './memberErrors';

/**
 * Üye detayı — rol değişimi ve ekipten çıkarma.
 *
 * ROL DEĞİŞİMİ AYRI UÇ: PATCH /members/{id}/role, gövde yalnızca
 * { role }. Backend bunu bilinçli ayırmış — rol kaydın en tehlikeli
 * özniteliği ve kazara başka bir güncellemenin içine karışmamalı. Bu
 * yüzden düzenleme formunda rol alanı YOK.
 *
 * İKİ ÖZEL SONUÇ, İKİ FARKLI ANLAM:
 *   422 + company_requires_an_owner → yetki sorunu DEĞİL; işlem şirketi
 *        ownersız bırakırdı. Backend'in mesajı gösterilir.
 *   403 (çıkarma) → kullanıcı kendini çıkarmaya çalıştı. "Bölüm sahiplere
 *        açık" DEĞİL; zaten owner, aksi hâlde bu ekranı göremezdi.
 */
export function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  /** Fiile özgü hata: rol değişimi ya da çıkarma. */
  const [actionError, setActionError] = useState<string | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [changingRole, setChangingRole] = useState(false);

  /** Onay paneli kapanınca odağın döneceği düğme. */
  const removeTriggerRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setMember(await endpoints.members.get(api, Number(id)));
    } catch (caught) {
      setError(caught);
      setMember(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRoleChange(role: Role) {
    setChangingRole(true);
    setActionError(null);

    try {
      setMember(await endpoints.members.changeRole(api, Number(id), role));
    } catch (caught) {
      // Son owner kuralı buraya 422 olarak düşer; mesajı backend verir.
      setActionError(memberErrorMessage(caught));
    } finally {
      setChangingRole(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    setActionError(null);

    try {
      await endpoints.members.remove(api, Number(id));
      navigate('/app/team', { replace: true });
    } catch (caught) {
      // Buradaki 403 "kendini çıkaramazsın" demektir.
      setActionError(removeErrorMessage(caught));
      setConfirming(false);
    } finally {
      setRemoving(false);
    }
  }

  if (loading) return <LoadingScreen />;

  if (error && !member) {
    return (
      <div className="ft-page">
        <Card>
          <ErrorState message={memberErrorMessage(error)} />
          <Link className="ft-button ft-button--secondary" to="/app/team">
            Ekibe dön
          </Link>
        </Card>
      </div>
    );
  }

  if (!member) return null;

  const isOwner = member.role === 'owner';

  return (
    <div className="ft-page">
      <header className="ft-page__header">
        <h1 className="ft-page__title">{member.name}</h1>
        <div className="ft-page__actions">
          <Link className="ft-button ft-button--secondary" to={`/app/team/${member.id}/edit`}>
            Düzenle
          </Link>
          <Button
            variant="ghost"
            onClick={(event) => {
              removeTriggerRef.current = event.currentTarget;
              setConfirming(true);
            }}
          >
            Ekipten çıkar
          </Button>
        </div>
      </header>

      {actionError !== null && <ErrorState message={actionError} />}

      <Card>
        <dl className="ft-details">
          <dt>E-posta</dt>
          <dd>{member.email}</dd>

          <dt>Rol</dt>
          <dd data-testid="member-role">
            {/* Yalnızca görüntüleme; yetki kararı backend'e ait. */}
            <Badge tone={isOwner ? 'accent' : 'neutral'}>{roleLabel(member.role)}</Badge>
          </dd>

          <dt>Katılma</dt>
          <dd>{member.created_at ?? '—'}</dd>

          <dt>Son güncelleme</dt>
          <dd>{member.updated_at ?? '—'}</dd>
        </dl>
      </Card>

      <Card>
        <h2 className="ft-section__title">Rol</h2>
        <p className="ft-muted">
          Rol ayrı bir işlemdir ve düzenleme formundan değiştirilemez.
        </p>
        <div className="ft-form__actions">
          {isOwner ? (
            <Button
              variant="secondary"
              loading={changingRole}
              onClick={() => void handleRoleChange('member')}
            >
              Üye yap
            </Button>
          ) : (
            <Button
              variant="secondary"
              loading={changingRole}
              onClick={() => void handleRoleChange('owner')}
            >
              Sahip yap
            </Button>
          )}
        </div>
      </Card>

      {confirming && (
        <Card>
          <ConfirmPanel
            data-testid="remove-confirm-panel"
            triggerRef={removeTriggerRef}
            onCancel={() => setConfirming(false)}
          >
            <p data-testid="remove-confirm">
              <strong>{member.name}</strong> ekipten çıkarılacak. Şirket verilerine erişimi
              sona erer.
            </p>
            <div className="ft-form__actions">
              {/* Vazgeç ilk kontrol: yıkıcı aksiyon Tab sırasında ilk
                  durak olmamalı. */}
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Vazgeç
              </Button>
              <Button onClick={() => void handleRemove()} loading={removing}>
                Evet, çıkar
              </Button>
            </div>
          </ConfirmPanel>
        </Card>
      )}
    </div>
  );
}
