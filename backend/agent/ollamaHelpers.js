// ─────────────────────────────────────────────────────────────────
// AI Layer — Ollama (local or via ngrok) with OpenAI fallback
// OLLAMA_URL = base URL (e.g. http://localhost:11434 or https://xxx.ngrok-free.app)
// The /api/generate path is appended automatically.
// If Ollama is unreachable (ngrok down), falls back to OpenAI.
// ─────────────────────────────────────────────────────────────────

const OLLAMA_BASE = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_GENERATE_URL = `${OLLAMA_BASE.replace(/\/+$/, '')}/api/generate`;
const MODEL_NAME = process.env.OLLAMA_MODEL || 'llama3.2:latest';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || null;

console.log(`[AI ENGINE] Ollama endpoint: ${OLLAMA_GENERATE_URL}`);
if (OPENAI_API_KEY) console.log('[AI ENGINE] OpenAI fallback: ENABLED');

// ─── OPENAI FALLBACK ────────────────────────────────────────────
async function callOpenAI(prompt, temperature = 0.3) {
  if (!OPENAI_API_KEY) throw new Error('No OpenAI key configured for fallback');
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature,
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) throw new Error(`OpenAI error: ${response.status}`);
  const data = await response.json();
  return JSON.parse(data.choices[0].message.content.trim());
}

// ─── CORE API CALL (with timeout + fallback) ────────────────────
async function callOllama(prompt, systemPrompt = null, temperature = 0.3) {
  // Combine system prompt into the main prompt
  const fullPrompt = systemPrompt 
    ? `${systemPrompt}\n\n${prompt}` 
    : prompt;

  // Try Ollama first (with 30s timeout for ngrok latency)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(OLLAMA_GENERATE_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        'User-Agent': 'CareerCoachBackend/1.0'
      },
      body: JSON.stringify({
        model: "llama3.2:latest",
        prompt: fullPrompt,
        stream: false,
        format: "json"
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.response.trim();
    return JSON.parse(content);
  } catch (err) {
    console.error('[OLLAMA ERROR]', err.message);

    // Fallback to OpenAI if available
    if (OPENAI_API_KEY) {
      console.log('[AI ENGINE] Falling back to OpenAI...');
      return await callOpenAI(fullPrompt, temperature);
    }

    throw err;
  }
}

// ─── 1. RESUME PARSING ──────────────────────────────────────────
async function parseResume(resumeText) {
  const systemPrompt = `You extract skills from resumes. Output JSON only.`;

  const prompt = `Read this resume and list the technical skills you find.
Put each skill into one category:
- "strong": skills used in major projects or with 2+ years experience
- "moderate": skills mentioned but not the main focus
- "weak": skills barely mentioned or very basic

Resume:
"""
${resumeText}
"""

Example output:
{
  "strong": ["Python", "React"],
  "moderate": ["SQL", "Docker"],
  "weak": ["AWS"]
}

Now output the JSON for this resume:`;

  const result = await callOllama(prompt, systemPrompt, 0.1);

  // Defensive: ensure all three arrays exist
  return {
    strong: Array.isArray(result.strong) ? result.strong : [],
    moderate: Array.isArray(result.moderate) ? result.moderate : [],
    weak: Array.isArray(result.weak) ? result.weak : []
  };
}

