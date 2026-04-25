/**
 * V2 visible-markdown filter.
 *
 * Goal: in the chat UI, the V2 engine renders a polished narrative report.
 * The raw LLM payload, however, includes a trailing "Sources / Fuentes /
 * Referencias" block (URL bullets + "Total: N fuentes únicas de M medios"
 * line) and may sprinkle inline numeric citations like [1], [2]. V1 does
 * not show any of this in the bubble — sources only appear in the exported
 * PDF/HTML report (rendered from `verifiedSources` metadata, not from the
 * markdown body).
 *
 * This module replicates V1's visual behaviour for V2 messages:
 *   - Strip any trailing block whose heading matches Fuentes / Sources /
 *     Referencias / Citations / Bibliografía / Bibliography (case + accent
 *     insensitive) and the bullet list / paragraph that follows it until
 *     the end of the document or the next H1/H2 of a different topic.
 *   - Strip a tail run of standalone bullet lines that look like a URL
 *     dump (`- domain.com — https://...`) even when the heading was lost.
 *   - Strip "Total: N fuentes únicas de M medios distintos" style tally
 *     lines wherever they appear.
 *   - Strip inline numeric citations `[1]`, `[12]`, `[3, 4]` from the body.
 *
 * Critical invariants:
 *   - PURE function: never mutates input, no side effects.
 *   - Only used for the visible bubble. The original markdown is preserved
 *     in `message.content` and is what the PDF/HTML exporter consumes, so
 *     the downloaded report still includes the full Sources section.
 *   - Methodology validation card (models, period, divergence, etc.) is
 *     rendered from `message.metadata`, NOT from the markdown body, so it
 *     is unaffected by this filter.
 */

const SOURCES_HEADING_RE =
  // Matches both real markdown headings ("## Fuentes") and bold-only pseudo
  // headings ("**Fuentes citadas por los modelos de IA**") that the V2
  // DataPack injects verbatim into the LLM payload. The trailing label is
  // intentionally permissive so variants like "Fuentes citadas por los
  // modelos de IA", "Sources cited", "Bibliografía consultada", etc. all
  // count as the start of a sources block.
  /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:fuentes|sources?|referencias|references|citations|citas|bibliograf[ií]a|bibliography)\b[^\n]{0,120}?(?:\*\*|__)?\s*$/i;

// Sub-headings that the DataPack emits inside the sources block. We treat
// any of these as a "still inside sources" marker so the trim heuristic can
// recognise the tail even when the main heading has already been removed.
const SOURCES_SUBHEADING_RE =
  /^\s*(?:\*\*|__)?\s*(?:menciones\s+de\s+(?:ventana|refuerzo)|window\s+mentions|reinforcement\s+mentions)\b[^\n]*$/i;

const TALLY_LINE_RE =
  /^\s*(?:[-*•]\s*)?(?:\*\*|__)?\s*total\s*[:：]?\s*\d+\s+(?:fuentes?|sources?|referencias?|citations?)\b.*$/i;

// A bullet line that is essentially "domain — url", a bare URL, or — for
// the V2 DataPack — a bullet whose payload is HTML containing an <a href>.
const URL_BULLET_RE =
  /^\s*[-*•]\s+(?:.*?(?:https?:\/\/|www\.)[^\s)]+.*|\[\d+\][^\n]*https?:\/\/[^\s)]+.*|.*<a\s+[^>]*href=)/i;

const BARE_URL_LINE_RE = /^\s*(?:https?:\/\/|www\.)[^\s)]+\s*$/i;

const INLINE_CITATION_RE = /\s?\[\d+(?:\s*[,\-–]\s*\d+)*\]/g;

function isBlankLine(line: string): boolean {
  return line.trim().length === 0;
}

function isHeading(line: string): boolean {
  return /^\s{0,3}#{1,6}\s+\S/.test(line);
}

function isHorizontalRule(line: string): boolean {
  return /^\s*(?:-{3,}|_{3,}|\*{3,})\s*$/.test(line);
}

/** True when the line is a bold-only pseudo heading like "**Foo**". */
function isBoldOnlyLine(line: string): boolean {
  return /^\s*(?:\*\*|__)[^\n*_]+(?:\*\*|__)\s*$/.test(line);
}

/**
 * Remove a Sources/Fuentes section starting at `startIdx` (heading line).
 * Returns the index of the first line that should be kept after the cut,
 * or `lines.length` if the section runs to EOF.
 *
 * Heuristic: a sources section ends at EOF, at the next markdown heading,
 * or at a horizontal rule followed by non-source content.
 */
