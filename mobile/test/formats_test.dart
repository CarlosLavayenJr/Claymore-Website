import 'package:claymores/shared/formats.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('seasons read like the website', () {
    expect(seasonLabel(2027), '2026-27');
    expect(seasonLabelFromRange('2025-2026'), '2025-26');
    expect(seasonLabelFromRange('2027'), '2026-27');
    expect(seasonLabelFromRange('Spring'), 'Spring');
  });

  test('every way the sources write a time comes out the same', () {
    expect(formatTime('1:00pm'), '1:00 PM');
    expect(formatTime('2:00 PM'), '2:00 PM');
    expect(formatTime('8:00PM - 10:00PM'), '8:00 PM – 10:00 PM');
    expect(formatTime('8–10pm'), '8:00 PM – 10:00 PM');
    expect(formatTime('TBA'), 'TBA');
  });
}
