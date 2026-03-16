import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

// Rate limiting: simple in-memory store
const rateMap = new Map()
const RATE_LIMIT = 30 // requests per minute
const RATE_WINDOW = 60 * 1000

export async function authenticate(req, res) {
  // Rate limit by IP
  const ip = req.headers['x-forwarded-for'] || 'unknown'
  const now = Date.now()
  const entry = rateMap.get(ip) || { count: 0, reset: now + RATE_WINDOW }
  if (now > entry.reset) {
    entry.count = 0
    entry.reset = now + RATE_WINDOW
  }
  entry.count++
  rateMap.set(ip, entry)
  if (entry.count > RATE_LIMIT) {
    res.status(429).json({ error: 'Rate limit exceeded' })
    return null
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing auth token' })
    return null
  }

  const token = authHeader.slice(7)
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) {
    res.status(401).json({ error: 'Invalid token' })
    return null
  }

  return user
}

export { supabase }
