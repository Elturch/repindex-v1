// RepIndex PPTX Designer - B/W Professional Design System v2.0
// Improved framing, proportions, and visual harmony
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

// ============================================
// DESIGN SYSTEM CONSTANTS - Golden Ratio Based
// ============================================

// RepIndex B/W Color Palette
const COLORS = {
  black: '000000',
  white: 'FFFFFF',
  grayDark: '1A1A1A',
  grayMid: '6B7280',
  grayLight: 'E5E7EB',
  grayBg: 'F9FAFB',
  green: '10B981',
  red: 'EF4444',
};

// Slide dimensions (16:9 LAYOUT_WIDE = 13.33" x 7.5")
const SLIDE = {
  width: 13.33,
  height: 7.5,
};

// Golden ratio-based spacing system
const SPACING = {
  xs: 0.2,
  sm: 0.35,
  md: 0.5,
  lg: 0.75,
  xl: 1.0,
  xxl: 1.5,
};

// Content margins and safe areas
const LAYOUT = {
  marginX: 0.6,
  marginY: 0.5,
  contentWidth: SLIDE.width - 1.2, // 12.13"
  contentHeight: SLIDE.height - 1.0, // 6.5"
  accentBarWidth: 0.15,
  logoWidth: 2.0,
  logoHeight: 0.55,
  isotipoSize: 1.2,
  footerY: SLIDE.height - 0.6,
};

// Typography scale
const TYPOGRAPHY = {
  hero: { size: 44, lineSpacing: 1.1 },
  h1: { size: 32, lineSpacing: 1.15 },
  h2: { size: 24, lineSpacing: 1.2 },
  h3: { size: 18, lineSpacing: 1.25 },
  body: { size: 14, lineSpacing: 1.4 },
  small: { size: 12, lineSpacing: 1.3 },
  caption: { size: 10, lineSpacing: 1.2 },
  footer: { size: 9, lineSpacing: 1 },
};

// Logo paths
const LOGO_PATHS = {
  logoBlack: '/pptx/repindex-logo-black.png',
  logoWhite: '/pptx/repindex-logo-white.png',
  isotipoBlack: '/pptx/repindex-isotipo-black.png',
  isotipoWhite: '/pptx/repindex-isotipo-white.png',
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

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

// Add common elements (logo, footer, accent)
const addLogoTopRight = (slide: pptxgen.Slide, logo: string | undefined, isWhite: boolean) => {
  if (logo) {
    slide.addImage({
      data: logo,
      x: SLIDE.width - LAYOUT.logoWidth - LAYOUT.marginX,
      y: LAYOUT.marginY,
      w: LAYOUT.logoWidth,
      h: LAYOUT.logoHeight,
    });
  } else {
    slide.addText('RepIndex.ai', {
      x: SLIDE.width - LAYOUT.logoWidth - LAYOUT.marginX,
      y: LAYOUT.marginY,
      w: LAYOUT.logoWidth,
      h: LAYOUT.logoHeight,
      fontSize: 14,
      fontFace: 'Inter',
      color: isWhite ? COLORS.white : COLORS.black,
      bold: true,
      align: 'right',
    });
  }
};

const addFooter = (slide: pptxgen.Slide, color: string = COLORS.grayMid) => {
  slide.addText('www.repindex.ai', {
    x: LAYOUT.marginX,
    y: LAYOUT.footerY,
    w: 3,
    h: 0.3,
    fontSize: TYPOGRAPHY.footer.size,
    fontFace: 'Inter',
    color,
  });
};

const addAccentBar = (slide: pptxgen.Slide) => {
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: LAYOUT.accentBarWidth,
    h: SLIDE.height,
    fill: { color: COLORS.black },
  });
};

// ============================================
// SLIDE MASTERS
// ============================================

export const defineRepIndexMasters = (pres: pptxgen) => {
  pres.defineSlideMaster({
    title: 'HERO_BLACK',
    background: { color: COLORS.black },
  });

  pres.defineSlideMaster({
    title: 'CONTENT_WHITE',
    background: { color: COLORS.white },
  });

  pres.defineSlideMaster({
    title: 'DARK',
    background: { color: COLORS.grayDark },
  });
};