// ─── 2. GAP ANALYSIS ────────────────────────────────────────────
// CRITICAL: Readiness score is computed in JavaScript, NOT by the AI.
// The 3B model cannot do math reliably.
async function analyzeGaps(skills, roleRequirements, role) {
  const req = roleRequirements[role];
  if (!req) {
    return {
      missing_core: [],
      missing_secondary: [],
      missing_tools: [],
      readiness_score: 0,
      summary: 'Unknown role.'
    };
  }

  // ── JavaScript-computed gap detection ──
  // Normalize all user skills to lowercase
  const allUserSkills = [
    ...(skills.strong || []),
    ...(skills.moderate || []),
    ...(skills.weak || [])
  ].map(s => s.toLowerCase().trim());

  // Skill aliases: maps common resume terms → required skill names
  const SKILL_ALIASES = {
    // SQL variants
    'mysql': 'sql', 'postgresql': 'sql', 'postgres': 'sql', 'sqlite': 'sql',
    'mssql': 'sql', 'pl/sql': 'sql', 'nosql': 'sql', 'mongodb': 'sql',
    // Linux variants
    'unix': 'linux', 'ubuntu': 'linux', 'centos': 'linux', 'bash': 'linux',
    'shell scripting': 'linux', 'shell': 'linux',
    // React variants
    'react.js': 'react', 'reactjs': 'react', 'react native': 'react',
    // Node variants
    'node.js': 'node.js', 'nodejs': 'node.js', 'express': 'node.js', 'express.js': 'node.js',
    // JS variants
    'js': 'javascript', 'es6': 'javascript', 'es2015': 'javascript', 'typescript': 'javascript',
    // OOP variants
    'object oriented programming': 'oop', 'object-oriented': 'oop',
    'java': 'oop', 'c++': 'oop', 'c#': 'oop', 'python': 'oop',
    // DSA variants
    'data structures': 'dsa', 'algorithms': 'dsa', 'data structures and algorithms': 'dsa',
    'leetcode': 'dsa', 'competitive programming': 'dsa',
    // Git variants
    'github': 'git', 'gitlab': 'git', 'version control': 'git', 'bitbucket': 'git',
    // Docker variants
    'containerization': 'docker', 'containers': 'docker',
    // REST API variants
    'rest': 'rest apis', 'restful': 'rest apis', 'api': 'rest apis', 'apis': 'rest apis',
    'rest api': 'rest apis', 'web services': 'rest apis',
    // Testing variants
    'unit testing': 'testing', 'jest': 'testing', 'mocha': 'testing',
    'selenium': 'testing', 'pytest': 'testing', 'junit': 'testing', 'tdd': 'testing',
    // CSS variants
    'tailwind': 'css', 'sass': 'css', 'scss': 'css', 'bootstrap': 'css',
    'styled-components': 'css', 'tailwindcss': 'css',
    // Python / ML variants
    'numpy': 'python', 'pandas': 'python', 'scipy': 'python',
    'scikit-learn': 'machine learning', 'sklearn': 'machine learning', 'ml': 'machine learning',
    'tensorflow': 'machine learning', 'pytorch': 'machine learning', 'keras': 'machine learning',
    // System Design
    'system architecture': 'system design', 'hld': 'system design', 'lld': 'system design',
    'microservices': 'system design', 'distributed systems': 'system design',
    // CI/CD
    'jenkins': 'ci/cd', 'github actions': 'ci/cd', 'circleci': 'ci/cd',
    'travis': 'ci/cd', 'continuous integration': 'ci/cd',
    // Data Analysis / Visualization
    'excel': 'data analysis', 'tableau': 'data visualization', 'matplotlib': 'data visualization',
    'power bi': 'data visualization', 'seaborn': 'data visualization',
    // Stats
    'probability': 'statistics', 'statistical analysis': 'statistics', 'r': 'statistics',
  };

  // Build expanded user skill set including aliases
  const expandedUserSkills = new Set(allUserSkills);
  for (const userSkill of allUserSkills) {
    // Add the alias target if the user's skill maps to one
    if (SKILL_ALIASES[userSkill]) {
      expandedUserSkills.add(SKILL_ALIASES[userSkill]);
    }
  }

  // Fuzzy match: does the user "have" the required skill?
  function userHasSkill(requiredSkill) {
    const req = requiredSkill.toLowerCase().trim();

    // 1. Direct match
    if (expandedUserSkills.has(req)) return true;

    // 2. Substring match: user has "mysql" and required is "sql"
    for (const userSkill of expandedUserSkills) {
      if (userSkill.includes(req) || req.includes(userSkill)) return true;
    }

    // 3. Check if ANY user skill maps to this required skill via aliases
    for (const userSkill of allUserSkills) {
      const alias = SKILL_ALIASES[userSkill];
      if (alias && alias === req) return true;
    }

    return false;
  }

  const missing_core = (req.core_skills || []).filter(s => !userHasSkill(s));
  const missing_secondary = (req.secondary_skills || []).filter(s => !userHasSkill(s));
  const missing_tools = (req.tools || []).filter(s => !userHasSkill(s));

  // ── JavaScript-computed readiness score ──
  const totalRequired = (req.core_skills || []).length
    + (req.secondary_skills || []).length
    + (req.tools || []).length;
  const totalMissing = missing_core.length + missing_secondary.length + missing_tools.length;
  const present = totalRequired - totalMissing;
  const readiness_score = totalRequired > 0
    ? Math.round((present / totalRequired) * 100)
    : 0;

  // ── Ask AI only for the summary text ──
  const systemPrompt = `You are a career coach. Write a short 2-sentence summary about this candidate. Be direct and constructive. Output JSON only.`;

  const prompt = `Role: ${role}
Skills they have: ${allUserSkills.join(', ')}
Skills they are MISSING: ${[...missing_core, ...missing_secondary, ...missing_tools].join(', ')}
Readiness: ${readiness_score}%

Example output:
{"summary": "You have solid web development skills but lack core DSA knowledge required for SDE roles. Focus on algorithms and system design to become interview-ready."}

Now write the summary JSON:`;

  let summaryText = '';
  try {
    const aiResult = await callOllama(prompt, systemPrompt, 0.3);
    summaryText = aiResult.summary || aiResult.text || aiResult.feedback || '';
  } catch (e) {
    summaryText = `You are missing ${missing_core.length} core skill(s) for the ${role} role. Focus on: ${missing_core.join(', ')}.`;
  }

  return {
    missing_core,
    missing_secondary,
    missing_tools,
    readiness_score,
    summary: summaryText
  };
}

