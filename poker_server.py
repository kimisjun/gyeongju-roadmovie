#!/usr/bin/env python3
import json, os, threading, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
STATE='/Users/kimisjun/Desktop/gyeongju-roadmovie/.poker-live-state.json'
NAMES=['은준','준형','진성']; HOST='은준'; lock=threading.RLock()
def fresh():
 p=[{'name':x,'stack':10000,'roundBet':0,'folded':False,'allIn':False,'rebuy':0,'pendingRebuy':0} for x in NAMES]
 g={'hand':1,'street':0,'dealer':0,'pot':0,'smallBlind':100,'bigBlind':200,'turn':3%len(p),'players':p,'log':[],'updated':time.time()}
 put(g,p[1],100);put(g,p[2],200);addlog(g,'준형 SB 100 · 진성 BB 200');return g
def load():
 try:
  with open(STATE,encoding='utf-8') as f:return json.load(f)
 except:return fresh()
def save(g):
 g['updated']=time.time();tmp=STATE+'.tmp'
 with open(tmp,'w',encoding='utf-8') as f:json.dump(g,f,ensure_ascii=False)
 os.replace(tmp,STATE)
def addlog(g,s):g['log'].insert(0,{'hand':g['hand'],'text':s,'time':time.strftime('%H:%M')});g['log']=g['log'][:50]
def put(g,p,a):
 a=max(0,min(p['stack'],int(a)));p['stack']-=a;p['roundBet']+=a;g['pot']+=a;p['allIn']=p['stack']==0;return a
def alive(g):return [i for i,p in enumerate(g['players']) if not p['folded'] and not p['allIn'] and p['stack']>0]
def advance(g):
 a=alive(g)
 if not a:g['turn']=None;return
 start=g['turn'] if g['turn'] is not None else -1
 for k in range(1,len(g['players'])+1):
  i=(start+k)%len(g['players'])
  if i in a:g['turn']=i;return
def public(g,who):
 out=json.loads(json.dumps(g));out['viewer']=who;out['host']=HOST;out['isHost']=who==HOST;out['serverTime']=time.time();return out
def action(g,who,d):
 if who not in NAMES:raise ValueError('이름을 다시 선택하세요.')
 typ=d.get('type');idx=NAMES.index(who);p=g['players'][idx];host=who==HOST
 if typ in ('fold','check-call','bet','all-in'):
  if g['turn']!=idx:raise ValueError('아직 내 차례가 아닙니다.')
  if p['folded'] or p['allIn']:raise ValueError('액션할 수 없습니다.')
  high=max(x['roundBet'] for x in g['players'])
  if typ=='fold':p['folded']=True;addlog(g,f'{who} 폴드')
  elif typ=='check-call':
   paid=put(g,p,max(0,high-p['roundBet']));addlog(g,f'{who} '+(f'{paid:,} 콜' if paid else '체크'))
  elif typ=='bet':
   amount=int(d.get('amount') or 0)
   if amount<=0:raise ValueError('베팅 금액을 입력하세요.')
   paid=put(g,p,amount);addlog(g,f'{who} {paid:,} 추가 베팅')
  else:paid=put(g,p,p['stack']);addlog(g,f'{who} {paid:,} 올인')
  advance(g)
 elif typ=='next-street':
  if not host:raise ValueError('방장만 라운드를 진행할 수 있습니다.')
  if g['street']>=3:raise ValueError('승자를 선택하세요.')
  g['street']+=1
  for x in g['players']:x['roundBet']=0
  g['turn']=(g['dealer']+1)%len(g['players']);addlog(g,['PREFLOP','FLOP','TURN','RIVER'][g['street']]+' 시작')
 elif typ=='award':
  if not host:raise ValueError('방장만 팟을 지급할 수 있습니다.')
  wins=d.get('winners') or []
  if not wins or any(x not in NAMES for x in wins):raise ValueError('승자를 선택하세요.')
  pot=g['pot'];base=pot//len(wins);rem=pot%len(wins)
  for i,name in enumerate(wins):g['players'][NAMES.index(name)]['stack']+=base+(1 if i<rem else 0)
  addlog(g,' · '.join(wins)+f' 팟 {pot:,} 획득');g['pot']=0;g['hand']+=1;g['street']=0;g['dealer']=(g['dealer']+1)%len(NAMES)
  for x in g['players']:x.update(roundBet=0,folded=False,allIn=x['stack']==0)
  sb=(g['dealer']+1)%len(NAMES);bb=(g['dealer']+2)%len(NAMES);a=put(g,g['players'][sb],g['smallBlind']);b=put(g,g['players'][bb],g['bigBlind']);g['turn']=(bb+1)%len(NAMES);addlog(g,f'{NAMES[sb]} SB {a:,} · {NAMES[bb]} BB {b:,}')
 elif typ=='rebuy-request':
  amount=int(d.get('amount') or 0)
  if amount<=0 or amount>1000000:raise ValueError('리바이 칩을 확인하세요.')
  p['pendingRebuy']=amount;addlog(g,f'{who} 리바이 {amount:,}칩 요청')
 elif typ=='rebuy-approve':
  if not host:raise ValueError('방장만 리바이를 승인할 수 있습니다.')
  name=d.get('target');q=g['players'][NAMES.index(name)];amount=q['pendingRebuy']
  if not amount:raise ValueError('승인할 요청이 없습니다.')
  q['stack']+=amount;q['rebuy']+=amount;q['pendingRebuy']=0;q['allIn']=False;addlog(g,f'{name} 리바이 {amount:,}칩 승인')
 elif typ=='reset':
  if not host:raise ValueError('방장만 새 게임을 만들 수 있습니다.')
  return fresh()
 else:raise ValueError('알 수 없는 요청입니다.')
 return g
class H(BaseHTTPRequestHandler):
 def cors(self):
  self.send_header('Access-Control-Allow-Origin','https://kimisjun.github.io');self.send_header('Access-Control-Allow-Headers','Content-Type');self.send_header('Access-Control-Allow-Methods','GET,POST,OPTIONS');self.send_header('Cache-Control','no-store')
 def sendj(self,obj,code=200):
  b=json.dumps(obj,ensure_ascii=False).encode();self.send_response(code);self.cors();self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
 def do_OPTIONS(self):self.send_response(204);self.cors();self.end_headers()
 def do_GET(self):
  if urlparse(self.path).path!='/state':return self.sendj({'error':'not found'},404)
  who=parse_qs(urlparse(self.path).query).get('player',[''])[0]
  with lock:self.sendj(public(load(),who))
 def do_POST(self):
  if urlparse(self.path).path!='/action':return self.sendj({'error':'not found'},404)
  try:
   d=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))) or b'{}');who=d.get('player','')
   with lock:g=action(load(),who,d);save(g);self.sendj(public(g,who))
  except Exception as e:self.sendj({'error':str(e)},400)
 def log_message(self,*a):pass
if __name__=='__main__':
 g=load();save(g);ThreadingHTTPServer(('127.0.0.1',8787),H).serve_forever()
