import "server-only";
import { randomUUID } from "node:crypto";
import { db, findPupil, log, pupils, subjects, type DemoContext } from "./store";
export type Period="exam"|"midterm";
export type Score={subject:string;ca:number;exam:number;state:string;version:number};
export function resultPeriod(value:unknown):Period{return value==="midterm"?"midterm":"exam";}
export function resultRows(context:DemoContext,studentId:string,period:Period):Score[]{
  if(!findPupil(context,studentId))return [];
  return period==="midterm"?db().prepare("SELECT subject,0 AS ca,score AS exam,state,1 AS version FROM midterm_scores WHERE workspace=? AND student_id=? ORDER BY subject").all(context.id,studentId) as Score[]:db().prepare("SELECT * FROM scores WHERE workspace=? AND student_id=? ORDER BY subject").all(context.id,studentId) as Score[];
}
export function publishScores(context:DemoContext,studentId:string,period:Period){
  if(!["teacher","school_admin"].includes(context.role)||!findPupil(context,studentId))throw new Error("permission");
  const rows=resultRows(context,studentId,period);
  if(rows.length!==subjects.length||!subjects.every(subject=>rows.filter(r=>r.subject===subject).length===1))throw new Error("workflow");
  if(rows.every(r=>r.state==="Published"))return;
  if(rows.some(r=>r.state==="Published"))throw new Error("workflow");
  db().prepare(`INSERT INTO ${period==="midterm"?"midterm_versions":"result_versions"}(id,workspace,student_id,snapshot) VALUES(?,?,?,?)`).run(randomUUID(),context.id,studentId,JSON.stringify(rows));
  db().prepare(`UPDATE ${period==="midterm"?"midterm_scores":"scores"} SET state='Published' WHERE workspace=? AND student_id=?`).run(context.id,studentId);
  log(context,`Published ${period} results for ${studentId} directly to the pupil portal; reference copy available to school administrator`);
}
export function classLeaderboard(context:DemoContext,className:string,period:Period){
  if(!["teacher","school_admin","guardian"].includes(context.role))throw new Error("permission");
  const allowed=pupils(context);if(!allowed.some(p=>p.class_name===className))throw new Error("permission");
  const table=period==="midterm"?"midterm_scores":"scores",sum=period==="midterm"?"s.score":"s.ca+s.exam";
  const marks= db().prepare(`SELECT p.id,p.first_name || ' ' || p.last_name AS name,sum(${sum}) AS total,count(*) AS subject_count FROM pupils p JOIN ${table} s ON s.workspace=p.workspace AND s.student_id=p.id WHERE p.workspace=? AND p.class_name=? AND p.status='Active' AND s.state='Published' AND s.subject IN (?,?,?,?) GROUP BY p.id,p.first_name,p.last_name HAVING count(*)=? ORDER BY total DESC,p.first_name,p.last_name,p.id`).all(context.id,className,...subjects,subjects.length) as {id:string;name:string;total:number;subject_count:number}[];
  const enrolled=(db().prepare("SELECT count(*) AS n FROM pupils WHERE workspace=? AND class_name=? AND status='Active'").get(context.id,className) as {n:number}).n;
  let position=0,prior:number|undefined;
  const rows=marks.map((m,index)=>{
    if(m.total!==prior)position=index+1;prior=m.total;
    const own=allowed.some(p=>p.id===m.id),visible=context.role!=="guardian"||own;
    return {id:visible?m.id:undefined,name:visible?m.name:"Classmate",position,total:visible?m.total:null,average:visible?m.total/subjects.length:null,isOwn:context.role==="guardian"&&own};
  });
  return {rows,enrolled,published:rows.length,provisional:rows.length<enrolled};
}
export function classScoreSheet(context:DemoContext,className:string,period:Period){
  if(!["teacher","school_admin"].includes(context.role))throw new Error("permission");
  const board=classLeaderboard(context,className,period);
  return pupils(context,"",className).map(p=>{
    const rows=resultRows(context,p.id,period),complete=rows.length===subjects.length;
    const total=complete?rows.reduce((sum,r)=>sum+r.ca+r.exam,0):null;
    return {pupil:p,rows,total,average:total===null?null:total/subjects.length,position:board.rows.find(r=>r.id===p.id)?.position,state:complete&&rows.every(r=>r.state==="Published")?"Published":"Draft"};
  });
}
export function storeScores(context:DemoContext,studentId:string,period:Period,rows:{subject:string;ca:number;exam:number}[]){
  if(!["teacher","school_admin"].includes(context.role)||!findPupil(context,studentId))throw new Error("permission");
  if(resultRows(context,studentId,period).some(r=>r.state==="Published"))throw new Error("published");
  if(rows.length!==subjects.length||!subjects.every(subject=>rows.filter(r=>r.subject===subject).length===1)||rows.some(r=>!Number.isInteger(r.ca)||!Number.isInteger(r.exam)||r.ca<0||r.exam<0||(period==="midterm"?(r.ca!==0||r.exam>100):(r.ca>40||r.exam>60))))throw new Error("invalid");
  for(const row of rows){
    if(period==="midterm")db().prepare("INSERT INTO midterm_scores(workspace,student_id,subject,score) VALUES(?,?,?,?) ON CONFLICT(workspace,student_id,subject) DO UPDATE SET score=excluded.score,state='Draft'").run(context.id,studentId,row.subject,row.exam);
    else db().prepare("INSERT INTO scores(workspace,student_id,subject,ca,exam) VALUES(?,?,?,?,?) ON CONFLICT(workspace,student_id,subject) DO UPDATE SET ca=excluded.ca,exam=excluded.exam,state='Draft'").run(context.id,studentId,row.subject,row.ca,row.exam);
  }
  log(context,`Saved ${period} draft scores for ${studentId}`);
}