// ─── 3. TASK GENERATION (Interactive Quizzes) ────────────────────
async function generatePlan(weakSkills, gapAnalysis, role, userGoals = {}) {
  // Safely gather all target skills
  const targetSkills = [
    ...(weakSkills || []),
    ...(gapAnalysis?.missing_core || []),
    ...(gapAnalysis?.missing_secondary || [])
  ].slice(0, 6);

  const systemPrompt = `You create coding challenges and quizzes. Output JSON only.`;

  const urgencyText = userGoals.days ? `The candidate has ${userGoals.days} days until placement season. Adjust intensity.` : '';
  const confidenceText = userGoals.dsa ? `Their DSA confidence is ${userGoals.dsa}/10 and project experience is ${userGoals.proj}/10.` : '';

  const prompt = `Create exactly 3 practice tasks for a ${role} candidate.
Skills to practice: ${targetSkills.join(', ')}
Context: ${urgencyText} ${confidenceText}

RULES:
- Each task MUST be a quiz question, coding challenge, or hands-on exercise
- Do NOT say "read about" or "study". Make it interactive.
- Each task must have: day, task, duration, priority, topic

Example output:
{
  "plan": [
    {
      "day": 1,
      "task": "CODING CHALLENGE: Write a function that reverses a linked list. Test it with [1,2,3,4,5].",
      "duration": "45 mins",
      "priority": "high",
      "topic": "DSA"
    },
    {
      "day": 2,
      "task": "QUIZ: You have a REST API that returns 500 errors under load. List 3 possible causes and how you would debug each one.",
      "duration": "30 mins",
      "priority": "high",
      "topic": "System Design"
    },
    {
      "day": 3,
      "task": "EXERCISE: Design the database schema for a Twitter-like app. Include tables, relationships, and indexes.",
      "duration": "1 hour",
      "priority": "medium",
      "topic": "Databases"
    }
  ]
}

Now create 3 tasks targeting: ${targetSkills.join(', ')}
Output the JSON:`;

  let result;
  try {
    result = await callOllama(prompt, systemPrompt, 0.4);
  } catch (e) {
    console.error('[PLAN ERROR]', e.message);
    // Hardcoded fallback so the app never crashes
    return { plan: targetSkills.slice(0, 3).map((skill, i) => ({
      day: i + 1,
      task: `EXERCISE: Practice ${skill} by solving 2 problems on this topic.`,
      duration: '1 hour',
      priority: 'high',
      topic: skill
    }))};
  }

  // Normalize response shape — llama3.2 sometimes returns arrays or wrong keys
  if (Array.isArray(result)) {
    result = { plan: result };
  } else if (!result.plan && result.tasks) {
    result = { plan: result.tasks };
  } else if (!result.plan) {
    result = { plan: [] };
  }

  // Ensure each task has required fields
  result.plan = result.plan.map((t, i) => ({
    day: t.day || i + 1,
    task: t.task || t.description || t.title || `Practice ${targetSkills[i] || 'skills'}`,
    duration: t.duration || '1 hour',
    priority: t.priority || 'high',
    topic: t.topic || t.subject || targetSkills[i] || 'General'
  }));

  return result;
}

