/* ─── Tiny DOM helper ────────────────────────── */
const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "html") node.innerHTML = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === false || value === null || value === undefined) continue;
    else node.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
};

/* ─── API ────────────────────────────────────── */
const api = {
  async get(path) {
    const res = await fetch(path);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
    return data;
  },
  async post(path, body) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
    return data;
  },
};

/* ─── DOM refs ───────────────────────────────── */
const ui = {
  navPages:          document.getElementById("navPages"),
  navTasks:          document.getElementById("navTasks"),
  navCalendar:       document.getElementById("navCalendar"),
  pageList:          document.getElementById("pageList"),
  searchInput:       document.getElementById("searchInput"),
  newPageBtn:        document.getElementById("newPageBtn"),
  syncStatus:        document.getElementById("syncStatus"),
  crumb:             document.getElementById("crumb"),
  pageView:          document.getElementById("pageView"),
  tasksView:         document.getElementById("tasksView"),
  calendarView:      document.getElementById("calendarView"),
  pageTitle:         document.getElementById("pageTitle"),
  deletePageBtn:     document.getElementById("deletePageBtn"),
  addBlockBtn:       document.getElementById("addBlockBtn"),
  blocks:            document.getElementById("blocks"),
  pageStatus:        document.getElementById("pageStatus"),
  addTaskForm:       document.getElementById("addTaskForm"),
  taskDueAt:         document.getElementById("taskDueAt"),
  taskPriority:      document.getElementById("taskPriority"),
  refreshTasksBtn:   document.getElementById("refreshTasksBtn"),
  taskMetrics:       document.getElementById("taskMetrics"),
  tasksTable:        document.getElementById("tasksTable"),
  tasksStatus:       document.getElementById("tasksStatus"),
  tasksNotes:        document.getElementById("tasksNotes"),
  notesStatus:       document.getElementById("notesStatus"),
  timerMiniDisplay:  document.getElementById("timerMiniDisplay"),
  timerMiniToggle:   document.getElementById("timerMiniToggle"),
  timerMiniReset:    document.getElementById("timerMiniReset"),
  calPrevBtn:        document.getElementById("calPrevBtn"),
  calNextBtn:        document.getElementById("calNextBtn"),
  calMonth:          document.getElementById("calMonth"),
  calendarHead:      document.getElementById("calendarHead"),
  calendarGrid:      document.getElementById("calendarGrid"),
  dayTitle:          document.getElementById("dayTitle"),
  dayHint:           document.getElementById("dayHint"),
  dayTasks:          document.getElementById("dayTasks"),
  dayEvents:         document.getElementById("dayEvents"),
  dayFree:           document.getElementById("dayFree"),
  addEventForm:      document.getElementById("addEventForm"),
  eventStartAt:      document.getElementById("eventStartAt"),
  eventEndAt:        document.getElementById("eventEndAt"),
};

/* ─── App state ──────────────────────────────── */
let state = {
  view: "pages",
  pages: [],
  selectedPageId: "",
  selectedPage: null,
  tasks: [],
  save: { handle: null, inFlight: false, dirty: false, lastSavedAt: 0 },
  timer: { running: false, durationSec: 25 * 60, remainingSec: 25 * 60, intervalId: null, lastTickMs: 0 },
  cal: {
    year: new Date().getFullYear(),
    month: new Date().getMonth(), // 0-based
    selectedDate: null,           // "YYYY-MM-DD"
    events: {},                   // { "YYYY-MM-DD": [{id, title, start, end}] }
  },
};

