import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';

/// How Stripe Checkout ended, from `claymores://dues?checkout=...`.
enum CheckoutReturn {
  returned,
  cancelled;

  static CheckoutReturn? parse(String? value) => switch (value) {
    'returned' => returned,
    'cancelled' => cancelled,
    _ => null,
  };
}

const profilePath = '/club/profile';

/// Request to join, after a not-invited sign-in.
const joinPath = '/club/join';

/// Maps an incoming link to an app location, or null when it isn't ours.
///
/// Accepts the custom-scheme form (`claymores://dues?checkout=returned`,
/// where `dues` is the host) and the path form (`/dues?checkout=returned`)
/// that a platform router may hand over instead.
String? locationForDeepLink(Uri uri) {
  final String? target;
  if (uri.scheme == 'claymores') {
    target = uri.host.isNotEmpty ? uri.host : uri.pathSegments.firstOrNull;
  } else if (uri.pathSegments.length == 1) {
    target = uri.pathSegments.single;
  } else {
    target = null;
  }
  if (target != 'dues') return null;
  final checkout = CheckoutReturn.parse(uri.queryParameters['checkout']);
  return checkout == null
      ? profilePath
      : '$profilePath?checkout=${checkout.name}';
}

/// Links delivered to the running app (and the one that launched it).
/// Web reads the URL bar directly, so it has none.
Stream<Uri> platformDeepLinks() {
  if (kIsWeb) return const Stream.empty();
  return switch (defaultTargetPlatform) {
    TargetPlatform.android || TargetPlatform.iOS => AppLinks().uriLinkStream,
    _ => const Stream.empty(),
  };
}
