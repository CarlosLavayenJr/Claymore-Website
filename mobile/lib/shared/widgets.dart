import 'package:flutter/foundation.dart' show defaultTargetPlatform;
import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../app/theme.dart';

/// Claymore display heading with the pink accent divider beneath it.
class SectionHeading extends StatelessWidget {
  const SectionHeading(this.title, {super.key});
  final String title;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 4),
        const SizedBox(
          width: 32,
          height: 3,
          child: ColoredBox(color: Brand.pink),
        ),
      ],
    ),
  );
}

/// Small uppercase pink label above content, as on the website.
class Eyebrow extends StatelessWidget {
  const Eyebrow(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Text(
    text.toUpperCase(),
    style: Theme.of(context).textTheme.labelSmall
        ?.copyWith(color: Brand.pink, fontSize: 12),
  );
}

/// Card header: pink eyebrow, Claymore title, pink accent bar, optional
/// body copy. Used by sign-in, join and profile.
class BrandHeader extends StatelessWidget {
  const BrandHeader({
    super.key,
    required this.eyebrow,
    required this.title,
    this.body,
    this.titleSize = 26,
  });

  final String eyebrow, title;
  final String? body;
  final double titleSize;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Eyebrow(eyebrow),
      const SizedBox(height: 6),
      Text(title.toUpperCase(), style: displayStyle(titleSize)),
      const SizedBox(height: 8),
      const SizedBox(
        width: 32,
        height: 3,
        child: ColoredBox(color: Brand.pink),
      ),
      if (body != null) ...[
        const SizedBox(height: 12),
        Text(body!, style: Theme.of(context).textTheme.bodyMedium),
      ],
    ],
  );
}

/// The website's card: white, 1px #EAEAEA border, 8px radius.
class Panel extends StatelessWidget {
  const Panel({
    super.key,
    required this.child,
    this.featured = false,
    this.padding = const EdgeInsets.all(16),
  });

  final Widget child;
  final bool featured;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) => Material(
    color: Brand.background,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(8),
      side: BorderSide(color: featured ? Brand.blue : Brand.divider),
    ),
    clipBehavior: Clip.antiAlias,
    child: Padding(padding: padding, child: child),
  );
}

/// Centered message for empty, error and unavailable states.
class StatusPanel extends StatelessWidget {
  const StatusPanel({
    super.key,
    required this.message,
    this.detail,
    this.action,
  });

  final String message;
  final String? detail;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Panel(
    child: Column(
      children: [
        Text(message, textAlign: TextAlign.center),
        if (detail != null) ...[
          const SizedBox(height: 6),
          Text(
            detail!,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
        if (action != null) ...[const SizedBox(height: 12), action!],
      ],
    ),
  );
}

/// Scrollable page body used by every tab.
class PageList extends StatelessWidget {
  const PageList({super.key, required this.children, this.storageKey});
  final List<Widget> children;
  final Object? storageKey;

  @override
  Widget build(BuildContext context) => ListView(
    key: storageKey == null ? null : PageStorageKey(storageKey),
    physics: const AlwaysScrollableScrollPhysics(),
    padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
    children: children,
  );
}

/// Caps content width on tablets and the web.
class ContentWidth extends StatelessWidget {
  const ContentWidth({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => Center(
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 640),
      child: child,
    ),
  );
}

class DirectionsButton extends StatelessWidget {
  const DirectionsButton({super.key, required this.venue});
  final String venue;

  Future<void> openDirections(BuildContext context, Uri uri) async {
    try {
      if (await launchUrl(uri, mode: LaunchMode.externalApplication)) return;
    } on Exception {
      // Show the same failure as an unavailable maps handler.
    }
    if (context.mounted) showMessage(context, 'Could not open directions.');
  }

  @override
  Widget build(BuildContext context) {
    final destination = switch (defaultTargetPlatform) {
      TargetPlatform.iOS || TargetPlatform.macOS => Uri.https(
        'maps.apple.com',
        '/directions',
        {'destination': venue},
      ),
      _ => Uri.https('www.google.com', '/maps/dir/', {
        'api': '1',
        'destination': venue,
      }),
    };

    return TextButton.icon(
      icon: const Icon(Icons.directions_outlined),
      label: const Text('Directions'),
      onPressed: () => openDirections(context, destination),
    );
  }
}

/// Shows [text] at the bottom. A new message replaces the one on screen, so
/// quick actions never wait behind an old message.
void showMessage(BuildContext context, String text) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text)));
}
