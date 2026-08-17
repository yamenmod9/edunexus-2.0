import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'api/answer_queue.dart';
import 'api/api_client.dart';
import 'api/token_store.dart';
import 'config.dart';
import 'screens/auth_screen.dart';
import 'screens/home_screen.dart';
import 'state/app_state.dart';
import 'widgets/common.dart';

void main() {
  final tokens = TokenStore();
  final client = ApiClient(baseUrl: AppConfig.apiBaseUrl, tokens: tokens);
  final queue = AnswerQueue(client);

  runApp(
    ChangeNotifierProvider(
      create: (_) => AppState(client: client, tokens: tokens, queue: queue)..boot(),
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
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1D4ED8)),
        scaffoldBackgroundColor: const Color(0xFFF8FAFC),
        cardTheme: const CardThemeData(
          elevation: 0,
          margin: EdgeInsets.only(bottom: 12),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(10)),
            side: BorderSide(color: Color(0xFFE2E8F0)),
          ),
          color: Colors.white,
        ),
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(),
        ),
      ),
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
