# Flutter mobile — planned
The mobile client is intentionally deferred until the web foundation is connected and accepted.
When beginning Phase 2, run `flutter create --org id.kampusflow .` here and add `supabase_flutter`.
Reuse Supabase Auth, the same user IDs, database tables, and RLS policies. Do not duplicate the database or place AI provider credentials in Flutter. Match the web task contract and deterministic priority formula in docs/architecture.md.
