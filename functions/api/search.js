import { json, resolveCompany } from "../_lib/sec.js";

export async function onRequestGet({ request, env }) {
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query) return json({ error: "Enter a company name or ticker." }, 400);
  try {
    return json({ results: await resolveCompany(query, env) });
  } catch (error) {
    return json({ error: error.message || "Company search failed." }, 502);
  }
}
