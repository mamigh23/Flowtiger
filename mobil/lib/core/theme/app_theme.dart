import 'package:flutter/material.dart';

/// FlowTiger tasarım token'ları — web'deki tokens.css'in Dart karşılığı.
///
/// İki platform bağımsız uygulama kullanır ama AYNI ölçekleri paylaşır:
/// 4px aralık ölçeği, aynı yarıçaplar, aynı marka rengi. Ürün dili
/// böylece tutarlı kalır (§11).
class FtTokens {
  const FtTokens._();

  // Aralık — 4px ölçeği
  static const double space1 = 4;
  static const double space2 = 8;
  static const double space3 = 12;
  static const double space4 = 16;
  static const double space5 = 24;
  static const double space6 = 32;

  // Yarıçap
  static const double radiusSm = 4;
  static const double radiusMd = 8;
  static const double radiusLg = 12;

  // Marka
  static const Color primary = Color(0xFFB8460E);
  static const Color danger = Color(0xFFB3261E);

  static const double controlHeight = 48;
}

class AppTheme {
  const AppTheme._();

  static ThemeData light() => _base(Brightness.light);

  static ThemeData dark() => _base(Brightness.dark);

  static ThemeData _base(Brightness brightness) {
    final ColorScheme scheme = ColorScheme.fromSeed(
      seedColor: FtTokens.primary,
      brightness: brightness,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      inputDecorationTheme: InputDecorationTheme(
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(FtTokens.radiusMd),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: FtTokens.space3,
          vertical: FtTokens.space3,
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(FtTokens.controlHeight),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(FtTokens.radiusMd),
          ),
        ),
      ),
      // NOT: cardTheme burada BİLİNÇLİ olarak ayarlanmadı. ThemeData'nın
      // bu alanı Flutter sürümleri arasında CardTheme → CardThemeData
      // olarak tip değiştirdi; tema dosyasını sürüme bağlamak yerine
      // kart görünümü FtCard bileşeninde tanımlandı (widgets/ui.dart).
    );
  }
}
