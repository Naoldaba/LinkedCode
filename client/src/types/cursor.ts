// Cursor data model (Phase 5), adapted to CodeMirror 6. These types describe
// ephemeral collaborator cursor/selection state only — they are synced over the
// existing Socket.io connection in a later phase and are NEVER persisted, and
// never carry file contents.

// A caret position expressed in editor coordinates. CodeMirror 6 works in flat
// document offsets internally, but line/column is stable across clients and is
// what we exchange between peers.
interface CursorPosition {
    line: number
    column: number
}

// One collaborator's cursor within a specific file. `color` is the central,
// stable per-user color (the account's avatarColor, or a deterministic guest
// color) — not react-avatar's auto-color. `selection` is present only when the
// collaborator has a non-empty selection.
interface CollaboratorCursor {
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

export type { CursorPosition, CollaboratorCursor }
