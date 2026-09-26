// Assembles the whole film from the sequence modules.
import { Timeline } from './timeline.js';
import { SEQUENCES } from '../scenes/index.js';
import { loadFonts } from './fonts.js';

export async function buildFilm(filter) {
  await loadFonts();
  const shots = [];
  for (const seq of SEQUENCES) {
    if (filter && !filter(seq)) continue;
    for (const s of seq.shots()) {
      s.seq = seq.id;
      shots.push(s);
    }
  }
  return new Timeline(shots);
}