/* ─── Helpers ────────────────────────────────── */
function setStatus(node, msg) { if (node) node.textContent = msg || ""; }
function pad2(n) { return String(n).padStart(2, "0"); }
function cryptoId() { return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2); }
function formatClock(s) { s = Math.max(0, Math.floor(s)); return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`; }
function parseDueAt(v) { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d; }
function priorityRank(p) { return p === "high" ? 3 : p === "medium" ? 2 : 1; }

/* ─── Date helpers ───────────────────────────── */
function dateKey(y, m, d) {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}
function todayKey() {
  const t = new Date();
  return dateKey(t.getFullYear(), t.getMonth(), t.getDate());
}
function parseTimeToMins(t) {
  // "HH:MM" → minutes since midnight
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}
function minsToTime(m) {
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

/* ─── LocalStorage: calendar events ─────────── */
const CAL_KEY = "notionLite.calEvents";
function loadCalEvents() {
  try { return JSON.parse(localStorage.getItem(CAL_KEY) || "{}"); } catch { return {}; }
}
function saveCalEvents() {
  localStorage.setItem(CAL_KEY, JSON.stringify(state.cal.events));
}

/* ─── LocalStorage: notepad ──────────────────── */
const NOTES_KEY = "notionLite.tasksNotes";
function loadNotes() { return localStorage.getItem(NOTES_KEY) || ""; }
function saveNotes(text) { localStorage.setItem(NOTES_KEY, text); }

/* ─── View switcher ──────────────────────────── */
function setView(view) {
  state.view = view;
  ui.navPages.classList.toggle("is-active",    view === "pages");
  ui.navTasks.classList.toggle("is-active",    view === "tasks");
  ui.navCalendar.classList.toggle("is-active", view === "calendar");
  ui.pageView.hidden     = view !== "pages";
  ui.tasksView.hidden    = view !== "tasks";
  ui.calendarView.hidden = view !== "calendar";

  const labels = { pages: state.selectedPage?.title || "Pages", tasks: "Tasks database", calendar: "Calendar" };
  ui.crumb.textContent = labels[view] || "";
}

/* ══════════════════════════════════════════════
   PAGES
══════════════════════════════════════════════ */
async function refreshPages() {
  const { pages } = await api.get("/api/pages");
  state.pages = Array.isArray(pages) ? pages : [];
  renderPageList();
}

async function openPage(id) {
  const { page } = await api.get(`/api/pages/get?id=${encodeURIComponent(id)}`);
  state.selectedPage = page;
  state.selectedPageId = page.id;
  ui.pageTitle.value = page.title || "";
  ui.crumb.textContent = page.title || "Untitled";
  renderPageList();
  renderBlocks();
  setView("pages");
}

async function createPage() {
  const { page } = await api.post("/api/pages/create", { title: "Untitled" });
  await refreshPages();
  await openPage(page.id);
}

async function deleteCurrentPage() {
  const id = state.selectedPageId;
  if (!id) return;
  ui.deletePageBtn.disabled = true;
  try {
    await api.post("/api/pages/delete", { id });
    state.selectedPageId = "";
    state.selectedPage = null;
    ui.blocks.innerHTML = "";
    ui.pageTitle.value = "";
    await refreshPages();
    setView("pages");
    if (state.pages[0]) await openPage(state.pages[0].id);
    else ui.crumb.textContent = "Pages";
  } finally {
    ui.deletePageBtn.disabled = false;
  }
}

function renderPageList() {
  const q = (ui.searchInput.value || "").trim().toLowerCase();
  ui.pageList.innerHTML = "";
  const items = state.pages.filter(p => !q || String(p.title || "").toLowerCase().includes(q));
  for (const p of items) {
    const btn = el("button", { class: `page-item${p.id === state.selectedPageId ? " is-active" : ""}`, type: "button" }, [
      el("div", { class: "page-item-title", text: p.title || "Untitled" }),
      el("div", { class: "page-item-meta",  text: p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : "" }),
    ]);
    btn.addEventListener("click", () => openPage(p.id));
    ui.pageList.appendChild(btn);
  }
}

/* ─── Blocks ─────────────────────────────────── */
function normalizedTypeFromText(text, currentType) {
  const t = text || "";
  const trimmed = t.trimStart();
  if (trimmed.startsWith("```"))    return { type: "code",   text: trimmed.replace(/^``` ?/, "") };
  if (trimmed.startsWith("## "))    return { type: "h2",     text: trimmed.slice(3) };
  if (trimmed.startsWith("# "))     return { type: "h1",     text: trimmed.slice(2) };
  if (trimmed.startsWith("> "))     return { type: "quote",  text: trimmed.slice(2) };
  if (trimmed.startsWith("- "))     return { type: "bullet", text: trimmed.slice(2) };
  if (/^\[\s\]\s+/.test(trimmed))   return { type: "todo",   text: trimmed.replace(/^\[\s\]\s+/, ""),    checked: false };
  if (/^\[x\]\s+/i.test(trimmed))   return { type: "todo",   text: trimmed.replace(/^\[x\]\s+/i, ""),    checked: true  };
  if (["todo","bullet","quote","code","h1","h2"].includes(currentType)) return { type: currentType, text: t };
  return { type: "text", text: t };
}

