import { Router, Request, Response } from "express"

// Code-execution adapter.
//
// The client speaks the Piston API shape it was written against
// (GET /runtimes -> [{language, version, aliases}], POST /execute with
// {language, version, files, stdin} -> {run:{stdout,stderr}}). We translate
// that to/from Wandbox (https://wandbox.org), a free, keyless execution service,
// so no client changes are needed and Piston self-hosting is not required.

const WANDBOX_URL = process.env.WANDBOX_URL || "https://wandbox.org/api"

// Curated set of languages we expose, mapped to Wandbox's `language` field and
// the file extensions (aliases) the client uses to auto-select a runtime.
interface LangSpec {
	key: string // value sent back by the client on execute
	wandbox: string // Wandbox `language` field to match
	aliases: string[] // file extensions / names for matching
}

const LANGS: LangSpec[] = [
	{ key: "python", wandbox: "Python", aliases: ["py", "python", "python3"] },
	{
		key: "javascript",
		wandbox: "JavaScript",
		aliases: ["js", "javascript", "node", "mjs", "cjs"],
	},
	{ key: "typescript", wandbox: "TypeScript", aliases: ["ts", "typescript"] },
	{ key: "go", wandbox: "Go", aliases: ["go", "golang"] },
	{ key: "c", wandbox: "C", aliases: ["c", "h"] },
	{
		key: "c++",
		wandbox: "C++",
		aliases: ["cpp", "cc", "cxx", "c++", "hpp", "hxx"],
	},
	{ key: "java", wandbox: "Java", aliases: ["java"] },
	{ key: "bash", wandbox: "Bash script", aliases: ["sh", "bash"] },
	{ key: "rust", wandbox: "Rust", aliases: ["rs", "rust"] },
	{ key: "ruby", wandbox: "Ruby", aliases: ["rb", "ruby"] },
	{ key: "php", wandbox: "PHP", aliases: ["php"] },
	{ key: "csharp", wandbox: "C#", aliases: ["cs", "csharp"] },
	{ key: "swift", wandbox: "Swift", aliases: ["swift"] },
	{ key: "lua", wandbox: "Lua", aliases: ["lua"] },
	{ key: "perl", wandbox: "Perl", aliases: ["pl", "perl"] },
	{ key: "r", wandbox: "R", aliases: ["r"] },
	{ key: "scala", wandbox: "Scala", aliases: ["scala"] },
]

interface WandboxCompiler {
	name: string
	version: string
	language: string
}

interface Runtime {
	language: string
	version: string
	aliases: string[]
}

// Cache the resolved runtimes + language→compiler map. Wandbox's list rarely
// changes and is large, so we avoid fetching it on every request.
const CACHE_TTL_MS = 30 * 60 * 1000
let cache: {
	at: number
	runtimes: Runtime[]
	compilerByKey: Map<string, string>
} | null = null

// Note: no return annotation so TS infers the global fetch `Response`, not the
// Express `Response` imported above.
async function fetchJson(url: string, init?: RequestInit) {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), 30000)
	try {
		return await fetch(url, { ...init, signal: controller.signal })
	} finally {
		clearTimeout(timer)
	}
}

// Pick the best compiler for a language: newest-first as Wandbox returns them,
// skipping nightly ("head") and boost variants when a stable one exists.
function pickCompiler(candidates: WandboxCompiler[]): WandboxCompiler | null {
	if (candidates.length === 0) return null
	const stable = candidates.filter(
		(c) => !c.name.includes("head") && !c.name.includes("boost")
	)
	return (stable[0] || candidates[0]) ?? null
}

async function loadRuntimes(): Promise<{
	runtimes: Runtime[]
	compilerByKey: Map<string, string>
}> {
	if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
		return { runtimes: cache.runtimes, compilerByKey: cache.compilerByKey }
	}

	const r = await fetchJson(`${WANDBOX_URL}/list.json`)
	if (!r.ok) throw new Error(`Wandbox list.json HTTP ${r.status}`)
	const all = (await r.json()) as WandboxCompiler[]

	const runtimes: Runtime[] = []
	const compilerByKey = new Map<string, string>()

	for (const spec of LANGS) {
		const candidates = all.filter((c) => c.language === spec.wandbox)
		const chosen = pickCompiler(candidates)
		if (!chosen) continue
		compilerByKey.set(spec.key, chosen.name)
		runtimes.push({
			language: spec.key,
			version: chosen.version || "latest",
			aliases: spec.aliases,
		})
	}

	cache = { at: Date.now(), runtimes, compilerByKey }
	return { runtimes, compilerByKey }
}

const router = Router()

// GET /piston/runtimes — Piston-shaped list the client uses to match files.
router.get("/runtimes", async (_req: Request, res: Response) => {
	try {
		const { runtimes } = await loadRuntimes()
		res.json(runtimes)
	} catch (err) {
		console.error("runtimes failed:", (err as Error).message)
		res.status(502).json({ error: "Code execution engine is unavailable." })
	}
})

// POST /piston/execute — translate a Piston-shaped request into a Wandbox run.
router.post("/execute", async (req: Request, res: Response) => {
	try {
		const language = String(req.body?.language || "").toLowerCase()
		const files = Array.isArray(req.body?.files) ? req.body.files : []
		const code = files[0]?.content ?? ""
		const stdin = req.body?.stdin ?? ""

		const { compilerByKey } = await loadRuntimes()
		const compiler = compilerByKey.get(language)
		if (!compiler) {
			return res
				.status(400)
				.json({ error: `Unsupported language: ${language || "(none)"}` })
		}

		const r = await fetchJson(`${WANDBOX_URL}/compile.json`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ compiler, code, stdin }),
		})
		const w = (await r.json()) as {
			status?: string
			program_output?: string
			program_error?: string
			compiler_output?: string
			compiler_error?: string
		}

		// Map Wandbox output back to the Piston shape the client expects. Runtime
		// errors (program_error) take precedence; compile errors surface when a
		// program never ran.
		const stdout = w.program_output ?? ""
		const stderr = w.program_error || w.compiler_error || ""
		res.json({
			language,
			version: req.body?.version ?? "",
			run: {
				stdout,
				stderr,
				code: parseInt(w.status ?? "0", 10) || 0,
				output: stdout || stderr,
			},
		})
	} catch (err) {
		console.error("execute failed:", (err as Error).message)
		res.status(502).json({ error: "Code execution engine is unavailable." })
	}
})

export const pistonRouter = router
