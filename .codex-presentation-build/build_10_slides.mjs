import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import JSZip from "jszip";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = "/home/maelmahf/Desktop/coditent";
const buildDir = path.join(workspaceDir, ".codex-presentation-build", "ten-slides");
const finalPath = path.join(workspaceDir, "outputs", "coditent-backend-presentation-exactly-10-slides.pptx");
const skillDir = "/home/maelmahf/.codex/plugins/cache/openai-primary-runtime/presentations/26.1015.12040/skills/presentations";
const pythonExecutable = "/home/maelmahf/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
await fs.mkdir(buildDir, { recursive: true });
await fs.mkdir(path.dirname(finalPath), { recursive: true });

const C = { bg: "#F8F8F3", paper: "#FFFEFA", ink: "#192B23", green: "#194D38", green2: "#356456", soft: "#EDF1E9", muted: "#617369", border: "#CFDBCF", accent: "#A25C38", success: "#15803D", amber: "#9B651B" };
const FONT = "Noto Sans";
const deck = Presentation.create({ slideSize: { width: 1280, height: 720 } });

function box(slide, x, y, w, h, fill = C.paper, line = C.border, lw = 1, rounded = true) {
  const spec = { geometry: rounded ? "roundRect" : "rect", position: { left: x, top: y, width: w, height: h }, fill, line: { style: "solid", fill: line, width: lw } };
  if (rounded) spec.borderRadius = "rounded-xl";
  return slide.shapes.add(spec);
}
function text(slide, value, x, y, w, h, o = {}) {
  const s = slide.shapes.add({ geometry: "textbox", position: { left: x, top: y, width: w, height: h }, fill: "none", line: { style: "solid", fill: "none", width: 0 } });
  s.text = value;
  s.text.style = { typeface: FONT, fontSize: o.size ?? 18, bold: o.bold ?? false, color: o.color ?? C.ink, alignment: o.align ?? "left", verticalAlignment: o.valign ?? "top" };
  return s;
}
function line(slide, x1, y1, x2, y2, color = C.border, width = 2) {
  return slide.shapes.add({ geometry: "line", position: { left: x1, top: y1, width: x2 - x1, height: y2 - y1 }, line: { style: "solid", fill: color, width } });
}
function dot(slide, x, y, size = 12, color = C.green) {
  return slide.shapes.add({ geometry: "ellipse", position: { left: x, top: y, width: size, height: size }, fill: color, line: { style: "solid", fill: color, width: 0 } });
}
function bullet(slide, value, x, y, w, color = C.green, size = 16) {
  dot(slide, x, y + 7, 8, color); text(slide, value, x + 20, y, w - 20, 40, { size });
}
function header(slide, section, title, n, subtitle = "") {
  slide.background.fill = C.bg;
  text(slide, section.toUpperCase(), 64, 28, 520, 22, { size: 11, bold: true, color: C.green });
  text(slide, String(n).padStart(2, "0"), 1172, 28, 44, 22, { size: 11, bold: true, color: C.muted, align: "right" });
  text(slide, title, 64, 56, 1090, 54, { size: 34, bold: true });
  line(slide, 64, 124, 1216, 124, C.border, 1);
  if (subtitle) text(slide, subtitle, 64, 142, 1110, 40, { size: 16, color: C.muted });
  text(slide, "CODITENT  /  BACKEND", 64, 688, 300, 16, { size: 8, bold: true, color: "#7B8D82" });
}
function setNotes(slide, value) { slide.speakerNotes.text = value; slide.speakerNotes.setVisible(true); }
async function bytes(rel) { const b = await fs.readFile(path.join(workspaceDir, rel)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
async function image(slide, rel, type, x, y, w, h, fit = "cover", rounded = true) {
  const spec = { blob: await bytes(rel), contentType: type, alt: path.basename(rel), fit, position: { left: x, top: y, width: w, height: h }, geometry: rounded ? "roundRect" : "rect" };
  if (rounded) spec.borderRadius = "rounded-xl";
  slide.images.add(spec);
}
function numberedFlow(slide, items, y, startX = 74, gap = 202) {
  line(slide, startX + 30, y + 18, startX + 30 + gap * (items.length - 1), y + 18, C.border, 3);
  items.forEach((r, i) => {
    const x = startX + i * gap;
    dot(slide, x + 14, y + 2, 32, i === items.length - 1 ? C.accent : C.green);
    text(slide, String(i + 1), x + 14, y + 6, 32, 20, { size: 11, bold: true, color: C.paper, align: "center" });
    text(slide, r[0], x - 25, y + 52, 112, 28, { size: 16, bold: true, align: "center" });
    text(slide, r[1], x - 48, y + 86, 160, 46, { size: 13, color: C.muted, align: "center" });
  });
}

// 1 — Team handoff
{
  const s = deck.slides.add(); s.background.fill = C.bg;
  await image(s, "design/illustration-atlas/higgsfield-career-network.png", "image/png", 610, 0, 670, 720, "cover", false);
  box(s, 0, 0, 670, 720, C.bg, C.bg, 0, false);
  box(s, 64, 70, 52, 6, C.accent, C.accent, 0);
  text(s, "CODITENT PROJECT PRESENTATION  /  BACKEND SECTION", 64, 88, 520, 24, { size: 11, bold: true, color: C.green });
  text(s, "Now, let’s look\nbehind the interface", 64, 154, 530, 124, { size: 40, bold: true });
  text(s, "My contribution: backend architecture and engineering", 64, 304, 520, 54, { size: 22, bold: true, color: C.green2 });
  text(s, "I built the services that validate requests, protect data, run background work and support real-time chat.", 64, 382, 500, 80, { size: 16, bold: true, color: C.accent });
  text(s, "Mohammed Elmahfoudi", 64, 568, 480, 30, { size: 19, bold: true });
  text(s, "Backend Developer  /  CODITENT Team", 64, 606, 500, 26, { size: 14, color: C.muted });
  setNotes(s, "My teammates have presented the product and their contributions. Now I am going to take you behind the interface and explain what happens in the backend. My name is Mohammed Elmahfoudi, the backend guy on the team. I was responsible for the server-side architecture and implementation.");
}

// 2 — Scope and numbers
{
  const s = deck.slides.add(); header(s, "Scope", "Backend scope in numbers", 2, "The same backend serves candidates, company teams and platform administrators.");
  text(s, "165", 64, 208, 220, 90, { size: 72, bold: true, color: C.green });
  text(s, "application routes", 70, 304, 250, 28, { size: 18, bold: true });
  text(s, "163 HTTP endpoints\n2 WebSocket channels", 70, 340, 240, 62, { size: 16, color: C.muted });
  line(s, 342, 205, 342, 612, C.border, 1);
  const metrics = [["18", "domain routers"], ["29", "database models"], ["46", "schema migrations"], ["53", "test files / 372 test functions"]];
  metrics.forEach((r, i) => { const y = 206 + i * 78; text(s, r[0], 390, y, 80, 42, { size: 34, bold: true, color: i % 2 ? C.accent : C.green2 }); text(s, r[1], 490, y + 7, 300, 30, { size: 17, bold: true }); });
  line(s, 820, 205, 820, 540, C.border, 1);
  const roles = [["Candidates", "Profiles, CVs, applications and recommendations"], ["Company teams", "Offers, candidate review and hiring stages"], ["Admins", "Users, companies, support and audit activity"]];
  roles.forEach((r, i) => { const y = 208 + i * 102; text(s, r[0], 866, y, 270, 28, { size: 19, bold: true, color: i === 1 ? C.accent : C.green }); text(s, r[1], 866, y + 36, 310, 52, { size: 15, color: C.muted }); });
  box(s, 64, 578, 1110, 68, C.soft, C.border, 1);
  text(s, "My responsibility", 86, 593, 190, 24, { size: 14, bold: true, color: C.accent });
  text(s, "Validate requests, enforce access rules, preserve data and coordinate external services.", 276, 590, 860, 36, { size: 17, bold: true });
  setNotes(s, "The backend has 165 routes across 18 routers, supported by 29 database models and 46 migrations. Its 53 test files contain 372 test functions covering security and business workflows. These components serve candidates, company teams and administrators.");
}

// 3 — Architecture + layers
{
  const s = deck.slides.add(); header(s, "Architecture", "Execution paths and code ownership", 3, "FastAPI separates immediate requests, durable background work and real-time delivery.");
  const lanes = [
    ["REQUEST", C.green, [["Browser", "Next.js"], ["Nginx", "TLS + proxy"], ["FastAPI", "Rules"], ["PostgreSQL", "Records"]]],
    ["BACKGROUND", C.accent, [["API", "Create job"], ["Outbox", "Persist"], ["Redis", "Queue"], ["Celery", "Execute"]]],
    ["REAL TIME", C.green2, [["Ticket", "Single use"], ["WebSocket", "Authorize"], ["PostgreSQL", "History"], ["Redis", "Fan-out"]]],
  ];
  lanes.forEach((lane, j) => { const y = 202 + j * 116; text(s, lane[0], 64, y + 25, 120, 20, { size: 11, bold: true, color: lane[1] }); line(s, 190, y + 38, 1150, y + 38, C.border, 2); lane[2].forEach((n, i) => { const x = 214 + i * 238; dot(s, x, y + 30, 16, lane[1]); text(s, n[0], x + 24, y + 5, 180, 26, { size: 17, bold: true }); text(s, n[1], x + 24, y + 36, 180, 24, { size: 13, color: C.muted }); }); });
  text(s, "Code layers", 64, 560, 130, 24, { size: 15, bold: true, color: C.accent });
  const layers = [["Routers", "input"], ["Dependencies", "identity"], ["Services", "decisions"], ["Models", "state"], ["Workers", "slow work"]];
  layers.forEach((r, i) => { const x = 210 + i * 190; text(s, String(i + 1).padStart(2, "0"), x, 554, 50, 20, { size: 10, bold: true, color: i === 2 ? C.accent : C.green }); text(s, r[0], x, 582, 170, 26, { size: 17, bold: true }); text(s, r[1], x, 613, 170, 22, { size: 13, color: C.muted }); });
  setNotes(s, "Normal requests pass through Nginx and FastAPI to PostgreSQL. Background jobs use an outbox, Redis and Celery. WebSockets use short-lived tickets, PostgreSQL history and Redis fan-out. Inside the code, routers receive input, dependencies load identity, services make decisions, models protect state and workers handle slow operations.");
}

// 4 — Request lifecycle
{
  const s = deck.slides.add(); header(s, "API security", "A protected request", 4, "Validation, authentication and authorization happen before business logic.");
  numberedFlow(s, [["Route", "Method + path"], ["Validate", "Pydantic input"], ["Session", "Current user"], ["Access", "Role + scope"], ["Execute", "Transaction"], ["Respond", "Typed output"]], 240, 76, 205);
  box(s, 64, 472, 526, 136, C.paper, C.border, 1);
  text(s, "Cookie mutations", 88, 492, 230, 28, { size: 19, bold: true, color: C.green });
  text(s, "Approved Origin plus matching CSRF cookie and X-CSRF-Token header.", 88, 534, 470, 58, { size: 16 });
  box(s, 628, 472, 546, 136, C.paper, C.border, 1);
  text(s, "Safe failures", 652, 492, 230, 28, { size: 19, bold: true, color: C.accent });
  text(s, "Expected errors remain explicit. Unexpected failures return a safe message and traceable error ID.", 652, 534, 490, 58, { size: 16 });
  setNotes(s, "A request first matches a route and passes Pydantic validation. The backend then resolves the current session and checks role, company, ownership and resource scope. Only then does it run service logic and commit the transaction. Cookie mutations also require CSRF protection.");
}

// 5 — Database + concurrency
{
  const s = deck.slides.add(); header(s, "Database", "Recruitment data and concurrency", 5, "Application is the central record linking the candidate, offer, CV, screening and interviews.");
  box(s, 420, 205, 360, 230, C.soft, C.green, 2);
  text(s, "APPLICATION", 444, 224, 300, 22, { size: 11, bold: true, color: C.green });
  text(s, "candidate_id + opportunity_id", 444, 268, 310, 28, { size: 17, bold: true });
  text(s, "company_id / cv_asset_id", 444, 304, 300, 24, { size: 14, color: C.muted });
  line(s, 444, 344, 752, 344, C.border, 1);
  text(s, "status and stage_version\nAI screening result\ninterview schedule and notes", 444, 364, 300, 66, { size: 14 });
  const links = [["Candidate", "owns profile + CV", 64, 212, C.green], ["Offer", "defines company + role", 64, 352, C.accent], ["Feedback", "review per interviewer", 850, 212, C.green2], ["ChatMessage", "ordered history", 850, 352, C.amber]];
  links.forEach((r) => { box(s, r[2], r[3], 280, 96, C.paper, r[4], 2); text(s, r[0], r[2] + 20, r[3] + 16, 240, 26, { size: 18, bold: true, color: r[4] }); text(s, r[1], r[2] + 20, r[3] + 52, 240, 28, { size: 14, color: C.muted }); line(s, r[2] < 400 ? r[2] + 280 : 780, r[3] + 48, r[2] < 400 ? 420 : r[2], r[3] + 48, C.border, 2); });
  text(s, "Concurrency protection", 64, 500, 250, 28, { size: 19, bold: true, color: C.accent });
  const rules = ["Row locks protect stage transitions", "Version checks reject stale updates", "Unique constraints stop duplicates", "Idempotency makes retries safe"];
  rules.forEach((r, i) => bullet(s, r, 64 + (i % 2) * 560, 544 + Math.floor(i / 2) * 48, 520, i % 2 ? C.accent : C.green2, 16));
  setNotes(s, "The Application model connects one candidate to one offer and preserves the recruitment workflow. The database prevents duplicate applications and verifies CV ownership. Under concurrency, row locks, version checks, unique constraints and idempotency keep state correct.");
}

// 6 — Identity + authorization
{
  const s = deck.slides.add(); header(s, "Identity and access", "Identity, sessions and resource scope", 6, "A token identifies a session. Current user state and resource ownership decide authority.");
  numberedFlow(s, [["Register", "Account data"], ["Verify", "Email OTP"], ["Sign in", "bcrypt"], ["Session", "JWT + cookie"], ["Load user", "Current state"], ["Revoke", "auth_version"]], 220, 76, 205);
  text(s, "Authorization rule", 64, 420, 220, 28, { size: 19, bold: true, color: C.accent });
  box(s, 64, 466, 300, 116, C.paper, C.green, 2);
  text(s, "Role permission", 88, 488, 250, 28, { size: 19, bold: true }); text(s, "Can this type of user perform the action?", 88, 528, 250, 40, { size: 15, color: C.muted });
  text(s, "+", 385, 493, 50, 48, { size: 38, bold: true, color: C.accent, align: "center" });
  box(s, 452, 466, 300, 116, C.paper, C.green2, 2);
  text(s, "Resource scope", 476, 488, 250, 28, { size: 19, bold: true }); text(s, "Does the record belong to this user or company?", 476, 528, 250, 40, { size: 15, color: C.muted });
  text(s, "=", 774, 493, 50, 48, { size: 38, bold: true, color: C.accent, align: "center" });
  box(s, 840, 466, 340, 116, C.soft, C.accent, 2);
  text(s, "Authorized action", 864, 488, 290, 28, { size: 19, bold: true, color: C.accent }); text(s, "Otherwise return a safe 403 or 404 response.", 864, 528, 290, 40, { size: 15 });
  box(s, 64, 608, 1116, 44, C.soft, C.border, 1); text(s, "2FA challenges are short-lived and single use. Redis rejects revoked sessions quickly; PostgreSQL remains the durable source of truth.", 84, 617, 1074, 24, { size: 14, bold: true, color: C.green });
  setNotes(s, "Registration uses email verification and login uses bcrypt. Sessions use JWTs and secure cookies, but every protected request still loads current user state. Authorization combines role permission with tenant or ownership scope. Two-factor challenges are single-use and sessions remain revocable.");
}

// 7 — Workflow
{
  const s = deck.slides.add(); header(s, "Business rules", "Application workflow", 7, "The backend guards every recruitment stage and records the history.");
  await image(s, "apps/web/public/images/candidate/career-journey.png", "image/png", 64, 194, 1152, 220, "cover", true);
  numberedFlow(s, [["Discover", "Offer search"], ["Apply", "Profile + CV"], ["Screen", "AI job"], ["Review", "Company member"], ["Interview", "Feedback"], ["Decision", "Final state"]], 454, 74, 204);
  text(s, "Before commit: current stage + requested stage + caller permission + application scope", 160, 624, 960, 30, { size: 18, bold: true, color: C.accent, align: "center" });
  setNotes(s, "A candidate discovers an offer and applies with a valid profile and CV. The backend creates AI screening work, allows company review, manages interview feedback and controls the final decision. Every transition checks the current stage, requested stage, caller permission and application scope.");
}

// 8 — Background work + email
{
  const s = deck.slides.add(); header(s, "Background processing", "Durable AI jobs and email delivery", 8, "Slow external services run outside the HTTP request and remain safe to retry.");
  text(s, "AI PROCESSING", 64, 202, 180, 22, { size: 11, bold: true, color: C.green });
  numberedFlow(s, [["API", "Create job"], ["Outbox", "Persist"], ["Dispatch", "Claim"], ["Redis", "Queue"], ["Celery", "Gemini"], ["Database", "Result"]], 242, 74, 204);
  line(s, 64, 414, 1174, 414, C.border, 1);
  text(s, "EMAIL DELIVERY", 64, 446, 180, 22, { size: 11, bold: true, color: C.accent });
  const mail = [["Domain event", "Invitation or recovery"], ["EmailDelivery", "Encrypted + deduped"], ["Worker claim", "SKIP LOCKED"], ["Resend", "Idempotency key"], ["Outcome", "Sent or retry"]];
  mail.forEach((r, i) => { const x = 64 + i * 225; text(s, String(i + 1).padStart(2, "0"), x, 490, 32, 20, { size: 10, bold: true, color: i === 3 ? C.accent : C.green }); text(s, r[0], x, 520, 194, 28, { size: 17, bold: true }); text(s, r[1], x, 556, 194, 40, { size: 14, color: C.muted }); if (i < 4) line(s, x + 174, 534, x + 210, 534, C.border, 2); });
  box(s, 64, 618, 1110, 40, C.soft, C.border, 1); text(s, "PostgreSQL preserves pending work. Bounded retry, leases and idempotency prevent loss and duplicate effects.", 84, 627, 1070, 24, { size: 14, bold: true, color: C.green });
  setNotes(s, "AI work first becomes a durable database job, then a dispatcher and Celery worker process it through Redis. Email uses the same outbox idea with encrypted payloads, deduplication and provider idempotency. Both workflows survive restarts and temporary provider failures.");
}

// 9 — Communication + privacy + production
{
  const s = deck.slides.add(); header(s, "Communication and operations", "WebSockets, private files and deployment", 9, "Three production boundaries protect live communication, sensitive assets and infrastructure.");
  const cols = [
    [64, "Two WebSocket channels", C.green, ["Recruitment chat scoped to an application", "Friend chat requires accepted friendship", "Single-use ticket before connection", "PostgreSQL history + Redis fan-out"]],
    [448, "Private files", C.accent, ["Validate file type, size and owner", "Store CVs in private Supabase buckets", "Authorize every download through the API", "Export and seven-day deletion window"]],
    [832, "Production boundary", C.green2, ["Nginx is the only public entry point", "API, database, Redis and workers stay private", "Liveness and readiness endpoints", "Logs, metrics and startup checks"]],
  ];
  cols.forEach((c, j) => { text(s, c[1], c[0], 212, 330, 32, { size: 20, bold: true, color: c[2] }); line(s, c[0], 258, c[0] + 320, 258, c[2], 3); c[3].forEach((v, i) => bullet(s, v, c[0], 286 + i * 68, 326, i % 2 ? C.accent : C.green2, 15)); });
  box(s, 64, 590, 1098, 64, C.soft, C.border, 1);
  text(s, "Security stays current", 86, 608, 210, 24, { size: 15, bold: true, color: C.accent });
  text(s, "WebSocket access, file downloads and internal services all rely on server-side authorization rather than client trust.", 300, 604, 836, 36, { size: 16, bold: true });
  setNotes(s, "The recruitment and friend WebSockets both use short-lived tickets and durable PostgreSQL history. CVs stay in private storage and every download passes through authorization. In production, Nginx is the only public entry point while data stores and workers remain private.");
}

// 10 — Evidence + conclusion
{
  const s = deck.slides.add(); header(s, "Evidence and conclusion", "Testing, lessons and next steps", 10, "The backend combines automated evidence with one connected workflow for the live demonstration.");
  text(s, "53", 64, 208, 120, 64, { size: 52, bold: true, color: C.green });
  text(s, "test files", 64, 276, 180, 26, { size: 18, bold: true });
  text(s, "372", 250, 208, 140, 64, { size: 52, bold: true, color: C.accent });
  text(s, "test functions", 250, 276, 180, 26, { size: 18, bold: true });
  text(s, "Coverage", 64, 332, 180, 26, { size: 18, bold: true, color: C.green });
  ["Authentication and tenant isolation", "Database integrity and concurrency", "Applications, jobs, WebSockets and health"].forEach((v, i) => bullet(s, v, 64, 370 + i * 46, 480, i === 1 ? C.accent : C.green2, 15));
  line(s, 590, 205, 590, 620, C.border, 1);
  text(s, "What I learned", 638, 208, 250, 28, { size: 20, bold: true, color: C.green });
  const lessons = [["Current state controls authority", "Tokens do not replace role and scope checks"], ["Database rules support security", "Transactions and constraints protect workflows"], ["Slow work needs durability", "Outboxes and workers survive restarts"]];
  lessons.forEach((r, i) => { const y = 250 + i * 88; text(s, r[0], 638, y, 440, 26, { size: 17, bold: true, color: i === 2 ? C.accent : C.green2 }); text(s, r[1], 638, y + 32, 440, 38, { size: 14, color: C.muted }); });
  text(s, "Next: load testing, distributed tracing, job dashboards and query profiling", 638, 526, 430, 52, { size: 16, bold: true, color: C.accent });
  text(s, "Questions?", 638, 592, 250, 42, { size: 30, bold: true, color: C.green });
  await image(s, "apps/web/public/images/system/404-cat-static.svg", "image/svg+xml", 1018, 510, 150, 136, "contain", false);
  setNotes(s, "The repository contains 53 test files and 372 test functions covering the main security and workflow risks. My main lessons were that current state controls authority, database rules support security and slow work needs durability. My next improvements are load testing, distributed tracing, job dashboards and query profiling. Thank you, and I am ready for your questions.");
}

// Render for review.
for (const [i, slide] of deck.slides.items.entries()) {
  const png = await deck.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(path.join(buildDir, `slide-${String(i + 1).padStart(2, "0")}.png`), new Uint8Array(await png.arrayBuffer()));
}
const montage = await deck.export({ format: "webp", montage: true });
await fs.writeFile(path.join(buildDir, "montage.webp"), new Uint8Array(await montage.arrayBuffer()));

const candidatePath = path.join(buildDir, "candidate-with-transitions.pptx");
const rawPath = path.join(buildDir, "candidate-raw.pptx");
await (await PresentationFile.exportPptx(deck)).save(rawPath);

// Native click-controlled Fade transition on all slides.
const zip = await JSZip.loadAsync(await fs.readFile(rawPath));
const slideNames = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
const transition = '<p:transition spd="med" advClick="1"><p:fade/></p:transition>';
for (const name of slideNames) {
  let xml = await zip.file(name).async("string");
  if (xml.includes("<p:timing")) xml = xml.replace("<p:timing", `${transition}<p:timing`);
  else if (xml.includes("<p:extLst")) xml = xml.replace("<p:extLst", `${transition}<p:extLst`);
  else xml = xml.replace("</p:sld>", `${transition}</p:sld>`);
  zip.file(name, xml);
}
await fs.writeFile(candidatePath, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } }));

const { finalizePresentation } = await import(pathToFileURL(path.join(skillDir, "container_tools", "artifact_tool_utils.mjs")).href);
const result = await finalizePresentation({
  workspaceDir,
  candidatePath,
  finalPath,
  explicitTotalSlideCount: 10,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [],
  pythonExecutable,
  integrityValidatorPath: path.join(skillDir, "container_tools", "inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(skillDir, "container_tools", "inspect_presentation_layout_geometry.py"),
  layoutArgs: ["--expected-slide-size-emu", "12192000,6858000", "--validate-heading-fit"],
  fontPolicy: { basis: "design", families: [FONT] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(buildDir, "validation-exactly-10.json"),
});
console.log(JSON.stringify({ finalPath, slides: deck.slides.items.length, transitions: slideNames.length, result }, null, 2));
