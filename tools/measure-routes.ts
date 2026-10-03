/**
 * Route-length rule (brief §6.3): tactical 1.25–1.5× fast, hidden 1.6–2.0×,
 * A→B within 10% of B→A. Exits non-zero on failure so CI catches map regressions.
 */
import { museum, measureRoutes } from '@museum/shared';

const { reports, failures } = measureRoutes(museum);
for (const r of reports) {
  console.log(`${r.kind.padEnd(13)} A→B ${r.aToB.toFixed(1).padStart(6)} m   B→A ${r.bToA.toFixed(1).padStart(6)} m   ×${r.ratio.toFixed(2)}`);
  console.log(`   via ${r.path.map((p) => p.replace(/^(portal|lm):/, '')).join(' → ')}`);
}
if (failures.length) {
  console.error('\nFAIL\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('\nOK: all route types within targets');
