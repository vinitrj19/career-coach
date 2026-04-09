// In-memory state store for all user sessions
const sessions = new Map();

function createSession(sessionId, email = null, name = null) {
  const session = {
    id: sessionId,
    email: email,
    name: name || 'Anonymous Student',
    createdAt: Date.now(),
    role: null,
    resumeText: null,
    skills: { strong: [], moderate: [], weak: [] },
    gapAnalysis: { missing_core: [], missing_secondary: [], missing_tools: [], readiness_score: 0, summary: '' },
    plan: [],
    agentLogs: [],
    interviewState: {
      active: false,
      questions: [],
      currentIndex: 0,
      answers: [],
      scores: [],
      completed: false
    },
    agentTriggered: false,
    lastActivity: Date.now()
  };
  sessions.set(sessionId, session);
  return session;
}

function getSession(sessionId) {
  return sessions.get(sessionId);
}

function updateSession(sessionId, updates) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  const updated = { ...session, ...updates, lastActivity: Date.now() };
  sessions.set(sessionId, updated);
  return updated;
}

function logAgentAction(sessionId, action, details) {
  const session = sessions.get(sessionId);
  if (!session) return;
  const log = {
    timestamp: new Date().toISOString(),
    action,
    details,
    type: 'AGENT_ACTION'
  };
  session.agentLogs.push(log);
  session.agentTriggered = true;
  sessions.set(sessionId, session);
  return log;
}

function checkMissedTasks(sessionId) {
  const session = sessions.get(sessionId);
  if (!session || !session.plan.length) return null;

  const missed = session.plan.filter(t => t.status === 'pending' && t.dueBy && Date.now() > t.dueBy);
  if (missed.length > 0) {
    const log = logAgentAction(sessionId, 'MISSED_TASK_DETECTED', {
      missedTasks: missed.map(t => t.task),
      message: `${missed.length} task(s) overdue. Adjusting plan and sending alert.`
    });

    // Auto-adjust: reschedule missed tasks
    session.plan = session.plan.map(task => {
      if (missed.find(m => m.id === task.id)) {
        return { ...task, status: 'missed', rescheduled: true, originalDay: task.day };
      }
      return task;
    });
    sessions.set(sessionId, session);
    return { triggered: true, log, missedCount: missed.length };
  }
  return { triggered: false };
}
function getAllSessions() {
  return Array.from(sessions.values());
}

// ─── MOCK DATA SEEDER ──────────────────────────────────────────
function seedMockData() {
  if (sessions.has('mock1')) return; // already seeded

  const mocks = [
    { id: 'mock1', name: 'Rahul', email: 'rahul@student.com', role: 'FAANG SDE', score: 120, trend: '+15', comp: 6, weak: ['Dynamic Programming', 'Graphs'] },
    { id: 'mock2', name: 'Priya', email: 'priya@student.com', role: 'Frontend Engineer', score: 110, trend: '+5', comp: 5, weak: ['State Management', 'WebRTC'] },
    { id: 'mock3', name: 'Amit', email: 'amit@student.com', role: 'Data Scientist', score: 95, trend: '-10', comp: 3, weak: ['Deep Learning', 'PyTorch'] },
    { id: 'mock4', name: 'Neha', email: 'neha@student.com', role: 'Service Company SDE', score: 85, trend: '+20', comp: 4, weak: ['System Design', 'Caching'] },
    { id: 'mock5', name: 'Karan', email: 'karan@student.com', role: 'FAANG SDE', score: 70, trend: '-5', comp: 1, weak: ['DSA', 'System Design'] },
  ];

  mocks.forEach((m, i) => {
    const s = createSession(m.id, m.email, m.name);
    s.role = m.role;
    // mock completed tasks
    for(let j=0; j<m.comp; j++) {
      s.plan.push({ id: `mt_${j}`, status: 'completed', task: 'Mock Task' });
    }
    // mock gap analysis
    s.gapAnalysis = { missing_core: m.weak, missing_secondary: [], missing_tools: [], readiness_score: m.score / 2 };
    // mock interview score
    s.interviewState = { completed: true, scores: [{ score: m.score / 12 }] }; // scaled down just for mapping
    s.mockTotalScore = m.score; // direct field for leaderboard
    s.trend = m.trend;
  });
}

// Seed on startup
seedMockData();

module.exports = { createSession, getSession, updateSession, logAgentAction, checkMissedTasks, getAllSessions, seedMockData };
