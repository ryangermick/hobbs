import { authenticate } from './_auth.js'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`

const GENERATION_PROMPT = `You are analyzing a photo of a person to create a rich, realistic character for roleplay conversation.

INSTRUCTIONS:
1. Examine this photo carefully. Note physical appearance, clothing, setting, expression, posture, age range, and any contextual clues.
2. If this person is a FAMOUS individual you can identify with HIGH confidence (90%+), use their known personality, speech patterns, and public persona. State their name.
3. If you are NOT highly confident this is a famous person, DO NOT guess. Instead, invent a completely original character based purely on visual cues.
4. Generate a character with:
   - A fitting first name (or real name if famous)
   - Age range
   - Personality traits (3-5 specific traits)
   - Speaking style (formal/casual, vocabulary level, verbal tics, catchphrases)
   - Backstory (occupation, life experiences, where they're from)
   - Current mood/attitude based on their expression
   - Strong opinions on 2-3 topics
   - Goals and motivations
   - Quirks and habits
   - What they WON'T talk about or refuse to discuss

CRITICAL: This character is a REAL PERSON with their own POV. They are NOT an AI assistant. They:
- Have strong opinions and aren't afraid to disagree
- Push back when challenged
- Have their own agenda in conversations
- Don't try to be helpful — they're just living their life
- Use natural speech with filler words, interruptions, incomplete thoughts
- Can be moody, distracted, funny, rude, warm — whatever fits

USER GUIDANCE (if provided): {GUIDANCE}

OUTPUT FORMAT:
Return a JSON object with exactly these fields:
{
  "name": "Character's name",
  "systemPrompt": "The full system prompt for this character (detailed, at least 200 words)"
}

Return ONLY the JSON, no markdown formatting.`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const user = await authenticate(req, res)
  if (!user) return

  const { imageBase64, mimeType, guidance, photoUrl } = req.body
  if (!imageBase64 || !mimeType) {
    return res.status(400).json({ error: 'Image required' })
  }

  try {
    const prompt = GENERATION_PROMPT.replace('{GUIDANCE}', guidance || 'None provided')

    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: imageBase64 } }
          ]
        }]
      })
    })

    if (!geminiRes.ok) {
      const err = await geminiRes.text()
      console.error('Gemini error:', err)
      return res.status(500).json({ error: 'Vision analysis failed', detail: err })
    }

    const geminiData = await geminiRes.json()
    console.log('Gemini response:', JSON.stringify(geminiData).slice(0, 500))
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return res.status(500).json({ error: 'No response from vision model', detail: JSON.stringify(geminiData).slice(0, 500) })

    // Parse JSON from response (handle markdown code blocks)
    let parsed
    try {
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      console.error('Failed to parse Gemini response:', text)
      return res.status(500).json({ error: 'Failed to parse character data' })
    }

    // Save character to database
    const { data: character, error: dbError } = await user._supabase
      .from('characters')
      .insert({
        user_id: user.id,
        name: parsed.name,
        system_prompt: parsed.systemPrompt,
        photo_url: photoUrl || null,
      })
      .select('id')
      .single()

    if (dbError) {
      console.error('DB error:', dbError)
      return res.status(500).json({ error: 'Failed to save character' })
    }

    return res.status(200).json({ characterId: character.id })
  } catch (err) {
    console.error('Generate character error:', err)
    return res.status(500).json({ error: 'Internal server error', detail: err.message })
  }
}
