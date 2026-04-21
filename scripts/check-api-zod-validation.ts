import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.join(__dirname, "..", "src", "app", "api");
const violations: string[] = [];

function walk(dir: string): void {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) {
      walk(full);
      continue;
    }
    if (name.name !== "route.ts") continue;

    const rel = path.relative(apiRoot, full).split(path.sep).join("/");
    const content = fs.readFileSync(full, "utf8");

    const hasMutativeHandler =
      /\bexport\s+async\s+function\s+(POST|PUT|PATCH)\b/.test(content) ||
      /\bexport\s+const\s+(POST|PUT|PATCH)\b/.test(content);
    if (!hasMutativeHandler) continue;

    const readsBody = content.includes("request.json(") || content.includes("request.formData(");
    if (!readsBody) continue;

    const hasStrictZodHandling = content.includes("zodBadRequest(");
    if (!hasStrictZodHandling) {
      violations.push(rel);
    }
  }
}

walk(apiRoot);

if (violations.length > 0) {
  console.error(
    "[check-api-zod-validation] Routes mutatives sans zodBadRequest détecté :\n",
    violations.map((v) => `  - ${v}`).join("\n"),
    "\n\nAjoutez un schéma Zod + safeParse/parse et retournez les erreurs via zodBadRequest().",
  );
  process.exit(1);
}

console.log("[check-api-zod-validation] OK");
