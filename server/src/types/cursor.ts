// Cursor data model (Phase 5), adapted to CodeMirror 6. These types describe
// ephemeral collaborator cursor/selection state only — they are relayed over
// Socket.io in a later phase and are NEVER persisted to the database, and never
// carry file contents.

// A caret position expressed in editor coordinates. CodeMirror 6 works in flat
// document offsets internally, but line/column is stable across clients and is
// what we exchange between peers.
export interface CursorPosition {
	line: number
	column: number
}

// One collaborator's cursor within a specific file. `color` is the central,
// stable per-user color (account avatarColor, or a deterministic guest color) —
// not react-avatar's auto-color. `selection` is present only when the
// collaborator has a non-empty selection.
export interface CollaboratorCursor {
	userId: string
	username: string
	color: string
	fileId: string
	position: CursorPosition
	selection?: {
		start: CursorPosition
		end: CursorPosition
	}
}

// What a client sends on `cursor:update`: only where the caret/selection is and
// in which file. Identity and color are NOT trusted from the client — the
// server stamps them from the socket's known user (Phase 6). No file contents.
export interface CursorUpdatePayload {
	fileId: string
	position: CursorPosition
	selection?: {
		start: CursorPosition
		end: CursorPosition
	}
}

// What the server broadcasts to the rest of the room. `socketId` is the stable
// per-connection key used to track and remove a collaborator's cursor (guests
// have no userId, so socketId is the reliable identifier).
export interface RemoteCursorPayload extends CursorUpdatePayload {
	socketId: string
	userId?: string
	username: string
	color: string
}
