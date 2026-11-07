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
// Lowest opaque foot edge in each 256px jump cell, including landing.
// Keep the visual feet on the physics anchor as the pose changes.
const JUMP_BASELINES = [
  [250, 250, 221, 207, 250, 250],
  [248, 248, 215, 206, 237, 248],
  [251, 251, 210, 212, 251, 251],
  [251, 251, 225, 212, 251, 251]
];
