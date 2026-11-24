import 'package:material_ui/material_ui.dart';

/// The website palette (repo-root STYLING.md). Every colour in the app comes
/// from here; tints are the brand colours at reduced opacity on white.
abstract final class Brand {
  /// Accents, eyebrows, links and accent dividers. Never a CTA fill.
  static const pink = Color(0xfffd80b5);

  /// Wins and all CTAs.
  static const blue = Color(0xff77c3ef);

  /// CTA hover / pressed.
  static const bluePressed = Color(0xffa0d5f5);

  static const ink = Color(0xff111111);
  static const secondary = Color(0xff555555);
  static const divider = Color(0xffeaeaea);
  static const background = Color(0xffffffff);

  /// Table headers, as on the website's league table.
  static const muted = Color(0xfffafafa);

  /// #77c3ef at 15% / 40% — selected states, status badges.
  static const blueTint = Color(0x2677c3ef);
  static const blueBorder = Color(0x6677c3ef);

  /// #fd80b5 at 10% / 40% — the Claymores row, friendly badges, winners.
  static const pinkTint = Color(0x1afd80b5);
  static const pinkBorder = Color(0x66fd80b5);

  static const display = 'Claymore';
}

/// Google's "Sign in with Google" button, light theme
/// (developers.google.com/identity/branding-guidelines): white fill, #747775
/// 1px stroke, #1F1F1F Roboto Medium 14, the standard four-colour "G".
/// These are Google's colours, not the club's, and are used only there.
abstract final class GoogleButtonColors {
  static const fill = Color(0xffffffff);
  static const stroke = Color(0xff747775);
  static const text = Color(0xff1f1f1f);
  static const pressed = Color(0x141f1f1f);
}

/// Height shared by the Google and Apple sign-in buttons (Apple HIG minimum
/// is 44pt; Google's is 40dp).
const double signInButtonHeight = 44;

/// Brand heading: Claymore display face in ink.
TextStyle displayStyle(double size, {Color color = Brand.ink}) => TextStyle(
  fontFamily: Brand.display,
  fontSize: size,
  color: color,
  height: 1.1,
);

/// White on #77c3ef is about 1.9:1, below WCAG AA. The website uses white, so
/// the app matches it. Flip this to `true` to use #111111 on CTAs instead
/// (about 9.6:1) and on outlined buttons.
const bool highContrastCtas = false;

const Color ctaForeground = highContrastCtas ? Brand.ink : Colors.white;
const Color outlinedForeground = highContrastCtas ? Brand.ink : Brand.blue;

/// Scores and table numbers line up in columns.
const tabularFigures = [FontFeature.tabularFigures()];

const _ctaText = TextStyle(
  fontFamily: Brand.display,
  fontSize: 16,
  letterSpacing: 0.5,
);
final _ctaShape = RoundedRectangleBorder(
  borderRadius: BorderRadius.circular(6),
);