function blockClass(type) {
  if (type === "h1")    return "block-body is-h1";
  if (type === "h2")    return "block-body is-h2";
  if (type === "quote") return "block-body is-quote";
  if (type === "code")  return "block-body is-code";
  return "block-body";
}

function focusBlock(blockId, caret = "end") {
  const node = ui.blocks.querySelector(`[data-block-id="${CSS.escape(blockId)}"]`);
  if (!node) return;
  node.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(caret !== "start");
  sel.removeAllRanges();
  sel.addRange(range);
}

function scheduleSave() {
  state.save.dirty = true;
  ui.syncStatus.textContent = "Unsaved changes";
  if (state.save.handle) clearTimeout(state.save.handle);
  state.save.handle = setTimeout(() => flushSave(), 550);
}

async function flushSave() {
  if (!state.selectedPage || state.save.inFlight || !state.save.dirty) return;
  state.save.inFlight = true;
  const page = state.selectedPage;
  try {
    await api.post("/api/pages/update", { id: page.id, title: page.title, blocks: page.blocks });
    state.save.dirty = false;
    ui.syncStatus.textContent = "Saved";
    setStatus(ui.pageStatus, "");
    await refreshPages();
  } catch (e) {
    ui.syncStatus.textContent = "Save failed";
    setStatus(ui.pageStatus, e.message);
  } finally {
    state.save.inFlight = false;
  }
}

function renderBlocks() {
  ui.blocks.innerHTML = "";
  const page = state.selectedPage;
  if (!page) return;
  if (!Array.isArray(page.blocks)) page.blocks = [{ id: cryptoId(), type: "text", text: "" }];
  for (const block of page.blocks) {
    const handle = el("button", { class: "block-handle", type: "button", text: "⋮" });
    handle.addEventListener("click", () => openBlockMenu(block.id));

    if (block.type === "todo") {
      const checkbox = el("input", { type: "checkbox" });
      checkbox.checked = !!block.checked;
      checkbox.addEventListener("change", () => { block.checked = checkbox.checked; scheduleSave(); });
      const body = el("div", { class: blockClass(block.type), contenteditable: "true", "data-block-id": block.id });
      body.textContent = block.text || "";
      wireBlockEditor(body, block);
      ui.blocks.appendChild(el("div", { class: "block" }, [handle, el("div", { class: "block-todo" }, [checkbox, body])]));
      continue;
    }

    const body = el("div", { class: blockClass(block.type), contenteditable: "true", "data-block-id": block.id });
    body.textContent = block.text || "";
    wireBlockEditor(body, block);
    ui.blocks.appendChild(el("div", { class: "block" }, [handle, body]));
  }
}

function wireBlockEditor(node, block) {
  node.addEventListener("input", () => {
    const nextText = node.textContent || "";
    const normalized = normalizedTypeFromText(nextText, block.type);
    block.text = normalized.text;
    if (normalized.type && normalized.type !== block.type) {
      block.type = normalized.type;
      if (typeof normalized.checked === "boolean") block.checked = normalized.checked;
      node.className = blockClass(block.type);
      if (block.type !== "todo") node.textContent = block.text;
    } else if (block.type !== "todo") {
      block.text = nextText;
    }
    state.selectedPage.updatedAt = new Date().toISOString();
    scheduleSave();
  });

  node.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      insertBlockAfter(block.id, { type: "text", text: "" });
      return;
    }
    if (e.key === "Backspace" && (node.textContent || "").length === 0) {
      e.preventDefault();
      deleteBlock(block.id);
      return;
    }
    if (e.key === "/" && (node.textContent || "").trim() === "/") {
      e.preventDefault();
      node.textContent = "";
      openQuickInsert(block.id);
    }
  });
}

