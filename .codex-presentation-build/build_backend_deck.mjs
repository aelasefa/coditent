import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = "/home/maelmahf/Desktop/coditent";
const buildDir = path.join(workspaceDir, ".codex-presentation-build");
const outputDir = path.join(workspaceDir, "outputs");
const FINAL_PPTX = path.join(outputDir, "coditent-backend-presentation-polished-final.pptx");
const SKILL_DIR = "/home/maelmahf/.codex/plugins/cache/openai-primary-runtime/presentations/26.1015.12040/skills/presentations";
const RUNTIME_PYTHON = "/home/maelmahf/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const BODY_FONT = "Noto Sans";
const TITLE_FONT = "Noto Serif";

const C = {
  bg: "#F8F8F3",
  bg2: "#EDF1E9",
  panel: "#FFFEFA",
  panel2: "#F0F5EE",
  ink: "#192B23",
  muted: "#617369",
  cyan: "#194D38",
  purple: "#A25C38",
  blue: "#356456",
  green: "#28734D",
  amber: "#9B651B",
  red: "#B34538",
  line: "#CFDBCF",
};

const presentation = Presentation.create({ slideSize: { width: 1280, height: 720 } });

function addText(slide, text, x, y, w, h, opts = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  shape.text = text;
  shape.text.style = {
    typeface: opts.font || BODY_FONT,
    fontSize: opts.size ?? 24,
    bold: opts.bold ?? false,
    color: opts.color ?? C.ink,
    autoFit: "shrinkText",
    alignment: opts.align ?? "left",
    verticalAlignment: opts.valign ?? "middle",
  };
  return shape;
}

function addBox(slide, x, y, w, h, opts = {}) {
  const geometry = opts.geometry || "roundRect";
  const spec = {
    geometry,
    position: { left: x, top: y, width: w, height: h },
    fill: opts.fill ?? C.panel,
    line: { style: "solid", fill: opts.line ?? C.line, width: opts.lineWidth ?? 1.2 },
  };
  if (geometry === "roundRect" && opts.shadow !== false) {
    spec.shadow = opts.shadow || "shadow-sm";
  }
  if (["rect", "textbox", "roundRect"].includes(geometry)) {
    spec.borderRadius = opts.radius || "rounded-xl";
  }
  return slide.shapes.add(spec);
}

function addLine(slide, x, y, w, h, color = C.line, width = 2) {
  return slide.shapes.add({
    geometry: "line",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: color, width },
  });
}

function addHeader(slide, title, section, index) {
  slide.background.fill = C.bg;
  addText(slide, section.toUpperCase(), 64, 34, 500, 24, { size: 14, bold: true, color: C.cyan });
  addText(slide, title, 64, 58, 1090, 66, { size: 43, bold: false, font: TITLE_FONT });
  addText(slide, String(index).padStart(2, "0"), 1182, 44, 34, 24, { size: 14, bold: true, color: C.muted, align: "right" });
  addLine(slide, 64, 128, 1152, 0, C.line, 1);
}

function addFooter(slide, text = "CODITENT  /  BACKEND") {
  addText(slide, text, 64, 684, 500, 18, { size: 11, bold: true, color: "#7B8D82" });
}

function labelBox(slide, label, sub, x, y, w, h, accent = C.cyan) {
  addBox(slide, x, y, w, h, { fill: C.panel, line: C.line });
  addBox(slide, x, y, 7, h, { geometry: "rect", fill: accent, line: accent, lineWidth: 0 });
  addText(slide, label, x + 22, y + 12, w - 34, 28, { size: 21, bold: true });
  if (sub) addText(slide, sub, x + 22, y + 43, w - 34, h - 52, { size: 15, color: C.muted, valign: "top" });
}

function stepBox(slide, n, title, sub, x, y, w, accent = C.cyan) {
  addBox(slide, x, y, w, 94, { fill: C.panel, line: C.line });
  addBox(slide, x + 16, y + 18, 46, 46, { geometry: "ellipse", fill: accent, line: accent });
  addText(slide, String(n), x + 16, y + 18, 46, 46, { size: 21, bold: true, color: C.bg, align: "center" });
  addText(slide, title, x + 76, y + 12, w - 90, 30, { size: 20, bold: true });
  addText(slide, sub, x + 76, y + 44, w - 90, 38, { size: 14, color: C.muted, valign: "top" });
}

function addNotes(slide, notes) {
  slide.speakerNotes.text = notes;
  slide.speakerNotes.setVisible(true);
}

