import 'package:material_ui/material_ui.dart';

import '../../app/theme.dart';
import '../../data/admin_repository.dart';
import '../../data/api_client.dart';
import '../profile/payment_amount.dart';
import 'dues_summary.dart';

/// What to prefill: the balance less any card checkout already in progress
/// (never below zero).
int suggestedPaymentCents(DuesAssessment dues) {
  final cents = dues.balanceCents - dues.pendingCheckoutCents;
  return cents > 0 ? cents : 0;
}

/// Opens the "Record payment" sheet for [dues]. Returns the cents recorded,
/// or null when the admin closed it without saving.
Future<int?> showRecordPaymentSheet(
  BuildContext context, {
  required AdminRepository admin,
  required DuesAssessment dues,
  required String memberLabel,
  required String description,
}) => showModalBottomSheet<int>(
  context: context,
  isScrollControlled: true,
  useSafeArea: true,
  showDragHandle: true,
  backgroundColor: Brand.background,
  builder: (_) => RecordPaymentSheet(
    admin: admin,
    dues: dues,
    memberLabel: memberLabel,
    description: description,
  ),
);

/// Records a cash, Venmo, Zelle, check or other payment, or a volunteer or
/// waived credit (which needs a note), against one player's dues. Each new payment gets a fresh id; tapping Save again after
/// a network error resends the same id and body, so it's recorded once.
class RecordPaymentSheet extends StatefulWidget {
  const RecordPaymentSheet({
    super.key,
    required this.admin,
    required this.dues,
    required this.memberLabel,
    required this.description,
    this.newId,
  });

  final AdminRepository admin;
  final DuesAssessment dues;
  final String memberLabel, description;

  /// Payment id generator; defaults to a random UUID.
  final String Function()? newId;

  @override
  State<RecordPaymentSheet> createState() => _RecordPaymentSheetState();
}

class _RecordPaymentSheetState extends State<RecordPaymentSheet> {
  late final amount = TextEditingController(
    text: switch (suggestedPaymentCents(widget.dues)) {
      0 => '',
      final cents => centsToInput(cents),
    },
  );
  final note = TextEditingController();
  late final ids = PaymentIdempotency(newId: widget.newId);
  var method = ManualPaymentMethod.cash;
  String? error;

  /// "Say what they did" when a credit has no note; shown on the field.
  String? noteError;
  bool busy = false;

  @override
  void dispose() {
    amount.dispose();
    note.dispose();
    super.dispose();
  }

  Future<void> save() async {
    final balance = widget.dues.balanceCents;
    final cents = parseDollars(amount.text);
    if (cents == null || cents <= 0) {
      setState(() => error = 'Enter an amount, like 25.00.');
      return;
    }
    if (cents > balance) {
      setState(
        () => error = 'The most you can record is ${formatCents(balance)}.',
      );
      return;
    }
    final text = note.text.trim();
    if (method.requiresNote && text.isEmpty) {
      setState(() {
        error = null;
        noteError = method == ManualPaymentMethod.volunteer
            ? 'Add a note saying what they did.'
            : 'Add a note saying why it’s waived.';
      });
      return;
    }
    final payment = ids.payment(
      PaymentDraft(
        amountCents: cents,
        method: method,
        note: text.isEmpty ? null : text,
      ),
    );
    setState(() {
      busy = true;
      error = null;
      noteError = null;
    });
    String? failure;
    try {
      await widget.admin.recordPayment(widget.dues.id, payment);
      ids.settled();
    } on ApiException catch (e) {
      if (e.statusCode < 500) ids.settled();
      failure = switch (e.statusCode) {
        409 => e.error ?? 'That’s more than the balance.',
        400 => e.error ?? 'Check the amount and try again.',
        401 => 'Your session ended. Sign in again.',
        403 => 'Only club admins can record payments.',
        404 => 'These dues no longer exist. Close this and refresh.',
        _ =>
          'The club server had a problem. Tap Save to try again; '
              'it won’t be recorded twice.',
      };
    } on Exception {
      // The request may have reached the server: keep the same id.
      failure =
          'Couldn’t reach the club server. Check your connection and tap '
          'Save again; it won’t be recorded twice.';
    }
    if (!mounted) return;
    if (failure == null) {
      Navigator.of(context).pop(cents);
      return;
    }
    setState(() {
      busy = false;
      error = failure;
    });
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final dues = widget.dues;
    Widget chip(ManualPaymentMethod m) => ChoiceChip(
      label: Text(m.label),
      selected: method == m,
      onSelected: busy
          ? null
          : (_) => setState(() {
              method = m;
              noteError = null;
            }),
    );
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(
              header: true,
              child: Text('RECORD PAYMENT', style: displayStyle(24)),
            ),
            const SizedBox(height: 6),
            Text(
              '${widget.memberLabel} · ${widget.description}',
              style: textTheme.bodyMedium,
            ),
            const SizedBox(height: 2),
            Text(
              'Balance ${formatCents(dues.balanceCents)}',
              style: textTheme.bodySmall?.copyWith(
                fontFeatures: tabularFigures,
              ),
            ),
            if (dues.hasPendingCheckout)
              Text(
                'A card checkout of ${formatCents(dues.pendingCheckoutCents)} '
                'is in progress.',
                style: textTheme.bodySmall,
              ),
            const SizedBox(height: 16),
            TextField(
              key: const Key('payment-amount'),
              controller: amount,
              enabled: !busy,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: 'Amount',
                prefixText: r'$',
              ),
            ),
            const SizedBox(height: 16),
            Text('Method', style: textTheme.labelLarge),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [for (final m in ManualPaymentMethod.money) chip(m)],
            ),
            const SizedBox(height: 12),
            Text('Not money: Volunteered · Waived', style: textTheme.bodySmall),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [for (final m in ManualPaymentMethod.credits) chip(m)],
            ),
            const SizedBox(height: 16),
            TextField(
              key: const Key('payment-note'),
              controller: note,
              enabled: !busy,
              maxLength: 500,
              minLines: 1,
              maxLines: 3,
              onChanged: noteError == null
                  ? null
                  : (_) => setState(() => noteError = null),
              decoration: InputDecoration(
                labelText: method.requiresNote ? 'Note' : 'Note (optional)',
                hintText: method.noteHint,
                errorText: noteError,
              ),
            ),
            if (error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Semantics(
                  liveRegion: true,
                  child: Text(
                    error!,
                    style: textTheme.bodyMedium?.copyWith(color: Brand.danger),
                  ),
                ),
              ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: busy ? null : () => Navigator.of(context).pop(),
                  child: const Text('CANCEL'),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  key: const Key('save-payment'),
                  onPressed: busy ? null : save,
                  child: Text(busy ? 'SAVING…' : 'SAVE'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
