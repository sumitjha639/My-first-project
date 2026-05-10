import { useState, useRef, useEffect, useCallback } from "react";

// ════════════════════════════════════════════════════════════════
//  VEDANTA AI — PRODUCTION v1.0
//  APIs: Claude (Anthropic) · Groq (Llama3 fast) · DuckDuckGo Search
//  Storage: localStorage (free, instant, persistent)
//  Safety: Input filter + content moderation
// ════════════════════════════════════════════════════════════════

// ── CONFIG — paste your keys here ─────────────────────────────
const CONFIG = {
  ANTHROPIC_KEY: "YOUR_ANTHROPIC_KEY",   // console.anthropic.com (free $5 credit)
  GROQ_KEY: "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",             // console.groq.com (FREE, very fast)
  USE_GROQ_FOR_QUICK: true,              // Groq for fast replies, Claude for deep ones
};

// ── SAFETY FILTER ──────────────────────────────────────────────
const BLOCKED = ["bomb","kill","hack","drugs","suicide","weapon","porn","nude","terror","violence"];
function isSafe(text) {
  const l = text.toLowerCase();
  return !BLOCKED.some(w => l.includes(w));
}

// ── LOCAL STORAGE HELPERS ──────────────────────────────────────
const LS = {
  get: (k, def = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} }
};

// ── SYSTEM PROMPTS ─────────────────────────────────────────────
const PROMPTS = {
  answer: `You are Vedanta AI — India's most elegant and precise AI assistant.
Style: Confident, structured, insightful. Use **bold** for key terms.
Format answers with clear sections. End with a sharp one-liner insight.
You have web search results available — cite them when relevant.
Never make up facts. If unsure, say so and suggest verification.`,

  student: (mem) => `You are Vedanta Student Core — a world-class personal tutor.
Student memory: ${mem.length ? mem.join(" | ") : "Building profile..."}
Style: Socratic, encouraging, step-by-step. Use examples and analogies.
Always reference what you know about this student. End with a follow-up question.
Format: **bold** terms, numbered steps, short paragraphs.`,

  business: (mem) => `You are Vedanta Business Core — a sharp CFO-level advisor.
Business memory: ${mem.length ? mem.join(" | ") : "Gathering data..."}
When numbers mentioned: calculate instantly, show P&L, flag risks.
Style: Direct, data-driven, actionable. Reference memory naturally.
Format: **bold** headers, bullet points for actions, tables for numbers.`
};

// ── SEARCH (DuckDuckGo — no API key needed) ────────────────────
async function webSearch(query) {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
    const res = await fetch(url);
    const data = await res.json();
    const results = [];
    if (data.AbstractText) results.push(data.AbstractText);
    if (data.RelatedTopics) {
      data.RelatedTopics.slice(0, 3).forEach(t => {
        if (t.Text) results.push(t.Text);
      });
    }
    return results.length ? results.join("\n\n") : null;
  } catch { return null; }
}

// ── GROQ API (Free, llama-3.3-70b, ultra fast) ────────────────
async function callGroq(messages, systemPrompt) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${CONFIG.GROQ_KEY}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages
      ]
    })
  });
  if (!res.ok) throw new Error("Groq error");
  const data = await res.json();
  return data.choices[0]?.message?.content || "";
}

// ── CLAUDE API (Deep reasoning, answers) ──────────────────────
async function callClaude(messages, systemPrompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages
    })
  });
  if (!res.ok) {
    const e = await res.json();
    throw new Error(e.error?.message || "Claude error");
  }
  const data = await res.json();
  return data.content?.map(b => b.text || "").join("") || "";
}

// ── SMART AI ROUTER ────────────────────────────────────────────
async function callAI(messages, systemPrompt, mode) {
  const isQuick = mode === "answer" && CONFIG.USE_GROQ_FOR_QUICK;
  // Try primary, fallback to other
  if (isQuick && CONFIG.GROQ_KEY !== "YOUR_GROQ_KEY") {
    try { return await callGroq(messages, systemPrompt); } catch {}
  }
  if (CONFIG.ANTHROPIC_KEY !== "YOUR_ANTHROPIC_KEY") {
    try { return await callClaude(messages, systemPrompt); } catch {}
  }
  if (!isQuick && CONFIG.GROQ_KEY !== "YOUR_GROQ_KEY") {
    try { return await callGroq(messages, systemPrompt); } catch {}
  }
  throw new Error("No API keys configured. Add keys in CONFIG at top of file.");
}