function insertBlockAfter(afterId, blockLike) {
  const page = state.selectedPage;
  if (!page) return;
  const idx = page.blocks.findIndex(b => b.id === afterId);
  const next = { id: cryptoId(), type: blockLike.type || "text", text: blockLike.text || "", checked: !!blockLike.checked };
  page.blocks.splice(idx >= 0 ? idx + 1 : page.blocks.length, 0, next);
  renderBlocks();
  focusBlock(next.id, "start");
  scheduleSave();
}

function deleteBlock(blockId) {
  const page = state.selectedPage;
  if (!page) return;
  const idx = page.blocks.findIndex(b => b.id === blockId);
  if (idx < 0) return;
  if (page.blocks.length === 1) {
    Object.assign(page.blocks[0], { type: "text", text: "", checked: false });
    renderBlocks();
    focusBlock(page.blocks[0].id, "start");
    scheduleSave();
    return;
  }
  const prev = page.blocks[idx - 1] || page.blocks[idx + 1];
  page.blocks.splice(idx, 1);
  renderBlocks();
  if (prev) focusBlock(prev.id, "end");
  scheduleSave();
}

function openBlockMenu(blockId) {
  const block = state.selectedPage?.blocks?.find(b => b.id === blockId);
  if (!block) return;
  const type = prompt("Block type: text, h1, h2, todo, bullet, quote, code", block.type || "text");
  if (!type || !["text","h1","h2","todo","bullet","quote","code"].includes(type)) return;
  block.type = type;
  if (type !== "todo") block.checked = false;
  renderBlocks();
  focusBlock(blockId, "end");
  scheduleSave();
}

function openQuickInsert(blockId) {
  const choice = prompt("Insert block: h1, h2, todo, bullet, quote, code");
  if (!choice) return;
  if (["h1","h2","bullet","quote","code","text"].includes(choice)) insertBlockAfter(blockId, { type: choice, text: "" });
  else if (choice === "todo") insertBlockAfter(blockId, { type: "todo", text: "", checked: false });
}

/* ══════════════════════════════════════════════
   TASKS
══════════════════════════════════════════════ */
async function refreshTasks() {
  const { tasks } = await api.get("/api/tasks");
  state.tasks = Array.isArray(tasks) ? tasks : [];
  renderTasks();
}

