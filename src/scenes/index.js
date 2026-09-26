import * as city from './city.js';
import * as forest from './forest.js';
import * as storm from './storm.js';
import * as wild from './wild.js';
import * as sea from './sea.js';

export const SEQUENCES = [
  { id: 'city', shots: city.shots },
  { id: 'forest', shots: forest.shots },
  { id: 'storm', shots: storm.stormShots },
  { id: 'night', shots: storm.nightShots },
  { id: 'waste', shots: wild.wasteShots },
  { id: 'snow', shots: wild.snowShots },
  { id: 'cape', shots: sea.capeShots },
  { id: 'sea', shots: sea.seaShots },
  { id: 'beach', shots: sea.beachShots },
];