// ── MEMORY EXTRACTOR ───────────────────────────────────────────
function extractMemories(text, type) {
  const mems = [];
  if (type === "student") {
    const sub = text.match(/(?:studying|learning|subject[s]? (?:is|are)|preparing for)\s+([A-Za-z ,]+)/i);
    const exam = text.match(/(JEE|NEET|UPSC|CAT|GATE|board|class \d+|12th|10th)/i);
    const grade = text.match(/(?:got|scored|marks?)\s+(\d+[%]?)/i);
    if (sub) mems.push(`Studies: ${sub[1].trim().slice(0, 40)}`);
    if (exam) mems.push(`Exam: ${exam[1]}`);
    if (grade) mems.push(`Score: ${grade[1]}`);
  }
  if (type === "business") {
    const rev = text.match(/(?:revenue|sales|income|turnover)[^\d₹]*[₹]?\s*([\d,]+(?:\s*(?:lakh|L|crore|Cr|k|K))?)/i);
    const exp = text.match(/(?:expense|cost|spend|overhead)[^\d₹]*[₹]?\s*([\d,]+(?:\s*(?:lakh|L|crore|Cr|k|K))?)/i);
    const emp = text.match(/(\d+)\s*(?:employees|staff|people|team)/i);
    const industry = text.match(/(?:in|run|own)\s+(?:a|an)\s+([A-Za-z ]+)(?:business|company|startup|firm)/i);
    if (rev) mems.push(`Revenue: ₹${rev[1]}`);
    if (exp) mems.push(`Expenses: ₹${exp[1]}`);
    if (emp) mems.push(`Team: ${emp[1]} people`);
    if (industry) mems.push(`Industry: ${industry[1].trim()}`);
  }
  return mems;
}

// ── MARKDOWN RENDERER ──────────────────────────────────────────
function Markdown({ text }) {
  const lines = text.split("\n");
  const els = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s/, "")); i++; }
      els.push(<ol key={i} style={{ paddingLeft: 22, margin: "6px 0", display: "flex", flexDirection: "column", gap: 5 }}>{items.map((t, j) => <li key={j} style={{ color: "#c8c8c8", lineHeight: 1.65, fontSize: 14 }}><Inline text={t} /></li>)}</ol>);
      continue;
    }
    if (/^[-•]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-•]\s/.test(lines[i])) { items.push(lines[i].replace(/^[-•]\s/, "")); i++; }
      els.push(
        <ul key={i} style={{ paddingLeft: 0, margin: "6px 0", display: "flex", flexDirection: "column", gap: 5 }}>
          {items.map((t, j) => (
            <li key={j} style={{ color: "#c8c8c8", lineHeight: 1.65, fontSize: 14, listStyle: "none", display: "flex", gap: 10 }}>
              <span style={{ color: "#d4a843", flexShrink: 0, marginTop: 3, fontSize: 10 }}>◆</span>
              <span><Inline text={t} /></span>
            </li>
          ))}
        </ul>
      );
      continue;
    }
    if (line.trim() === "") { els.push(<div key={i} style={{ height: 6 }} />); i++; continue; }
    els.push(<p key={i} style={{ color: "#c8c8c8", lineHeight: 1.7, margin: "2px 0", fontSize: 14 }}><Inline text={line} /></p>);
    i++;
  }
  return <div>{els}</div>;
}