// ─── 4. INTERVIEW QUESTION GENERATION ────────────────────────────
async function generateInterviewQuestions(role, weakSkills, roleRequirements) {
  const focusAreas = roleRequirements[role]?.interview_focus || [];
  const topics = [...(weakSkills || []), ...focusAreas].slice(0, 5);

  const systemPrompt = `You are a technical interviewer. Output JSON only.`;

  const prompt = `Generate exactly 3 interview questions for a ${role} position.
Focus on these weak areas: ${topics.join(', ')}

RULES:
- Questions must be SCENARIO-BASED or DEBUGGING problems, not textbook definitions
- Start each question with "Scenario:", "Debug:", or "Design:"

Example output:
{
  "questions": [
    {
      "id": 1,
      "question": "Scenario: Your team's API response time jumped from 200ms to 3 seconds after a deployment. Walk me through your debugging process step by step.",
      "topic": "System Design",
      "difficulty": "hard"
    },
    {
      "id": 2,
      "question": "Design: You need to build a notification system that sends 1 million emails per day. What architecture would you use and why?",
      "topic": "Architecture",
      "difficulty": "hard"
    },
    {
      "id": 3,
      "question": "Debug: A SQL query that worked fine with 1000 rows now takes 30 seconds with 1 million rows. How do you optimize it?",
      "topic": "Databases",
      "difficulty": "medium"
    }
  ]
}

Now generate 3 questions for ${role} targeting: ${topics.join(', ')}
Output the JSON:`;

  let result;
  try {
    result = await callOllama(prompt, systemPrompt, 0.5);
  } catch (e) {
    console.error('[INTERVIEW ERROR]', e.message);
    // Hardcoded fallback
    return { questions: topics.slice(0, 3).map((t, i) => ({
      id: i + 1,
      question: `Scenario: Explain how you would apply ${t} in a real-world production system. Give a concrete example.`,
      topic: t,
      difficulty: 'medium'
    }))};
  }

  // Normalize
  if (Array.isArray(result)) {
    result = { questions: result };
  } else if (!result.questions) {
    result = { questions: [] };
  }

  // Ensure each question has required fields
  result.questions = result.questions.map((q, i) => ({
    id: q.id || i + 1,
    question: q.question || q.text || `Explain how ${topics[i] || 'this concept'} works in production.`,
    topic: q.topic || q.subject || topics[i] || 'General',
    difficulty: q.difficulty || 'medium'
  }));

  // Ensure at least 1 question
  if (result.questions.length === 0) {
    result.questions = topics.slice(0, 3).map((t, i) => ({
      id: i + 1,
      question: `Scenario: How would you apply ${t} to solve a real production problem?`,
      topic: t,
      difficulty: 'medium'
    }));
  }

  return result;
}

// ─── 5. ANSWER EVALUATION (3-AXIS RUBRIC) ────────────────────────
async function evaluateAnswer(question, answer, role) {
  const systemPrompt = `You grade interview answers on 3 axes. Output JSON only.`;

  const prompt = `Grade this interview answer for a ${role} position.

Question: "${question}"
Answer: "${answer}"

Score on these 3 axes (each 1-10):
1. relevance: Does the answer actually address the question asked?
2. depth: Are there specific examples, edge cases, or technical details?
3. communication: Is the answer clear, structured, and well-explained?

Example output:
{
  "relevance": 8,
  "depth": 5,
  "communication": 7,
  "feedback": "Good understanding of the concept but lacked specific code examples.",
  "strengths": ["Addressed the core question", "Clear structure"],
  "improvements": ["Add a concrete code example", "Discuss edge cases"],
  "ideal_answer_hint": "Mention connection pooling and thread safety."
}

Now grade the answer. Output the JSON:`;

  let result;
  try {
    result = await callOllama(prompt, systemPrompt, 0.3);
  } catch (e) {
    console.error('[EVAL ERROR]', e.message);
    return {
      score: 5,
      relevance: 5, depth: 5, communication: 5,
      feedback: 'Could not evaluate answer. Please try again.',
      strengths: ['Answer was provided'],
      improvements: ['Try to be more specific'],
      ideal_answer_hint: 'Provide concrete examples and discuss trade-offs.'
    };
  }

  // Normalize axes
  const relevance = typeof result.relevance === 'number' ? Math.min(10, Math.max(1, result.relevance)) : 5;
  const depth = typeof result.depth === 'number' ? Math.min(10, Math.max(1, result.depth)) : 5;
  const communication = typeof result.communication === 'number' ? Math.min(10, Math.max(1, result.communication)) : 5;
  const score = Math.round((relevance + depth + communication) / 3 * 10) / 10;

  return {
    score,
    relevance,
    depth,
    communication,
    feedback: result.feedback || result.text || 'No detailed feedback available.',
    strengths: Array.isArray(result.strengths) ? result.strengths : ['Answer was provided'],
    improvements: Array.isArray(result.improvements) ? result.improvements : ['Be more specific'],
    ideal_answer_hint: result.ideal_answer_hint || result.hint || ''
  };
}

module.exports = { parseResume, analyzeGaps, generatePlan, generateInterviewQuestions, evaluateAnswer };
