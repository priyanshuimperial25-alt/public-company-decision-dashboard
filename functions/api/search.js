import { json, resolveCompany } from "../_lib/sec.js";

export async function onRequestGet({ request, env }) {
  const query = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (query.length < 1 || query.length > 80) return json({ error: "Enter a company name or ticker (up to 80 characters)." }, 400);
  try {
    const companies = await resolveCompany(query, env);
    return json({ companies, coverage: "SEC EDGAR filers; primarily U.S.-listed issuers. Foreign private issuers may report annually." });
  } catch (error) {
    return json({ error: error.message }, 503);
  }
}
