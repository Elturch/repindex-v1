// RepIndex PPTX Designer - B/W Professional Design System
import pptxgen from 'pptxgenjs';
import type {
  SlideDesign,
  HeroSlideData,
  ContentSlideData,
  SplitSlideData,
  MetricsSlideData,
  ComparisonSlideData,
  ThreeColumnsSlideData,
  QuoteSlideData,
  QuestionsSlideData,
  CTASlideData,
} from './pptxTypes';

// RepIndex B/W Color Palette
const COLORS = {
  black: '000000',
  white: 'FFFFFF',
  grayDark: '1F2937',
  grayMid: '6B7280',
  grayLight: 'E5E7EB',
  grayBg: 'F9FAFB',
  green: '10B981',
  red: 'EF4444',
};

// Base64 encoded logos (will be loaded from public folder)
const LOGO_PATHS = {
  logoBlack: '/pptx/repindex-logo-black.png',
  logoWhite: '/pptx/repindex-logo-white.png',
  isotipoBlack: '/pptx/repindex-isotipo-black.png',
  isotipoWhite: '/pptx/repindex-isotipo-white.png',
};

// Helper to convert image path to base64
async function imageToBase64(path: string): Promise<string> {
  try {
    const response = await fetch(path);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn(`Could not load image: ${path}`, error);
    return '';
  }
}

// Define Slide Masters
export const defineRepIndexMasters = (pres: pptxgen) => {
  // Master: HERO_BLACK - Black background for impact slides
  pres.defineSlideMaster({
    title: 'HERO_BLACK',
    background: { color: COLORS.black },
  });

  // Master: CONTENT_WHITE - White background for content slides  
  pres.defineSlideMaster({
    title: 'CONTENT_WHITE',
    background: { color: COLORS.white },
  });

  // Master: DARK - Dark gray background for quotes
  pres.defineSlideMaster({
    title: 'DARK',
    background: { color: COLORS.grayDark },
  });
};

// Render HERO slide (black background, white text)
export const renderHeroSlide = async (pres: pptxgen, data: HeroSlideData, logoBase64?: string, isotipoBase64?: string) => {
  const slide = pres.addSlide({ masterName: 'HERO_BLACK' });

  // Add isotipo as watermark in bottom right (large, subtle)
  if (isotipoBase64) {
    slide.addImage({
      data: isotipoBase64,
      x: 6.5,
      y: 2.5,
      w: 3.5,
      h: 3.5,
      transparency: 85,
    });
  }

  // Logo in top right
  if (logoBase64) {
    slide.addImage({
      data: logoBase64,
      x: 8,
      y: 0.3,
      w: 1.8,
      h: 0.5,
    });
  } else {
    slide.addText('RepIndex.ai', {
      x: 8,
      y: 0.3,
      w: 1.8,
      h: 0.5,
      fontSize: 14,
      fontFace: 'Inter',
      color: COLORS.white,
      bold: true,
    });
  }

  // Main headline - centered, large, white
  slide.addText(data.headline, {
    x: 0.5,
    y: 2,
    w: 9,
    h: 1.5,
    fontSize: 40,
    fontFace: 'Inter',
    color: COLORS.white,
    bold: true,
    align: 'center',
    valign: 'middle',
  });

  // Subheadline - smaller, gray
  if (data.subheadline) {
    slide.addText(data.subheadline, {
      x: 1,
      y: 3.7,
      w: 8,
      h: 0.8,
      fontSize: 20,
      fontFace: 'Inter',
      color: COLORS.grayMid,
      align: 'center',
    });
  }

  // Bottom line separator
  slide.addShape('line', {
    x: 2,
    y: 4.8,
    w: 6,
    h: 0,
    line: { color: COLORS.grayMid, width: 0.5 },
  });
};

