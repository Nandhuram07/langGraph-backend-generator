"use client"

import React, { useState, useEffect, useRef } from "react"
import {
  Send, Download, Code, Database, Terminal, Settings,
  Clock, Plus, Trash2, ChevronLeft, ChevronRight, Menu, X, LayoutGrid
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface Message {
  role: "user" | "assistant"
  content: string
}

export default function GeneratorChat() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hello! I'm your AI Backend Architect. What system would you like to build today?" }
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [schema, setSchema] = useState<any[]>([])
  const [db, setDb] = useState("")
  const [features, setFeatures] = useState<string[]>([])
  const [isComplete, setIsComplete] = useState(false)
  const [status, setStatus] = useState("")
  const [threadId, setThreadId] = useState("")
  const [sessions, setSessions] = useState<{ id: string; title: string; timestamp: number }[]>([])
  const [apiKey, setApiKey] = useState("")
  const [showSettings, setShowSettings] = useState(false)

  // Large screen sidebar: collapsed or expanded
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  // Small/medium: hamburger drawer (left)
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Small/medium: schema panel drawer (right)
  const [schemaDrawerOpen, setSchemaDrawerOpen] = useState(false)

  useEffect(() => {
    const savedSessions = localStorage.getItem("ai_sessions")
    if (savedSessions) setSessions(JSON.parse(savedSessions))
    const savedKey = localStorage.getItem("user_api_key")
    if (savedKey) setApiKey(savedKey)
  }, [])

  const saveApiKey = (key: string) => {
    setApiKey(key)
    localStorage.setItem("user_api_key", key)
  }

  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return
    const userMsg: Message = { role: "user", content: input }
    setMessages((prev) => [...prev, userMsg])
    const currentInput = input
    setInput("")
    setIsLoading(true)
    setStatus("Thinking...")
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(apiKey ? { "x-api-key": apiKey } : {}) },
        body: JSON.stringify({ messages: [userMsg], schema, db, features, threadId: threadId || "initial-session" })
      })
      if (!response.ok) throw new Error("Failed to connect to AI")
      const data = await response.json()
      setMessages((prev) => [...prev, { role: "assistant" as const, content: data.content }])
      setSchema(data.schema || [])
      setDb(data.db || "")
      setFeatures(data.features || [])
      setIsComplete(data.isComplete || false)
      if (messages.length <= 1) {
        const newSession = { id: threadId, title: currentInput.slice(0, 30) + (currentInput.length > 30 ? "..." : ""), timestamp: Date.now() }
        const updatedSessions = [newSession, ...sessions.filter(s => s.id !== threadId)]
        setSessions(updatedSessions)
        localStorage.setItem("ai_sessions", JSON.stringify(updatedSessions))
      }
    } catch (error: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${error.message}` }])
    } finally {
      setIsLoading(false)
      setStatus("")
    }
  }

  const handleDownloadZip = async () => {
    setIsLoading(true)
    setStatus("Generating Project...")
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(apiKey ? { "x-api-key": apiKey } : {}) },
        body: JSON.stringify({ entities: schema, db: db || "mysql", features: features.length ? features : ["crud"], threadId })
      })
      if (!response.ok) throw new Error("Generation failed")
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "backend-api.zip"
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (error: any) {
      alert(`Download error: ${error.message}`)
    } finally {
      setIsLoading(false)
      setStatus("")
    }
  }

  const startNewSession = () => {
    const newId = `sess-${Math.random().toString(36).substring(7)}`
    setThreadId(newId)
    setMessages([{ role: "assistant", content: "Hello! I'm your AI Backend Architect. What system would you like to build today?" }])
    setSchema([])
    setDb("")
    setFeatures([])
    setIsComplete(false)
    setDrawerOpen(false)
  }

  const loadSession = async (id: string) => {
    setIsLoading(true)
    setStatus("Loading session...")
    try {
      const response = await fetch(`/api/sessions/${id}`)
      if (!response.ok) throw new Error("Could not load session")
      const data = await response.json()
      setThreadId(id)
      setMessages(data.messages)
      setSchema(data.schema)
      setDb(data.db)
      setFeatures(data.features)
      setIsComplete(data.isComplete)
      setDrawerOpen(false)
    } catch (error: any) {
      alert(error.message)
    } finally {
      setIsLoading(false)
      setStatus("")
    }
  }

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const updated = sessions.filter(s => s.id !== id)
    setSessions(updated)
    localStorage.setItem("ai_sessions", JSON.stringify(updated))
    if (threadId === id) startNewSession()
  }

  useEffect(() => {
    if (!threadId && sessions.length === 0) startNewSession()
    else if (!threadId && sessions.length > 0) loadSession(sessions[0].id)
  }, [threadId])

  // ── Shared sidebar body ──────────────────────────────────────────────────────
  const SidebarBody = ({ onClose }: { onClose?: () => void }) => (
    <div className="flex flex-col h-full overflow-hidden">
      {/* New Chat */}
      <div className="px-3 pt-4 pb-3">
        <button
          onClick={() => { startNewSession(); onClose?.() }}
          className="w-full h-10 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 flex items-center gap-2.5 px-3 transition-all text-sm font-semibold"
        >
          <Plus className="h-4 w-4 flex-shrink-0" />
          New Chat
        </button>
      </div>

      {/* History label */}
      <div className="flex items-center gap-1.5 px-4 mb-2">
        <Clock className="h-3 w-3 text-stone-500" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">Recent Chats</span>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto space-y-1 px-2 custom-scrollbar">
        {sessions.length === 0 ? (
          <p className="px-3 py-2 text-sm text-stone-600 italic">No history yet.</p>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => { loadSession(s.id); onClose?.() }}
              className={`group relative p-3 rounded-xl cursor-pointer text-sm transition-all duration-200 border ${
                threadId === s.id ? "bg-stone-800 border-stone-700" : "hover:bg-stone-800/50 border-transparent hover:border-stone-800"
              }`}
            >
              <div className="pr-7">
                <span className={`block font-medium truncate ${threadId === s.id ? "text-emerald-400" : "text-stone-300"}`}>
                  {s.title || "Untitled Chat"}
                </span>
                <span className="text-[10px] opacity-40 mt-0.5">{new Date(s.timestamp).toLocaleDateString()}</span>
              </div>
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center text-stone-500 hover:text-rose-400 transition-all"
                onClick={(e) => deleteSession(e, s.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Footer: settings + user */}
      <div className="flex-shrink-0 border-t border-stone-800 p-3 space-y-3">
        <div className="space-y-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-800/50 transition-all text-xs font-semibold"
          >
            <Settings className={`h-4 w-4 flex-shrink-0 transition-transform ${showSettings ? "rotate-90" : ""}`} />
            AI Settings
          </button>
          {showSettings && (
            <div className="px-2 space-y-2 animate-in slide-in-from-top-2 duration-200">
              <p className="text-[10px] text-stone-500 font-bold uppercase tracking-tight">Groq API Key (BYOK)</p>
              <Input
                type="password"
                placeholder="gsk_..."
                value={apiKey}
                onChange={(e) => saveApiKey(e.target.value)}
                className="h-8 bg-stone-950 border-stone-800 text-xs focus-visible:ring-emerald-500/50"
              />
              <p className="text-[8px] text-stone-600 leading-tight">Stored locally in your browser only.</p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2.5 px-1">
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-[9px] font-bold text-stone-900 flex-shrink-0">SR</div>
          <span className="text-sm font-medium text-stone-300 truncate">Srinidhi Raman</span>
        </div>
      </div>
    </div>
  )

  // ── Schema panel content (shared between right column and right drawer) ──────
  const SchemaPanel = () => (
    <div className="p-4 space-y-4">
      {/* Schema */}
      <section className="bg-stone-900/40 border border-stone-800/80 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500"><Database className="h-4 w-4" /></div>
            <h2 className="font-bold text-stone-100 tracking-tight">Detected Schema</h2>
          </div>
          {schema.length > 0 && (
            <span className="text-[10px] font-black uppercase text-emerald-500/80 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              {schema.length} Entities
            </span>
          )}
        </div>
        <div className="space-y-2">
          {schema.length === 0 ? (
            <div className="py-6 text-center border-2 border-dashed border-stone-800 rounded-xl">
              <p className="text-xs text-stone-600 font-medium px-4">No entities detected yet. Describe your system to start.</p>
            </div>
          ) : (
            schema.map((ent, i) => (
              <div key={i} className="bg-stone-950/40 border border-stone-800/60 p-3.5 rounded-xl hover:border-emerald-500/30 transition-all duration-200">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                  <span className="font-bold text-sm text-stone-200 capitalize">{ent.entity}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ent.fields?.map((f: any, fi: number) => (
                    <span key={fi} className="text-[10px] bg-stone-800/60 text-stone-400 px-2 py-0.5 rounded-md border border-stone-700/50">{f.name}</span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
        {isComplete && (
          <div className="pt-1 animate-in fade-in duration-500">
            <Button
              onClick={handleDownloadZip}
              disabled={isLoading}
              className="w-full h-11 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black rounded-xl shadow-xl shadow-emerald-500/10 transition-all uppercase tracking-wider text-xs"
            >
              <Download className="mr-2 h-4 w-4 stroke-[3]" />
              {isLoading ? "Generating..." : "Get Build Code"}
            </Button>
            <p className="mt-2 text-center text-[10px] font-bold text-emerald-500/60 bg-emerald-500/5 py-1.5 rounded-lg border border-emerald-500/20">
              Ready to Generate Package
            </p>
          </div>
        )}
      </section>

      {/* Config */}
      <section className="bg-stone-900/40 border border-stone-800/80 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-stone-800 text-stone-400"><Settings className="h-4 w-4" /></div>
          <h2 className="font-bold text-stone-100 tracking-tight">Project Config</h2>
        </div>
        <div className="space-y-2">
          <div className="p-3 bg-stone-950/40 border border-stone-800 rounded-xl">
            <p className="text-[10px] text-stone-600 font-black uppercase mb-1 tracking-widest">Database Engine</p>
            <p className="text-sm font-bold text-stone-200 uppercase">{db || "Not Selected"}</p>
          </div>
          <div className="p-3 bg-stone-950/40 border border-stone-800 rounded-xl">
            <p className="text-[10px] text-stone-600 font-black uppercase mb-1 tracking-widest">Active Modules</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {features.length ? features.map((f, fi) => (
                <span key={fi} className="text-[10px] font-bold text-stone-400 border border-stone-800 bg-stone-900 px-2 py-0.5 rounded-md">{f}</span>
              )) : <span className="text-xs text-stone-700">None</span>}
            </div>
          </div>
        </div>
        <div className="border-t border-stone-800/50 pt-3">
          <div className="flex items-center justify-between text-[10px] font-bold">
            <span className="text-stone-600 uppercase">Architecture Node</span>
            <span className="text-emerald-500 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>Active
            </span>
          </div>
          <p className="mt-1 text-[10px] text-stone-700 font-mono">Session: {threadId || "---"}</p>
        </div>
      </section>
    </div>
  )

  return (
    <div className="flex h-screen bg-stone-950 text-stone-100 overflow-hidden font-sans">

      {/* ══════════════════════════════════
          LEFT SIDEBAR — lg+ only
      ══════════════════════════════════ */}
      <aside
        className={`hidden lg:flex flex-col border-r border-stone-800 bg-stone-900/50 transition-all duration-300 ease-in-out flex-shrink-0 ${
          sidebarExpanded ? "w-72" : "w-16"
        }`}
      >
        {sidebarExpanded ? (
          /* ── Expanded sidebar ── */
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header with collapse button */}
            <div className="flex items-center justify-between px-3 pt-4 pb-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-emerald-500" />
                <span className="text-xs font-bold text-stone-300">AI Backend Gen</span>
              </div>
              <button
                onClick={() => setSidebarExpanded(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-stone-500 hover:text-stone-100 hover:bg-stone-800 transition-all"
                title="Collapse sidebar"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
            <SidebarBody />
          </div>
        ) : (
          /* ── Collapsed sidebar: vertical icon strip ── */
          <div className="flex flex-col items-center py-3 gap-2 h-full">
            {/* Expand button — topmost */}
            <button
              onClick={() => setSidebarExpanded(true)}
              className="w-10 h-10 rounded-xl flex items-center justify-center text-stone-500 hover:text-stone-100 hover:bg-stone-800 border border-stone-800 transition-all"
              title="Expand sidebar"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            {/* Divider */}
            <div className="w-6 h-px bg-stone-800 my-1" />

            {/* New Chat */}
            <button
              onClick={startNewSession}
              className="w-10 h-10 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 flex items-center justify-center transition-all"
              title="New Chat"
            >
              <Plus className="h-5 w-5" />
            </button>

            {/* History (expand to see) */}
            <button
              onClick={() => setSidebarExpanded(true)}
              className="w-10 h-10 rounded-xl hover:bg-stone-800 text-stone-500 hover:text-stone-200 border border-transparent hover:border-stone-700 flex items-center justify-center transition-all"
              title="History"
            >
              <Clock className="h-5 w-5" />
            </button>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Divider */}
            <div className="w-6 h-px bg-stone-800 mb-1" />

            {/* Settings */}
            <button
              onClick={() => setSidebarExpanded(true)}
              className="w-10 h-10 rounded-xl hover:bg-stone-800 text-stone-500 hover:text-stone-200 border border-transparent hover:border-stone-700 flex items-center justify-center transition-all"
              title="Settings"
            >
              <Settings className="h-5 w-5" />
            </button>

            {/* User avatar */}
            <div
              className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-[9px] font-bold text-stone-900 cursor-pointer mb-1"
              title="Srinidhi Raman"
            >
              SR
            </div>
          </div>
        )}
      </aside>

      {/* ══════════════════════════════════
          MOBILE LEFT DRAWER (< lg)
      ══════════════════════════════════ */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />
      )}
      <div className={`fixed inset-y-0 left-0 z-40 w-72 bg-stone-900 border-r border-stone-800 flex flex-col transition-transform duration-300 ease-in-out lg:hidden ${
        drawerOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-bold text-stone-200">AI Backend Gen</span>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-all"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <SidebarBody onClose={() => setDrawerOpen(false)} />
        </div>
      </div>

      {/* ══════════════════════════════════
          MOBILE SCHEMA DRAWER (< lg, right side)
      ══════════════════════════════════ */}
      {schemaDrawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden backdrop-blur-sm"
          onClick={() => setSchemaDrawerOpen(false)}
        />
      )}
      <div className={`fixed inset-y-0 right-0 z-40 w-[min(320px,90vw)] bg-stone-950 border-l border-stone-800 flex flex-col transition-transform duration-300 ease-in-out lg:hidden ${
        schemaDrawerOpen ? "translate-x-0" : "translate-x-full"
      }`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-bold text-stone-200">Schema &amp; Config</span>
          </div>
          <button
            onClick={() => setSchemaDrawerOpen(false)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-all"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <SchemaPanel />
        </div>
      </div>

      {/* ══════════════════════════════════
          MAIN CONTENT
          chat + right panel (right panel hidden on < lg)
      ══════════════════════════════════ */}
      <div className="flex-1 flex overflow-hidden min-w-0">

        {/* ── CHAT COLUMN ─────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-stone-950">

          {/* Top bar */}
          <div className="flex items-center gap-2 px-3 py-3 md:px-5 md:py-4 border-b border-stone-800/60 flex-shrink-0">
            {/* Mobile hamburger (left) */}
            <button
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden w-9 h-9 rounded-xl flex items-center justify-center text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-all flex-shrink-0"
              title="Menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Terminal className="text-emerald-500 h-5 w-5 flex-shrink-0" />
              <h1 className="text-base md:text-lg font-black bg-gradient-to-r from-stone-100 to-stone-400 bg-clip-text text-transparent truncate">
                AI Backend Generator
              </h1>
            </div>

            {/* Status pill */}
            {status && (
              <span className="hidden sm:flex text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full animate-pulse items-center flex-shrink-0">
                {status}
              </span>
            )}

            {/* Schema drawer toggle — mobile/tablet only */}
            <button
              onClick={() => setSchemaDrawerOpen(true)}
              className="lg:hidden w-9 h-9 rounded-xl flex items-center justify-center text-stone-400 hover:text-stone-100 hover:bg-stone-800 border border-stone-800 transition-all flex-shrink-0 relative"
              title="Schema & Config"
            >
              <LayoutGrid className="h-5 w-5" />
              {schema.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-stone-900 text-[8px] font-black flex items-center justify-center">
                  {schema.length}
                </span>
              )}
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-8 lg:px-10 py-4 space-y-5"
          >
            {messages.map((m, i) => (
              <div key={i} className={`flex w-full ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`flex gap-3 max-w-[90%] md:max-w-[80%] ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`mt-1 flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border ${
                    m.role === "user"
                      ? "bg-stone-800 border-stone-700 text-stone-400"
                      : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500 animate-in zoom-in-75 duration-300"
                  }`}>
                    {m.role === "user" ? <div className="text-[10px] font-bold">U</div> : <Terminal className="h-4 w-4" />}
                  </div>
                  <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                    m.role === "user"
                      ? "bg-stone-200 text-stone-900 rounded-tr-none"
                      : "bg-stone-900/60 text-stone-100 border border-stone-800/80 rounded-tl-none font-medium"
                  }`}>
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start animate-in fade-in duration-500">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center gap-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce"></div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="flex-shrink-0 p-3 md:p-5 lg:p-6">
            <div className="max-w-3xl mx-auto relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition duration-500"></div>
              <div className="relative flex flex-col bg-stone-900 border border-stone-800 rounded-2xl shadow-2xl overflow-hidden">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Message your Backend Architect..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage() }
                  }}
                  disabled={isLoading}
                  rows={Math.min(input.split("\n").length, 4)}
                  className="w-full bg-transparent text-stone-100 placeholder:text-stone-600 p-3 md:p-4 resize-none focus:outline-none text-sm custom-scrollbar min-h-[48px]"
                />
                <div className="flex items-center justify-between px-3 py-2 border-t border-stone-800/50 bg-stone-900/50">
                  <div className="flex gap-1">
                    <div className="p-1.5 text-stone-600 hover:text-stone-400 cursor-help transition-colors"><Settings className="h-4 w-4" /></div>
                    <div className="p-1.5 text-stone-600 hover:text-stone-400 cursor-help transition-colors"><Code className="h-4 w-4" /></div>
                  </div>
                  <Button
                    onClick={handleSendMessage}
                    disabled={isLoading || !input.trim()}
                    className={`h-9 px-4 rounded-xl font-bold transition-all ${
                      isLoading ? "bg-stone-800 text-stone-600" : "bg-emerald-500 hover:bg-emerald-400 text-stone-950 shadow-lg shadow-emerald-500/20"
                    }`}
                  >
                    {isLoading ? "Thinking..." : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-center text-stone-600 uppercase tracking-widest font-bold">
                Generated backends may require manual review
              </p>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL — desktop only (lg+) ───────── */}
        <div className="hidden lg:flex lg:w-80 lg:flex-shrink-0 flex-col border-l border-stone-800 bg-stone-950 overflow-y-auto custom-scrollbar">
          <SchemaPanel />
        </div>

      </div>
    </div>
  )
}
