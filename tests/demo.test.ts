import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const jar = vi.hoisted(()=>new Map<string,string>());
vi.mock("server-only",()=>({}));
vi.mock("next/headers",()=>({cookies:async()=>({get:(name:string)=>jar.has(name)?{value:jar.get(name)}:undefined,set:(name:string,value:string)=>jar.set(name,value),delete:(name:string|{name:string})=>jar.delete(typeof name==="string"?name:name.name)})}));
vi.mock("next/navigation",()=>({redirect:(path:string)=>{throw new Error(`REDIRECT:${path}`);},notFound:()=>{throw new Error("NOT_FOUND");}}));
vi.mock("next/cache",()=>({revalidatePath:()=>undefined}));

import { createDemo, db, demoContext, feeAccounts, findPupil, pupils, requireDemo, schoolDate, statement, subjects } from "@/lib/demo/store";
import { admitPupil, changeResultState, recordPayment, saveAttendance, saveScores, switchDemoRole, verifyPayment } from "@/lib/demo/actions";
import { addCharge,addFunding,approveDisbursement,payDisbursement,requestDisbursement,uploadResults } from "@/lib/demo/extended-actions";
import { cashbook,debtors,purse } from "@/lib/demo/finance";
import { classLeaderboard,classScoreSheet,resultRows } from "@/lib/demo/results";
import { parseCsv,toCsv } from "@/lib/demo/csv";

const directory=mkdtempSync(join(tmpdir(),"teamville-test-"));
process.env.DEMO_DB_DIRECTORY=directory;
process.env.ENABLE_DEMO="true";
function form(values:Record<string,string>){const data=new FormData();Object.entries(values).forEach(([k,v])=>data.set(k,v));return data;}
async function changeRole(role:string){await expect(switchDemoRole(form({role}))).rejects.toThrow("REDIRECT:/demo?success=role");}
beforeEach(async()=>{jar.clear();await createDemo("school_admin");});
afterAll(()=>{db().close();rmSync(directory,{recursive:true,force:true});});

