import { Router, Request, Response } from "express"
import bcrypt from "bcryptjs"
import { OAuth2Client } from "google-auth-library"
import { User, UserDoc } from "../models/User"
import { isDbReady } from "../db/persistence"
import {
	AuthTokenPayload,
	bearerFromHeader,
	colorForKey,
	signToken,
	verifyToken,
} from "./auth"

const router = Router()

const BCRYPT_ROUNDS = 10
const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClient = googleClientId
	? new OAuth2Client(googleClientId)
	: null

// Shape returned to the client for any successful auth. Never includes the
// password hash or other sensitive fields.
function publicUser(user: UserDoc & { _id: unknown }) {
	return {
		userId: String(user._id),
		email: user.email,
		displayName: user.displayName,
		avatarColor: user.avatarColor,
	}
}

function tokenFor(user: UserDoc & { _id: unknown }): string {
	const payload: AuthTokenPayload = {
		userId: String(user._id),
		email: user.email,
		displayName: user.displayName,
		avatarColor: user.avatarColor,
	}
	return signToken(payload)
}

// Auth needs the database; without it there are no accounts to create/verify.
function requireDb(res: Response): boolean {
	if (!isDbReady()) {
		res.status(503).json({
			error: "Accounts are unavailable right now. You can still join as a guest.",
		})
		return false
	}
	return true
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// POST /auth/signup — create an email/password account.
router.post("/signup", async (req: Request, res: Response) => {
	if (!requireDb(res)) return
	try {
		const email = String(req.body.email || "").trim().toLowerCase()
		const password = String(req.body.password || "")
		const displayName =
			String(req.body.displayName || "").trim() || email.split("@")[0]

		if (!EMAIL_RE.test(email)) {
			return res.status(400).json({ error: "Enter a valid email address." })
		}
		if (password.length < 6) {
			return res
				.status(400)
				.json({ error: "Password must be at least 6 characters." })
		}

		const existing = await User.findOne({ email })
		if (existing) {
			return res
				.status(409)
				.json({ error: "An account with that email already exists." })
		}

		const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
		const user = await User.create({
			email,
			passwordHash,
			displayName,
			avatarColor: colorForKey(email),
		})

		return res.status(201).json({ token: tokenFor(user), user: publicUser(user) })
	} catch (err) {
		console.error("signup failed:", (err as Error).message)
		return res.status(500).json({ error: "Could not create the account." })
	}
})

// POST /auth/login — verify email/password.
router.post("/login", async (req: Request, res: Response) => {
	if (!requireDb(res)) return
	try {
		const email = String(req.body.email || "").trim().toLowerCase()
		const password = String(req.body.password || "")

		const user = await User.findOne({ email })
		if (!user || !user.passwordHash) {
			return res.status(401).json({ error: "Invalid email or password." })
		}

		const ok = await bcrypt.compare(password, user.passwordHash)
		if (!ok) {
			return res.status(401).json({ error: "Invalid email or password." })
		}

		return res.json({ token: tokenFor(user), user: publicUser(user) })
	} catch (err) {
		console.error("login failed:", (err as Error).message)
		return res.status(500).json({ error: "Could not sign in." })
	}
})

// POST /auth/google — verify a Google ID token and resolve it to a User,
// creating or linking the account as needed. Issues our own JWT either way.
router.post("/google", async (req: Request, res: Response) => {
	if (!requireDb(res)) return
	if (!googleClient || !googleClientId) {
		return res
			.status(503)
			.json({ error: "Google sign-in is not configured on the server." })
	}
	try {
		const credential = String(req.body.credential || "")
		if (!credential) {
			return res.status(400).json({ error: "Missing Google credential." })
		}

		const ticket = await googleClient.verifyIdToken({
			idToken: credential,
			audience: googleClientId,
		})
		const g = ticket.getPayload()
		if (!g || !g.email) {
			return res.status(401).json({ error: "Could not verify Google account." })
		}

		const email = g.email.toLowerCase()
		let user = await User.findOne({ $or: [{ googleId: g.sub }, { email }] })
		if (!user) {
			user = await User.create({
				email,
				googleId: g.sub,
				displayName: g.name || email.split("@")[0],
				avatarColor: colorForKey(email),
			})
		} else if (!user.googleId) {
			// Link Google to an existing email/password account.
			user.googleId = g.sub
			await user.save()
		}

		return res.json({ token: tokenFor(user), user: publicUser(user) })
	} catch (err) {
		console.error("google auth failed:", (err as Error).message)
		return res.status(401).json({ error: "Could not verify Google account." })
	}
})

// GET /auth/me — return the current account for a valid bearer token.
router.get("/me", async (req: Request, res: Response) => {
	const payload = verifyToken(bearerFromHeader(req.headers.authorization))
	if (!payload) {
		return res.status(401).json({ error: "Not authenticated." })
	}
	return res.json({
		user: {
			userId: payload.userId,
			email: payload.email,
			displayName: payload.displayName,
			avatarColor: payload.avatarColor,
		},
	})
})

export default router
