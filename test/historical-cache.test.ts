import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CachedHistoricalDays } from "../src/research/historical-cache.js";
import type { FuturesContract, MinuteBar } from "../src/market/types.js";
const contract: FuturesContract = {ticker:"NQZ6",productCode:"NQ"};
const date="2026-09-21";
const bar:MinuteBar={contractTicker:"NQZ6",productCode:"NQ",timestampMs:Date.parse(date+"T00:00:00Z"),
 sessionEndDate:date,open:100,high:101,low:99,close:100,volume:5};
test("cache hits are reproducible and do not call source again",async()=>{
 const root=await mkdtemp(join(tmpdir(),"tm001-cache-"));
 let calls=0;
 try {
  const cache=new CachedHistoricalDays({async getContractMinuteBars(){calls++;return [bar];}},root);
  assert.deepEqual(await cache.getDay(contract,date),[bar]);
  assert.deepEqual(await cache.getDay(contract,date),[bar]);
  assert.equal(calls,1);
 } finally {await rm(root,{recursive:true,force:true});}
});
test("cache corruption fails closed without refetch",async()=>{
 const root=await mkdtemp(join(tmpdir(),"tm001-cache-"));
 let calls=0;
 try {
  const cache=new CachedHistoricalDays({async getContractMinuteBars(){calls++;return [bar];}},root);
  await cache.getDay(contract,date);
  const path=join(root,"NQ","NQZ6",date+".json");
  const record=JSON.parse(await readFile(path,"utf8")) as {bars:MinuteBar[]};
  record.bars[0]!.close=100.5;
  await writeFile(path,JSON.stringify(record));
  await assert.rejects(cache.getDay(contract,date),/checksum mismatch/);
  assert.equal(calls,1);
 } finally {await rm(root,{recursive:true,force:true});}
});
test("rejects unordered source bars",async()=>{
 const root=await mkdtemp(join(tmpdir(),"tm001-cache-"));
 try {
  const cache=new CachedHistoricalDays({async getContractMinuteBars(){return [bar,bar];}},root);
  await assert.rejects(cache.getDay(contract,date),/Invalid or unordered/);
 } finally {await rm(root,{recursive:true,force:true});}
});
