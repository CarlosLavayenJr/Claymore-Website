import 'dart:math';

import 'package:claymores/data/admin_repository.dart';
import 'package:claymores/features/admin/dues_summary.dart';
import 'package:claymores/features/admin/record_payment_sheet.dart';
import 'package:flutter_test/flutter_test.dart';

var _next = 0;

DuesAssessment dues({
  String description = '2026-27 Season dues',
  int amount = 12500,
  int paid = 0,
  int credited = 0,
  int waived = 0,
  int pending = 0,
  String? subject,
  String? dueDate,
}) => DuesAssessment.fromJson({
  'id': 'd${_next++}',
  'playerSubject': subject ?? 's$_next',
  'description': description,
  'amountCents': amount,
  'dueDate': dueDate,
  'paidCents': paid,
  'waivedCents': waived,
  'creditedCents': credited,
  'balanceCents': amount - paid,
  'pendingCheckoutCents': pending,
});

void main() {
  group('summarizeDues', () {
    test('the season example: 14 paid, 5 partly paid, 3 unpaid', () {
      final groups = summarizeDues([
        for (var i = 0; i < 14; i++) dues(paid: 12500),
        for (var i = 0; i < 5; i++) dues(paid: 4000),
        for (var i = 0; i < 3; i++) dues(),
      ]);
      expect(groups, hasLength(1));
      final g = groups.single;
      expect(g.title, '2026-27 Season dues · \$125 each');
      expect(
        g.progressLine,
        '14 of 22 paid in full · 5 partly paid · 3 unpaid',
      );
      expect(g.moneyLine, '\$1,950 collected · \$800 outstanding');
      expect(g.paid, hasLength(14));
      expect(g.partial, hasLength(5));
      expect(g.unpaid, hasLength(3));
      expect(g.paidShare, closeTo(14 / 22, 1e-9));
      expect(g.partialShare, closeTo(5 / 22, 1e-9));
    });

    test('groups descriptions case-insensitively, ignoring spaces', () {
      final groups = summarizeDues([
        dues(description: '  Season Dues '),
        dues(description: 'season dues'),
        dues(description: 'Kit fee', amount: 4000),
      ]);
      expect(groups.map((g) => g.description), ['Kit fee', 'Season Dues']);
      expect(groups.last.count, 2);
    });

    test('a blank description is grouped as "Dues"', () {
      expect(
        summarizeDues([dues(description: '  ')]).single.description,
        'Dues',
      );
    });

    test('newest due date first, undated groups last', () {
      final groups = summarizeDues([
        dues(description: 'Undated'),
        dues(description: 'Old', dueDate: '2025-09-01'),
        dues(description: 'New', dueDate: '2026-09-01'),
      ]);
      expect(groups.map((g) => g.description), ['New', 'Old', 'Undated']);
    });

    test('different amounts show a range; zero counts are left out', () {
      final g = summarizeDues([
        dues(amount: 10000, paid: 10000),
        dues(amount: 12550, paid: 12550),
      ]).single;
      expect(g.amountLabel, '\$100–\$125.50 each');
      expect(g.progressLine, '2 of 2 paid in full');
      expect(g.moneyLine, '\$225.50 collected · \$0 outstanding');
    });

    test('an overpaid balance counts as paid and owes nothing', () {
      final over = DuesAssessment.fromJson({
        'id': 'x',
        'playerSubject': 's',
        'description': 'Dues',
        'amountCents': 100,
        'paidCents': 150,
        'balanceCents': -50,
        'pendingCheckoutCents': 0,
      });
      final g = summarizeDues([over]).single;
      expect(DuesStanding.of(over), DuesStanding.paid);
      expect(g.outstandingCents, 0);
    });

    test('a pending checkout is not a payment', () {
      final d = dues(pending: 12500);
      expect(DuesStanding.of(d), DuesStanding.unpaid);
      expect(suggestedPaymentCents(d), 0);
      expect(suggestedPaymentCents(dues(paid: 2500, pending: 5000)), 5000);
      expect(suggestedPaymentCents(dues(paid: 2500)), 10000);
    });

    test('collected is money only; credit is shown apart', () {
      final groups = summarizeDues([
        for (var i = 0; i < 14; i++) dues(paid: 12500),
        // Two volunteered in full, one partly waived.
        dues(paid: 12500, credited: 12500),
        dues(paid: 12500, credited: 10000),
        dues(paid: 5000, credited: 2500),
        for (var i = 0; i < 2; i++) dues(paid: 4000),
        for (var i = 0; i < 3; i++) dues(),
      ]);
      final g = groups.single;
      expect(g.collectedCents, 14 * 12500 + 2500 + 2500 + 2 * 4000);
      expect(g.creditedCents, 25000);
      expect(
        g.moneyLine,
        '\$1,880 collected · \$250 credited · \$620 outstanding',
      );
      // Settled by credit alone isn't "paid in full": it's volunteered.
      expect(
        g.progressLine,
        '15 of 22 paid in full · 1 volunteered · 3 partly paid · 3 unpaid',
      );
    });

    test('a waiver is not a payment', () {
      final waived = dues(paid: 12500, credited: 12500, waived: 12500);
      final volunteered = dues(paid: 12500, credited: 12500);
      final mixed = dues(paid: 12500, credited: 7500, waived: 7500);
      expect(DuesStanding.of(waived), DuesStanding.waived);
      expect(waived.settledLabel, 'Waived');
      expect(waived.creditLabel, 'Waived');
      expect(DuesStanding.of(volunteered), DuesStanding.volunteered);
      expect(volunteered.settledLabel, 'Volunteered');
      expect(DuesStanding.of(mixed), DuesStanding.paid);
      expect(mixed.settledLabel, 'Paid · rest waived');
      expect(dues(paid: 12500).settledLabel, 'Paid in full');
      expect(
        summarizeDues([waived, volunteered, mixed]).single.progressLine,
        '1 of 3 paid in full · 1 waived · 1 volunteered',
      );
    });

    test('nothing in, nothing out', () {
      expect(summarizeDues(const []), isEmpty);
    });
  });

  test('formatDollars drops whole cents only', () {
    expect(formatDollars(195000), '\$1,950');
    expect(formatDollars(12550), '\$125.50');
    expect(formatDollars(0), '\$0');
  });

  test('parseDollars', () {
    expect(parseDollars('125'), 12500);
    expect(parseDollars(r' $1,025.5 '), 102550);
    expect(parseDollars('.75'), 75);
    expect(parseDollars(''), isNull);
    expect(parseDollars('12.345'), isNull);
    expect(parseDollars('abc'), isNull);
    expect(parseDollars('-5'), isNull);
  });

  group('PaymentIdempotency', () {
    const cash = PaymentDraft(
      amountCents: 5000,
      method: ManualPaymentMethod.cash,
    );

    test('reuses the id for the same payment until it is settled', () {
      var n = 0;
      final ids = PaymentIdempotency(newId: () => 'id-${n++}');
      expect(ids.payment(cash).id, 'id-0');
      // Retry after a network error: same id, same body.
      expect(ids.payment(cash).id, 'id-0');
      expect(ids.payment(cash).toJson(), {
        'id': 'id-0',
        'amountCents': 5000,
        'method': 'cash',
      });
      // A changed payment is a new one.
      const venmo = PaymentDraft(
        amountCents: 5000,
        method: ManualPaymentMethod.venmo,
        note: 'May',
      );
      expect(ids.payment(venmo).id, 'id-1');
      expect(ids.payment(venmo).toJson()['note'], 'May');
      ids.settled();
      expect(ids.payment(venmo).id, 'id-2');
    });
  });

  group('payment methods', () {
    test('volunteer and waived are credits that need a note', () {
      expect(ManualPaymentMethod.values.map((m) => m.name), [
        'cash',
        'venmo',
        'zelle',
        'check',
        'other',
        'volunteer',
        'waived',
      ]);
      expect(ManualPaymentMethod.volunteer.label, 'Volunteered');
      expect(ManualPaymentMethod.waived.label, 'Waived');
      expect(ManualPaymentMethod.credits, [
        ManualPaymentMethod.volunteer,
        ManualPaymentMethod.waived,
      ]);
      expect(ManualPaymentMethod.money.where((m) => m.requiresNote), isEmpty);
      expect(ManualPaymentMethod.volunteer.requiresNote, isTrue);
      expect(
        ManualPaymentMethod.volunteer.noteHint,
        'What did they do? e.g. Reffed U12 game',
      );
      expect(
        ManualPaymentMethod.waived.noteHint,
        'Why? e.g. Scholarship, injury',
      );
    });

    test('labels for every method the API sends', () {
      expect(
        [
          for (final m in [
            'stripe',
            'cash',
            'venmo',
            'zelle',
            'check',
            'other',
            'volunteer',
            'waived',
          ])
            paymentMethodLabel(m),
        ],
        [
          'Card',
          'Cash',
          'Venmo',
          'Zelle',
          'Check',
          'Other',
          'Volunteered',
          'Waived',
        ],
      );
      expect(paymentMethodLabel(null), isNull);
      expect(paymentMethodLabel('paypal'), 'Paypal');
      for (final m in ManualPaymentMethod.values) {
        expect(paymentMethodLabel(m.name), m.label);
      }
    });

    test('a credit is sent with its method and note', () {
      final ids = PaymentIdempotency(newId: () => 'id-0');
      expect(
        ids
            .payment(
              const PaymentDraft(
                amountCents: 2500,
                method: ManualPaymentMethod.waived,
                note: 'Scholarship',
              ),
            )
            .toJson(),
        {
          'id': 'id-0',
          'amountCents': 2500,
          'method': 'waived',
          'note': 'Scholarship',
        },
      );
    });
  });

  test('uuidV4 is a well-formed random UUID', () {
    final pattern = RegExp(
      r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    );
    expect(uuidV4(), matches(pattern));
    expect(uuidV4(Random(1)), matches(pattern));
    expect(uuidV4(), isNot(uuidV4()));
  });
}
