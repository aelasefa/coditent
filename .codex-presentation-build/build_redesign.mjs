import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = "/home/maelmahf/Desktop/coditent";
const buildDir = path.join(workspaceDir, ".codex-presentation-build", "redesign");
const finalPath = path.join(workspaceDir, "outputs", "coditent-backend-presentation-team-handoff.pptx");
const skillDir = "/home/maelmahf/.codex/plugins/cache/openai-primary-runtime/presentations/26.1015.12040/skills/presentations";
const pythonExecutable = "/home/maelmahf/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";

await fs.mkdir(buildDir, { recursive: true });
await fs.mkdir(path.dirname(finalPath), { recursive: true });

const C = {
  bg: "#F8F8F3",
  paper: "#FFFEFA",
  ink: "#192B23",
  green: "#194D38",
  green2: "#356456",
  soft: "#EDF1E9",
  hover: "#E4EBE0",
  muted: "#617369",
  border: "#CFDBCF",
  accent: "#A25C38",
  amber: "#9B651B",
  success: "#15803D",
  danger: "#B34538",
  blue: "#1D4ED8",
};
const FONT = "Noto Sans";

const deck = Presentation.create({ slideSize: { width: 1280, height: 720 } });

function addBox(slide, x, y, w, h, fill = C.paper, line = C.border, radius = "rounded-xl", lineWidth = 1) {
  const spec = {
    geometry: radius === "none" ? "rect" : "roundRect",
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: "solid", fill: line, width: lineWidth },
  };
  if (radius !== "none") spec.borderRadius = radius;
  return slide.shapes.add(spec);
}

function addText(slide, text, x, y, w, h, opts = {}) {
  const s = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  s.text = text;
  s.text.style = {
    typeface: FONT,
    fontSize: opts.size ?? 18,
    bold: opts.bold ?? false,
    color: opts.color ?? C.ink,
    alignment: opts.align ?? "left",
    verticalAlignment: opts.valign ?? "top",
  };
  return s;
}

function addLine(slide, x1, y1, x2, y2, color = C.border, width = 2) {
  return slide.shapes.add({
    geometry: "line",
    position: { left: x1, top: y1, width: x2 - x1, height: y2 - y1 },
    line: { style: "solid", fill: color, width },
  });
}

function addDot(slide, x, y, size = 12, color = C.green) {
  return slide.shapes.add({
    geometry: "ellipse",
    position: { left: x, top: y, width: size, height: size },
    fill: color,
    line: { style: "solid", fill: color, width: 0 },
  });
}

function addBullet(slide, text, x, y, w, color = C.green, size = 17) {
  addDot(slide, x, y + 7, 8, color);
  addText(slide, text, x + 20, y, w - 20, 40, { size, color: C.ink });
}

function addHeader(slide, section, title, number, subtitle = "") {
  slide.background.fill = C.bg;
  addText(slide, section.toUpperCase(), 64, 28, 520, 24, { size: 11, bold: true, color: C.green });
  addText(slide, String(number).padStart(2, "0"), 1170, 28, 46, 24, { size: 11, bold: true, color: C.muted, align: "right" });
  addText(slide, title, 64, 56, 1080, 52, { size: 34, bold: true, color: C.ink });
  addLine(slide, 64, 124, 1216, 124, C.border, 1);
  if (subtitle) addText(slide, subtitle, 64, 140, 1110, 42, { size: 16, color: C.muted });
  addText(slide, "CODITENT  /  BACKEND", 64, 688, 280, 16, { size: 8, bold: true, color: "#7B8D82" });
}

function addStage(slide, x, y, w, n, title, body, color = C.green) {
  addText(slide, String(n).padStart(2, "0"), x, y, 40, 24, { size: 12, bold: true, color });
  addText(slide, title, x, y + 28, w, 30, { size: 18, bold: true });
  addText(slide, body, x, y + 62, w, 60, { size: 14, color: C.muted });
}

