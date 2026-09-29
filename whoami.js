/** GET /api/whoami — يعرض بريد المستخدم الذي سمح له Access بالدخول. */
export async function onRequestGet({ request }) {
  const email = request.headers.get("cf-access-authenticated-user-email");
  return new Response(JSON.stringify({ email: email || null }), {
    status: email ? 200 : 401,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
