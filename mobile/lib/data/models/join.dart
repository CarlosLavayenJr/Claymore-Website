// Request-to-join shapes: POST /v1/auth/mobile/{google|apple}/request-access
// and /request-status.

/// `request-status`: where this identity's join request stands.
enum JoinRequestStatus {
  none,
  pending,
  approved,
  denied;

  static JoinRequestStatus parse(Object? value) => switch (value) {
    'pending' => pending,
    'approved' => approved,
    'denied' => denied,
    _ => none,
  };
}

/// What `request-access` answered.
enum JoinReplyKind {
  /// 202 `{"status":"pending","email"}`.
  pending,

  /// 409 `{"status":"already_member"}`: just sign in.
  alreadyMember,

  /// 429 `{"status":"denied_recently"}`. A rate-limit 429
  /// (`{"error":"rate_limited"}`) is thrown as an [ApiException] instead.
  deniedRecently,

  /// 400 `{"error":"invalid_request","field"}`.
  invalid,

  /// 401 `{"error":"invalid_token"}`: the identity token expired or failed.
  invalidToken,
}

class JoinReply {
  const JoinReply(this.kind, {this.email, this.field});

  final JoinReplyKind kind;

  /// The address the request was filed under (202).
  final String? email;

  /// The rejected field (400): `name`, `phone` or `message`.
  final String? field;
}