// ============================================
// SLIDE RENDERERS
// ============================================

// HERO SLIDE - Black background, company name prominent
export const renderHeroSlide = async (
  pres: pptxgen, 
  data: HeroSlideData, 
  logoBase64?: string, 
  isotipoBase64?: string,
  companyName?: string
) => {
  const slide = pres.addSlide({ masterName: 'HERO_BLACK' });
  
  // Use company_name from data or passed parameter
  const company = data.company_name || companyName;

  // Decorative isotipo - bottom right, large, very subtle
  if (isotipoBase64) {
    const isoSize = 4;
    slide.addImage({
      data: isotipoBase64,
      x: SLIDE.width - isoSize - SPACING.lg,
      y: SLIDE.height - isoSize - SPACING.md,
      w: isoSize,
      h: isoSize,
      transparency: 90,
    });
  }

  // Logo top right
  addLogoTopRight(slide, logoBase64, true);

  // Company name - TOP, large, prominent (letter-spaced label style)
  if (company) {
    // Split characters for letter-spacing effect
    const spacedName = company.toUpperCase().split('').join('  ');
    slide.addText(spacedName, {
      x: LAYOUT.marginX,
      y: 1.8,
      w: LAYOUT.contentWidth,
      h: 0.8,
      fontSize: 14,
      fontFace: 'Inter',
      color: COLORS.grayMid,
      align: 'center',
    });
  }

  // Main headline - centered, large, white
  slide.addText(data.headline, {
    x: LAYOUT.marginX,
    y: company ? 2.6 : 2.4,
    w: LAYOUT.contentWidth,
    h: 1.8,
    fontSize: TYPOGRAPHY.hero.size,
    fontFace: 'Inter',
    color: COLORS.white,
    bold: true,
    align: 'center',
    valign: 'middle',
  });

  // Subheadline
  if (data.subheadline) {
    slide.addText(data.subheadline, {
      x: 1.5,
      y: 4.6,
      w: SLIDE.width - 3,
      h: 0.8,
      fontSize: TYPOGRAPHY.h3.size,
      fontFace: 'Inter',
      color: COLORS.grayMid,
      align: 'center',
    });
  }

  // Elegant bottom line
  slide.addShape('line', {
    x: (SLIDE.width - 4) / 2,
    y: 5.8,
    w: 4,
    h: 0,
    line: { color: COLORS.grayMid, width: 0.5 },
  });

  // Footer
  slide.addText('Análisis de Percepción Algorítmica', {
    x: LAYOUT.marginX,
    y: LAYOUT.footerY,
    w: LAYOUT.contentWidth,
    h: 0.3,
    fontSize: TYPOGRAPHY.footer.size,
    fontFace: 'Inter',
    color: COLORS.grayMid,
    align: 'center',
  });
};

// CONTENT SLIDE - White background, left accent bar
export const renderContentSlide = async (pres: pptxgen, data: ContentSlideData, logoBase64?: string) => {
  const slide = pres.addSlide({ masterName: 'CONTENT_WHITE' });

  addAccentBar(slide);
  addLogoTopRight(slide, logoBase64, false);

  // Title with proper spacing
  slide.addText(data.title, {
    x: LAYOUT.marginX + LAYOUT.accentBarWidth,
    y: LAYOUT.marginY,
    w: LAYOUT.contentWidth - LAYOUT.accentBarWidth,
    h: 0.8,
    fontSize: TYPOGRAPHY.h2.size,
    fontFace: 'Inter',
    color: COLORS.black,
    bold: true,
  });

  // Separator line
  slide.addShape('line', {
    x: LAYOUT.marginX + LAYOUT.accentBarWidth,
    y: 1.4,
    w: LAYOUT.contentWidth - LAYOUT.accentBarWidth - 2,
    h: 0,
    line: { color: COLORS.grayLight, width: 1 },
  });

  // Bullets with consistent spacing
  const bulletStartY = 1.8;
  const bulletSpacing = 0.85;
  
  data.bullets.slice(0, 5).forEach((bullet, i) => {
    slide.addText(`•  ${bullet}`, {
      x: LAYOUT.marginX + LAYOUT.accentBarWidth + SPACING.sm,
      y: bulletStartY + i * bulletSpacing,
      w: LAYOUT.contentWidth - LAYOUT.accentBarWidth - 1,
      h: 0.75,
      fontSize: TYPOGRAPHY.body.size,
      fontFace: 'Inter',
      color: COLORS.grayDark,
      valign: 'top',
    });
  });

  addFooter(slide);
};

