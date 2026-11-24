import type { NotificationTransport } from "../core/providers";
import type { Outbox } from "../core/model";
import { AppError, email as validateEmail } from "../core/validation";
import { request, object, text, networkTransport, type Transport } from "./http";
const escape = (v: string) => v.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export class ResendAdapter implements NotificationTransport {
    constructor(private key: string, private sender: string, private origin: string, private transport: Transport = networkTransport) { if (/[\r\n]/.test(sender) || new URL(origin).protocol !== "https:")
        throw new Error("Invalid sender configuration"); }
    async send(item: Outbox) {
        if (item.channel !== "EMAIL")
            throw new AppError("Email channel required");
        validateEmail(item.destination);
        const accountLink = item.kind === "VERIFY_EMAIL" ? "/verify-email#token=" : item.kind === "RESET_PASSWORD" ? "/reset-password#token=" : null;
        const title = item.kind === "VERIFY_EMAIL" ? "Verify your JobFray email" : item.kind === "RESET_PASSWORD" ? "Reset your JobFray password" : item.kind === "SECURITY" ? "JobFray account security" : "New confirmed JobFray request";
        const content = accountLink ? "Open this secure link: " + this.origin + accountLink + encodeURIComponent(item.body) : item.body + "\n" + this.origin + "/dashboard";
        const result = object(await request(this.transport, "https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + this.key, "Content-Type": "application/json", "Idempotency-Key": item.key }, body: JSON.stringify({ from: this.sender, to: [item.destination], subject: title, text: content, html: "<h1>" + escape(title) + "</h1><p>" + escape(content).replace(/\n/g, "<br>") + "</p>"+(accountLink?'<p><a href="'+escape(this.origin+accountLink+encodeURIComponent(item.body))+'">Open secure account link</a></p>':'') }) }));
        text(result.id);
    }
}
