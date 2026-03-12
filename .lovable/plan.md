

## Remove RoleEnrichmentBar from assistant messages

The `RoleEnrichmentBar` component appears after every assistant response, offering to "replantear desde otro perfil" (generate executive report from a different role). Since roles are now configured via the `SessionConfigPanel` above the input area before asking, this post-response bar is redundant and no longer functional as intended.

### Changes

**1. Remove RoleEnrichmentBar usage from ChatMessages.tsx**
- Delete the import of `RoleEnrichmentBar` (line 10)
- Delete lines 303-310 where it renders after each assistant message

**2. Delete the component file**
- Remove `src/components/chat/RoleEnrichmentBar.tsx` entirely

**3. Clean up unused translation keys in chatTranslations.ts**
- Remove these keys from the `ChatTranslations` interface and all language objects (~6 languages): `adaptResponseFor`, `enrichedResponse`, `viewOriginal`, `hideOriginal`, `originalResponse`, `generateExecutiveReport`, `selectRoleForReport`, `adaptResponse`, `adaptToYourRole`, `moreRoles`, `reportsByProfessionalRole`, `eachRoleGenerates`

**No backend changes needed.** The `SessionConfigPanel` (role selector above chat input) remains as the sole way to choose a professional perspective.

