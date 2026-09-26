import jwt from "jsonwebtoken"

// The payload we embed in our own JWT. This is the identity every
// authenticated request/socket carries; guests carry no token at all.
export interface AuthTokenPayload {
	userId: string
	email: string
	displayName: string
	avatarColor: string
}

// Falls back to a development-only secret so the server still boots without a
// configured secret; production must set JWT_SECRET.
const JWT_SECRET: string =
	process.env.JWT_SECRET || "linkedcode-dev-secret-change-me"
const JWT_EXPIRES_IN = "7d"

export function signToken(payload: AuthTokenPayload): string {
	return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

// Verify a token and return its payload, or null if missing/invalid/expired.
// Never throws so callers can treat "no valid token" as "guest".
export function verifyToken(token?: string | null): AuthTokenPayload | null {
	if (!token) return null
	try {
		return jwt.verify(token, JWT_SECRET) as AuthTokenPayload
	} catch {
		return null
	}
}

// Pull a bearer token out of an Authorization header ("Bearer <token>").
export function bearerFromHeader(header?: string): string | null {
	if (!header) return null
	const [scheme, token] = header.split(" ")
	if (scheme !== "Bearer" || !token) return null
	return token
}

// A small, readable palette used to give each account a stable cursor/avatar
// color. Deterministic per email so a user keeps the same color across devices.
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

export function colorForKey(key: string): string {
	let hash = 0
	for (let i = 0; i < key.length; i++) {
		hash = (hash * 31 + key.charCodeAt(i)) & 0xffffffff
	}
	return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}