describe("demo isolation and authorisation",()=>{
  it("batch fee totals match detailed accounts and exclude pending payments",async()=>{
    const context=(await demoContext())!;
    db().prepare("INSERT INTO payments(id,workspace,student_id,amount,method,reference,status) VALUES(?,?,?,?,?,?,?)").run("pending-batch-test",context.id,"pupil-2",100000,"Cash","PENDING-BATCH","Pending");
    const summaries=feeAccounts(context);
    expect(summaries).toHaveLength(20);
    for(const account of summaries){const detailed=statement(context,account.pupil.id)!;expect([account.billed,account.paid,account.balance]).toEqual([detailed.billed,detailed.paid,detailed.balance]);}
    await changeRole("guardian");
    expect(feeAccounts((await demoContext())!).map(account=>account.pupil.id)).toEqual(["pupil-1"]);
    await changeRole("teacher");
    expect(feeAccounts((await demoContext())!).every(account=>account.pupil.class_name==="Primary 3")).toBe(true);
  });
  it("isolates every demo workspace even when pupil IDs are identical",async()=>{
    const a=(await demoContext())!,tokenA=jar.get("teamville_demo")!;
    db().prepare("UPDATE pupils SET first_name='Workspace A' WHERE workspace=? AND id='pupil-1'").run(a.id);
    await createDemo("school_admin");const b=(await demoContext())!;
    expect(findPupil(b,"pupil-1")?.first_name).toBe("Fikayo");
    jar.set("teamville_demo",tokenA);expect(findPupil((await demoContext())!,"pupil-1")?.first_name).toBe("Workspace A");
  });
  it("rejects a forged or expired demo cookie",async()=>{
    jar.set("teamville_demo","forged");expect(await demoContext(false)).toBeNull();
    await expect(requireDemo()).rejects.toThrow("REDIRECT:/demo/start");
  });
  it("limits teachers to assigned pupils and denies financial actions",async()=>{
    await changeRole("teacher");const context=(await demoContext())!;
    expect(pupils(context)).toHaveLength(5);expect(findPupil(context,"pupil-6")).toBeUndefined();
    await expect(recordPayment(form({student_id:"pupil-1",amount:"100",method:"Cash",reference:"test"}))).rejects.toThrow("REDIRECT:/demo?error=permission");
  });
  it("limits the parent to their linked child and rejects admissions",async()=>{
    await changeRole("guardian");const context=(await demoContext())!;
    expect(pupils(context).map(p=>p.id)).toEqual(["pupil-1"]);expect(findPupil(context,"pupil-2")).toBeUndefined();
    await expect(admitPupil(form({first_name:"Test",last_name:"Pupil",class_name:"Primary 3",guardian:"Demo Guardian"}))).rejects.toThrow("error=permission");
  });
  it("does not accept unknown demo roles",async()=>{await expect(switchDemoRole(form({role:"platform_admin"}))).rejects.toThrow("error=invalid");});
});
describe("school workflows",()=>{
  it("saves admissions with unique admission numbers and rejects duplicates",async()=>{
    const data=form({first_name:"Demo",last_name:"Learner",class_name:"Primary 3",guardian:"Demo Guardian"});
    await expect(admitPupil(data)).rejects.toThrow("success=admitted");
    const context=(await demoContext())!;expect(pupils(context)).toHaveLength(21);
    expect(pupils(context,"Demo Learner")[0].admission).toBe("TV/2026/021");
    await expect(admitPupil(data)).rejects.toThrow("error=duplicate");
  });
  it("upserts attendance without duplicates and audits corrections",async()=>{
    const context=(await demoContext())!,register=pupils(context,"","Primary 3");
    const values:Record<string,string>={date:schoolDate(),class:"Primary 3"};register.forEach(p=>values[`status_${p.id}`]="Present");
    await expect(saveAttendance(form(values))).rejects.toThrow("success=attendance");
    values.status_pupil_dummy="Absent";values["status_pupil-1"]="Absent";
    await expect(saveAttendance(form(values))).rejects.toThrow("success=attendance");
    const count=db().prepare("SELECT count(*) as n FROM attendance WHERE workspace=? AND school_date=?").get(context.id,schoolDate()) as {n:number};expect(count.n).toBe(20);
    expect((db().prepare("SELECT status FROM attendance WHERE workspace=? AND student_id='pupil-1' AND school_date=?").get(context.id,schoolDate()) as {status:string}).status).toBe("Absent");
    expect((db().prepare("SELECT count(*) as n FROM activity WHERE workspace=? AND action LIKE 'Saved / corrected attendance%'").get(context.id) as {n:number}).n).toBe(2);
  });
  it("rejects invalid attendance values and impossible dates",async()=>{
    await expect(saveAttendance(form({class:"Primary 3",date:"2026-99-99"}))).rejects.toThrow("error=invalid");
    await expect(saveAttendance(form({class:"Primary 3",date:schoolDate(),"status_pupil-1":"Unknown"}))).rejects.toThrow("error=invalid");
  });
  it("rejects invalid/missing scores and preserves published marks",async()=>{
    const values:Record<string,string>={student_id:"pupil-3"};subjects.forEach((_,i)=>{values[`ca_${i}`]="35";values[`exam_${i}`]="55";});
    values.ca_0="41";await expect(saveScores(form(values))).rejects.toThrow("error=invalid");values.ca_0="35";
    await expect(saveScores(form(values))).rejects.toThrow("success=scores");
    await expect(changeResultState(form({student_id:"pupil-3",state:"Submitted"}))).rejects.toThrow("success=submitted");
    await changeRole("teacher");await expect(changeResultState(form({student_id:"pupil-3",state:"Published"}))).rejects.toThrow("success=published");
    await expect(saveScores(form(values))).rejects.toThrow("error=published");
    const context=(await demoContext())!;expect((db().prepare("SELECT count(*) as n FROM result_versions WHERE workspace=? AND student_id='pupil-3'").get(context.id) as {n:number}).n).toBe(1);
  });
});
describe("financial accountability",()=>{
  it("excludes pending payments, credits verified partial payments once, and issues a receipt",async()=>{
    const context=(await demoContext())!,before=statement(context,"pupil-2")!;expect(before.balance).toBe(4000000);
    await expect(recordPayment(form({student_id:"pupil-2",amount:"10000",method:"Bank transfer",reference:"DEMO-TEST-PAYMENT"}))).rejects.toThrow("success=payment");
    let account=statement(context,"pupil-2")!;expect(account.balance).toBe(before.balance);
    const pending=account.payments.find(p=>p.reference==="DEMO-TEST-PAYMENT")!;expect(pending.receipt).toBeNull();
    const data=form({payment_id:pending.id});await expect(verifyPayment(data)).rejects.toThrow("success=verified");
    account=statement(context,"pupil-2")!;expect(account.balance).toBe(3000000);expect(account.payments.find(p=>p.id===pending.id)?.receipt).toMatch(/^TV-DEMO-/);
    await expect(verifyPayment(data)).rejects.toThrow("success=verified");expect(statement(context,"pupil-2")!.balance).toBe(3000000);
  });
  it("rejects duplicate references, overpayments, and invalid amounts",async()=>{
    await expect(recordPayment(form({student_id:"pupil-2",amount:"10",method:"Cash",reference:"DEMO-SEED-2"}))).rejects.toThrow("error=duplicate");
    for(const amount of ["0","9999999","-1","NaN","1.001"]) await expect(recordPayment(form({student_id:"pupil-2",amount,method:"Cash",reference:"INVALID"}))).rejects.toThrow("error=");
  });
});

