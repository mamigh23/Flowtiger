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
