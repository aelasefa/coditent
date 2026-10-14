// Audit-only local source probes; no app modifications, requests, or real credentials.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const web = '/home/maelmahf/Desktop/coditent/apps/web';
const ts = require(require.resolve('typescript', { paths: [web] }));
function load(relative, mocks={}) {
 const filename=path.join(web,relative);
 const output=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const exports={};
 vm.runInNewContext(output,{exports,require:(name)=>Object.hasOwn(mocks,name)?mocks[name]:require(require.resolve(name,{paths:[web]}))},{filename});
 return exports;
}
const {safeNextDestination}=load('src/lib/auth-redirect.ts');
const raw='/\\example.org/';
const accepted=safeNextDestination(raw);
assert.equal(accepted,raw);
const resolved=new URL(accepted,'https://coditent.example').href;
assert.equal(resolved,'https://example.org/');
console.log('Redirect utility source probe: backslash-prefixed external authority accepted; normalized URL:',resolved);
let stateCall=0; const writes=[];
const stateValues=['A draft worth retaining',null];
const fakeReact={useState:()=>{const index=stateCall++;return [stateValues[index],value=>writes.push({index,value})]},useEffect:()=>{},useRef:()=>({current:null})};
const {Composer}=load('src/components/candidate/chat-view.tsx',{'react':fakeReact,'@/lib/cn':{cn:()=>''},'@/components/ui/avatar':{Avatar:()=>null},'@/components/ui/button':{Button:()=>null},'./chat-workspace':{useChatProfilePanel:()=>null},'./chat-workspace.module.css':{}});
let failSend; const pendingSend=new Promise((_,reject)=>{failSend=reject});
pendingSend.catch(()=>{}); // prevent audit harness from emitting an unhandled rejection
let sentText;
const form=Composer({peerName:'Example candidate',pending:false,onSend:text=>{sentText=text;return pendingSend}});
form.props.onSubmit({preventDefault(){}});
assert.equal(sentText,stateValues[0]);
assert.deepEqual(writes,[{index:1,value:null},{index:0,value:''}]);
failSend(new Error('Simulated send rejection'));
console.log('Composer source probe: draft cleared synchronously before asynchronous send success; async rejection produces no Composer error state.');
function luminance(hex){const rgb=hex.match(/[a-f\d]{2}/gi).map(v=>parseInt(v,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)}
for(const [label,fg] of [['Legal body zinc-300','#d4d4d8'],['Legal headings white','#ffffff']])console.log(label,'contrast against #fafaf8:',contrast(fg,'#fafaf8').toFixed(2)+':1');
