// The roster. Each file registers one hero (and its phases); picker order is the order here.
// Adding a hero: a new file next to these, one import line below, and its art in public/assets.
import './hasim.ts';
import './genga.ts';
import './magumba.ts';
import './plantae.ts';
import './hexor.ts';
import './aqna.ts';

export { BEAST, fallenBeastOf, summonSpots } from './genga.ts';
export { ICE_LIMIT } from './aqna.ts';
