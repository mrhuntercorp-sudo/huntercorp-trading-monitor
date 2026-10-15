/** E030 one-shot manual phone test. Explicit CLI flag + env approval required. */
import {randomBytes} from "node:crypto";
import {readFile,writeFile,mkdir,rename} from "node:fs/promises";
import {join,dirname} from "node:path";
import {deliverNtfy,ntfyHttpTransport} from "../research/ntfy-delivery.js";
import type {Notice} from "../research/local-notification-outbox.js";
const file=join(process.cwd(),".tm001-local","ntfy-topic.txt");
const args=new Set(process.argv.slice(2));
if(args.has("--setup")||args.has("--rotate")){
 if(args.size!==1)throw Error("SINGLE_SETUP_ACTION_ONLY");
 let topic:string;
 try{topic=(await readFile(file,"utf8")).trim();\n  if(args.has("--rotate")||topic.length>64){\n   const replacement="huntercorp_tm001_"+randomBytes(20).toString("hex");\n   const temp=file+"."+process.pid+".tmp";\n   await writeFile(temp,replacement+"\\n",{flag:"wx",mode:0o600});\n   await rename(temp,file);\n   topic=replacement;\n  }\n }
 catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;
  topic="huntercorp_tm001_"+randomBytes(20).toString("hex");
  await mkdir(dirname(file),{recursive:true});
  await writeFile(file,topic+"\n",{flag:"wx",mode:0o600});
 }
 console.log("TOPIC_FILE",file);
 console.log("SAMSUNG_SUBSCRIBE_TOPIC",topic);
 console.log("SETUP_COMPLETE No network request. Topic length:",topic.length,". Subscribe in ntfy Android before testing.");
}else if(args.has("--send-one")){
 if(args.size!==1)throw Error("SINGLE_ACTION_ONLY");
 const topic=(await readFile(file,"utf8")).trim();
 const notice:Notice={id:"NOTICE:TM001:PHONE_TEST",eventId:"TM001:PHONE_TEST",
  createdAtUtc:new Date().toISOString(),title:"HunterCorp TM001 phone test",
  body:"This is the one-time approved ntfy delivery test. No live market signal. No trade instruction.",
  delivery:"LOCAL_PENDING",classification:"RESEARCH_ONLY"};
 const approved=process.env.TM001_APPROVE_ONE_NTFY_TEST==="YES";
 const result=await deliverNtfy(notice,{topic,mode:"live",approved,transport:ntfyHttpTransport});
 console.log("TEST_RESULT",JSON.stringify(result));
 console.log("NOTE HTTP acceptance is not proof the phone displayed the notification.");
}else{
 console.log("DRY_RUN_DEFAULT: no network request. Use --setup, --rotate or --send-one with explicit approval.");
}
