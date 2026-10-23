const { createClient } = require('@supabase/supabase-js');
const http = require('http');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PORT = process.env.PORT || 3000;

// CORS headers — allow the Claude artifact origin
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

async function getStats() {
  // Run all queries in parallel
  const [leadsRes, jobsRes, driversRes, ratesRes, cityRes] = await Promise.all([
    // Agent 1: total leads found
    supabase.from('leads').select('id', { count: 'exact', head: true }),

    // Agent 3: jobs / outreach emails queued
    supabase.from('jobs').select('id', { count: 'exact', head: true }),

    // Agent 2: drivers (profiles with role = 'driver')
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'driver'),

    // Agent 4: rate bounds configured
    supabase.from('rate_bounds').select('id', { count: 'exact', head: true }),

    // City breakdown from leads table
    supabase.from('leads').select('city'),
  ]);

  // Count leads per city
  const cityData = cityRes.data || [];
  const cities = { memphis: 0, new_orleans: 0, houston: 0 };
  cityData.forEach(row => {
    const city = (row.city || '').toLowerCase();
    if (city.includes('memphis')) cities.memphis++;
    else if (city.includes('orleans') || city.includes('nola')) cities.new_orleans++;
    else if (city.includes('houston')) cities.houston++;
  });

  return {
    ok: true,
    timestamp: new Date().toISOString(),
    agents: {
      lead_scout:        { count: leadsRes.count  ?? 0, label: 'Leads Found' },
      driver_recruiter:  { count: driversRes.count ?? 0, label: 'Drivers Onboarded' },
      business_outreach: { count: jobsRes.count   ?? 0, label: 'Emails Queued' },
      rate_configurator: { count: ratesRes.count  ?? 0, label: 'Rates Calibrated' },
    },
    cities,
  };
}

const server = http.createServer(async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // Health check
  if (req.url === '/health') {
    res.writeHead(200, CORS_HEADERS);
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Stats endpoint
  if (req.url === '/stats' && req.method === 'GET') {
    try {
      const stats = await getStats();
      res.writeHead(200, CORS_HEADERS);
      res.end(JSON.stringify(stats));
    } catch (err) {
      console.error('Stats error:', err);
      res.writeHead(500, CORS_HEADERS);
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // 404
  res.writeHead(404, CORS_HEADERS);
  res.end(JSON.stringify({ ok: false, error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`VNC Stats API running on port ${PORT}`);
});
