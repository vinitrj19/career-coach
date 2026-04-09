require('dotenv').config();
const { SUPABASE_URL, SUPABASE_KEY } = process.env;

async function testSupabase() {
  console.log('--- Supabase Diagnostic ---');
  console.log(`URL: ${SUPABASE_URL}`);
  console.log(`Key length: ${SUPABASE_KEY ? SUPABASE_KEY.length : 0}`);
  
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY in .env');
    return;
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/students?select=*`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Connection Successful!');
      console.log(`📊 Students in DB: ${data.length}`);
    } else {
      const text = await response.text();
      console.error(`❌ Connection Failed (Status ${response.status}):`);
      console.error(text);
      
      if (response.status === 401 || response.status === 403) {
        console.warn('⚠️ Advice: Your SUPABASE_KEY might be invalid. Supabase keys are usually very long strings (JWTs).');
      }
      if (response.status === 404) {
        console.warn('⚠️ Advice: The "students" table might not exist yet. Did you run the SQL script?');
      }
    }
  } catch (error) {
    console.error('❌ Request Error:', error.message);
  }
}

testSupabase();
