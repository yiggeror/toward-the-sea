// v2 director's cut: five acts (docs/treatment_v2.md).
import * as act1 from './act1.js';
import * as act2 from './act2.js';
import * as act3 from './act3.js';
import * as act5 from './act5.js';

export const SEQUENCES = [
  { id: 'act1', shots: act1.shots },
  { id: 'act2', shots: act2.shots },
  { id: 'act3', shots: act3.shots },
  { id: 'act5', shots: act5.shots },
];
