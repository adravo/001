import { Score, ScoreLayout, LayoutPage, LayoutSystem, LayoutMeasure } from '../../domain/types';
import { layoutSystem, fitMeasuresToSystem } from './system-layout';

export interface PageLayoutConfig {
  pageWidth: number;
  pageHeight: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  staffSpace: number;
  systemGap: number; // gap between systems
  firstSystemIndent: number;
}

const HEADER_HEIGHT = 80; // space for title etc.
const SYSTEM_MARGIN = 20; // extra space around systems

export function computeScoreLayout(score: Score, config: PageLayoutConfig): ScoreLayout {
  const {
    pageWidth, pageHeight, marginTop, marginBottom, marginLeft, marginRight,
    staffSpace, systemGap, firstSystemIndent
  } = config;

  if (!score.parts.length || !score.parts[0].measures.length) {
    return {
      pages: [{
        systems: [],
        pageNumber: 1,
        width: pageWidth,
        height: pageHeight,
      }],
      totalWidth: pageWidth,
      totalHeight: pageHeight,
    };
  }

  const allMeasureIds = score.parts[0].measures.map(m => m.id);
  const pages: LayoutPage[] = [];
  let measureIndex = 0;
  let pageNumber = 1;
  let isFirstSystem = true;

  while (measureIndex < allMeasureIds.length) {
    const page: LayoutPage = {
      systems: [],
      pageNumber,
      width: pageWidth,
      height: pageHeight,
    };

    let currentY = marginTop + (pageNumber === 1 ? HEADER_HEIGHT : 0);
    const availableHeight = pageHeight - marginTop - marginBottom;

    while (measureIndex < allMeasureIds.length) {
      // Calculate system height (sum of all part heights)
      const systemConfig = {
        pageWidth,
        marginLeft,
        marginRight,
        staffSpace,
        systemY: currentY,
        firstSystem: isFirstSystem,
        firstSystemIndent,
      };

      // Find measures for this system
      const systemMeasureIds = fitMeasuresToSystem(score, measureIndex, systemConfig);
      if (systemMeasureIds.length === 0) break;

      // Layout the system
      const systemResult = layoutSystem(score, systemMeasureIds, systemConfig);

      // Check if system fits on page
      if (currentY + systemResult.height > pageHeight - marginBottom && page.systems.length > 0) {
        break; // Start new page
      }

      // Group measure layouts by system (not by part)
      const uniqueMeasureLayouts: LayoutMeasure[] = [];
      const seenMeasures = new Set<string>();

      systemResult.measures.forEach(lm => {
        if (!seenMeasures.has(lm.measureId)) {
          seenMeasures.add(lm.measureId);
          uniqueMeasureLayouts.push(lm);
        }
      });

      const system: LayoutSystem = {
        measures: uniqueMeasureLayouts,
        y: currentY,
        width: systemResult.width,
        height: systemResult.height,
        firstSystem: isFirstSystem,
      };

      page.systems.push(system);

      currentY += systemResult.height + systemGap * staffSpace;
      measureIndex += systemMeasureIds.length;
      isFirstSystem = false;
    }

    pages.push(page);
    pageNumber++;

    if (measureIndex >= allMeasureIds.length) break;
  }

  if (pages.length === 0) {
    pages.push({
      systems: [],
      pageNumber: 1,
      width: pageWidth,
      height: pageHeight,
    });
  }

  return {
    pages,
    totalWidth: pageWidth,
    totalHeight: pages.length * pageHeight,
  };
}

// Convert mm to pixels (assuming 96 DPI screen, 1 inch = 25.4mm)
export function mmToPixels(mm: number, dpi: number = 96): number {
  return (mm / 25.4) * dpi;
}

export function getDefaultPageConfig(score: Score, staffSpace: number): PageLayoutConfig {
  const settings = score.settings;
  return {
    pageWidth: mmToPixels(settings.page.width),
    pageHeight: mmToPixels(settings.page.height),
    marginTop: mmToPixels(settings.page.marginTop),
    marginBottom: mmToPixels(settings.page.marginBottom),
    marginLeft: mmToPixels(settings.page.marginLeft),
    marginRight: mmToPixels(settings.page.marginRight),
    staffSpace,
    systemGap: settings.systemDistance,
    firstSystemIndent: settings.firstSystemIndent * staffSpace,
  };
}
