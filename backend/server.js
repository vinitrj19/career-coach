require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const { createSession, getSession, updateSession, logAgentAction, getAllSessions } = require('./agent/stateManager');
const { runAgentLoop, triggerProactiveCheck } = require('./agent/agentLoop');
const { parseResume, analyzeGaps, generatePlan, generateInterviewQuestions, evaluateAnswer } = require('./agent/ollamaHelpers');

const app = express();
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: '10mb' }));

// Load role requirements
const roleRequirements = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/role_requirements.json'), 'utf-8')
);


const supabase = require('./agent/supabaseClient');

// ─── SESSION INIT ────────────────────────────────────────────────
app.post('/session/create', (req, res) => {
  const { id, email, name } = req.body || {};
  if (!id) return res.status(400).json({ error: 'User ID required' });
  
  // Check if session already exists for this ID
  let session = getSession(id);
  if (!session) {
    session = createSession(id, email, name);
    // Real DB Integration (Phase 2): Push to Supabase if active
    supabase.syncStudent({ id, email, name });
  }
  
  res.json({ sessionId: id, message: 'Session accepted', roles: Object.keys(roleRequirements) });
});

app.get('/session/:sessionId', (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

// ─── RESUME ANALYSIS ────────────────────────────────────────────
app.post('/analyze-resume', async (req, res) => {
  const { sessionId, resumeText, role } = req.body;
  if (!sessionId || !resumeText || !role) {
    return res.status(400).json({ error: 'sessionId, resumeText, and role are required' });
  }
  if (!roleRequirements[role]) {
    return res.status(400).json({ error: `Unknown role. Choose from: ${Object.keys(roleRequirements).join(', ')}` });
  }

  try {
    console.log(`[AGENT] Analyzing resume for session ${sessionId}, role: ${role}`);
    const skills = await parseResume(resumeText);
    const gapAnalysis = await analyzeGaps(skills, roleRequirements, role);

    updateSession(sessionId, { role, resumeText, skills, gapAnalysis });

    // Agent action: log resume processed
    const agentLog = logAgentAction(sessionId, 'RESUME_ANALYZED', {
      strongSkills: (skills.strong || []).length,
      weakSkills: (skills.weak || []).length,
      gaps: (gapAnalysis.missing_core || []).length,
      readinessScore: gapAnalysis.readiness_score || 0
    });

    res.json({ skills, gapAnalysis, agentLog, roleRequirements: roleRequirements[role] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GENERATE PLAN ──────────────────────────────────────────────
app.post('/generate-plan', async (req, res) => {
  const { sessionId, userGoals } = req.body;
  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  try {
    console.log(`[AGENT] Generating plan for session ${sessionId} with goals:`, userGoals);
    const planData = await generatePlan(session.skills?.weak || [], session.gapAnalysis || {}, session.role, userGoals);

    // Add IDs and statuses to tasks
    const planTasks = Array.isArray(planData?.plan) ? planData.plan : [];
    const plan = planTasks.map((task, i) => ({
      ...task,
      id: `task_${i + 1}`,
      status: 'pending',
      createdAt: Date.now(),
      dueBy: Date.now() + ((task.day || i + 1) * 24 * 60 * 60 * 1000) // demo due dates
    }));

    updateSession(sessionId, { plan });

    const agentLog = logAgentAction(sessionId, 'PLAN_GENERATED', {
      totalTasks: plan.length,
      days: 3,
      focusAreas: (session.skills?.weak || []).slice(0, 3)
    });

    res.json({ plan, agentLog });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─── UPDATE PROGRESS ────────────────────────────────────────────
app.post('/update-progress', (req, res) => {
  const { sessionId, taskId, status } = req.body;
  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const updatedPlan = session.plan.map(task =>
    task.id === taskId ? { ...task, status, completedAt: status === 'completed' ? Date.now() : null } : task
  );

  updateSession(sessionId, { plan: updatedPlan });

  let agentLog = null;
  if (status === 'completed') {
    agentLog = logAgentAction(sessionId, 'TASK_COMPLETED', {
      taskId,
      task: session.plan.find(t => t.id === taskId)?.task,
      completedTasks: updatedPlan.filter(t => t.status === 'completed').length,
      totalTasks: updatedPlan.length
    });
  } else if (status === 'missed') {
    agentLog = logAgentAction(sessionId, 'TASK_MISSED_MANUAL', {
      taskId,
      task: session.plan.find(t => t.id === taskId)?.task,
      message: 'Task marked missed → Agent adjusting priority'
    });
  }

  res.json({ plan: updatedPlan, agentLog });
});

// ─── AGENT TRIGGER ──────────────────────────────────────────────
app.post('/agent-trigger', async (req, res) => {
  const { sessionId } = req.body;
  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  try {
    console.log(`[AGENT] Running agent loop for session ${sessionId}`);
    const loopResult = await runAgentLoop(sessionId, null, roleRequirements);
    const proactiveResult = await triggerProactiveCheck(sessionId);

    res.json({
      agentLoop: loopResult,
      proactiveCheck: proactiveResult,
      triggered: true,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─── START QUIZ (Replaces Mock Interview) ────────────────────────
app.post('/mock-interview', async (req, res) => {
  const { sessionId } = req.body;
  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  try {
    // Load local question bank
    const qs = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/questions.json'), 'utf-8'));
    
    // Pick 3 random questions from DSA (We will make this dynamic later based on role)
    const available = qs["DSA"] || [];
    const selected = available.sort(() => 0.5 - Math.random()).slice(0, 3);
    
    // strip out answers so frontend can't cheat
    const safeQuestions = selected.map(q => ({
      id: q.id,
      topic: 'DSA',
      difficulty: 'medium',
      question: q.question,
      options: q.options
    }));

    const interviewState = {
      active: true,
      questions: selected, // keep full in backend state to verify later
      safeQuestions: safeQuestions, // send this to frontend
      currentIndex: 0,
      answers: [],
      scores: [],
      completed: false
    };

    updateSession(sessionId, { interviewState });

    const agentLog = logAgentAction(sessionId, 'QUIZ_STARTED', { 
      message: 'Agent assigned a 3-question MCQ quiz.' 
    });

    res.json({
      question: safeQuestions[0],
      totalQuestions: safeQuestions.length,
      agentLog
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─── SUBMIT ANSWER (Replaces Evaluate Answer) ───────────────────
app.post('/evaluate-answer', async (req, res) => {
  const { sessionId, answer } = req.body;
  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { interviewState } = session;
  if (!interviewState.active) return res.status(400).json({ error: 'No active quiz' });

  const currentQ = interviewState.questions[interviewState.currentIndex];
  
  try {
    const isCorrect = answer === currentQ.correct_answer;
    const scoreVal = isCorrect ? 10 : 0;
    
    // Evaluation format expected by frontend
    const evaluation = {
      score: scoreVal / 10,  // old system expected 0-1 scale visually
      feedback: isCorrect ? `Correct! ${currentQ.explanation}` : `Incorrect. The correct answer was ${currentQ.correct_answer}. ${currentQ.explanation}`,
      axes: {
        accuracy: isCorrect ? 10 : 0
      }
    };

    const updatedAnswers = [...interviewState.answers, { question: currentQ.question, answer }];
    const updatedScores = [...interviewState.scores, { ...evaluation, questionIndex: interviewState.currentIndex }];
    const nextIndex = interviewState.currentIndex + 1;
    const completed = nextIndex >= interviewState.questions.length;

    const newInterviewState = {
      ...interviewState,
      answers: updatedAnswers,
      scores: updatedScores,
      currentIndex: nextIndex,
      completed
    };

    updateSession(sessionId, { interviewState: newInterviewState });

    // Real DB Integration: Log precise attempt deterministically
    supabase.logQuizAttempt({
      student_id: sessionId,
      question_id: currentQ.id,
      selected_answer: answer,
      is_correct: isCorrect
    });

    // Update the total score
    if (completed) {
      session.mockTotalScore = (session.mockTotalScore || 0) + updatedScores.reduce((sum, s) => sum + (s.axes.accuracy), 0);
      updateSession(sessionId, { mockTotalScore: session.mockTotalScore });
      
      // Real DB Integration (Phase 2): Update robust score tracking
      supabase.syncScore({
        student_id: sessionId,
        skill: currentQ.topic || 'DSA',
        score: session.mockTotalScore
      });
    }

    let nextQuestion = null;
    if (!completed) {
      nextQuestion = interviewState.safeQuestions[nextIndex];
    }

    res.json({
      evaluation,
      nextQuestion,
      completed,
      questionNumber: interviewState.currentIndex + 1,
      totalQuestions: interviewState.questions.length,
      allScores: completed ? updatedScores : null
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─── AGENT LOGS ─────────────────────────────────────────────────
app.get('/agent-logs/:sessionId', (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({ logs: session.agentLogs, triggered: session.agentTriggered });
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', roles: Object.keys(roleRequirements) }));

// ─── AI PIPELINE TEST (deployment verification) ─────────────────
app.get('/test-ai', async (req, res) => {
  const start = Date.now();
  try {
    const result = await parseResume('John Doe. Skills: Python, React, Node.js. Built a web app.');
    const elapsed = Date.now() - start;
    res.json({ 
      status: 'ok', 
      layer: 'Backend → ngrok → Ollama → Response',
      elapsed_ms: elapsed,
      ai_response: result 
    });
  } catch (err) {
    const elapsed = Date.now() - start;
    res.status(500).json({ 
      status: 'fail', 
      error: err.message, 
      elapsed_ms: elapsed,
      layer_failed: err.message.includes('abort') ? 'ngrok_timeout' : 'ollama_or_network'
    });
  }
});

// ─── ADVANCED API: LEADERBOARD ──────────────────────────────────
app.get('/leaderboard', (req, res) => {
  const sessions = getAllSessions().filter(s => s.role); // Only consider people who started
  
  const leaderboard = sessions.map(s => {
    // calculate a dynamic score combining tasks and mock scores
    let totalScore = s.mockTotalScore || 0; 
    let completedTasks = 0;
    
    if (!s.mockTotalScore) {
      if (s.interviewState && s.interviewState.scores.length > 0) {
        totalScore += s.interviewState.scores.reduce((sum, scr) => sum + scr.score, 0) * 10;
      }
      completedTasks = s.plan.filter(t => t.status === 'completed').length;
      totalScore += completedTasks * 5;
    } else {
      completedTasks = s.plan.filter(t => t.status === 'completed').length;
    }
    
    return {
      id: s.id,
      name: s.name,
      role: s.role,
      score: totalScore,
      tasks_completed: completedTasks,
      trend: s.trend || (Math.random() > 0.5 ? `+${Math.floor(Math.random()*15)+5}` : `-${Math.floor(Math.random()*5)+1}`)
    };
  });
  
  leaderboard.sort((a,b) => b.score - a.score);
  res.json({ leaderboard });
});

// ─── ADVANCED API: ADMIN ─────────────────────────────────────────
app.get('/admin/analytics', (req, res) => {
  const sessions = getAllSessions().filter(s => s.role);
  
  let totalStudents = sessions.length;
  let allWeakSkills = {};
  let atRisk = [];
  
  sessions.forEach(s => {
    // tally weak skills
    if (s.gapAnalysis && s.gapAnalysis.missing_core) {
      s.gapAnalysis.missing_core.forEach(skill => {
        allWeakSkills[skill] = (allWeakSkills[skill] || 0) + 1;
      });
    }
    // calculate at risk
    let missed = s.plan.filter(t => t.status === 'missed').length;
    if (missed > 0 || (s.plan.length > 0 && s.plan.filter(t=>t.status === 'completed').length === 0)) {
      atRisk.push({ name: s.name, role: s.role, missed_tasks: missed });
    }
  });
  
  // get top 3 weakest
  const sortedWeak = Object.keys(allWeakSkills)
    .map(skill => ({ skill, count: allWeakSkills[skill] }))
    .sort((a,b) => b.count - a.count)
    .slice(0,3);

  // most improved
  const improved = sessions.filter(s => s.trend && s.trend.startsWith('+')).sort((a,b) => parseInt(b.trend) - parseInt(a.trend))[0];

  res.json({
    total_students: totalStudents,
    weakest_skills: sortedWeak,
    at_risk: atRisk,
    most_improved: improved ? { name: improved.name, trend: improved.trend } : null
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 Career Coach Backend running on port ${PORT}`);
  console.log(`📋 Available roles: ${Object.keys(roleRequirements).join(', ')}`);
  console.log(`🤖 Agent system: ACTIVE\n`);
});
