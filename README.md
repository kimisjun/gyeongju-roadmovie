# WINGING IT IN GYEONGJU — 경탁가 19즈의 얼렁뚱땅 경주 여행

2026년 7월 11–12일 경주 1박 2일 여행을 위한 정적 마이크로사이트입니다.

## 페이지

- `index.html` — DAY 01/02 일정, 출발 카운트다운, 멤버 합류 상태, 준비 체크리스트, 비용 범위
- `map.html` — Leaflet + OpenStreetMap 경로 지도, DAY 01/02 전환, OSRM 도로 경로와 직선 폴백
- `pickem.html` — 경주토토 사용자 선택 입장, 경기 승자 예측, 경기 시작 잠금, 역배 배율, 총 저녁값 입력과 원 단위 정산
- `plan-b.html` — 지연·우천·입수 통제 시나리오 선택 및 여행 메모 편집

## 로컬 실행

파일을 직접 열기보다 프로젝트 폴더에서 HTTP 서버를 실행하세요.

```bash
cd /Users/kimisjun/Desktop/gyeongju-roadmovie
python3 -m http.server 8080
```

브라우저에서 <http://localhost:8080/>을 엽니다.

## 배포

빌드 과정이 없으며 모든 내부 경로가 상대 URL입니다. GitHub 저장소에 그대로 올린 뒤 **Settings → Pages → Deploy from a branch**에서 루트 폴더를 선택하면 됩니다.

## 데이터와 네트워크

- 체크리스트, 활성 PLAN B, 사용자 메모와 입력한 총 저녁값은 브라우저 `localStorage`에만 저장됩니다. 다른 기기와 동기화되지 않습니다.
- 경주토토 예측은 Supabase에 동기화됩니다. 입장 화면에서 네 명 중 이름을 선택하면 토토 화면이 열립니다.
- 경기 전에는 본인 선택만 조회할 수 있고, 경기 시작 후 선택 인원·이름·역배 배율이 공개됩니다. DB 서버 시각을 기준으로 잠깁니다.
- 지도는 프로젝트에 포함된 Leaflet 1.9.4 CSS/JS와 OpenStreetMap 타일을 사용합니다.
- 도로 경로는 공개 OSRM 데모 서버에서 동적으로 요청합니다. 요청 실패 시 좌표 사이를 잇는 붉은 점선으로 자동 대체합니다.
- Google Fonts가 차단돼도 시스템 폰트로 사용할 수 있습니다. 히어로 로드트립 사진은 프로젝트에 포함돼 있습니다.
- 거리와 시간은 계획 추정치이며 실시간 교통을 반영하지 않습니다. 출발 직전 네이버 지도와 각 시설 공식 채널에서 재확인하세요.

## 파일

```text
.
├── index.html
├── map.html
├── pickem.html
├── plan-b.html
├── 404.html
├── styles.css
├── app.js
├── map.js
├── pickem.js
├── assets/
│   ├── road-trip.jpg
│   ├── leaflet.css
│   └── leaflet.js
└── README.md
```

## 크레딧

- 지도 데이터: © OpenStreetMap contributors
- 경로 계산: OSRM public demo server
- 히어로 사진: Unsplash (`photo-1449824913935-59a10b8d2000`)
