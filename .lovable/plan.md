

## Plan: Remove 100-conversation limit in admin API

### Problem
The `list_conversations` action in `supabase/functions/admin-api/index.ts` (line 316) has `.limit(100)`, which caps the conversations returned to the admin panel at 100. This distorts the chat activity summary and prevents seeing the full picture.

### Fix

**File: `supabase/functions/admin-api/index.ts`** — Remove `.limit(100)` from the `list_conversations` query (line 316). The query will then return all conversations ordered by `last_message_at`.

After editing, the edge function will need to be redeployed.