// SPLIT SLIDE - Text left, stat right with proper proportions
export const renderSplitSlide = async (pres: pptxgen, data: SplitSlideData, logoBase64?: string) => {
  const slide = pres.addSlide({ masterName: 'CONTENT_WHITE' });

  addAccentBar(slide);
  addLogoTopRight(slide, logoBase64, false);

  // Left section (60% width)
  const leftWidth = (LAYOUT.contentWidth - LAYOUT.accentBarWidth) * 0.55;
  const rightWidth = (LAYOUT.contentWidth - LAYOUT.accentBarWidth) * 0.4;
  const rightX = SLIDE.width - rightWidth - LAYOUT.marginX;

  // Title
  slide.addText(data.title, {
    x: LAYOUT.marginX + LAYOUT.accentBarWidth + SPACING.sm,
    y: LAYOUT.marginY,
    w: leftWidth,
    h: 0.8,
    fontSize: TYPOGRAPHY.h2.size,
    fontFace: 'Inter',
    color: COLORS.black,
    bold: true,
  });

  // Bullets on left
  const bulletStartY = 1.6;
  data.bullets.slice(0, 4).forEach((bullet, i) => {
    slide.addText(`•  ${bullet}`, {
      x: LAYOUT.marginX + LAYOUT.accentBarWidth + SPACING.sm,
      y: bulletStartY + i * 0.9,
      w: leftWidth - SPACING.md,
      h: 0.8,
      fontSize: TYPOGRAPHY.body.size,
      fontFace: 'Inter',
      color: COLORS.grayDark,
      valign: 'top',
    });
  });

  // Highlight stat box on right - better proportions
  if (data.highlight_stat) {
    const boxHeight = 4;
    const boxY = (SLIDE.height - boxHeight) / 2;

    // Box with elegant border
    slide.addShape('roundRect', {
      x: rightX,
      y: boxY,
      w: rightWidth,
      h: boxHeight,
      fill: { color: COLORS.grayBg },
      line: { color: COLORS.black, width: 2.5 },
      rectRadius: 0.15,
    });

    // Big number - centered vertically in upper portion
    slide.addText(data.highlight_stat.value, {
      x: rightX,
      y: boxY + 0.8,
      w: rightWidth,
      h: 1.6,
      fontSize: 52,
      fontFace: 'Inter',
      color: COLORS.black,
      bold: true,
      align: 'center',
      valign: 'middle',
    });

    // Label - centered in lower portion
    slide.addText(data.highlight_stat.label, {
      x: rightX + SPACING.sm,
      y: boxY + 2.6,
      w: rightWidth - SPACING.md,
      h: 1,
      fontSize: TYPOGRAPHY.small.size,
      fontFace: 'Inter',
      color: COLORS.grayDark,
      align: 'center',
      valign: 'top',
    });
  }

  addFooter(slide);
};

