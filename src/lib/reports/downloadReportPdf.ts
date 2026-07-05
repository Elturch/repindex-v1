// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - html2pdf.js has partial type coverage
import html2pdfImport from "html2pdf.js";
const html2pdf: any = html2pdfImport;

/**
 * html2canvas (used by html2pdf) does NOT support modern CSS color spaces such
 * as `oklch(...)` / `oklab(...)` / `color(display-p3 ...)`. If any computed
 * style on the captured tree resolves to one of those, the canvas step throws
 * or produces a blank output.
 *
 * We work on a deep CLONE of the report node (never the live DOM), walk every
 * element, read its `getComputedStyle` values in the live document (browsers
 * already resolve oklch there to an rgb triplet for rendering), and inline
 * those resolved values as `rgb(...)` on the clone. This gives html2canvas a
 * fully sRGB tree to serialize.
 */
function sanitizeColorsForCanvas(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;

  // Off-screen host so getComputedStyle on the clone would work if needed,
  // but we resolve against the source tree (which is on-screen) for accuracy.
  const holder = document.createElement("div");
  holder.style.position = "fixed";
  holder.style.left = "-100000px";
  holder.style.top = "0";
  holder.style.width = `${source.getBoundingClientRect().width}px`;
  holder.style.background = "#ffffff";
  holder.appendChild(clone);
  document.body.appendChild(holder);

  const COLOR_PROPS = [
    "color",
    "backgroundColor",
    "borderTopColor",
    "borderRightColor",
    "borderBottomColor",
    "borderLeftColor",
    "outlineColor",
    "fill",
    "stroke",
    "textDecorationColor",
    "columnRuleColor",
  ] as const;

  const sourceEls = source.querySelectorAll<HTMLElement>("*");
  const cloneEls = clone.querySelectorAll<HTMLElement>("*");

  // Root node itself.
  copyResolvedColors(source, clone, COLOR_PROPS);

  const len = Math.min(sourceEls.length, cloneEls.length);
  for (let i = 0; i < len; i++) {
    copyResolvedColors(sourceEls[i], cloneEls[i], COLOR_PROPS);
  }

  return holder; // return the holder; caller will hand it to html2pdf and clean up.
}

function copyResolvedColors(
  src: Element,
  dst: HTMLElement,
  props: readonly string[],
) {
  if (!(src instanceof Element)) return;
  const cs = window.getComputedStyle(src);
  for (const prop of props) {
    const raw = cs.getPropertyValue(toKebab(prop));
    if (!raw) continue;
    // Only override when the value contains a color function html2canvas can't parse.
    if (/oklch|oklab|color\(/i.test(raw)) {
      (dst.style as any)[prop] = "";
    }
    // Always inline the resolved value so no CSS var / oklch survives.
    (dst.style as any)[prop] = raw;
  }
}

function toKebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}

export async function downloadReportPdf(
  el: HTMLElement,
  filename: string,
): Promise<void> {
  // Reveal PDF-only branding (`.rix-pdf-only`) during capture.
  const marker = document.createElement("style");
  marker.setAttribute("data-rix-pdf-capture", "1");
  marker.textContent = `.rix-pdf-only { display: block !important; }`;
  document.head.appendChild(marker);

  const holder = sanitizeColorsForCanvas(el);

  try {
    await html2pdf()
      .set({
        margin: [10, 10, 12, 10],
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy", "avoid-all"] },
      } as any)
      .from(holder.firstElementChild as HTMLElement)
      .save();
  } finally {
    holder.remove();
    marker.remove();
  }
}