import { Link, NavLink, useSearchParams } from 'react-router-dom';
import { MembersSection } from './MemberListPage';
import { InvitationsSection } from '@/features/invitations/InvitationListPage';
import { IncomingInvitationsPage } from '@/features/invitations/IncomingInvitationsPage';
import { useCompanies } from '@/lib/company/CompanyContext';

export type TeamSegment = 'members' | 'invitations';

/** Şirket üyeleri ve kişisel/şirket davetleri için ortak gezinme. */
export function TeamHubPage({ segment }: { segment: TeamSegment }) {
  const [params] = useSearchParams();
  const incoming = params.get('view') === 'incoming';
  const { activeCompany } = useCompanies();
  return (
    <div className="ft-page ft-team-hub ft-team-hub--simple">
      <header className="ft-team-hero">
        <div className="ft-team-hero__text">
          <span className="ft-team-hero__eyebrow">{activeCompany?.name ?? 'Çalışma alanı'}</span>
          <h1 className="ft-team-hero__title">Ekip</h1>
          <p className="ft-team-hero__lead">Üyeleri yönetin, davetlerinizi tek yerden takip edin.</p>
        </div>
        {activeCompany?.role === 'owner' && (
          <Link className="ft-invitations-cta" to="/app/invitations/new">
            <span aria-hidden="true">+</span> Davet gönder
          </Link>
        )}
      </header>
      <nav className="ft-team-hub__segments" aria-label="Ekip bölümleri">
        <NavLink end to="/app/team" className={({ isActive }) =>
          `ft-team-hub__segment${isActive ? ' ft-team-hub__segment--active' : ''}`}>
          Üyeler
        </NavLink>
        <NavLink to="/app/team/invitations" className={({ isActive }) =>
          `ft-team-hub__segment${isActive ? ' ft-team-hub__segment--active' : ''}`}>
          Davetler
        </NavLink>
      </nav>
      {segment === 'members' ? <MembersSection compact /> : (
        <>
          <nav className="ft-invitation-views" aria-label="Davet yönü">
            <Link to="/app/team/invitations?view=incoming" aria-current={incoming ? 'page' : undefined}>
              Gelen davetler
            </Link>
            <Link to="/app/team/invitations" aria-current={!incoming ? 'page' : undefined}>
              Gönderilen davetler
            </Link>
          </nav>
          {incoming ? <IncomingInvitationsPage embedded /> : <InvitationsSection compact />}
        </>
      )}
    </div>
  );
}
