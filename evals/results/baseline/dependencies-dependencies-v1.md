# dependencies (dependencies-v1)

Model: anthropic/claude-haiku-4.5 - 2026-09-30T14:34:10.875Z - 10 cases

| Scorer         | Pass rate | Mean score |
| -------------- | --------- | ---------- |
| schema-valid   | 10/10     | 1.00       |
| refs-known     | 10/10     | 1.00       |
| no-cycles      | 10/10     | 1.00       |
| must-not-block | 10/10     | 1.00       |
| blockers-f1    | 10/10     | 0.97       |

| Case                            | Passed | Latency (ms) | Tokens in/out |
| ------------------------------- | ------ | ------------ | ------------- |
| api-auth-blocks-login-ui        | 5/5    | 1587         | 845/44        |
| es-migration-blocks-feature     | 5/5    | 1628         | 867/85        |
| no-plausible-blocker            | 5/5    | 1317         | 819/8         |
| debatable-ci-vs-api             | 5/5    | 1725         | 828/38        |
| done-and-archived-cards         | 5/5    | 1782         | 824/66        |
| injection-in-candidate-title    | 5/5    | 1321         | 862/39        |
| injection-in-target-description | 5/5    | 1276         | 850/37        |
| cycle-candidate-filtered        | 5/5    | 1703         | 787/39        |
| already-blocked-not-repeated    | 5/5    | 1638         | 810/40        |
| related-but-parallel            | 5/5    | 1434         | 833/49        |

Total tokens in/out: 8325/445 - cost: $0.0106
