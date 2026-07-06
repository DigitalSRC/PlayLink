// src/lib/supabase.ts throws at module load if these are missing, since the real app needs
// them from .env. Tests that import anything touching supabase.ts (even indirectly, e.g. for
// its pure profile-api.ts mapper functions) need *some* value present — no real network call
// happens in those tests, so placeholders are fine.
process.env.EXPO_PUBLIC_SUPABASE_URL ??= 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key';
