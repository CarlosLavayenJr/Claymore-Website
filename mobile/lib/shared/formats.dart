/// One way to write seasons and times in the app, matching the website:
/// "2026-27" and "8:00 PM" / "8:00 PM – 10:00 PM".
library;

/// The season that closes in [season] ("2027"), written "2026-27".
String seasonLabel(int season) =>
    '${season - 1}-${(season % 100).toString().padLeft(2, '0')}';

/// A standings label like "2026-2027" (or "2027") written "2026-27"; anything
/// else is returned as it came.
String seasonLabelFromRange(String label) {
  final years = RegExp(r'(\d{4})').allMatches(label).toList();
  if (years.isEmpty) return label;
  return seasonLabel(int.parse(years.last.group(1)!));
}

final _one = RegExp(
  r'^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$',
  caseSensitive: false,
);
final _range = RegExp(
  r'^(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?\s*m\.?)?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$',
  caseSensitive: false,
);

String _clock(String hour, String? minute, String meridiem) =>
    '${int.parse(hour)}:${minute ?? '00'} ${meridiem.toUpperCase()}M';

/// "1:00pm" → "1:00 PM", "8:00PM - 10:00PM" / "8–10pm" → "8:00 PM – 10:00 PM".
/// Text it can't read ("TBA") is returned unchanged.
String formatTime(String value) {
  final text = value.trim();
  final one = _one.firstMatch(text);
  if (one != null) return _clock(one[1]!, one[2], one[3]!);
  final range = _range.firstMatch(text);
  if (range != null) {
    return '${_clock(range[1]!, range[2], range[3] ?? range[6]!)} – '
        '${_clock(range[4]!, range[5], range[6]!)}';
  }
  return value;
}