function renderTasks() {
  const now = new Date();
  const sorted = [...state.tasks].sort((a, b) => {
    if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1;
    const adMs = parseDueAt(a.dueAt)?.getTime() ?? Infinity;
    const bdMs = parseDueAt(b.dueAt)?.getTime() ?? Infinity;
    if (adMs !== bdMs) return adMs - bdMs;
    return priorityRank(b.priority) - priorityRank(a.priority);
  });

  const overdue = state.tasks.filter(t => !t.completed && parseDueAt(t.dueAt)?.getTime() < now.getTime()).length;
  const done    = state.tasks.filter(t => t.completed).length;
  ui.taskMetrics.textContent = state.tasks.length
    ? `${state.tasks.length} total · ${done} done · ${overdue} overdue`
    : "Add tasks with priority and deadlines.";

  ui.tasksTable.innerHTML = "";
  ui.tasksTable.appendChild(
    el("div", { class: "table-head" }, [
      el("div", { text: "Done" }),
      el("div", { text: "Title" }),
      el("div", { text: "Deadline" }),
      el("div", { text: "Priority" }),
      el("div", { text: "Actions" }),
    ])
  );

  for (const task of sorted) {
    const due = parseDueAt(task.dueAt);
    const isOverdue = !task.completed && due && due.getTime() < now.getTime();

    const check = el("input", { type: "checkbox" });
    check.checked = !!task.completed;
    check.addEventListener("change", async () => {
      check.disabled = true;
      try {
        const { task: updated } = await api.post("/api/tasks/toggle", { id: task.id });
        Object.assign(task, updated);
        renderTasks();
      } catch (e) {
        check.checked = !!task.completed;
        setStatus(ui.tasksStatus, e.message);
      } finally { check.disabled = false; }
    });

    const titleInput = el("input", { class: "input", value: task.title || "" });
    titleInput.addEventListener("blur", async () => {
      const next = titleInput.value.trim();
      if (!next || next === task.title) { titleInput.value = task.title || ""; return; }
      try {
        const { task: updated } = await api.post("/api/tasks/update", { id: task.id, title: next });
        Object.assign(task, updated);
      } catch (e) { titleInput.value = task.title || ""; setStatus(ui.tasksStatus, e.message); }
    });

    const dueInput = el("input", { class: "input", type: "datetime-local", value: task.dueAt || "" });
    dueInput.addEventListener("change", async () => {
      try {
        const { task: updated } = await api.post("/api/tasks/update", { id: task.id, dueAt: dueInput.value || "" });
        Object.assign(task, updated);
        renderTasks();
      } catch (e) { dueInput.value = task.dueAt || ""; setStatus(ui.tasksStatus, e.message); }
    });

    const p = task.priority || "medium";
    const prioritySelect = el("select", { class: "input" }, [
      el("option", { value: "high", text: "High" }),
      el("option", { value: "medium", text: "Medium" }),
      el("option", { value: "low", text: "Low" }),
    ]);
    prioritySelect.value = p;
    prioritySelect.addEventListener("change", async () => {
      try {
        const { task: updated } = await api.post("/api/tasks/update", { id: task.id, priority: prioritySelect.value });
        Object.assign(task, updated);
        renderTasks();
      } catch (e) { prioritySelect.value = task.priority || "medium"; setStatus(ui.tasksStatus, e.message); }
    });

    const pill = el("span", { class: `priority-pill is-${p}`, text: p.toUpperCase() });

    const delBtn = el("button", { class: "btn btn-danger btn-small", type: "button", text: "Delete" });
    delBtn.addEventListener("click", async () => {
      delBtn.disabled = true;
      try {
        await api.post("/api/tasks/delete", { id: task.id });
        state.tasks = state.tasks.filter(t => t.id !== task.id);
        renderTasks();
      } catch (e) { setStatus(ui.tasksStatus, e.message); }
      finally { delBtn.disabled = false; }
    });

    const dueCell = el("div", {}, [
      dueInput,
      isOverdue ? el("div", { class: "hint", text: `⚠ Overdue · ${due.toLocaleString()}` }) : null,
    ]);

    ui.tasksTable.appendChild(
      el("div", { class: "table-row" }, [check, titleInput, dueCell, el("div", {}, [pill, prioritySelect]), delBtn])
    );
  }
}

/* ══════════════════════════════════════════════
   NOTEPAD
══════════════════════════════════════════════ */
let notesSaveHandle = null;
function initNotepad() {
  ui.tasksNotes.value = loadNotes();
  ui.tasksNotes.addEventListener("input", () => {
    if (notesSaveHandle) clearTimeout(notesSaveHandle);
    notesSaveHandle = setTimeout(() => {
      saveNotes(ui.tasksNotes.value);
      setStatus(ui.notesStatus, "Saved");
      setTimeout(() => setStatus(ui.notesStatus, ""), 1500);
    }, 600);
  });
}

/* ══════════════════════════════════════════════
   CALENDAR
══════════════════════════════════════════════ */
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const WORK_START = 9 * 60;   // 9 AM in minutes
const WORK_END   = 18 * 60;  // 6 PM in minutes

function calEventsForDate(key) {
  return state.cal.events[key] || [];
}

function tasksForDate(key) {
  return state.tasks.filter(t => {
    if (!t.dueAt) return false;
    const d = parseDueAt(t.dueAt);
    if (!d) return false;
    return dateKey(d.getFullYear(), d.getMonth(), d.getDate()) === key;
  });
}

