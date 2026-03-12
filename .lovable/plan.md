

## Plan: Fix duplicate numbering in PDF sources list

### Problem
The sources bibliography in exported PDFs shows each link number **twice**: once from the browser's native `list-style: decimal` (inline with the `<ol>`) and once from a CSS `counter` pseudo-element (`ol li::before`) defined in `markdownToHtml.ts`. Both fire on the same `<li>` elements, producing two visible numbers per entry.

### Root Cause
- `markdownToHtml.ts` line 400-403: sets `list-style: none` globally on `ol` — but the sources HTML uses **inline** `list-style: decimal` which overrides the global rule (inline styles win).
- Lines 426-447: adds `counter-reset` / `counter-increment` / `ol li::before { content: counter(list-counter) }` — this fires on ALL `ol li` including the sources.

Result: sources get both native decimal numbering AND CSS counter numbering.

### Fix

**File: `src/lib/verifiedSourceExtractor.ts`**

Remove `list-style: decimal` from all `<ol>` inline styles in the sources HTML (5 occurrences, lines ~577, ~651, ~712, ~754, ~819). Replace with `list-style: none` so only the global CSS counter provides the number — no duplication.

This is the simplest fix because:
- The CSS counter in `markdownToHtml.ts` already produces well-styled numbers (bold, colored, positioned)
- The sources `<ol>` elements already have `padding-left: 20-24px` which accommodates the counter
- No changes needed to the global CSS

