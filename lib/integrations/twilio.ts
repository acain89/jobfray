import { phone, AppError } from "../core/validation";
import { request, object, text, form, networkTransport, type Transport } from "./http";
export interface PhoneVerifier {
    start(number: string, scope: string): Promise<string>;
    check(sid: string, number: string, code: string): Promise<boolean>;
}
export class TwilioVerifyAdapter implements PhoneVerifier {
    constructor(private account: string, private key: string, private secret: string, private service: string, private transport: Transport = networkTransport) { if (!/^AC[a-fA-F0-9]{32}$/.test(account) || !/^VA[a-fA-F0-9]{32}$/.test(service))
        throw new Error("Invalid Verify configuration"); }
    private async call(path: string, data: Record<string, string>) { return object(await request(this.transport, "https://verify.twilio.com/v2/Services/" + this.service + "/" + path, { method: "POST", headers: { Authorization: "Basic " + Buffer.from(this.key + ":" + this.secret).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" }, body: form(data) })); }
    async start(number: string, scope: string) { const result = await this.call("Verifications", { To: phone(number), Channel: "sms", RiskCheck: "enable", "RateLimits[principal]": scope }); if (result.account_sid !== this.account || result.service_sid !== this.service || result.to !== phone(number) || result.status !== "pending")
        throw new AppError("Verification identity mismatch", 502); return text(result.sid); }
    async check(sid: string, number: string, code: string) { if (!/^\d{6}$/.test(code))
        return false; const result = await this.call("VerificationCheck", { VerificationSid: sid, Code: code }); return result.sid === sid && result.account_sid === this.account && result.service_sid === this.service && result.to === phone(number) && result.status === "approved"; }
}
