import 'package:material_ui/material_ui.dart';

import 'app/app.dart';
import 'app/deep_links.dart';

export 'app/app.dart' show ClaymoresApp;

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(ClaymoresApp(deepLinks: platformDeepLinks()));
}
