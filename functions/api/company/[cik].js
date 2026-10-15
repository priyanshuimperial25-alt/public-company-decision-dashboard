import { companyData, json } from "../../_lib/sec.js";

export async function onRequestGet({ params, env }) {
  const cik = String(params.cik || "");
  if (!/^\d{1,10}$/.test(cik)) return json({ error: "Invalid SEC CIK." }, 400);
  try {
    return json(await companyData(cik, env));
  } catch (error) {
    return json({ error: error.message }, 503);
  }
}
