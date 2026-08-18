import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../widgets/common.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  bool _registering = false;
  bool _busy = false;
  String? _error;
  Map<String, dynamic>? _fieldErrors;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  String? _fieldError(String name) {
    final value = _fieldErrors?[name];
    if (value == null) return null;
    return value is List ? value.join(' ') : value.toString();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
      _fieldErrors = null;
    });

    final state = context.read<AppState>();
    try {
      if (_registering) {
        await state.register(_email.text, _password.text);
      } else {
        await state.signIn(_email.text, _password.text);
      }
      // Navigation is driven by AppState.signedIn in main.dart, so there is
      // nothing to push here.
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.message;
        _fieldErrors = error.fieldErrors;
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.exam;
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(24),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 420),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            'EduNexus',
                            textAlign: TextAlign.center,
                            style: serif(
                              size: 30,
                              weight: FontWeight.w700,
                              letterSpacing: -0.6,
                              color: c.ink,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            'Practise the digital SAT the way it actually adapts.',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 13,
                              height: 1.5,
                              color: c.inkSoft,
                            ),
                          ),
                          const SizedBox(height: 22),

                          // The pitch stated as numbers rather than as a
                          // welcome message: what this product is, is a tagged
                          // bank and an adaptive engine, and both are
                          // countable.
                          const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              _Stat(value: '639', label: 'questions'),
                              SizedBox(width: 28),
                              _Stat(value: '4', label: 'full tests'),
                              SizedBox(width: 28),
                              _Stat(value: '98', label: 'per test'),
                            ],
                          ),

                          const SizedBox(height: 30),
                          Text(
                            _registering ? 'Create an account' : 'Sign in',
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            _registering
                                ? 'Signing up unlocks the question bank.'
                                : 'Digital SAT practice.',
                            style: TextStyle(fontSize: 13, color: c.inkFaint),
                          ),
                          const SizedBox(height: 18),

                          if (_error != null) Notice(message: _error!),
                          TextFormField(
                            controller: _email,
                            keyboardType: TextInputType.emailAddress,
                            autocorrect: false,
                            autofillHints: const [AutofillHints.email],
                            decoration: InputDecoration(
                              labelText: 'Email',
                              errorText: _fieldError('email'),
                            ),
                            validator: (v) => (v == null || !v.contains('@'))
                                ? 'Enter your email address'
                                : null,
                          ),
                          const SizedBox(height: 14),
                          TextFormField(
                            controller: _password,
                            obscureText: true,
                            autofillHints: [
                              _registering
                                  ? AutofillHints.newPassword
                                  : AutofillHints.password,
                            ],
                            decoration: InputDecoration(
                              labelText: 'Password',
                              errorText: _fieldError('password'),
                              helperText: _registering
                                  ? 'At least 10 characters, with a letter and a digit.'
                                  : null,
                              helperMaxLines: 2,
                            ),
                            onFieldSubmitted: (_) => _submit(),
                            validator: (v) => (v == null || v.isEmpty)
                                ? 'Enter your password'
                                : null,
                          ),
                          const SizedBox(height: 22),
                          FilledButton(
                            onPressed: _busy ? null : _submit,
                            child: Text(
                              _busy
                                  ? 'Please wait…'
                                  : _registering
                                      ? 'Create account'
                                      : 'Sign in',
                            ),
                          ),
                          const SizedBox(height: 6),
                          TextButton(
                            onPressed: _busy
                                ? null
                                : () => setState(() {
                                      _registering = !_registering;
                                      _error = null;
                                      _fieldErrors = null;
                                    }),
                            child: Text(
                              _registering
                                  ? 'Already have an account? Sign in'
                                  : 'No account yet? Create one',
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
            const TrademarkNotice(),
          ],
        ),
      ),
    );
  }
}

/// One figure from the pitch: the numeral in mono, its label beneath.
class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    final c = context.exam;
    return Column(
      children: [
        Text(
          value,
          style: TextStyle(
            fontFamily: 'monospace',
            fontSize: 19,
            fontFeatures: const [FontFeature.tabularFigures()],
            color: c.ink,
          ),
        ),
        Text(label, style: TextStyle(fontSize: 11, color: c.inkFaint)),
      ],
    );
  }
}
