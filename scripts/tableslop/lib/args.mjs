/** ponytail: tiny argv helper — no dependency */
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

export function requireArg(args, key) {
  if (args[key] == null || args[key] === true) {
    console.error(`Missing --${key}`);
    process.exit(1);
  }
  return args[key];
}
