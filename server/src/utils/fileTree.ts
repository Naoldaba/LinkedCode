import { FileSystemItem } from "../types/file"

// Pure, immutable helpers that apply the same file/directory mutations the
// client performs (client/src/context/FileContext.tsx) to the persisted tree.
// Each returns a new tree so callers can assign and persist the result.

// Insert a new file/directory as a child of the directory with `parentDirId`.
export function insertNode(
	tree: FileSystemItem,
	parentDirId: string,
	node: FileSystemItem
): FileSystemItem {
	if (tree.id === parentDirId && tree.type === "directory") {
		return {
			...tree,
			children: [...(tree.children || []), node],
		}
	}
	if (tree.children) {
		return {
			...tree,
			children: tree.children.map((child) =>
				insertNode(child, parentDirId, node)
			),
		}
	}
	return tree
}

// Replace the children of the directory with `dirId` (used for bulk updates,
// e.g. opening/uploading a folder).
export function setChildren(
	tree: FileSystemItem,
	dirId: string,
	children: FileSystemItem[]
): FileSystemItem {
	if (tree.id === dirId && tree.type === "directory") {
		return { ...tree, children }
	}
	if (tree.children) {
		return {
			...tree,
			children: tree.children.map((child) =>
				setChildren(child, dirId, children)
			),
		}
	}
	return tree
}

// Rename the file or directory with `id`.
export function renameNode(
	tree: FileSystemItem,
	id: string,
	newName: string
): FileSystemItem {
	if (tree.id === id) {
		return { ...tree, name: newName }
	}
	if (tree.children) {
		return {
			...tree,
			children: tree.children.map((child) =>
				renameNode(child, id, newName)
			),
		}
	}
	return tree
}

// Remove the file or directory with `id` from anywhere in the tree.
export function deleteNode(
	tree: FileSystemItem,
	id: string
): FileSystemItem {
	if (tree.children) {
		return {
			...tree,
			children: tree.children
				.filter((child) => child.id !== id)
				.map((child) => deleteNode(child, id)),
		}
	}
	return tree
}

// Update the content of the file with `fileId`.
export function setFileContent(
	tree: FileSystemItem,
	fileId: string,
	content: string
): FileSystemItem {
	if (tree.type === "file" && tree.id === fileId) {
		return { ...tree, content }
	}
	if (tree.children) {
		return {
			...tree,
			children: tree.children.map((child) =>
				setFileContent(child, fileId, content)
			),
		}
	}
	return tree
}
