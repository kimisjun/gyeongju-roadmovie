#!/usr/bin/env python3
import json,os,threading,time
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from urllib.parse import urlparse,parse_qs
STATE='/Users/kimisjun/Desktop/gyeongju-roadmovie/.poker2-state.json';NAMES=['은준','준형','진성'];HOST='은준';lock=threading.RLock()
def fresh():
 p=[{'name':n,'stack':10000,'roundBet':0,'folded':False,'allIn':False,'rebuy':0,'pendingRebuy':0} for n in NAMES]
 g={'hand':1,'street':0,'stage':'deal','dealer':0,'pot':0,'smallBlind':100,'bigBlind':200,'turn':None,'acted':[],'ready':[],'players':p,'log':[],'updated':time.time()};blind(g);return g
def blind(g):
 n=len(g['players']);sb=(g['dealer']+1)%n;bb=(g['dealer']+2)%n;a=put(g,g['players'][sb],g['smallBlind']);b=put(g,g['players'][bb],g['bigBlind']);log(g,f'{NAMES[sb]} SB {a:,} · {NAMES[bb]} BB {b:,}')
def load():
 try:
  with open(STATE,encoding='utf-8') as f:return json.load(f)
 except:return fresh()
def save(g):
 g['updated']=time.time();t=STATE+'.tmp'
 with open(t,'w',encoding='utf-8') as f:json.dump(g,f,ensure_ascii=False)
 os.replace(t,STATE)
def log(g,s):g['log'].insert(0,{'hand':g['hand'],'text':s,'time':time.strftime('%H:%M')});g['log']=g['log'][:60]
def put(g,p,a):
 a=max(0,min(p['stack'],int(a)));p['stack']-=a;p['roundBet']+=a;g['pot']+=a;p['allIn']=p['stack']==0;return a
def canact(g,i):
 p=g['players'][i];return not p['folded'] and not p['allIn'] and p['stack']>0
def nextturn(g):
 if g['turn'] is None:return
 for k in range(1,len(NAMES)+1):
  i=(g['turn']+k)%len(NAMES)
  if canact(g,i):g['turn']=i;return
 g['turn']=None
def rounddone(g):
 live=[p for p in g['players'] if not p['folded']]
 if len(live)<=1:return True
 actionable=[p for p in live if not p['allIn']]
 if not actionable:return True
 high=max(p['roundBet'] for p in live)
 return all(p['name'] in g['acted'] and p['roundBet']==high for p in actionable)
def finishround(g):
 if not rounddone(g):return
 g['turn']=None
 if len([p for p in g['players'] if not p['folded']])<=1 or g['street']==3:g['stage']='showdown';log(g,'베팅 종료 · 승자 선택')
 else:g['stage']='reveal';log(g,['','플롭 3장 공개 대기','턴 1장 공개 대기','리버 1장 공개 대기'][g['street']+1])
