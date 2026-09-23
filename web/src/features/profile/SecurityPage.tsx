import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, endpoints, toUserMessage } from '@/lib/api';
import { Badge, Button, ErrorState } from '@/components/ui';
import { auditActionLabel, formatDateTime } from '@/features/audit/auditLabels';
import type { SecurityEvent, Session } from '@/types/api';

export function SecurityPage() {
  return (
    <div className="ft-page ft-security">
      <header className="ft-security-hero">
        <div>
          <span className="ft-security-hero__eyebrow">Güvenlik</span>
          <h1 className="ft-security-hero__title">Oturumlar ve güvenlik</h1>
          <p className="ft-security-hero__lead">
            Hesabınıza erişen oturumları ve kimlik güvenliği hareketlerini yönetin.
          </p>
        </div>
        <Link className="ft-security-hero__back" to="/app/profile">
          Profile dön
        </Link>
      </header>

      <SessionsCard />
      <SecurityEventsCard />
    </div>
  );
}

function SessionsCard() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setSessions(await endpoints.profile.sessions(api));
    } catch (caught) {
      setError(caught);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function revokeSession(id: number) {
    setRevokingId(id);
    setError(null);

    try {
      await endpoints.profile.revokeSession(api, id);
      await load();
    } catch (caught) {
      setError(caught);
    } finally {
      setRevokingId(null);
    }
  }

  async function revokeOthers() {
    setRevokingOthers(true);
    setError(null);

    try {
      await endpoints.profile.revokeOtherSessions(api);
      await load();
    } catch (caught) {
      setError(caught);
    } finally {
      setRevokingOthers(false);
    }
  }

  const otherCount = sessions.filter((session) => !session.current).length;

  return (
    <section className="ft-security-card" aria-labelledby="security-sessions-title">
      <div className="ft-security-card__head">
        <div>
          <h2 className="ft-security-card__title" id="security-sessions-title">
            Oturumlar
          </h2>
          <p className="ft-security-card__lead">
            Bu hesapla açık olan cihaz ve tarayıcı oturumları.
          </p>
        </div>

        {otherCount > 0 && (
          <Button
            variant="secondary"
            loading={revokingOthers}
            disabled={revokingId !== null}
            onClick={() => void revokeOthers()}
          >
            Diğerlerini kapat
          </Button>
        )}
      </div>

      {error !== null && <ErrorState message={toUserMessage(error)} />}

      {loading ? (
        <div className="ft-security-list" data-testid="sessions-loading" aria-hidden="true">
          {[0, 1, 2].map((item) => (
            <span key={item} className="ft-skeleton ft-security-skeleton" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <p className="ft-security-empty">Aktif oturum bulunamadı.</p>
      ) : (
        <ul className="ft-security-list">
          {sessions.map((session) => (
            <li className="ft-security-item" key={session.id}>
              <div className="ft-security-item__main">
                <div className="ft-security-item__title-row">
                  <strong className="ft-security-item__name">{session.name}</strong>
                  {session.current && <Badge tone="accent">Bu oturum</Badge>}
                </div>
                <div className="ft-security-item__meta">
                  {session.last_used_at && (
                    <span>Son kullanım: {formatDateTime(session.last_used_at) ?? '—'}</span>
                  )}
                  {session.created_at && (
                    <span>Oluşturulma: {formatDateTime(session.created_at) ?? '—'}</span>
                  )}
                </div>
              </div>

              {!session.current && (
                <Button
                  variant="ghost"
                  loading={revokingId === session.id}
                  disabled={revokingId !== null || revokingOthers}
                  onClick={() => void revokeSession(session.id)}
                >
                  Kapat
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SecurityEventsCard() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{
    data: SecurityEvent[];
    meta: { current_page: number; last_page: number; total: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async (requestedPage: number) => {
    setLoading(true);
    setError(null);

    try {
      const response = await endpoints.profile.securityEvents(api, { page: requestedPage });
      setResult({
        data: response.data,
        meta: {
          current_page: response.meta.current_page,
          last_page: response.meta.last_page,
          total: response.meta.total,
        },
      });
    } catch (caught) {
      setError(caught);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const rows = result?.data ?? [];

  return (
    <section className="ft-security-card" aria-labelledby="security-events-title">
      <div className="ft-security-card__head">
        <div>
          <h2 className="ft-security-card__title" id="security-events-title">
            Güvenlik hareketleri
          </h2>
          <p className="ft-security-card__lead">
            Hesabınıza ait giriş, parola ve oturum olayları.
          </p>
        </div>

        {result && (
          <span className="ft-security-card__count">
            {result.meta.total} kayıt
          </span>
        )}
      </div>

      {loading ? (
        <div className="ft-security-list" data-testid="security-events-loading" aria-hidden="true">
          {[0, 1, 2].map((item) => (
            <span key={item} className="ft-skeleton ft-security-skeleton" />
          ))}
        </div>
      ) : error !== null ? (
        <div className="ft-security-notice">
          <ErrorState message={toUserMessage(error)} />
          <Button variant="secondary" onClick={() => void load(page)}>
            Tekrar dene
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="ft-security-empty">Henüz güvenlik hareketi yok.</p>
      ) : (
        <>
          <ul className="ft-security-list">
            {rows.map((event) => (
              <li className="ft-security-item" key={event.id}>
                <div className="ft-security-item__main">
                  <strong className="ft-security-item__name">
                    {auditActionLabel(event.action)}
                  </strong>
                  <div className="ft-security-item__meta">
                    <span>{formatDateTime(event.created_at) ?? '—'}</span>
                    {event.ip_address && <span>IP: {event.ip_address}</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {result && result.meta.last_page > 1 && (
            <div className="ft-security-pager">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Önceki
              </Button>
              <span className="ft-security-pager__status">
                Sayfa {result.meta.current_page} / {result.meta.last_page}
              </span>
              <Button
                variant="secondary"
                disabled={page >= result.meta.last_page}
                onClick={() => setPage((value) => value + 1)}
              >
                Sonraki
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
