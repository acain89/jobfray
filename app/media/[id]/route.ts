import { runtime } from "@/lib/core/runtime";
import { readImage } from "@/lib/core/media";
import { cookieValue, COOKIE, CONFIRMATION, failure } from "@/lib/core/http";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  try{const app=await runtime(),image=await readImage(app.repo,(await params).id,cookieValue(request,COOKIE),cookieValue(request,CONFIRMATION),new Date());
    return new Response(new Uint8Array(Buffer.from(image.bytes,"base64")),{headers:{"Content-Type":"image/webp","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox"}});
  }catch(error){return failure(error);}
}
