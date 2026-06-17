import {
  Measure, Part, Staff, TimeSignature, KeySignature, ClefType,
  Note, Chord, DurationType, Clef
} from '../../domain/types';
import { getDurationBeats } from '../../domain/music-theory';
import {
  CLEF_WIDTHS, TIME_SIG_WIDTH, KEY_SIG_ACCIDENTAL_WIDTH,
  MIN_NOTE_SPACING, SPACING_PER_BEAT, ACCIDENTAL_WIDTH, ACCIDENTAL_MARGIN
} from '../../domain/engraving';

export interface MeasureLayoutResult {
  width: number;
  noteXPositions: Map<string, number>; // noteId -> x within measure (0-based)
  prefixWidth: number; // width of clef + key sig + time sig
}

export interface MeasureLayoutOptions {
  showClef: boolean;
  clef: Clef;
  showKeySignature: boolean;
  keySignature: KeySignature;
  showTimeSignature: boolean;
  timeSignature?: TimeSignature;
  staffSpace: number; // pixels per staff space
  minWidth?: number;
}

export function layoutMeasure(
  measure: Measure,
  options: MeasureLayoutOptions
): MeasureLayoutResult {
  const { showClef, clef, showKeySignature, keySignature, showTimeSignature, timeSignature, staffSpace } = options;

  let prefixX = staffSpace * 0.5; // initial padding

  // Clef
  if (showClef) {
    prefixX += CLEF_WIDTHS[clef.type] * staffSpace + staffSpace * 0.5;
  }

  // Key signature
  if (showKeySignature && Math.abs(keySignature.fifths) > 0) {
    prefixX += Math.abs(keySignature.fifths) * KEY_SIG_ACCIDENTAL_WIDTH * staffSpace + staffSpace * 0.3;
  }

  // Time signature
  if (showTimeSignature && timeSignature) {
    prefixX += TIME_SIG_WIDTH * staffSpace + staffSpace * 0.5;
  }

  const prefixWidth = prefixX;

  // Calculate note positions
  const noteXPositions = new Map<string, number>();
  const notes = getMeasureNotes(measure);

  if (notes.length === 0) {
    const minWidth = options.minWidth || staffSpace * 10;
    return { width: Math.max(minWidth, prefixWidth + staffSpace * 6), noteXPositions, prefixWidth };
  }

  let currentX = prefixX + staffSpace * 0.5;

  // First pass: calculate minimum width needed
  notes.forEach(note => {
    noteXPositions.set(note.id, currentX);
    const noteWidth = calculateNoteWidth(note, staffSpace);
    currentX += noteWidth;
  });

  const minContentWidth = currentX + staffSpace * 0.5;
  const totalWidth = Math.max(options.minWidth || 0, minContentWidth);

  return { width: totalWidth, noteXPositions, prefixWidth };
}

function getMeasureNotes(measure: Measure): Note[] {
  const notes: Note[] = [];
  for (const el of measure.elements) {
    if ('notes' in el) {
      // Chord - use first note for positioning
      notes.push(...(el as Chord).notes);
    } else {
      notes.push(el as Note);
    }
  }
  return notes;
}

function calculateNoteWidth(note: Note, staffSpace: number): number {
  const beats = getDurationBeats(note.duration.type, note.duration.dots, note.duration.tuplet);
  // Logarithmic spacing: quarter note = 2*staffSpace, half note = 3*staffSpace, etc.
  const baseWidth = staffSpace * 1.2 + staffSpace * Math.log2(beats * 2 + 1) * 1.2;

  // Add space for accidental
  const hasAccidental = note.pitch?.accidental != null;
  const accidentalExtra = hasAccidental ? (ACCIDENTAL_WIDTH + ACCIDENTAL_MARGIN) * staffSpace : 0;

  return Math.max(MIN_NOTE_SPACING * staffSpace, baseWidth) + accidentalExtra;
}

// Calculate the total width needed for a measure with specific content
export function calculateMeasureMinWidth(
  beats: number,
  staffSpace: number,
  hasClef: boolean = false,
  hasKeySig: number = 0,
  hasTimeSig: boolean = false
): number {
  let width = staffSpace; // padding

  if (hasClef) width += CLEF_WIDTHS.treble * staffSpace + staffSpace * 0.5;
  if (hasKeySig > 0) width += hasKeySig * KEY_SIG_ACCIDENTAL_WIDTH * staffSpace + staffSpace * 0.3;
  if (hasTimeSig) width += TIME_SIG_WIDTH * staffSpace + staffSpace * 0.5;

  // Content: minimum 2 staff spaces per beat
  width += beats * SPACING_PER_BEAT * staffSpace;
  width += staffSpace; // right padding

  return width;
}
