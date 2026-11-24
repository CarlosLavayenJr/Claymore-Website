import 'dart:math' as math;

import 'package:material_ui/material_ui.dart';

import 'theme.dart';

/// On the top bar's crest, so the launch intro can land exactly on it.
final appBarCrestKey = GlobalKey(debugLabel: 'app-bar-crest');

/// The crest's intro on a cold start, about 1.2 seconds, drawn over the app
/// while Home loads underneath:
///
/// 1. the crest draws itself from the sword tip down;
/// 2. a pink and blue shine, like the ball's stripes, sweeps across it;
/// 3. it shrinks into its place in the top bar while the white fades away.
///
/// A tap skips to the end. With Reduce Motion on, nothing plays.
class LaunchIntro extends StatefulWidget {
  const LaunchIntro({super.key, required this.child, this.play = true});

  final Widget child;

  /// False in tests that don't care about the intro.
  final bool play;

  static const duration = Duration(milliseconds: 1250);

  @override
  State<LaunchIntro> createState() => _LaunchIntroState();
}

class _LaunchIntroState extends State<LaunchIntro>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller =
      AnimationController(vsync: this, duration: LaunchIntro.duration)
        ..addStatusListener((status) {
          if (status == AnimationStatus.completed) setState(() => _done = true);
        });

  bool _done = false;
  bool _started = false;

  /// Where the top bar's crest sits, measured once the app has laid out.
  Rect? _target;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    if (!widget.play || MediaQuery.of(context).disableAnimations) {
      _done = true;
      return;
    }
    _controller.forward();
    WidgetsBinding.instance.addPostFrameCallback((_) => _measureTarget());
  }

  void _measureTarget() {
    final box = appBarCrestKey.currentContext?.findRenderObject();
    if (box is RenderBox && box.hasSize && mounted) {
      setState(() => _target = box.localToGlobal(Offset.zero) & box.size);
    } else if (!_done && mounted) {
      // Home may need another frame to build the top bar.
      WidgetsBinding.instance.addPostFrameCallback((_) => _measureTarget());
    }
  }

  void _skip() {
    if (_controller.isAnimating) {
      _controller.animateTo(1, duration: const Duration(milliseconds: 180));
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_done) return widget.child;
    return Stack(
      textDirection: TextDirection.ltr,
      children: [
        widget.child,
        Positioned.fill(
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: _skip,
            child: AnimatedBuilder(
              animation: _controller,
              builder: (context, _) => _frame(context, _controller.value),
            ),
          ),
        ),
      ],
    );
  }

  Widget _frame(BuildContext context, double t) {
    final size = MediaQuery.sizeOf(context);
    // The crest's natural shape (594 × 1086).
    const aspect = 594 / 1086;
    final height = math.min(size.height * 0.36, 300.0);
    final start = Rect.fromCenter(
      center: size.center(Offset.zero),
      width: height * aspect,
      height: height,
    );

    // Phase timings, as fractions of the whole intro.
    double phase(double from, double to, [Curve curve = Curves.linear]) =>
        curve.transform(((t - from) / (to - from)).clamp(0.0, 1.0));
    final reveal = phase(0, 0.38, Curves.easeOutCubic);
    final shine = phase(0.30, 0.64, Curves.easeInOut);
    final fly = phase(0.62, 1, Curves.easeInOutCubic);
    final fade = phase(0.66, 0.96, Curves.easeOut);

    final end = _target;
    final rect = end == null
        ? Rect.lerp(start, start.deflate(start.width * 0.1), fly)!
        : Rect.lerp(start, end, fly)!;
    // Without a measured target, fade the crest out in place instead.
    final crestOpacity = end == null ? 1 - fly : 1.0;

    return Stack(
      children: [
        Positioned.fill(
          child: ColoredBox(
            color: Brand.background.withValues(alpha: 1 - fade),
          ),
        ),
        Positioned.fromRect(
          rect: rect,
          child: Opacity(
            opacity: crestOpacity.clamp(0.0, 1.0),
            child: Transform.scale(
              scale: 0.94 + 0.06 * reveal,
              child: ClipRect(
                child: Align(
                  alignment: Alignment.topCenter,
                  heightFactor: reveal,
                  child: ShaderMask(
                    blendMode: BlendMode.srcATop,
                    shaderCallback: (bounds) => _shineShader(bounds, shine),
                    child: Image.asset(
                      'assets/crest.png',
                      fit: BoxFit.contain,
                      width: rect.width,
                      height: rect.height,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  /// A diagonal band in the ball's colours that slides across the crest.
  /// Outside the band the gradient is transparent, so the crest shows as is.
  Shader _shineShader(Rect bounds, double progress) {
    final centre = -0.4 + 1.8 * progress;
    double at(double offset) => (centre + offset).clamp(0.0, 1.0);
    final visible = progress > 0 && progress < 1;
    return LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: visible
          ? [
              Colors.transparent,
              Brand.pink.withValues(alpha: 0.55),
              Colors.white.withValues(alpha: 0.85),
              Brand.blue.withValues(alpha: 0.55),
              Colors.transparent,
            ]
          : const [Colors.transparent, Colors.transparent],
      stops: visible
          ? [at(-0.16), at(-0.07), at(0), at(0.07), at(0.16)]
          : const [0, 1],
    ).createShader(bounds);
  }
}
