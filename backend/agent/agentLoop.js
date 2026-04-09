const { logAgentAction, getSession, updateSession, checkMissedTasks } = require('./stateManager');

// Core agent decision engine
async function runAgentLoop(sessionId, claudeClient, roleRequirements) {
  const session = getSession(sessionId);
  if (!session) return { action: 'NO_SESSION' };

  const results = [];

  // Decision 1: Check for missed tasks
  const missedCheck = checkMissedTasks(sessionId);
  if (missedCheck?.triggered) {
    results.push({
      type: 'MISSED_TASK_ALERT',
      message: `⚡ Agent Action Triggered: ${missedCheck.missedCount} task(s) missed → Plan adjusted`,
      log: missedCheck.log
    });
  }

  // Decision 2: Check if skills are weak and no plan exists
  if (session.skills.weak.length > 0 && session.plan.length === 0) {
    const log = logAgentAction(sessionId, 'AUTO_PLAN_TRIGGERED', {
      reason: 'Weak skills detected without a study plan',
      weakSkills: session.skills.weak
    });
    results.push({
      type: 'AUTO_PLAN_ALERT',
      message: `⚡ Agent Action Triggered: Weak skills detected → Auto-generating study plan`,
      log
    });
  }

  // Decision 3: Check progress stall
  const completedTasks = session.plan.filter(t => t.status === 'completed').length;
  const totalTasks = session.plan.length;
  if (totalTasks > 0 && completedTasks === 0 && session.plan.length > 0) {
    const hoursSinceActivity = (Date.now() - session.lastActivity) / 3600000;
    if (hoursSinceActivity > 0.01) { // threshold for demo (36 seconds)
      const log = logAgentAction(sessionId, 'PROGRESS_STALL_DETECTED', {
        reason: 'No tasks completed yet',
        suggestion: 'Starting with easiest tasks first'
      });
      results.push({
        type: 'STALL_ALERT',
        message: `⚡ Agent Action Triggered: No progress detected → Recommending quick-start tasks`,
        log
      });
    }
  }

  return {
    action: results.length > 0 ? 'ACTIONS_TAKEN' : 'MONITORING',
    results,
    sessionState: {
      role: session.role,
      weakSkills: session.skills.weak,
      planProgress: `${completedTasks}/${totalTasks}`,
      agentLogsCount: session.agentLogs.length
    }
  };
}

// Simulate proactive agent trigger (called by timeout or button)
async function triggerProactiveCheck(sessionId) {
  const session = getSession(sessionId);
  if (!session) return null;

  const pendingTasks = session.plan.filter(t => t.status === 'pending');

  if (pendingTasks.length > 0) {
    const log = logAgentAction(sessionId, 'PROACTIVE_CHECK', {
      pendingCount: pendingTasks.length,
      message: 'Agent performed scheduled check-in',
      recommendation: `Focus on: ${pendingTasks[0]?.task || 'your first task'}`
    });

    // Mark first pending as "agent-nudged"
    updateSession(sessionId, {
      plan: session.plan.map((t, i) =>
        i === session.plan.findIndex(p => p.status === 'pending')
          ? { ...t, agentNudged: true }
          : t
      )
    });

    return {
      triggered: true,
      type: 'PROACTIVE_CHECK',
      message: `⚡ Agent Action Triggered: Scheduled check-in → ${pendingTasks.length} tasks pending`,
      log,
      recommendation: pendingTasks[0]?.task
    };
  }

  return { triggered: false, message: 'All tasks on track' };
}

module.exports = { runAgentLoop, triggerProactiveCheck };
