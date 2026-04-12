# 🚀 Agentic AI Career Coach

![AI](https://img.shields.io/badge/AI-Agentic-blue)
![Node.js](https://img.shields.io/badge/Backend-Node.js-green)
![Frontend](https://img.shields.io/badge/Frontend-JavaScript-yellow)
![Deployment](https://img.shields.io/badge/Deployed-Vercel%20%2B%20Render-black)
![Status](https://img.shields.io/badge/Status-Production-success)

---

## 🌟 Overview

An **Agentic AI-powered Career Coach** that goes beyond chatbots — it **acts autonomously**.

It analyzes resumes, detects skill gaps, generates personalized plans, and continuously monitors user progress using an **agent loop system**.

---

## 🎯 Key Features

- 📄 Resume Upload & PDF Parsing  
- 🧠 AI Skill Extraction (Ollama - Llama 3.2)  
- 📊 Gap Analysis & Readiness Score  
- 📅 Personalized Learning Plans  
- 🤖 Agent Loop (continuous monitoring)  
- 🎤 Mock Interview Evaluation  
- 📈 Progress Tracking  

---

## 🧠 What Makes It *Agentic AI*

Unlike traditional AI systems:

✅ Takes decisions  
✅ Has a goal (placement readiness)  
✅ Runs continuously (agent loop)  
✅ Triggers actions autonomously  

---

## 🏗️ Architecture
Frontend (Vercel)
↓
Backend (Render)
↓
ngrok Tunnel
↓
Local AI (Ollama - Llama 3.2)

---

## ⚙️ Tech Stack

| Layer       | Technology |
|------------|-----------|
| Frontend   | HTML, CSS, JavaScript |
| Backend    | Node.js, Express |
| AI Model   | Ollama (Llama 3.2) |
| Database   | Supabase |
| Hosting    | Vercel + Render |
| Bridge     | ngrok |

---

## 🔥 Live Demo

👉 https://career-coach-wine.vercel.app  

---

## 🧪 How It Works

1. Upload Resume  
2. AI extracts skills  
3. Gap analysis performed  
4. Plan generated  
5. Agent monitors progress  

---

## 🚀 Setup Instructions

### 1️⃣ Clone Repo

```bash
git clone https://github.com/vinitrj19/career-coach.git
cd career-coach
2️⃣ Install Backend
cd backend
npm install
npm run dev
3️⃣ Start Ollama
ollama serve
4️⃣ Start ngrok
ngrok http 11434
5️⃣ Set Environment Variables
OLLAMA_URL=https://your-ngrok-url
OLLAMA_MODEL=llama3.2:latest
6️⃣ Run Frontend
cd frontend
npx serve .
🧩 Challenges Solved
Connecting local AI → cloud (ngrok bridge)
PDF parsing in serverless environment
Session persistence issues
Real-time AI pipeline debugging
📌 Future Improvements
Multi-agent orchestration
Real company interview integration
Advanced analytics dashboard
Fine-tuned AI models
👨‍💻 Contributors
👤 Your Name

(Add teammates below 👇)

⭐ Support

If you like this project, give it a ⭐ on GitHub!

📬 Contact

Feel free to connect on LinkedIn 🚀


---

# 🧠 2. ADD TEAMMATES AS CONTRIBUTORS

---

## ✅ OPTION 1 (BEST)

Run:

```bash
git shortlog -s -n
## 👨‍💻 Contributors
