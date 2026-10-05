import { NextRequest } from "next/server";

import { proxyAuthenticatedAI } from "@/lib/server-ai-proxy";


export async function POST(request: NextRequest) {
  return proxyAuthenticatedAI(request, "/candidates/ai/headline");
}
