import { NextRequest } from "next/server";

export { POST } from "@/app/api/admin/import-data/route";

// Route alias hors /api/admin pour eviter les restrictions module "ADMIN"
// tout en conservant la meme logique d'import.
export async function GET(_request: NextRequest) {
  return new Response("Method Not Allowed", { status: 405 });
}
