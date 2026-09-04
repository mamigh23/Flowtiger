import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Button, Card, ErrorState } from '@/components/ui';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Uygulama genelinde RENDER sırasında atılan istisnalara karşı son
 * savunma hattı (P1-04).
 *
 * NEDEN SINIF BİLEŞENİ:
 * React'ın Error Boundary mekanizması yalnızca `getDerivedStateFromError`
 * ve `componentDidCatch` yaşam döngüsü metotlarıyla kurulur; bunların bir
 * hook karşılığı yoktur. Projenin geri kalanı fonksiyon bileşeni
 * kullansa da, bu TEK bileşen bilinçli olarak sınıf tabanlıdır — React'ın
 * kendisinin dayattığı bir zorunluluk, bir stil tercihi değil.
 *
 * NE YAKALAR / NE YAKALAMAZ (React'ın kendi sınırı; burada genişletilmez):
 * yalnızca alt ağacın RENDER'ı, yaşam döngüsü metotları ya da
 * constructor'ı sırasında atılan istisnaları yakalar. Event handler'lar,
 * `useEffect` içi kod ve asenkron işler (fetch/promise) bu kapsamın
 * DIŞINDADIR — onlar zaten uygulamanın kendi try/catch + ApiError akışıyla
 * ele alınıyor (bkz. lib/api/client.ts). Bu bileşenin tek görevi, o
 * akışların YAKALAYAMADIĞI beklenmedik render hatalarında beyaz ekran
 * yerine güvenli bir arayüz göstermektir.
 *
 * NEREYE YERLEŞTİRİLDİ (App.tsx):
 * AuthProvider/CompanyProvider'ın bile DIŞINA sarılır. Render sırasında
 * atılan bir istisna provider'ların KENDİSİNDE de oluşabilir; boundary
 * yalnızca <Routes>'u sarsaydı o durumda yine beyaz ekran kalırdı.
 *
 * PRODUCTION'DA SIZINTI YOK:
 * State yalnızca bir `hasError` boolean'ı taşır — istisnanın kendisi,
 * mesajı ya da stack'i STATE'E HİÇ ALINMAZ ve kullanıcıya giden JSX'in
 * hiçbir yerinde kullanılmaz. `componentDidCatch` ayrıntıyı yalnızca
 * `console.error`'a yazar (React zaten kendiliğinden aynısını yapardı);
 * kullanıcıya giden TEK şey sabit, nötr bir Türkçe metindir. İleride bir
 * hata raporlama servisi (ör. Sentry) eklenirse tek değişecek yer burasıdır.
 *
 * RETRY/RESET GÜVENLİ Mİ:
 * "Tekrar dene" yalnızca `hasError`'ı `false`'a çeker. Hata oluştuğunda
 * React, çöken alt ağacı ZATEN unmount etmiştir (boundary o an fallback
 * render ediyordu); `hasError` tekrar `false` olduğunda alt ağaç SIFIRDAN
 * mount edilir — eski, bozuk bileşen örneklerinden hiçbiri hayatta kalmaz.
 * Sayfayı yeniden yüklemek (`window.location.reload()`) YOKTUR: token
 * bellekte (tokenStorage) React ağacının DIŞINDA yaşadığı için oturum
 * kaybolmaz, yalnızca arayüz temiz bir başlangıç yapar.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Teşhis için konsola gider; kullanıcıya giden yanıta hiçbir
    // şekilde karışmaz (bkz. sınıf docblock'u — "PRODUCTION'DA SIZINTI YOK").
    console.error('Beklenmeyen render hatası yakalandı:', error, info.componentStack);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="ft-auth">
        <Card className="ft-auth__card">
          <div className="ft-stack">
            <h1 className="ft-auth__title">Bir şeyler ters gitti.</h1>
            <ErrorState message="Beklenmeyen bir hata oluştu. Aşağıdaki düğmeyle tekrar deneyebilirsiniz." />
            <Button type="button" onClick={this.handleRetry}>
              Tekrar dene
            </Button>
          </div>
        </Card>
      </div>
    );
  }
}
