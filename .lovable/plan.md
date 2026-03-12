

## Plan: Fix duplicate numbering in sources lists

### Problem
The previous fix (changing `list-style: decimal` → `list-style: none`) didn't solve the issue because CSS `::before` pseudo-elements cannot be overridden with inline styles. The global counter in `markdownToHtml.ts` (lines 426-447) still fires on all `ol li`, including the bibliography lists.

### Changes

**1. `src/lib/verifiedSourceExtractor.ts`** — Add `class="sources-list"` to all 5 `<ol>` elements (lines ~575, ~649, ~710, ~752, ~817).

**2. `src/lib/markdownToHtml.ts`** — After line 447 (closing `}` of `ol li::before`), add:

```css
ol.sources-list { counter-reset: none; }
ol.sources-list li { counter-increment: none; }
ol.sources-list li::before { content: none; display: none; }
```

This neutralizes the counter exclusively for sources lists. The existing `forEach` index in the HTML handles the numbering.

