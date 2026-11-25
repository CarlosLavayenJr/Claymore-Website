import 'package:material_ui/material_ui.dart';

import '../../app/theme.dart';
import '../../data/admin_repository.dart';
import '../../data/api_client.dart';
import '../../shared/widgets.dart';
import '../profile/payment_amount.dart';
import 'record_payment_sheet.dart';

/// Opens one player's dues from the admin summary. [onChanged] runs after
/// a payment is recorded, edited or undone, so the summary can refresh.
Future<void> showPlayerDues(
  BuildContext context, {
  required AdminRepository admin,
  required DuesAssessment dues,
  required String memberLabel,
  required String description,
  required VoidCallback onChanged,
}) => Navigator.of(context).push(
  MaterialPageRoute<void>(
    builder: (_) => PlayerDuesPage(
      admin: admin,
      dues: dues,
      memberLabel: memberLabel,
      description: description,
      onChanged: onChanged,
    ),
  ),
);

/// One player's dues for an admin: the balance, every payment (undone ones
/// crossed out, with who undid them and why) and their notes. Admins can
/// record a payment, edit a note, or undo a payment.
class PlayerDuesPage extends StatefulWidget {
  const PlayerDuesPage({
    super.key,
    required this.admin,
    required this.dues,
    required this.memberLabel,
    required this.description,
    this.onChanged,
  });

  final AdminRepository admin;

  /// The assessment as the summary had it; shown until the detail loads.
  final DuesAssessment dues;
  final String memberLabel, description;
  final VoidCallback? onChanged;

  @override
  State<PlayerDuesPage> createState() => _PlayerDuesPageState();
}

class _PlayerDuesPageState extends State<PlayerDuesPage> {
  late Future<DuesDetail> detail;

  @override
  void initState() {
    super.initState();
    load();
  }

  void load() {
    detail = widget.admin.duesDetail(widget.dues.id);
  }

  Future<void> refresh() async {
    setState(load);
    await detail.then<void>((_) {}, onError: (Object _) {});
  }

  void changed(String message) {
    widget.onChanged?.call();
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
    setState(load);
  }

  Future<void> record(DuesAssessment dues) async {
    final cents = await showRecordPaymentSheet(
      context,
      admin: widget.admin,
      dues: dues,
      memberLabel: widget.memberLabel,
      description: widget.description,
    );
    if (cents == null || !mounted) return;
    changed('Recorded ${formatCents(cents)} for ${widget.memberLabel}.');
  }

