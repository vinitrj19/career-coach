

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Minimal Wrapper around Supabase REST to avoid NPM dependency failures
class SupabaseClient {
  constructor() {
    this.isActive = !!(SUPABASE_URL && SUPABASE_KEY);
  }

  async rawPost(table, payload, conflictCol = '') {
    if (!this.isActive) return;
    try {
      const preferHeader = conflictCol ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal';
      const url = conflictCol ? `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflictCol}` : `${SUPABASE_URL}/rest/v1/${table}`;
      
      await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': preferHeader
        },
        body: JSON.stringify(payload)
      });
    } catch(e) { console.log('Supabase Sync Warn:', e.message); }
  }
  
  async syncStudent(studentData) {
    // Generate a consistent UUID from the email so Supabase UUID column doesn't crash
    const crypto = require('crypto');
    const fauxUuid = crypto.createHash('md5').update(studentData.email).digest('hex');
    const formattedUuid = `${fauxUuid.slice(0,8)}-${fauxUuid.slice(8,12)}-4${fauxUuid.slice(13,16)}-8${fauxUuid.slice(17,20)}-${fauxUuid.slice(20,32)}`;
    
    studentData.id = formattedUuid; // Override with valid UUID
    await this.rawPost('students', studentData, 'email');
  }

  async syncScore(scoreData) {
    if (scoreData.student_id && scoreData.student_id.includes('@')) {
      const crypto = require('crypto');
      const fauxUuid = crypto.createHash('md5').update(scoreData.student_id).digest('hex');
      scoreData.student_id = `${fauxUuid.slice(0,8)}-${fauxUuid.slice(8,12)}-4${fauxUuid.slice(13,16)}-8${fauxUuid.slice(17,20)}-${fauxUuid.slice(20,32)}`;
    }
    await this.rawPost('scores', scoreData, 'student_id,skill');
  }

  async logQuizAttempt(attemptData) {
    if (attemptData.student_id && attemptData.student_id.includes('@')) {
      const crypto = require('crypto');
      const fauxUuid = crypto.createHash('md5').update(attemptData.student_id).digest('hex');
      attemptData.student_id = `${fauxUuid.slice(0,8)}-${fauxUuid.slice(8,12)}-4${fauxUuid.slice(13,16)}-8${fauxUuid.slice(17,20)}-${fauxUuid.slice(20,32)}`;
    }
    await this.rawPost('quiz_attempts', attemptData);
  }
}

module.exports = new SupabaseClient();
