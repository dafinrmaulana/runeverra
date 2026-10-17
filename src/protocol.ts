// The online protocol between a browser (src/ui/online/ws-room.ts) and the relay (server/ws-server.ts).
// Every message is one JSON object whose `t` names its kind. Type-only: nothing here runs.
import type { Action, State, Team } from './engine/index.ts';
import type { ClockSnapshot } from './clock.ts';

export type ChatEntry = { side: Team; text: string; ts: number };
/** One side's lobby state: its picks and whether it pressed Ready. */
export type SeatView = { picks: string[]; ready: boolean };

/**
 * Client -> server. Fields are typed as the client sends them, but the server treats every one
 * as untrusted input and checks it before use.
 */
export type ClientMessage =
  | { t: 'hello'; code?: string; side?: Team; token?: string } // no code: create a room; code: join; + side/token: reclaim a seat
  | { t: 'picks'; picks: string[] }
  | { t: 'map'; map: string; creeps: boolean } // host only
  | { t: 'clock'; minutes: number } // host only, before the match
  | { t: 'chat'; text: string }
  | { t: 'ready'; ready: boolean }
  | { t: 'action'; action: Action };

/** Server -> client. */
export type ServerMessage =
  | { t: 'joined'; code: string; side: Team; token: string }
  | { t: 'notfound' }
  | { t: 'full' }
  | { t: 'error'; message: string }
  | { t: 'opponent'; connected: boolean }
  | {
      t: 'lobby';
      side: Team;
      map: string;
      creeps: boolean;
      clockMs: number;
      match: number;
      started: number;
      you: SeatView;
      opp: SeatView | null;
    }
  | { t: 'start'; game: State; fresh: boolean; match: number; clock: ClockSnapshot | null }
  | { t: 'sync'; game: State; match: number; clock: ClockSnapshot | null } // reconnected mid-match
  | { t: 'move'; action: Action; clock: ClockSnapshot | null } // the opponent's validated action, or a timeout
  | { t: 'clock'; clock: ClockSnapshot | null }
  | { t: 'chatlog'; log: ChatEntry[] }
  | ({ t: 'chat' } & ChatEntry)
  | { t: 'chatlimit' };