def act(g,who,d):
 if who not in NAMES:raise ValueError('이름을 다시 선택하세요.')
 typ=d.get('type');i=NAMES.index(who);p=g['players'][i];host=who==HOST
 if typ=='ready':
  if g['stage']!='deal':raise ValueError('이미 카드 확인이 끝났습니다.')
  if who not in g['ready']:g['ready'].append(who);log(g,f'{who} 개인 카드 확인')
  if len(g['ready'])==len(NAMES):g['stage']='betting';g['turn']=(g['dealer']+3)%len(NAMES);log(g,'PREFLOP 베팅 시작')
 elif typ in ('fold','check-call','bet','all-in'):
  if g['stage']!='betting' or g['turn']!=i:raise ValueError('아직 내 차례가 아닙니다.')
  high=max(x['roundBet'] for x in g['players'])
  if typ=='fold':p['folded']=True;log(g,f'{who} 폴드')
  elif typ=='check-call':
   paid=put(g,p,max(0,high-p['roundBet']));log(g,f'{who} '+(f'{paid:,} 콜' if paid else '체크'))
  elif typ=='bet':
   amount=int(d.get('amount') or 0)
   if amount<=0:raise ValueError('추가 베팅 금액을 입력하세요.')
   paid=put(g,p,amount);log(g,f'{who} {paid:,} 추가 베팅');g['acted']=[]
  else:paid=put(g,p,p['stack']);log(g,f'{who} {paid:,} 올인');g['acted']=[]
  if who not in g['acted']:g['acted'].append(who)
  nextturn(g);finishround(g)
 elif typ=='reveal':
  if not host:raise ValueError('은준만 카드를 공개 처리할 수 있습니다.')
  if g['stage']!='reveal':raise ValueError('현재 베팅 라운드가 끝나지 않았습니다.')
  g['street']+=1;g['stage']='betting';g['acted']=[]
  for x in g['players']:x['roundBet']=0
  g['turn']=(g['dealer']+1)%len(NAMES)
  while not canact(g,g['turn']):nextturn(g)
  log(g,['','FLOP 3장 공개','TURN 1장 공개','RIVER 1장 공개'][g['street']])
 elif typ=='award':
  if not host:raise ValueError('은준만 승자를 지정할 수 있습니다.')
  wins=d.get('winners') or []
  if g['stage']!='showdown' or not wins:raise ValueError('쇼다운에서 승자를 선택하세요.')
  pot=g['pot'];q,r=divmod(pot,len(wins))
  for k,n in enumerate(wins):g['players'][NAMES.index(n)]['stack']+=q+(k<r)
  log(g,' · '.join(wins)+f' 팟 {pot:,} 획득');g['pot']=0;g['hand']+=1;g['street']=0;g['stage']='deal';g['dealer']=(g['dealer']+1)%len(NAMES);g['turn']=None;g['acted']=[];g['ready']=[]
  for x in g['players']:x.update(roundBet=0,folded=False,allIn=x['stack']==0)
  blind(g)
 elif typ=='rebuy-request':
  a=int(d.get('amount') or 0)
  if a<=0:raise ValueError('리바이 금액을 입력하세요.')
  p['pendingRebuy']=a;log(g,f'{who} 리바이 {a:,}칩 요청')
 elif typ=='rebuy-approve':
  if not host:raise ValueError('은준만 승인할 수 있습니다.')
  q=g['players'][NAMES.index(d.get('target'))];a=q['pendingRebuy']
  if not a:raise ValueError('요청이 없습니다.')
  q['stack']+=a;q['rebuy']+=a;q['pendingRebuy']=0;q['allIn']=False;log(g,f"{q['name']} 리바이 {a:,}칩 승인")
 elif typ=='reset':
  if not host:raise ValueError('은준만 초기화할 수 있습니다.')
  return fresh()
 else:raise ValueError('알 수 없는 요청입니다.')
 return g
def pub(g,who):
 x=json.loads(json.dumps(g));x.update(viewer=who,host=HOST,isHost=who==HOST,serverTime=time.time());return x
class H(BaseHTTPRequestHandler):
 def cors(self):self.send_header('Access-Control-Allow-Origin','https://kimisjun.github.io');self.send_header('Access-Control-Allow-Headers','Content-Type');self.send_header('Access-Control-Allow-Methods','GET,POST,OPTIONS');self.send_header('Cache-Control','no-store')
 def out(self,x,c=200):
  b=json.dumps(x,ensure_ascii=False).encode();self.send_response(c);self.cors();self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
 def do_OPTIONS(self):self.send_response(204);self.cors();self.end_headers()
 def do_GET(self):
  who=parse_qs(urlparse(self.path).query).get('player',[''])[0]
  with lock:self.out(pub(load(),who))
 def do_POST(self):
  try:
   d=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))) or b'{}')
   with lock:g=act(load(),d.get('player',''),d);save(g);self.out(pub(g,d.get('player','')))
  except Exception as e:self.out({'error':str(e)},400)
 def log_message(self,*a):pass
if __name__=='__main__':save(load());ThreadingHTTPServer(('127.0.0.1',8788),H).serve_forever()
