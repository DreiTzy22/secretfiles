const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 8000;
const DB_PATH = path.join(__dirname, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

function safeJsonParse(value) {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false, value: null };
  }
}

function nowIso() {
  return new Date().toISOString();
}

function randomId() {
  return crypto.randomBytes(12).toString('hex');
}

function loadDb() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return { pages: [], tasks: [], events: [], notes: '' };
    }
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = safeJsonParse(raw);
    if (!parsed.ok || !parsed.value || typeof parsed.value !== 'object') {
      return { pages: [], tasks: [], events: [], notes: '' };
    }
    const db = parsed.value;
    if (!Array.isArray(db.pages)) db.pages = [];
    if (!Array.isArray(db.tasks)) db.tasks = [];
    if (!Array.isArray(db.events)) db.events = [];
    if (typeof db.notes !== 'string') db.notes = '';
    return db;
  } catch {
    return { pages: [], tasks: [], events: [], notes: '' };
  }
}

function saveDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

function ensurePage(page) {
  if (!page.id) page.id = randomId();
  if (typeof page.title !== 'string') page.title = 'Untitled';
  if (!page.createdAt) page.createdAt = nowIso();
  if (!page.updatedAt) page.updatedAt = page.createdAt;
  if (!Array.isArray(page.blocks)) page.blocks = [{ id: randomId(), type: 'text', text: '' }];
  for (const block of page.blocks) {
    if (!block || typeof block !== 'object') continue;
    if (!block.id) block.id = randomId();
    if (typeof block.type !== 'string') block.type = 'text';
    if (typeof block.text !== 'string') block.text = '';
    if (typeof block.checked !== 'boolean') block.checked = false;
  }
  return page;
}

function ensureTask(task) {
  if (!task.id) task.id = randomId();
  if (typeof task.title !== 'string') task.title = '';
  if (typeof task.completed !== 'boolean') task.completed = false;
  if (typeof task.priority !== 'string') task.priority = 'medium';
  if (!['low', 'medium', 'high'].includes(task.priority)) task.priority = 'medium';
  if (task.dueAt == null) task.dueAt = '';
  if (typeof task.dueAt !== 'string') task.dueAt = String(task.dueAt);
  if (!task.createdAt) task.createdAt = nowIso();
  if (!task.updatedAt) task.updatedAt = task.createdAt;
  return task;
}

function ensureEvent(event) {
  if (!event.id) event.id = randomId();
  if (typeof event.title !== 'string') event.title = '';
  if (typeof event.startAt !== 'string') event.startAt = '';
  if (typeof event.endAt !== 'string') event.endAt = '';
  if (!event.createdAt) event.createdAt = nowIso();
  if (!event.updatedAt) event.updatedAt = event.createdAt;
  return event;
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 1_000_000) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function safePathFromUrlPathname(urlPathname) {
  const requestedPath = urlPathname === '/' ? '/index.html' : urlPathname;
  const normalized = path.normalize(requestedPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = path.join(PUBLIC_DIR, normalized);
  if (!filePath.startsWith(PUBLIC_DIR)) return null;
  return filePath;
}

function contentTypeForFile(filePath) {
  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };
  return mimeTypes[extname] || 'application/octet-stream';
}

function pageSummary(page) {
  return { id: page.id, title: page.title, updatedAt: page.updatedAt, createdAt: page.createdAt };
}