// Render CONTENT slide (white background, black accent bar)
export const renderContentSlide = async (pres: pptxgen, data: ContentSlideData, logoBase64?: string) => {
  const slide = pres.addSlide({ masterName: 'CONTENT_WHITE' });

  // Black accent bar on left
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: 0.12,
    h: 5.63,
    fill: { color: COLORS.black },
  });

  // Logo in top right (black version)
  if (logoBase64) {
    slide.addImage({
      data: logoBase64,
      x: 8,
      y: 0.3,
      w: 1.8,
      h: 0.5,
    });
  } else {
    slide.addText('RepIndex.ai', {
      x: 8,
      y: 0.3,
      w: 1.8,
      h: 0.5,
      fontSize: 14,
      fontFace: 'Inter',
      color: COLORS.black,
      bold: true,
    });
  }

  // Title
  slide.addText(data.title, {
    x: 0.5,
    y: 0.4,
    w: 7,
    h: 0.6,
    fontSize: 24,
    fontFace: 'Inter',
    color: COLORS.black,
    bold: true,
  });

  // Separator line
  slide.addShape('line', {
    x: 0.5,
    y: 1.1,
    w: 9,
    h: 0,
    line: { color: COLORS.grayLight, width: 1 },
  });

  // Bullets
  data.bullets.forEach((bullet, i) => {
    slide.addText(`• ${bullet}`, {
      x: 0.5,
      y: 1.4 + i * 0.7,
      w: 9,
      h: 0.6,
      fontSize: 14,
      fontFace: 'Inter',
      color: COLORS.grayDark,
    });
  });

  // Footer
  slide.addText('www.repindex.ai', {
    x: 0.5,
    y: 5.2,
    w: 3,
    h: 0.3,
    fontSize: 9,
    fontFace: 'Inter',
    color: COLORS.grayMid,
  });
};

// Render SPLIT slide (text left, stat right)
export const renderSplitSlide = async (pres: pptxgen, data: SplitSlideData, logoBase64?: string) => {
  const slide = pres.addSlide({ masterName: 'CONTENT_WHITE' });

  // Black accent bar
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: 0.12,
    h: 5.63,
    fill: { color: COLORS.black },
  });

  // Logo
  if (logoBase64) {
    slide.addImage({
      data: logoBase64,
      x: 8,
      y: 0.3,
      w: 1.8,
      h: 0.5,
    });
  }

  // Title
  slide.addText(data.title, {
    x: 0.5,
    y: 0.4,
    w: 4.5,
    h: 0.6,
    fontSize: 24,
    fontFace: 'Inter',
    color: COLORS.black,
    bold: true,
  });

  // Bullets on left side
  data.bullets.forEach((bullet, i) => {
    slide.addText(`• ${bullet}`, {
      x: 0.5,
      y: 1.3 + i * 0.7,
      w: 4.5,
      h: 0.6,
      fontSize: 14,
      fontFace: 'Inter',
      color: COLORS.grayDark,
    });
  });

  // Highlight stat box on right
  if (data.highlight_stat) {
    // Gray background box
    slide.addShape('roundRect', {
      x: 5.5,
      y: 1,
      w: 4,
      h: 3.5,
      fill: { color: COLORS.grayBg },
      line: { color: COLORS.black, width: 2 },
      rectRadius: 0.15,
    });

    // Big number
    slide.addText(data.highlight_stat.value, {
      x: 5.5,
      y: 1.6,
      w: 4,
      h: 1.4,
      fontSize: 56,
      fontFace: 'Inter',
      color: COLORS.black,
      bold: true,
      align: 'center',
    });

    // Label
    slide.addText(data.highlight_stat.label, {
      x: 5.5,
      y: 3.2,
      w: 4,
      h: 0.8,
      fontSize: 14,
      fontFace: 'Inter',
      color: COLORS.grayDark,
      align: 'center',
    });
  }

  // Footer
  slide.addText('www.repindex.ai', {
    x: 0.5,
    y: 5.2,
    w: 3,
    h: 0.3,
    fontSize: 9,
    fontFace: 'Inter',
    color: COLORS.grayMid,
  });
};