  Future<void> remove(DuesAssessment dues) async {
    final yes =
        await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: Text('Remove these dues for ${widget.memberLabel}?'),
            content: Text(
              '${widget.description} · ${formatCents(dues.amountCents)}. '
              'Nothing has been paid. Automatic and “everyone” dues won’t '
              'add it back.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: const Text('CANCEL'),
              ),
              TextButton(
                key: const Key('confirm-remove-dues'),
                style: TextButton.styleFrom(foregroundColor: Brand.danger),
                onPressed: () => Navigator.of(context).pop(true),
                child: const Text('REMOVE'),
              ),
            ],
          ),
        ) ??
        false;
    if (!yes || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    String message;
    var removed = false;
    try {
      await widget.admin.removeDues(dues.id);
      removed = true;
      message = 'Removed ${widget.description} for ${widget.memberLabel}.';
    } on ApiException catch (e) {
      message = e.statusCode == 409
          ? (e.error ?? 'Something was paid, so these dues can’t be removed.')
          : 'Couldn’t remove these dues. Try again.';
    } on Exception {
      message = 'Couldn’t reach the club server. Try again.';
    }
    if (removed) {
      widget.onChanged?.call();
      navigator.pop();
    } else if (mounted) {
      setState(load);
    }
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> editNote(DuesPayment payment) async {
    final message = await showDialog<String>(
      context: context,
      builder: (_) => _EditNoteDialog(
        payment: payment,
        save: (note) =>
            widget.admin.editPaymentNote(widget.dues.id, payment.id, note),
      ),
    );
    if (message != null && mounted) changed(message);
  }

  Future<void> undo(DuesPayment payment) async {
    final message = await showDialog<String>(
      context: context,
      builder: (_) => _UndoPaymentDialog(
        payment: payment,
        memberLabel: widget.memberLabel,
        undo: (reason) =>
            widget.admin.voidPayment(widget.dues.id, payment.id, reason),
      ),
    );
    if (message != null && mounted) changed(message);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('PLAYER DUES')),
    body: SafeArea(
      top: false,
      child: ContentWidth(
        child: FutureBuilder<DuesDetail>(
          future: detail,
          builder: (context, snapshot) {
            final loading = snapshot.connectionState != ConnectionState.done;
            final data = loading ? null : snapshot.data;
            final dues = data?.assessment ?? widget.dues;
            return RefreshIndicator(
              onRefresh: refresh,
              child: PageList(
                children: [
                  _Summary(
                    dues: dues,
                    memberLabel: widget.memberLabel,
                    description: widget.description,
                    onRecord: dues.balanceCents > 0 && !loading
                        ? () => record(dues)
                        : null,
                    // As on the website: only dues with nothing paid.
                    onRemove:
                        !loading &&
                            dues.paidCents == 0 &&
                            !dues.hasPendingCheckout
                        ? () => remove(dues)
                        : null,
                  ),
                  const SizedBox(height: 24),
                  const SectionHeading('PAYMENTS'),
                  if (loading)
                    const Padding(
                      padding: EdgeInsets.all(24),
                      child: Center(child: CircularProgressIndicator()),
                    )
                  else if (snapshot.hasError || data == null)
                    StatusPanel(
                      message: 'Couldn’t load the payment history.',
                      detail: 'Check your connection and try again.',
                      action: FilledButton(
                        onPressed: () => setState(load),
                        child: const Text('RETRY'),
                      ),
                    )
                  else if (data.payments.isEmpty)
                    const StatusPanel(message: 'No payments recorded yet.')
                  else
                    Panel(
                      padding: EdgeInsets.zero,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          for (final (i, payment) in data.payments.indexed)
                            _PaymentRow(
                              payment: payment,
                              first: i == 0,
                              onEditNote: () => editNote(payment),
                              onUndo: () => undo(payment),
                            ),
                        ],
                      ),
                    ),
                ],
              ),
            );
          },
        ),
      ),
    ),
  );
}

class _Summary extends StatelessWidget {
  const _Summary({
    required this.dues,
    required this.memberLabel,
    required this.description,
    required this.onRecord,
    this.onRemove,
  });

  final DuesAssessment dues;
  final String memberLabel, description;
  final VoidCallback? onRecord;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final small = textTheme.bodySmall?.copyWith(fontFeatures: tabularFigures);
    final owes = dues.balanceCents > 0;
    return Panel(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          BrandHeader(eyebrow: description, title: memberLabel, titleSize: 22),
          const SizedBox(height: 14),
          Text(
            owes ? '${formatCents(dues.balanceCents)} due' : 'Paid in full',
            key: const Key('player-balance'),
            style: textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w700,
              fontFeatures: tabularFigures,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            'Paid ${formatCents(dues.paidCents)} of '
            '${formatCents(dues.amountCents)}',
            style: small,
          ),
          if (dues.creditedCents > 0)
            Text(
              'Includes ${formatCents(dues.creditedCents)} credited '
              '(volunteer/waived)',
              style: small,
            ),
          if (dues.hasPendingCheckout)
            Text(
              'Card checkout of ${formatCents(dues.pendingCheckoutCents)} in '
              'progress',
              style: small,
            ),
          if (onRecord != null) ...[
            const SizedBox(height: 16),
            FilledButton(
              key: const Key('record-payment'),
              onPressed: onRecord,
              child: const Text('RECORD A PAYMENT'),
            ),
          ],
          if (onRemove != null)
            TextButton(
              key: const Key('remove-dues'),
              style: TextButton.styleFrom(
                foregroundColor: Brand.danger,
                padding: EdgeInsets.zero,
              ),
              onPressed: onRemove,
              child: const Text('REMOVE THESE DUES'),
            ),
        ],
      ),
    );
  }
}

