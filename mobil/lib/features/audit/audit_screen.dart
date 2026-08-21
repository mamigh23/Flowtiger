import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../models/models.dart';
import '../../widgets/ui.dart';
import 'audit_controller.dart';
import 'audit_errors.dart';
import 'audit_format.dart';
import 'audit_labels.dart';

/// Denetim kayıtları.
///
/// SALT OKUNUR EKRAN. Tek uç GET /audit-logs; silme, düzenleme, dışa
/// aktarma düğmesi yoktur. Audit kaydı yalnızca domain işlemlerinin yan
/// etkisi olarak doğar — API üzerinden yazılabilseydi iz uydurmak mümkün
/// olurdu.
///
/// ARAMA / FİLTRE / SIRALAMA YOK. Uç yalnızca `page` ve `per_page`
/// tanıyor; başka bir parametre sessizce yok sayılır. Bir filtre kutusu
/// koymak, çalışmayan bir özelliği varmış gibi göstermek olurdu.
///
/// İSTEMCİDE YETKİ KARARI YOK (playbook §3.1). Uç owner'a özeldir
/// (AuditLogPolicy → Role::viewsAuditLogs()) ama ne bu ekranın girişi
/// role göre gizlenir ne de istek engellenir; backend 403 dönerse
/// açıklanır.
///
/// "GİRİŞ GEÇMİŞİ" BURADA YOKTUR ve vaat edilmez. login/logout gibi
/// kayıtların company_id'si NULL'dur; AuditLog modelindeki CompanyScope
/// onları bu uçtan tamamen dışarıda bırakır. Ekran yalnızca aktif
/// şirkette olan biteni gösterir.
///
/// AYRI DETAY ROTASI YOK. Backend'de tekil audit ucu yok; ayrı bir ekran
/// ancak listedeki nesneyi taşıyarak ya da uydurma bir istekle çalışırdı.
/// Ayrıntı satırın İÇİNDE açılır ve EK İSTEK YAPMAZ.
///
/// ALT GEZİNMEDE SEKMESİ YOK: beş sekme dolu ve altıncısında etiketler
/// sıkışırdı; üstelik denetim günlük bir iş değil, ara sıra bakılan bir
/// kayıt. Profil içinden açılır.
class AuditScreen extends ConsumerStatefulWidget {
  const AuditScreen({super.key});

  @override
  ConsumerState<AuditScreen> createState() => _AuditScreenState();
}

class _AuditScreenState extends ConsumerState<AuditScreen> {
  /// Açık olan tek ayrıntı; aynı anda birden fazlası açılmaz.
  int? _expanded;

  @override
  void initState() {
    super.initState();
    // build sırasında provider değiştirmek Riverpod'da hatadır.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(ref.read(auditListControllerProvider.notifier).load());
    });
  }

  /// Sayfa değişince açık panel kapanır: yeni sayfanın satırlarıyla
  /// ilgisiz bir ayrıntı açık kalmamalı.
  Future<void> _goTo(Future<void> Function() move) async {
    setState(() => _expanded = null);
    await move();
  }

  @override
  Widget build(BuildContext context) {
    final AuditListState state = ref.watch(auditListControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Denetim Geçmişi')),
      body: SafeArea(child: _body(state)),
    );
  }

  Widget _body(AuditListState state) {
    switch (state.status) {
      case AuditListStatus.loading:
        return const FtLoading();

      case AuditListStatus.error:
        return ListView(
          padding: const EdgeInsets.all(FtTokens.space4),
          children: <Widget>[
            // onRetry VERİLMEZ: FtErrorState kendi içinde de bir
            // "Tekrar dene" düğmesi çizer ve ikisi birden görünürdü.
            FtErrorState(message: auditErrorMessage(state.error)),
            const SizedBox(height: FtTokens.space4),
            FilledButton(
              onPressed: () =>
                  unawaited(ref.read(auditListControllerProvider.notifier).reload()),
              child: const Text('Tekrar dene'),
            ),
          ],
        );

      case AuditListStatus.ready:
        if (state.logs.isEmpty) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(FtTokens.space5),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  const Text('Henüz denetim kaydı yok.'),
                  const SizedBox(height: FtTokens.space2),
                  Text(
                    // "Giriş geçmişi" VAAT EDİLMEZ: o kayıtlar bu uçta
                    // hiç görünmez.
                    'Bu şirkette bir kayıt oluşturulduğunda ya da bir üyelik '
                    'değiştiğinde burada görünür.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          );
        }

        return Column(
          children: <Widget>[
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.all(FtTokens.space3),
                itemCount: state.logs.length,
                itemBuilder: (BuildContext context, int index) {
                  final AuditLog log = state.logs[index];

                  return _AuditRow(
                    log: log,
                    expanded: _expanded == log.id,
                    onToggle: () => setState(
                      () => _expanded = _expanded == log.id ? null : log.id,
                    ),
                  );
                },
              ),
            ),

            if (state.lastPage > 1)
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: FtTokens.space4,
                  vertical: FtTokens.space2,
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: <Widget>[
                    TextButton(
                      onPressed: state.hasPreviousPage
                          ? () => unawaited(
                                _goTo(
                                  ref
                                      .read(auditListControllerProvider.notifier)
                                      .previousPage,
                                ),
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
                                _goTo(
                                  ref
                                      .read(auditListControllerProvider.notifier)
                                      .nextPage,
                                ),
                              )
                          : null,
                      child: const Text('Sonraki'),
                    ),
                  ],
                ),
              ),
          ],
        );
    }
  }
}

