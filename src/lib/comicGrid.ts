import type { PanelProps } from '../components/Panel';

export type PanelGridPlacement = {
  panel: PanelProps;
  className: string;
};

/** Tailwind grid span classes from layout_hint. */
export function getPanelSpanClass(layoutHint: string): string {
  switch (layoutHint) {
    case 'wide':
      return 'col-span-2 min-h-0';
    case 'tall':
      return 'row-span-2 col-span-1 min-h-0';
    case 'close-up':
      return 'col-span-1 row-span-1 min-h-0';
    case 'square':
    default:
      return 'col-span-1 min-h-0';
  }
}

/** Grid template for panel count — 4×2 fits 5–7 panels with mixed spans. */
export function getComicGridClass(panelCount: number): string {
  if (panelCount <= 3) {
    return 'grid-cols-3 grid-rows-1';
  }
  if (panelCount === 4) {
    return 'grid-cols-2 grid-rows-2';
  }
  return 'grid-cols-4 grid-rows-2';
}

export function getComicGridPlacements(panels: PanelProps[]): PanelGridPlacement[] {
  const sorted = [...panels].sort((a, b) => a.panelNum - b.panelNum);
  return sorted.map(panel => ({
    panel,
    className: getPanelSpanClass(panel.layoutHint || 'square'),
  }));
}