class _PaymentRow extends StatelessWidget {
  const _PaymentRow({
    required this.payment,
    required this.first,
    required this.onEditNote,
    required this.onUndo,
  });

  final DuesPayment payment;
  final bool first;
  final VoidCallback onEditNote, onUndo;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final localizations = MaterialLocalizations.of(context);
    final voided = payment.voided;
    final muted = voided ? Brand.secondary : Brand.ink;
    final strike = voided ? TextDecoration.lineThrough : null;
    final meta = [
      payment.methodLabel ?? 'Payment',
      if (payment.recordedAt != null)
        localizations.formatMediumDate(payment.recordedAt!.toLocal()),
    ].join(' · ');
    final amount = formatCents(payment.amountCents);
    return DecoratedBox(
      decoration: BoxDecoration(
        border: first
            ? null
            : const Border(top: BorderSide(color: Brand.divider)),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Semantics(
              label: voided ? '$amount, $meta, undone' : null,
              excludeSemantics: voided,
              child: Row(
                children: [
                  Text(
                    amount,
                    style: textTheme.titleMedium?.copyWith(
                      fontFeatures: tabularFigures,
                      color: muted,
                      decoration: strike,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      meta,
                      style: textTheme.bodySmall?.copyWith(decoration: strike),
                    ),
                  ),
                ],
              ),
            ),
            if (payment.note != null) ...[
              const SizedBox(height: 4),
              Text(
                payment.note!,
                style: textTheme.bodyMedium?.copyWith(color: muted),
              ),
            ],
            if (voided) ...[
              const SizedBox(height: 4),
              Text(
                [
                      'Undone',
                      if (payment.voidedBy != null) 'by ${payment.voidedBy}',
                    ].join(' ') +
                    (payment.voidReason == null
                        ? ''
                        : ': ${payment.voidReason}'),
                style: textTheme.bodySmall?.copyWith(color: Brand.danger),
              ),
              const SizedBox(height: 4),
            ] else
              Wrap(
                spacing: 4,
                children: [
                  TextButton(
                    onPressed: onEditNote,
                    child: Text(
                      'EDIT NOTE',
                      semanticsLabel: 'Edit note on the $amount payment',
                    ),
                  ),
                  TextButton(
                    style: destructiveButtonStyle,
                    onPressed: onUndo,
                    child: Text(
                      'UNDO PAYMENT',
                      semanticsLabel: 'Undo the $amount payment',
                    ),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

/// What to tell the admin when the API refused an edit or undo (other than
/// a 400, which the dialog shows inline).
String _failure(ApiException e, {required String conflict}) =>
    switch (e.statusCode) {
      409 => e.error ?? conflict,
      404 => 'That payment no longer exists.',
      403 => 'Only club admins can do that.',
      401 => 'Your session ended. Sign in again.',
      _ => 'The club server had a problem. Try again in a minute.',
    };

/// Edits a payment's note. Pops with a message for the page (saved, or
/// the payment was undone meanwhile); a 400 stays open with the reason.
class _EditNoteDialog extends StatefulWidget {
  const _EditNoteDialog({required this.payment, required this.save});
  final DuesPayment payment;
  final Future<void> Function(String note) save;

  @override
  State<_EditNoteDialog> createState() => _EditNoteDialogState();
}

class _EditNoteDialogState extends State<_EditNoteDialog> {
  late final note = TextEditingController(text: widget.payment.note ?? '');
  String? error;
  bool busy = false;

  @override
  void dispose() {
    note.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    final text = note.text.trim();
    if (widget.payment.isCredit && text.isEmpty) {
      setState(
        () => error = widget.payment.method == 'volunteer'
            ? 'A volunteer credit needs a note saying what they did.'
            : 'A waived credit needs a note saying why.',
      );
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    final navigator = Navigator.of(context);
    try {
      await widget.save(text);
      navigator.pop('Note saved.');
    } on ApiException catch (e) {
      if (e.statusCode == 400) {
        if (mounted) {
          setState(() {
            busy = false;
            error =
                e.error ??
                'Notes are at most 500 characters, and volunteer or waived '
                    'credits need one.';
          });
        }
        return;
      }
      navigator.pop(
        _failure(
          e,
          conflict: 'This payment was undone, so its note can’t change.',
        ),
      );
    } on Exception {
      if (mounted) {
        setState(() {
          busy = false;
          error = 'Couldn’t reach the club server. Try again.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Edit note'),
    content: TextField(
      key: const Key('edit-note'),
      controller: note,
      enabled: !busy,
      autofocus: true,
      maxLength: 500,
      minLines: 1,
      maxLines: 4,
      decoration: InputDecoration(
        labelText: widget.payment.isCredit ? 'Note' : 'Note (optional)',
        errorText: error,
        errorMaxLines: 3,
      ),
    ),
    actions: [
      TextButton(
        onPressed: busy ? null : () => Navigator.of(context).pop(),
        child: const Text('CANCEL'),
      ),
      TextButton(
        key: const Key('save-note'),
        onPressed: busy ? null : submit,
        child: Text(busy ? 'SAVING…' : 'SAVE'),
      ),
    ],
  );
}

/// Confirms undoing a payment and asks why. For a card payment it reminds
/// the admin that the refund itself happens in Stripe.
class _UndoPaymentDialog extends StatefulWidget {
  const _UndoPaymentDialog({
    required this.payment,
    required this.memberLabel,
    required this.undo,
  });

  final DuesPayment payment;
  final String memberLabel;
  final Future<void> Function(String reason) undo;

  @override
  State<_UndoPaymentDialog> createState() => _UndoPaymentDialogState();
}

class _UndoPaymentDialogState extends State<_UndoPaymentDialog> {
  final reason = TextEditingController();
  String? error;
  bool busy = false;

  @override
  void dispose() {
    reason.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    final text = reason.text.trim();
    if (text.isEmpty) {
      setState(() => error = 'Say why it’s being undone.');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    final navigator = Navigator.of(context);
    try {
      await widget.undo(text);
      navigator.pop(
        'Undid the ${formatCents(widget.payment.amountCents)} payment.',
      );
    } on ApiException catch (e) {
      if (e.statusCode == 400) {
        if (mounted) {
          setState(() {
            busy = false;
            error = e.error ?? 'Say why it’s being undone.';
          });
        }
        return;
      }
      navigator.pop(_failure(e, conflict: 'This payment was already undone.'));
    } on Exception {
      if (mounted) {
        setState(() {
          busy = false;
          error = 'Couldn’t reach the club server. Try again.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final payment = widget.payment;
    final amount = formatCents(payment.amountCents);
    final card = payment.method == 'stripe';
    return AlertDialog(
      title: Text('Undo the $amount payment?'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'It stops counting toward ${widget.memberLabel}’s dues and '
              'their balance goes back up. It stays in the history, '
              'crossed out.',
              style: textTheme.bodyMedium,
            ),
            if (card) ...[
              const SizedBox(height: 12),
              Container(
                key: const Key('stripe-refund-reminder'),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Brand.pinkTint,
                  border: Border.all(color: Brand.pinkBorder),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  'This was a card payment. Undoing it only fixes the club’s '
                  'records: refund the card payment in the Stripe dashboard.',
                  style: textTheme.bodyMedium,
                ),
              ),
            ],
            const SizedBox(height: 12),
            TextField(
              key: const Key('undo-reason'),
              controller: reason,
              enabled: !busy,
              maxLength: 500,
              minLines: 1,
              maxLines: 3,
              onChanged: error == null
                  ? null
                  : (_) => setState(() => error = null),
              decoration: InputDecoration(
                labelText: 'Reason',
                hintText: 'e.g. Recorded twice',
                errorText: error,
                errorMaxLines: 3,
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: busy ? null : () => Navigator.of(context).pop(),
          child: const Text('CANCEL'),
        ),
        TextButton(
          key: const Key('confirm-undo'),
          style: destructiveButtonStyle,
          onPressed: busy ? null : submit,
          child: Text(busy ? 'UNDOING…' : 'UNDO PAYMENT'),
        ),
      ],
    );
  }
}
