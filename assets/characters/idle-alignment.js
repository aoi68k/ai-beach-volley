// Horizontal translations in original 256px cells. Align the midpoint of
// the two sole centres to frame 0; never stretch or repaint the artwork.
// Keep this shared by the game and the animation preview.
// This fixes cell placement drift, not the small stance-width differences
// drawn into the originals: fixing those would require changing the artwork.
const IDLE_ALIGNMENT_X = [
  [0, 1.75, 1.5, 7.5, 10, 13.25],
  [0, -0.5, -0.5, -1.5, -0.5, 0],
  [0, -0.5, -1, 0, -0.75, -1.75],
  [0, 0.25, 0, -0.25, -0.75, -0.75]
];