describe("result uploads and separate assessments",()=>{
  function csvFile(rows:string,period="midterm"){const data=form({period});data.set("file",new File([rows],"results.csv",{type:"text/csv"}));return data;}
  const midterm=(admission:string)=>"admission,subject,score\n"+subjects.map(s=>`${admission},${s},78`).join("\n");
  it("imports mid-term marks without changing examination records",async()=>{
    await changeRole("teacher");const context=(await demoContext())!,before=resultRows(context,"pupil-3","exam");
    await expect(uploadResults(csvFile(midterm("TV/2026/003")))).rejects.toThrow("success=imported");
    expect(resultRows(context,"pupil-3","midterm").map(s=>s.exam)).toEqual([78,78,78,78]);expect(resultRows(context,"pupil-3","exam")).toEqual(before);
    expect(resultRows(context,"pupil-3","midterm").every(r=>r.state==="Published")).toBe(true);
    await expect(uploadResults(csvFile(midterm("TV/2026/003")))).rejects.toThrow("error=published");
  });
  it("rejects unassigned pupils and rolls back a whole invalid CSV",async()=>{
    await changeRole("teacher");const context=(await demoContext())!;
    await expect(uploadResults(csvFile(midterm("TV/2026/006")))).rejects.toThrow("error=permission");
    const text=midterm("TV/2026/003")+"\n"+subjects.map(s=>`TV/2026/002,${s},101`).join("\n");
    await expect(uploadResults(csvFile(text))).rejects.toThrow("error=csv");expect(resultRows(context,"pupil-3","midterm")).toHaveLength(0);
  });
  it("imports examination CA and exam marks separately from mid-term",async()=>{
    await changeRole("teacher");const context=(await demoContext())!;
    const text="admission,subject,ca,exam\n"+subjects.map(s=>`TV/2026/003,${s},36,54`).join("\n");
    await expect(uploadResults(csvFile(text,"exam"))).rejects.toThrow("success=imported");
    expect(resultRows(context,"pupil-3","exam").every(s=>s.ca===36&&s.exam===54)).toBe(true);
    expect(resultRows(context,"pupil-3","midterm")).toHaveLength(0);
  });
  it("rejects duplicated/missing subjects and supports quoted CSV safely",async()=>{
    await expect(uploadResults(csvFile("admission,subject,score\nTV/2026/003,Mathematics,88"))).rejects.toThrow("error=csv");
    expect(parseCsv('a,b\r\n"A, B","a""b"')).toEqual([["a","b"],["A, B",'a"b']]);
    expect(toCsv([["=SUM(A1)"]])).toContain("'=SUM(A1)");
  });
});
describe("teacher publication and class positions",()=>{
  it("publishes the entered marks directly, without an admin approval step",async()=>{
    await changeRole("teacher");const context=(await demoContext())!,values:Record<string,string>={student_id:"pupil-3",period:"midterm",intent:"publish"};
    subjects.forEach((_,i)=>values[`exam_${i}`]="84");
    await expect(saveScores(form(values))).rejects.toThrow("success=published");
    expect(resultRows(context,"pupil-3","midterm").every(r=>r.exam===84&&r.state==="Published")).toBe(true);
    await expect(changeResultState(form({student_id:"pupil-3",period:"midterm",state:"Published"}))).rejects.toThrow("success=published");
    expect((db().prepare("SELECT count(*) AS n FROM midterm_versions WHERE workspace=? AND student_id='pupil-3'").get(context.id) as {n:number}).n).toBe(1);
  });
  it("denies publication of unassigned pupils and guardian publication",async()=>{
    await changeRole("teacher");await expect(changeResultState(form({student_id:"pupil-6",state:"Published"}))).rejects.toThrow("error=permission");
    await changeRole("guardian");await expect(changeResultState(form({student_id:"pupil-1",state:"Published"}))).rejects.toThrow("error=permission");
  });
  it("ranks only complete published reports and uses competition ties",async()=>{
    const context=(await demoContext())!;
    db().prepare("DELETE FROM midterm_scores WHERE workspace=?").run(context.id);
    const totals=[["pupil-1",90,"Published"],["pupil-2",80,"Published"],["pupil-3",80,"Published"],["pupil-4",70,"Published"],["pupil-5",100,"Draft"]];
    for(const [id,score,state] of totals)for(const subject of subjects)db().prepare("INSERT INTO midterm_scores(workspace,student_id,subject,score,state) VALUES(?,?,?,?,?)").run(context.id,id,subject,score,state);
    let board=classLeaderboard(context,"Primary 3","midterm");expect(board.rows.map(r=>r.position)).toEqual([1,2,2,4]);expect(board.published).toBe(4);expect(board.enrolled).toBe(5);expect(board.provisional).toBe(true);
    db().prepare("DELETE FROM midterm_scores WHERE workspace=? AND student_id='pupil-1' AND subject='Mathematics'").run(context.id);
    board=classLeaderboard(context,"Primary 3","midterm");expect(board.rows.map(r=>r.id)).not.toContain("pupil-1");
  });
  it("lets families see their own position without exposing classmates’ identities or marks",async()=>{
    await changeRole("guardian");const context=(await demoContext())!,board=classLeaderboard(context,"Primary 3","exam");
    expect(board.rows.find(r=>r.isOwn)?.id).toBe("pupil-1");
    const peer=board.rows.find(r=>!r.isOwn)!;expect(peer.name).toBe("Classmate");expect(peer.id).toBeUndefined();expect(peer.total).toBeNull();expect(peer.average).toBeNull();
    expect(JSON.stringify(board)).not.toContain("Dara");expect(()=>classLeaderboard(context,"Primary 1","exam")).toThrow("permission");expect(()=>classScoreSheet(context,"Primary 3","exam")).toThrow("permission");
  });
  it("keeps reference sheets limited to the teacher’s assigned class",async()=>{
    await changeRole("teacher");const context=(await demoContext())!;
    expect(classScoreSheet(context,"Primary 3","exam")).toHaveLength(5);
    expect(()=>classScoreSheet(context,"Primary 1","exam")).toThrow("permission");
  });
});

