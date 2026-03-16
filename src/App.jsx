import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Home from './pages/Home'
import Chat from './pages/Chat'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-pulse text-dark-400 text-lg">Loading...</div>
      </div>
    )
  }

  if (!session) return <Login />

  return (
    <Routes>
      <Route path="/" element={<Home session={session} />} />
      <Route path="/chat/:id" element={<Chat session={session} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
