import 'package:material_ui/material_ui.dart';

import '../../app/deep_links.dart';
import '../../app/theme.dart';
import '../../data/api_client.dart';
import '../../data/member_repository.dart';
import '../../shared/widgets.dart';
import '../profile/payment_amount.dart';

/// One of the member's dues, where Pay lives.
String duesLocation(String id) =>
    '$profilePath/dues/${Uri.encodeComponent(id)}';

/// "$150.00 due" or "All paid up", for the member's dues together.
String duesBalanceLine(Iterable<DuesAssessment> items) {
  final owed = items.fold(
    0,
    (sum, d) => sum + (d.balanceCents > 0 ? d.balanceCents : 0),
  );
  return owed > 0 ? '${formatCents(owed)} due' : 'All paid up';
}

/// Why the dues list didn't load. A 404 means dues are switched off on the
/// API, which isn't an error to retry.
class DuesLoadError extends StatelessWidget {
  const DuesLoadError({super.key, required this.error, required this.onRetry});
  final Object? error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final error = this.error;
    if (error is ApiException && error.statusCode == 404) {
      return const StatusPanel(message: 'Dues aren’t available yet.');
    }
    return StatusPanel(
      message: 'Couldn’t load your dues.',
      action: FilledButton(onPressed: onRetry, child: const Text('RETRY')),
    );
  }
}

/// How Stripe Checkout ended, after `claymores://dues?checkout=...`.
class CheckoutBanner extends StatelessWidget {
  const CheckoutBanner({super.key, required this.checkout, this.onDismiss});
  final CheckoutReturn checkout;
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: Semantics(
      liveRegion: true,
      child: Panel(
        featured: true,
        padding: const EdgeInsets.fromLTRB(16, 8, 4, 8),
        child: Row(
          children: [
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text(
                  checkout == CheckoutReturn.returned
                      ? 'Thanks — payment submitted. Your balance updates '
                            'after Stripe confirms.'
                      : 'Checkout cancelled. You weren’t charged.',
                ),
              ),
            ),
            if (onDismiss != null)
              IconButton(
                key: const Key('dismiss-checkout'),
                tooltip: 'Dismiss',
                icon: const Icon(Icons.close, color: Brand.secondary),
                onPressed: onDismiss,
              ),
          ],
        ),
      ),
    ),
  );
}

/// One dues item: "$100.00 due · due Mar 1", then "Paid $50.00 of
/// $150.00" once something is paid; "Paid in full" when settled.
class DuesTile extends StatelessWidget {
  const DuesTile({super.key, required this.dues, this.onTap});
  final DuesAssessment dues;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final localizations = MaterialLocalizations.of(context);
    final small = textTheme.bodySmall?.copyWith(fontFeatures: tabularFigures);
    final settled = dues.settled;
    final status = settled
        ? 'Paid in full'
        : [
            '${formatCents(dues.balanceCents)} due',
            if (dues.dueDate != null)
              'due ${localizations.formatShortMonthDay(dues.dueDate!)}',
          ].join(' · ');
    return Panel(
      padding: EdgeInsets.zero,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            dues.description,
                            style: textTheme.titleMedium,
                          ),
                        ),
                        if (settled)
                          Text(
                            'PAID',
                            style: textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      status,
                      style: textTheme.bodyMedium?.copyWith(
                        fontFeatures: tabularFigures,
                        fontWeight: settled ? null : FontWeight.w700,
                      ),
                    ),
                    if (!settled && dues.paidCents > 0) ...[
                      const SizedBox(height: 2),
                      Text(
                        'Paid ${formatCents(dues.paidCents)} of '
                        '${formatCents(dues.amountCents)}',
                        style: small,
                      ),
                    ],
                    if (dues.creditedCents > 0) ...[
                      const SizedBox(height: 2),
                      Text(
                        'Includes ${formatCents(dues.creditedCents)} credited '
                        '(volunteer/waived)',
                        style: small,
                      ),
                    ],
                    if (dues.hasPendingCheckout) ...[
                      const SizedBox(height: 6),
                      Text(
                        'Checkout of ${formatCents(dues.pendingCheckoutCents)} '
                        'in progress',
                        style: textTheme.bodySmall?.copyWith(color: Brand.ink),
                      ),
                    ],
                  ],
                ),
              ),
              if (onTap != null) ...[
                const SizedBox(width: 8),
                const ExcludeSemantics(
                  child: Icon(Icons.chevron_right, color: Brand.secondary),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