async function imageBytes(rel) {
  const b = await fs.readFile(path.join(workspaceDir, rel));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

async function addImage(slide, rel, contentType, x, y, w, h, fit = "cover", radius = "rounded-xl") {
  const spec = {
    blob: await imageBytes(rel),
    contentType,
    alt: path.basename(rel),
    fit,
    position: { left: x, top: y, width: w, height: h },
    geometry: radius === "none" ? "rect" : "roundRect",
  };
  if (radius !== "none") spec.borderRadius = radius;
  slide.images.add(spec);
}

function notes(slide, text) {
  slide.speakerNotes.text = text;
  slide.speakerNotes.setVisible(true);
}

// 1 — Cover
{
  const s = deck.slides.add();
  s.background.fill = C.bg;
  await addImage(s, "design/illustration-atlas/higgsfield-career-network.png", "image/png", 610, 0, 670, 720, "cover", "none");
  addBox(s, 0, 0, 670, 720, C.bg, C.bg, "none", 0);
  addBox(s, 64, 70, 52, 6, C.accent, C.accent, "rounded-xl", 0);
  addText(s, "CODITENT PROJECT PRESENTATION  /  BACKEND SECTION", 64, 88, 520, 24, { size: 11, bold: true, color: C.green });
  addText(s, "Now, let’s look\nbehind the interface", 64, 154, 530, 124, { size: 40, bold: true, color: C.ink });
  addText(s, "My contribution: backend architecture and engineering", 64, 304, 520, 54, { size: 22, bold: true, color: C.green2 });
  addText(s, "I built the services that validate requests, protect data, run background work and support real-time chat.", 64, 382, 500, 80, { size: 16, color: C.accent, bold: true });
  addText(s, "Presented by [Your Name]", 64, 568, 480, 30, { size: 19, bold: true });
  addText(s, "Backend Developer  /  CODITENT Team", 64, 606, 500, 26, { size: 14, color: C.muted });
  notes(s, "After my teammates have shown you the product and their parts, I will take you behind the interface and explain the backend. I was responsible for the server-side architecture and implementation. I will show how the backend validates requests, controls permissions, stores data, processes background jobs and powers real-time chat.");
}

// 2 — Snapshot
{
  const s = deck.slides.add(); addHeader(s, "Repository snapshot", "Backend at a glance", 2, "Current counts taken from the submitted repository.");
  addText(s, "165", 64, 208, 240, 108, { size: 78, bold: true, color: C.green });
  addText(s, "application routes", 70, 314, 260, 30, { size: 19, bold: true });
  addText(s, "163 HTTP endpoints\n2 WebSocket channels", 70, 350, 270, 66, { size: 17, color: C.muted });
  addLine(s, 352, 205, 352, 610, C.border, 1);
  const rows = [
    ["18", "domain routers", "Authentication, offers, applications, chat and administration"],
    ["29", "database models", "Identity, recruitment, communication and operational state"],
    ["46", "schema migrations", "Every database change has an ordered history"],
    ["53", "test files", "372 test functions cover security and business workflows"],
  ];
  rows.forEach((r, i) => {
    const y = 202 + i * 104;
    addText(s, r[0], 400, y, 92, 52, { size: 38, bold: true, color: i % 2 ? C.accent : C.green2 });
    addText(s, r[1], 510, y + 2, 250, 28, { size: 18, bold: true });
    addText(s, r[2], 510, y + 34, 620, 44, { size: 15, color: C.muted });
    if (i < rows.length - 1) addLine(s, 400, y + 88, 1170, y + 88, C.border, 1);
  });
  addBox(s, 64, 606, 1106, 48, C.soft, C.border, "rounded-xl", 1);
  addText(s, "Runtime: API, worker, AI dispatcher, Redis, web client and reverse proxy", 84, 617, 1060, 26, { size: 15, color: C.green, bold: true });
  notes(s, "Use the numbers as evidence of scope. The important distinction is 163 normal HTTP endpoints plus two WebSocket endpoints, which gives 165 application routes in total. Mention that FastAPI documentation routes are not included.");
}

// 3 — Scope
{
  const s = deck.slides.add(); addHeader(s, "Project scope", "One backend, three user groups", 3, "The API changes its data and permissions according to the authenticated role.");
  await addImage(s, "apps/web/public/images/landing/career-network.png", "image/png", 690, 185, 490, 360, "cover", "rounded-xl");
  const roles = [
    ["Candidates", "Profiles and CVs, offer discovery, applications, recommendations, interview progress and chat", C.green],
    ["Company teams", "Offer management, candidate review, hiring stages, feedback, invitations and recruiter chat", C.accent],
    ["Platform admins", "User approvals, companies, support, institutions, missions, subscriptions and audit activity", C.green2],
  ];
  roles.forEach((r, i) => {
    const y = 192 + i * 126;
    addText(s, r[0], 64, y, 250, 28, { size: 20, bold: true, color: r[2] });
    addText(s, r[1], 64, y + 35, 550, 70, { size: 16, color: C.ink });
    if (i < 2) addLine(s, 64, y + 112, 620, y + 112, C.border, 1);
  });
  addText(s, "My responsibility", 64, 580, 220, 24, { size: 15, bold: true, color: C.accent });
  addText(s, "Validate requests, enforce access rules, store durable state and coordinate external services.", 64, 611, 1080, 38, { size: 20, bold: true });
  notes(s, "Start with the product rather than the technology. Explain who uses the platform and then define your own backend responsibility. Emphasize that the frontend requests an action while the backend decides whether it is valid and permitted.");
}

// 4 — Architecture
{
  const s = deck.slides.add(); addHeader(s, "System design", "Three execution paths", 4, "FastAPI handles immediate requests, durable jobs and live communication differently.");
  const lanes = [
    { y: 205, label: "REQUEST", color: C.green, nodes: [["Browser", "Next.js"], ["Nginx", "TLS + proxy"], ["FastAPI", "Rules + transactions"], ["PostgreSQL", "Durable records"]] },
    { y: 348, label: "BACKGROUND", color: C.accent, nodes: [["API", "Create job"], ["Outbox", "Dedupe + retry"], ["Redis", "Broker"], ["Celery", "AI + email"]] },
    { y: 491, label: "REAL TIME", color: C.green2, nodes: [["Ticket", "Single use"], ["WebSocket", "Access check"], ["PostgreSQL", "Message history"], ["Redis", "Presence + fan-out"]] },
  ];
  lanes.forEach((lane) => {
    addText(s, lane.label, 64, lane.y + 24, 120, 24, { size: 11, bold: true, color: lane.color });
    addLine(s, 186, lane.y + 42, 1135, lane.y + 42, C.border, 2);
    lane.nodes.forEach((n, i) => {
      const x = 205 + i * 245;
      addDot(s, x, lane.y + 34, 16, lane.color);
      addText(s, n[0], x + 26, lane.y + 7, 190, 28, { size: 18, bold: true });
      addText(s, n[1], x + 26, lane.y + 39, 190, 32, { size: 14, color: C.muted });
    });
  });
  addBox(s, 64, 620, 1110, 42, C.soft, C.border, "rounded-xl", 1);
  addText(s, "PostgreSQL owns durable state. Redis coordinates temporary work and delivery between processes.", 84, 629, 1070, 25, { size: 15, bold: true, color: C.green });
  notes(s, "Explain each path separately. Normal requests finish quickly and commit durable state. Long AI or email tasks become outbox jobs before workers process them. WebSockets use short-lived tickets, store messages in PostgreSQL and use Redis for presence and cross-process delivery.");
}

// 5 — Maintainability
{
  const s = deck.slides.add(); addHeader(s, "Maintainability", "Clear ownership between code layers", 5, "Each layer answers a different question, which keeps large features easier to change and test.");
  const layers = [
    ["Routers", "How does the request enter?", "HTTP, WebSocket and response schemas", C.green],
    ["Dependencies", "Who is calling?", "User, session, company context and shared guards", C.green2],
    ["Services", "May this business action happen?", "Permissions, workflow transitions and domain rules", C.accent],
    ["Models", "What state must remain valid?", "Relationships, constraints and transactions", C.success],
    ["Workers", "What can finish later?", "AI, email and durable scheduled work", C.amber],
  ];
  layers.forEach((l, i) => {
    const y = 198 + i * 78;
    addText(s, String(i + 1).padStart(2, "0"), 64, y + 3, 44, 24, { size: 12, bold: true, color: l[3] });
    addText(s, l[0], 118, y, 180, 28, { size: 20, bold: true });
    addText(s, l[1], 320, y, 360, 28, { size: 17, bold: true, color: l[3] });
    addText(s, l[2], 710, y, 460, 36, { size: 15, color: C.muted });
    if (i < 4) addLine(s, 118, y + 53, 1170, y + 53, C.border, 1);
  });
  addBox(s, 64, 600, 1110, 62, C.paper, C.accent, "rounded-xl", 2);
  addText(s, "Example", 84, 617, 90, 24, { size: 13, bold: true, color: C.accent });
  addText(s, "Changing an application stage loads context, checks the transition, locks the row, writes the update and queues notifications in one transaction.", 178, 612, 970, 40, { size: 16, bold: true });
  notes(s, "Walk through the five layers from top to bottom. Then use the application-stage example. Routers coordinate the call, services make the business decision, and database constraints remain the final safety net.");
}

// 6 — Choices
{
  const s = deck.slides.add(); addHeader(s, "Engineering decisions", "Technology choices and their cost", 6, "Every dependency solves a specific backend problem and adds an operational responsibility.");
  addText(s, "CHOICE", 64, 192, 210, 24, { size: 11, bold: true, color: C.muted });
  addText(s, "WHY IT FITS", 300, 192, 470, 24, { size: 11, bold: true, color: C.muted });
  addText(s, "COST TO MANAGE", 820, 192, 350, 24, { size: 11, bold: true, color: C.muted });
  const tech = [
    ["FastAPI", "Async endpoints, validation, dependency injection and OpenAPI", "Careful async boundaries and dependency design"],
    ["PostgreSQL", "Transactions and relational integrity fit recruitment workflows", "Indexes, migrations and lock behavior"],
    ["Redis + Celery", "AI and email leave the request path without losing work", "Retries, monitoring and worker capacity"],
    ["Supabase storage", "Private CV and image objects stay outside the database", "Access policies and cleanup lifecycle"],
    ["Docker + Ansible", "Repeatable environments and controlled deployment", "Configuration and secret management"],
  ];
  tech.forEach((r, i) => {
    const y = 230 + i * 74;
    if (i % 2 === 0) addBox(s, 52, y - 8, 1130, 62, C.soft, C.soft, "rounded-xl", 0);
    addText(s, r[0], 64, y, 210, 30, { size: 18, bold: true, color: i === 2 ? C.accent : C.green });
    addText(s, r[1], 300, y, 470, 44, { size: 15 });
    addText(s, r[2], 820, y, 340, 44, { size: 15, color: C.muted });
  });
  addText(s, "The architecture gained reliability, but deployment and failure handling became part of the backend job.", 64, 622, 1100, 34, { size: 19, bold: true, color: C.accent });
  notes(s, "Avoid listing technologies without reasons. For each row, say what problem it solves and what responsibility it introduces. This shows engineering judgment rather than simply naming a stack.");
}

// 7 — Request lifecycle
{
  const s = deck.slides.add(); addHeader(s, "Request lifecycle", "A protected API request", 7, "The same boundary protects all sensitive HTTP endpoints.");
  addLine(s, 92, 292, 1178, 292, C.border, 3);
  const steps = [
    ["Route", "Match method\nand path"], ["Validate", "Parse body, query\nand path data"], ["Authenticate", "Resolve session\nand current user"],
    ["Authorize", "Check role, tenant\nand ownership"], ["Execute", "Run service logic\nand transaction"], ["Respond", "Typed result\nor safe error"],
  ];
  steps.forEach((st, i) => {
    const x = 80 + i * 205;
    addDot(s, x + 34, 276, 32, i === 3 ? C.accent : C.green);
    addText(s, String(i + 1), x + 34, 280, 32, 22, { size: 12, bold: true, color: C.paper, align: "center" });
    addText(s, st[0], x - 14, 328, 164, 28, { size: 17, bold: true, align: "center" });
    addText(s, st[1], x - 12, 362, 160, 60, { size: 14, color: C.muted, align: "center" });
  });
  addBox(s, 64, 482, 526, 126, C.paper, C.border, "rounded-xl", 1);
  addText(s, "Cookie mutations", 86, 500, 230, 26, { size: 18, bold: true, color: C.green });
  addText(s, "Approved Origin plus matching CSRF cookie and X-CSRF-Token header.", 86, 536, 470, 58, { size: 16 });
  addBox(s, 628, 482, 546, 126, C.paper, C.border, "rounded-xl", 1);
  addText(s, "Failure behavior", 650, 500, 230, 26, { size: 18, bold: true, color: C.accent });
  addText(s, "Expected errors stay explicit. Unexpected failures return a safe message and traceable error ID.", 650, 536, 490, 58, { size: 16 });
  notes(s, "Use a real endpoint during the explanation. The request does not jump directly from the router to the database. Validation, authentication and authorization happen before business logic. Mention CSRF protection for cookie-based mutations and safe error responses.");
}

// 8 — Database design
{
  const s = deck.slides.add(); addHeader(s, "Database design", "Application as the recruitment record", 8, "One application links the candidate, offer, CV snapshot, workflow history, AI screening and interviews.");
  addBox(s, 470, 232, 340, 250, C.soft, C.green, "rounded-xl", 2);
  addText(s, "APPLICATION", 494, 250, 290, 24, { size: 12, bold: true, color: C.green });
  addText(s, "candidate_id  +  opportunity_id", 494, 292, 290, 28, { size: 16, bold: true });
  addText(s, "company_id  /  cv_asset_id", 494, 326, 290, 26, { size: 15, color: C.muted });
  addLine(s, 494, 366, 780, 366, C.border, 1);
  addText(s, "status  /  stage_version\nAI status, score and report\ninterview schedule and notes", 494, 384, 290, 82, { size: 15 });
  const linked = [
    ["Candidate", "Owns profile and CV", 94, 218, C.green],
    ["Offer", "Defines company and role", 94, 414, C.accent],
    ["InterviewFeedback", "One review per reviewer", 886, 218, C.green2],
    ["ChatMessage", "Ordered conversation history", 886, 414, C.amber],
  ];
  linked.forEach((r) => {
    addBox(s, r[2], r[3], 280, 112, C.paper, r[4], "rounded-xl", 2);
    addText(s, r[0], r[2] + 20, r[3] + 18, 240, 28, { size: 18, bold: true, color: r[4] });
    addText(s, r[1], r[2] + 20, r[3] + 56, 240, 38, { size: 14, color: C.muted });
    const fromX = r[2] < 400 ? r[2] + 280 : 810;
    const toX = r[2] < 400 ? 470 : r[2];
    addLine(s, fromX, r[3] + 56, toX, r[3] + 56, C.border, 2);
  });
  addBox(s, 94, 566, 1072, 78, C.paper, C.border, "rounded-xl", 1);
  addText(s, "Database guarantees", 116, 584, 190, 24, { size: 15, bold: true, color: C.accent });
  addText(s, "No duplicate application  /  valid status  /  AI score from 0 to 100  /  CV must belong to the candidate", 316, 579, 820, 45, { size: 16, bold: true });
  notes(s, "Center the explanation on the Application model. It preserves the state of one candidate applying to one offer. Explain the relationships and then the database guarantees, especially the unique candidate-offer pair and CV ownership constraint.");
}

// 9 — Concurrency
{
  const s = deck.slides.add(); addHeader(s, "Data correctness", "Safe updates under concurrency", 9, "Two users or workers can act at the same time, so correctness cannot depend on request order.");
  addText(s, "Example: two recruiters change the same application", 64, 202, 650, 30, { size: 20, bold: true });
  addLine(s, 130, 304, 1140, 304, C.border, 3);
  const ev = [
    ["1", "Lock row", "SELECT FOR UPDATE"],
    ["2", "Read version", "Reject stale state"],
    ["3", "Validate move", "Only allowed transition"],
    ["4", "Write together", "Stage + audit + notification"],
    ["5", "Commit once", "One visible result"],
  ];
  ev.forEach((r, i) => {
    const x = 90 + i * 245;
    addDot(s, x + 42, 287, 34, i === 1 ? C.accent : C.green);
    addText(s, r[0], x + 42, 291, 34, 22, { size: 12, bold: true, color: C.paper, align: "center" });
    addText(s, r[1], x - 12, 338, 174, 46, { size: 17, bold: true, align: "center" });
    addText(s, r[2], x - 20, 390, 190, 42, { size: 14, color: C.muted, align: "center" });
  });
  addText(s, "Durable rules", 64, 478, 180, 28, { size: 19, bold: true, color: C.green });
  addBullet(s, "Foreign keys reject broken relationships", 64, 520, 500, C.green2, 16);
  addBullet(s, "Unique constraints block duplicate work", 64, 562, 500, C.accent, 16);
  addText(s, "Worker rules", 670, 478, 180, 28, { size: 19, bold: true, color: C.accent });
  addBullet(s, "SKIP LOCKED lets workers claim different rows", 670, 520, 500, C.green2, 16);
  addBullet(s, "Idempotency makes repeated delivery harmless", 670, 562, 500, C.accent, 16);
  notes(s, "Describe the race condition first. Then walk through the lock, version check and atomic commit. Explain that constraints and idempotency still protect the system if the same command arrives twice.");
}

// 10 — Identity
{
  const s = deck.slides.add(); addHeader(s, "Identity", "Session authority changes with account state", 10, "A valid token identifies a session, while current database state decides what that session may still do.");
  const y = 240;
  addLine(s, 110, y + 40, 1160, y + 40, C.border, 3);
  const chain = [
    ["Register", "Validated account"], ["Verify email", "One-time code"], ["Sign in", "bcrypt password"],
    ["Issue session", "JWT + secure cookie"], ["Load user", "Current role and status"], ["Revoke", "auth_version changes"],
  ];
  chain.forEach((r, i) => {
    const x = 82 + i * 205;
    addDot(s, x + 34, y + 24, 32, i === 5 ? C.accent : C.green);
    addText(s, String(i + 1), x + 34, y + 28, 32, 22, { size: 12, bold: true, color: C.paper, align: "center" });
    addText(s, r[0], x - 28, y + 78, 156, 28, { size: 16, bold: true, align: "center" });
    addText(s, r[1], x - 30, y + 112, 160, 44, { size: 14, color: C.muted, align: "center" });
  });
  addBox(s, 64, 476, 1110, 148, C.soft, C.border, "rounded-xl", 1);
  addText(s, "Revocation model", 88, 498, 210, 28, { size: 19, bold: true, color: C.green });
  addText(s, "JWT contains session_id and auth_version. Redis rejects revoked sessions quickly. PostgreSQL remains the durable source of truth.", 88, 536, 760, 66, { size: 17 });
  addText(s, "2FA", 892, 498, 80, 28, { size: 19, bold: true, color: C.accent });
  addText(s, "Short-lived challenges are consumed atomically to prevent replay.", 892, 536, 244, 66, { size: 16 });
  notes(s, "Explain why token validity alone is insufficient. A user may become inactive, lose a role or change a password after the token was created. auth_version and session revocation remove old authority. Mention that two-factor challenges are single use.");
}

// 11 — Access control
{
  const s = deck.slides.add(); addHeader(s, "Access control", "Permission plus resource scope", 11, "Every protected action combines a role capability with ownership or tenant boundaries.");
  addText(s, "ROLE PERMISSION", 90, 218, 260, 24, { size: 13, bold: true, color: C.green });
  addText(s, "+", 382, 242, 60, 60, { size: 44, bold: true, color: C.accent, align: "center" });
  addText(s, "RESOURCE SCOPE", 478, 218, 260, 24, { size: 13, bold: true, color: C.green });
  addText(s, "=", 770, 242, 60, 60, { size: 44, bold: true, color: C.accent, align: "center" });
  addText(s, "AUTHORIZED ACTION", 866, 218, 300, 24, { size: 13, bold: true, color: C.green });
  addBox(s, 64, 252, 300, 126, C.paper, C.green, "rounded-xl", 2);
  addText(s, "Recruiter can review", 86, 276, 256, 30, { size: 20, bold: true });
  addText(s, "Role grants application review and chat", 86, 316, 256, 46, { size: 15, color: C.muted });
  addBox(s, 452, 252, 300, 126, C.paper, C.green2, "rounded-xl", 2);
  addText(s, "Same company", 474, 276, 256, 30, { size: 20, bold: true });
  addText(s, "Application and offer belong to the recruiter tenant", 474, 316, 256, 46, { size: 15, color: C.muted });
  addBox(s, 840, 252, 340, 126, C.soft, C.accent, "rounded-xl", 2);
  addText(s, "Access allowed", 862, 276, 296, 30, { size: 20, bold: true, color: C.accent });
  addText(s, "Otherwise the API returns a safe 403 or 404 response", 862, 316, 296, 46, { size: 15 });
  addText(s, "Company roles", 64, 442, 190, 28, { size: 19, bold: true, color: C.green });
  const roles = [["OWNER", "organization + subscription"], ["ADMIN", "team + operations"], ["HR", "offers + interviews"], ["RECRUITER", "applications + chat"], ["HIRING MANAGER", "feedback + stages"]];
  roles.forEach((r, i) => {
    const y2 = 486 + i * 33;
    addText(s, r[0], 64, y2, 210, 24, { size: 13, bold: true, color: i === 3 ? C.accent : C.green2 });
    addText(s, r[1], 280, y2, 300, 24, { size: 14, color: C.muted });
  });
  addText(s, "Candidate boundary", 670, 442, 220, 28, { size: 19, bold: true, color: C.accent });
  addText(s, "Candidates access only their own profile, CV, applications, recommendation analysis and allowed conversations.", 670, 486, 500, 78, { size: 18, bold: true });
  addText(s, "Foreign resources never reveal private existence.", 670, 582, 500, 34, { size: 16, color: C.muted });
  notes(s, "Use the equation on the slide. A recruiter role may permit application review, but the resource must also belong to the same company. For candidates, ownership provides the main scope boundary.");
}

// 12 — Workflow
{
  const s = deck.slides.add(); addHeader(s, "Business rules", "Application workflow", 12, "The backend controls every stage change and keeps an auditable recruitment history.");
  await addImage(s, "apps/web/public/images/candidate/career-journey.png", "image/png", 64, 194, 1152, 210, "cover", "rounded-xl");
  const stages = [["DISCOVER", "Offer search"], ["APPLY", "Profile + CV"], ["SCREEN", "Durable AI job"], ["REVIEW", "Company member"], ["INTERVIEW", "Schedule + feedback"], ["DECISION", "Final transition"]];
  addLine(s, 94, 478, 1170, 478, C.border, 3);
  stages.forEach((r, i) => {
    const x = 72 + i * 202;
    addDot(s, x + 35, 462, 32, i === 5 ? C.accent : C.green);
    addText(s, String(i + 1), x + 35, 466, 32, 22, { size: 12, bold: true, color: C.paper, align: "center" });
    addText(s, r[0], x - 10, 512, 130, 24, { size: 12, bold: true, color: i === 5 ? C.accent : C.green, align: "center" });
    addText(s, r[1], x - 25, 544, 160, 38, { size: 14, color: C.muted, align: "center" });
  });
  addText(s, "Before commit: current stage + requested stage + caller permission + application scope", 150, 620, 980, 32, { size: 18, bold: true, color: C.accent, align: "center" });
  notes(s, "Walk through the recruitment stages. The service never accepts an arbitrary new status. It checks the current stage, requested transition, caller permission and application scope before committing the update and its related history.");
}

// 13 — AI jobs
{
  const s = deck.slides.add(); addHeader(s, "Background jobs", "Durable AI processing", 13, "AI calls can be slow or unavailable, so the user request only records durable work.");
  const steps = [["API", "Create job"], ["PostgreSQL", "Persist outbox"], ["Dispatcher", "Claim safely"], ["Redis", "Queue task"], ["Celery", "Call Gemini"], ["Database", "Store result"]];
  addLine(s, 94, 300, 1170, 300, C.border, 3);
  steps.forEach((r, i) => {
    const x = 70 + i * 204;
    addDot(s, x + 38, 284, 32, i === 4 ? C.accent : C.green);
    addText(s, String(i + 1), x + 38, 288, 32, 22, { size: 12, bold: true, color: C.paper, align: "center" });
    addText(s, r[0], x - 28, 336, 164, 28, { size: 16, bold: true, align: "center" });
    addText(s, r[1], x - 28, 372, 164, 40, { size: 14, color: C.muted, align: "center" });
  });
  const reasons = [
    ["Restart safety", "Pending work remains in PostgreSQL after an API or worker restart."],
    ["Controlled retry", "Transient provider failures use bounded retry instead of losing the request."],
    ["Duplicate protection", "Leases, claim state and idempotency keep one logical result."],
  ];
  reasons.forEach((r, i) => {
    const x = 64 + i * 375;
    addText(s, r[0], x, 488, 320, 30, { size: 19, bold: true, color: i === 1 ? C.accent : C.green });
    addText(s, r[1], x, 530, 330, 78, { size: 16 });
  });
  notes(s, "Explain why calling the AI provider directly inside the HTTP request would be fragile. The database first records the job. A dispatcher and worker can then retry safely, while the user checks job status later.");
}

// 14 — Email
{
  const s = deck.slides.add(); addHeader(s, "Transactional outbox", "Email that survives failures", 14, "Business data commits first. Email delivery retries independently without sending duplicates.");
  const flow = [
    ["Domain event", "Invitation, recovery or stage update"],
    ["EmailDelivery row", "Encrypted payload and dedupe key"],
    ["Worker claim", "Row lock with SKIP LOCKED"],
    ["Resend", "Provider idempotency key"],
    ["Outcome", "Sent, retry or failed"],
  ];
  flow.forEach((r, i) => {
    const x = 64 + i * 229;
    addText(s, String(i + 1).padStart(2, "0"), x, 218, 36, 24, { size: 12, bold: true, color: i === 3 ? C.accent : C.green });
    addText(s, r[0], x, 258, 200, 30, { size: 18, bold: true });
    addText(s, r[1], x, 300, 198, 70, { size: 15, color: C.muted });
    if (i < 4) addLine(s, x + 180, 270, x + 218, 270, C.border, 2);
  });
  addBox(s, 64, 424, 1110, 184, C.soft, C.border, "rounded-xl", 1);
  addText(s, "Failure controls", 88, 448, 220, 28, { size: 20, bold: true, color: C.green });
  addBullet(s, "Fernet encryption protects queued recipient data and message payloads", 88, 492, 1000, C.green2, 16);
  addBullet(s, "Retry delay grows from 30 seconds up to a 60-minute limit", 88, 536, 1000, C.accent, 16);
  addBullet(s, "A dedupe key and provider idempotency key protect the final effect", 88, 580, 1000, C.success, 16);
  notes(s, "Describe a failure after the application stage changes but before the email provider responds. The domain change stays committed, and the email row remains available for retry. Encryption protects queued data, while dedupe and provider idempotency prevent duplicate messages.");
}

// 15 — Communication
{
  const s = deck.slides.add(); addHeader(s, "Communication", "Two secure WebSocket channels", 15, "The backend supports recruitment chat and private chat between accepted friends.");
  await addImage(s, "apps/web/public/images/candidate/chat-branching-paths.webp", "image/webp", 64, 196, 420, 410, "cover", "rounded-xl");
  addText(s, "Recruitment channel", 530, 200, 310, 28, { size: 20, bold: true, color: C.green });
  addText(s, "/chat/recruitment/{application_id}/ws", 530, 238, 620, 26, { size: 16, bold: true, color: C.accent });
  addText(s, "Candidate and recruiter communication for one authorized application. Current workflow stage can enable or disable access.", 530, 278, 620, 66, { size: 16 });
  addLine(s, 530, 368, 1168, 368, C.border, 1);
  addText(s, "Friends channel", 530, 394, 310, 28, { size: 20, bold: true, color: C.green2 });
  addText(s, "/chat/friends/{peer_id}/ws", 530, 432, 620, 26, { size: 16, bold: true, color: C.accent });
  addText(s, "Private candidate-to-candidate messaging. Both users must be active candidates with an accepted friendship.", 530, 472, 620, 66, { size: 16 });
  addBox(s, 530, 564, 638, 68, C.soft, C.border, "rounded-xl", 1);
  addText(s, "Shared security: single-use socket ticket, session checks, rate limits, PostgreSQL history and Redis fan-out", 552, 579, 594, 42, { size: 15, bold: true, color: C.green });
  notes(s, "Clarify that there are two WebSocket endpoint types, not necessarily two permanent connections for every user. The recruitment socket is scoped to an application. The friend socket is scoped to an accepted friendship. Both use short-lived single-use tickets and store durable history in PostgreSQL.");
}

// 16 — Privacy
{
  const s = deck.slides.add(); addHeader(s, "Privacy", "Private files and account lifecycle", 16, "CVs and identity data require stronger controls than public offers and company information.");
  addText(s, "PRIVATE FILE PATH", 64, 198, 220, 24, { size: 12, bold: true, color: C.green });
  const pathSteps = [["Upload", "Type, size and owner checks"], ["Store", "Private Supabase bucket"], ["Authorize", "Backend verifies access"], ["Download", "Stream only to allowed user"]];
  pathSteps.forEach((r, i) => {
    const x = 64 + i * 285;
    addText(s, String(i + 1).padStart(2, "0"), x, 244, 40, 24, { size: 12, bold: true, color: i === 2 ? C.accent : C.green });
    addText(s, r[0], x, 280, 230, 30, { size: 19, bold: true });
    addText(s, r[1], x, 320, 230, 52, { size: 15, color: C.muted });
    if (i < 3) addLine(s, x + 218, 296, x + 270, 296, C.border, 2);
  });
  addText(s, "ACCOUNT DELETION", 64, 420, 220, 24, { size: 12, bold: true, color: C.accent });
  addLine(s, 94, 500, 1100, 500, C.border, 3);
  const life = [["Export", "JSON, CSV and XML"], ["Schedule", "Reauthenticate"], ["7-day window", "User can cancel"], ["Remove", "Delete files and anonymize"]];
  life.forEach((r, i) => {
    const x = 70 + i * 300;
    addDot(s, x + 30, 484, 32, i === 3 ? C.accent : C.green);
    addText(s, String(i + 1), x + 30, 488, 32, 22, { size: 12, bold: true, color: C.paper, align: "center" });
    addText(s, r[0], x - 26, 536, 182, 30, { size: 17, bold: true, align: "center" });
    addText(s, r[1], x - 30, 578, 190, 42, { size: 14, color: C.muted, align: "center" });
  });
  notes(s, "Explain that private storage credentials remain on the backend. A file never becomes public merely because its URL exists. For account deletion, explain the export, reauthentication, cancellation window and final removal or anonymization of personal data.");
}

// 17 — Deployment
{
  const s = deck.slides.add(); addHeader(s, "Deployment", "Production boundary and operations", 17, "Only the reverse proxy accepts public traffic. Data stores and workers remain on private networks.");
  addBox(s, 64, 210, 1110, 310, C.soft, C.border, "rounded-xl", 1);
  addText(s, "PUBLIC", 86, 230, 120, 22, { size: 11, bold: true, color: C.accent });
  addBox(s, 92, 270, 170, 88, C.paper, C.accent, "rounded-xl", 2);
  addText(s, "Browser", 112, 287, 130, 28, { size: 18, bold: true });
  addText(s, "HTTPS", 112, 322, 130, 20, { size: 14, color: C.muted });
  addLine(s, 262, 314, 350, 314, C.border, 2);
  addBox(s, 350, 260, 188, 108, C.paper, C.green, "rounded-xl", 2);
  addText(s, "Nginx", 372, 278, 144, 28, { size: 19, bold: true, color: C.green });
  addText(s, "TLS, HSTS, routing\nand WAF rules", 372, 315, 150, 44, { size: 14, color: C.muted });
  addText(s, "PRIVATE SERVICES", 596, 230, 180, 22, { size: 11, bold: true, color: C.green });
  const svc = [["FastAPI", "HTTP + WS"], ["Workers", "AI + email"], ["PostgreSQL", "durable state"], ["Redis", "broker + presence"]];
  svc.forEach((r, i) => {
    const x = 586 + (i % 2) * 275, y = 264 + Math.floor(i / 2) * 122;
    addBox(s, x, y, 240, 88, C.paper, i === 1 ? C.accent : C.green2, "rounded-xl", 2);
    addText(s, r[0], x + 20, y + 16, 200, 26, { size: 18, bold: true });
    addText(s, r[1], x + 20, y + 50, 200, 22, { size: 14, color: C.muted });
  });
  addText(s, "Operational signals", 64, 560, 220, 28, { size: 19, bold: true, color: C.green });
  addBullet(s, "Liveness and dependency readiness endpoints", 64, 602, 340, C.green2, 15);
  addBullet(s, "Structured logs with traceable error IDs", 430, 602, 330, C.accent, 15);
  addBullet(s, "Prometheus metrics and startup checks", 792, 602, 360, C.success, 15);
  notes(s, "Describe the public boundary first. Nginx handles TLS and routes traffic to private services. PostgreSQL, Redis and workers do not expose public ports. Then explain how health checks, logs, metrics and startup validation support diagnosis.");
}

// 18 — Evidence
{
  const s = deck.slides.add(); addHeader(s, "Evidence", "Testing and live demonstration", 18, "The repository contains 53 test files and 372 test functions across the main backend risks.");
  addText(s, "AUTOMATED COVERAGE", 64, 198, 250, 24, { size: 12, bold: true, color: C.green });
  const tests = ["Authentication, OTP, 2FA and revocation", "Role permissions and tenant isolation", "Database integrity and concurrent updates", "Applications, invitations and account lifecycle", "WebSockets, history, read events and presence", "AI jobs, uploads, health and deployment readiness"];
  tests.forEach((t, i) => addBullet(s, t, 64, 240 + i * 46, 520, i % 2 ? C.accent : C.green2, 16));
  addLine(s, 618, 200, 618, 626, C.border, 1);
  addText(s, "LIVE DEMO", 666, 198, 200, 24, { size: 12, bold: true, color: C.accent });
  const demo = [["1", "Login", "Protected identity"], ["2", "Select offer", "Company permission"], ["3", "Apply", "CV snapshot + relation"], ["4", "Process AI", "Outbox + worker result"], ["5", "Open chat", "Ticket + persisted message"]];
  demo.forEach((r, i) => {
    const y = 240 + i * 70;
    addDot(s, 666, y - 3, 34, i === 4 ? C.accent : C.green);
    addText(s, r[0], 666, y + 2, 34, 20, { size: 11, bold: true, color: C.paper, align: "center" });
    addText(s, r[1], 716, y - 2, 150, 26, { size: 18, bold: true });
    addText(s, r[2], 870, y - 2, 280, 30, { size: 15, color: C.muted });
  });
  await addImage(s, "apps/web/public/images/system/404-cat-static.svg", "image/svg+xml", 1020, 552, 140, 98, "contain", "none");
  addText(s, "If the demo fails, the tests still tell the story.", 666, 600, 330, 34, { size: 14, color: C.accent, bold: true });
  notes(s, "Do not claim that test count alone proves quality. Name the risks covered by the suite. For the live demo, follow one connected workflow so the staff can see identity, permissions, transactions, workers and WebSockets in context.");
}

// 19 — Conclusion
{
  const s = deck.slides.add(); addHeader(s, "Conclusion", "What I learned and what comes next", 19, "The backend work changed how I think about authority, data integrity and failure recovery.");
  addText(s, "THREE LESSONS", 64, 198, 240, 24, { size: 12, bold: true, color: C.green });
  const lessons = [
    ["Current state controls authority", "A valid token cannot replace role, tenant and ownership checks."],
    ["Database rules support security", "Constraints and transactions protect workflows when application code fails."],
    ["Slow work needs durable state", "Outboxes and workers keep AI and email work through restarts."],
  ];
  lessons.forEach((r, i) => {
    const y = 242 + i * 116;
    addText(s, r[0], 64, y, 470, 28, { size: 19, bold: true, color: i === 2 ? C.accent : C.green2 });
    addText(s, r[1], 64, y + 38, 500, 58, { size: 16 });
  });
  addLine(s, 610, 204, 610, 620, C.border, 1);
  addText(s, "NEXT IMPROVEMENTS", 658, 198, 260, 24, { size: 12, bold: true, color: C.accent });
  const next = ["Load and stress tests for chat and application updates", "Distributed tracing across API, dispatcher and workers", "Clearer job retry and failure dashboards", "Query profiling with index reviews", "More end-to-end workflow coverage"];
  next.forEach((t, i) => addBullet(s, t, 658, 242 + i * 55, 500, i % 2 ? C.accent : C.green2, 16));
  await addImage(s, "apps/web/public/images/system/404-cat-static.svg", "image/svg+xml", 1020, 514, 150, 132, "contain", "none");
  addText(s, "Questions?", 658, 544, 230, 48, { size: 32, bold: true, color: C.green });
  addText(s, "The backend survived. The cat is still investigating.", 658, 596, 340, 30, { size: 14, bold: true, color: C.accent });
  notes(s, "Finish with the three lessons rather than repeating the technology list. Mention the next improvements honestly. Invite questions about any layer of the backend, and be ready to open the code or demonstrate one workflow.");
}

// Render all slides for visual inspection.
for (const [i, slide] of deck.slides.items.entries()) {
  const png = await deck.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(path.join(buildDir, `slide-${String(i + 1).padStart(2, "0")}.png`), new Uint8Array(await png.arrayBuffer()));
}
const montage = await deck.export({ format: "webp", montage: true });
await fs.writeFile(path.join(buildDir, "montage.webp"), new Uint8Array(await montage.arrayBuffer()));

const { finalizePresentation } = await import(pathToFileURL(path.join(skillDir, "container_tools", "artifact_tool_utils.mjs")).href);
const candidatePath = path.join(buildDir, "candidate.pptx");
await (await PresentationFile.exportPptx(deck)).save(candidatePath);
const result = await finalizePresentation({
  workspaceDir,
  candidatePath,
  finalPath,
  explicitTotalSlideCount: 19,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [],
  pythonExecutable,
  integrityValidatorPath: path.join(skillDir, "container_tools", "inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(skillDir, "container_tools", "inspect_presentation_layout_geometry.py"),
  layoutArgs: ["--expected-slide-size-emu", "12192000,6858000", "--validate-heading-fit"],
  fontPolicy: { basis: "design", families: [FONT] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(buildDir, "validation-team-handoff.json"),
});
console.log(JSON.stringify({ finalPath, slides: deck.slides.items.length, result }, null, 2));
