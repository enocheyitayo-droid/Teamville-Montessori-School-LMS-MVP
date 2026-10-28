import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { PrintButton } from "@/components/demo/print-button";
import { db, findPupil, money, requireDemo, type Payment } from "@/lib/demo/store";
export default async function ReceiptPage({params}:{params:Promise<{id:string}>}) {
  const context=await requireDemo(["school_admin","bursar","guardian"]),{id}=await params;
  const payment=db().prepare("SELECT * FROM payments WHERE workspace=? AND id=? AND status='Verified'").get(context.id,id) as Payment|undefined;
  const pupil=payment?findPupil(context,payment.student_id):undefined;
  if(!payment||!pupil) notFound();
  return <main id="main-content" className="main-content"><div className="receipt-toolbar no-print"><Link prefetch={false} href={`/demo/finance?student=${pupil.id}`} className="text-link"><ArrowLeft size={15}/>Fee statement</Link><PrintButton/></div><article className="receipt-sheet"><div className="receipt-header"><Brand/><div><h1>Payment receipt</h1><p>{payment.receipt}</p></div></div><div className="receipt-demo-label">Demonstration receipt · Fictional payment · Not valid as proof of payment</div><div className="receipt-paid"><BadgeCheck size={22}/><span>Verified payment</span><strong>{money(payment.amount)}</strong></div><dl className="receipt-details"><div><dt>Pupil</dt><dd>{pupil.first_name} {pupil.last_name}</dd></div><div><dt>Admission number</dt><dd>{pupil.admission}</dd></div><div><dt>Class</dt><dd>{pupil.class_name}</dd></div><div><dt>Session & term</dt><dd>2026/2027 · First term</dd></div><div><dt>Payment date</dt><dd>{payment.created_at.slice(0,10)}</dd></div><div><dt>Payment method</dt><dd>{payment.method}</dd></div><div><dt>Reference</dt><dd>{payment.reference}</dd></div><div><dt>Currency</dt><dd>NGN · Nigerian naira</dd></div></dl><div className="receipt-allocation"><strong>Applied to the pupil’s first-term school fee account.</strong><p>The MVP records a payment against the overall account. Per-charge allocations are required before production use.</p></div><div className="receipt-total"><span>Amount received</span><strong>{money(payment.amount)}</strong></div><footer>Teamville Montessori School · Ibadan<br/>School logo supplied by Teamville’s representative.</footer></article></main>;
}
