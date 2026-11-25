import 'dart:convert';

import 'package:claymores/data/admin_repository.dart';
import 'package:claymores/data/api_base.dart';
import 'package:claymores/data/api_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class StaticToken implements AccessTokenSource {
  @override
  Future<String?> accessToken() async => 'admin-token';

  @override
  Future<String?> refreshAfterUnauthorized(String rejected) async => null;
}

void main() {
  late List<http.Request> requests;
  late http.Response Function(http.Request) respond;
  late AdminRepository admin;

  setUp(() {
    requests = [];
    admin = AdminRepository(
      ApiClient(
        base: ApiBase.tryParse('https://api.example.com')!,
        tokens: StaticToken(),
        client: MockClient((request) async {
          requests.add(request);
          return respond(request);
        }),
      ),
    );
  });

  http.Response json(Object body, [int status = 200]) =>
      http.Response(jsonEncode(body), status);

  test('allDues parses assessments with the admin token', () async {
    respond = (_) => json([
      {
        'id': 'd1',
        'playerSubject': 'google-1',
        'description': 'Season dues',
        'amountCents': 12500,
        'dueDate': '2026-09-01',
        'paidCents': 5000,
        'creditedCents': 2000,
        'balanceCents': 7500,
        'pendingCheckoutCents': 2500,
      },
    ]);
    final dues = await admin.allDues();
    expect(requests.single.url.path, '/v1/admin/dues');
    expect(requests.single.headers['Authorization'], 'Bearer admin-token');
    final d = dues.single;
    expect(d.playerSubject, 'google-1');
    expect(d.balanceCents, 7500);
    expect(d.pendingCheckoutCents, 2500);
    expect(d.paidCents, 5000);
    expect(d.creditedCents, 2000);
    expect(d.moneyPaidCents, 3000);
    expect(d.dueDate, DateTime(2026, 9, 1));
  });

  test('allDues 404 means dues are switched off', () async {
    respond = (_) => http.Response('', 404);
    expect(
      admin.allDues(),
      throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 404)),
    );
  });

  test('duesDetail parses payments with method and note', () async {
    respond = (_) => json({
      'assessment': {
        'id': 'd 1',
        'playerSubject': 's',
        'description': 'Season dues',
        'amountCents': 12500,
        'dueDate': null,
        'paidCents': 5000,
        'balanceCents': 7500,
        'pendingCheckoutCents': 0,
      },
      'payments': [
        {
          'id': 'p1',
          'amountCents': 5000,
          'recordedAt': '2026-10-01T12:00:00Z',
          'method': 'venmo',
          'note': 'Oct',
        },
        {
          'id': 'p2',
          'amountCents': 100,
          'recordedAt': '2026-10-02T12:00:00Z',
          'method': null,
          'note': null,
        },
        {
          'id': 'p3',
          'amountCents': 2500,
          'recordedAt': '2026-10-03T12:00:00Z',
          'method': 'volunteer',
          'note': 'Reffed U12 game',
        },
      ],
    });
    final detail = await admin.duesDetail('d 1');
    expect(requests.single.url.path, '/v1/admin/dues/d%201');
    expect(detail.assessment.id, 'd 1');
    expect(detail.payments.first.method, 'venmo');
    expect(detail.payments.first.note, 'Oct');
    // No creditedCents from an older API: 0.
    expect(detail.assessment.creditedCents, 0);
    expect(detail.assessment.moneyPaidCents, 5000);
    expect(detail.payments[0].methodLabel, 'Venmo');
    expect(detail.payments[0].isCredit, isFalse);
    expect(detail.payments[1].method, isNull);
    expect(detail.payments[1].methodLabel, isNull);
    expect(detail.payments[2].methodLabel, 'Volunteered');
    expect(detail.payments[2].isCredit, isTrue);
    expect(detail.payments[2].note, 'Reffed U12 game');
  });

  test('recordPayment posts the idempotent body', () async {
    respond = (_) => json({'id': 'p1'});
    await admin.recordPayment(
      'd1',
      const NewDuesPayment(
        id: '11111111-1111-4111-8111-111111111111',
        draft: PaymentDraft(
          amountCents: 2500,
          method: ManualPaymentMethod.zelle,
          note: 'Half',
        ),
      ),
    );
    final r = requests.single;
    expect(r.method, 'POST');
    expect(r.url.path, '/v1/admin/dues/d1/payments');
    expect(jsonDecode(r.body), {
      'id': '11111111-1111-4111-8111-111111111111',
      'amountCents': 2500,
      'method': 'zelle',
      'note': 'Half',
    });
  });

  test('recordPayment surfaces the 409 error text', () async {
    respond = (_) =>
        json({'error': 'That is more than the \$75.00 balance.'}, 409);
    expect(
      admin.recordPayment(
        'd1',
        const NewDuesPayment(
          id: 'x',
          draft: PaymentDraft(
            amountCents: 9000,
            method: ManualPaymentMethod.cash,
          ),
        ),
      ),
      throwsA(
        isA<ApiException>()
            .having((e) => e.statusCode, 'status', 409)
            .having(
              (e) => e.error,
              'error',
              'That is more than the \$75.00 balance.',
            ),
      ),
    );
  });

  test('members parses labels', () async {
    respond = (_) => json([
      {'subject': 'a', 'email': 'a@example.com', 'name': 'Alex Hooker'},
      {'subject': 'b', 'email': 'b@example.com', 'name': null},
    ]);
    final members = await admin.members();
    expect(requests.single.url.path, '/v1/admin/members');
    expect(members.map((m) => m.label), ['Alex Hooker', 'b@example.com']);
  });

  test('joinRequests reads the API shape', () async {
    respond = (_) => json([
      {
        'id': 'r1',
        'provider': 'apple',
        'email': 'sam@privaterelay.appleid.com',
        'name': 'Sam Flanker',
        'phone': null,
        'message': 'Played in college.',
        'status': 'pending',
        'createdAt': '2026-11-20T15:00:00+00:00',
        'updatedAt': '2026-11-20T15:00:00+00:00',
      },
    ]);
    final list = await admin.joinRequests();
    expect(requests.single.url.path, '/v1/admin/join-requests');
    expect(requests.single.url.queryParameters, {'status': 'pending'});
    final r = list.single;
    expect(r.provider, 'apple');
    expect(r.label, 'Sam Flanker');
    expect(r.phone, isNull);
    expect(r.message, 'Played in college.');
    expect(r.createdAt, DateTime.utc(2026, 11, 20, 15));
  });

  test('approve and deny post their bodies', () async {
    respond = (_) => json({'id': 'r1', 'status': 'approved'});
    await admin.approveJoinRequest('r1');
    await admin.denyJoinRequest('r2', reason: '  Not now ');
    await admin.denyJoinRequest('r3', reason: '   ');
    expect(requests.map((r) => r.url.path), [
      '/v1/admin/join-requests/r1/approve',
      '/v1/admin/join-requests/r2/deny',
      '/v1/admin/join-requests/r3/deny',
    ]);
    expect(requests.map((r) => jsonDecode(r.body)), [
      {'role': 'player'},
      {'reason': 'Not now'},
      <String, Object?>{},
    ]);
  });

  test('a decided request is 409 not_pending', () async {
    respond = (_) => json({'error': 'not_pending'}, 409);
    expect(
      admin.approveJoinRequest('r1'),
      throwsA(
        isA<ApiException>().having((e) => e.error, 'error', 'not_pending'),
      ),
    );
  });
}
