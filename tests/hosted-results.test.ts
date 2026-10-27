import {afterAll,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/demo/store",()=>({
  db:()=>database,
  pupils:()=>[{id:"p1",class_name:"Primary 3"},{id:"p2",class_name:"Primary 3"}],
  subjects:["Mathematics","English Language","Basic Science","Social Studies"],
}));
import {PostgresDatabase} from "@/lib/demo/postgres";
import {classLeaderboard} from "@/lib/demo/results";
const database=new PostgresDatabase("postgresql://test",resolve("tests/fixtures/embedded-pg.cjs"));
afterAll(()=>database.close());
it("runs the real class-position query on PostgreSQL with composite pupil keys",()=>{
  database.exec(readFileSync("netlify/database/migrations/202610270001_demo.sql","utf8"));
  database.prepare("INSERT INTO workspaces VALUES(?,?,?,?)").run("hosted-board","test-token","teacher","2099-12-31");
  for(const [id,name] of [["p1","Fikayo"],["p2","Zara"]]){
    database.prepare("INSERT INTO pupils(id,workspace,admission,first_name,last_name,class_name,guardian) VALUES(?,?,?,?,?,?,?)").run(id,"hosted-board",id,name,"Test","Primary 3","Guardian");
    for(const subject of ["Mathematics","English Language","Basic Science","Social Studies"]){
      database.prepare("INSERT INTO scores(workspace,student_id,subject,ca,exam,state) VALUES(?,?,?,?,?,?)").run("hosted-board",id,subject,30,50,"Published");
      database.prepare("INSERT INTO midterm_scores(workspace,student_id,subject,score,state) VALUES(?,?,?,?,?)").run("hosted-board",id,subject,id==="p1"?90:80,"Published");
    }
  }
  const context={id:"hosted-board",role:"teacher" as const,expires_at:"2099-12-31"};
  const exam=classLeaderboard(context,"Primary 3","exam");
  expect(exam.rows.map(r=>r.position)).toEqual([1,1]);
  expect(exam.rows[0].name).toBe("Fikayo Test");
  expect(exam.provisional).toBe(false);
  expect(classLeaderboard(context,"Primary 3","midterm").rows.map(r=>r.total)).toEqual([360,320]);
},60000);
