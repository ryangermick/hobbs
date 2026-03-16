import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, authFetch } from '../lib/supabase'

export default function Chat({ session }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [character, setCharacter] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [editPrompt, setEditPrompt] = useState('')
  const [savingPrompt, setSavingPrompt] = useState(false)
  const scrollRef = useRef()
  const inputRef = useRef()

  useEffect(() => {
    loadCharacter()
    loadMessages()
  }, [id])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadCharacter() {
    const { data } = await supabase
      .from('characters')
      .select('*')
      .eq('id', id)
      .eq('user_id', session.user.id)
      .single()
    if (!data) { navigate('/'); return }
    setCharacter(data)
    setEditPrompt(data.system_prompt || '')
  }

  async function loadMessages() {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('character_id', id)
      .order('created_at', { ascending: true })
    setMessages(data || [])
  }

  async function sendMessage(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setSending(true)

    // Optimistic add user message
    const userMsg = { id: 'temp-' + Date.now(), role: 'user', content: text, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])

    try {
      const res = await authFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          characterId: id,
          message: text,
        }),
      })
      if (!res.ok) throw new Error('Chat failed')
      const { reply, userMessageId, assistantMessageId } = await res.json()
      
      // Replace optimistic message and add reply
      setMessages(prev => [
        ...prev.filter(m => m.id !== userMsg.id),
        { id: userMessageId, role: 'user', content: text, created_at: userMsg.created_at },
        { id: assistantMessageId, role: 'assistant', content: reply, created_at: new Date().toISOString() },
      ])
    } catch (err) {
      console.error(err)
      setMessages(prev => prev.filter(m => m.id !== userMsg.id))
      setInput(text)
      alert('Failed to send message')
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  async function savePrompt() {
    setSavingPrompt(true)
    await supabase
      .from('characters')
      .update({ system_prompt: editPrompt })
      .eq('id', id)
      .eq('user_id', session.user.id)
    setCharacter(prev => ({ ...prev, system_prompt: editPrompt }))
    setSavingPrompt(false)
    setShowSettings(false)
  }

  async function deleteCharacter() {
    if (!confirm('Delete this character and all their messages?')) return
    await supabase.from('messages').delete().eq('character_id', id)
    await supabase.from('characters').delete().eq('id', id).eq('user_id', session.user.id)
    navigate('/')
  }

  if (!character) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-dark-400">Loading...</div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-dark-800 bg-dark-950/80 backdrop-blur-sm">
        <button onClick={() => navigate('/')} className="text-dark-400 hover:text-dark-200">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        {character.photo_url && (
          <img src={character.photo_url} alt={character.name} className="w-8 h-8 rounded-full object-cover" />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-dark-100 truncate">{character.name}</div>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="text-dark-400 hover:text-dark-200 p-1"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01" />
          </svg>
        </button>
      </header>

      {/* Settings panel */}
      {showSettings && (
        <div className="border-b border-dark-800 bg-dark-900 p-4">
          <h3 className="text-sm font-semibold text-dark-300 mb-2">System Prompt</h3>
          <textarea
            value={editPrompt}
            onChange={e => setEditPrompt(e.target.value)}
            className="w-full bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 text-sm text-dark-100 resize-none focus:outline-none focus:border-dark-400 mb-3"
            rows={6}
          />
          <div className="flex gap-2">
            <button
              onClick={savePrompt}
              disabled={savingPrompt}
              className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
            >
              {savingPrompt ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => { setShowSettings(false); setEditPrompt(character.system_prompt || '') }}
              className="px-4 py-2 rounded-lg bg-dark-800 text-dark-300 text-sm hover:bg-dark-700"
            >
              Cancel
            </button>
            <button
              onClick={deleteCharacter}
              className="ml-auto px-4 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm hover:bg-red-500/20"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-dark-500 py-12">
            <p>Say something to {character.name}</p>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-blue-500 text-white rounded-br-md'
                  : 'bg-dark-800 text-dark-100 rounded-bl-md'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-dark-800 text-dark-400 px-4 py-2.5 rounded-2xl rounded-bl-md text-sm">
              <span className="animate-pulse">typing...</span>
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="px-4 py-3 border-t border-dark-800 bg-dark-950/80 backdrop-blur-sm">
        <div className="flex gap-2 max-w-2xl mx-auto">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={`Message ${character.name}...`}
            className="flex-1 bg-dark-800 border border-dark-700 rounded-xl px-4 py-2.5 text-sm text-dark-100 placeholder-dark-500 focus:outline-none focus:border-dark-500"
            autoFocus
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="bg-blue-500 text-white px-4 py-2.5 rounded-xl disabled:opacity-30 hover:bg-blue-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  )
}
