const {test}=require('node:test');
const assert=require('node:assert/strict');

test('aligned lyrics keep untimed continuation in place and remove split directions',async()=>{
 const {parseLyrics}=await import('../public/lyrics.mjs');
 const raw='[00:15.80] [Intro:\n[00:15.84] Rain\n[00:15.94] drums]\n[00:15.98] [Verse 1]\n霓虹在电线杆上打嗝\n[00:17.39] 积水把招牌泡成泡沫\n[\n[00:55.62] Chorus:\n[00:55.66] Anthemic]\n[00:55.71] [Hook: Catchy]\n雨越下越要跳！\n[00:57.77] 把破铜烂铁敲成心跳';
 assert.deepEqual(parseLyrics(raw).map(({text,time})=>({text,time})),[
  {text:'霓虹在电线杆上打嗝',time:15.98},{text:'积水把招牌泡成泡沫',time:17.39},
  {text:'雨越下越要跳！',time:55.71},{text:'把破铜烂铁敲成心跳',time:57.77}]);
 assert.deepEqual(parseLyrics('第一行\n第二行').map(l=>l.text),['第一行','第二行']);
 assert.deepEqual(parseLyrics('[00:01.20][00:02.3]咚').map(l=>l.time),[1.2,2.3]);
});
test('Suno word alignment restores original English lines and first-word timing',async()=>{
 const {parseLyrics}=await import('../public/lyrics.mjs');
 const raw="[00:40.69] You\n[00:40.96] hum\n[00:41.33] a\n[00:41.51] tune\n[00:41.97] like\n[00:42.37] a\n[00:42.54] secret\n[00:43.34] sign\n\n[00:44.52] I\n[00:44.82] check\n[00:45.16] the\n[00:45.41] clock,\n[00:47.02] it's\n[00:47.57] half\n[00:48.85] past\n[00:49.65] nine\n\n(\n[01:26.88] One\n[01:26.96] more\n[01:27.07] time)";
 assert.deepEqual(parseLyrics(raw).map(({text,time})=>({text,time})),[
  {text:'You hum a tune like a secret sign',time:40.69},
  {text:"I check the clock, it's half past nine",time:44.52},
  {text:'(One more time)',time:86.88}]);
});
test('Suno Chinese fragments join without extra spaces and preserve repeated lines',async()=>{
 const {parseLyrics}=await import('../public/lyrics.mjs');
 const raw='[00:15.80] [Intro:\n[00:15.84] Rain\n[00:15.94] drums]\n\n[00:20.96] 锅盖一敲\n[00:22.66] 整条街醒过来\n\n[00:36.86] 咚\n[00:37.34] 咚\n[00:37.74] 咚\n[00:38.14] 敲成鼓点\n\n[00:40.00] 咚\n[00:40.34] 咚\n[00:40.74] 咚\n[00:41.14] 敲成鼓点';
 assert.deepEqual(parseLyrics(raw).map(({text,time})=>({text,time})),[
  {text:'锅盖一敲整条街醒过来',time:20.96},{text:'咚咚咚敲成鼓点',time:36.86},{text:'咚咚咚敲成鼓点',time:40}]);
});
test('ordinary line LRC and untimed verses keep their existing line breaks',async()=>{
 const {parseLyrics}=await import('../public/lyrics.mjs');
 assert.deepEqual(parseLyrics('[00:01]First complete line\n[00:02]Second complete line\n\n[00:03][00:04]Repeat this line').map(l=>[l.text,l.time]),[
  ['First complete line',1],['Second complete line',2],['Repeat this line',3],['Repeat this line',4]]);
 assert.deepEqual(parseLyrics('One\nword\nhere\n\nAnother verse').map(l=>l.text),['One','word','here','Another verse']);
});
async function fixture(options={}) {
 const {AudioCache}=await import('../public/audio-cache.mjs');
 const data=new Map();let requests=0,serial=0;const revoked=[];
 const disk={match:async k=>data.get(typeof k==='string'?k:k.url)?.clone(),put:async(k,v)=>data.set(k,v.clone()),delete:async k=>data.delete(typeof k==='string'?k:k.url),keys:async()=>[...data.keys()].map(k=>new Request(k))};
 const config={origin:'https://music.test',storage:{open:async()=>disk},urls:{createObjectURL:()=>`blob:test-${++serial}`,revokeObjectURL:u=>revoked.push(u)},fetcher:async()=>{requests++;return new Response(new Uint8Array(8),{headers:{'content-type':'audio/mpeg','cache-control':'public, max-age=31536000','content-length':'8'}})},...options};
 return {cache:new AudioCache(config),data,revoked,requests:()=>requests,make:()=>new AudioCache(config)};
}
test('public warm cache survives a new player instance without another download',async()=>{
 const f=await fixture();const url='/music/a.mp3';assert.equal(f.cache.source(url),url);
 assert.equal(await f.cache.preload(url,true),true);assert.match(f.cache.source(url),/^blob:/);
 const next=f.make();await next.preload(url,true);assert.match(next.source(url),/^blob:/);assert.equal(f.requests(),1);
});
test('private candidates never reach disk and logout invalidates memory',async()=>{
 const f=await fixture();await f.cache.preload('/music/draft.mp3');assert.equal(f.data.size,0);
 f.cache.clearPrivate();assert.equal(f.cache.source('/music/draft.mp3'),'/music/draft.mp3');assert.equal(f.revoked.length,1);
});
test('cache bounds evict oldest files and protect current playback object URL',async()=>{
 const f=await fixture({maxBytes:16,maxTracks:2});await f.cache.preload('/music/a.mp3',true);f.cache.pin('radio','/music/a.mp3');
 await f.cache.preload('/music/b.mp3',true);await f.cache.preload('/music/c.mp3',true);
 assert.equal(f.data.size,2);assert.equal(f.cache.memory.size,2);assert.match(f.cache.source('/music/a.mp3'),/^blob:/);assert.equal(f.cache.source('/music/b.mp3'),'/music/b.mp3');
});
test('partial or non-audio responses and oversized streams are not cached',async()=>{
 for(const response of [new Response('bad',{status:206,headers:{'content-type':'audio/mpeg'}}),new Response('login',{headers:{'content-type':'text/html'}}),new Response(new Uint8Array(9),{headers:{'content-type':'audio/mpeg'}})]){
 const f=await fixture({maxFile:8,fetcher:async()=>response});assert.equal(await f.cache.preload('/music/a.mp3',true),false);assert.equal(f.data.size,0);assert.equal(f.cache.memory.size,0);
 }
});
test('cold playback can stream immediately and cancelled private fetch cannot reappear after logout',async()=>{
 let release;const response=new Promise(r=>{release=r;});
 const f=await fixture({fetcher:()=>response});const loading=f.cache.preload('/music/draft.mp3');
 assert.equal(f.cache.source('/music/draft.mp3'),'/music/draft.mp3');
 f.cache.clearPrivate();release(new Response(new Uint8Array(8),{headers:{'content-type':'audio/mpeg'}}));
 assert.equal(await loading,false);assert.equal(f.cache.memory.size,0);assert.equal(f.data.size,0);
});

test('initial restoration checks disk without a competing network download',async()=>{
 const f=await fixture();assert.equal(await f.cache.restore('/music/a.mp3'),false);assert.equal(f.requests(),0);
 await f.cache.preload('/music/a.mp3',true);const next=f.make();assert.equal(await next.restore('/music/a.mp3'),true);assert.equal(f.requests(),1);
});
