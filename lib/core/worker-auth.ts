import {createHash,timingSafeEqual} from "node:crypto";
import {AppError} from "./validation";
export function authorizeWorker(request:Request,key:string|undefined=process.env.JOBFRAY_WORKER_KEY):void {
    if(!key || key.length<32)throw new AppError("Worker is not configured",503);
    const supplied=request.headers.get("authorization")??"";
    const digest=(value:string)=>createHash("sha256").update(value).digest();
    if(supplied.length>256 || !timingSafeEqual(digest(supplied),digest("Bearer "+key)))throw new AppError("Forbidden",403);
}