ThemeData buildClaymoresTheme() {
  const scheme = ColorScheme.light(
    primary: Brand.blue,
    onPrimary: ctaForeground,
    primaryContainer: Brand.blueTint,
    onPrimaryContainer: Brand.ink,
    secondary: Brand.pink,
    onSecondary: Brand.ink,
    secondaryContainer: Brand.blueTint,
    onSecondaryContainer: Brand.ink,
    tertiary: Brand.pink,
    onTertiary: Brand.ink,
    surface: Brand.background,
    onSurface: Brand.ink,
    onSurfaceVariant: Brand.secondary,
    surfaceContainerLowest: Brand.background,
    surfaceContainerLow: Brand.background,
    surfaceContainer: Brand.background,
    surfaceContainerHigh: Brand.muted,
    surfaceContainerHighest: Brand.muted,
    surfaceTint: Colors.transparent,
    outline: Brand.divider,
    outlineVariant: Brand.divider,
  );

  final base = ThemeData(useMaterial3: true, colorScheme: scheme);
  final text = base.textTheme.apply(
    bodyColor: Brand.ink,
    displayColor: Brand.ink,
  );

  WidgetStateProperty<Color?> ctaBackground() =>
      WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.disabled)) return Brand.divider;
        if (states.contains(WidgetState.pressed) ||
            states.contains(WidgetState.hovered) ||
            states.contains(WidgetState.focused)) {
          return Brand.bluePressed;
        }
        return Brand.blue;
      });

  final ctaStyle = ButtonStyle(
    backgroundColor: ctaBackground(),
    foregroundColor: WidgetStateProperty.resolveWith(
      (states) => states.contains(WidgetState.disabled)
          ? Brand.secondary
          : ctaForeground,
    ),
    overlayColor: const WidgetStatePropertyAll(Colors.transparent),
    textStyle: const WidgetStatePropertyAll(_ctaText),
    shape: WidgetStatePropertyAll(_ctaShape),
    elevation: const WidgetStatePropertyAll(0),
    padding: const WidgetStatePropertyAll(
      EdgeInsets.symmetric(horizontal: 20, vertical: 12),
    ),
  );

  return base.copyWith(
    scaffoldBackgroundColor: Brand.background,
    dividerColor: Brand.divider,
    // Ink, hover and focus states use brand tints instead of Material greys.
    focusColor: Brand.blueTint,
    hoverColor: Brand.blueTint,
    highlightColor: Brand.blueTint,
    splashColor: Brand.blueTint,
    dividerTheme: const DividerThemeData(color: Brand.divider, thickness: 1),
    textTheme: text.copyWith(
      // Secondary copy (captions, meta lines, helper text) is #555555.
      bodySmall: text.bodySmall?.copyWith(color: Brand.secondary),
      labelSmall: text.labelSmall?.copyWith(
        color: Brand.secondary,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.1,
      ),
      labelMedium: text.labelMedium?.copyWith(color: Brand.secondary),
      headlineSmall: text.headlineSmall?.copyWith(
        fontFamily: Brand.display,
        fontSize: 26,
      ),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: Brand.background,
      foregroundColor: Brand.ink,
      surfaceTintColor: Colors.transparent,
      titleTextStyle: TextStyle(
        fontFamily: Brand.display,
        fontSize: 22,
        color: Brand.ink,
      ),
      shape: Border(bottom: BorderSide(color: Brand.divider)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Brand.background,
      surfaceTintColor: Colors.transparent,
      indicatorColor: Brand.blueTint,
      labelTextStyle: WidgetStatePropertyAll(
        text.labelMedium?.copyWith(color: Brand.ink),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(style: ctaStyle),
    elevatedButtonTheme: ElevatedButtonThemeData(style: ctaStyle),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: ButtonStyle(
        foregroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.disabled)) return Brand.secondary;
          if (states.contains(WidgetState.pressed) ||
              states.contains(WidgetState.hovered)) {
            return ctaForeground;
          }
          return outlinedForeground;
        }),
        backgroundColor: WidgetStateProperty.resolveWith(
          (states) =>
              states.contains(WidgetState.pressed) ||
                  states.contains(WidgetState.hovered)
              ? Brand.blue
              : Colors.transparent,
        ),
        overlayColor: const WidgetStatePropertyAll(Colors.transparent),
        side: WidgetStateProperty.resolveWith(
          (states) => BorderSide(
            color: states.contains(WidgetState.disabled)
                ? Brand.divider
                : Brand.blue,
          ),
        ),
        textStyle: const WidgetStatePropertyAll(_ctaText),
        shape: WidgetStatePropertyAll(_ctaShape),
        padding: const WidgetStatePropertyAll(
          EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        ),
      ),
    ),
    // Tertiary actions are pink links, as on the website.
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: Brand.pink,
        overlayColor: Brand.pink,
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
      ),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: ButtonStyle(
        backgroundColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? Brand.blueTint
              : Colors.transparent,
        ),
        foregroundColor: const WidgetStatePropertyAll(Brand.ink),
        side: const WidgetStatePropertyAll(BorderSide(color: Brand.blueBorder)),
      ),
    ),
    chipTheme: base.chipTheme.copyWith(
      selectedColor: Brand.blueTint,
      backgroundColor: Brand.background,
      side: const BorderSide(color: Brand.divider),
      checkmarkColor: Brand.ink,
      labelStyle: const TextStyle(color: Brand.ink),
    ),
    switchTheme: SwitchThemeData(
      trackColor: WidgetStateProperty.resolveWith(
        (states) =>
            states.contains(WidgetState.selected) ? Brand.blue : Brand.divider,
      ),
      thumbColor: const WidgetStatePropertyAll(Brand.background),
      trackOutlineColor: const WidgetStatePropertyAll(Colors.transparent),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: Brand.blue),
    inputDecorationTheme: const InputDecorationTheme(
      border: OutlineInputBorder(),
      enabledBorder: OutlineInputBorder(
        borderSide: BorderSide(color: Brand.divider),
      ),
      focusedBorder: OutlineInputBorder(
        borderSide: BorderSide(color: Brand.blue, width: 2),
      ),
    ),
    snackBarTheme: const SnackBarThemeData(
      backgroundColor: Brand.ink,
      contentTextStyle: TextStyle(color: Brand.background),
      actionTextColor: Brand.pink,
    ),
  );
}