function renderCalendar() {
  const { year, month, selectedDate } = state.cal;
  ui.calMonth.textContent = `${MONTHS[month]} ${year}`;

  // Day-of-week headers
  ui.calendarHead.innerHTML = "";
  for (const d of DAYS) {
    ui.calendarHead.appendChild(el("div", { text: d }));
  }

  // First day of month and last date
  const firstDow = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const today    = todayKey();

  ui.calendarGrid.innerHTML = "";

  // Leading blanks from prev month
  const prevLast = new Date(year, month, 0).getDate();
  for (let i = firstDow - 1; i >= 0; i--) {
    const d = prevLast - i;
    const m = month === 0 ? 11 : month - 1;
    const y = month === 0 ? year - 1 : year;
    const k = dateKey(y, m, d);
    ui.calendarGrid.appendChild(buildDayCell(y, m, d, k, today, selectedDate, true));
  }

  // Current month days
  for (let d = 1; d <= lastDate; d++) {
    const k = dateKey(year, month, d);
    ui.calendarGrid.appendChild(buildDayCell(year, month, d, k, today, selectedDate, false));
  }

  // Trailing blanks
  const totalCells = Math.ceil((firstDow + lastDate) / 7) * 7;
  let nextDay = 1;
  for (let i = firstDow + lastDate; i < totalCells; i++, nextDay++) {
    const m = month === 11 ? 0 : month + 1;
    const y = month === 11 ? year + 1 : year;
    const k = dateKey(y, m, nextDay);
    ui.calendarGrid.appendChild(buildDayCell(y, m, nextDay, k, today, selectedDate, true));
  }
}

function buildDayCell(y, m, d, k, today, selectedDate, outside) {
  const events = calEventsForDate(k);
  const tasks  = tasksForDate(k);
  const isFree = !outside && events.length === 0;
  const isBusy = !outside && events.length > 0;

  let cls = "cal-day";
  if (outside)         cls += " is-outside";
  else if (k === today) cls += " is-today";
  else if (isFree)     cls += " is-free";
  else if (isBusy)     cls += " is-busy";
  if (k === selectedDate) cls += " is-selected";

  const cell = el("div", { class: cls });
  cell.appendChild(el("div", { class: "cal-num", text: String(d) }));

  // Dots for tasks and events
  const dots = el("div", { class: "cal-dots" });
  for (let i = 0; i < Math.min(tasks.length, 3); i++)
    dots.appendChild(el("span", { class: "cal-dot is-task" }));
  for (let i = 0; i < Math.min(events.length, 3); i++)
    dots.appendChild(el("span", { class: "cal-dot is-event" }));
  if (dots.children.length) cell.appendChild(dots);

  if (!outside) {
    cell.addEventListener("click", () => selectCalDate(k));
  }

  return cell;
}

function selectCalDate(key) {
  state.cal.selectedDate = key;
  renderCalendar();
  renderDayPanel(key);
}

function renderDayPanel(key) {
  const [y, m, d] = key.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  const label = dateObj.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  ui.dayTitle.textContent = label;

  const events = calEventsForDate(key);
  const tasks  = tasksForDate(key);

  // Tasks due
  ui.dayTasks.innerHTML = "";
  if (tasks.length === 0) {
    ui.dayTasks.appendChild(el("div", { class: "day-empty", text: "No tasks due." }));
  } else {
    for (const t of tasks) {
      const due = parseDueAt(t.dueAt);
      const timeStr = due ? due.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      ui.dayTasks.appendChild(
        el("div", { class: "day-item" }, [
          el("span", { class: "day-item-label", text: t.title || "Untitled" }),
          el("span", { class: "day-item-meta",  text: timeStr }),
        ])
      );
    }
  }

  // Events (busy blocks)
  renderDayEvents(key);

  // Free windows
  renderFreeWindows(key);
}

function renderDayEvents(key) {
  const events = calEventsForDate(key);
  ui.dayEvents.innerHTML = "";
  if (events.length === 0) {
    ui.dayEvents.appendChild(el("div", { class: "day-empty", text: "No busy blocks." }));
    return;
  }
  for (const evt of events) {
    const del = el("button", { class: "day-item-delete", type: "button", title: "Remove", text: "×" });
    del.addEventListener("click", () => {
      state.cal.events[key] = (state.cal.events[key] || []).filter(e => e.id !== evt.id);
      if (state.cal.events[key].length === 0) delete state.cal.events[key];
      saveCalEvents();
      renderDayEvents(key);
      renderFreeWindows(key);
      renderCalendar();
    });
    ui.dayEvents.appendChild(
      el("div", { class: "day-item" }, [
        el("span", { class: "day-item-label", text: evt.title || "Busy" }),
        el("span", { class: "day-item-meta",  text: `${evt.start} – ${evt.end}` }),
        del,
      ])
    );
  }
}

