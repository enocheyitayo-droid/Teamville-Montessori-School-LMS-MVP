"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, GraduationCap, UsersRound, BookOpen, CalendarCheck, Wallet, Megaphone, Settings2, ShieldCheck, PanelLeftClose, PanelLeftOpen, X, LogOut, CircleHelp } from "lucide-react";
import { Brand } from "./brand";
import { signOut } from "@/app/actions";
import { endDemo } from "@/lib/demo/actions";
const futureModules = [
  { label: "Pupils & admissions", icon: UsersRound, phase: 2 },
  { label: "Academics & results", icon: BookOpen, phase: 3 },
  { label: "Attendance", icon: CalendarCheck, phase: 3 },
  { label: "Finance & bursary", icon: Wallet, phase: 4 },
  { label: "Communication", icon: Megaphone, phase: 5 },
];
export function Sidebar({ preview = false, admin = false, schoolName, demoRole }: { preview?: boolean; admin?: boolean; schoolName?: string; demoRole?: string }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const base = demoRole ? "/demo" : preview ? "/preview" : "/dashboard";
  const demoModules = [
    { label:"Pupils & admissions",icon:UsersRound,path:"pupils",roles:["school_admin","teacher"] },
    { label:"My child",icon:UsersRound,path:"pupils",roles:["guardian"] },
    { label:"Attendance",icon:CalendarCheck,path:"attendance",roles:["school_admin","teacher","guardian"] },
    { label:"Academics & results",icon:BookOpen,path:"results",roles:["school_admin","teacher","guardian"] },
    { label:"Class positions",icon:GraduationCap,path:"leaderboard",roles:["school_admin","teacher","guardian"] },
    { label:"Finance & bursary",icon:Wallet,path:"finance",roles:["school_admin","bursar","guardian"] },
    { label:"Debtors & outstanding",icon:UsersRound,path:"debtors",roles:["school_admin","bursar"] },
    { label:"School purse & payables",icon:Wallet,path:"purse",roles:["school_admin","bursar"] },
    { label:"Salary records & slips",icon:BookOpen,path:"salaries",roles:["school_admin","bursar","teacher"] },
    { label:"School notices",icon:Megaphone,path:"notices",roles:["school_admin","teacher","bursar","guardian"] },
  ];
  return <>
    <button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobile(true)}><PanelLeftOpen size={22} /></button>
    {mobile && <button className="sidebar-shade" aria-label="Close navigation" onClick={() => setMobile(false)} />}
    <aside className={`sidebar ${collapsed ? "collapsed" : ""} ${mobile ? "mobile-open" : ""}`}>
      <div className="sidebar-brand"><Brand compact={collapsed} name={schoolName} /><button className="mobile-close icon-button" aria-label="Close navigation" onClick={() => setMobile(false)}><X size={20} /></button></div>
      <div className="workspace-label">School workspace</div>
      <nav aria-label="Main navigation">
        <Link prefetch={false} href={base} title="Overview" onClick={() => setMobile(false)} className={`nav-item ${path === base ? "active" : ""}`}><LayoutDashboard size={19} /><span>Overview</span></Link>
        {demoRole ? demoModules.filter(m=>m.roles.includes(demoRole)).map(item=><Link prefetch={false} href={`${base}/${item.path}`} title={item.label} key={item.label} onClick={()=>setMobile(false)} className={`nav-item ${path.startsWith(`${base}/${item.path}`)?"active":""}`}><item.icon size={19}/><span>{item.label}</span></Link>) : futureModules.map(item => <div key={item.label} className="nav-item unavailable" title={`${item.label} is planned for phase ${item.phase}`}><item.icon size={19} /><span>{item.label}</span><small>{item.phase}</small></div>)}
        <div className="nav-divider" />
        {demoRole && <Link prefetch={false} href="/" className="nav-item" onClick={()=>setMobile(false)}><GraduationCap size={19}/><span>School website</span></Link>}
        {!demoRole && (admin || preview) && <Link prefetch={false} href={`${base}?section=team`} title="School team" onClick={() => setMobile(false)} className="nav-item"><UsersRound size={19} /><span>School team</span></Link>}
        {!demoRole && (admin || preview) && <Link prefetch={false} href={preview ? "/preview?section=settings" : "/dashboard/settings"} title="School settings" onClick={() => setMobile(false)} className={`nav-item ${path.endsWith("settings") ? "active" : ""}`}><Settings2 size={19} /><span>School settings</span></Link>}
        {demoRole === "school_admin" && <Link prefetch={false} href="/demo/activity" className={`nav-item ${path==="/demo/activity"?"active":""}`}><ShieldCheck size={19}/><span>Activity & audit trail</span></Link>}
        <Link prefetch={false} href={demoRole ? "/demo/presentation" : "/guide"} title="Setup guide" className="nav-item"><CircleHelp size={19} /><span>{demoRole ? "Presentation guide" : "Help & setup"}</span></Link>
      </nav>
      <div className="sidebar-bottom"><div className="secure-note"><ShieldCheck size={19} /><span>A little care.<br /><strong>A brighter future.</strong></span></div>
      {demoRole ? <form action={endDemo}><button className="nav-item"><LogOut size={18}/><span>Leave demonstration</span></button></form> : preview ? <Link prefetch={false} href="/login" className="nav-item"><LogOut size={18} /><span>Staff sign in</span></Link> : <form action={signOut}><button className="nav-item"><LogOut size={18} /><span>Sign out</span></button></form>}
      <button className="collapse-toggle" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <PanelLeftOpen size={18} /> : <><PanelLeftClose size={18} /><span>Collapse sidebar</span></>}</button></div>
    </aside>
  </>;
}
