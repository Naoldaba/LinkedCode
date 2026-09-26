import { Router, Request, Response } from "express"
import { bearerFromHeader, verifyToken } from "../auth/auth"
import { getRoomsForUser, isDbReady } from "../db/persistence"

const router = Router()

// GET /rooms/mine — the signed-in account's saved rooms/history, newest first.
// Guests never reach a useful response here: without a valid token this is 401,
// so the guest join flow is entirely separate and untouched.
router.get("/mine", async (req: Request, res: Response) => {
	const payload = verifyToken(bearerFromHeader(req.headers.authorization))
	if (!payload) {
		return res.status(401).json({ error: "Not authenticated." })
	}
	if (!isDbReady()) {
		// No database — there are no saved rooms to list. Return an empty list
		// rather than an error so the dashboard degrades gracefully.
		return res.json({ rooms: [] })
	}
	const rooms = await getRoomsForUser(payload.userId)
	return res.json({ rooms })
})

export default router
