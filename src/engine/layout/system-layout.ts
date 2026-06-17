import { Score, Part, Measure, ScoreLayout, LayoutSystem, LayoutMeasure, LayoutPage } from '../../domain/types';
import { layoutMeasure } from './measure-layout';

export interface SystemLayoutConfig {
  pageWidth: number;
  marginLeft: number;
  marginRight: number;
  staffSpace: number;
  systemY: number; // starting Y on page
  firstSystem: boolean;
  firstSystemIndent: number;
}

export interface SystemLayoutResult {
  measures: LayoutMeasure[];
  width: number;
  height: number;
  measuresInSystem: string[]; // measureIds included
}

const STAFF_HEIGHT_SPACES = 4; // staff height in staff spaces
const INTER_STAFF_SPACES = 2; // between staves of same part (grand staff)
const INTER_PART_SPACES = 6; // between parts
const MIN_MEASURES_PER_SYSTEM = 1;
const IDEAL_MEASURES_PER_SYSTEM = 4;

export function layoutSystem(
  score: Score,
  measureIds: string[],
  config: SystemLayoutConfig
): SystemLayoutResult {
  const { pageWidth, marginLeft, marginRight, staffSpace, firstSystem, firstSystemIndent } = config;

  const availableWidth = pageWidth - marginLeft - marginRight;
  const contentStartX = marginLeft + (firstSystem ? firstSystemIndent : 0);
  const contentWidth = availableWidth - (firstSystem ? firstSystemIndent : 0);

  // Calculate heights for each part
  const partHeights = score.parts.map(part => {
    const stavesHeight = (part.staves.length * STAFF_HEIGHT_SPACES +
      (part.staves.length - 1) * INTER_STAFF_SPACES) * staffSpace;
    return stavesHeight;
  });

  const totalPartsHeight = partHeights.reduce((sum, h) => sum + h, 0) +
    (score.parts.length - 1) * INTER_PART_SPACES * staffSpace;

  // Lay out measures
  const measureLayouts: LayoutMeasure[] = [];
  let totalNaturalWidth = contentStartX - marginLeft;

  // Calculate natural widths for all measures
  const measureWidths = measureIds.map((measureId, i) => {
    const isFirst = i === 0;
    let maxWidth = 0;

    score.parts.forEach(part => {
      const measure = part.measures.find(m => m.id === measureId);
      if (!measure) return;

      const staff = part.staves[0];
      const result = layoutMeasure(measure, {
        showClef: isFirst,
        clef: staff.clef,
        showKeySignature: isFirst || !!measure.keySignature,
        keySignature: measure.keySignature || { fifths: 0, mode: 'major' },
        showTimeSignature: !!measure.timeSignature,
        timeSignature: measure.timeSignature,
        staffSpace,
        minWidth: staffSpace * 10,
      });

      maxWidth = Math.max(maxWidth, result.width);
    });

    return maxWidth;
  });

  totalNaturalWidth += measureWidths.reduce((sum, w) => sum + w, 0);

  // Scale widths to fill the system width
  const scaleFactor = contentWidth / Math.max(totalNaturalWidth, contentWidth);
  const clampedScale = Math.min(1.3, Math.max(0.8, scaleFactor)); // don't stretch/compress too much

  let currentX = contentStartX;
  measureIds.forEach((measureId, i) => {
    const naturalWidth = measureWidths[i];
    const scaledWidth = naturalWidth * clampedScale;

    let partY = config.systemY;
    const partMeasures: LayoutMeasure[] = [];

    score.parts.forEach((part, partIndex) => {
      const measure = part.measures.find(m => m.id === measureId);
      const staffY = partY;

      partMeasures.push({
        measureId,
        partId: part.id,
        x: currentX,
        y: staffY,
        width: scaledWidth,
        height: partHeights[partIndex],
        notePositions: {},
      });

      partY += partHeights[partIndex] + INTER_PART_SPACES * staffSpace;
    });

    measureLayouts.push(...partMeasures);
    currentX += scaledWidth;
  });

  return {
    measures: measureLayouts,
    width: contentWidth,
    height: totalPartsHeight,
    measuresInSystem: measureIds,
  };
}

// Determine how many measures fit in a system
export function fitMeasuresToSystem(
  score: Score,
  startMeasureIndex: number,
  config: SystemLayoutConfig
): string[] {
  const { pageWidth, marginLeft, marginRight, staffSpace, firstSystem, firstSystemIndent } = config;
  const availableWidth = pageWidth - marginLeft - marginRight - (firstSystem ? firstSystemIndent : 0);

  const allMeasureIds = score.parts[0]?.measures.map(m => m.id) || [];
  const measuresFromStart = allMeasureIds.slice(startMeasureIndex);

  let usedWidth = 0;
  const fittingIds: string[] = [];

  for (let i = 0; i < measuresFromStart.length; i++) {
    const measureId = measuresFromStart[i];
    const isFirst = i === 0;
    let maxWidth = 0;

    score.parts.forEach(part => {
      const measure = part.measures.find(m => m.id === measureId);
      if (!measure) return;

      const staff = part.staves[0];
      const result = layoutMeasure(measure, {
        showClef: isFirst,
        clef: staff.clef,
        showKeySignature: isFirst || !!measure.keySignature,
        keySignature: measure.keySignature || { fifths: 0, mode: 'major' },
        showTimeSignature: !!measure.timeSignature,
        timeSignature: measure.timeSignature,
        staffSpace,
        minWidth: staffSpace * 10,
      });

      maxWidth = Math.max(maxWidth, result.width);
    });

    if (usedWidth + maxWidth > availableWidth && fittingIds.length >= MIN_MEASURES_PER_SYSTEM) {
      break;
    }

    fittingIds.push(measureId);
    usedWidth += maxWidth;
  }

  return fittingIds;
}
