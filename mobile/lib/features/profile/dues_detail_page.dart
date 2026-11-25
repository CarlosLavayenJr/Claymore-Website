import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/services.dart';
import '../../app/theme.dart';
import '../../data/api_client.dart';
import '../../data/member_repository.dart';
import '../../shared/widgets.dart';
import '../club/my_dues.dart';
import 'payment_amount.dart';

/// Opens Stripe Checkout outside the app; returns false if nothing opened.
typedef CheckoutLauncher = Future<bool> Function(Uri url);

Future<bool> launchCheckout(Uri url) =>
    launchUrl(url, mode: LaunchMode.externalApplication);

/// `/club/profile/dues/:id`: one assessment, its payments, and the pay form.
class DuesDetailPage extends StatefulWidget {
  const DuesDetailPage({
    super.key,
    required this.id,
    this.launcher = launchCheckout,
  });

  final String id;
  final CheckoutLauncher launcher;

  @override
  State<DuesDetailPage> createState() => _DuesDetailPageState();
}

class _DuesDetailPageState extends State<DuesDetailPage> {
  Future<DuesDetail>? detail;
  MemberRepository? members;
  late final AppLifecycleListener lifecycle;

  @override
  void initState() {
    super.initState();
    lifecycle = AppLifecycleListener(onResume: () => setState(load));
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final next = AppScope.of(context).members;
    if (next != members) {
      members = next;
      load();
    }
  }

  @override
  void dispose() {
    lifecycle.dispose();
    super.dispose();
  }

  void load() {
    detail = members?.duesDetail(widget.id);
  }

  @override
  Widget build(BuildContext context) {
    final localizations = MaterialLocalizations.of(context);
    final textTheme = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('DUES')),
      body: SafeArea(
        top: false,
        child: ContentWidth(
          child: FutureBuilder<DuesDetail>(
            future: detail,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const Center(child: CircularProgressIndicator());
              }
              if (snapshot.hasError || !snapshot.hasData) {
                return PageList(
                  children: [
                    StatusPanel(
                      message: 'Couldn’t load these dues.',
                      action: FilledButton(
                        onPressed: () => setState(load),
                        child: const Text('RETRY'),
                      ),
                    ),
                  ],
                );
              }
              final data = snapshot.data!;
              final dues = data.assessment;
              return RefreshIndicator(
                onRefresh: () async {
                  setState(load);
                  await detail?.then<void>((_) {}, onError: (Object _) {});
                },
                child: PageList(
                  children: [
                    DuesTile(dues: dues),
                    const SizedBox(height: 24),
                    if (!dues.settled) ...[
                      const SectionHeading('PAY'),
                      Panel(
                        child: PayDuesForm(
                          key: ValueKey(
                            '${dues.id}-${dues.balanceCents}-'
                            '${dues.pendingCheckoutCents}',
                          ),
                          dues: dues,
                          members: members!,
                          launcher: widget.launcher,
                          onStarted: () => setState(load),
                        ),
                      ),
                      const SizedBox(height: 24),
                    ],
                    const SectionHeading('PAYMENTS'),
                    if (data.payments.isEmpty)
                      const StatusPanel(message: 'No payments recorded yet.')
                    else
                      Panel(
                        padding: EdgeInsets.zero,
                        child: Column(
                          children: [
                            for (final (i, payment) in data.payments.indexed)
                              ListTile(
                                shape: i == 0
                                    ? null
                                    : const Border(
                                        top: BorderSide(color: Brand.divider),
                                      ),
                                title: Text(
                                  formatCents(payment.amountCents),
                                  style: const TextStyle(
                                    fontFeatures: tabularFigures,
                                  ),
                                ),
                                subtitle: switch ([
                                  if (payment.recordedAt != null)
                                    localizations.formatMediumDate(
                                      payment.recordedAt!.toLocal(),
                                    ),
                                  ?payment.methodLabel,
                                ]) {
                                  [] => null,
                                  final parts => Text(
                                    parts.join(' · '),
                                    style: textTheme.bodySmall,
                                  ),
                                },
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
}

/// Amount entry defaults to the full balance, accepts $0.50 up to the
/// balance, and turns into "Resume" while a checkout is pending.
class PayDuesForm extends StatefulWidget {
  const PayDuesForm({
    super.key,
    required this.dues,
    required this.members,
    required this.launcher,
    required this.onStarted,
  });

  final DuesAssessment dues;
  final MemberRepository members;
  final CheckoutLauncher launcher;
  final VoidCallback onStarted;

  @override
  State<PayDuesForm> createState() => _PayDuesFormState();
}

class _PayDuesFormState extends State<PayDuesForm> {
  late final amount = TextEditingController(
    text: centsToInput(widget.dues.balanceCents),
  );
  late PaymentAmount parsed = PaymentAmount.parse(
    amount.text,
    balanceCents: widget.dues.balanceCents,
  );
  bool busy = false;

  @override
  void dispose() {
    amount.dispose();
    super.dispose();
  }

  Future<void> pay(int cents) async {
    setState(() => busy = true);
    try {
      final url = await widget.members.startCheckout(widget.dues.id, cents);
      final opened = await widget.launcher(url);
      if (!mounted) return;
      showMessage(
        context,
        opened
            ? 'Finish paying in your browser. Your balance updates after '
                  'Stripe confirms.'
            : 'Couldn’t open the checkout page.',
      );
      widget.onStarted();
    } on ApiException catch (error) {
      if (!mounted) return;
      showMessage(
        context,
        error.error ??
            (error.statusCode == 409
                ? 'A checkout is already open for these dues.'
                : 'Couldn’t start checkout (${error.statusCode}).'),
      );
      widget.onStarted();
    } on Exception {
      if (mounted) showMessage(context, 'Couldn’t start checkout. Try again.');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dues = widget.dues;
    final textTheme = Theme.of(context).textTheme;
    if (dues.hasPendingCheckout) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'A checkout for ${formatCents(dues.pendingCheckoutCents)} is '
            'already open. Resume it to finish paying, or wait for Stripe to '
            'confirm it.',
          ),
          const SizedBox(height: 12),
          TextFormField(
            enabled: false,
            initialValue: centsToInput(dues.pendingCheckoutCents),
            decoration: const InputDecoration(
              labelText: 'Amount (USD)',
              prefixText: '\$ ',
            ),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: busy ? null : () => pay(dues.pendingCheckoutCents),
            child: const Text('RESUME CHECKOUT'),
          ),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          controller: amount,
          enabled: !busy,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(
            labelText: 'Amount (USD)',
            prefixText: '\$ ',
            helperText:
                'Between \$0.50 and ${formatCents(dues.balanceCents)}. '
                'Card payments go through Stripe.',
            errorText: parsed.error,
          ),
          onChanged: (text) => setState(() {
            parsed = PaymentAmount.parse(text, balanceCents: dues.balanceCents);
          }),
        ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: busy || !parsed.isValid ? null : () => pay(parsed.cents!),
          child: Text(
            parsed.isValid ? 'PAY ${formatCents(parsed.cents!)}' : 'PAY',
            style: const TextStyle(fontFeatures: tabularFigures),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Opens Stripe in your browser, then returns to the app.',
          style: textTheme.bodySmall,
        ),
      ],
    );
  }
}
