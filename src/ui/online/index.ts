// Which online transport this build uses. The Claude-artifact capability (room.ts) is the
// default — it's what the published artifact runs on. A self-hosted build that sets
// VITE_WS_URL at build time (see server/README.md) gets the authoritative WebSocket
// relay instead. Only one is ever active per build; App.tsx doesn't need to know which.
import { room as capabilityRoom } from './room';
import { wsRoom } from './ws-room';

// Both clients share one public shape (see ws-room.ts), so either can stand in for the other.
export const room: typeof capabilityRoom = (import.meta.env.VITE_WS_URL
  ? wsRoom
  : capabilityRoom) as unknown as typeof capabilityRoom;