async function readImageBlob(imagePath) {
  const bytes = await fs.readFile(imagePath);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

// 1. Cover
{
  const s = presentation.slides.add();
  s.background.fill = C.bg;
  const coverImage = await readImageBlob(path.join(workspaceDir, "apps/web/public/images/auth/sign-in-background.png"));
  s.images.add({
    blob: coverImage,
    contentType: "image/png",
    alt: "Coditent recruitment journey illustration",
    fit: "cover",
    position: { left: 0, top: 0, width: 1280, height: 720 },
  });
  addBox(s, 0, 0, 650, 720, { geometry: "rect", fill: C.bg, line: C.bg, lineWidth: 0, shadow: false });
  addBox(s, 72, 70, 54, 6, { geometry: "rect", fill: C.purple, line: C.purple, lineWidth: 0, shadow: false });
  addText(s, "42 PROJECT PRESENTATION", 72, 90, 360, 28, { size: 14, bold: true, color: C.cyan });
  addText(s, "CODITENT", 72, 166, 520, 82, { size: 66, bold: false, font: TITLE_FONT });
  addText(s, "Backend architecture\nand engineering", 76, 252, 520, 102, { size: 33, color: C.muted, font: TITLE_FONT });
  addText(s, "FastAPI  /  PostgreSQL  /  Redis\nCelery  /  WebSockets", 76, 390, 480, 64, { size: 17, bold: true, color: C.purple });
  addText(s, "Presented by: [Your Name]", 76, 578, 500, 34, { size: 22, bold: true, color: C.cyan });
  addText(s, "Backend Developer  /  CODITENT Team", 76, 620, 540, 28, { size: 17, color: C.muted });
  addNotes(s, "Introduce yourself and state that you were responsible for the backend part of CODITENT. Explain that the presentation focuses on the system behind the user interface: APIs, data, permissions, asynchronous work, real-time communication, privacy, and deployment. Replace [Your Name] before presenting.");
}

// 2. Repository-backed scope
{
  const s = presentation.slides.add();
  addHeader(s, "Backend at a glance", "Repository snapshot", 2);
  addText(s, "A production-shaped backend with breadth across API design, data, security, asynchronous work, and operations.", 64, 145, 1120, 44, { size: 21, color: C.muted });
  const metrics = [
    ["18", "API routers", "Separated by domain"],
    ["163", "route handlers", "HTTP and WebSocket entry points"],
    ["29", "database models", "Recruitment, identity and operations"],
    ["46", "migrations", "Versioned schema evolution"],
  ];
  metrics.forEach((m, i) => {
    const x = 64 + i * 288;
    addBox(s, x, 220, 254, 182, { fill: C.panel, line: i % 2 ? C.line : C.cyan, lineWidth: i % 2 ? 1.2 : 2 });
    addText(s, m[0], x + 22, 238, 210, 66, { size: 48, font: TITLE_FONT, color: i === 1 ? C.purple : C.cyan });
    addText(s, m[1], x + 22, 306, 210, 30, { size: 20, bold: true });
    addText(s, m[2], x + 22, 342, 210, 42, { size: 14, color: C.muted, valign: "top" });
  });
  addBox(s, 64, 446, 1118, 128, { fill: C.bg2, line: C.line });
  addText(s, "Testing evidence", 90, 466, 230, 30, { size: 21, bold: true, color: C.amber });
  addText(s, "53 test files", 90, 512, 210, 34, { size: 25, bold: true, color: C.cyan });
  addText(s, "365 test functions", 330, 512, 250, 34, { size: 25, bold: true, color: C.purple });
  addText(s, "Runtime services", 646, 466, 230, 30, { size: 21, bold: true, color: C.amber });
  addText(s, "API, worker, AI dispatcher, Redis, web, proxy", 646, 510, 500, 46, { size: 18, color: C.muted });
  addText(s, "Counts are a point-in-time snapshot of the submitted repository.", 64, 610, 760, 26, { size: 14, color: C.muted });
  addFooter(s);
  addNotes(s, "Use these numbers as evidence of scope, not as vanity metrics. The repository contains 18 domain routers, 163 route decorators, 29 SQLAlchemy models, 46 Alembic migrations, 53 test files, and 365 test functions at the time this deck was generated. Explain that the important point is the variety of responsibilities: identity, hiring workflows, real-time communication, background jobs, data privacy, and production operations.");
}

// 3. Product and scope
{
  const s = presentation.slides.add();
  addHeader(s, "Backend scope across recruitment roles", "Project scope", 3);
  addText(s, "CODITENT supports three groups with different data and permissions.", 64, 148, 900, 34, { size: 22, color: C.muted });
  labelBox(s, "Candidates", "Profiles, CVs, offers, applications, interviews, recommendations and recruiter chat", 64, 208, 350, 178, C.cyan);
  labelBox(s, "Company teams", "Offers, candidate review, hiring stages, team invitations, interviews and recruitment chat", 465, 208, 350, 178, C.purple);
  labelBox(s, "Platform admins", "Users, companies, invitations, support, institutions, missions and audit activity", 866, 208, 350, 178, C.blue);
  addText(s, "My backend scope", 64, 438, 270, 34, { size: 25, bold: true, color: C.cyan });
  addText(s, "I designed and implemented the server-side system that validates requests, enforces access rules, stores data, coordinates workflows, and integrates external services.", 64, 480, 1120, 90, { size: 26, bold: true });
  addText(s, "The frontend asks. The backend decides what is valid and what each user may do.", 64, 598, 1120, 42, { size: 20, color: C.amber });
  addFooter(s);
  addNotes(s, "Start with the product, not the technology. CODITENT serves candidates, company teams, and platform administrators. Each group sees different resources and can perform different actions. My role was to build the backend boundary that validates requests, protects data, and applies the recruitment rules consistently.");
}

// 4. Architecture
{
  const s = presentation.slides.add();
  addHeader(s, "Backend architecture", "System design", 4);
  addText(s, "FastAPI controls three paths: immediate requests, durable background work, and real-time communication.", 64, 144, 1120, 34, { size: 21, color: C.muted });

  addText(s, "REQUEST PATH", 64, 210, 150, 24, { size: 13, bold: true, color: C.cyan });
  labelBox(s, "Browser", "Next.js client", 210, 196, 170, 82, C.cyan);
  addLine(s, 380, 237, 42, 0, C.line, 2);
  labelBox(s, "Nginx", "TLS, proxy, WAF", 422, 196, 180, 82, C.blue);
  addLine(s, 602, 237, 42, 0, C.line, 2);
  labelBox(s, "FastAPI", "Validation, permissions, business rules", 644, 188, 252, 98, C.purple);
  addLine(s, 896, 237, 42, 0, C.line, 2);
  labelBox(s, "Data services", "PostgreSQL records and private file storage", 938, 188, 278, 98, C.green);

  addText(s, "BACKGROUND JOBS", 64, 352, 126, 24, { size: 12, bold: true, color: C.purple });
  labelBox(s, "API transaction", "Create a durable job or email row", 190, 330, 190, 94, C.purple);
  addLine(s, 380, 377, 30, 0, C.line, 2);
  labelBox(s, "PostgreSQL outbox", "Dedupe, retry state, lease", 410, 330, 200, 94, C.green);
  addLine(s, 610, 377, 30, 0, C.line, 2);
  labelBox(s, "Redis", "Broker and shared state", 640, 330, 150, 94, C.red);
  addLine(s, 790, 377, 30, 0, C.line, 2);
  labelBox(s, "Celery workers", "AI and email execution", 820, 330, 180, 94, C.amber);
  addLine(s, 1000, 377, 30, 0, C.line, 2);
  labelBox(s, "External providers", "Gemini and Resend", 1030, 330, 186, 94, C.amber);

  addText(s, "REAL-TIME PATH", 64, 494, 150, 24, { size: 13, bold: true, color: C.amber });
  labelBox(s, "Socket ticket", "Short-lived credential", 210, 472, 210, 94, C.cyan);
  addLine(s, 420, 519, 42, 0, C.line, 2);
  labelBox(s, "FastAPI WebSocket", "Application and stage checks", 462, 472, 220, 94, C.purple);
  addLine(s, 682, 519, 42, 0, C.line, 2);
  labelBox(s, "PostgreSQL", "Ordered message history", 724, 472, 204, 94, C.green);
  addLine(s, 928, 519, 42, 0, C.line, 2);
  labelBox(s, "Redis fan-out", "Presence and cross-process delivery", 970, 472, 246, 94, C.red);

  addBox(s, 210, 600, 1006, 42, { fill: C.bg2, line: C.line, shadow: false });
  addText(s, "Durable state stays in PostgreSQL. Redis coordinates fast, temporary work. External providers remain behind controlled workers.", 232, 604, 958, 30, { size: 16, color: C.muted });
  addFooter(s);
  addNotes(s, "Explain the three paths separately. In the request path, Nginx terminates HTTPS and FastAPI validates identity, permissions, and business rules before using PostgreSQL or private storage. In the background path, the API commits durable outbox rows before Redis and Celery coordinate delivery to Gemini or Resend. In the real-time path, a short-lived socket ticket reaches an authorized WebSocket endpoint, PostgreSQL stores message history, and Redis distributes presence and messages across API processes.");
}

// 5. Code organization
{
  const s = presentation.slides.add();
  addHeader(s, "Backend code structure", "Maintainability", 5);
  addText(s, "A request moves through five layers. Each layer owns one type of responsibility.", 64, 144, 1080, 34, { size: 22, color: C.muted });
  const layers = [
    ["01", "Routers", "HTTP and WebSocket input", "Validate transport data and call the next layer", C.cyan],
    ["02", "Dependencies", "Identity and request context", "Load the user, session, company, and shared guards", C.blue],
    ["03", "Services", "Business decisions", "Apply permissions, workflows, and domain rules", C.purple],
    ["04", "Models", "Durable state", "Enforce relationships, constraints, and transactions", C.green],
    ["05", "Workers", "Slow external work", "Process AI, email, files, and scheduled tasks", C.amber],
  ];
  layers.forEach((l, i) => {
    const x = 64 + i * 230;
    addBox(s, x, 212, 196, 202, { fill: C.panel, line: l[4], lineWidth: 1.8 });
    addText(s, l[0], x + 20, 226, 44, 26, { size: 15, bold: true, color: l[4] });
    addText(s, l[1], x + 20, 264, 156, 32, { size: 21, bold: true });
    addText(s, l[2], x + 20, 304, 156, 42, { size: 15, bold: true, color: C.muted, valign: "top" });
    addLine(s, x + 20, 354, 156, 0, C.line, 1);
    addText(s, l[3], x + 20, 366, 156, 34, { size: 13, color: C.muted, valign: "top" });
    if (i < layers.length - 1) addLine(s, x + 196, 312, 34, 0, C.line, 2);
  });
  addText(s, "Concrete example", 64, 458, 190, 30, { size: 22, bold: true, color: C.purple });
  addText(s, "Move an application to the interview stage", 274, 456, 570, 32, { size: 20, bold: true });
  const example = [
    ["Router", "validates the stage request"],
    ["Dependency", "loads user and company context"],
    ["Service", "checks permission and transition"],
    ["Transaction", "updates state and queues notification"],
  ];
  example.forEach((it, i) => {
    const x = 64 + i * 288;
    addText(s, String(i + 1).padStart(2, "0"), x, 510, 34, 24, { size: 14, bold: true, color: i < 2 ? C.cyan : C.purple });
    addText(s, it[0], x + 42, 504, 112, 30, { size: 17, bold: true });
    addText(s, it[1], x + 42, 536, 210, 40, { size: 14, color: C.muted, valign: "top" });
    if (i < example.length - 1) addLine(s, x + 252, 530, 36, 0, C.line, 2);
  });
  addBox(s, 64, 610, 1152, 42, { fill: C.bg2, line: C.line, shadow: false });
  addText(s, "Routers coordinate the call. Services make the business decision. Database constraints reject invalid state.", 86, 614, 1108, 30, { size: 17, color: C.amber });
  addFooter(s);
  addNotes(s, "Explain the layers from left to right. Routers handle HTTP and WebSocket input. Dependencies load identity and request context. Services make reusable business decisions. Models and transactions protect durable state. Workers handle slow external systems. Use the application-stage example to show the separation in practice: the router validates input, the dependency loads the caller and company, the service checks permission and state transition, and the transaction updates the application while creating notification work.");
}

// 6. Stack choices
{
  const s = presentation.slides.add();
  addHeader(s, "Technical choices and trade-offs", "Engineering decisions", 6);
  const items = [
    ["FastAPI", "Async request handling, dependency injection, validation and OpenAPI", C.cyan],
    ["PostgreSQL", "Transactions and relational integrity fit recruitment workflows", C.green],
    ["SQLAlchemy + Alembic", "Async data access with versioned schema changes", C.blue],
    ["Redis + Celery", "Slow AI tasks leave the HTTP request path", C.red],
    ["Supabase private storage", "Protected CV and image assets with backend-only credentials", C.purple],
    ["Docker + Ansible", "Repeatable environments and controlled production deployment", C.amber],
  ];
  items.forEach((it, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    labelBox(s, it[0], it[1], 64 + col * 582, 168 + row * 150, 534, 120, it[2]);
  });
  addText(s, "Main trade-off", 64, 626, 170, 28, { size: 18, bold: true, color: C.amber });
  addText(s, "More infrastructure gives better reliability, but it also increases configuration, testing, and operational responsibility.", 242, 620, 960, 40, { size: 19, color: C.muted });
  addFooter(s);
  addNotes(s, "Explain why each technology exists. FastAPI gives a clear API layer. PostgreSQL protects relationships and multi-step updates. Redis and Celery keep slow AI work away from user requests. Private storage protects CVs. Docker and Ansible make the same architecture reproducible. Mention the cost: each extra component introduces configuration and failure modes that the backend must monitor.");
}

// 7. Request lifecycle
{
  const s = presentation.slides.add();
  addHeader(s, "A protected API request", "Request lifecycle", 7);
  addText(s, "Every request passes through the same security and validation boundary.", 64, 146, 1000, 32, { size: 21, color: C.muted });
  const steps = [
    ["Route", "FastAPI matches the endpoint"],
    ["Validate", "Pydantic checks input"],
    ["Authenticate", "Resolve the current user"],
    ["Authorize", "Check role, tenant and ownership"],
    ["Execute", "Service logic and transaction"],
    ["Respond", "Typed output or safe error"],
  ];
  steps.forEach((it, i) => {
    const y = i < 3 ? 210 : 390;
    const x = 64 + (i % 3) * 386;
    stepBox(s, i + 1, it[0], it[1], x, y, 342, i % 2 === 0 ? C.cyan : C.purple);
    if (i % 3 !== 2) addLine(s, x + 342, y + 46, 44, 0, C.line, 2);
  });
  addBox(s, 64, 526, 1114, 104, { fill: C.bg2, line: C.line });
  addText(s, "Cookie security", 84, 540, 190, 28, { size: 18, bold: true, color: C.red });
  addText(s, "Mutating cookie requests require an approved Origin plus a matching CSRF cookie and X-CSRF-Token header.", 274, 534, 878, 40, { size: 17, color: C.muted });
  addText(s, "Safe failures", 84, 584, 190, 28, { size: 18, bold: true, color: C.amber });
  addText(s, "Expected errors stay explicit. Unexpected failures return a safe message and a traceable error ID.", 274, 578, 878, 40, { size: 17, color: C.muted });
  addFooter(s);
  addNotes(s, "Use one real endpoint as an example. A request first reaches a router, then Pydantic validates its body. Authentication accepts a bearer token or secure access cookie, verifies the JWT, checks session revocation, and loads the current user. Mutating cookie requests also require Origin and double-submit CSRF validation. Authorization checks role, tenant, and ownership. The service applies business rules inside a transaction, and response models prevent accidental data exposure.");
}

// 8. Data model
{
  const s = presentation.slides.add();
  addHeader(s, "Recruitment data model", "Database design", 8);
  addText(s, "Application is the central record for one candidate applying to one offer.", 64, 145, 1120, 34, { size: 22, color: C.muted });

  addBox(s, 64, 202, 734, 330, { fill: C.bg2, line: C.line });
  addText(s, "Application record", 92, 222, 300, 34, { size: 27, font: TITLE_FONT, color: C.cyan });
  addText(s, "The record keeps the hiring workflow stable even when profiles or offers change later.", 92, 258, 650, 36, { size: 17, color: C.muted });
  const fields = [
    ["Relationships", "candidate_id, opportunity_id, company_id, cv_asset_id", C.cyan],
    ["Workflow", "status, stage_version, status_changed_at", C.purple],
    ["AI screening", "ai_status, ai_score, ai_report", C.amber],
    ["Interview", "interview_scheduled_at, interview_notes", C.green],
  ];
  fields.forEach((it, i) => {
    const y = 310 + i * 52;
    addText(s, it[0], 92, y, 150, 28, { size: 17, bold: true, color: it[2] });
    addText(s, it[1], 248, y - 2, 512, 34, { size: 16, color: C.ink });
    if (i < fields.length - 1) addLine(s, 92, y + 38, 668, 0, C.line, 1);
  });

  addText(s, "Related records", 842, 202, 330, 34, { size: 25, bold: true, color: C.purple });
  labelBox(s, "InterviewFeedback", "One review per application and reviewer. Rating: 1 to 5.", 842, 250, 374, 82, C.green);
  labelBox(s, "ChatMessage", "One application conversation with ordered messages.", 842, 350, 374, 82, C.cyan);
  labelBox(s, "CVAsset", "Composite key proves the CV belongs to the candidate.", 842, 450, 374, 82, C.amber);

  addText(s, "Database rules", 64, 568, 180, 30, { size: 21, bold: true, color: C.amber });
  const rules = [
    ["No duplicate application", "Unique candidate and offer pair"],
    ["Valid workflow state", "Status limited to known stages"],
    ["Valid AI score", "Null or between 0 and 100"],
    ["Owned CV only", "Composite foreign key checks owner"],
  ];
  rules.forEach((it, i) => {
    const x = 246 + i * 242;
    addText(s, it[0], x, 560, 214, 28, { size: 16, bold: true, color: i % 2 ? C.purple : C.cyan });
    addText(s, it[1], x, 592, 214, 38, { size: 14, color: C.muted, valign: "top" });
  });
  addFooter(s);
  addNotes(s, "Center the explanation on the Application model. It links the candidate, offer, company, and selected CV asset. It also stores the current status, stage version, AI screening state, interview schedule, and timestamps. Related InterviewFeedback rows allow one review per reviewer, while ChatMessage rows form an ordered conversation for the application. Emphasize the database protections: one candidate cannot apply twice to the same offer, status values are constrained, AI scores remain between zero and one hundred, and the composite CV foreign key proves that the selected CV belongs to the candidate.");
}

// 9. Integrity and concurrency
{
  const s = presentation.slides.add();
  addHeader(s, "Database integrity under concurrency", "Data correctness", 9);
  addText(s, "Correctness must survive two users or two workers acting at the same time.", 64, 144, 1050, 34, { size: 22, color: C.muted });
  addBox(s, 64, 204, 522, 356, { fill: C.bg2, line: C.line });
  addText(s, "Durable invariants", 92, 226, 420, 34, { size: 25, bold: true, color: C.cyan });
  const invariants = [
    ["Foreign keys", "Reject broken relationships"],
    ["Unique constraints", "Block duplicate membership and work"],
    ["Transactions", "Commit related changes together"],
    ["Alembic", "Apply schema changes in order"],
  ];
  invariants.forEach((it, i) => {
    addText(s, String(i + 1).padStart(2, "0"), 92, 282 + i * 62, 40, 28, { size: 15, bold: true, color: C.purple });
    addText(s, it[0], 142, 278 + i * 62, 170, 30, { size: 18, bold: true });
    addText(s, it[1], 316, 275 + i * 62, 236, 38, { size: 15, color: C.muted });
  });
  addBox(s, 638, 204, 578, 356, { fill: C.bg2, line: C.line });
  addText(s, "Concurrency controls", 666, 226, 480, 34, { size: 25, bold: true, color: C.purple });
  const controls = [
    ["Row locking", "SELECT FOR UPDATE protects transitions"],
    ["Skip locked", "Workers safely claim different rows"],
    ["Version checks", "Reject updates based on stale state"],
    ["Idempotency", "Repeated delivery produces one effect"],
  ];
  controls.forEach((it, i) => {
    addText(s, String(i + 1).padStart(2, "0"), 666, 282 + i * 62, 40, 28, { size: 15, bold: true, color: C.amber });
    addText(s, it[0], 716, 278 + i * 62, 160, 30, { size: 18, bold: true });
    addText(s, it[1], 882, 275 + i * 62, 296, 38, { size: 15, color: C.muted });
  });
  addBox(s, 64, 586, 1152, 50, { fill: C.panel, line: C.line });
  addText(s, "Example: lock the application, validate its current stage, write the transition and notification work, then commit once.", 84, 592, 1110, 32, { size: 17, color: C.amber });
  addFooter(s);
  addNotes(s, "This slide answers what happens when requests race. Application checks are necessary but not sufficient. Database constraints reject invalid final states. Transactions group related updates. Row locks protect state-machine transitions. Skip-locked claiming lets multiple workers process different jobs without blocking one another. Idempotency keys make retries safe. The application keeps a CV snapshot so later CV edits do not silently rewrite hiring history.");
}

// 10. Authentication
{
  const s = presentation.slides.add();
  addHeader(s, "Authentication and session security", "Identity", 10);
  addText(s, "A token identifies a session. Current database state decides whether that session still has authority.", 64, 144, 1120, 38, { size: 22, color: C.muted });
  stepBox(s, 1, "Register", "Candidate submits validated account data", 64, 216, 348, C.cyan);
  stepBox(s, 2, "Verify email", "OTP proves control of the address", 466, 216, 348, C.blue);
  stepBox(s, 3, "Sign in", "bcrypt verifies the password", 868, 216, 348, C.purple);
  stepBox(s, 4, "Issue session", "JWT and secure cookie state", 64, 394, 348, C.green);
  stepBox(s, 5, "Load user", "Protected requests query current state", 466, 394, 348, C.amber);
  stepBox(s, 6, "Revoke", "Sensitive changes invalidate old authority", 868, 394, 348, C.red);
  addText(s, "Revocation model", 64, 548, 200, 28, { size: 19, bold: true, color: C.cyan });
  addText(s, "JWTs carry session ID and auth_version. Redis gives fast rejection; PostgreSQL remains the durable source of truth.", 264, 540, 930, 48, { size: 18, color: C.muted });
  addText(s, "2FA challenges are short-lived and consumed atomically to prevent replay. Trusted devices remain revocable.", 264, 590, 930, 36, { size: 16, color: C.amber });
  addFooter(s);
  addNotes(s, "Explain the difference between identity and authority. Passwords are hashed with bcrypt and email OTP confirms account ownership. JWTs carry a session ID and authorization version, but protected routes still load current user state. Redis is a fast revocation cache while PostgreSQL remains durable truth, so revoked sessions stay rejected even if Redis is unavailable. Sensitive changes increment auth_version, invalidating old credentials. Two-factor challenges use atomic consumption to prevent replay.");
}

// 11. Authorization
{
  const s = presentation.slides.add();
  addHeader(s, "Role and tenant authorization", "Access control", 11);
  addText(s, "Each protected action combines a permission check with resource scope.", 64, 144, 1000, 32, { size: 21, color: C.muted });
  addBox(s, 64, 198, 540, 404, { fill: C.bg2, line: C.line });
  addText(s, "Company permission model", 92, 220, 440, 34, { size: 25, bold: true });
  const roles = [
    ["OWNER", "Organization, membership, subscription and hiring"],
    ["ADMIN", "Team, offers and recruitment operations"],
    ["HR", "Offers, interviews, stages and chat"],
    ["RECRUITER", "Applications, evaluation and chat"],
    ["HIRING MANAGER", "Review, feedback, analytics and stage changes"],
  ];
  roles.forEach((r, i) => {
    addText(s, r[0], 92, 276 + i * 58, 188, 28, { size: 16, bold: true, color: i < 2 ? C.purple : C.cyan });
    addText(s, r[1], 280, 272 + i * 58, 292, 38, { size: 15, color: C.muted });
    if (i < roles.length - 1) addLine(s, 92, 322 + i * 58, 480, 0, C.line, 1);
  });
  addBox(s, 628, 350, 50, 34, { geometry: "roundRect", fill: C.panel, line: C.amber, lineWidth: 1.5, shadow: false });
  addText(s, "AND", 628, 350, 50, 34, { size: 13, bold: true, color: C.amber, align: "center" });
  addBox(s, 704, 198, 512, 404, { fill: C.bg2, line: C.line });
  addText(s, "Resource scope", 734, 220, 430, 34, { size: 25, bold: true });
  labelBox(s, "Same company", "A member cannot access another organization's candidates or offers", 734, 278, 452, 112, C.purple);
  labelBox(s, "Same candidate", "A candidate can access only their own profile, files and applications", 734, 410, 452, 112, C.cyan);
  addText(s, "Foreign or missing resources return a safe response that avoids leaking private existence.", 734, 542, 452, 44, { size: 16, color: C.amber });
  addFooter(s);
  addNotes(s, "Authentication answers who the caller is. Authorization answers whether that caller may perform this action on this resource. CODITENT combines a company-role permission matrix with resource scoping. A recruiter may have permission to review applications, but only inside the recruiter’s own company. Candidates remain limited to their own records.");
}

// 12. Workflow
{
  const s = presentation.slides.add();
  addHeader(s, "Application workflow", "Business rules", 12);
  addText(s, "The backend controls every stage change and records the recruitment history.", 64, 144, 1070, 34, { size: 22, color: C.muted });
  const stages = [
    ["Discover", "Offer search and matching", C.cyan],
    ["Apply", "Validated profile and CV snapshot", C.blue],
    ["Screen", "Durable AI job adds context", C.purple],
    ["Review", "Authorized company member", C.amber],
    ["Interview", "Scheduling and feedback", C.green],
    ["Decision", "Final guarded transition", C.red],
  ];
  stages.forEach((st, i) => {
    const x = 64 + i * 191;
    addBox(s, x, 240, 160, 196, { fill: C.panel, line: st[2], lineWidth: 2 });
    addText(s, String(i + 1).padStart(2, "0"), x + 20, 256, 46, 30, { size: 17, bold: true, color: st[2] });
    addText(s, st[0], x + 20, 296, 120, 34, { size: 23, bold: true });
    addText(s, st[1], x + 20, 344, 120, 66, { size: 15, color: C.muted, valign: "top" });
    if (i < stages.length - 1) addLine(s, x + 160, 338, 31, 0, C.line, 2);
  });
  addBox(s, 64, 492, 1115, 108, { fill: C.bg2, line: C.line });
  addText(s, "Guarded transitions", 86, 510, 226, 30, { size: 21, bold: true, color: C.amber });
  addText(s, "The service checks the current stage, the requested next stage, the caller's permission, and the application scope before committing the change.", 312, 502, 842, 70, { size: 20, color: C.muted });
  addFooter(s);
  addNotes(s, "Describe this as a state machine. Users cannot jump freely between stages. The backend checks the current state, validates the requested transition, verifies the caller’s role, and confirms the application belongs to the same company or candidate. The update and related notifications occur consistently inside the workflow.");
}

// 13. AI jobs
{
  const s = presentation.slides.add();
  addHeader(s, "Durable AI processing", "Background jobs", 13);
  addText(s, "AI calls can take seconds or fail. The backend keeps them outside the user request.", 64, 144, 1070, 34, { size: 22, color: C.muted });
  const x = [64, 260, 456, 652, 848, 1044];
  const names = [
    ["API", "Create job"],
    ["PostgreSQL", "Persist outbox"],
    ["Dispatcher", "Claim work"],
    ["Redis", "Queue task"],
    ["Celery", "Call Gemini"],
    ["Database", "Store result"],
  ];
  names.forEach((n, i) => {
    addBox(s, x[i], 250, 154, 142, { fill: C.panel, line: i < 3 ? C.purple : C.cyan, lineWidth: 2 });
    addText(s, String(i + 1), x[i] + 18, 264, 34, 24, { size: 15, bold: true, color: C.amber });
    addText(s, n[0], x[i] + 18, 298, 118, 30, { size: 20, bold: true });
    addText(s, n[1], x[i] + 18, 340, 118, 34, { size: 14, color: C.muted });
    if (i < names.length - 1) addLine(s, x[i] + 154, 320, 42, 0, C.line, 2);
  });
  addText(s, "Why the outbox matters", 64, 460, 300, 34, { size: 25, bold: true, color: C.purple });
  labelBox(s, "Survives restarts", "The database retains pending work", 64, 510, 350, 100, C.green);
  labelBox(s, "Supports retries", "Transient provider failures do not lose the request", 465, 510, 350, 100, C.blue);
  labelBox(s, "Prevents duplicates", "Claiming and idempotency protect processing", 866, 510, 350, 100, C.amber);
  addFooter(s);
  addNotes(s, "AI powers CV extraction, match context, recommendation ranking, and screening support. Calling Gemini inside the HTTP request would make users wait and could lose work when the API restarts. CODITENT writes durable job state first. Jobs carry a unique dedupe key, retry state, availability time, lease deadline, and lease owner. The dispatcher recovers expired leases; workers heartbeat while processing; the final update checks lease ownership before committing. AI output remains advisory and never replaces authorization rules.");
}

// 14. Durable email
{
  const s = presentation.slides.add();
  addHeader(s, "Reliable email delivery", "Transactional outbox", 14);
  addText(s, "Business changes commit first; email delivery can retry independently without duplicating messages.", 64, 144, 1120, 34, { size: 22, color: C.muted });
  const flow = [
    ["Domain event", "Stage, invitation or recovery"],
    ["EmailDelivery", "Encrypted payload + dedupe key"],
    ["Worker claim", "Row lock with SKIP LOCKED"],
    ["Resend", "Provider idempotency key"],
    ["Outcome", "Sent, retry or failed"],
  ];
  flow.forEach((it, i) => {
    const x = 64 + i * 230;
    addBox(s, x, 232, 190, 148, { fill: C.panel, line: i < 2 ? C.purple : C.cyan, lineWidth: 2 });
    addText(s, String(i + 1), x + 18, 248, 34, 26, { size: 15, bold: true, color: C.amber });
    addText(s, it[0], x + 18, 286, 154, 28, { size: 18, bold: true });
    addText(s, it[1], x + 18, 326, 154, 40, { size: 14, color: C.muted, valign: "top" });
    if (i < flow.length - 1) addLine(s, x + 190, 306, 40, 0, C.line, 2);
  });
  addText(s, "Failure controls", 64, 438, 240, 34, { size: 25, bold: true, color: C.purple });
  labelBox(s, "Encrypted at rest", "Fernet protects the queued email payload", 64, 488, 350, 112, C.green);
  labelBox(s, "Bounded backoff", "Retries expand from 30 seconds to 60 minutes", 465, 488, 350, 112, C.blue);
  labelBox(s, "Exactly-once effect", "Dedupe and provider idempotency make retries safe", 866, 488, 350, 112, C.amber);
  addFooter(s);
  addNotes(s, "Email is a separate reliability problem from the user request. The same transaction that changes the domain state creates an EmailDelivery row, so the intent is durable. The payload is encrypted, and a unique dedupe key prevents duplicate business messages. Workers claim rows with skip-locked row locking, deliver through Resend with a provider idempotency key, and apply bounded retry delays from 30 seconds to one hour.");
}

// 15. Realtime
{
  const s = presentation.slides.add();
  addHeader(s, "Secure real-time communication", "Communication", 15);
  addText(s, "WebSockets deliver messages quickly while the backend keeps authorization and history durable.", 64, 144, 1120, 34, { size: 22, color: C.muted });
  const socketFlow = [
    ["01", "Request ticket", "Authenticated HTTP request", C.cyan],
    ["02", "Open socket", "Short-lived ticket", C.blue],
    ["03", "Authorize", "Application and stage checks", C.purple],
    ["04", "Persist", "Ordered PostgreSQL history", C.green],
    ["05", "Distribute", "Redis presence and fan-out", C.red],
  ];
  socketFlow.forEach((it, i) => {
    const x = 64 + i * 230;
    addBox(s, x, 210, 196, 150, { fill: C.panel, line: it[3], lineWidth: 1.8 });
    addText(s, it[0], x + 20, 226, 42, 24, { size: 14, bold: true, color: it[3] });
    addText(s, it[1], x + 20, 266, 156, 30, { size: 19, bold: true });
    addText(s, it[2], x + 20, 306, 156, 38, { size: 14, color: C.muted, valign: "top" });
    if (i < socketFlow.length - 1) addLine(s, x + 196, 285, 34, 0, C.line, 2);
  });

  addBox(s, 64, 414, 546, 196, { fill: C.bg2, line: C.line });
  addText(s, "Connection security", 92, 434, 440, 32, { size: 24, bold: true, color: C.purple });
  const security = [
    ["Current session", "Ticket keeps session identity and authorization version"],
    ["Conversation access", "Caller must belong to the application or company"],
    ["Workflow stage", "Current stage must allow recruitment chat"],
  ];
  security.forEach((it, i) => {
    addText(s, String(i + 1).padStart(2, "0"), 92, 482 + i * 42, 38, 24, { size: 14, bold: true, color: C.cyan });
    addText(s, it[0], 138, 478 + i * 42, 150, 28, { size: 16, bold: true });
    addText(s, it[1], 292, 476 + i * 42, 282, 34, { size: 14, color: C.muted });
  });

  addBox(s, 638, 414, 578, 196, { fill: C.bg2, line: C.line });
  addText(s, "Durability and delivery", 666, 434, 470, 32, { size: 24, bold: true, color: C.cyan });
  const delivery = [
    ["PostgreSQL", "Stores ordered messages and read state"],
    ["Redis", "Shares presence and messages across API processes"],
    ["Notifications", "Creates in-app alerts and durable email work"],
  ];
  delivery.forEach((it, i) => {
    addText(s, String(i + 1).padStart(2, "0"), 666, 482 + i * 42, 38, 24, { size: 14, bold: true, color: C.amber });
    addText(s, it[0], 712, 478 + i * 42, 142, 28, { size: 16, bold: true });
    addText(s, it[1], 858, 476 + i * 42, 322, 34, { size: 14, color: C.muted });
  });
  addFooter(s);
  addNotes(s, "Walk through the connection from left to right. The authenticated client first requests a short-lived socket ticket. The WebSocket endpoint checks the session identity, authorization version, application access, and current recruitment stage. Each accepted message goes to PostgreSQL so history and read state remain durable. Redis distributes presence and messages across API processes. Workflow events also create in-app notifications and durable email work.");
}

// 16. Files and privacy
{
  const s = presentation.slides.add();
  addHeader(s, "Private files and account data", "Privacy", 16);
  addText(s, "CVs and identity data require stricter controls than public offer content.", 64, 144, 1040, 34, { size: 22, color: C.muted });
  labelBox(s, "Upload validation", "File type, size, authentication and ownership checks", 64, 210, 350, 126, C.cyan);
  labelBox(s, "Private storage", "Backend service credentials access Supabase buckets", 465, 210, 350, 126, C.purple);
  labelBox(s, "Controlled download", "The API authorizes access before returning an asset", 866, 210, 350, 126, C.green);
  addText(s, "Account lifecycle", 64, 394, 260, 34, { size: 25, bold: true, color: C.amber });
  stepBox(s, 1, "Export", "JSON, CSV, and XML account data", 64, 450, 348, C.blue);
  stepBox(s, 2, "Schedule deletion", "Reauthentication and seven-day cancellation window", 466, 450, 348, C.red);
  stepBox(s, 3, "Remove and anonymize", "Delete private files and protect workflow integrity", 868, 450, 348, C.green);
  addBox(s, 64, 586, 1152, 54, { fill: C.bg2, line: C.line, shadow: false });
  addText(s, "Privacy rule", 86, 598, 150, 28, { size: 18, bold: true, color: C.cyan });
  addText(s, "The backend exposes only the minimum data required for the current user and action.", 236, 592, 950, 38, { size: 19, color: C.muted });
  addFooter(s);
  addNotes(s, "CVs, avatars, and logos do not belong in a public bucket. The backend validates uploads and stores assets privately. Downloads pass through authorization rules. Account controls support export, validated import, scheduled deletion, a cancellation period, file removal, and anonymization of records that must remain for recruitment integrity.");
}

// 17. Reliability and operations
{
  const s = presentation.slides.add();
  addHeader(s, "Reliability and production operations", "Deployment", 17);
  addText(s, "The backend includes the controls needed to run and diagnose the system in production.", 64, 144, 1120, 34, { size: 22, color: C.muted });
  const ops = [
    ["Health", "Liveness and readiness checks cover required components", C.green],
    ["Logging", "Structured events include routes and traceable error IDs", C.blue],
    ["Metrics", "Prometheus request and service measurements", C.cyan],
    ["Secrets", "Environment boundaries with Vault support and startup checks", C.purple],
    ["Ingress", "TLS, HSTS, same-origin routing and WAF rules", C.red],
    ["Deployment", "Docker images, Compose services and Ansible automation", C.amber],
  ];
  ops.forEach((it, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    labelBox(s, it[0], it[1], 64 + col * 386, 210 + row * 174, 342, 130, it[2]);
  });
  addBox(s, 64, 574, 1114, 56, { fill: C.bg2, line: C.line });
  addText(s, "Production boundary", 84, 584, 210, 28, { size: 19, bold: true, color: C.amber });
  addText(s, "Public traffic reaches Nginx. Database, Redis, workers, and internal service ports remain private.", 294, 580, 850, 34, { size: 18, color: C.muted });
  addFooter(s);
  addNotes(s, "A backend is complete only when the team can operate it. Health and readiness endpoints distinguish a running process from a usable service. Structured logs and Prometheus metrics help diagnose failures. Nginx handles TLS and public routing. Docker packages the services, while Ansible applies deployment steps consistently. Internal ports stay private.");
}

// 18. Testing and demo
{
  const s = presentation.slides.add();
  addHeader(s, "Testing and live demonstration", "Evidence", 18);
  addText(s, "Repository snapshot: 53 test files and 365 test functions, plus one end-to-end workflow for the staff session.", 74, 144, 1080, 42, { size: 20, color: C.muted });
  addBox(s, 64, 202, 542, 410, { fill: C.bg2, line: C.line });
  addText(s, "Automated coverage", 92, 224, 460, 34, { size: 25, bold: true, color: C.cyan });
  const tests = [
    "Authentication, OTP, two-factor and revocation",
    "Role permissions and cross-company isolation",
    "Database integrity and concurrent users",
    "Applications, invitations and account lifecycle",
    "WebSockets, chat history and read events",
    "AI jobs, uploads, health and deployment readiness",
  ];
  tests.forEach((t, i) => {
    addBox(s, 92, 278 + i * 49, 14, 14, { geometry: "ellipse", fill: i % 2 ? C.purple : C.cyan, line: "none", lineWidth: 0 });
    addText(s, t, 122, 268 + i * 49, 450, 36, { size: 17, color: C.muted });
  });
  addBox(s, 650, 202, 566, 410, { fill: C.bg2, line: C.line });
  addText(s, "Suggested live demo", 680, 224, 476, 34, { size: 25, bold: true, color: C.amber });
  const demo = [
    ["01", "Authenticate", "Show login and protected API identity"],
    ["02", "Create or select offer", "Explain validation and company permission"],
    ["03", "Submit application", "Show CV snapshot and database relation"],
    ["04", "Process AI job", "Follow outbox, worker and stored result"],
    ["05", "Open chat", "Show ticket, WebSocket and persisted message"],
  ];
  demo.forEach((d, i) => {
    addText(s, d[0], 680, 280 + i * 59, 44, 30, { size: 16, bold: true, color: C.cyan });
    addText(s, d[1], 730, 276 + i * 59, 172, 28, { size: 18, bold: true });
    addText(s, d[2], 902, 272 + i * 59, 270, 40, { size: 14, color: C.muted });
  });
  addFooter(s);
  addNotes(s, "Tests prove isolated behavior, while the demo proves that the parts work together. During the demo, explain the backend effect of every click. Show authentication, one permission decision, an application record, an asynchronous AI job, and a persisted chat message. Keep database or logs ready so staff can see the server-side result.");
}

// 19. Closing
{
  const s = presentation.slides.add();
  addHeader(s, "Lessons and next improvements", "Conclusion", 19);
  addText(s, "What I learned while building the CODITENT backend", 64, 148, 880, 34, { size: 22, color: C.muted });
  labelBox(s, "Authorization needs current state", "A valid token cannot replace role, tenant and ownership checks", 64, 212, 540, 116, C.cyan);
  labelBox(s, "Database rules support security", "Constraints and transactions protect workflows when application code fails", 64, 350, 540, 116, C.green);
  labelBox(s, "Slow work needs durability", "Outboxes and workers protect AI and email jobs from process restarts", 64, 488, 540, 116, C.purple);
  addText(s, "Next improvements", 700, 212, 420, 36, { size: 28, bold: true, color: C.amber });
  const improvements = [
    "Expand load and stress testing",
    "Add distributed tracing across API and workers",
    "Improve job retry and failure dashboards",
    "Profile expensive queries and indexes",
    "Extend end-to-end workflow coverage",
  ];
  improvements.forEach((t, i) => {
    addText(s, String(i + 1).padStart(2, "0"), 700, 276 + i * 52, 42, 28, { size: 15, bold: true, color: C.cyan });
    addText(s, t, 752, 270 + i * 52, 420, 38, { size: 19, color: C.muted });
  });
  addText(s, "Questions?", 700, 574, 430, 54, { size: 38, bold: true, color: C.ink });
  addFooter(s, "CODITENT  /  THANK YOU");
  addNotes(s, "Close with the engineering lessons rather than a feature list. Current database state must drive authorization. Database constraints support application security. Durable queues protect slow external work. Then mention the improvements honestly. Invite questions and be ready to open the code for any component discussed in the deck.");
}

async function writeBlob(filePath, blob) {
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}

await fs.mkdir(buildDir, { recursive: true });
await fs.mkdir(outputDir, { recursive: true });

for (const [index, slide] of presentation.slides.items.entries()) {
  const png = await presentation.export({ slide, format: "png", scale: 1 });
  await writeBlob(path.join(buildDir, `slide-${String(index + 1).padStart(2, "0")}.png`), png);
}
const montage = await presentation.export({ format: "webp", montage: true });
await writeBlob(path.join(buildDir, "montage.webp"), montage);

const { finalizePresentation } = await import(pathToFileURL(
  path.join(SKILL_DIR, "container_tools/artifact_tool_utils.mjs")
).href);
const stagingDir = path.join(buildDir, "finalizer");
await fs.mkdir(stagingDir, { recursive: true });
const candidatePath = path.join(stagingDir, "candidate.pptx");
await (await PresentationFile.exportPptx(presentation)).save(candidatePath);

const result = await finalizePresentation({
  explicitTotalSlideCount: 19,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [],
  workspaceDir,
  candidatePath,
  finalPath: FINAL_PPTX,
  pythonExecutable: RUNTIME_PYTHON,
  integrityValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_layout_geometry.py"),
  layoutArgs: [
    "--expected-slide-size-emu", "12192000,6858000",
    "--validate-bullet-geometry",
    "--validate-heading-fit",
  ],
  fontPolicy: { basis: "design", families: [BODY_FONT, TITLE_FONT] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(stagingDir, "coditent-backend-presentation-polished-final.validation.json"),
});

console.log(JSON.stringify({ final: FINAL_PPTX, slides: presentation.slides.items.length, result }, null, 2));