// METRICS SLIDE - KPI boxes with balanced layout
export const renderMetricsSlide = async (pres: pptxgen, data: MetricsSlideData, logoBase64?: string) => {
  const slide = pres.addSlide({ masterName: 'CONTENT_WHITE' });

  addAccentBar(slide);
  addLogoTopRight(slide, logoBase64, false);

  // Title
  slide.addText(data.title, {
    x: LAYOUT.marginX + LAYOUT.accentBarWidth + SPACING.sm,
    y: LAYOUT.marginY,
    w: LAYOUT.contentWidth - LAYOUT.accentBarWidth - 3,
    h: 0.8,
    fontSize: TYPOGRAPHY.h2.size,
    fontFace: 'Inter',
    color: COLORS.black,
    bold: true,
  });

  const numMetrics = Math.min(data.metrics.length, 4);
  const totalGap = SPACING.md * (numMetrics - 1);
  const availableWidth = LAYOUT.contentWidth - LAYOUT.accentBarWidth - SPACING.md;
  const boxWidth = (availableWidth - totalGap) / numMetrics;
  const boxHeight = 4.2;
  const boxY = 1.6;
  const startX = LAYOUT.marginX + LAYOUT.accentBarWidth + SPACING.md;

  data.metrics.slice(0, 4).forEach((metric, i) => {
    const x = startX + i * (boxWidth + SPACING.md);

    // Metric box
    slide.addShape('roundRect', {
      x,
      y: boxY,
      w: boxWidth,
      h: boxHeight,
      fill: { color: COLORS.grayBg },
      line: { color: COLORS.black, width: 2 },
      rectRadius: 0.12,
    });

    // Value
    slide.addText(metric.value, {
      x,
      y: boxY + 0.6,
      w: boxWidth,
      h: 1.4,
      fontSize: 36,
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
      y: boxY + 2,
      w: boxWidth,
      h: 0.7,
      fontSize: 24,
      color: trendColor,
      align: 'center',
      bold: true,
    });

    // Label
    slide.addText(metric.label, {
      x: x + SPACING.xs,
      y: boxY + 2.8,
      w: boxWidth - SPACING.sm,
      h: 1.2,
      fontSize: TYPOGRAPHY.small.size,
      fontFace: 'Inter',
      color: COLORS.grayDark,
      align: 'center',
      valign: 'top',
    });
  });

  addFooter(slide);
};

// COMPARISON SLIDE - Split B/W with balanced columns
export const renderComparisonSlide = async (
  pres: pptxgen, 
  data: ComparisonSlideData, 
  logoWhite?: string, 
  logoBlack?: string
) => {
  const slide = pres.addSlide({ masterName: 'CONTENT_WHITE' });

  const splitX = SLIDE.width / 2;

  // Left side - BLACK
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: splitX,
    h: SLIDE.height,
    fill: { color: COLORS.black },
  });

  // Title spanning both (on gray bar)
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: SLIDE.width,
    h: 0.9,
    fill: { color: COLORS.grayDark },
  });
  
  slide.addText(data.title, {
    x: LAYOUT.marginX,
    y: 0.2,
    w: LAYOUT.contentWidth,
    h: 0.5,
    fontSize: TYPOGRAPHY.h3.size,
    fontFace: 'Inter',
    color: COLORS.white,
    align: 'center',
  });

  const columnWidth = splitX - SPACING.lg * 2;
  const leftHighlight = data.winner === 'left';
  const rightHighlight = data.winner === 'right';

  // Left column label
  slide.addText(data.left.label, {
    x: SPACING.lg,
    y: 1.3,
    w: columnWidth,
    h: 0.7,
    fontSize: TYPOGRAPHY.h3.size,
    fontFace: 'Inter',
    color: COLORS.white,
    bold: true,
    align: 'center',
  });

  // Left points
  data.left.points.slice(0, 5).forEach((point, i) => {
    slide.addText(`• ${point}`, {
      x: SPACING.lg,
      y: 2.2 + i * 0.75,
      w: columnWidth,
      h: 0.65,
      fontSize: TYPOGRAPHY.small.size,
      fontFace: 'Inter',
      color: leftHighlight ? COLORS.white : COLORS.grayMid,
    });
  });

  // Right column label
  slide.addText(data.right.label, {
    x: splitX + SPACING.lg,
    y: 1.3,
    w: columnWidth,
    h: 0.7,
    fontSize: TYPOGRAPHY.h3.size,
    fontFace: 'Inter',
    color: COLORS.black,
    bold: true,
    align: 'center',
  });

  // Right points
  data.right.points.slice(0, 5).forEach((point, i) => {
    slide.addText(`• ${point}`, {
      x: splitX + SPACING.lg,
      y: 2.2 + i * 0.75,
      w: columnWidth,
      h: 0.65,
      fontSize: TYPOGRAPHY.small.size,
      fontFace: 'Inter',
      color: rightHighlight ? COLORS.black : COLORS.grayMid,
    });
  });

  // VS circle - centered on split
  const vsSize = 1;
  slide.addShape('ellipse', {
    x: splitX - vsSize / 2,
    y: SLIDE.height / 2 - vsSize / 2,
    w: vsSize,
    h: vsSize,
    fill: { color: COLORS.grayDark },
    line: { color: COLORS.white, width: 2 },
  });
  slide.addText('VS', {
    x: splitX - vsSize / 2,
    y: SLIDE.height / 2 - 0.25,
    w: vsSize,
    h: 0.5,
    fontSize: 14,
    fontFace: 'Inter',
    color: COLORS.white,
    bold: true,
    align: 'center',
  });

  // Logos at bottom
  if (logoWhite) {
    slide.addImage({ 
      data: logoWhite, 
      x: SPACING.lg, 
      y: LAYOUT.footerY - 0.1, 
      w: 1.6, 
      h: 0.45 
    });
  }
  if (logoBlack) {
    slide.addImage({ 
      data: logoBlack, 
      x: SLIDE.width - 1.6 - SPACING.lg, 
      y: LAYOUT.footerY - 0.1, 
      w: 1.6, 
      h: 0.45 
    });
  }
};

