/** E030 ntfy adapter: no network unless both runtime and operator approval are explicit. */
import type {Notice} from "./local-notification-outbox.js";
export type PushRequest={url:string;method:"POST";headers:Record<string,string>;body:string};
export type PushResult={status:"DRY_RUN"|"PUBLISHED";noticeId:string;httpStatus?:number};
export function prepareNtfy(notice:Notice,topic:string):PushRequest{
 if(notice.classification!=="RESEARCH_ONLY"||notice.delivery!=="LOCAL_PENDING")throw Error("UNSUPPORTED_NOTICE");
 // Public ntfy topics are readable by anyone who knows the name. Require high-entropy topic.
 if(!/^[a-zA-Z0-9_-]{32,64}$/.test(topic))throw Error("TOPIC_MUST_BE_RANDOM_32_TO_64");
 if(!notice.title||!notice.body||notice.body.length>3500)throw Error("INVALID_NOTICE_CONTENT");
 return {url:"https://ntfy.sh/"+topic,method:"POST",
  headers:{"Content-Type":"text/plain; charset=utf-8","Title":notice.title,"Priority":"default","Tags":"mag"},
  body:notice.body};
}
export async function deliverNtfy(notice:Notice,opts:{
 topic:string;mode?:"dry-run"|"live";approved?:boolean;
 transport?:(request:PushRequest)=>Promise<{ok:boolean;status:number}>;
}):Promise<PushResult>{
 const request=prepareNtfy(notice,opts.topic);
 if((opts.mode??"dry-run")==="dry-run")return {status:"DRY_RUN",noticeId:notice.id};
 if(opts.mode!=="live"||opts.approved!==true)throw Error("LIVE_DELIVERY_REQUIRES_EXPLICIT_APPROVAL");
 if(!opts.transport)throw Error("NO_TRANSPORT_CONFIGURED");
 const response=await opts.transport(request);
 if(!response.ok)throw Error("NTFY_HTTP_"+response.status);
 return {status:"PUBLISHED",noticeId:notice.id,httpStatus:response.status};
}
/** Network transport is intentionally exported but never used by regression or default dry run. */
export async function ntfyHttpTransport(request:PushRequest):Promise<{ok:boolean;status:number}>{
 const response=await fetch(request.url,{method:request.method,headers:request.headers,body:request.body,
  signal:AbortSignal.timeout(10000)});
 return {ok:response.ok,status:response.status};
}
