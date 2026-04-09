const Anthropic = require('@anthropic-ai/sdk');

let client = null;

function getClient() {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

async function callClaude(prompt, systemPrompt = null) {
  try {
    const messages = [{ role: 'user', content: prompt }];
    const params = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages
    };
    if (systemPrompt) params.system = systemPrompt;

    const response = await getClient().messages.create(params);
    return response.content[0].text;
  } catch (err) {
    console.error('Claude API error:', err.message);
    throw err;
  }
}

async function parseResume(resumeText) {
  const prompt = `Extract skills from this resume and categorize them into strong, moderate, and weak based on how prominently they appear and years of experience mentioned.

Resume:
${resumeText}

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{
  "strong": ["skill1", "skill2"],
  "moderate": ["skill3", "skill4"],
  "weak": ["skill5", "skill6"],
  "summary": "One sentence professional summary"
}`;

  const raw = await callClaude(prompt, 'You are a technical recruiter who extracts and categorizes skills from resumes. Always respond with valid JSON only.');
  const cleaned = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

async function analyzeGaps(skills, roleRequirements, role) {
  const req = roleRequirements[role];
  const allUserSkills = [...skills.strong, ...skills.moderate, ...skills.weak].map(s => s.toLowerCase());

  const prompt = `Compare these candidate skills against the role requirements and identify gaps.

Candidate Skills:
- Strong: ${skills.strong.join(', ')}
- Moderate: ${skills.moderate.join(', ')}
- Weak: ${skills.weak.join(', ')}

Role: ${role}
Core Skills Required: ${req.core_skills.join(', ')}
Secondary Skills Required: ${req.secondary_skills.join(', ')}
Tools Required: ${req.tools.join(', ')}

Respond ONLY with valid JSON (no markdown):
{
  "missing_core": ["skill1"],
  "missing_secondary": ["skill2"],
  "missing_tools": ["tool1"],
  "readiness_score": 65,
  "summary": "Brief gap analysis summary"
}`;

  const raw = await callClaude(prompt, 'You are a career coach analyzing skill gaps. Respond with valid JSON only.');
  const cleaned = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

async function generatePlan(weakSkills, gapAnalysis, role) {
  const allWeakAreas = [
    ...weakSkills,
    ...gapAnalysis.missing_core,
    ...gapAnalysis.missing_secondary
  ].slice(0, 6);

  const prompt = `Generate a focused 3-day preparation plan for a ${role} interview.

Weak areas to address: ${allWeakAreas.join(', ')}

Create practical, time-boxed tasks. Respond ONLY with valid JSON (no markdown):
{
  "plan": [
    {"day": 1, "task": "Task description", "topic": "Topic name", "duration": "2 hours", "resources": "Resource suggestion", "priority": "high"},
    {"day": 1, "task": "Task description", "topic": "Topic name", "duration": "1 hour", "resources": "Resource suggestion", "priority": "medium"},
    {"day": 2, "task": "Task description", "topic": "Topic name", "duration": "2 hours", "resources": "Resource suggestion", "priority": "high"},
    {"day": 2, "task": "Task description", "topic": "Topic name", "duration": "1 hour", "resources": "Resource suggestion", "priority": "medium"},
    {"day": 3, "task": "Task description", "topic": "Topic name", "duration": "2 hours", "resources": "Resource suggestion", "priority": "high"},
    {"day": 3, "task": "Mock interview practice", "topic": "Interview prep", "duration": "1 hour", "resources": "Use the built-in mock interview", "priority": "high"}
  ]
}`;

  const raw = await callClaude(prompt, 'You are a career coach creating study plans. Respond with valid JSON only.');
  const cleaned = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

async function generateInterviewQuestions(role, weakSkills, roleRequirements) {
  const req = roleRequirements[role];
  const prompt = `Generate exactly 3 technical interview questions for a ${role} position.
Focus especially on these weak areas: ${weakSkills.join(', ')}
Also cover: ${req.interview_focus.join(', ')}

Respond ONLY with valid JSON (no markdown):
{
  "questions": [
    {"id": 1, "question": "Question text here?", "topic": "Topic", "difficulty": "medium"},
    {"id": 2, "question": "Question text here?", "topic": "Topic", "difficulty": "hard"},
    {"id": 3, "question": "Question text here?", "topic": "Topic", "difficulty": "medium"}
  ]
}`;

  const raw = await callClaude(prompt, 'You are a senior technical interviewer. Respond with valid JSON only.');
  const cleaned = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

async function evaluateAnswer(question, answer, role) {
  const prompt = `Evaluate this interview answer for a ${role} position.

Question: ${question}
Answer: ${answer}

Score the answer from 1-10 and provide constructive feedback.
Respond ONLY with valid JSON (no markdown):
{
  "score": 7,
  "feedback": "Detailed feedback here",
  "strengths": ["What they did well"],
  "improvements": ["What to improve"],
  "ideal_answer_hint": "Brief hint about ideal answer"
}`;

  const raw = await callClaude(prompt, 'You are a technical interviewer evaluating answers. Respond with valid JSON only.');
  const cleaned = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

module.exports = { parseResume, analyzeGaps, generatePlan, generateInterviewQuestions, evaluateAnswer };
