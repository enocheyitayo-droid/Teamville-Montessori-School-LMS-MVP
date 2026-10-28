import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getConnectionString } from "@netlify/database";
import { PostgresDatabase } from "./postgres";

export type DemoRole = "school_admin" | "teacher" | "bursar" | "guardian";
export type DemoContext = { id: string; role: DemoRole; expires_at: string };
export type Pupil = { id: string; admission: string; first_name: string; last_name: string; class_name: string; guardian: string; status: string; created_at: string };
export type Payment = { id: string; student_id: string; amount: number; method: string; reference: string; status: string; receipt: string | null; created_at: string; first_name?: string; last_name?: string };
export const demoRoles: DemoRole[] = ["school_admin", "teacher", "bursar", "guardian"];
export const classes = ["Nursery 1", "Nursery 2", "Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6"];
export const subjects = ["Mathematics", "English Language", "Basic Science", "Social Studies"];
export const schoolDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export function demoEnabled() { return process.env.ENABLE_DEMO === "true" || (process.env.NODE_ENV !== "production" && process.env.ENABLE_DEMO !== "false"); }
let store: DatabaseSync | PostgresDatabase | undefined;
export function db() {
  if (!demoEnabled()) notFound();
  if (store) return store;
  if(process.env.DEMO_DATABASE_URL||process.env.NETLIFY_DB_URL||process.env.NETLIFY==="true"){
    const url=process.env.DEMO_DATABASE_URL||getConnectionString();
    store=new PostgresDatabase(url);return store;
  }
  const dir = process.env.DEMO_DB_DIRECTORY || join(process.cwd(), ".data");
  mkdirSync(dir, { recursive: true });
  store = new DatabaseSync(join(dir, "teamville-demo.sqlite"));
  store.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, role TEXT NOT NULL CHECK(role IN ('school_admin','teacher','bursar','guardian')), expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pupils (id TEXT NOT NULL, workspace TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, admission TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, class_name TEXT NOT NULL, guardian TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(workspace,id), UNIQUE(workspace,admission));
    CREATE TABLE IF NOT EXISTS attendance (workspace TEXT NOT NULL, student_id TEXT NOT NULL, school_date TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('Present','Absent','Late','Excused')), recorded_by TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(workspace,student_id,school_date), FOREIGN KEY(workspace,student_id) REFERENCES pupils(workspace,id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS scores (workspace TEXT NOT NULL, student_id TEXT NOT NULL, subject TEXT NOT NULL, ca INTEGER NOT NULL CHECK(ca BETWEEN 0 AND 40), exam INTEGER NOT NULL CHECK(exam BETWEEN 0 AND 60), state TEXT NOT NULL DEFAULT 'Draft' CHECK(state IN ('Draft','Submitted','Published')), version INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(workspace,student_id,subject), FOREIGN KEY(workspace,student_id) REFERENCES pupils(workspace,id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS charges (id TEXT NOT NULL, workspace TEXT NOT NULL, student_id TEXT NOT NULL, category TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0), PRIMARY KEY(workspace,id), FOREIGN KEY(workspace,student_id) REFERENCES pupils(workspace,id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS payments (id TEXT NOT NULL, workspace TEXT NOT NULL, student_id TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0), method TEXT NOT NULL, reference TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('Pending','Verified')), receipt TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(workspace,id), UNIQUE(workspace,reference), UNIQUE(workspace,receipt), FOREIGN KEY(workspace,student_id) REFERENCES pupils(workspace,id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS notices (id TEXT NOT NULL, workspace TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, title TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(workspace,id));
    CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY, workspace TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, role TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS result_versions (id TEXT PRIMARY KEY, workspace TEXT NOT NULL, student_id TEXT NOT NULL, snapshot TEXT NOT NULL, published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(workspace,student_id) REFERENCES pupils(workspace,id) ON DELETE CASCADE);
  `);
  store.exec(`
    CREATE TABLE IF NOT EXISTS midterm_scores (workspace TEXT NOT NULL, student_id TEXT NOT NULL, subject TEXT NOT NULL, score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100), state TEXT NOT NULL DEFAULT 'Draft' CHECK(state IN ('Draft','Submitted','Published')), PRIMARY KEY(workspace,student_id,subject), FOREIGN KEY(workspace,student_id) REFERENCES pupils(workspace,id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS midterm_versions (id TEXT PRIMARY KEY, workspace TEXT NOT NULL, student_id TEXT NOT NULL, snapshot TEXT NOT NULL, published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(workspace,student_id) REFERENCES pupils(workspace,id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS staff (workspace TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, id TEXT NOT NULL, name TEXT NOT NULL, title TEXT NOT NULL, PRIMARY KEY(workspace,id));
    CREATE TABLE IF NOT EXISTS staff_payroll (workspace TEXT NOT NULL,staff_id TEXT NOT NULL,monthly_amount INTEGER NOT NULL CHECK(monthly_amount>0),PRIMARY KEY(workspace,staff_id),FOREIGN KEY(workspace,staff_id) REFERENCES staff(workspace,id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS obligations (workspace TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('Salary','Expense')),payee TEXT NOT NULL,staff_id TEXT,period TEXT,description TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),reference TEXT NOT NULL,requested_role TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Requested' CHECK(status IN ('Requested','Approved','Rejected','Paid')),approved_role TEXT,paid_at TEXT,voucher TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(workspace,id),UNIQUE(workspace,reference),FOREIGN KEY(workspace,staff_id) REFERENCES staff(workspace,id));
    CREATE UNIQUE INDEX IF NOT EXISTS salary_once ON obligations(workspace,staff_id,period) WHERE kind='Salary' AND status!='Rejected';
    CREATE TABLE IF NOT EXISTS purse_funding (workspace TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,id TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),category TEXT NOT NULL,reference TEXT NOT NULL,description TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(workspace,id),UNIQUE(workspace,reference));
    CREATE TABLE IF NOT EXISTS staff_messages (workspace TEXT NOT NULL, id TEXT NOT NULL,staff_id TEXT NOT NULL,obligation_id TEXT NOT NULL,message TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(workspace,id),UNIQUE(workspace,obligation_id),FOREIGN KEY(workspace,staff_id) REFERENCES staff(workspace,id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS disbursement_details (workspace TEXT NOT NULL,obligation_id TEXT NOT NULL,method TEXT NOT NULL,reference TEXT NOT NULL,paid_date TEXT NOT NULL,PRIMARY KEY(workspace,obligation_id),UNIQUE(workspace,reference),FOREIGN KEY(workspace,obligation_id) REFERENCES obligations(workspace,id) ON DELETE CASCADE);
  `);
  return store;
}
export function transaction<T>(action: () => T): T {
  const database = db(); database.exec("BEGIN IMMEDIATE");
  try { const result = action(); database.exec("COMMIT"); return result; }
  catch (error) { database.exec("ROLLBACK"); throw error; }
}
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
export async function demoContext(required = true): Promise<DemoContext | null> {
  if (!demoEnabled()) notFound();
  const token = (await cookies()).get("teamville_demo")?.value;
  const context = token ? db().prepare("SELECT id, role, expires_at FROM workspaces WHERE token_hash=? AND expires_at>?").get(hash(token), new Date().toISOString()) as DemoContext | undefined : null;
  if (!context && required) redirect("/demo/start");
  return context ?? null;
}
export async function requireDemo(allowed?: readonly DemoRole[]) {
  const context = (await demoContext())!;
  if (allowed && !allowed.includes(context.role)) redirect("/demo?error=permission");
  return context;
}
export function log(context: DemoContext, action: string) { db().prepare("INSERT INTO activity(id,workspace,role,action) VALUES(?,?,?,?)").run(randomUUID(), context.id, context.role, action); }

const seedPupils = [
  ["Fikayo","Adebayo","Primary 3","Mrs Adebayo"], ["Zara","Okonkwo","Primary 3","Mr Okonkwo"], ["Tomiwa","Bello","Primary 3","Mrs Bello"], ["Dara","Ojo","Primary 3","Mr Ojo"], ["Nifemi","Adeyemi","Primary 3","Mrs Adeyemi"],
  ["Chloe","Eze","Primary 1","Mrs Eze"], ["David","Lawal","Primary 1","Mr Lawal"], ["Inioluwa","Akinola","Primary 2","Mrs Akinola"], ["Maya","Obi","Primary 2","Mr Obi"], ["Daniel","Olawale","Primary 4","Mrs Olawale"],
  ["Amara","Nwosu","Primary 4","Mr Nwosu"], ["Teni","Salami","Primary 5","Mrs Salami"], ["Ife","Adekunle","Primary 5","Mr Adekunle"], ["Korede","Balogun","Primary 6","Mrs Balogun"], ["Ada","Chukwu","Primary 6","Mr Chukwu"],
  ["Zion","Ajayi","Nursery 1","Mrs Ajayi"], ["Mide","Taiwo","Nursery 1","Mr Taiwo"], ["Ella","Udo","Nursery 2","Mrs Udo"], ["Timilehin","Oni","Nursery 2","Mr Oni"], ["Kiki","Sanni","Nursery 2","Mrs Sanni"],
];
export async function createDemo(role: DemoRole) {
  const id=randomUUID(),token=randomBytes(32).toString("hex"),expires=new Date(Date.now()+7*86400000),date=schoolDate();
  const pupilRows:(string|number)[][]=[],chargeRows:(string|number)[][]=[],paymentRows:(string|number)[][]=[],attendanceRows:(string|number)[][]=[],scoreRows:(string|number)[][]=[],versionRows:(string|number)[][]=[];
  seedPupils.forEach(([first,last,className,guardian],index)=>{
    const studentId="pupil-"+(index+1),state=index%3===0?"Published":index%3===1?"Submitted":"Draft";
    pupilRows.push([studentId,id,"TV/2026/"+String(index+1).padStart(3,"0"),first,last,className,guardian]);
    for(const [category,amount] of [["Tuition",10000000],["Learning materials",1500000],["Activities",500000]] as const)chargeRows.push([randomUUID(),id,studentId,category,amount]);
    const paid=[12000000,8000000,12000000,6000000,0][index%5];
    if(paid)paymentRows.push([randomUUID(),id,studentId,paid,"Bank transfer","DEMO-SEED-"+(index+1),"Verified","TV-DEMO-"+String(index+1).padStart(4,"0")]);
    attendanceRows.push([id,studentId,date,index===4||index===12?"Absent":index===7?"Late":"Present","Demonstration seed"]);
    const scores=subjects.map((subject,subjectIndex)=>({subject,ca:25+(index+subjectIndex)%15,exam:35+(index*3+subjectIndex)%25,version:1}));
    for(const score of scores)scoreRows.push([id,studentId,score.subject,score.ca,score.exam,state]);
    if(state==="Published")versionRows.push([randomUUID(),id,studentId,JSON.stringify(scores.sort((a,b)=>a.subject.localeCompare(b.subject)))]);
  });
  // Internal table/column constants only. Values remain parameterised, in one
  // atomic transaction; seeding no longer requires hundreds of network trips.
  const insert=(table:string,columns:string,rows:(string|number)[][])=>{
    if(!rows.length)return;
    const placeholders=rows.map(row=>"("+row.map(()=>"?").join(",")+")").join(",");
    db().prepare("INSERT INTO "+table+"("+columns+") VALUES "+placeholders).run(...rows.flat());
  };
  transaction(()=>{
    db().prepare("DELETE FROM workspaces WHERE expires_at < ?").run(new Date().toISOString());
    db().prepare("INSERT INTO workspaces VALUES(?,?,?,?)").run(id,hash(token),role,expires.toISOString());
    insert("pupils","id,workspace,admission,first_name,last_name,class_name,guardian",pupilRows);
    insert("charges","id,workspace,student_id,category,amount",chargeRows);
    insert("payments","id,workspace,student_id,amount,method,reference,status,receipt",paymentRows);
    insert("attendance","workspace,student_id,school_date,status,recorded_by",attendanceRows);
    insert("scores","workspace,student_id,subject,ca,exam,state",scoreRows);
    insert("result_versions","id,workspace,student_id,snapshot",versionRows);
    insert("notices","id,workspace,title,message",[
      ["Welcome to a new term","Our demonstration workspace is ready. Explore admissions, attendance, learning, and finance with fictional records."],
      ["Parent–teacher conversations","Sample notice: book a time with your child’s class teacher to discuss learning progress."],
      ["A note on school fees","Sample notice: view your fee statement in the parent portal. Offline payments are credited only after verification."]
    ].map(([title,message])=>[randomUUID(),id,title,message]));
    insert("staff","workspace,id,name,title",[
      [id,"staff-1","Mrs Demo Adeola","Primary 3 teacher"],[id,"staff-2","Mr Demo Chidi","Primary 1 teacher"],[id,"staff-3","Mrs Demo Bisi","Nursery teacher"]
    ]);
    insert("staff_payroll","workspace,staff_id,monthly_amount",[[id,"staff-1",12000000],[id,"staff-2",11000000],[id,"staff-3",10000000]]);
    log({id,role,expires_at:expires.toISOString()},"Demonstration workspace created with fictional records");
  });
  (await cookies()).set("teamville_demo",token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/demo",expires});
}

export function pupilScope(context: DemoContext) {
  return context.role === "guardian" ? " AND id='pupil-1'" : context.role === "teacher" ? " AND class_name='Primary 3'" : "";
}
export function pupils(context: DemoContext, query = "", className = "") {
  const rows = db().prepare(`SELECT * FROM pupils WHERE workspace=? ${pupilScope(context)} AND lower(first_name || ' ' || last_name || ' ' || admission) LIKE lower(?) AND (?='' OR class_name=?) ORDER BY first_name`).all(context.id,`%${query}%`,className,className) as Pupil[];
  // node:sqlite returns null-prototype rows; React client props need plain objects.
  return rows.map(row => ({ ...row }));
}
export function findPupil(context: DemoContext, id: string) {
  return db().prepare(`SELECT * FROM pupils WHERE workspace=? AND id=? ${pupilScope(context)}`).get(context.id,id) as Pupil | undefined;
}
export function statement(context: DemoContext, studentId: string) {
  if (!findPupil(context,studentId)) return null;
  const charges = db().prepare("SELECT id,category,amount FROM charges WHERE workspace=? AND student_id=?").all(context.id,studentId) as {id:string;category:string;amount:number}[];
  const payments = db().prepare("SELECT * FROM payments WHERE workspace=? AND student_id=? ORDER BY created_at DESC").all(context.id,studentId) as Payment[];
  const billed = charges.reduce((sum,c)=>sum+c.amount,0), paid = payments.filter(p=>p.status==="Verified").reduce((sum,p)=>sum+p.amount,0);
  return {charges,payments,billed,paid,balance:billed-paid};
}
// Read totals in batches rather than three database trips for every pupil.
// Always build the returned list from the caller's authorised pupil scope.
export function feeAccounts(context:DemoContext,query="",className=""){
  const register=pupils(context,query,className);
  const charges=db().prepare("SELECT student_id,sum(amount) AS amount FROM charges WHERE workspace=? GROUP BY student_id").all(context.id) as {student_id:string;amount:number}[];
  const payments=db().prepare("SELECT student_id,sum(amount) AS amount FROM payments WHERE workspace=? AND status='Verified' GROUP BY student_id").all(context.id) as {student_id:string;amount:number}[];
  const billedByPupil=new Map(charges.map(row=>[row.student_id,row.amount])),paidByPupil=new Map(payments.map(row=>[row.student_id,row.amount]));
  return register.map(pupil=>{const billed=billedByPupil.get(pupil.id)??0,paid=paidByPupil.get(pupil.id)??0;return {pupil,billed,paid,balance:billed-paid};});
}
export function money(kobo: number) { return new Intl.NumberFormat("en-NG", { style:"currency",currency:"NGN",maximumFractionDigits:0 }).format(kobo/100); }
