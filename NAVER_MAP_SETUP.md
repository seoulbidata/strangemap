# NAVER Map Local Setup

`naver-map-demo.html`은 로컬호스트에서 네이버 지도 연결만 빠르게 검증하는 최소 파일입니다.
지금 버전은 여기에 서울 문화행사 API 호출과 지도 마커 표시까지 포함합니다.

`subway-route-demo.html`은 혼잡도 없이 지하철 경로 탐색 엔진이 정상 작동하는지 먼저 확인하는
샘플 파일입니다. 이 파일은 로컬 `/api/geocode` 프록시를 통해 네이버 Geocoding REST API를 호출합니다.

## 실행 방법

프로젝트 루트에서 아래처럼 로컬 데모 서버를 띄우면 됩니다.

```bash
python3 dev_server.py
```

브라우저에서 아래 주소로 접속하세요.

```text
http://localhost:3000/naver-map-demo.html
```

또는 지하철 길찾기 데모는 아래 주소입니다.

```text
http://localhost:3000/subway-route-demo.html
```

## 네이버 콘솔 체크리스트

Naver Cloud Console의 `Maps > Application > 인증 정보`에서 아래를 확인하세요.

- `Web 서비스 URL`에 `http://localhost` 등록
- `Web 서비스 URL`에 `http://127.0.0.1` 등록
- 포트 번호는 등록하지 않기
- 경로(`/something`)는 등록하지 않기
- `Dynamic Map` 사용 체크

예시:

- `http://localhost:3000` 등록: 잘못됨
- `http://localhost` 등록: 맞음

## 중요한 보안 메모

이번 데모에는 네이버 지도 `Client ID`와 서울 열린데이터 `API Key`가 파일 안에 들어 있습니다.

- `Client ID`: 브라우저 지도 SDK 로딩에 사용 가능
- `Client Secret`: 프론트엔드에 넣으면 안 됨. 서버 전용
- `서울 열린데이터 API Key`: 데모에서는 직접 호출하지만, 실제 앱에서는 서버 라우트로 옮기는 편이 안전함

## 인증이 계속 실패하면

브라우저 콘솔에서 아래를 확인하세요.

- `navermap_authFailure` 알림이 뜨는지
- SDK 요청이 200으로 내려오는지
- 콘솔의 서비스 URL 설정이 반영되었는지

## 문화행사 데이터가 안 보이면

- 브라우저 콘솔에 CORS 에러가 있는지 확인
- 서울 열린데이터 응답 형식이 바뀌지 않았는지 확인
- 현재 지도 영역이 너무 좁아 행사 좌표가 화면 밖에 없는지 확인

이 경우 다음 단계는 브라우저 직접 호출 대신 로컬 서버 또는 Next.js Route Handler에서
서울 열린데이터를 대신 호출하는 방식으로 바꾸는 것입니다.

## 지하철 길찾기 데모 안내

- 현재는 서울 핵심 환승역 중심의 샘플 네트워크만 포함합니다.
- 입력은 `홍대입구`, `시청`, `서울역`, `충무로`, `사당`, `교대`, `강남`, `잠실`,
  `고속터미널`, `여의도` 같은 역명으로 테스트하면 됩니다.
- 서울 전역 주소 검색은 로컬 geocoding 프록시를 통해 처리합니다.
- 이 단계의 목표는 혼잡도 반영 전 `경로 탐색`, `환승 계산`, `지도 표시`가 잘 되는지 확인하는 것입니다.

공식 참고:

- https://navermaps.github.io/maps.js.ncp/docs/tutorial-2-Getting-Started.html
- https://guide.ncloud-docs.com/docs/application-maps-troubleshoot
