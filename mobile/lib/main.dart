import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'api/answer_queue.dart';
import 'api/api_client.dart';
import 'api/token_store.dart';
import 'config.dart';
import 'screens/auth_screen.dart';
import 'screens/home_screen.dart';
import 'state/app_state.dart';
import 'theme.dart';
import 'widgets/common.dart';

void main() {
  // SharedPreferences (the theme preference) reaches a platform channel, so
  // the binding has to exist before ThemeController.load() runs.
  WidgetsFlutterBinding.ensureInitialized();

  final tokens = TokenStore();
  final client = ApiClient(baseUrl: AppConfig.apiBaseUrl, tokens: tokens);
  final queue = AnswerQueue(client);

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(
          create: (_) => AppState(client: client, tokens: tokens, queue: queue)..boot(),
        ),
        ChangeNotifierProvider(create: (_) => ThemeController()..load()),
      ],
      child: const EduNexusApp(),
    ),
  );
}

class EduNexusApp extends StatelessWidget {
  const EduNexusApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'EduNexus',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      themeMode: context.watch<ThemeController>().mode,
      home: const _Root(),
    );
  }
}

/// Chooses the first screen from session state, so signing out from anywhere
/// lands back on the sign-in screen without every screen having to know.
class _Root extends StatelessWidget {
  const _Root();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    if (state.booting) {
      return const Scaffold(body: Loading(label: 'Starting EduNexus'));
    }
    return state.signedIn ? const HomeScreen() : const AuthScreen();
  }
}
