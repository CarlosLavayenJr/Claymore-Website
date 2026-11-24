import 'dart:convert';

import 'package:claymores/data/models/account.dart';
import 'package:claymores/features/profile/payment_amount.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('PaymentAmount', () {
    PaymentAmount parse(String input, [int balance = 12500]) =>
        PaymentAmount.parse(input, balanceCents: balance);

    test('accepts dollars and cents in common forms', () {
      expect(parse('125').cents, 12500);
      expect(parse('125.00').cents, 12500);
      expect(parse(r'$1.5').cents, 150);
      expect(parse(' 0.50 ').cents, 50);
      expect(parse('.75').cents, 75);
      expect(parse(r'$1,025.10', 200000).cents, 102510);
    });

    test('rejects below the \$0.50 minimum', () {
      expect(parse('0.49').error, contains('minimum'));
      expect(parse('0').isValid, isFalse);
    });

    test('rejects more than the balance', () {
      final result = parse('125.01');
      expect(result.isValid, isFalse);
      expect(result.error, r'You can pay up to $125.00.');
    });

    test('rejects malformed input', () {
      for (final input in ['', 'abc', '1.234', '-5', '1.2.3', '.']) {
        expect(parse(input).isValid, isFalse, reason: input);
      }
    });

    test('a balance under the card minimum cannot be paid', () {
      expect(parse('0.40', 40).error, contains('treasurer'));
    });
  });

  test('formats cents for display and for the input', () {
    expect(formatCents(12500), r'$125.00');
    expect(formatCents(123456789), r'$1,234,567.89');
    expect(formatCents(5), r'$0.05');
    expect(centsToInput(12505), '125.05');
  });

  test('dues JSON uses the API camelCase shape', () {
    final detail = DuesDetail.fromJson(
      jsonDecode('''
      {"assessment":{"id":"0b6b8a2c-1d1e-4f5a-9a51-6a4c7a3d9e10",
        "playerSubject":"google-sub-1","description":"2026-27 season dues",
        "amountCents":15000,"dueDate":"2027-01-15","paidCents":5000,
        "balanceCents":10000,"pendingCheckoutCents":2500},
       "payments":[{"id":"p1","amountCents":5000,
        "recordedAt":"2026-11-01T15:04:05.123Z"}]}
      ''') as Map<String, dynamic>,
    );
    final dues = detail.assessment;
    expect(dues.balanceCents, 10000);
    expect(dues.dueDate, DateTime(2027, 1, 15));
    expect(dues.hasPendingCheckout, isTrue);
    expect(detail.payments.single.amountCents, 5000);
  });
}
