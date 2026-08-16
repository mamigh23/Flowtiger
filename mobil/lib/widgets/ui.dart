import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';

/// Foundation bileşenleri — web'deki components/ui karşılığı.
/// Kasıtlı olarak küçük: bir tasarım sistemi değil, ekranların ortak dili.

class FtLoading extends StatelessWidget {
  const FtLoading({super.key});

  @override
  Widget build(BuildContext context) => const Center(
        child: Padding(
          padding: EdgeInsets.all(FtTokens.space5),
          child: CircularProgressIndicator(),
        ),
      );
}

class FtErrorState extends StatelessWidget {
  const FtErrorState({required this.message, this.onRetry, super.key});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;

    return Container(
      padding: const EdgeInsets.all(FtTokens.space3),
      decoration: BoxDecoration(
        color: scheme.errorContainer,
        borderRadius: BorderRadius.circular(FtTokens.radiusMd),
      ),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Text(
              message,
              style: TextStyle(color: scheme.onErrorContainer),
            ),
          ),
          if (onRetry != null)
            TextButton(
              onPressed: onRetry,
              child: const Text('Tekrar dene'),
            ),
        ],
      ),
    );
  }
}

class FtCard extends StatelessWidget {
  const FtCard({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) => Card(
        elevation: 0,
        shape: RoundedRectangleBorder(
          side: BorderSide(color: Theme.of(context).colorScheme.outlineVariant),
          borderRadius: BorderRadius.circular(FtTokens.radiusLg),
        ),
        child: Padding(
          padding: const EdgeInsets.all(FtTokens.space4),
          child: child,
        ),
      );
}

/// Küçük etiket — rol, durum vb.
class FtBadge extends StatelessWidget {
  const FtBadge({required this.label, super.key});

  final String label;

  @override
  Widget build(BuildContext context) {
    final ColorScheme colors = Theme.of(context).colorScheme;

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: FtTokens.space2,
        vertical: FtTokens.space1,
      ),
      decoration: BoxDecoration(
        color: colors.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(FtTokens.radiusSm),
      ),
      child: Text(label, style: Theme.of(context).textTheme.labelSmall),
    );
  }
}

/// Tek bir sayının kartı.
///
/// `value` metni çağıran tarafından verilir; kart durum (yükleniyor,
/// yetki yok, hata) ayrımını bilmez — o karar controller'a aittir.
class FtStatCard extends StatelessWidget {
  const FtStatCard({
    required this.label,
    required this.value,
    this.loading = false,
    super.key,
  });

  final String label;
  final String value;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return FtCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(label, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: FtTokens.space2),
          if (loading)
            const SizedBox(
              height: 24,
              width: 24,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          else
            Text(value, style: Theme.of(context).textTheme.headlineSmall),
        ],
      ),
    );
  }
}
