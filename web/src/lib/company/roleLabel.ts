import type { Role } from '@/types/api';

/**
 * Rolün kullanıcıya gösterilen adı.
 *
 * DİKKAT: bu yalnızca GÖRÜNTÜLEME içindir. Rol bilgisiyle istemcide
 * yetki kararı verilmez (playbook §3.1) — hangi verinin görüneceğine
 * backend karar verir ve yetkisiz uçlar 403 döner.
 */
export function roleLabel(role: Role): string {
  return role === 'owner' ? 'Sahip' : 'Üye';
}
