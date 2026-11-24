/// Stripe's card minimum in USD.
const minimumPaymentCents = 50;

String formatCents(int cents) {
  final sign = cents < 0 ? '-' : '';
  final abs = cents.abs();
  final dollars = (abs ~/ 100).toString().replaceAllMapped(
    RegExp(r'\B(?=(\d{3})+(?!\d))'),
    (_) => ',',
  );
  return '$sign\$$dollars.${(abs % 100).toString().padLeft(2, '0')}';
}

/// The editable form of an amount: `1234` → `12.34`.
String centsToInput(int cents) =>
    '${cents ~/ 100}.${(cents % 100).toString().padLeft(2, '0')}';

/// Result of checking a typed payment amount.
class PaymentAmount {
  const PaymentAmount._(this.cents, this.error);

  /// Validates [input] (dollars, e.g. `25`, `25.5`, `$1,025.00`) against
  /// the outstanding [balanceCents]: at least $0.50 and at most the balance.
  factory PaymentAmount.parse(String input, {required int balanceCents}) {
    if (balanceCents < minimumPaymentCents) {
      return const PaymentAmount._(
        null,
        'Balances under \$0.50 can’t be paid by card. Ask the treasurer.',
      );
    }
    final text = input.trim().replaceFirst(r'$', '').replaceAll(',', '');
    final match = RegExp(r'^(\d*)(?:\.(\d{0,2}))?$').firstMatch(text);
    if (text.isEmpty || text == '.' || match == null) {
      return const PaymentAmount._(null, 'Enter an amount, like 25.00.');
    }
    final dollars = int.parse(match[1]!.isEmpty ? '0' : match[1]!);
    final fraction = (match[2] ?? '').padRight(2, '0');
    final cents = dollars * 100 + int.parse(fraction);
    if (cents < minimumPaymentCents) {
      return const PaymentAmount._(null, 'The minimum card payment is \$0.50.');
    }
    if (cents > balanceCents) {
      return PaymentAmount._(
        null,
        'You can pay up to ${formatCents(balanceCents)}.',
      );
    }
    return PaymentAmount._(cents, null);
  }

  final int? cents;
  final String? error;

  bool get isValid => cents != null;
}