function renderFreeWindows(key) {
  const events = calEventsForDate(key);
  ui.dayFree.innerHTML = "";

  if (!key) {
    ui.dayFree.appendChild(el("div", { class: "day-empty", text: "Select a day to see free time." }));
    return;
  }

  // Merge busy intervals and compute free windows within 9am–6pm
  const busy = events.map(e => ({
    s: parseTimeToMins(e.start) ?? WORK_START,
    e: parseTimeToMins(e.end)   ?? WORK_START,
  })).sort((a, b) => a.s - b.s);

  const free = [];
  let cursor = WORK_START;
  for (const interval of busy) {
    if (interval.s > cursor) free.push({ s: cursor, e: interval.s });
    cursor = Math.max(cursor, interval.e);
  }
  if (cursor < WORK_END) free.push({ s: cursor, e: WORK_END });

  if (free.length === 0) {
    ui.dayFree.appendChild(el("div", { class: "day-empty", text: "Fully booked during work hours." }));
    return;
  }

  for (const w of free) {
    const dur = w.e - w.s;
    const hrs = Math.floor(dur / 60);
    const mins = dur % 60;
    const durLabel = hrs > 0 ? `${hrs}h${mins > 0 ? ` ${mins}m` : ""}` : `${mins}m`;
    ui.dayFree.appendChild(
      el("div", { class: "day-free-item" }, [
        document.createTextNode(`${minsToTime(w.s)} – ${minsToTime(w.e)}`),
        el("span", { class: "day-item-meta", text: durLabel }),
      ])
    );
  }
}

/* ─── Event form ─────────────────────────────── */
ui.addEventForm.addEventListener("submit", e => {
  e.preventDefault();
  const key = state.cal.selectedDate;
  if (!key) return;
  const form    = new FormData(ui.addEventForm);
  const title   = String(form.get("evtTitle") || "").trim();
  const start   = ui.eventStartAt.value;
  const end     = ui.eventEndAt.value;
  if (!start || !end) return;

  const sMin = parseTimeToMins(start);
  const eMin = parseTimeToMins(end);
  if (eMin <= sMin) { alert("End time must be after start time."); return; }

  if (!state.cal.events[key]) state.cal.events[key] = [];
  state.cal.events[key].push({ id: cryptoId(), title, start, end });
  saveCalEvents();
  ui.addEventForm.reset();
  renderDayEvents(key);
  renderFreeWindows(key);
  renderCalendar();
});

/* ─── Nav ────────────────────────────────────── */
ui.calPrevBtn.addEventListener("click", () => {
  if (state.cal.month === 0) { state.cal.month = 11; state.cal.year--; }
  else state.cal.month--;
  renderCalendar();
});

ui.calNextBtn.addEventListener("click", () => {
  if (state.cal.month === 11) { state.cal.month = 0; state.cal.year++; }
  else state.cal.month++;
  renderCalendar();
});

/* ══════════════════════════════════════════════
   TIMER
══════════════════════════════════════════════ */
function setTimerMinutes(minutes) {
  const m = Math.max(1, Math.min(180, Number(minutes) || 25));
  localStorage.setItem("notionLite.timerMinutes", String(m));
  state.timer.durationSec = m * 60;
  if (!state.timer.running) state.timer.remainingSec = state.timer.durationSec;
  ui.timerMiniDisplay.textContent = formatClock(state.timer.remainingSec);
}

function updateTimerButtons() {
  ui.timerMiniToggle.textContent = state.timer.running ? "Pause" : "Start";
}

function stopTimerInterval() {
  if (!state.timer.intervalId) return;
  clearInterval(state.timer.intervalId);
  state.timer.intervalId = null;
}

function tickTimer() {
  const now = Date.now();
  state.timer.remainingSec -= (now - state.timer.lastTickMs) / 1000;
  state.timer.lastTickMs = now;
  if (state.timer.remainingSec <= 0) {
    state.timer.remainingSec = 0;
    state.timer.running = false;
    stopTimerInterval();
  }
  ui.timerMiniDisplay.textContent = formatClock(state.timer.remainingSec);
  updateTimerButtons();
}