// THREE COLUMNS SLIDE - Balanced 3-column layout
export const renderThreeColumnsSlide = async (pres: pptxgen, data: ThreeColumnsSlideData, logoBase64?: string) => {
  const slide = pres.addSlide({ masterName: 'CONTENT_WHITE' });

  addAccentBar(slide);
  addLogoTopRight(slide, logoBase64, false);

  // Title
  slide.addText(data.title, {
    x: LAYOUT.marginX + LAYOUT.accentBarWidth + SPACING.sm,
    y: LAYOUT.marginY,
    w: LAYOUT.contentWidth - LAYOUT.accentBarWidth - 3,
    h: 0.8,
    fontSize: TYPOGRAPHY.h2.size,
    fontFace: 'Inter',
    color: COLORS.black,
    bold: true,
  });

  const numCols = Math.min(data.columns.length, 3);
  const totalGap = SPACING.md * (numCols - 1);
  const availableWidth = LAYOUT.contentWidth - LAYOUT.accentBarWidth - SPACING.md;
  const colWidth = (availableWidth - totalGap) / numCols;
  const colHeight = 4.8;
  const colY = 1.4;
  const startX = LAYOUT.marginX + LAYOUT.accentBarWidth + SPACING.md;

  data.columns.slice(0, 3).forEach((col, i) => {
    const x = startX + i * (colWidth + SPACING.md);

    // Column box
    slide.addShape('roundRect', {
      x,
      y: colY,
      w: colWidth,
      h: colHeight,
      fill: { color: COLORS.grayBg },
      line: { color: COLORS.grayLight, width: 1 },
      rectRadius: 0.12,
    });

    // Icon
    slide.addText(col.icon, {
      x,
      y: colY + 0.4,
      w: colWidth,
      h: 0.9,
      fontSize: 32,
      align: 'center',
    });

    // Column title
    slide.addText(col.title, {
      x: x + SPACING.xs,
      y: colY + 1.5,
      w: colWidth - SPACING.sm,
      h: 0.7,
      fontSize: TYPOGRAPHY.body.size,
      fontFace: 'Inter',
      color: COLORS.black,
      bold: true,
      align: 'center',
    });

    // Column text
    slide.addText(col.text, {
      x: x + SPACING.sm,
      y: colY + 2.3,
      w: colWidth - SPACING.md,
      h: 2.2,
      fontSize: TYPOGRAPHY.small.size,
      fontFace: 'Inter',
      color: COLORS.grayDark,
      align: 'center',
      valign: 'top',
    });
  });

  addFooter(slide);
};

