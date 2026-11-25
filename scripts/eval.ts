// Prints every sentence the automatic analysis would show for a set of realistic assignments,
// so a person can read the output and catch anything awkward. Run: npx vite-node scripts/eval.ts
import { CASES, NOW } from '../tests/fixtures';
import { buildGuide, buildTips } from '../src/analysis/guide';

for (const { label, task } of CASES) {
  const g = buildGuide(task);
  const out: string[] = [`\n=== ${label}`, `[요구하는 것] ${g.summary}`];
  for (const f of task.files || []) if (f.auto) out.push(`[파일 ${f.name}] 핵심어: ${f.auto.keywords.join(', ') || '(없음)'} | 핵심 문장: ${f.auto.summary.join(' / ') || '(없음)'}`);
  g.issues.forEach((i, n) => {
    out.push(`[쟁점 ${n + 1}] ${i.issue}`, `  질문: ${i.question}`, ...i.angles.map(a => `  관점: ${a}`), ...i.evidence.map(e => `  근거: ${e.point} — ${e.source}`), `  반론: ${i.counter}`, `  쓰는 법: ${i.how}`);
  });
  g.outline.forEach(o => out.push(`[구성] ${o.part} ${o.amount}: ${o.points.join(' / ')}`));
  g.checklist.forEach(c => out.push(`[체크] ${c}`));
  out.push(`[할 일] ${g.next}`);
  buildTips(task, NOW).forEach(t => out.push(`[팁] ${t.title}: ${t.body}`));
  console.log(out.join('\n'));
}
