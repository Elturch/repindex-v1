// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - html2pdf.js has partial type coverage
import html2pdfImport from "html2pdf.js";
const html2pdf: any = html2pdfImport;

/**
 * Generate a PDF from a full, self-contained HTML document string.
 *
 * We render the HTML inside an off-screen iframe at A4 width so all layout,
 * fonts and colours resolve exactly as they will in the exported PDF. Then
 * we hand the iframe's `<body>` node to html2pdf.
 *
 * The input HTML uses explicit hex / hsl colours from the RepIndex branded
 * shell — there is no `oklch(...)` involved, so no colour sanitisation is
 * needed.
 */
export async function downloadReportPdf(
  html: string,
  filename: string,
): Promise<void> {
  // 1) Mount an off-screen iframe at A4 width so the branded shell lays out
  //    with the same measurements it will have in the PDF.
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.left = "-100000px";
  iframe.style.top = "0";
  iframe.style.width = "900px"; // matches body max-width in brandedReportStyles
  iframe.style.height = "1400px";
  iframe.style.border = "0";
  iframe.style.background = "#ffffff";
  document.body.appendChild(iframe);

  try {
    // 2) Write the branded HTML into the iframe and wait for it to be ready
    //    (including web fonts, which affect measurement and rendering).
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("iframe document unavailable");
    doc.open();
    doc.write(html);
    doc.close();

    await waitForFramePaint(iframe);

    const body = doc.body;
    if (!body) throw new Error("iframe body unavailable");

    // 3) Hand the fully-styled body to html2pdf.
    await html2pdf()
      .set({
        margin: [12, 12, 14, 12],
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
          windowWidth: 900,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy", "avoid-all"] },
      } as any)
      .from(body)
      .save();
  } finally {
    iframe.remove();
  }
}

async function waitForFramePaint(iframe: HTMLIFrameElement): Promise<void> {
  // Wait for load + fonts + one animation frame so layout is stable.
  await new Promise<void>((resolve) => {
    if (iframe.contentDocument?.readyState === "complete") {
      resolve();
      return;
    }
    iframe.addEventListener("load", () => resolve(), { once: true });
    // Fallback: don't hang forever.
    setTimeout(() => resolve(), 1500);
  });
  try {
    const fonts = (iframe.contentDocument as any)?.fonts;
    if (fonts?.ready) await fonts.ready;
  } catch {
    /* ignore */
  }
  await new Promise((r) => requestAnimationFrame(() => r(null)));
}