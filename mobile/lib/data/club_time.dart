import 'package:flutter/foundation.dart';
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

/// Loads the timezone database the first time it is needed, then reuses the
/// location. [clubToday] runs on every build of the home and fixtures tabs.
final tz.Location _orlando = () {
  tz_data.initializeTimeZones();
  timeZoneInitializations++;
  return tz.getLocation('America/New_York');
}();

/// How many times the timezone database has been loaded (tests check it).
@visibleForTesting
int timeZoneInitializations = 0;

DateTime clubToday([DateTime? now]) {
  final orlando = tz.TZDateTime.from(now ?? DateTime.now(), _orlando);
  return DateTime(orlando.year, orlando.month, orlando.day);
}
