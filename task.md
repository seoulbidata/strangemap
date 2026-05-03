# StrangeMap 작업 기록

## 현재 상태

로컬 데모는 `dev_server.py`로 실행한다.

```bash
python3 dev_server.py
```

브라우저 접속 주소:

```text
http://localhost:3000/subway-route-demo.html
```

`file://`로 직접 열면 네이버 지도 인증과 `/api/...` 프록시가 동작하지 않는다.

## 구현 완료

### 1. 네이버 지도 데모

- `naver-map-demo.html` 생성
- 네이버 지도 SDK 연결
- 서울시 문화행사 API를 지도 마커로 표시
- 문화행사 좌표 매핑 수정
  - `LAT` = 위도
  - `LOT` = 경도

### 2. 로컬 프록시 서버

- `dev_server.py` 생성
- 정적 파일 서빙
- 주소/장소 검색 프록시 추가
  - 네이버 Geocoding REST API
  - 서울시 대중교통 `getLocationInfo` fallback
  - OpenStreetMap Nominatim fallback
- 서울시 지하철 실시간 정보 프록시 추가
- 서울시 대중교통환승경로 API 프록시 추가
- 버스 도착정보 프록시 구조 추가

### 3. 실제 대중교통 길찾기

- `subway-route-demo.html`에서 샘플 역망 의존 제거
- 서울시 `getPathInfoBySubway` 연동
- 이후 `getPathInfoByBusNSub`로 전환
- 현재는 버스+지하철 통합 경로를 조회한다.
- 출발지/목적지 입력 후:
  - 주소/장소명 좌표 변환
  - 버스+지하철 환승경로 조회
  - 지도에 경로 표시
  - 총 소요시간 표시
  - 환승 횟수 표시
  - 이동 단계 표시

### 4. 실시간 정보

- 지하철 실시간 도착정보 연동
- 지하철 실시간 열차 위치정보 연동
- 경로의 각 지하철 구간 기준으로:
  - 탑승역
  - 호선
  - 도착 예정 시간
  - 현재 열차 위치
  - 열차번호
  를 표시한다.

- 버스 구간도 도착정보 조회 구조는 붙여둠
- 다만 현재 인증키는 버스 도착정보 서비스 권한이 없어 실제 도착시간은 표시되지 않는다.

## 사용 중인 주요 API

### 대중교통환승경로 조회 서비스

인증키는 `.env`의 `SEOUL_TRANSIT_ROUTE_KEY`로 관리한다.

현재 정상 동작 확인:

- `getLocationInfo`
- `getPathInfoBySubway`
- `getPathInfoByBusNSub`

### 지하철 실시간 도착정보

정상 동작 확인.

### 지하철 실시간 열차 위치정보

정상 동작 확인.

### 버스 도착정보

현재 같은 키로 호출하면 아래 에러가 발생한다.

```text
SERVICE ACCESS DENIED ERROR.[인증모듈 에러코드(20)]
```

즉, 별도로 `서울시 버스도착정보조회 서비스` 활용 승인이 필요하다.

## 현재 한계

- 버스 실시간 도착정보는 권한 문제로 실제 시간 표시 불가
- 버스 구간은 현재 권한 필요 메시지를 표시함
- 여러 후보 경로 중 첫 번째 경로만 화면에 표시
- 도보 구간은 정밀 도보 네비게이션이 아니라 경로 API 구간 좌표를 연결하는 수준
- 혼잡도 반영은 아직 없음
- UI는 데모 수준

## 다음 작업 후보

1. 버스 도착정보 API 활용 승인 후 `/api/bus/realtime` 실제 도착시간 표시
2. 여러 후보 경로 카드 UI 추가
   - 최단시간
   - 환승 적음
   - 버스 적음
   - 지하철 중심
3. 혼잡도 데이터 연동
   - 지하철 승하차 인원
   - 지하철 실시간 위치
   - 시간대별 환승 통계 CSV
4. 경로 점수화
   - 소요시간
   - 환승 횟수
   - 혼잡도
   - 도보 부담
5. 문화행사 POI와 경로 결합
   - 경로 주변 행사 추천
   - 우회 시 추가 소요시간 표시

## 관련 파일

- `dev_server.py`
- `subway-route-demo.html`
- `naver-map-demo.html`
- `NAVER_MAP_SETUP.md`
- `plan.md`
- `spec.md`
