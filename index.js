const express = require('express');
const auth = require('basic-auth');

const app = express();
app.use(express.json());

const USERNAME = process.env.AUTH_USER || 'admin';
const PASSWORD = process.env.AUTH_PASS || 'admin';
const PORT = process.env.PORT || 3000;

const PRIORITY_WEIGHTS = { critical: 100, high: 50, medium: 20, low: 5 };
const SEVERITY_WEIGHTS = { critical: 100, high: 50, medium: 20, low: 5 };
const STATUS_WEIGHTS = { open: 30, in_progress: 20, pending: 10, closed: 0 };

function basicAuth(req, res, next) {
  const credentials = auth(req);
  if (!credentials || credentials.name !== USERNAME || credentials.pass !== PASSWORD) {
    res.set('WWW-Authenticate', 'Basic realm="tickets-api"');
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

function ageInHours(createdAt) {
  if (!createdAt) return 0;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return 0;
  return Math.max(0, (Date.now() - created) / (1000 * 60 * 60));
}

function score(ticket) {
  const priority = PRIORITY_WEIGHTS[String(ticket.priority || '').toLowerCase()] || 0;
  const severity = SEVERITY_WEIGHTS[String(ticket.severity || '').toLowerCase()] || 0;
  const status = STATUS_WEIGHTS[String(ticket.status || '').toLowerCase()] || 0;
  const ageBoost = Math.min(ageInHours(ticket.createdAt), 24 * 30);
  const slaBoost = ticket.slaBreached ? 200 : 0;
  return priority + severity + status + ageBoost + slaBoost;
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/tickets/prioritize', basicAuth, (req, res) => {
  const tickets = req.body?.tickets;
  if (!Array.isArray(tickets)) {
    return res.status(400).json({ error: 'Body must contain a "tickets" array' });
  }

  const prioritized = tickets
    .map((ticket) => ({ ...ticket, _score: score(ticket) }))
    .sort((a, b) => b._score - a._score)
    .map((ticket, index) => {
      const { _score, ...rest } = ticket;
      return { rank: index + 1, score: _score, ...rest };
    });

  res.json({ count: prioritized.length, tickets: prioritized });
});

app.listen(PORT, () => {
  console.log(`Tickets API listening on port ${PORT}`);
});
