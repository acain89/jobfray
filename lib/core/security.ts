import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash, randomUUID, randomInt } from "node:crypto";
import type { Repository, Transaction } from "./repository";
import type { Scope, Token, Outbox } from "./model";
import { AppError, email, phone, string } from "./validation";
export const secret = () => randomBytes(32).toString("base64url");
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
let hashing = 0;
const hashingQueue: (() => void)[] = [];
async function scrypt(password: string, salt: string): Promise<Buffer> {
    if (hashing >= 2) {
        if (hashingQueue.length >= 8)
            throw new AppError("Authentication is busy. Please retry shortly.", 429);
        await new Promise<void>(resolve => hashingQueue.push(resolve));
    }
    else
        hashing++;
    try {
        return await new Promise<Buffer>((resolve, reject) => scryptCallback(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
    }
    finally {
        const next = hashingQueue.shift();
        if (next)
            next();
        else
            hashing--;
    }
}
export async function passwordHash(value: unknown): Promise<string> {
    if (typeof value !== "string" || value.length > 128)
        throw new AppError("Invalid password");
    const password = value;
    if (password.length < 12)
        throw new AppError("Use at least 12 characters for your password");
    const salt = secret();
    return `scrypt-32768:${salt}:${(await scrypt(password, salt)).toString("hex")}`;
}
export async function verifyPassword(value: string, encoded: string): Promise<boolean> {
    const [version, salt, key] = encoded.split(":");
    if (version !== "scrypt-32768" || !salt || !key || key.length !== 128)
        return false;
    const actual = await scrypt(value, salt), expected = Buffer.from(key, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export async function audit(tx: Transaction, businessId: string | null, action: string, actor: string, now: Date, requestId: string | null = null) {
    await tx.put("audits", { id: randomUUID(), businessId, requestId, action, actor, at: now.toISOString() });
}
export async function enqueue(tx: Transaction, mail: Omit<Outbox, "id" | "state" | "attempts" | "availableAt" | "leaseUntil" | "leaseToken">, now: Date) {
    if ((await tx.find("outbox", { key: mail.key })).length)
        return;
    await tx.put("outbox", { ...mail, id: randomUUID(), state: "PENDING", attempts: 0, availableAt: now.toISOString(), leaseUntil: null });
}
export async function rateLimit(repo: Repository, key: string, limit: number, now: Date, minutes = 15) {
    await repo.transaction(["rate:" + hash(key)], async (tx) => {
        const id = hash(key), stored = await tx.get("rates", id), row = stored && Date.parse(stored.expiresAt) > now.getTime() ? stored : { id, count: 0, expiresAt: new Date(now.getTime() + minutes * 60000).toISOString() };
        if (row.count >= limit)
            throw new AppError("Too many attempts. Please try later.", 429);
        row.count++;
        await tx.put("rates", row);
    });
}
async function issue(tx: Transaction, purpose: Token["purpose"], subject: string, now: Date, minutes: number, context = "") {
    const raw = secret();
    await tx.put("tokens", { id: randomUUID(), hash: hash(raw), purpose, subject, context, expiresAt: new Date(now.getTime() + minutes * 60000).toISOString(), usedAt: null, attempts: 0 });
    return raw;
}
export async function register(repo: Repository, input: unknown, now: Date) {
    const v = input as {
        email?: unknown;
        password?: unknown;
    }, address = email(v.email);
    await rateLimit(repo, "register:" + address, 4, now, 60);
    const encoded = await passwordHash(v.password);
    return repo.transaction(["account:" + address], async (tx) => {
        const existing = (await tx.find("accounts", { email: address }))[0];
        if (existing) {
            if (!existing.verifiedAt) {
                const token = await issue(tx, "VERIFY_EMAIL", existing.id, now, 60);
                await enqueue(tx, { businessId: null, destination: address, channel: "EMAIL", kind: "VERIFY_EMAIL", body: token, key: "verify:" + existing.id + ":" + hash(token) }, now);
            }
            return { message: "If eligible, a verification email has been queued." };
        }
        const id = randomUUID();
        await tx.put("accounts", { id, email: address, passwordHash: encoded, verifiedAt: null, createdAt: now.toISOString() });
        const token = await issue(tx, "VERIFY_EMAIL", id, now, 60);
        await enqueue(tx, { businessId: null, destination: address, channel: "EMAIL", kind: "VERIFY_EMAIL", body: token, key: "verify:" + id + ":" + hash(token) }, now);
        return { message: "If eligible, a verification email has been queued." };
    });
}
export async function login(repo: Repository, address: unknown, password: unknown, now: Date) {
    if (typeof password !== "string" || password.length > 128)
        throw new AppError("Invalid password");
    const normalized = email(address), pwd = password;
    await rateLimit(repo, "login:" + normalized, 10, now);
    const account = await repo.transaction(["account:" + normalized], async (tx) => (await tx.find("accounts", { email: normalized }))[0] ?? null);
    // Same scrypt work for unknown accounts, without leaking account existence.
    const encoded = account?.passwordHash ?? "scrypt-32768:dummy-salt:" + "0".repeat(128);
    if (!await verifyPassword(pwd, encoded) || !account)
        throw new AppError("Email or password is incorrect", 401);
    if (!account.verifiedAt)
        throw new AppError("Verify your email before signing in", 403);
    const token = secret(), csrf = secret();
    await repo.transaction(["account:" + account.id], async (tx) => {
        const current = await tx.get("accounts", account.id);
        if (!current || current.passwordHash !== encoded)
            throw new AppError("Sign in again", 401);
        await tx.put("sessions", { id: randomUUID(), accountId: account.id, tokenHash: hash(token), csrf, expiresAt: new Date(now.getTime() + 7 * 86400000).toISOString() });
    });
    return { token, csrf };
}
export async function session(tx: Transaction, raw: string | undefined, now: Date) {
    if (!raw)
        throw new AppError("Sign in to continue", 401);
    const stored = (await tx.find("sessions", { tokenHash: hash(raw) }))[0];
    if (!stored || Date.parse(stored.expiresAt) <= now.getTime())
        throw new AppError("Sign in to continue", 401);
    const account = await tx.get("accounts", stored.accountId);
    if (!account?.verifiedAt)
        throw new AppError("Verify your email", 401);
    return { session: stored, account };
}
export async function ownerScope(tx: Transaction, raw: string | undefined, businessId: string, now: Date): Promise<Scope> {
    const { account } = await session(tx, raw, now), business = await tx.get("businesses", businessId);
    if (!business || business.ownerId !== account.id)
        throw new AppError("Business not found", 404);
    return { accountId: account.id, businessId };
}
export async function recover(repo: Repository, address: unknown, now: Date) {
    const normalized = email(address);
    await rateLimit(repo, "recover:" + normalized, 4, now, 60);
    await repo.transaction(["account:" + normalized], async (tx) => {
        const account = (await tx.find("accounts", { email: normalized }))[0];
        if (!account)
            return;
        const token = await issue(tx, "RESET_PASSWORD", account.id, now, 20);
        await enqueue(tx, { businessId: null, destination: normalized, channel: "EMAIL", kind: "RESET_PASSWORD", body: token, key: "reset:" + hash(token) }, now);
    });
    return { message: "If eligible, recovery instructions have been queued." };
}
export async function consumeAccountToken(repo: Repository, raw: unknown, purpose: "VERIFY_EMAIL" | "RESET_PASSWORD", password: unknown, now: Date) {
    const tokenHash = hash(string(raw, 100)), encoded = purpose === "RESET_PASSWORD" ? await passwordHash(password) : null;
    await repo.transaction(["token:" + tokenHash], async (tx) => {
        const token = (await tx.find("tokens", { hash: tokenHash, purpose }))[0];
        if (!token || token.usedAt || Date.parse(token.expiresAt) <= now.getTime())
            throw new AppError("This verification link is invalid or expired");
        const account = await tx.get("accounts", token.subject);
        if (!account)
            throw new AppError("Invalid account");
        if (encoded)
            account.passwordHash = encoded;
        else
            account.verifiedAt = now.toISOString();
        token.usedAt = now.toISOString();
        await tx.put("tokens", token);
        await tx.put("accounts", account);
        if (encoded) {
            await enqueue(tx, { businessId: null, destination: account.email, channel: "EMAIL", kind: "SECURITY", body: "Your JobFray password was changed and existing sessions were revoked. If this was not you, recover your account immediately.", key: "security-password:" + token.id }, now);
            for (const device of await tx.find("push", { accountId: account.id, active: true }))
                await tx.put("push", { ...device, active: false });
            for (const s of await tx.find("sessions", { accountId: account.id }))
                await tx.remove("sessions", s.id);
            for (const t of await tx.find("tokens", { subject: account.id, purpose: "RESET_PASSWORD" }))
                if (!t.usedAt)
                    await tx.put("tokens", { ...t, usedAt: now.toISOString() });
        }
    });
    return { message: purpose === "VERIFY_EMAIL" ? "Email verified. You can sign in." : "Password updated. Sign in with your new password." };
}
export async function startContact(repo: Repository, input: unknown, now: Date) {
    const number = phone(input);
    await rateLimit(repo, "contact:" + number, 5, now);
    const code = String(randomInt(100000, 1000000)), id = randomUUID();
    await repo.transaction(["contact:" + number], async (tx) => {
        await tx.put("tokens", { id, hash: hash(id + ":" + code), purpose: "CUSTOMER_CODE", subject: number, context: "", expiresAt: new Date(now.getTime() + 10 * 60000).toISOString(), usedAt: null, attempts: 0 });
        await enqueue(tx, { businessId: null, destination: number, channel: "SMS", kind: "CUSTOMER_CODE", body: id + ":" + code, key: "contact:" + id }, now);
    });
    return { challengeId: id };
}
export async function verifyContact(repo: Repository, id: string, code: string, now: Date) {
    const result = await repo.transaction(["contact:" + id], async (tx) => {
        const token = await tx.get("tokens", id);
        if (!token || token.purpose !== "CUSTOMER_CODE" || token.usedAt || token.attempts >= 5 || Date.parse(token.expiresAt) <= now.getTime())
            return null;
        token.attempts++;
        if (token.hash !== hash(id + ":" + code)) {
            await tx.put("tokens", token);
            return null;
        }
        token.usedAt = now.toISOString();
        await tx.put("tokens", token);
        return issue(tx, "CUSTOMER_PROOF", token.subject, now, 60);
    });
    if (!result)
        throw new AppError("Invalid or expired verification code");
    return { proof: result };
}
export async function contactProof(tx: Transaction, raw: string, number: string, now: Date) {
    const token = (await tx.find("tokens", { hash: hash(raw), purpose: "CUSTOMER_PROOF" }))[0];
    if (!token || token.subject !== number || Date.parse(token.expiresAt) <= now.getTime())
        throw new AppError("Verify your contact phone before continuing", 403);
    return token;
}