// QUOTE SLIDE - Elegant black background with quote
export const renderQuoteSlide = async (pres: pptxgen, data: QuoteSlideData, logoBase64?: string) => {
  const slide = pres.addSlide({ masterName: 'HERO_BLACK' });

  // Large opening quote mark as decorative element
  slide.addText('"', {
    x: LAYOUT.marginX,
    y: 0.3,
    w: 2,
    h: 2.5,
    fontSize: 180,
    color: COLORS.grayDark,
    fontFace: 'Georgia',
    transparency: 60,
  });

  addLogoTopRight(slide, logoBase64, true);

  // Quote text - centered with good padding
  slide.addText(data.quote, {
    x: 1.5,
    y: 2,
    w: SLIDE.width - 3,
    h: 2.5,
    fontSize: TYPOGRAPHY.h2.size,
    fontFace: 'Inter',
    color: COLORS.white,
    italic: true,
    align: 'center',
    valign: 'middle',
  });

  // Attribution
  if (data.attribution) {
    slide.addText(`— ${data.attribution}`, {
      x: 1.5,
      y: 4.8,
      w: SLIDE.width - 3,
      h: 0.5,
      fontSize: TYPOGRAPHY.body.size,
      fontFace: 'Inter',
      color: COLORS.grayMid,
      align: 'center',
    });
  }

  // Context
  if (data.context) {
    slide.addText(data.context, {
      x: 1.5,
      y: 5.4,
      w: SLIDE.width - 3,
      h: 0.5,
      fontSize: TYPOGRAPHY.small.size,
      fontFace: 'Inter',
      color: COLORS.grayMid,
      align: 'center',
    });
  }
};

// QUESTIONS SLIDE - Rix questions with visual hierarchy
export const renderQuestionsSlide = async (
  pres: pptxgen, 
  data: QuestionsSlideData, 
  logoBase64?: string, 
  isotipoBase64?: string
) => {
  const slide = pres.addSlide({ masterName: 'CONTENT_WHITE' });

  addAccentBar(slide);
  
  // Decorative isotipo - bottom right, subtle
  if (isotipoBase64) {
    slide.addImage({
      data: isotipoBase64,
      x: SLIDE.width - LAYOUT.isotipoSize - SPACING.md,
      y: SLIDE.height - LAYOUT.isotipoSize - SPACING.md,
      w: LAYOUT.isotipoSize,
      h: LAYOUT.isotipoSize,
      transparency: 70,
    });
  }

  addLogoTopRight(slide, logoBase64, false);

  // Title
  slide.addText(data.title, {
    x: LAYOUT.marginX + LAYOUT.accentBarWidth + SPACING.sm,
    y: LAYOUT.marginY,
    w: LAYOUT.contentWidth - LAYOUT.accentBarWidth - 3,
    h: 0.8,
    fontSize: TYPOGRAPHY.h3.size,
    fontFace: 'Inter',
    color: COLORS.black,
    bold: true,
  });

  // Questions with better spacing
  const startY = 1.5;
  const questionSpacing = 1.3;

  data.questions.slice(0, 4).forEach((q, i) => {
    const y = startY + i * questionSpacing;

    // Question number circle
    slide.addShape('ellipse', {
      x: LAYOUT.marginX + LAYOUT.accentBarWidth + SPACING.md,
      y: y + 0.05,
      w: 0.45,
      h: 0.45,
      fill: { color: COLORS.black },
    });
    slide.addText(`${i + 1}`, {
      x: LAYOUT.marginX + LAYOUT.accentBarWidth + SPACING.md,
      y: y + 0.05,
      w: 0.45,
      h: 0.45,
      fontSize: 12,
      fontFace: 'Inter',
      color: COLORS.white,
      bold: true,
      align: 'center',
      valign: 'middle',
    });

    // Question text
    slide.addText(`"${q.question}"`, {
      x: LAYOUT.marginX + LAYOUT.accentBarWidth + SPACING.md + 0.6,
      y,
      w: LAYOUT.contentWidth - 3,
      h: 0.55,
      fontSize: TYPOGRAPHY.body.size,
      fontFace: 'Inter',
      color: COLORS.black,
    });

    // Why it matters
    slide.addText(`→ ${q.why_it_matters}`, {
      x: LAYOUT.marginX + LAYOUT.accentBarWidth + SPACING.md + 0.6,
      y: y + 0.55,
      w: LAYOUT.contentWidth - 3,
      h: 0.5,
      fontSize: TYPOGRAPHY.small.size,
      fontFace: 'Inter',
      color: COLORS.grayMid,
      italic: true,
    });
  });

  addFooter(slide);
};