// Render METRICS slide (2-4 KPI boxes)
export const renderMetricsSlide = async (pres: pptxgen, data: MetricsSlideData, logoBase64?: string) => {
  const slide = pres.addSlide({ masterName: 'CONTENT_WHITE' });

  // Accent bar
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: 0.12,
    h: 5.63,
    fill: { color: COLORS.black },
  });

  // Logo
  if (logoBase64) {
    slide.addImage({
      data: logoBase64,
      x: 8,
      y: 0.3,
      w: 1.8,
      h: 0.5,
    });
  }

  // Title
  slide.addText(data.title, {
    x: 0.5,
    y: 0.4,
    w: 7,
    h: 0.6,
    fontSize: 22,
    fontFace: 'Inter',
    color: COLORS.black,
    bold: true,
  });

  const numMetrics = data.metrics.length;
  const boxWidth = (9 - 0.4 * (numMetrics - 1)) / numMetrics;

  data.metrics.forEach((metric, i) => {
    const x = 0.5 + i * (boxWidth + 0.4);

    // Metric box with thick black border
    slide.addShape('roundRect', {
      x,
      y: 1.3,
      w: boxWidth,
      h: 3.2,
      fill: { color: COLORS.grayBg },
      line: { color: COLORS.black, width: 2.5 },
      rectRadius: 0.1,
    });

    // Value (big number)
    slide.addText(metric.value, {
      x,
      y: 1.6,
      w: boxWidth,
      h: 1.2,
      fontSize: 40,
      fontFace: 'Inter',
      color: COLORS.black,
      bold: true,
      align: 'center',
    });

    // Trend arrow
    const trendIcon = metric.trend === 'up' ? '↑' : metric.trend === 'down' ? '↓' : '→';
    const trendColor = metric.trend === 'up' ? COLORS.green : metric.trend === 'down' ? COLORS.red : COLORS.grayMid;
    slide.addText(trendIcon, {
      x,
      y: 2.8,
      w: boxWidth,
      h: 0.6,
      fontSize: 28,
      color: trendColor,
      align: 'center',
      bold: true,
    });

    // Label
    slide.addText(metric.label, {
      x,
      y: 3.5,
      w: boxWidth,
      h: 0.8,
      fontSize: 11,
      fontFace: 'Inter',
      color: COLORS.grayDark,
      align: 'center',
      valign: 'top',
    });
  });

  // Footer
  slide.addText('www.repindex.ai', {
    x: 0.5,
    y: 5.2,
    w: 3,
    h: 0.3,
    fontSize: 9,
    fontFace: 'Inter',
    color: COLORS.grayMid,
  });
};

