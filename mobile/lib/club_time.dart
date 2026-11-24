import 'package:timezone/data/latest.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

DateTime clubToday([DateTime? now]) {
  tz_data.initializeTimeZones();
  final orlando = tz.TZDateTime.from(
    now ?? DateTime.now(),
    tz.getLocation('America/New_York'),
  );
  return DateTime(orlando.year, orlando.month, orlando.day);
}