function findSectionEnd(lines: string[], startIdx: number): number {
  // Skip the heading itself.
  let i = startIdx + 1;
  // Allow optional intro line, then consume everything until a real heading
  // or EOF — sources blocks typically run to the end of the report.
  while (i < lines.length) {
    const line = lines[i];
    if (isHeading(line)) return i;
    i++;
  }
  return lines.length;
}

/**
 * Trim a trailing tail of URL bullets even when no heading survives.
 * Walks backwards from EOF skipping blank/HR lines and removes a contiguous
 * tail of URL-bullet / bare-URL / tally lines.
 */
function trimTrailingUrlDump(lines: string[]): string[] {
  let end = lines.length;
  // Drop trailing blanks.
  while (end > 0 && isBlankLine(lines[end - 1])) end--;

  let cut = end;
  let removedAny = false;
  while (cut > 0) {
    const line = lines[cut - 1];
    if (
      isBlankLine(line) ||
      URL_BULLET_RE.test(line) ||
      BARE_URL_LINE_RE.test(line) ||
      TALLY_LINE_RE.test(line) ||
      isHorizontalRule(line) ||
      SOURCES_SUBHEADING_RE.test(line) ||
      // The DataPack's "**Fuentes citadas por los modelos de IA**" pseudo
      // heading and its short intro paragraph also live in the tail.
      SOURCES_HEADING_RE.test(line) ||
      isBoldOnlyLine(line)
    ) {
      cut--;
      if (!isBlankLine(line) && !isHorizontalRule(line)) removedAny = true;
      continue;
    }
    break;
  }

  // Only commit the trim if we actually removed source-like lines (avoid
  // chopping legitimate trailing prose).
  if (!removedAny) return lines;
  return lines.slice(0, cut);
}

/**
 * Strip the visible Sources block from a V2 markdown payload.
 * Pure function — input is never mutated.
 */
export function stripSourcesFromVisibleMarkdown(md: string): string {
  if (!md) return md;

  let lines = md.split(/\r?\n/);

  // 1) Cut any explicit Sources/Fuentes heading and everything that follows
  //    until the next heading or EOF. We also accept bold-only pseudo
  //    headings ("**Fuentes citadas por los modelos de IA**") and the
  //    "**Menciones de Ventana/Refuerzo**" sub-headings emitted by the
  //    V2 DataPack — once any of them appears we assume everything that
  //    follows is the citations block.
  const headingIdx = lines.findIndex((l) => SOURCES_HEADING_RE.test(l));
  const subIdx = lines.findIndex((l) => SOURCES_SUBHEADING_RE.test(l));
  const cutIdx =
    headingIdx === -1 ? subIdx : subIdx === -1 ? headingIdx : Math.min(headingIdx, subIdx);
  if (cutIdx !== -1) {
    const endIdx = findSectionEnd(lines, cutIdx);
    // Also drop a leading horizontal rule that visually framed the section.
    let cutStart = cutIdx;
    while (
      cutStart > 0 &&
      (isBlankLine(lines[cutStart - 1]) || isHorizontalRule(lines[cutStart - 1]))
    ) {
      cutStart--;
    }
    lines = [...lines.slice(0, cutStart), ...lines.slice(endIdx)];
  }

  // 2) Drop any remaining tally lines wherever they appear.
  lines = lines.filter((l) => !TALLY_LINE_RE.test(l));

  // 3) Trim a trailing URL-bullet dump that may survive without a heading
  //    (e.g. when the LLM rewrites the heading away but keeps the bullets).
  lines = trimTrailingUrlDump(lines);

  // 4) Drop any straggler bullets that are clearly source-bullets even if
  //    they appear mid-document — the V2 DataPack uses a very specific
  //    "- <span>BADGE</span> <strong>domain</strong>...<a href>" shape
  //    that is unambiguous and never appears in the analytical body.
  lines = lines.filter((l) => !/^\s*[-*•]\s+<span\b[^>]*>[^<]*<\/span>\s+<strong\b/i.test(l));

  // 5) Strip inline numeric citations from the remaining body.
  let out = lines.join("\n").replace(INLINE_CITATION_RE, "");

  // Collapse the runs of trailing whitespace introduced by the citation strip.
  out = out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trimEnd();

  return out;
}

export const __test__ = {
  SOURCES_HEADING_RE,
  SOURCES_SUBHEADING_RE,
  TALLY_LINE_RE,
  URL_BULLET_RE,
  BARE_URL_LINE_RE,
  INLINE_CITATION_RE,
};