// CTA SLIDE - Strong call to action with prominent branding
export const renderCTASlide = async (
  pres: pptxgen, 
  data: CTASlideData, 
  logoBase64?: string, 
  isotipoBase64?: string
) => {
  const slide = pres.addSlide({ masterName: 'HERO_BLACK' });

  // Large centered isotipo
  if (isotipoBase64) {
    const isoSize = 3;
    slide.addImage({
      data: isotipoBase64,
      x: (SLIDE.width - isoSize) / 2,
      y: 0.8,
      w: isoSize,
      h: isoSize,
    });
  }

  // Headline
  slide.addText(data.headline, {
    x: LAYOUT.marginX,
    y: 4.2,
    w: LAYOUT.contentWidth,
    h: 1,
    fontSize: TYPOGRAPHY.h1.size,
    fontFace: 'Inter',
    color: COLORS.white,
    bold: true,
    align: 'center',
  });

  // Subtext
  if (data.subtext) {
    slide.addText(data.subtext, {
      x: 1.5,
      y: 5.2,
      w: SLIDE.width - 3,
      h: 0.5,
      fontSize: TYPOGRAPHY.h3.size,
      fontFace: 'Inter',
      color: COLORS.grayMid,
      align: 'center',
    });
  }

  // CTA button
  const buttonWidth = 4.5;
  const buttonX = (SLIDE.width - buttonWidth) / 2;
  slide.addShape('roundRect', {
    x: buttonX,
    y: 6,
    w: buttonWidth,
    h: 0.7,
    fill: { color: COLORS.white },
    rectRadius: 0.35,
  });
  slide.addText(data.button_text, {
    x: buttonX,
    y: 6,
    w: buttonWidth,
    h: 0.7,
    fontSize: TYPOGRAPHY.body.size,
    fontFace: 'Inter',
    color: COLORS.black,
    bold: true,
    align: 'center',
    valign: 'middle',
  });
};

// ============================================
// MAIN RENDER FUNCTION
// ============================================

export const renderSlideFromDesign = async (
  pres: pptxgen,
  slideDesign: SlideDesign,
  assets: {
    logoBlack?: string;
    logoWhite?: string;
    isotipoBlack?: string;
    isotipoWhite?: string;
  },
  companyName?: string
) => {
  switch (slideDesign.slideType) {
    case 'hero':
      await renderHeroSlide(pres, slideDesign, assets.logoWhite, assets.isotipoWhite, companyName);
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

  // Configure presentation - 16:9 wide format
  pres.layout = 'LAYOUT_WIDE';
  pres.author = 'RepIndex';
  pres.title = `Propuesta Comercial - ${metadata.company}`;
  pres.subject = 'Análisis de Percepción Algorítmica';
  pres.company = 'RepIndex';

  // Define slide masters
  defineRepIndexMasters(pres);

  // Load brand assets
  const assets = await loadBrandAssets();

  // Render each slide, passing company name for hero
  for (const slide of slides) {
    await renderSlideFromDesign(pres, slide, assets, metadata.company);
  }

  return pres;
};
