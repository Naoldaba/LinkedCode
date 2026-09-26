// Mirrors the client's FileSystemItem shape (client/src/types/file.ts) so the
// server can persist the same embedded tree it already relays between clients.
type Id = string
type FileName = string
type FileContent = string

interface FileSystemItem {
	id: string
	name: FileName
	type: "file" | "directory"
	children?: FileSystemItem[]
	content?: FileContent
	isOpen?: boolean
}

export { FileSystemItem, FileContent, Id, FileName }
