import { Card } from '@/components/ui';

/**
 * Henüz yazılmamış ürün bölümleri için yer tutucu.
 *
 * Bilinçli olarak sahte veri ya da sahte tablo göstermez: olmayan bir
 * özelliği varmış gibi göstermek, hem kullanıcıyı hem sonraki
 * geliştiriciyi yanıltır.
 */
export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="ft-page">
      <header className="ft-page__header">
        <h1 className="ft-page__title">{title}</h1>
      </header>

      <Card>
        <div className="ft-empty">
          <p>{description}</p>
          <p className="ft-muted">Bu bölüm yakında kullanıma açılacak.</p>
        </div>
      </Card>
    </div>
  );
}
