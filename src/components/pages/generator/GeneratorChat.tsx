"use client"

import React, { useState, useEffect, useRef } from "react"
import { Send, Download, Code, Database, Terminal, Settings, Clock, Plus, Trash2 } from "lucide-react"
import PageHeader from "@/components/PageHeader"
import { Button } from "@/components/ui/button" // Assuming I'll create this
import { Input } from "@/components/ui/input"   // Assuming I'll create this

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
  const [showHistory, setShowHistory] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [showSettings, setShowSettings] = useState(false)

  // Load session list and current thread on mount
  useEffect(() => {
    const savedSessions = localStorage.getItem("ai_sessions")
    if (savedSessions) {
      setSessions(JSON.parse(savedSessions))
    }
    const savedKey = localStorage.getItem("user_api_key")
    if (savedKey) {
      setApiKey(savedKey)
    }
  }, [])

  const saveApiKey = (key: string) => {
    setApiKey(key)
    localStorage.setItem("user_api_key", key)
  }

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
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
        headers: { 
          "Content-Type": "application/json",
          ...(apiKey ? { "x-api-key": apiKey } : {})
        },
        body: JSON.stringify({ 
          messages: [userMsg], // LangGraph handles history via threadId
          schema,
          db,
          features,
          threadId: threadId || "initial-session"
        })
      })

      if (!response.ok) throw new Error("Failed to connect to AI")

      const data = await response.json()
      
      const assistantMsg = { role: "assistant" as const, content: data.content }
      setMessages((prev) => [...prev, assistantMsg])
      setSchema(data.schema || [])
      setDb(data.db || "")
      setFeatures(data.features || [])
      setIsComplete(data.isComplete || false)

      // Update session title in history if it's the first message
      if (messages.length <= 1) {
        const newSession = { 
          id: threadId, 
          title: currentInput.slice(0, 30) + (currentInput.length > 30 ? "..." : ""),
          timestamp: Date.now() 
        }
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
        headers: { 
          "Content-Type": "application/json",
          ...(apiKey ? { "x-api-key": apiKey } : {})
        },
        body: JSON.stringify({ 
          entities: schema,
          db: db || "mysql", // Default fallback if not set but user forced download
          features: features.length ? features : ["crud"],
          threadId
        })
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
    setShowHistory(false)
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
      setShowHistory(false)
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
    if (threadId === id) {
       startNewSession()
    }
  }

  // Also auto-initialize threadId if empty
  useEffect(() => {
    if (!threadId && sessions.length === 0) {
      startNewSession()
    } else if (!threadId && sessions.length > 0) {
      loadSession(sessions[0].id)
    }
  }, [threadId])

  return (
    <div className="flex flex-col md:flex-row h-screen bg-stone-950 text-stone-100 overflow-hidden font-sans">
      {/* --- LEFT SIDEBAR (Collapsed/Expanded) --- */}
      <div 
        className={`flex flex-col border-r border-stone-800 bg-stone-900/50 transition-all duration-300 ease-in-out ${
          showHistory ? "w-80" : "w-16"
        }`}
      >
        <div className="flex flex-col flex-1 py-4 px-2">
          {/* Top Actions */}
          <div className="flex flex-col gap-4 mb-8">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={startNewSession}
              className="w-full h-12 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 shadow-lg shadow-emerald-500/5 transition-all"
              title="New Chat"
            >
              <Plus className="h-6 w-6" />
              {showHistory && <span className="ml-3 font-semibold">New Chat</span>}
            </Button>
            
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setShowHistory(!showHistory)}
              className={`w-full h-12 rounded-xl border border-stone-800 transition-all ${
                showHistory ? "bg-stone-800 text-stone-100" : "bg-stone-900 text-stone-400 hover:text-stone-100"
              }`}
              title="History"
            >
              <Clock className="h-6 w-6" />
              {showHistory && <span className="ml-3 font-semibold">History</span>}
            </Button>
          </div>

          {/* Expanded History Content */}
          {showHistory && (
            <div className="flex-1 flex flex-col overflow-hidden animate-in slide-in-from-left-4 duration-300">
              <h2 className="px-2 mb-4 text-xs font-bold uppercase tracking-widest text-stone-500">Recent Chats</h2>
              <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar pr-1">
                {sessions.length === 0 ? (
                  <p className="px-3 text-sm text-stone-600 italic">No history yet.</p>
                ) : (
                  sessions.map((s) => (
                    <div 
                      key={s.id} 
                      onClick={() => loadSession(s.id)}
                      className={`group relative p-3 rounded-xl cursor-pointer text-sm transition-all duration-200 border ${
                        threadId === s.id 
                          ? "bg-stone-800 border-stone-700 shadow-inner" 
                          : "hover:bg-stone-800/50 border-transparent hover:border-stone-800"
                      }`}
                    >
                      <div className="flex flex-col truncate pr-6">
                        <span className={`font-medium truncate ${threadId === s.id ? "text-emerald-400" : "text-stone-300"}`}>
                          {s.title || "Untitled Chat"}
                        </span>
                        <span className="text-[10px] opacity-40 mt-0.5">{new Date(s.timestamp).toLocaleDateString()}</span>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 opacity-0 group-hover:opacity-100 text-stone-500 hover:text-rose-400 transition-opacity"
                        onClick={(e) => deleteSession(e, s.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-stone-800 space-y-4">
           {/* API Key Toggle */}
           <div className="flex flex-col gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowSettings(!showSettings)}
                className="w-full justify-start text-stone-400 hover:text-stone-100 px-2"
              >
                <Settings className={`h-4 w-4 mr-3 transition-transform ${showSettings ? "rotate-90" : ""}`} />
                {showHistory && <span className="text-xs font-semibold">AI Settings</span>}
              </Button>
              
              {showSettings && showHistory && (
                <div className="px-2 space-y-2 animate-in slide-in-from-top-2 duration-300">
                  <p className="text-[10px] text-stone-500 font-bold uppercase tracking-tight">Groq API Key (BYOK)</p>
                  <Input 
                    type="password"
                    placeholder="gsk_..."
                    value={apiKey}
                    onChange={(e) => saveApiKey(e.target.value)}
                    className="h-8 bg-stone-950 border-stone-800 text-xs focus-visible:ring-emerald-500/50"
                  />
                  <p className="text-[8px] text-stone-600 leading-tight">Your key is stored locally in your browser and used only for your requests.</p>
                </div>
              )}
           </div>

           <div className={`flex items-center gap-3 ${!showHistory && "justify-center"}`}>
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-[10px] font-bold text-stone-900">SR</div>
              {showHistory && <span className="text-sm font-medium text-stone-300">Srinidhi Raman</span>}
           </div>
        </div>
      </div>

      {/* --- CENTER: CHAT AREA --- */}
      <div className="flex-1 flex flex-col bg-stone-950 relative">
        {/* Top Floating Header */}
        <div className="p-6 md:p-8 flex items-center justify-between pointer-events-none">
          <div className="pointer-events-auto">
             <h1 className="text-2xl font-black bg-gradient-to-r from-stone-100 to-stone-400 bg-clip-text text-transparent flex items-center gap-3">
               <Terminal className="text-emerald-500 h-6 w-6" /> AI Backend Generator
             </h1>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 md:px-12 py-4 space-y-8">
          {messages.map((m, i) => (
            <div 
              key={i} 
              className={`flex w-full group ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`flex gap-4 max-w-[85%] ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                <div className={`mt-1 flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${
                  m.role === "user" 
                    ? "bg-stone-800 border-stone-700 text-stone-400 shadow-sm" 
                    : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500 shadow-md shadow-emerald-500/5 animate-in zoom-in-75 duration-300"
                }`}>
                  {m.role === "user" ? <div className="text-[10px] font-bold">U</div> : <Terminal className="h-4 w-4" />}
                </div>
                
                <div className={`p-4 rounded-2xl text-sm md:text-base leading-relaxed shadow-sm transition-all ${
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
               <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.15s] mx-1"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce"></div>
                  </div>
               </div>
            </div>
          )}
          <div ref={scrollRef} className="h-2" />
        </div>

        {/* Bottom Input Field */}
        <div className="p-6 md:p-10">
          <div className="max-w-3xl mx-auto relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition duration-500"></div>
            <div className="relative flex flex-col bg-stone-900 border border-stone-800 rounded-2xl shadow-2xl overflow-hidden min-h-[56px]">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Message your Backend Architect..."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={isLoading}
                rows={Math.min(input.split("\n").length, 5)}
                className="w-full bg-transparent text-stone-100 placeholder:text-stone-600 p-4 resize-none focus:outline-none text-sm md:text-base custom-scrollbar"
              />
              <div className="flex items-center justify-between px-3 py-2 border-t border-stone-800/50 bg-stone-900/50">
                <div className="flex gap-1">
                   {/* Decorative icons for prompt-like feel */}
                   <div className="p-1.5 text-stone-600 hover:text-stone-400 cursor-help transition-colors"><Settings className="h-4 w-4" /></div>
                   <div className="p-1.5 text-stone-600 hover:text-stone-400 cursor-help transition-colors"><Code className="h-4 w-4" /></div>
                </div>
                <Button 
                  onClick={handleSendMessage} 
                  disabled={isLoading || !input.trim()}
                  className={`h-9 px-4 rounded-xl font-bold transition-all ${
                    isLoading 
                      ? "bg-stone-800 text-stone-600" 
                      : "bg-emerald-500 hover:bg-emerald-400 text-stone-950 shadow-lg shadow-emerald-500/20"
                  }`}
                >
                  {isLoading ? "Thinking..." : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="mt-3 text-[10px] text-center text-stone-600 uppercase tracking-widest font-bold">Generated backends may require manual review</p>
          </div>
        </div>
      </div>

      {/* --- RIGHT: SCHEMA & STATS --- */}
      <div className="w-80 border-l border-stone-800 bg-stone-950 flex flex-col">
        <div className="p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
          {/* Schema Panel */}
          <section className="bg-stone-900/40 border border-stone-800/80 rounded-2xl p-5 shadow-sm space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500"><Database className="h-5 w-5" /></div>
                <h2 className="font-bold text-stone-100 tracking-tight">Schema</h2>
              </div>
              {schema.length > 0 && <span className="text-[10px] font-black uppercase text-emerald-500/80 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">{schema.length} Entities</span>}
            </div>
            
            <div className="space-y-3">
              {schema.length === 0 ? (
                <div className="py-8 text-center border-2 border-dashed border-stone-800 rounded-xl">
                  <p className="text-xs text-stone-600 font-medium px-4">No entities detected yet. Describe your system to start.</p>
                </div>
              ) : (
                schema.map((ent, i) => (
                  <div key={i} className="group relative bg-stone-950/40 border border-stone-800/60 p-3.5 rounded-xl hover:border-emerald-500/30 transition-all hover:translate-x-1 duration-200">
                    <div className="flex items-center gap-2 mb-1.5">
                       <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                       <span className="font-bold text-sm text-stone-200 capitalize tracking-tight">{ent.entity}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {ent.fields?.map((f: any, fi: number) => (
                        <span key={fi} className="text-[10px] bg-stone-800/60 text-stone-400 px-2 py-0.5 rounded-md border border-stone-700/50">
                          {f.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            {isComplete && (
              <div className="pt-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <Button 
                  onClick={handleDownloadZip} 
                  disabled={isLoading}
                  className="w-full h-12 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black rounded-xl shadow-xl shadow-emerald-500/10 transition-all uppercase tracking-wider text-xs"
                >
                  <Download className="mr-2 h-4 w-4 stroke-[3]" />
                  {isLoading ? "Generating..." : "Get Build Code"}
                </Button>
                <p className="mt-3 text-center text-[10px] font-bold text-emerald-500/60 bg-emerald-500/5 py-1.5 rounded-lg border border-emerald-500/20">Ready to Generate Package</p>
              </div>
            )}
          </section>

          {/* Configuration Panel */}
          <section className="bg-stone-900/40 border border-stone-800/80 rounded-2xl p-5 shadow-sm space-y-5">
             <div className="flex items-center gap-2.5">
               <div className="p-2 rounded-lg bg-stone-800 text-stone-400"><Settings className="h-5 w-5" /></div>
               <h2 className="font-bold text-stone-100 tracking-tight">Project Config</h2>
             </div>
             <div className="grid grid-cols-1 gap-4">
               <div className="p-3 bg-stone-950/40 border border-stone-800 rounded-xl">
                 <p className="text-[10px] text-stone-600 font-black uppercase mb-1 tracking-widest">Database Engine</p>
                 <p className="text-sm font-bold text-stone-200 uppercase tracking-tight">{db || "Not Selected"}</p>
               </div>
               <div className="p-3 bg-stone-950/40 border border-stone-800 rounded-xl">
                 <p className="text-[10px] text-stone-600 font-black uppercase mb-1 tracking-widest">Active Modules</p>
                 <div className="flex flex-wrap gap-1.5 mt-1">
                   {features.length ? features.map((f, fi) => (
                     <span key={fi} className="text-[10px] font-bold text-stone-400 border border-stone-800 bg-stone-900 px-2 py-0.5 rounded-md self-start">{f}</span>
                   )) : <span className="text-xs text-stone-700">None</span>}
                 </div>
               </div>
             </div>
             
             <div className="pt-2 border-t border-stone-800/50 mt-4">
               <div className="flex items-center justify-between text-[10px] font-bold">
                 <span className="text-stone-600 uppercase">Architecture Node</span>
                 <span className="text-emerald-500 flex items-center gap-1.5">
                   <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                   Active
                 </span>
               </div>
               <p className="mt-1 text-[10px] text-stone-700 font-mono tracking-tighter">Session: {threadId || "---"}</p>
             </div>
          </section>
        </div>
      </div>
    </div>
  )
}
