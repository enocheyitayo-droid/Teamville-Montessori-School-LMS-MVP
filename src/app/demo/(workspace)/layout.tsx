import Link from "next/link";
import { Database, FlaskConical, ArrowRight } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { requireDemo } from "@/lib/demo/store";
import { roleLabels } from "@/lib/permissions";
import { switchDemoRole } from "@/lib/demo/actions";
export default async function DemoWorkspace({children}:{children:React.ReactNode}) {
  const context = await requireDemo();
  return <div className="app-shell demo-shell"><Sidebar demoRole={context.role}/><div className="workspace"><header className="topbar"><div className="school-location"><span className="location-dot"/>Teamville Montessori School<span className="location-city">Ibadan</span></div><div className="demo-role-switch"><FlaskConical size={16}/><form action={switchDemoRole}><label className="sr-only" htmlFor="demo-role">Demonstration role</label><select id="demo-role" name="role" defaultValue={context.role}>{["school_admin","teacher","bursar","guardian"].map(role=><option key={role} value={role}>{roleLabels[role as keyof typeof roleLabels]}</option>)}</select><button className="button secondary" type="submit">Switch role</button></form></div></header><div className="demo-banner"><span><Database size={15}/><strong>Demonstration</strong> Fictional records. Changes save in your private demo workspace.</span><Link prefetch={false} href="/demo/presentation">Presentation guide<ArrowRight size={13}/></Link></div>{children}<footer className="workspace-footer"><span>Teamville Montessori School · Ibadan</span><span>MVP demonstration · No real pupil data or payments</span></footer></div></div>;
}
