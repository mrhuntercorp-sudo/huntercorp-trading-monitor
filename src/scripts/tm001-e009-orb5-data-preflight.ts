/** TM001 E009: local-only ORB5 prospective data preflight. No network, writes, orders, or secrets. */
import {existsSync,readdirSync,readFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {createHash} from "node:crypto";

const root=process.cwd();
const manifest="research/TM001-E008-orb5-prospective-validation-lock.md";
if(!existsSync(resolve(root,manifest)))throw Error("E008_MANIFEST_MISSING_STOP");
const doc=readFileSync(resolve(root,manifest),"utf8");
for(const term of ["2026-10-15","40 NQ-point stop","80 NQ-point target","30 independent ORB5 trades"])
 if(!doc.includes(term))throw Error("E008_MANIFEST_UNEXPECTED_STOP "+term);
const dir=resolve(root,"data/cache/massive/NQ/NQZ6");
const dates=existsSync(dir)?readdirSync(dir).filter(n=>/^\d{4}-\d{2}-\d{2}\.json$/.test(n)).map(n=>n.slice(0,10)).sort():[];
const prospective=dates.filter(d=>d>="2026-10-15");
const hashes=prospective.map(date=>({date,sha256:createHash("sha256").update(readFileSync(join(dir,date+".json"))).digest("hex")}));
const envFile=existsSync(resolve(root,".env"));
const keyPresentInProcess=Boolean(process.env.MASSIVE_API_KEY?.trim());
const keyDeclaredInFile=envFile&&readFileSync(resolve(root,".env"),"utf8").split(/\r?\n/).some(line=>/^\s*(?:export\s+)?MASSIVE_API_KEY\s*=/.test(line));
console.log("E009_PREFLIGHT",JSON.stringify({manifest,contract:"NQZ6",prospectiveStart:"2026-10-15",cacheOnly:true,networkRequests:0,writes:0,orders:0,optimization:false,envFilePresent:envFile,apiKeyConfigured:Boolean(keyPresentInProcess||keyDeclaredInFile),entitlementVerified:false,incrementalCostVerified:false,prospectiveCachedUtcDates:prospective,prospectiveFileSha256:hashes,cacheDateCount:dates.length}));
console.log("E009_GATE",JSON.stringify({status:"AWAIT_PROVIDER_ENTITLEMENT_AND_COST_CONFIRMATION",canExecuteRetrieval:false,requiresSeparateCappedPlan:true,requiresUserApproval:true,noStrategyApproved:true}));
