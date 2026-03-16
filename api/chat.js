import { authenticate, supabase } from './_auth.js'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-preview:generateContent?key=${GEMINI_API_KEY}`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user = await authenticate(req, res)
  if (!user) return

  const { characterId, message } = req.body
  if (!characterId || !message) {
    return res.status(400).json({ error: 'characterId and message required' })
  }

  try {
    // Get character (verify ownership)
    const { data: character } = await supabase
      .from('characters')
      .select('id, system_prompt')
      .eq('id', characterId)
      .eq('user_id', user.id)
      .single()

    if (!character) return res.status(404).json({ error: 'Character not found' })

    // Get recent message history (last 20 messages for context)
    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('character_id', characterId)
      .order('created_at', { ascending: true })
      .limit(20)

    // Build conversation for Gemini
    const contents = []
    for (const msg of (history || [])) {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      })
    }
    contents.push({ role: 'user', parts: [{ text: message }] })

    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: character.system_prompt }] },
        contents
      })
    })

    if (!geminiRes.ok) {
      console.error('Gemini chat error:', await geminiRes.text())
      return res.status(500).json({ error: 'Chat failed' })
    }

    const geminiData = await geminiRes.json()
    const reply = geminiData.candidates?.[0]?.content?.parts?.[0]?.text
    if (!reply) return res.status(500).json({ error: 'No reply from model' })

    // Save both messages
    const { data: userMsg } = await supabase
      .from('messages')
      .insert({ character_id: characterId, role: 'user', content: message })
      .select('id')
      .single()

    const { data: assistantMsg } = await supabase
      .from('messages')
      .insert({ character_id: characterId, role: 'assistant', content: reply })
      .select('id')
      .single()

    return res.status(200).json({
      reply,
      userMessageId: userMsg?.id,
      assistantMessageId: assistantMsg?.id,
    })
  } catch (err) {
    console.error('Chat error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
