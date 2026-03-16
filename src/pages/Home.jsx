import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, authFetch } from '../lib/supabase'

export default function Home({ session }) {
  const [characters, setCharacters] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [guidance, setGuidance] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [preview, setPreview] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const fileRef = useRef()
  const navigate = useNavigate()

  useEffect(() => {
    loadCharacters()
  }, [])

  async function loadCharacters() {
    const { data } = await supabase
      .from('characters')
      .select('id, name, photo_url, created_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
    setCharacters(data || [])
    setLoading(false)
  }

  function handleFileSelect(e) {
    const file = e.target.files[0]
    if (!file) return
    setSelectedFile(file)
    setPreview(URL.createObjectURL(file))
  }

  async function createCharacter() {
    if (!selectedFile) return
    setCreating(true)
    try {
      // Upload photo to Supabase Storage
      const ext = selectedFile.name.split('.').pop()
      const path = `${session.user.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('photos')
        .upload(path, selectedFile, { contentType: selectedFile.type })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(path)

      // Convert file to base64 for vision API
      const reader = new FileReader()
      const base64 = await new Promise((resolve) => {
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.readAsDataURL(selectedFile)
      })

      // Call API to generate character
      const res = await authFetch('/api/generate-character', {
        method: 'POST',
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: selectedFile.type,
          guidance: guidance.trim() || undefined,
          photoUrl: publicUrl,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || errData.error || 'Failed to generate character')
      }
      const { characterId } = await res.json()
      navigate(`/chat/${characterId}`)
    } catch (err) {
      console.error(err)
      alert(`Error: ${err.message}`)
    } finally {
      setCreating(false)
    }
  }

  function resetUpload() {
    setShowUpload(false)
    setPreview(null)
    setSelectedFile(null)
    setGuidance('')
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-dark-800">
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
          Hobbs
        </h1>
        <button
          onClick={() => supabase.auth.signOut()}
          className="text-dark-400 hover:text-dark-200 text-sm"
        >
          Sign out
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Upload panel */}
        {showUpload ? (
          <div className="max-w-md mx-auto bg-dark-900 rounded-2xl p-6 mb-6 border border-dark-700">
            <h2 className="text-lg font-semibold mb-4">New Character</h2>

            {preview ? (
              <div className="relative mb-4">
                <img src={preview} alt="Preview" className="w-full h-48 object-cover rounded-xl" />
                <button
                  onClick={() => { setPreview(null); setSelectedFile(null) }}
                  className="absolute top-2 right-2 bg-dark-900/80 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current.click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-blue-400', 'text-blue-400', 'bg-blue-500/5') }}
                onDragLeave={e => { e.preventDefault(); e.currentTarget.classList.remove('border-blue-400', 'text-blue-400', 'bg-blue-500/5') }}
                onDrop={e => {
                  e.preventDefault()
                  e.currentTarget.classList.remove('border-blue-400', 'text-blue-400', 'bg-blue-500/5')
                  const file = e.dataTransfer.files[0]
                  if (file && file.type.startsWith('image/')) {
                    setSelectedFile(file)
                    setPreview(URL.createObjectURL(file))
                  }
                }}
                className="w-full h-48 border-2 border-dashed border-dark-600 rounded-xl flex flex-col items-center justify-center gap-2 text-dark-400 hover:border-dark-400 hover:text-dark-300 transition-colors mb-4"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-sm">Drop a photo here or click to upload</span>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

            <textarea
              value={guidance}
              onChange={e => setGuidance(e.target.value)}
              placeholder="Optional: describe this person (e.g. 'my uncle Tony, retired firefighter')"
              className="w-full bg-dark-800 border border-dark-600 rounded-xl px-4 py-3 text-sm text-dark-100 placeholder-dark-500 resize-none mb-4 focus:outline-none focus:border-dark-400"
              rows={2}
            />

            <div className="flex gap-3">
              <button onClick={resetUpload} className="flex-1 py-2.5 rounded-xl bg-dark-800 text-dark-300 text-sm font-medium hover:bg-dark-700 transition-colors">
                Cancel
              </button>
              <button
                onClick={createCharacter}
                disabled={!selectedFile || creating}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-violet-500 text-white text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                {creating ? 'Creating...' : 'Create Character'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowUpload(true)}
            className="w-full max-w-md mx-auto mb-6 py-4 rounded-2xl bg-gradient-to-r from-blue-500/10 to-violet-500/10 border border-blue-500/20 text-blue-400 font-medium flex items-center justify-center gap-2 hover:from-blue-500/20 hover:to-violet-500/20 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Character
          </button>
        )}

        {/* Character list */}
        {loading ? (
          <div className="text-center text-dark-500 py-12">Loading characters...</div>
        ) : characters.length === 0 && !showUpload ? (
          <div className="text-center text-dark-500 py-12">
            <p className="text-lg mb-1">No characters yet</p>
            <p className="text-sm">Upload a photo to create your first character</p>
          </div>
        ) : (
          <div className="max-w-md mx-auto space-y-3">
            {characters.map(char => (
              <button
                key={char.id}
                onClick={() => navigate(`/chat/${char.id}`)}
                className="w-full flex items-center gap-4 bg-dark-900 hover:bg-dark-800 rounded-xl p-3 transition-colors text-left border border-dark-800 hover:border-dark-700"
              >
                {char.photo_url ? (
                  <img src={char.photo_url} alt={char.name} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-dark-700 flex items-center justify-center flex-shrink-0 text-dark-400 text-lg">
                    {char.name?.[0] || '?'}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-medium text-dark-100 truncate">{char.name}</div>
                  <div className="text-xs text-dark-500">
                    {new Date(char.created_at).toLocaleDateString()}
                  </div>
                </div>
                <svg className="w-5 h-5 text-dark-600 ml-auto flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
