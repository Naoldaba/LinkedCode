// Remote collaborator cursors rendered with CodeMirror 6's native decoration
// API (Phase 7). This replaces the old typing-only tooltip: it draws each
// remote collaborator's caret, their username label in their own color, and
// their text selection — but only for the file currently open in this editor.
//
// The cursor data is ephemeral (synced over Socket.io, never persisted) and is
// pushed into the editor via a StateEffect so we never reconfigure the whole
// editor on every cursor move.

import { CollaboratorCursor } from "@/types/cursor"
import { EditorState, StateEffect, StateField } from "@codemirror/state"
import { Decoration, DecorationSet, EditorView, WidgetType } from "@codemirror/view"

// A remote cursor as tracked on the client: the Phase 5 shape plus the stable
// per-connection `socketId` used as its key (guests have no userId).
export type RemoteCursor = CollaboratorCursor & { socketId: string }

// Effect carrying the full set of remote cursors to display in THIS editor.
// The caller filters to the current file before dispatching it.
export const setRemoteCursorsEffect = StateEffect.define<RemoteCursor[]>()

// Convert a line/column position (what peers exchange) into a flat document
// offset, clamped so a stale position can never point outside the document.
function posToOffset(
    state: EditorState,
    pos: { line: number; column: number },
): number | null {
    if (!pos || pos.line < 1 || pos.line > state.doc.lines) return null
    const line = state.doc.line(pos.line)
    return Math.min(line.from + Math.max(0, pos.column), line.to)
}

// Turn a hex color into an rgba string so selections can be tinted translucently.
function hexToRgba(hex: string, alpha: number): string {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    if (!m) return hex
    const r = parseInt(m[1], 16)
    const g = parseInt(m[2], 16)
    const b = parseInt(m[3], 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// A zero-width caret drawn as a colored bar with a floating username label.
class RemoteCaretWidget extends WidgetType {
    constructor(
        readonly color: string,
        readonly name: string,
        readonly socketId: string,
    ) {
        super()
    }

    eq(other: RemoteCaretWidget): boolean {
        return (
            other.socketId === this.socketId &&
            other.color === this.color &&
            other.name === this.name
        )
    }

    toDOM(): HTMLElement {
        const wrap = document.createElement("span")
        wrap.className = "cm-remote-caret"
        wrap.style.borderColor = this.color

        const label = document.createElement("span")
        label.className = "cm-remote-caret-label"
        label.style.backgroundColor = this.color
        label.textContent = this.name
        wrap.appendChild(label)

        return wrap
    }

    // Never intercept editor interaction — the caret is purely decorative and
    // must not steal focus or swallow clicks.
    ignoreEvent(): boolean {
        return true
    }
}

// Build the decoration set for the given cursors against the current document.
function buildDecorations(
    state: EditorState,
    cursors: RemoteCursor[],
): DecorationSet {
    const ranges = []

    for (const cursor of cursors) {
        // Selection highlight (only when the collaborator has a real selection).
        if (cursor.selection) {
            const from = posToOffset(state, cursor.selection.start)
            const to = posToOffset(state, cursor.selection.end)
            if (from !== null && to !== null && from !== to) {
                const [a, b] = from < to ? [from, to] : [to, from]
                ranges.push(
                    Decoration.mark({
                        class: "cm-remote-selection",
                        attributes: {
                            style: `background-color: ${hexToRgba(cursor.color, 0.25)}`,
                        },
                    }).range(a, b),
                )
            }
        }

        // Caret widget at the collaborator's head position.
        const caret = posToOffset(state, cursor.position)
        if (caret !== null) {
            ranges.push(
                Decoration.widget({
                    widget: new RemoteCaretWidget(
                        cursor.color,
                        cursor.username,
                        cursor.socketId,
                    ),
                    // Draw after the character so the caret sits at the position
                    // rather than being swallowed by the local selection.
                    side: 1,
                }).range(caret),
            )
        }
    }

    // Decoration.set sorts by position when passed `true`, which is required
    // when multiple users sit at (or near) the same location.
    return Decoration.set(ranges, true)
}

// Holds the remote-cursor decorations. It maps through document changes so
// cursors stay put while the local user types, and rebuilds whenever a new set
// of cursors is dispatched.
const remoteCursorField = StateField.define<DecorationSet>({
    create() {
        return Decoration.none
    },
    update(deco, tr) {
        deco = deco.map(tr.changes)
        for (const effect of tr.effects) {
            if (effect.is(setRemoteCursorsEffect)) {
                deco = buildDecorations(tr.state, effect.value)
            }
        }
        return deco
    },
    provide: (field) => EditorView.decorations.from(field),
})

// Styling for the caret bar, its label, and remote selections. Works in both
// light and dark editor themes since colors come from the per-user color.
const remoteCursorTheme = EditorView.baseTheme({
    ".cm-remote-caret": {
        position: "relative",
        borderLeft: "2px solid",
        borderRight: "0",
        marginLeft: "-1px",
        marginRight: "-1px",
        boxSizing: "border-box",
        display: "inline-block",
    },
    ".cm-remote-caret-label": {
        position: "absolute",
        top: "-1.25em",
        left: "-1px",
        whiteSpace: "nowrap",
        fontSize: "0.7rem",
        lineHeight: "normal",
        color: "#fff",
        padding: "0 3px",
        borderRadius: "3px 3px 3px 0",
        fontFamily: "sans-serif",
        pointerEvents: "none",
        userSelect: "none",
        zIndex: "20",
    },
    ".cm-remote-selection": {
        borderRadius: "2px",
    },
})

// The extension to add to the editor. Combine the decoration field with its
// theme.
export const remoteCursorsExtension = [remoteCursorField, remoteCursorTheme]
