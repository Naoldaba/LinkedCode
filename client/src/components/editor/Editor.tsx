import { useFileSystem } from "@/context/FileContext"
import { useSettings } from "@/context/SettingContext"
import { useSocket } from "@/context/SocketContext"
import usePageEvents from "@/hooks/usePageEvents"
import useResponsive from "@/hooks/useResponsive"
import { editorThemes } from "@/resources/Themes"
import { FileSystemItem } from "@/types/file"
import { SocketEvent } from "@/types/socket"
import { color } from "@uiw/codemirror-extensions-color"
import { hyperLink } from "@uiw/codemirror-extensions-hyper-link"
import { LanguageName, loadLanguage } from "@uiw/codemirror-extensions-langs"
import CodeMirror, {
    EditorState,
    EditorView,
    Extension,
    ViewUpdate,
    scrollPastEnd,
} from "@uiw/react-codemirror"
import { useCallback, useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import {
    RemoteCursor,
    remoteCursorsExtension,
    setRemoteCursorsEffect,
} from "./remoteCursors"

// Minimum gap between cursor:update emissions (ms). Cursor movement is chatty,
// so it is throttled (Phase 6) — never sent on every keystroke/selection tick.
const CURSOR_THROTTLE_MS = 60

function Editor() {
    const { activeFile, setActiveFile } = useFileSystem()
    const { theme, language, fontSize } = useSettings()
    const { socket } = useSocket()
    const { viewHeight } = useResponsive()
    const [timeOut, setTimeOut] = useState(setTimeout(() => {}, 0))
    const [extensions, setExtensions] = useState<Extension[]>([])

    // The live editor view (captured on create) so we can push remote-cursor
    // decorations into it without reconfiguring the whole editor.
    const [view, setView] = useState<EditorView | null>(null)

    // Remote collaborators' cursors, keyed by their stable socketId (Phase 6/7).
    // Ephemeral only — never persisted.
    const [remoteCursors, setRemoteCursors] = useState<
        Record<string, RemoteCursor>
    >({})

    // Refs so the throttled emitter always sees the latest editor state and
    // active file without being re-created on every change.
    const activeFileRef = useRef<FileSystemItem | null>(activeFile)
    const latestStateRef = useRef<EditorState | null>(null)
    const lastSentRef = useRef(0)
    const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        activeFileRef.current = activeFile
    }, [activeFile])

    const onCodeChange = (code: string, view: ViewUpdate) => {
        if (!activeFile) return

        const file: FileSystemItem = { ...activeFile, content: code }
        setActiveFile(file)
        const cursorPosition = view.state?.selection?.main?.head
        socket.emit(SocketEvent.TYPING_START, { cursorPosition })
        socket.emit(SocketEvent.FILE_UPDATED, {
            fileId: activeFile.id,
            newContent: code,
        })
        clearTimeout(timeOut)

        const newTimeOut = setTimeout(
            () => socket.emit(SocketEvent.TYPING_PAUSE),
            1000,
        )
        setTimeOut(newTimeOut)
    }

    // Emit this user's caret/selection to the room. Sends only positions and the
    // active file id — never file contents (Phase 6). Identity/color are stamped
    // by the server.
    const emitCursor = useCallback(() => {
        const state = latestStateRef.current
        const file = activeFileRef.current
        if (!state || !file) return

        const sel = state.selection.main
        const headLine = state.doc.lineAt(sel.head)
        const position = {
            line: headLine.number,
            column: sel.head - headLine.from,
        }

        let selection: RemoteCursor["selection"]
        if (!sel.empty) {
            const fromLine = state.doc.lineAt(sel.from)
            const toLine = state.doc.lineAt(sel.to)
            selection = {
                start: { line: fromLine.number, column: sel.from - fromLine.from },
                end: { line: toLine.number, column: sel.to - toLine.from },
            }
        }

        socket.emit(SocketEvent.CURSOR_UPDATE, {
            fileId: file.id,
            position,
            selection,
        })
    }, [socket])

    // Throttle emissions to at most one per CURSOR_THROTTLE_MS, with a trailing
    // call so the final resting position is always sent.
    const scheduleCursorEmit = useCallback(() => {
        const now = Date.now()
        const elapsed = now - lastSentRef.current
        if (elapsed >= CURSOR_THROTTLE_MS) {
            lastSentRef.current = now
            emitCursor()
        } else if (!pendingRef.current) {
            pendingRef.current = setTimeout(() => {
                pendingRef.current = null
                lastSentRef.current = Date.now()
                emitCursor()
            }, CURSOR_THROTTLE_MS - elapsed)
        }
    }, [emitCursor])

    const onUpdate = useCallback(
        (update: ViewUpdate) => {
            latestStateRef.current = update.state
            if (update.selectionSet || update.docChanged) {
                scheduleCursorEmit()
            }
        },
        [scheduleCursorEmit],
    )

    // Listen wheel event to zoom in/out and prevent page reload
    usePageEvents()

    // Receive remote cursor updates/removals over the existing socket (Phase 6).
    useEffect(() => {
        const handleCursorUpdate = (cursor: RemoteCursor) => {
            setRemoteCursors((prev) => ({ ...prev, [cursor.socketId]: cursor }))
        }
        const handleCursorRemove = ({ socketId }: { socketId: string }) => {
            setRemoteCursors((prev) => {
                if (!(socketId in prev)) return prev
                const next = { ...prev }
                delete next[socketId]
                return next
            })
        }

        socket.on(SocketEvent.CURSOR_UPDATE, handleCursorUpdate)
        socket.on(SocketEvent.CURSOR_REMOVE, handleCursorRemove)

        return () => {
            socket.off(SocketEvent.CURSOR_UPDATE, handleCursorUpdate)
            socket.off(SocketEvent.CURSOR_REMOVE, handleCursorRemove)
        }
    }, [socket])

    // Clear the trailing-emit timer on unmount.
    useEffect(() => {
        return () => {
            if (pendingRef.current) clearTimeout(pendingRef.current)
        }
    }, [])

    // Push the cursors for the CURRENT file into the editor. Cursors in other
    // files are filtered out so only collaborators editing this file are shown
    // (Phase 7).
    useEffect(() => {
        if (!view) return
        const fileId = activeFile?.id
        const list = fileId
            ? Object.values(remoteCursors).filter((c) => c.fileId === fileId)
            : []
        view.dispatch({ effects: setRemoteCursorsEffect.of(list) })
    }, [view, remoteCursors, activeFile])

    useEffect(() => {
        const extensions = [
            color,
            hyperLink,
            ...remoteCursorsExtension,
            scrollPastEnd(),
        ]
        const langExt = loadLanguage(language.toLowerCase() as LanguageName)
        if (langExt) {
            extensions.push(langExt)
        } else {
            toast.error(
                "Syntax highlighting is unavailable for this language. Please adjust the editor settings; it may be listed under a different name.",
                {
                    duration: 5000,
                },
            )
        }

        setExtensions(extensions)
    }, [language])

    return (
        <CodeMirror
            theme={editorThemes[theme]}
            onChange={onCodeChange}
            onUpdate={onUpdate}
            onCreateEditor={(editorView) => setView(editorView)}
            value={activeFile?.content}
            extensions={extensions}
            minHeight="100%"
            maxWidth="100vw"
            style={{
                fontSize: fontSize + "px",
                height: viewHeight,
                position: "relative",
            }}
        />
    )
}

export default Editor
