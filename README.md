# 🚀 Agentic AI Career Coach

An autonomous AI Career Coach that analyzes student profiles, detects skill gaps, assigns quizzes, and provides real-time coaching — powered by a local LLM (Ollama) with cloud accessibility.

---

## 🏗️ System Architecture

```
User (Internet)
     ↓
Frontend (Cloud — Static Hosting / Vercel / GCP)
     ↓
Backend API (Cloud — Google Cloud Run / Railway)
     ↓
ngrok Secure Tunnel (HTTPS)
     ↓
Your MacBook (Ollama on port 11434)
     ↓
AI Response → back up the chain → User
```

**Key Design**: The LLM (Ollama) runs locally on your laptop for zero API cost and full data privacy. ngrok bridges your local machine to the cloud-deployed backend.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML, Vanilla CSS (Glassmorphism), ES6 JavaScript |
| PDF Parsing | PDF.js (Mozilla) |
| Backend | Node.js + Express.js |
| Auth | Supabase Auth (Google/Apple OAuth) |
| Database | Supabase (PostgreSQL) |
| AI Engine | Ollama + Llama 3.2 (3B) — local |
| AI Fallback | OpenAI GPT-3.5 (optional) |
| Tunnel | ngrok |

---

## 🚀 Deployment Guide

### Option A: Full Local Development

```bash
# 1. Start AI engine
ollama serve

# 2. Start backend
cd backend
npm install
npm run dev

# 3. Open frontend
open frontend/index.html
```

### Option B: Cloud Deployment (For Demos)

#### Step 1: Start Ollama locally
```bash
ollama serve
```

#### Step 2: Tunnel Ollama via ngrok
```bash
ngrok http 11434
```
Copy the HTTPS forwarding URL (e.g. `https://abc-123.ngrok-free.app`)

#### Step 3: Configure backend `.env`
```env
OLLAMA_URL=https://abc-123.ngrok-free.app
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-key

# Optional: safety net if ngrok drops
OPENAI_API_KEY=sk-your-key
```

#### Step 4: Deploy backend to cloud
Deploy the `backend/` folder to Google Cloud Run, Railway, or Render.
Set the environment variables from Step 3.

#### Step 5: Deploy frontend
Deploy the `frontend/` folder to Vercel, Netlify, or GCP static hosting.
Update `CLOUD_BACKEND_URL` in `index.html` to your deployed backend URL.

#### Step 6: Update Supabase Auth
In **Supabase Dashboard → Authentication → URL Configuration**:
- Set **Site URL** to your deployed frontend URL
- Add your frontend URL to **Redirect URLs**

#### Step 7: Share the link! 🎉
Judges can now open the public URL and use the full AI system.

---

## 🔐 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_KEY` | Yes | Supabase anon/publishable key |
| `OLLAMA_URL` | Yes | Base URL for Ollama (`http://localhost:11434` or ngrok URL) |
| `OLLAMA_MODEL` | No | Model name (default: `llama3.2:latest`) |
| `OPENAI_API_KEY` | No | Fallback if Ollama is unreachable |

---

## ⚠️ Important Notes

- **Frontend NEVER talks to Ollama directly.** All AI requests flow: Frontend → Backend → ngrok → Ollama
- **ngrok tunnels port 11434** (Ollama), NOT port 3001 (backend)
- The backend is deployed to cloud and is publicly accessible
- If ngrok drops during a demo, the OpenAI fallback kicks in automatically