function Inline({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return <>{parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} style={{ color: "#fff", fontWeight: 600 }}>{p.slice(2,-2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`")) return <code key={i} style={{ background: "#1a1a2e", color: "#d4a843", padding: "1px 7px", borderRadius: 5, fontSize: "0.88em", fontFamily: "monospace" }}>{p.slice(1,-1)}</code>;
    if (p.startsWith("*") && p.endsWith("*")) return <em key={i} style={{ color: "#aaa" }}>{p.slice(1,-1)}</em>;
    return p;
  })}</>;
}

// ── WELCOME DATA ───────────────────────────────────────────────
const WELCOME = {
  answer: {
    title: "What do you want to explore?",
    sub: "Real-time web search · Claude AI · Groq Llama3",
    chips: ["Explain quantum computing", "India's startup ecosystem 2025", "How does GPT-4 work?", "Best investment strategies for India"]
  },
  student: {
    title: "Your Personal Tutor",
    sub: "Remembers your subjects, goals, and progress",
    chips: ["I'm preparing for JEE 2026", "Explain integration by parts", "Make me a 30-day study plan", "What is Newton's 3rd law?"]
  },
  business: {
    title: "Your Business Advisor",
    sub: "CFO-level analysis · Tracks your numbers · Remembers everything",
    chips: ["My revenue this month is ₹8 lakh", "Analyze my profit margins", "How to scale from 10 to 100 customers?", "Should I raise funding now?"]
  }
};

// ════════════════════════════════════════════════════════════════
//  MAIN APP
// ════════════════════════════════════════════════════════════════
export default function App() {
  const [screen, setScreen] = useState(() => LS.get("vedanta_user") ? "app" : "login");
  const [email, setEmail] = useState(() => LS.get("vedanta_user", ""));
  const [pass, setPass] = useState("");
  const [mode, setMode] = useState("answer");
  const [coreType, setCoreType] = useState(null);
  const [messages, setMessages] = useState([]);
  const [history, setHistory] = useState(() => LS.get("vedanta_history", []));
  const [activeChat, setActiveChat] = useState(null);
  const [memory, setMemory] = useState(() => LS.get("vedanta_memory", { student: [], business: [] }));
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState(null);
  const [searchStatus, setSearchStatus] = useState(null);
  const [apiStatus, setApiStatus] = useState(null);
  const bottomRef = useRef(null);
  const taRef = useRef(null);
  const hasKeys = CONFIG.ANTHROPIC_KEY !== "YOUR_ANTHROPIC_KEY" || CONFIG.GROQ_KEY !== "YOUR_GROQ_KEY";

  // Persist memory & history
  useEffect(() => { LS.set("vedanta_memory", memory); }, [memory]);
  useEffect(() => { LS.set("vedanta_history", history.slice(0, 60)); }, [history]);

  // Auto scroll
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, thinking, streaming]);

  // Auto resize textarea
  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = "auto";
      taRef.current.style.height = Math.min(taRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  const login = () => {
    if (!email.trim()) return;
    LS.set("vedanta_user", email);
    setScreen("app");
  };

  const logout = () => {
    LS.del("vedanta_user");
    setScreen("login");
    setMessages([]);
    setHistory([]);
  };

  const switchMode = (m) => { setMode(m); setCoreType(null); setMessages([]); setActiveChat(null); setSidebarOpen(false); setError(null); };
  const newChat = () => { setMessages([]); setActiveChat(null); if (mode === "core") setCoreType(null); setSidebarOpen(false); setError(null); };

  const loadChat = (id) => {
    const c = history.find(h => h.id === id);
    if (!c) return;
    setActiveChat(id); setMessages(c.msgs);
    setMode(c.mode || "answer"); setCoreType(c.coreType || null);
    setSidebarOpen(false);
  };

  const deleteChat = (e, id) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(h => h.id !== id));
    if (activeChat === id) newChat();
  };

  const send = useCallback(async (overrideText) => {
    const text = (overrideText || input).trim();
    if (!text || thinking) return;
    if (mode === "core" && !coreType) return;

    // Safety check
    if (!isSafe(text)) {
      setError("⚠️ This message was blocked by our safety filter. Please keep conversations constructive.");
      return;
    }

    const userMsg = { role: "user", text, ts: Date.now() };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    setThinking(true);
    setStreaming("");
    setError(null);
    setSearchStatus(null);
    setApiStatus(null);

    // Extract memories
    if (mode === "core" && coreType) {
      const mems = extractMemories(text, coreType);
      if (mems.length) {
        setMemory(prev => {
          const updated = { ...prev, [coreType]: [...new Set([...prev[coreType], ...mems])] };
          return updated;
        });
      }
    }

    try {
      // Web search for answer mode
      let searchContext = "";
      const needsSearch = mode === "answer" && /news|today|2024|2025|latest|current|price|who is|what happened|recently/i.test(text);
      if (needsSearch) {
        setSearchStatus("Searching web...");
        const results = await webSearch(text);
        if (results) {
          searchContext = `\n\nWeb search results for "${text}":\n${results}\n\nUse this information in your answer.`;
          setSearchStatus("✓ Web searched");
        } else {
          setSearchStatus(null);
        }
      }

      // Build system prompt
      const currentMem = (mode === "core" && coreType) ? memory[coreType] || [] : [];
      const sysPrompt = mode === "answer"
        ? PROMPTS.answer + searchContext
        : coreType === "student" ? PROMPTS.student(currentMem) : PROMPTS.business(currentMem);

      // API messages (last 10 for context window)
      const apiMsgs = newMsgs.slice(-10).map(m => ({
        role: m.role === "ai" ? "assistant" : "user",
        content: m.text
      }));

      // Detect which API to use
      const useGroq = CONFIG.USE_GROQ_FOR_QUICK && mode === "answer" && CONFIG.GROQ_KEY !== "YOUR_GROQ_KEY";
      setApiStatus(useGroq ? "⚡ Groq Llama3" : "✦ Claude");

      const reply = await callAI(apiMsgs, sysPrompt, mode);

      // Simulate streaming
      setThinking(false);
      const words = reply.split(" ");
      let displayed = "";
      for (let wi = 0; wi < words.length; wi++) {
        displayed += (wi === 0 ? "" : " ") + words[wi];
        setStreaming(displayed);
        await new Promise(r => setTimeout(r, 15 + Math.random() * 10));
      }
      setStreaming("");
      setApiStatus(null);
      setSearchStatus(null);

      const aiMsg = { role: "ai", text: reply, ts: Date.now() };
      const allMsgs = [...newMsgs, aiMsg];
      setMessages(allMsgs);

      // Save to history
      const chatId = activeChat || Date.now();
      const title = text.slice(0, 55) + (text.length > 55 ? "…" : "");
      setHistory(prev => {
        const filtered = prev.filter(h => h.id !== chatId);
        return [{ id: chatId, title, msgs: allMsgs, mode, coreType }, ...filtered].slice(0, 60);
      });
      setActiveChat(chatId);

    } catch (err) {
      setThinking(false);
      setStreaming("");
      setApiStatus(null);
      setSearchStatus(null);
      setError(err.message || "Something went wrong. Check your API keys.");
    }
  }, [input, messages, thinking, mode, coreType, memory, activeChat]);

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const effectiveMode = mode === "core" ? coreType : mode;
  const welcomeData = WELCOME[effectiveMode] || WELCOME.answer;
  const showWelcome = messages.length === 0 && !thinking && !streaming;
  const memChips = (mode === "core" && coreType) ? memory[coreType] : [];
  const userName = email ? email[0].toUpperCase() : "V";
  const displayEmail = email.length > 22 ? email.slice(0, 22) + "…" : email;

  // ── LOGIN SCREEN ──────────────────────────────────────────────
  if (screen === "login") {
    return (
      <div style={{
        minHeight: "100dvh",
        background: "#060608",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
        fontFamily: "'DM Sans', system-ui, sans-serif"
      }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@300;400;500;600&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          ::placeholder { color: #2a2a2a !important; }
          input:focus { outline: none !important; border-color: #d4a843 !important; box-shadow: 0 0 0 3px rgba(212,168,67,0.08) !important; }
          .l-btn:hover { background: #e8c547 !important; }
          @keyframes floatIn { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
          .float-in { animation: floatIn 0.6s ease forwards; }
          .float-in-2 { animation: floatIn 0.6s 0.1s ease forwards; opacity: 0; }
          .float-in-3 { animation: floatIn 0.6s 0.2s ease forwards; opacity: 0; }
        `}</style>

        <div style={{ width: "100%", maxWidth: 380 }}>
          {/* Brand */}
          <div className="float-in" style={{ marginBottom: 52 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: "linear-gradient(135deg, #d4a843 0%, #b8892a 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 8px 24px rgba(212,168,67,0.3)"
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, color: "#fff", letterSpacing: -0.5, lineHeight: 1 }}>Vedanta</div>
                <div style={{ fontSize: 11, color: "#3a3a3a", letterSpacing: 3, textTransform: "uppercase", marginTop: 2 }}>Artificial Intelligence</div>
              </div>
            </div>
          </div>

          <div className="float-in-2">
            <div style={{ fontSize: 22, color: "#e8e8e8", fontWeight: 500, marginBottom: 6 }}>Sign in to continue</div>
            <div style={{ fontSize: 14, color: "#3a3a3a", marginBottom: 32 }}>India's most powerful AI assistant</div>

            <input
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && document.getElementById("pi2")?.focus()}
              style={{
                width: "100%", background: "#0e0e10", border: "1px solid #1a1a1a",
                color: "#e0e0e0", padding: "15px 18px", fontSize: 15,
                borderRadius: 12, display: "block", transition: "all 0.2s",
                fontFamily: "inherit"
              }}
            />
            <input
              id="pi2" type="password" placeholder="Password"
              value={pass} onChange={e => setPass(e.target.value)}
              onKeyDown={e => e.key === "Enter" && login()}
              style={{
                width: "100%", background: "#0e0e10", border: "1px solid #1a1a1a",
                color: "#e0e0e0", padding: "15px 18px", fontSize: 15,
                borderRadius: 12, display: "block", marginTop: 10, transition: "all 0.2s",
                fontFamily: "inherit"
              }}
            />

            <button onClick={login} className="l-btn" style={{
              width: "100%", marginTop: 16, padding: "15px",
              background: "#d4a843", color: "#000", border: "none",
              borderRadius: 12, fontSize: 15, fontWeight: 600,
              cursor: "pointer", transition: "background 0.2s",
              fontFamily: "inherit", letterSpacing: 0.3,
              boxShadow: "0 4px 20px rgba(212,168,67,0.25)"
            }}>
              Continue →
            </button>

            <div style={{ textAlign: "center", marginTop: 22, fontSize: 13, color: "#333" }}>
              No account? <span onClick={login} style={{ color: "#d4a843", cursor: "pointer", fontWeight: 500 }}>Sign up free</span>
            </div>
          </div>

          <div className="float-in-3" style={{ marginTop: 52, paddingTop: 28, borderTop: "1px solid #0f0f0f" }}>
            <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
              {["🧠 Claude AI", "⚡ Groq Fast", "🔍 Web Search"].map((f, i) => (
                <div key={i} style={{ fontSize: 11, color: "#2a2a2a", letterSpacing: 0.3 }}>{f}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── MAIN APP ──────────────────────────────────────────────────
  return (
    <div style={{ height: "100dvh", display: "flex", background: "#060608", overflow: "hidden", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: #181818; border-radius: 4px; }
        button:focus, textarea:focus, input:focus { outline: none; }
        @keyframes blink { 0%,80%,100%{opacity:0.1;transform:scale(0.7);}40%{opacity:1;transform:scale(1);} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);} }
        @keyframes cursor { 0%,100%{opacity:1;}50%{opacity:0;} }
        @keyframes shimmer { 0%{opacity:0.5;}100%{opacity:1;} }
        .msg-in { animation: fadeUp 0.3s ease forwards; }
        .sb-item:hover { background: #0e0e10 !important; }
        .sb-item:hover .del-btn { opacity: 1 !important; }
        .del-btn { opacity: 0; transition: opacity 0.15s; }
        .chip-btn:hover { background: #0e0e10 !important; border-color: #252525 !important; color: #999 !important; }
        .send-btn:hover:not(:disabled) { background: #e8c547 !important; transform: scale(1.05); }
        .nav-btn:hover { background: #0e0e10 !important; }
        ::placeholder { color: #252525 !important; }
        .mode-pill:hover { color: #888 !important; }
        .core-card:hover { border-color: #2a2a2a !important; background: #0d0d0f !important; }
        @keyframes searchPulse { 0%,100%{opacity:0.5;}50%{opacity:1;} }
      `}</style>

      {/* ── SIDEBAR OVERLAY ── */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
          zIndex: 40, backdropFilter: "blur(3px)"
        }} />
      )}

      {/* ── SIDEBAR ── */}
      <div style={{
        position: "fixed", top: 0, left: 0, bottom: 0, width: 268,
        background: "#0a0a0c", borderRight: "1px solid #111",
        zIndex: 50, display: "flex", flexDirection: "column",
        transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
      }}>
        {/* Sidebar top */}
        <div style={{ padding: "20px 14px 14px", borderBottom: "1px solid #111" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 30, height: 30, borderRadius: 8,
                background: "linear-gradient(135deg, #d4a843, #b8892a)",
                display: "flex", alignItems: "center", justifyContent: "center"
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <span style={{ fontFamily: "'DM Serif Display', serif", color: "#e0e0e0", fontSize: 17 }}>Vedanta</span>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="nav-btn" style={{
              background: "transparent", border: "none", color: "#333",
              cursor: "pointer", width: 28, height: 28, borderRadius: 6,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16
            }}>✕</button>
          </div>
          <button onClick={newChat} style={{
            width: "100%", padding: "9px 14px", background: "#d4a843",
            color: "#000", border: "none", borderRadius: 9, fontSize: 13,
            fontWeight: 600, cursor: "pointer", display: "flex",
            alignItems: "center", gap: 8, justifyContent: "center",
            boxShadow: "0 2px 12px rgba(212,168,67,0.2)"
          }}>
            <span>✦</span> New Chat
          </button>
        </div>

        {/* History list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 6px" }}>
          {history.length === 0 ? (
            <div style={{ color: "#222", fontSize: 12, textAlign: "center", marginTop: 40 }}>No conversations yet</div>
          ) : history.map(h => (
            <div key={h.id} className="sb-item" onClick={() => loadChat(h.id)} style={{
              padding: "9px 10px", borderRadius: 8, cursor: "pointer",
              background: activeChat === h.id ? "#111" : "transparent",
              marginBottom: 1, transition: "background 0.15s",
              borderLeft: `2px solid ${activeChat === h.id ? "#d4a843" : "transparent"}`,
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8
            }}>
              <div style={{ fontSize: 12.5, color: activeChat === h.id ? "#ccc" : "#444", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{h.title}</div>
              <button className="del-btn" onClick={e => deleteChat(e, h.id)} style={{
                background: "transparent", border: "none", color: "#333",
                cursor: "pointer", fontSize: 13, padding: "2px 4px", flexShrink: 0
              }}>✕</button>
            </div>
          ))}
        </div>

        {/* User + API status */}
        <div style={{ padding: "14px", borderTop: "1px solid #111" }}>
          {!hasKeys && (
            <div style={{
              background: "rgba(212,168,67,0.08)", border: "1px solid rgba(212,168,67,0.2)",
              borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 11, color: "#d4a843"
            }}>
              ⚠ Add API keys in CONFIG to enable AI
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "linear-gradient(135deg, #d4a843, #b8892a)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 700, color: "#000"
              }}>{userName}</div>
              <div>
                <div style={{ fontSize: 12, color: "#888", fontWeight: 500 }}>{displayEmail}</div>
                <div style={{ fontSize: 10, color: "#2a2a2a" }}>Free Plan</div>
              </div>
            </div>
            <button onClick={logout} className="nav-btn" style={{
              background: "transparent", border: "1px solid #1a1a1a",
              color: "#333", cursor: "pointer", borderRadius: 7,
              padding: "4px 8px", fontSize: 11
            }}>Out</button>
          </div>
        </div>
      </div>

      {/* ── MAIN AREA ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 14px", height: 54, borderBottom: "1px solid #0f0f0f",
          background: "#060608", flexShrink: 0, gap: 10
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <button onClick={() => setSidebarOpen(true)} className="nav-btn" style={{
              background: "transparent", border: "none", color: "#444",
              cursor: "pointer", width: 34, height: 34, borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 17, flexShrink: 0
            }}>☰</button>

            {/* Mode pills */}
            <div style={{ display: "flex", gap: 3, background: "#0d0d0f", borderRadius: 9, padding: 3, border: "1px solid #141416", flexShrink: 0 }}>
              {[{ id: "answer", label: "Answer" }, { id: "core", label: "Core" }].map(m => (
                <button key={m.id} onClick={() => switchMode(m.id)} className="mode-pill" style={{
                  padding: "5px 13px", borderRadius: 7, border: "none",
                  fontSize: 12, fontWeight: 500, cursor: "pointer",
                  background: mode === m.id ? "#d4a843" : "transparent",
                  color: mode === m.id ? "#000" : "#333",
                  transition: "all 0.15s", fontFamily: "inherit"
                }}>{m.label}</button>
              ))}
            </div>

            {/* Status indicators */}
            {(searchStatus || apiStatus) && (
              <div style={{ fontSize: 11, color: "#d4a843", animation: "searchPulse 1s infinite", flexShrink: 0 }}>
                {searchStatus || apiStatus}
              </div>
            )}
          </div>

          <button onClick={newChat} style={{
            background: "transparent", border: "1px solid #141416",
            color: "#333", cursor: "pointer", width: 32, height: 32,
            borderRadius: 8, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 15, flexShrink: 0, transition: "background 0.15s"
          }} className="nav-btn">✦</button>
        </div>

        {/* Core selector */}
        {mode === "core" && (
          <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: "1px solid #0f0f0f", flexShrink: 0 }}>
            {[
              { id: "student", icon: "🎓", label: "Student Core", desc: "Tutor with memory" },
              { id: "business", icon: "📊", label: "Business Core", desc: "CFO advisor" }
            ].map(ct => (
              <button key={ct.id} onClick={() => { setCoreType(ct.id); setMessages([]); setError(null); }} className="core-card" style={{
                flex: 1, padding: "10px 12px", borderRadius: 10,
                border: `1px solid ${coreType === ct.id ? "#d4a843" : "#141416"}`,
                background: coreType === ct.id ? "rgba(212,168,67,0.07)" : "#0a0a0c",
                cursor: "pointer", transition: "all 0.15s", textAlign: "left"
              }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: coreType === ct.id ? "#d4a843" : "#444" }}>{ct.icon} {ct.label}</div>
                <div style={{ fontSize: 11, color: "#252525", marginTop: 2 }}>{ct.desc}</div>
              </button>
            ))}
          </div>
        )}

        {/* Memory chips */}
        {memChips.length > 0 && (
          <div style={{ padding: "6px 14px", display: "flex", gap: 6, flexWrap: "wrap", borderBottom: "1px solid #0d0d0f", flexShrink: 0, background: "#060608" }}>
            {memChips.map((m, i) => (
              <div key={i} style={{
                fontSize: 11, color: "#d4a843", background: "rgba(212,168,67,0.07)",
                border: "1px solid rgba(212,168,67,0.15)", borderRadius: 20,
                padding: "3px 10px", display: "flex", alignItems: "center", gap: 4
              }}>◆ {m}</div>
            ))}
            <button onClick={() => {
              setMemory(prev => ({ ...prev, [coreType]: [] }));
            }} style={{
              fontSize: 10, color: "#222", background: "transparent",
              border: "none", cursor: "pointer", padding: "2px 6px"
            }}>Clear memory</button>
          </div>
        )}

        {/* Messages area */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 0 8px" }}>
          {showWelcome ? (
            <div style={{ maxWidth: 660, margin: "0 auto", padding: "40px 16px 24px" }}>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, color: "#d8d8d8", marginBottom: 8, lineHeight: 1.3 }}>
                {welcomeData.title}
              </div>
              <div style={{ fontSize: 13, color: "#2e2e2e", marginBottom: 36 }}>{welcomeData.sub}</div>

              {!hasKeys && (
                <div style={{
                  background: "rgba(212,168,67,0.06)", border: "1px solid rgba(212,168,67,0.15)",
                  borderRadius: 12, padding: "14px 18px", marginBottom: 28, fontSize: 13, color: "#d4a843"
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>⚙ Setup Required</div>
                  <div style={{ color: "#7a5f20", lineHeight: 1.6, fontSize: 12 }}>
                    Open the JSX file and add your API keys in the CONFIG section at the top.<br/>
                    • Anthropic key → console.anthropic.com<br/>
                    • Groq key (FREE) → console.groq.com
                  </div>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {welcomeData.chips.map((s, i) => (
                  <button key={i} onClick={() => send(s)} className="chip-btn" style={{
                    width: "100%", textAlign: "left", padding: "13px 16px",
                    background: "#0a0a0c", border: "1px solid #141416",
                    borderRadius: 11, color: "#555", fontSize: 14,
                    cursor: "pointer", transition: "all 0.15s",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    fontFamily: "inherit"
                  }}>
                    <span>{s}</span>
                    <span style={{ color: "#222", fontSize: 16 }}>›</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ maxWidth: 700, margin: "0 auto", padding: "20px 14px 8px" }}>
              {messages.map((msg, i) => (
                <div key={i} className="msg-in" style={{
                  marginBottom: 20, display: "flex",
                  flexDirection: msg.role === "user" ? "row-reverse" : "row",
                  gap: 10, alignItems: "flex-start"
                }}>
                  {/* Avatar */}
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                    background: msg.role === "user" ? "#111" : "linear-gradient(135deg, #d4a843, #b8892a)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700,
                    color: msg.role === "user" ? "#444" : "#000",
                    border: msg.role === "user" ? "1px solid #1a1a1a" : "none"
                  }}>
                    {msg.role === "user" ? userName : "V"}
                  </div>

                  {/* Content */}
                  <div style={{
                    maxWidth: "84%",
                    background: msg.role === "user" ? "#0e0e10" : "transparent",
                    border: msg.role === "user" ? "1px solid #161618" : "none",
                    borderRadius: msg.role === "user" ? 14 : 0,
                    padding: msg.role === "user" ? "11px 15px" : "1px 0",
                  }}>
                    {msg.role === "user"
                      ? <div style={{ fontSize: 14, color: "#b8b8b8", lineHeight: 1.65 }}>{msg.text}</div>
                      : <Markdown text={msg.text} />
                    }
                  </div>
                </div>
              ))}

              {/* Streaming */}
              {streaming && (
                <div className="msg-in" style={{ marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                    background: "linear-gradient(135deg, #d4a843, #b8892a)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, color: "#000"
                  }}>V</div>
                  <div style={{ maxWidth: "84%" }}>
                    <Markdown text={streaming} />
                    <span style={{ display: "inline-block", width: 2, height: 13, background: "#d4a843", marginLeft: 2, verticalAlign: "middle", animation: "cursor 0.75s infinite" }} />
                  </div>
                </div>
              )}

              {/* Thinking */}
              {thinking && !streaming && (
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                    background: "linear-gradient(135deg, #d4a843, #b8892a)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, color: "#000"
                  }}>V</div>
                  <div style={{ display: "flex", gap: 5, padding: "6px 0" }}>
                    {[0, 0.2, 0.4].map((d, i) => (
                      <div key={i} style={{
                        width: 6, height: 6, borderRadius: "50%", background: "#d4a843",
                        animation: `blink 1.4s ${d}s infinite ease-in-out`
                      }} />
                    ))}
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{
                  background: "rgba(200,60,60,0.06)", border: "1px solid rgba(200,60,60,0.15)",
                  borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#c06060"
                }}>
                  {error}
                  <button onClick={() => setError(null)} style={{
                    marginLeft: 12, background: "transparent", border: "none",
                    color: "#804040", cursor: "pointer", fontSize: 12
                  }}>Dismiss</button>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div style={{ padding: "10px 14px 14px", background: "#060608", borderTop: "1px solid #0f0f0f", flexShrink: 0 }}>
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            <div style={{
              display: "flex", alignItems: "flex-end", gap: 0,
              background: "#0a0a0c", border: "1px solid #161618",
              borderRadius: 14, overflow: "hidden",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.015) inset"
            }}>
              <textarea
                ref={taRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={
                  mode === "answer" ? "Ask anything — I'll search the web if needed…"
                  : !coreType ? "Choose Student or Business above"
                  : coreType === "student" ? "Ask a doubt, share your subject or exam…"
                  : "Share numbers or ask for business analysis…"
                }
                rows={1}
                disabled={mode === "core" && !coreType}
                style={{
                  flex: 1, background: "transparent", border: "none",
                  color: "#d8d8d8", fontFamily: "inherit", fontSize: 14,
                  fontWeight: 300, padding: "14px 16px", resize: "none",
                  lineHeight: 1.6, minHeight: 50, maxHeight: 160, overflowY: "auto"
                }}
              />
              <div style={{ padding: "7px 8px 7px 4px", display: "flex", alignItems: "flex-end" }}>
                <button
                  onClick={() => send()}
                  disabled={thinking || !input.trim() || (mode === "core" && !coreType)}
                  className="send-btn"
                  style={{
                    width: 36, height: 36, border: "none",
                    background: input.trim() && !thinking ? "#d4a843" : "#111",
                    borderRadius: 10, cursor: input.trim() && !thinking ? "pointer" : "default",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, transition: "all 0.15s",
                    boxShadow: input.trim() && !thinking ? "0 2px 8px rgba(212,168,67,0.25)" : "none"
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke={input.trim() && !thinking ? "#000" : "#252525"}
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7, padding: "0 2px" }}>
              <div style={{ fontSize: 10, color: "#181818" }}>
                Vedanta AI · Claude + Groq + Web Search
              </div>
              <div style={{ fontSize: 10, color: "#181818" }}>
                {input.length > 0 ? `${input.length} chars · Enter to send` : "Shift+Enter for new line"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
