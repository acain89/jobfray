import { runtime } from "@/lib/core/runtime";
import { cookieValue, CONFIRMATION, failure } from "@/lib/core/http";
import { AppError } from "@/lib/core/validation";
import { calendarEvent } from "@/lib/core/time";
export async function GET(request: Request) {
    try {
        const app = await runtime(), confirmation = await app.booking.confirmation(cookieValue(request, CONFIRMATION) ?? "");
        if (!("request" in confirmation) || !confirmation.request?.start || !confirmation.request.end)
            throw new AppError("Calendar event not available", 404);
        return new Response(calendarEvent(confirmation.reference, confirmation.request.offeringName, confirmation.request.start, confirmation.request.end,confirmation.request.confirmedAt??confirmation.snapshot.createdAt), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="jobfray.ics"', "Cache-Control": "private, no-store" } });
    }
    catch (error) {
        return failure(error);
    }
}
