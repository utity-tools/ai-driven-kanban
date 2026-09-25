import { z } from "zod";

// Runs before the app hydrates. Zod probes `new Function("")` the first time it parses an
// object, to decide whether to compile a faster validator. The CSP forbids eval (ADR 0012),
// so the probe only reports a violation; skip it and use the interpreted path directly.
z.config({ jitless: true });