describe("debtors, payroll and school purse",()=>{
  const request=()=>form({kind:"Salary",staff_id:"staff-1",period:"2026-10",description:"October demonstration salary",amount:"120000",reference:"SAL-OCT-001"});
  it("creates a complete salary request using only the teacher and month",async()=>{
    await changeRole("bursar");const context=(await demoContext())!;
    await expect(requestDisbursement(form({kind:"Salary",staff_id:"staff-2",period:"2026-11"}))).rejects.toThrow("success=requested");
    const item=db().prepare("SELECT * FROM obligations WHERE workspace=?").get(context.id) as {amount:number;description:string;reference:string;payee:string;status:string};
    expect(item.amount).toBe(11000000);expect(item.description).toContain("November 2026");expect(item.payee).toBe("Mr Demo Chidi");expect(item.reference).toMatch(/^SAL-staff-2-202611-/);expect(item.status).toBe("Requested");
  });
  it("uses the stored salary even when submitted amount and payee are tampered with",async()=>{
    await changeRole("bursar");const context=(await demoContext())!;
    await expect(requestDisbursement(form({kind:"Salary",staff_id:"staff-1",period:"2026-12",amount:"9999999",payee:"Forged payee",reference:"FORGED",description:"Forged purpose"}))).rejects.toThrow("success=requested");
    const item=db().prepare("SELECT amount,payee,description,reference FROM obligations WHERE workspace=?").get(context.id) as {amount:number;payee:string;description:string;reference:string};
    expect(item.amount).toBe(12000000);expect(item.payee).toBe("Mrs Demo Adeola");expect(item.description).toContain("December 2026 salary");expect(item.reference).not.toBe("FORGED");
  });
  it("filters debtors by class and payment status, with computed totals",async()=>{
    const context=(await demoContext())!;expect(debtors(context,"Primary 3")).toHaveLength(3);
    expect(debtors(context,"Primary 3","","unpaid").map(r=>r.pupil.id)).toEqual(["pupil-5"]);
    expect(debtors(context,"Primary 3").reduce((s,r)=>s+r.balance,0)).toBe(22000000);
  });
  it("records opening pupil debt as a charge and prevents duplicate posting",async()=>{
    const context=(await demoContext())!,before=statement(context,"pupil-2")!.balance,data=form({student_id:"pupil-2",amount:"5000",category:"Previous term arrears",reference:"OPENING-001"});
    await expect(addCharge(data)).rejects.toThrow("success=charge");expect(statement(context,"pupil-2")!.balance).toBe(before+500000);
    await expect(addCharge(data)).rejects.toThrow("error=duplicate");
  });
  it("requires independent approval, pays once, and delivers an in-app salary slip",async()=>{
    await changeRole("bursar");const context=(await demoContext())!,opening=purse(context).balance;
    await expect(requestDisbursement(request())).rejects.toThrow("success=requested");
    const item=db().prepare("SELECT id FROM obligations WHERE workspace=?").get(context.id) as {id:string};
    const payout=form({id:item.id,payment_reference:"BANK-SAL-001",method:"Bank transfer",paid_date:schoolDate()});
    await expect(payDisbursement(payout)).rejects.toThrow("error=workflow");
    await expect(approveDisbursement(form({id:item.id,decision:"Approved"}))).rejects.toThrow("error=permission");
    await changeRole("school_admin");await expect(approveDisbursement(form({id:item.id,decision:"Approved"}))).rejects.toThrow("success=reviewed");
    await changeRole("bursar");await expect(payDisbursement(payout)).rejects.toThrow("success=disbursed");
    await expect(payDisbursement(payout)).rejects.toThrow("success=disbursed");
    expect(purse(context).balance).toBe(opening-12000000);expect(purse(context).owed).toBe(0);
    expect((db().prepare("SELECT count(*) AS n FROM staff_messages WHERE workspace=?").get(context.id) as {n:number}).n).toBe(1);
    expect(cashbook(context).at(-1)?.balance).toBe(purse(context).balance);
    await expect(requestDisbursement(request())).rejects.toThrow("error=duplicate");
  });
  it("does not overdraw the purse and keeps school payables separate from cash",async()=>{
    await changeRole("bursar");const context=(await demoContext())!,before=purse(context).balance;
    await expect(requestDisbursement(form({kind:"Expense",payee:"Demo Supplier",description:"Large unpaid supplier invoice",amount:"9999999",reference:"EXP-LARGE"}))).rejects.toThrow("success=requested");
    const item=db().prepare("SELECT id FROM obligations WHERE workspace=?").get(context.id) as {id:string};
    expect(purse(context).balance).toBe(before);expect(purse(context).owed).toBe(999999900);
    await changeRole("school_admin");await expect(approveDisbursement(form({id:item.id,decision:"Approved"}))).rejects.toThrow("success=reviewed");
    await changeRole("bursar");await expect(payDisbursement(form({id:item.id,payment_reference:"BANK-X",method:"Cash",paid_date:schoolDate()}))).rejects.toThrow("error=funds");
    expect(purse(context).balance).toBe(before);
  });
  it("records funding with audit and rejects teacher financial access",async()=>{
    await changeRole("bursar");const context=(await demoContext())!,before=purse(context).balance;
    await expect(addFunding(form({amount:"10000",category:"Other income",reference:"FUND-001",description:"Demo proprietor contribution"}))).rejects.toThrow("success=funding");
    expect(purse(context).balance).toBe(before+1000000);
    await changeRole("teacher");await expect(addCharge(form({}))).rejects.toThrow("error=permission");expect(()=>debtors(( {...context,role:"teacher"} ))).toThrow("permission");
  });
});
