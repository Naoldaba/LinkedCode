import { User } from "@/types/user"

// The single, central source of per-user color for cursors and avatars
// (Phase 5). It mirrors the server's palette so a user keeps the same color
// whether the color is assigned server-side (on join) or derived locally.
// Deliberately NOT react-avatar's auto-color.
const AVATAR_COLORS = [
    "#F94144",
    "#F3722C",
    "#F8961E",
    "#F9C74F",
    "#90BE6D",
    "#43AA8B",
    "#577590",
    "#277DA1",
    "#9B5DE5",
    "#F15BB5",
]

// Deterministic color for an arbitrary key (e.g. a guest username), stable
// across clients. Matches the server's colorForKey so both sides agree.
export function colorForKey(key: string): string {
    let hash = 0
    for (let i = 0; i < key.length; i++) {
        hash = (hash * 31 + key.charCodeAt(i)) & 0xffffffff
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

// The color to use for a given user: the server-assigned avatarColor when
// present (account color, or the guest color the server derived), otherwise a
// deterministic fallback from the username so callers always get a color.
export function getUserColor(user: Pick<User, "avatarColor" | "username">): string {
    return user.avatarColor ?? colorForKey(user.username)
}