// Render COMPARISON slide (split B/W vertical)
export const renderComparisonSlide = async (pres: pptxgen, data: ComparisonSlideData, logoWhite?: string, logoBlack?: string) => {
  const slide = pres.addSlide({ masterName: 'CONTENT_WHITE' });

  // Left side - BLACK
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: 5,
    h: 5.63,
    fill: { color: COLORS.black },
  });

  // Right side stays white (from master)

  // Title spanning both sides
  slide.addText(data.title, {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.5,
    fontSize: 18,
    fontFace: 'Inter',
    color: COLORS.grayMid,
    align: 'center',
  });

  // Left column label (white text on black)
  const leftHighlight = data.winner === 'left';
  slide.addText(data.left.label, {
    x: 0.3,
    y: 1,
    w: 4.4,
    h: 0.6,
    fontSize: 18,
    fontFace: 'Inter',
    color: COLORS.white,
    bold: true,
    align: 'center',
  });

  // Left points
  data.left.points.forEach((point, i) => {
    slide.addText(`• ${point}`, {
      x: 0.4,
      y: 1.8 + i * 0.65,
      w: 4.2,
      h: 0.6,
      fontSize: 12,
      fontFace: 'Inter',
      color: leftHighlight ? COLORS.white : COLORS.grayMid,
    });
  });

  // Right column label (black text on white)
  const rightHighlight = data.winner === 'right';
  slide.addText(data.right.label, {
    x: 5.3,
    y: 1,
    w: 4.4,
    h: 0.6,
    fontSize: 18,
    fontFace: 'Inter',
    color: COLORS.black,
    bold: true,
    align: 'center',
  });

  // Right points
  data.right.points.forEach((point, i) => {
    slide.addText(`• ${point}`, {
      x: 5.4,
      y: 1.8 + i * 0.65,
      w: 4.2,
      h: 0.6,
      fontSize: 12,
      fontFace: 'Inter',
      color: rightHighlight ? COLORS.black : COLORS.grayMid,
    });
  });

  // VS divider
  slide.addShape('ellipse', {
    x: 4.5,
    y: 2.5,
    w: 1,
    h: 1,
    fill: { color: COLORS.grayDark },
    line: { color: COLORS.white, width: 2 },
  });
  slide.addText('VS', {
    x: 4.5,
    y: 2.7,
    w: 1,
    h: 0.6,
    fontSize: 14,
    fontFace: 'Inter',
    color: COLORS.white,
    bold: true,
    align: 'center',
  });

  // Logos
  if (logoWhite) {
    slide.addImage({ data: logoWhite, x: 0.3, y: 5, w: 1.5, h: 0.4 });
  }
  if (logoBlack) {
    slide.addImage({ data: logoBlack, x: 8, y: 5, w: 1.5, h: 0.4 });
  }
};

// Render THREE_COLUMNS slide
export const renderThreeColumnsSlide = async (pres: pptxgen, data: ThreeColumnsSlideData, logoBase64?: string) => {
  const slide = pres.addSlide({ masterName: 'CONTENT_WHITE' });

  // Accent bar
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: 0.12,
    h: 5.63,
    fill: { color: COLORS.black },
  });

  // Logo
  if (logoBase64) {
    slide.addImage({ data: logoBase64, x: 8, y: 0.3, w: 1.8, h: 0.5 });
  }

  // Title
  slide.addText(data.title, {
    x: 0.5,
    y: 0.4,
    w: 7,
    h: 0.6,
    fontSize: 22,
    fontFace: 'Inter',
    color: COLORS.black,
    bold: true,
  });

  const colWidth = 2.8;
  const startX = 0.5;

  data.columns.forEach((col, i) => {
    const x = startX + i * (colWidth + 0.35);

    // Column box
    slide.addShape('roundRect', {
      x,
      y: 1.2,
      w: colWidth,
      h: 3.8,
      fill: { color: COLORS.grayBg },
      line: { color: COLORS.grayLight, width: 1 },
      rectRadius: 0.1,
    });

    // Icon
    slide.addText(col.icon, {
      x,
      y: 1.4,
      w: colWidth,
      h: 0.8,
      fontSize: 32,
      align: 'center',
    });

    // Column title
    slide.addText(col.title, {
      x,
      y: 2.3,
      w: colWidth,
      h: 0.6,
      fontSize: 14,
      fontFace: 'Inter',
      color: COLORS.black,
      bold: true,
      align: 'center',
    });

    // Column text
    slide.addText(col.text, {
      x: x + 0.2,
      y: 3,
      w: colWidth - 0.4,
      h: 1.8,
      fontSize: 11,
      fontFace: 'Inter',
      color: COLORS.grayDark,
      align: 'center',
      valign: 'top',
    });
  });

  // Footer
  slide.addText('www.repindex.ai', {
    x: 0.5,
    y: 5.2,
    w: 3,
    h: 0.3,
    fontSize: 9,
    fontFace: 'Inter',
    color: COLORS.grayMid,
  });
};

