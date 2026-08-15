import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, endpoints } from '@/lib/api';
import { useAuth } from '@/lib/auth/AuthContext';
import type { Company } from '@/types/api';

/**
 * Aktif şirket durumu.
 *
 * KRİTİK KURAL: aktif şirket İSTEMCİDE SEÇİLMEZ.
 *
 * Buradaki değer yalnızca bir ÖNBELLEKTİR — backend'in söylediğinin
 * kopyası. Tenant kararı her istekte backend'de yeniden verilir
 * (company.context middleware'i üyeliği yeniden doğrular). İstemci
 * hiçbir yerde active_company_id göndermez; şirket değiştirmek için
 * yalnızca select ucu çağrılır (§9, §21).
 */
interface CompanyContextValue {
  companies: Company[];
  activeCompanyId: number | null;
  activeCompany: Company | null;
  loading: boolean;
  error: string | null;
  reload(): Promise<void>;
  select(companyId: number): Promise<void>;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await endpoints.companies.list(api);
      setCompanies(response.data);
      setActiveCompanyId(response.meta.active_company_id);
    } catch {
      setError('Şirket listesi alınamadı.');
    } finally {
      setLoading(false);
    }
  }, []);

  /** Oturum açıldığında yükle, kapandığında temizle. */
  useEffect(() => {
    if (status === 'authenticated') {
      void reload();
      return;
    }

    if (status === 'unauthenticated') {
      setCompanies([]);
      setActiveCompanyId(null);
      setError(null);
    }
  }, [status, reload]);

  const select = useCallback(async (companyId: number) => {
    // Backend seçimi doğrular ve kaydeder; biz yalnızca sonucu yansıtırız.
    const selected = await endpoints.companies.select(api, companyId);
    setActiveCompanyId(selected.id);
  }, []);

  const activeCompany = useMemo(
    () => companies.find((company) => company.id === activeCompanyId) ?? null,
    [companies, activeCompanyId],
  );

  const value = useMemo<CompanyContextValue>(
    () => ({ companies, activeCompanyId, activeCompany, loading, error, reload, select }),
    [companies, activeCompanyId, activeCompany, loading, error, reload, select],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompanies(): CompanyContextValue {
  const context = useContext(CompanyContext);

  if (!context) {
    throw new Error('useCompanies, CompanyProvider içinde kullanılmalıdır.');
  }

  return context;
}
