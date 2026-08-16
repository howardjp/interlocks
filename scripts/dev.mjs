import { spawn } from "node:child_process";

const args = process.argv.slice(2);
let host = "0.0.0.0";
let port = "3000";

for (let index = 0; index < args.length; index += 1) {
  if (["--host", "--hostname", "-H"].includes(args[index]) && args[index + 1]) {
    host = args[index + 1];
    index += 1;
  } else if (["--port", "-p"].includes(args[index]) && args[index + 1]) {
    port = args[index + 1];
    index += 1;
  }
}

const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "-H", host, "-p", port],
  { stdio: "inherit", env: process.env },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