const server = http.createServer(async (req, res) => {
  const method = req.method || 'GET';
  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || `localhost:${PORT}`}`);
  const pathname = parsedUrl.pathname;

  if (pathname.startsWith('/api/')) {
    if (method === 'GET' && pathname === '/api/pages') {
      const db = loadDb();
      for (const page of db.pages) ensurePage(page);
      saveDb(db);
      const pages = db.pages
        .slice()
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
        .map(pageSummary);
      return sendJson(res, 200, { pages });
    }

    if (method === 'GET' && pathname === '/api/pages/get') {
      const id = parsedUrl.searchParams.get('id');
      if (!id) return sendJson(res, 400, { message: 'id is required' });
      const db = loadDb();
      const page = db.pages.find(p => p.id === id);
      if (!page) return sendJson(res, 404, { message: 'Page not found' });
      ensurePage(page);
      saveDb(db);
      return sendJson(res, 200, { page });
    }

    if (method === 'GET' && pathname === '/api/tasks') {
      const db = loadDb();
      for (const task of db.tasks) ensureTask(task);
      saveDb(db);
      const tasks = db.tasks
        .slice()
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      return sendJson(res, 200, { tasks });
    }

    if (method === 'GET' && pathname === '/api/events') {
      const db = loadDb();
      for (const ev of db.events) ensureEvent(ev);
      saveDb(db);
      const events = db.events
        .slice()
        .sort((a, b) => String(a.startAt || '').localeCompare(String(b.startAt || '')));
      return sendJson(res, 200, { events });
    }

    if (method === 'GET' && pathname === '/api/notes') {
      const db = loadDb();
      if (typeof db.notes !== 'string') db.notes = '';
      saveDb(db);
      return sendJson(res, 200, { notes: db.notes });
    }

    if (method === 'POST') {
      let data = {};
      try {
        const raw = await readBody(req);
        const parsed = safeJsonParse(raw || '{}');
        if (!parsed.ok) return sendJson(res, 400, { message: 'Invalid JSON body' });
        data = parsed.value || {};
      } catch (e) {
        return sendJson(res, 400, { message: e?.message || 'Bad Request' });
      }

      if (pathname === '/api/pages/create') {
        const title = typeof data.title === 'string' ? data.title.trim() : '';
        const db = loadDb();
        const page = ensurePage({
          id: randomId(),
          title: title || 'Untitled',
          createdAt: nowIso(),
          updatedAt: nowIso(),
          blocks: [{ id: randomId(), type: 'text', text: '' }],
        });
        db.pages.unshift(page);
        saveDb(db);
        return sendJson(res, 201, { page: pageSummary(page) });
      }

      if (pathname === '/api/pages/delete') {
        const { id } = data;
        if (!id) return sendJson(res, 400, { message: 'id is required' });
        const db = loadDb();
        const before = db.pages.length;
        db.pages = db.pages.filter(p => p.id !== id);
        if (db.pages.length === before) return sendJson(res, 404, { message: 'Page not found' });
        saveDb(db);
        return sendJson(res, 200, { ok: true });
      }

      if (pathname === '/api/pages/rename') {
        const { id, title } = data;
        if (!id || title == null) return sendJson(res, 400, { message: 'id and title are required' });
        const db = loadDb();
        const page = db.pages.find(p => p.id === id);
        if (!page) return sendJson(res, 404, { message: 'Page not found' });
        ensurePage(page);
        page.title = String(title).slice(0, 140) || 'Untitled';
        page.updatedAt = nowIso();
        saveDb(db);
        return sendJson(res, 200, { page: pageSummary(page) });
      }

      if (pathname === '/api/pages/update') {
        const { id, blocks, title } = data;
        if (!id) return sendJson(res, 400, { message: 'id is required' });
        if (!Array.isArray(blocks)) return sendJson(res, 400, { message: 'blocks must be an array' });
        const db = loadDb();
        const page = db.pages.find(p => p.id === id);
        if (!page) return sendJson(res, 404, { message: 'Page not found' });
        ensurePage(page);

        if (title != null) page.title = String(title).slice(0, 140) || 'Untitled';
        page.blocks = blocks.map(b => {
          const block = {
            id: b && typeof b === 'object' && b.id ? String(b.id) : randomId(),
            type: b && typeof b === 'object' && b.type ? String(b.type) : 'text',
            text: b && typeof b === 'object' && b.text != null ? String(b.text) : '',
            checked: !!(b && typeof b === 'object' && b.checked),
          };
          if (!['text', 'h1', 'h2', 'todo', 'bullet', 'quote', 'code'].includes(block.type)) block.type = 'text';
          block.text = block.text.slice(0, 5000);
          return block;
        });
        if (page.blocks.length === 0) page.blocks = [{ id: randomId(), type: 'text', text: '' }];
        page.updatedAt = nowIso();
        saveDb(db);
        return sendJson(res, 200, { ok: true });
      }

      if (pathname === '/api/tasks/create') {
        const title = typeof data.title === 'string' ? data.title.trim() : '';
        if (!title) return sendJson(res, 400, { message: 'title is required' });
        const dueAt = data.dueAt ? String(data.dueAt).slice(0, 40) : '';
        const priority = typeof data.priority === 'string' ? data.priority : 'medium';
        const db = loadDb();
        const task = ensureTask({
          id: randomId(),
          title: title.slice(0, 140),
          dueAt,
          priority,
          completed: false,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
        db.tasks.unshift(task);
        saveDb(db);
        return sendJson(res, 201, { task });
      }

      if (pathname === '/api/tasks/update') {
        const { id, title, dueAt, priority } = data;
        if (!id) return sendJson(res, 400, { message: 'id is required' });
        const db = loadDb();
        const task = db.tasks.find(t => t.id === id);
        if (!task) return sendJson(res, 404, { message: 'Task not found' });
        ensureTask(task);
        if (title != null) task.title = String(title).slice(0, 140);
        if (dueAt != null) task.dueAt = String(dueAt).slice(0, 40);
        if (priority != null) {
          const p = String(priority);
          if (['low', 'medium', 'high'].includes(p)) task.priority = p;
        }
        task.updatedAt = nowIso();
        saveDb(db);
        return sendJson(res, 200, { task });
      }

      if (pathname === '/api/tasks/toggle') {
        const { id } = data;
        if (!id) return sendJson(res, 400, { message: 'id is required' });
        const db = loadDb();
        const task = db.tasks.find(t => t.id === id);
        if (!task) return sendJson(res, 404, { message: 'Task not found' });
        ensureTask(task);
        task.completed = !task.completed;
        task.updatedAt = nowIso();
        saveDb(db);
        return sendJson(res, 200, { task });
      }

      if (pathname === '/api/tasks/delete') {
        const { id } = data;
        if (!id) return sendJson(res, 400, { message: 'id is required' });
        const db = loadDb();
        const before = db.tasks.length;
        db.tasks = db.tasks.filter(t => t.id !== id);
        if (db.tasks.length === before) return sendJson(res, 404, { message: 'Task not found' });
        saveDb(db);
        return sendJson(res, 200, { ok: true });
      }

      if (pathname === '/api/events/create') {
        const title = typeof data.title === 'string' ? data.title.trim() : '';
        const startAt = data.startAt ? String(data.startAt).slice(0, 40) : '';
        const endAt = data.endAt ? String(data.endAt).slice(0, 40) : '';
        if (!startAt || !endAt) return sendJson(res, 400, { message: 'startAt and endAt are required' });
        const db = loadDb();
        const event = ensureEvent({
          id: randomId(),
          title: title.slice(0, 140),
          startAt,
          endAt,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
        db.events.unshift(event);
        saveDb(db);
        return sendJson(res, 201, { event });
      }

      if (pathname === '/api/events/delete') {
        const { id } = data;
        if (!id) return sendJson(res, 400, { message: 'id is required' });
        const db = loadDb();
        const before = db.events.length;
        db.events = db.events.filter(e => e.id !== id);
        if (db.events.length === before) return sendJson(res, 404, { message: 'Event not found' });
        saveDb(db);
        return sendJson(res, 200, { ok: true });
      }

      if (pathname === '/api/notes/set') {
        const notes = data.notes == null ? '' : String(data.notes);
        const db = loadDb();
        db.notes = notes.slice(0, 20000);
        saveDb(db);
        return sendJson(res, 200, { ok: true });
      }

      return sendJson(res, 404, { message: 'Not Found' });
    }

    return sendJson(res, 405, { message: 'Method Not Allowed' });
  }

  if (method !== 'GET') return sendText(res, 405, 'Method Not Allowed');

  const filePath = safePathFromUrlPathname(pathname);
  if (!filePath) return sendText(res, 403, 'Forbidden');
  const ct = contentTypeForFile(filePath);

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') return sendText(res, 404, '404 Not Found');
      return sendText(res, 500, 'Internal Server Error');
    }
    res.writeHead(200, { 'Content-Type': ct });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