function toggleTimer() {
  if (state.timer.running) {
    state.timer.running = false;
    stopTimerInterval();
    updateTimerButtons();
    return;
  }
  if (state.timer.remainingSec <= 0) setTimerMinutes(localStorage.getItem("notionLite.timerMinutes") || 25);
  state.timer.running = true;
  state.timer.lastTickMs = Date.now();
  stopTimerInterval();
  state.timer.intervalId = setInterval(tickTimer, 250);
  updateTimerButtons();
}

/* ══════════════════════════════════════════════
   EVENT LISTENERS
══════════════════════════════════════════════ */
ui.navPages.addEventListener("click",    () => setView("pages"));
ui.navTasks.addEventListener("click",    async () => {
  setView("tasks");
  try { await refreshTasks(); } catch (e) { setStatus(ui.tasksStatus, e.message); }
});
ui.navCalendar.addEventListener("click", async () => {
  setView("calendar");
  try { await refreshTasks(); } catch { /* tasks optional for calendar */ }
  renderCalendar();
  if (state.cal.selectedDate) renderDayPanel(state.cal.selectedDate);
});

ui.searchInput.addEventListener("input",  renderPageList);
ui.newPageBtn.addEventListener("click",   () => createPage().catch(e => setStatus(ui.pageStatus, e.message)));

ui.pageTitle.addEventListener("blur", async () => {
  const page = state.selectedPage;
  if (!page) return;
  const next = ui.pageTitle.value.trim();
  if (!next || next === page.title) { ui.pageTitle.value = page.title || "Untitled"; return; }
  page.title = next;
  ui.crumb.textContent = next;
  scheduleSave();
});

ui.addBlockBtn.addEventListener("click", () => {
  const page = state.selectedPage;
  if (!page) return;
  const last = page.blocks[page.blocks.length - 1];
  insertBlockAfter(last?.id || "", { type: "text", text: "" });
});

ui.deletePageBtn.addEventListener("click", () => deleteCurrentPage().catch(e => setStatus(ui.pageStatus, e.message)));

ui.addTaskForm.addEventListener("submit", async e => {
  e.preventDefault();
  const form  = new FormData(ui.addTaskForm);
  const title = String(form.get("title") || "").trim();
  if (!title) return;
  const submitBtn = ui.addTaskForm.querySelector("button[type='submit']");
  submitBtn.disabled = true;
  setStatus(ui.tasksStatus, "Adding…");
  try {
    const { task } = await api.post("/api/tasks/create", {
      title,
      dueAt:    ui.taskDueAt.value || "",
      priority: ui.taskPriority.value || "medium",
    });
    state.tasks.unshift(task);
    ui.addTaskForm.reset();
    ui.taskPriority.value = "medium";
    renderTasks();
    setStatus(ui.tasksStatus, "");
  } catch (err) {
    setStatus(ui.tasksStatus, err.message);
  } finally {
    submitBtn.disabled = false;
  }
});

ui.refreshTasksBtn.addEventListener("click", () => refreshTasks().catch(e => setStatus(ui.tasksStatus, e.message)));
ui.timerMiniToggle.addEventListener("click", toggleTimer);
ui.timerMiniReset.addEventListener("click", () => {
  state.timer.running = false;
  stopTimerInterval();
  state.timer.remainingSec = state.timer.durationSec;
  ui.timerMiniDisplay.textContent = formatClock(state.timer.remainingSec);
  updateTimerButtons();
});

/* ══════════════════════════════════════════════
   BOOT
══════════════════════════════════════════════ */
async function boot() {
  // Timer
  setTimerMinutes(localStorage.getItem("notionLite.timerMinutes") || "25");
  updateTimerButtons();

  // Calendar events
  state.cal.events = loadCalEvents();

  // Notepad
  initNotepad();

  // Pages
  await refreshPages();
  if (state.pages[0]) await openPage(state.pages[0].id);
  else await createPage();
  setView("pages");
}

boot().catch(e => {
  if (ui.syncStatus) ui.syncStatus.textContent = e.message;
});