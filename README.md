# UK Accounts Platform

Implementation scaffold for a workflow-led UK accounts production, compliance and digital filing platform.

## Implemented vertical slice

The first slice proves the accounting spine without external dependencies:

1. import a trial balance representation;
2. enforce exact balancing using integer minor units;
3. map source nominal accounts to a canonical reporting taxonomy;
4. aggregate canonical balances;
5. generate a simple statutory reporting model;
6. expose provenance from report line back to source nominal;
7. create hash-chained immutable audit events;
8. evaluate deterministic reporting rules.

Run:

```bash
npm run test:core
npm run demo
```

The Cloudflare/Neon deployment shell is included but intentionally not connected to production resources. See `spec/` for the full implementation contract.