// Render QUOTE slide (black background, large quote)
export const renderQuoteSlide = async (pres: pptxgen, data: QuoteSlideData, logoBase64?: string) => {
  const slide = pres.addSlide({ masterName: 'HERO_BLACK' });

  // Giant quotation marks as watermark
  slide.addText('"', {
    x: 0.5,
    y: 0.5,
    w: 2,
    h: 2,
    fontSize: 200,
    color: COLORS.grayDark,
    fontFace: 'Georgia',
    transparency: 70,
  });

  // Logo
  if (logoBase64) {
    slide.addImage({ data: logoBase64, x: 8, y: 0.3, w: 1.8, h: 0.5 });
  }

  // Quote text
  slide.addText(data.quote, {
    x: 1,
    y: 1.5,
    w: 8,
    h: 2,
    fontSize: 24,
    fontFace: 'Inter',
    color: COLORS.white,
    italic: true,
    align: 'center',
    valign: 'middle',
  });

  // Attribution
  if (data.attribution) {
    slide.addText(`— ${data.attribution}`, {
      x: 1,
      y: 3.8,
      w: 8,
      h: 0.5,
      fontSize: 14,
      fontFace: 'Inter',
      color: COLORS.grayMid,
      align: 'center',
    });
  }

  // Context
  if (data.context) {
    slide.addText(data.context, {
      x: 1,
      y: 4.4,
      w: 8,
      h: 0.5,
      fontSize: 12,
      fontFace: 'Inter',
      color: COLORS.grayMid,
      align: 'center',
    });
  }
};

// Render QUESTIONS slide (Rix questions)
export const renderQuestionsSlide = async (pres: pptxgen, data: QuestionsSlideData, logoBase64?: string, isotipoBase64?: string) => {
  const slide = pres.addSlide({ masterName: 'CONTENT_WHITE' });

  // Accent bar
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: 0.12,
    h: 5.63,
    fill: { color: COLORS.black },
  });

  // Small isotipo decorative in corner
  if (isotipoBase64) {
    slide.addImage({
      data: isotipoBase64,
      x: 8.5,
      y: 4.5,
      w: 1,
      h: 1,
      transparency: 60,
    });
  }

  // Logo
  if (logoBase64) {
    slide.addImage({ data: logoBase64, x: 8, y: 0.3, w: 1.8, h: 0.5 });
  }

  // Title
  slide.addText(data.title, {
    x: 0.5,
    y: 0.4,
    w: 7,
    h: 0.6,
    fontSize: 20,
    fontFace: 'Inter',
    color: COLORS.black,
    bold: true,
  });

  // Questions
  data.questions.forEach((q, i) => {
    // Question number
    slide.addText(`${i + 1}.`, {
      x: 0.5,
      y: 1.2 + i * 1,
      w: 0.4,
      h: 0.5,
      fontSize: 16,
      fontFace: 'Inter',
      color: COLORS.black,
      bold: true,
    });

    // Question text
    slide.addText(`"${q.question}"`, {
      x: 1,
      y: 1.2 + i * 1,
      w: 8.5,
      h: 0.5,
      fontSize: 14,
      fontFace: 'Inter',
      color: COLORS.black,
    });

    // Why it matters
    slide.addText(`→ ${q.why_it_matters}`, {
      x: 1,
      y: 1.65 + i * 1,
      w: 8.5,
      h: 0.35,
      fontSize: 11,
      fontFace: 'Inter',
      color: COLORS.grayMid,
      italic: true,
    });
  });

  // Footer
  slide.addText('www.repindex.ai', {
    x: 0.5,
    y: 5.2,
    w: 3,
    h: 0.3,
    fontSize: 9,
    fontFace: 'Inter',
    color: COLORS.grayMid,
  });
};

