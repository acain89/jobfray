import {authorizeWorker} from "@/lib/core/worker-auth";
import {runtime,requireSandbox} from "@/lib/core/runtime";
import {deliverNotifications} from "@/lib/core/booking";
import {cleanup} from "@/lib/core/administration";
import {failure,response} from "@/lib/core/http";
export async function POST(request:Request){
    try {
        authorizeWorker(request);
        const app=await runtime();if(app.sandbox)requireSandbox(request);
        const expired=await app.booking.reconcile(new Date());
        const retention=await cleanup(app.repo,new Date());
        const notifications=await deliverNotifications(app.repo,app.notifications,new Date());
        return response({expired,removed:retention.removed,notifications});
    }catch(error){return failure(error);}
}