/// Tek bir denetim kaydı.
///
/// Eksik alanlar için belirsizlik işareti konur, uydurma değer değil:
/// `actor` gelmeyen bir kayıtta "Sistem" yazmak doğrulanmamış bir
/// varsayım olurdu.
class _AuditRow extends StatelessWidget {
  const _AuditRow({
    required this.log,
    required this.expanded,
    required this.onToggle,
  });

  final AuditLog log;
  final bool expanded;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final TextTheme text = Theme.of(context).textTheme;

    final List<ChangeEntry> changes = describeChanges(log.oldValues, log.newValues);
    final List<MetadataEntry> metadata = visibleMetadata(log.metadata);

    final AuditableRef? auditable = log.auditable;

    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(bottom: FtTokens.space2),
      shape: RoundedRectangleBorder(
        side: BorderSide(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(FtTokens.radiusLg),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          FtTokens.space3,
          FtTokens.space2,
          FtTokens.space3,
          FtTokens.space3,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                Expanded(
                  // Tanınmayan kod uydurulmaz, ham hâliyle gösterilir.
                  child: Text(auditActionLabel(log.action), style: text.titleSmall),
                ),
                // Gösterilecek güvenli bir ayrıntı yoksa düğme HİÇ ÇIKMAZ.
                // Koşul burada yeniden yazılmaz: kural tek yerde durur.
                if (hasVisibleDetails(log))
                  TextButton(
                    key: Key('audit-toggle-${log.id}'),
                    onPressed: onToggle,
                    child: const Text('Ayrıntı'),
                  ),
              ],
            ),

            Row(
              children: <Widget>[
                Expanded(
                  // Aktör ÖZET gelir: yalnızca id ve name. `actor`
                  // nesnesi dökülmez, sadece adı okunur — e-posta
                  // backend'de zaten yok, modelde de yok.
                  child: Text(log.actor?.name ?? '—', style: text.bodySmall),
                ),
                Text(
                  auditable == null
                      ? '—'
                      : '${auditableTypeLabel(auditable.type)} #${auditable.id}',
                  style: text.bodySmall,
                ),
              ],
            ),
            const SizedBox(height: FtTokens.space1),

            Row(
              children: <Widget>[
                // IP, "bu işlem beklenmedik bir yerden mi yapıldı"
                // sorusunun cevabıdır ve audit'in asıl işlerinden biridir.
                // user_agent ise yanıtta hiç yoktur.
                Expanded(child: Text(log.ipAddress ?? '—', style: text.bodySmall)),
                Text(formatDateTime(log.createdAt) ?? '—', style: text.bodySmall),
              ],
            ),

            if (expanded)
              Padding(
                key: Key('audit-detail-${log.id}'),
                padding: const EdgeInsets.only(top: FtTokens.space3),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    for (final ChangeEntry change in changes)
                      _DetailLine(label: change.label, value: _changeText(change)),
                    for (final MetadataEntry entry in metadata)
                      _DetailLine(label: entry.label, value: entry.value),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  /// Oluşturma ve silme kayıtlarında SAHTE bir karşı taraf üretilmez:
  /// "— → Zeynep Kaya" satırı, olmayan bir eski değeri varmış gibi
  /// gösterirdi.
  static String _changeText(ChangeEntry change) {
    final String? from = change.from;
    final String? to = change.to;

    if (from != null && to != null) return '$from → $to';

    return to ?? from ?? '';
  }
}

class _DetailLine extends StatelessWidget {
  const _DetailLine({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: FtTokens.space1),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SizedBox(
            width: 140,
            child: Text(label, style: Theme.of(context).textTheme.bodySmall),
          ),
          Expanded(child: Text(value, style: Theme.of(context).textTheme.bodyMedium)),
        ],
      ),
    );
  }
}