// Render CTA slide (black background, action-oriented)
export const renderCTASlide = async (pres: pptxgen, data: CTASlideData, logoBase64?: string, isotipoBase64?: string) => {
  const slide = pres.addSlide({ masterName: 'HERO_BLACK' });

  // Large isotipo centered
  if (isotipoBase64) {
    slide.addImage({
      data: isotipoBase64,
      x: 3.75,
      y: 0.5,
      w: 2.5,
      h: 2.5,
    });
  }

  // Headline
  slide.addText(data.headline, {
    x: 0.5,
    y: 3.2,
    w: 9,
    h: 0.8,
    fontSize: 32,
    fontFace: 'Inter',
    color: COLORS.white,
    bold: true,
    align: 'center',
  });

  // Subtext
  if (data.subtext) {
    slide.addText(data.subtext, {
      x: 1,
      y: 4,
      w: 8,
      h: 0.5,
      fontSize: 16,
      fontFace: 'Inter',
      color: COLORS.grayMid,
      align: 'center',
    });
  }

  // Button/URL
  slide.addShape('roundRect', {
    x: 3,
    y: 4.6,
    w: 4,
    h: 0.6,
    fill: { color: COLORS.white },
    rectRadius: 0.3,
  });
  slide.addText(data.button_text, {
    x: 3,
    y: 4.6,
    w: 4,
    h: 0.6,
    fontSize: 14,
    fontFace: 'Inter',
    color: COLORS.black,
    bold: true,
    align: 'center',
    valign: 'middle',
  });
};

// Main rendering function
export const renderSlideFromDesign = async (
  pres: pptxgen,
  slideDesign: SlideDesign,
  assets: {
    logoBlack?: string;
    logoWhite?: string;
    isotipoBlack?: string;
    isotipoWhite?: string;
  }
) => {
  switch (slideDesign.slideType) {
    case 'hero':
      await renderHeroSlide(pres, slideDesign, assets.logoWhite, assets.isotipoWhite);
      break;
    case 'content':
      await renderContentSlide(pres, slideDesign, assets.logoBlack);
      break;
    case 'split':
      await renderSplitSlide(pres, slideDesign, assets.logoBlack);
      break;
    case 'metrics':
      await renderMetricsSlide(pres, slideDesign, assets.logoBlack);
      break;
    case 'comparison':
      await renderComparisonSlide(pres, slideDesign, assets.logoWhite, assets.logoBlack);
      break;
    case 'three_columns':
      await renderThreeColumnsSlide(pres, slideDesign, assets.logoBlack);
      break;
    case 'quote':
      await renderQuoteSlide(pres, slideDesign, assets.logoWhite);
      break;
    case 'questions':
      await renderQuestionsSlide(pres, slideDesign, assets.logoBlack, assets.isotipoBlack);
      break;
    case 'cta':
      await renderCTASlide(pres, slideDesign, assets.logoWhite, assets.isotipoWhite);
      break;
  }
};

// Load all brand assets
export const loadBrandAssets = async () => {
  const [logoBlack, logoWhite, isotipoBlack, isotipoWhite] = await Promise.all([
    imageToBase64(LOGO_PATHS.logoBlack),
    imageToBase64(LOGO_PATHS.logoWhite),
    imageToBase64(LOGO_PATHS.isotipoBlack),
    imageToBase64(LOGO_PATHS.isotipoWhite),
  ]);

  return { logoBlack, logoWhite, isotipoBlack, isotipoWhite };
};

// Generate complete presentation from slide designs
export const generateProfessionalPPTX = async (
  slides: SlideDesign[],
  metadata: {
    company: string;
    targetProfile: string;
  }
): Promise<pptxgen> => {
  const pres = new pptxgen();

  // Configure presentation
  pres.layout = 'LAYOUT_WIDE';
  pres.author = 'RepIndex';
  pres.title = `Propuesta Comercial - ${metadata.company}`;
  pres.subject = 'Análisis de Percepción Algorítmica';
  pres.company = 'RepIndex';

  // Define slide masters
  defineRepIndexMasters(pres);

  // Load brand assets
  const assets = await loadBrandAssets();

  // Render each slide
  for (const slide of slides) {
    await renderSlideFromDesign(pres, slide, assets);
  }

  return pres;
};
