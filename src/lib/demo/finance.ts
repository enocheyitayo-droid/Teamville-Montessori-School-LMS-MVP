import "server-only";
import { db,feeAccounts,type DemoContext } from "./store";
export type Obligation={id:string;kind:string;payee:string;staff_id:string|null;period:string|null;description:string;amount:number;reference:string;requested_role:string;status:string;approved_role:string|null;paid_at:string|null;voucher:string|null;created_at:string};
export function ensureStaff(context:DemoContext){
  // Backfills existing demo workspaces as well as new walkthroughs.
  const ready=db().prepare("SELECT count(*) AS n FROM staff s JOIN staff_payroll p ON p.workspace=s.workspace AND p.staff_id=s.id WHERE s.workspace=? AND s.id IN ('staff-1','staff-2','staff-3')").get(context.id) as {n:number};
  if(ready.n===3)return;
  for(const [id,name,title] of [["staff-1","Mrs Demo Adeola","Primary 3 teacher"],["staff-2","Mr Demo Chidi","Primary 1 teacher"],["staff-3","Mrs Demo Bisi","Nursery teacher"]]) db().prepare("INSERT OR IGNORE INTO staff VALUES(?,?,?,?)").run(context.id,id,name,title);
  for(const [id,amount] of [["staff-1",12000000],["staff-2",11000000],["staff-3",10000000]] as const) db().prepare("INSERT OR IGNORE INTO staff_payroll VALUES(?,?,?)").run(context.id,id,amount);
}
export function debtors(context:DemoContext,className="",query="",status="all"){
  if(!["school_admin","bursar"].includes(context.role))throw new Error("permission");
  return feeAccounts(context,query,className).filter(a=>a.balance>0&&(status!=="unpaid"||a.paid===0)&&(status!=="part"||a.paid>0));
}
export function purse(context:DemoContext){
  const total=(sql:string)=>(db().prepare(sql).get(context.id) as {n:number}).n;
  const fees=total("SELECT coalesce(sum(amount),0) AS n FROM payments WHERE workspace=? AND status='Verified'");
  const funding=total("SELECT coalesce(sum(amount),0) AS n FROM purse_funding WHERE workspace=?");
  const spent=total("SELECT coalesce(sum(amount),0) AS n FROM obligations WHERE workspace=? AND status='Paid'");
  const owed=total("SELECT coalesce(sum(amount),0) AS n FROM obligations WHERE workspace=? AND status IN ('Requested','Approved')");
  return {fees,funding,spent,owed,balance:fees+funding-spent};
}
export function cashbook(context:DemoContext){
  if(!["school_admin","bursar"].includes(context.role))throw new Error("permission");
  const income=db().prepare("SELECT id,created_at,reference,'Verified pupil fee payment' AS description,amount AS money_in,0 AS money_out FROM payments WHERE workspace=? AND status='Verified'").all(context.id);
  const funding=db().prepare("SELECT id,created_at,reference,category || ': ' || description AS description,amount AS money_in,0 AS money_out FROM purse_funding WHERE workspace=?").all(context.id);
  const outgoing=db().prepare("SELECT o.id,o.paid_at AS created_at,d.reference,o.kind || ': ' || o.payee AS description,0 AS money_in,o.amount AS money_out FROM obligations o JOIN disbursement_details d ON d.workspace=o.workspace AND d.obligation_id=o.id WHERE o.workspace=? AND o.status='Paid'").all(context.id);
  const entries=[...income,...funding,...outgoing] as {id:string;created_at:string;reference:string;description:string;money_in:number;money_out:number}[];
  entries.sort((a,b)=>a.created_at.localeCompare(b.created_at)||b.money_in-a.money_in||a.id.localeCompare(b.id));
  let running=0;return entries.map(e=>({...e,balance:running+=e.money_in-e.money_out}));
}
