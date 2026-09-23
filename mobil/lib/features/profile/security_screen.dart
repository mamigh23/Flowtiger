
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/ui.dart';
import '../audit/audit_labels.dart';
import 'profile_errors.dart';
import 'security_controller.dart';

class SecurityScreen extends ConsumerStatefulWidget {
  const SecurityScreen({super.key});

  @override
  ConsumerState<SecurityScreen> createState() => _SecurityScreenState();
}

class _SecurityScreenState extends ConsumerState<SecurityScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(ref.read(sessionsControllerProvider.notifier).load());
      unawaited(ref.read(securityEventsControllerProvider.notifier).load());
    });
  }

  @override
  Widget build(BuildContext context) {
    final SessionsState sessions = ref.watch(sessionsControllerProvider);
    final SecurityEventsState events = ref.watch(securityEventsControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Oturumlar ve güvenlik')),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            await Future.wait(<Future<void>>[
              ref.read(sessionsControllerProvider.notifier).load(),
              ref.read(securityEventsControllerProvider.notifier).reload(),
            ]);
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(FtTokens.space4),
            children: <Widget>[
              _SessionsCard(state: sessions),
              const SizedBox(height: FtTokens.space4),
              _SecurityEventsCard(state: events),
            ],
          ),
        ),
      ),
    );
  }
}

class _SessionsCard extends ConsumerWidget {
  const _SessionsCard({required this.state});

  final SessionsState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final List<Session> otherSessions =
        state.sessions.where((Session session) => !session.current).toList();

    return FtCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text('Oturumlar', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: FtTokens.space1),
                    Text(
                      'Bu hesapla açık olan cihaz ve tarayıcı oturumları.',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              if (otherSessions.isNotEmpty)
                TextButton(
                  onPressed: state.revokingOthers || state.revokingId != null
                      ? null
                      : () => unawaited(
                            ref.read(sessionsControllerProvider.notifier).revokeOthers(),
                          ),
                  child: state.revokingOthers
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Diğerlerini kapat'),
                ),
            ],
          ),
          const SizedBox(height: FtTokens.space3),
          if (state.status == SessionsStatus.loading) const FtLoading(),
          if (state.status == SessionsStatus.error) ...<Widget>[
            FtErrorState(message: profileErrorMessage(state.error)),
            const SizedBox(height: FtTokens.space3),
            FilledButton(
              onPressed: () =>
                  unawaited(ref.read(sessionsControllerProvider.notifier).load()),
              child: const Text('Tekrar dene'),
            ),
          ],
          if (state.status == SessionsStatus.ready && state.sessions.isEmpty)
            const Text('Aktif oturum bulunamadı.'),
          if (state.status == SessionsStatus.ready)
            for (final Session session in state.sessions)
              Padding(
                padding: const EdgeInsets.only(bottom: FtTokens.space2),
                child: _SessionTile(session: session),
              ),
        ],
      ),
    );
  }
}

class _SessionTile extends ConsumerWidget {
  const _SessionTile({required this.session});

  final Session session;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final SessionsState state = ref.watch(sessionsControllerProvider);

    return Container(
      padding: const EdgeInsets.all(FtTokens.space3),
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(FtTokens.radiusMd),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Icon(Icons.devices_other_outlined),
          const SizedBox(width: FtTokens.space3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Wrap(
                  spacing: FtTokens.space2,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: <Widget>[
                    Text(session.name, style: Theme.of(context).textTheme.titleSmall),
                    if (session.current) const FtBadge(label: 'Bu oturum'),
                  ],
                ),
                const SizedBox(height: FtTokens.space1),
                if (session.lastUsedAt != null)
                  Text(
                    'Son kullanım: ${formatDateTime(session.lastUsedAt) ?? '—'}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                if (session.createdAt != null)
                  Text(
                    'Oluşturulma: ${formatDateTime(session.createdAt) ?? '—'}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
              ],
            ),
          ),
          if (!session.current)
            TextButton(
              onPressed: state.revokingId == session.id || state.revokingOthers
                  ? null
                  : () => unawaited(
                        ref.read(sessionsControllerProvider.notifier).revokeSession(session.id),
                      ),
              child: state.revokingId == session.id
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Kapat'),
            ),
        ],
      ),
    );
  }
}

class _SecurityEventsCard extends ConsumerWidget {
  const _SecurityEventsCard({required this.state});

  final SecurityEventsState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FtCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text('Güvenlik hareketleri', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: FtTokens.space1),
          Text(
            state.total == 0
                ? 'Hesabınıza ait giriş, parola ve oturum olayları.'
                : '${state.total} kayıt',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: FtTokens.space3),
          if (state.status == SecurityEventsStatus.loading) const FtLoading(),
          if (state.status == SecurityEventsStatus.error) ...<Widget>[
            FtErrorState(message: profileErrorMessage(state.error)),
            const SizedBox(height: FtTokens.space3),
            FilledButton(
              onPressed: () => unawaited(
                ref.read(securityEventsControllerProvider.notifier).reload(),
              ),
              child: const Text('Tekrar dene'),
            ),
          ],
          if (state.status == SecurityEventsStatus.ready && state.events.isEmpty)
            const Text('Henüz güvenlik hareketi yok.'),
          if (state.status == SecurityEventsStatus.ready)
            for (final SecurityEvent event in state.events)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.shield_outlined),
                title: Text(auditActionLabel(event.action)),
                subtitle: Text(
                  [
                    if (event.createdAt != null) formatDateTime(event.createdAt) ?? '—',
                    if (event.ipAddress != null) 'IP: ${event.ipAddress}',
                  ].join(' · '),
                ),
              ),
          if (state.status == SecurityEventsStatus.ready && state.lastPage > 1)
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: <Widget>[
                TextButton(
                  onPressed: state.hasPreviousPage
                      ? () => unawaited(
                            ref
                                .read(securityEventsControllerProvider.notifier)
                                .previousPage(),
                          )
                      : null,
                  child: const Text('Önceki'),
                ),
                Text(
                  'Sayfa ${state.currentPage} / ${state.lastPage}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                TextButton(
                  onPressed: state.hasNextPage
                      ? () => unawaited(
                            ref
                                .read(securityEventsControllerProvider.notifier)
                                .nextPage(),
                          )
                      : null,
                  child: const Text('Sonraki'),
                ),
              ],
            ),
        ],
      ),
    );
  }
}
