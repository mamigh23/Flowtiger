import { useNavigate } from 'react-router-dom';
import { api, endpoints } from '@/lib/api';
import type { FinanceDirection, FinanceEntryInput } from '@/types/api';
import { FinanceEntryForm, emptyFinanceFormValues } from './FinanceEntryForm';

/**
 * Yeni gelir / yeni gider.
 *
 * YÖN ROTADAN GELİR, prop olarak. URL'den ayrıştırılmıyor: iki ayrı rota
 * iki ayrı bileşen örneği kurar ve yön bir daha sorgulanmaz. Ayrıştırma
 * olsaydı tanınmayan bir segment için "yön nedir?" sorusuna bir varsayılan
 * uydurmak gerekirdi.
 *
 * Kayıt oluşunca AYRINTIYA gidilir: kullanıcı sunucunun hesabını (net,
 * KDV, brüt ve hesabın nasıl yapıldığını) orada görür. Listeye dönmek,
 * kullanıcıyı kendi kaydının sonucunu görmeden bırakırdı.
 */
export function FinanceEntryCreatePage({ direction }: { direction: FinanceDirection }) {
  const navigate = useNavigate();

  async function handleSubmit(values: FinanceEntryInput): Promise<void> {
    const created = await endpoints.financeEntries.create(api, values);
    navigate(`/app/finance/${created.id}`, { replace: true });
  }

  return (
    <FinanceEntryForm
      // Başlık açıkça yazılır: `toLocaleLowerCase` Node'un ICU derlemesine
      // bağlıdır ve Türkçe küçültme her ortamda aynı davranmayabilir.
      title={direction === 'in' ? 'Yeni gelir' : 'Yeni gider'}
      submitLabel="Kaydet"
      // Yön form açılmadan ÖNCE seçildi; ikinci kez sorulmaz.
      directionEditable={false}
      initialValues={emptyFinanceFormValues(direction)}
      cancelTo="/app/finance"
      onSubmit={handleSubmit}
    />
  );
}
