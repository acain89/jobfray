export function GET(): Response {
  return Response.json(
    { status: "ok", service: "jobfray", stage: "foundation" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
