import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api, endpoints, toUserMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth/AuthContext';
import type { Company } from '@/types/api';

/**
 * Aktif şirket durumu.
 *
 * KRİTİK KURAL (playbook §3.1): aktif şirket İSTEMCİDE SEÇİLMEZ.
 *
 * Buradaki değer yalnızca bir ÖNBELLEKTİR — backend'in söylediğinin
 * kopyası. Tenant kararı her istekte backend'de yeniden verilir
 * (company.context middleware'i üyeliği yeniden doğrular). İstemci
 * hiçbir istekte active_company_id göndermez; şirket değiştirmek için
 * yalnızca select ucu çağrılır.
 */
export type CompanyStatus = 'idle' | 'loading' | 'ready' | 'error';

interface CompanyContextValue {
  companies: Company[];
  activeCompanyId: number | null;
  activeCompany: Company | null;
  status: CompanyStatus;
  error: string | null;
  /** Seçim süren şirketin kimliği (kart bazında disable için). */
  selectingId: number | null;
  selectError: string | null;
  reload(): Promise<void>;
  select(companyId: number): Promise<void>;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { status: authStatus } = useAuth();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<number | null>(null);
  const [status, setStatus] = useState<CompanyStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<number | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);

  /**
   * Otomatik seçim yalnızca BİR KEZ denenir.
   *
   * Deneme başarısız olursa (ör. 403) tekrar tekrar denemek sonsuz
   * istek döngüsü yaratırdı; kullanıcı o durumda seçim ekranında
   * hatayı görür.
   */
  const autoSelectAttempted = useRef(false);

  const reload = useCallback(async () => {
    setStatus('loading');
    setError(null);

    try {
      const response = await endpoints.companies.list(api);
      setCompanies(response.data);
      setActiveCompanyId(response.meta.active_company_id);
      setStatus('ready');
    } catch (cause) {
      // 401 ise ApiClient token'ı zaten düşürdü; AuthContext oturumu
      // kapatacak. Burada yalnızca ekranın kilitlenmemesi sağlanır.
      setStatus('error');
      setError(toUserMessage(cause));
    }
  }, []);

  const select = useCallback(async (companyId: number) => {
    setSelectingId(companyId);
    setSelectError(null);

    try {
      // Backend seçimi doğrular ve kaydeder; biz yalnızca sonucu
      // yansıtırız.
      const selected = await endpoints.companies.select(api, companyId);
      setActiveCompanyId(selected.id);
    } catch (cause) {
      setSelectError(toUserMessage(cause));
      throw cause;
    } finally {
      setSelectingId(null);
    }
  }, []);

  /** Oturum açıldığında yükle, kapandığında temizle. */
  useEffect(() => {
    if (authStatus === 'authenticated') {
      void reload();
      return;
    }

    if (authStatus === 'unauthenticated') {
      setCompanies([]);
      setActiveCompanyId(null);
      setStatus('idle');
      setError(null);
      setSelectError(null);
      autoSelectAttempted.current = false;
    }
  }, [authStatus, reload]);

  /**
   * Tek şirketi olan kullanıcıya seçim ekranı gösterilmez.
   *
   * Backend zaten tek şirkette otomatik seçime izin veriyor; istemci
   * de kullanıcıyı tek seçenekli bir ekranda bekletmemeli.
   */
  useEffect(() => {
    if (status !== 'ready') return;
    if (activeCompanyId !== null) return;
    if (companies.length !== 1) return;
    if (autoSelectAttempted.current) return;

    autoSelectAttempted.current = true;

    void select(companies[0]!.id).catch(() => {
      // Hata seçim ekranında gösterilir.
    });
  }, [status, activeCompanyId, companies, select]);

  const activeCompany = useMemo(
    () => companies.find((company) => company.id === activeCompanyId) ?? null,
    [companies, activeCompanyId],
  );

  const value = useMemo<CompanyContextValue>(
    () => ({
      companies,
      activeCompanyId,
      activeCompany,
      status,
      error,
      selectingId,
      selectError,
      reload,
      select,
    }),
    [companies, activeCompanyId, activeCompany, status, error, selectingId, selectError, reload, select],
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
