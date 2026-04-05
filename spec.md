# StrangeMap — 기술 상세 명세 (spec.md)

> plan.md의 API 엔드포인트 테이블·폴더 구조는 생략.
> 각 섹션은 구현 시 바로 참조할 수 있도록 타입·시그니처·스키마 수준으로 작성.

---

## 1. TypeScript 타입 정의 (`src/types/`)

### congestion.ts

```typescript
// 혼잡도 등급 — 1(여유) ~ 5(매우 혼잡)
export enum CongestionLevel {
  RELAXED = 1,   // 여유
  NORMAL = 2,    // 보통
  SLIGHT = 3,    // 약간 혼잡
  CROWDED = 4,   // 혼잡
  SEVERE = 5,    // 매우 혼잡
}

// 특정 지역(장소)의 혼잡도 정보
export interface CongestionArea {
  areaId: string;            // 서울 도시데이터 AREA_CD
  name: string;              // "강남역", "홍대입구" 등
  location: LatLng;
  level: CongestionLevel;
  updatedAt: string;         // ISO 8601 — 캐시 갱신 시각
}

// 경로 위 특정 구간의 혼잡도 (폴리라인 세그먼트별)
export interface CongestionSegment {
  start: LatLng;
  end: LatLng;
  level: CongestionLevel;
}

// 서울 열린데이터 citydata API 원본 응답 파싱용
// 실제 응답은 XML/JSON 혼합 — 필요한 필드만 추출
export interface RawCityData {
  AREA_CD: string;
  AREA_NM: string;
  AREA_CONGEST_LVL: string;  // "여유" | "보통" | "약간 붐빔" | "붐빔"
  AREA_CONGEST_MSG: string;  // 혼잡도 안내 메시지
  AREA_PPLTN_MIN: number;    // 실시간 인구 최솟값
  AREA_PPLTN_MAX: number;    // 실시간 인구 최댓값
  PPLTN_TIME: string;        // 데이터 기준 시각
  FCST_YN: string;           // 예측 데이터 포함 여부
  FCST_PPLTN?: RawForecastPopulation[]; // 예측 인구 (있을 경우)
}

// 시간대별 예측 인구 (확장용)
export interface RawForecastPopulation {
  FCST_TIME: string;
  FCST_CONGEST_LVL: string;
  FCST_PPLTN_MIN: number;
  FCST_PPLTN_MAX: number;
}
```

### route.ts

```typescript
// 이동 수단
export type RouteMode = "transit" | "walk";

// 좌표 + 선택적 주소
export interface RoutePoint {
  lat: number;
  lng: number;
  address?: string;          // 역지오코딩 결과 or 유저 입력
}

// 경로 검색 요청 — POST /api/route/search body
export interface RouteSearchRequest {
  origin: RoutePoint;
  destination: RoutePoint;
  mode: RouteMode;
  avoidCongestion: boolean;  // true → 혼잡 구간 우회 경로 포함
}

// 단일 경로 결과
export interface RouteResult {
  id: string;                         // 프론트에서 경로 식별용 UUID
  polyline: LatLng[];                 // 경로 좌표 배열
  duration: number;                   // 분 단위
  distance: number;                   // 미터 단위
  congestionScore: number;            // 1~5 가중 평균 (낮을수록 쾌적)
  congestionSegments: CongestionSegment[]; // 구간별 혼잡도
  isRecommended: boolean;             // 추천 경로 여부 (혼잡도 최적)
}

// 일반 경로 vs 우회 경로 비교 결과
export interface RouteCompareResult {
  normal: RouteResult;                // 최단/기본 경로
  alternatives: RouteResult[];        // 우회 경로 (최대 2개)
  savedCongestion: number;            // 우회 시 혼잡도 개선 수치 (0~4)
  additionalMinutes: number;          // 우회 시 추가 소요 시간
}
```

### poi.ts

```typescript
// POI 카테고리 — string union으로 확장 가능
// 새 카테고리 추가 시 이 union에 리터럴 추가
export type POICategory = "culture" | "event" | "nightview" | (string & {});

// POI 목록용 기본 정보
export interface POI {
  id: string;
  name: string;
  category: POICategory;
  location: LatLng;
  description: string;       // 1~2줄 요약
  thumbnail?: string;        // 이미지 URL (없을 수 있음)
  detourMinutes: number;     // 경로에서 우회 시 추가 소요시간 (분)
}

// 상세 페이지용 확장 정보
export interface POIDetail extends POI {
  fullDescription: string;   // 상세 설명
  address: string;
  openingHours?: string;     // 운영 시간 (행사/전시)
  startDate?: string;        // 행사 시작일 (ISO 8601)
  endDate?: string;          // 행사 종료일
  homepage?: string;         // 관련 웹사이트
  images: string[];          // 추가 이미지 URL 배열
  source: string;            // 데이터 출처 ("culturalEventInfo" 등)
}

// 서울 문화행사 API 원본 응답 파싱용
export interface RawCulturalEventData {
  CODENAME: string;          // 분류명 (클래식, 축제 등)
  GUNAME: string;            // 자치구명
  TITLE: string;             // 행사명
  DATE: string;              // 날짜/시간 (문자열 — 파싱 필요)
  PLACE: string;             // 장소명
  ORG_NAME: string;          // 기관명
  USE_TRGT: string;          // 대상
  USE_FEE: string;           // 이용 요금
  PLAYER: string;            // 출연자
  PROGRAM: string;           // 프로그램 소개
  ETC_DESC: string;          // 기타 내용
  ORG_LINK: string;          // 홈페이지
  MAIN_IMG: string;          // 대표 이미지 URL
  RGSTDATE: string;          // 등록일
  TICKET: string;            // 예매 사이트
  STRTDATE: string;          // 시작일
  END_DATE: string;          // 종료일
  THEMECODE: string;         // 테마 분류 코드
  LOT: string;               // 위도 (문자열 — parseFloat 필요)
  LAT: string;               // 경도 (문자열 — parseFloat 필요)
  IS_FREE: string;           // 무료 여부 ("무료" | "유료")
  HMPG_ADDR: string;         // 홈페이지 주소
}
```

### quest.ts

```typescript
// 퀘스트 유형
export type QuestType = "visit" | "explore" | "collect";

// 퀘스트 상태 — 상태 전이: inactive → active → completed / failed
export type QuestStatus = "inactive" | "active" | "completed" | "failed";

// 퀘스트 개별 목표
export interface QuestObjective {
  id: string;
  description: string;       // "홍대입구역 근처 전시 방문하기" 등
  targetPOI?: string;        // 관련 POI id (없으면 위치 무관 목표)
  completed: boolean;
}

// 퀘스트 보상
export interface QuestReward {
  xp: number;                // 획득 경험치
  badge?: Badge;             // 조건 충족 시 뱃지 (없을 수 있음)
}

// 퀘스트 본체
export interface Quest {
  id: string;
  title: string;
  description: string;
  type: QuestType;
  status: QuestStatus;
  objectives: QuestObjective[];
  reward: QuestReward;
  createdAt: string;         // ISO 8601
  expiresAt?: string;        // 시간 제한 퀘스트용
}

// 뱃지
export interface Badge {
  id: string;
  name: string;              // "야경 탐험가", "문화 마니아" 등
  icon: string;              // 아이콘 경로 (/icons/badges/xxx.png)
  description: string;
  acquiredAt?: string;       // ISO 8601 — 미획득 시 undefined
}

// 유저 진행 상황 (Firestore users/{userId} 문서에 저장)
export interface UserProgress {
  userId: string;
  level: number;             // 현재 레벨 (1~10)
  xp: number;                // 현재 누적 경험치
  badges: Badge[];           // 획득한 뱃지 배열
}

// 레벨별 필요 누적 경험치 테이블
// 레벨 1→2: 100xp, 2→3: 250xp ... 총 10레벨
export const LEVEL_THRESHOLDS: Record<number, number> = {
  1: 0,      // 시작
  2: 100,
  3: 250,
  4: 500,
  5: 850,
  6: 1300,
  7: 1900,
  8: 2700,
  9: 3800,
  10: 5200,  // 최대 레벨
};
```

### 공통 타입 (`src/types/common.ts`)

```typescript
// 위경도 좌표 — 프로젝트 전역에서 사용
export interface LatLng {
  lat: number;
  lng: number;
}

// API 에러 응답 공통 포맷 (섹션 8 참조)
export interface ApiError {
  code: string;              // "CONGESTION_FETCH_FAILED", "QUEST_NOT_FOUND" 등
  message: string;           // 사용자에게 보여줄 메시지
  details?: unknown;         // 디버깅용 추가 정보 (개발 환경에서만 포함)
}

// API 성공 응답 래퍼 (일관된 응답 구조)
export interface ApiResponse<T> {
  data: T;
  cached: boolean;           // 캐시 히트 여부
  timestamp: string;         // 응답 생성 시각
}
```

---

## 2. Firebase 스키마 (Firestore 컬렉션 구조)

### `users/{userId}`

유저 프로필 및 게임 진행 상태를 저장하는 최상위 문서.

```typescript
// Firestore 문서 구조
interface UserDocument {
  displayName: string;       // Firebase Auth에서 가져온 이름
  email: string;
  level: number;             // 기본값: 1
  xp: number;                // 기본값: 0
  badges: Badge[];           // 획득한 뱃지 배열 (빈 배열로 초기화)
  createdAt: Timestamp;      // 계정 생성일
  updatedAt: Timestamp;      // 마지막 갱신일
}
```

### `users/{userId}/quests/{questId}`

유저별 퀘스트 진행 상태를 저장하는 서브컬렉션.

```typescript
// Firestore 서브컬렉션 문서 구조
interface QuestDocument {
  title: string;
  description: string;
  type: QuestType;
  status: QuestStatus;       // "active" | "completed" | "failed"
  objectives: QuestObjective[];
  reward: QuestReward;
  createdAt: Timestamp;
  completedAt?: Timestamp;   // 완료 시 기록
  expiresAt?: Timestamp;     // 시간 제한 퀘스트
}
```

### `cache/{cacheKey}`

서울 열린데이터 API 응답을 캐시하는 컬렉션.

```typescript
// Firestore 캐시 문서 구조
interface CacheDocument<T = unknown> {
  data: T;                   // 캐시된 데이터 (제네릭)
  source: string;            // 데이터 출처 API 이름
  createdAt: Timestamp;
  expiresAt: Timestamp;      // TTL 기반 만료 시각 — 이 시각 이후 캐시 미스 처리
}
```

**cacheKey 네이밍 컨벤션:**

| 데이터 종류 | cacheKey 패턴 | TTL | 예시 |
|---|---|---|---|
| 지역 혼잡도 | `congestion:{areaId}` | 5분 | `congestion:POI001` |
| 전체 혼잡도 목록 | `congestion:all` | 5분 | `congestion:all` |
| 문화행사 POI | `poi:culture:{lat}:{lng}:{radius}` | 1시간 | `poi:culture:37.55:126.97:1000` |
| 야경명소 POI | `poi:nightview:all` | 24시간 | `poi:nightview:all` |
| 카테고리 목록 | `poi:categories` | 24시간 | `poi:categories` |

> 좌표는 소수점 2자리로 반올림하여 캐시 히트율을 높인다.

### Firestore 보안 규칙

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // users 컬렉션 — 본인 문서만 읽기/쓰기 가능
    match /users/{userId} {
      allow read, write: if request.auth != null
                         && request.auth.uid == userId;

      // 서브컬렉션(quests)도 동일 규칙 적용
      match /quests/{questId} {
        allow read, write: if request.auth != null
                           && request.auth.uid == userId;
      }
    }

    // cache 컬렉션 — 서버(Admin SDK)만 쓰기, 클라이언트 읽기 허용
    // Route Handlers는 Admin SDK를 사용하므로 보안 규칙 우회
    // 클라이언트에서 직접 캐시를 읽을 일은 없지만 방어적으로 읽기 허용
    match /cache/{cacheKey} {
      allow read: if true;
      allow write: if false;  // Admin SDK만 쓰기 가능 (규칙 우회)
    }
  }
}
```

---

## 3. Route Handlers 상세 명세 (`src/app/api/`)

### `GET /api/congestion`

전체 혼잡도 현황 (히트맵 렌더링용).

```typescript
// Request: query params 없음

// Response 200
interface CongestionListResponse {
  data: CongestionArea[];    // 모든 모니터링 지역의 혼잡도
  cached: boolean;
  timestamp: string;
}

// 호출 서비스: congestionService.getAllAreaCongestion()
// 캐시: cache/congestion:all (TTL 5분)
// 에러 케이스:
//   - 서울 API 타임아웃 → 만료 캐시 fallback 반환
//   - 서울 API 에러 코드 반환 → ApiError { code: "SEOUL_API_ERROR" }
```

### `GET /api/congestion/[areaId]`

특정 지역의 상세 혼잡도.

```typescript
// Request: path param — areaId (string)

// Response 200
interface CongestionDetailResponse {
  data: CongestionArea;
  cached: boolean;
  timestamp: string;
}

// 호출 서비스: congestionService.getAreaCongestion(areaId)
// 캐시: cache/congestion:{areaId} (TTL 5분)
// 에러 케이스:
//   - 존재하지 않는 areaId → 404 ApiError { code: "AREA_NOT_FOUND" }
```

### `POST /api/route/search`

혼잡도 기반 우회 경로 검색.

```typescript
// Request Body
type RequestBody = RouteSearchRequest;

// Response 200
interface RouteSearchResponse {
  data: {
    routes: RouteResult[];   // 최대 3개 (기본 + 우회)
  };
  cached: boolean;
  timestamp: string;
}

// 호출 서비스:
//   1. routeService.searchRoutes(request)
//      └─ 내부에서 congestionService.getRouteCongestion() 호출
// 캐시: 경로 결과는 캐시하지 않음 (실시간 혼잡도 반영 필요)
//       단, 혼잡도 데이터는 캐시 경유
// 에러 케이스:
//   - origin/destination 누락 → 400 ApiError { code: "INVALID_REQUEST" }
//   - 지도 API 경로 조회 실패 → 502 ApiError { code: "MAP_API_ERROR" }
//   - 서울시 영역 밖 좌표 → 400 ApiError { code: "OUT_OF_BOUNDS" }
```

### `POST /api/route/compare`

일반 경로와 우회 경로 비교.

```typescript
// Request Body
interface RouteCompareRequest {
  origin: RoutePoint;
  destination: RoutePoint;
  mode: RouteMode;
}

// Response 200
interface RouteCompareResponse {
  data: RouteCompareResult;
  cached: boolean;
  timestamp: string;
}

// 호출 서비스:
//   1. routeService.compareRoutes(origin, destination, mode)
//      └─ searchRoutes를 avoidCongestion: false / true 두 번 호출
// 캐시: 사용 안 함
// 에러 케이스: /api/route/search와 동일
```

### `GET /api/poi`

경로 주변 POI 조회.

```typescript
// Request: query params
interface POIQueryParams {
  routeId: string;           // 경로 id (필수)
  category?: POICategory;    // 필터 (선택)
  radius?: number;           // 미터 단위, 기본값 500
}

// Response 200
interface POIListResponse {
  data: {
    pois: POI[];
  };
  cached: boolean;
  timestamp: string;
}

// 호출 서비스: poiService.getNearbyPOIs(routeId, category, radius)
// 캐시: cache/poi:{category}:{lat}:{lng}:{radius} (카테고리별 TTL 상이)
// 에러 케이스:
//   - routeId에 해당하는 경로 없음 → 404 ApiError { code: "ROUTE_NOT_FOUND" }
```

### `GET /api/poi/[id]`

POI 상세 정보.

```typescript
// Request: path param — id (string)

// Response 200
interface POIDetailResponse {
  data: POIDetail;
  cached: boolean;
  timestamp: string;
}

// 호출 서비스: poiService.getPOIDetail(id)
// 캐시: 서울 API 원본 데이터 캐시 활용 (별도 POI 단건 캐시 없음)
// 에러 케이스:
//   - 존재하지 않는 id → 404 ApiError { code: "POI_NOT_FOUND" }
```

### `GET /api/poi/categories`

사용 가능한 POI 카테고리 목록.

```typescript
// Request: 없음

// Response 200
interface CategoriesResponse {
  data: {
    categories: Array<{
      id: POICategory;
      name: string;          // "문화/전시", "행사/축제", "야경명소"
      icon: string;          // 마커 아이콘 경로
      count: number;         // 해당 카테고리 POI 수
    }>;
  };
  cached: boolean;
  timestamp: string;
}

// 호출 서비스: poiService.getCategories()
// 캐시: cache/poi:categories (TTL 24시간)
// 에러 케이스: 거의 없음 (정적 데이터 + 캐시)
```

### `POST /api/quest/generate`

경로 기반 퀘스트 자동 생성.

```typescript
// Request Body
interface QuestGenerateRequest {
  routeId: string;
  origin: RoutePoint;
  destination: RoutePoint;
}

// Response 201
interface QuestGenerateResponse {
  data: {
    quests: Quest[];         // 생성된 퀘스트 (2~3개)
  };
  timestamp: string;
}

// 호출 서비스:
//   1. questService.generateQuests(routeId, origin, destination)
//      └─ 내부에서 poiService.getNearbyPOIs() 호출하여 타겟 POI 결정
//   2. Firestore users/{userId}/quests에 저장
// 캐시: 사용 안 함 (매번 새로 생성)
// 에러 케이스:
//   - 미인증 → 401 ApiError { code: "UNAUTHORIZED" }
//   - 이미 활성 퀘스트 5개 이상 → 400 ApiError { code: "QUEST_LIMIT_EXCEEDED" }
```

### `GET /api/quest/active`

현재 활성 퀘스트 목록.

```typescript
// Request: 인증 토큰으로 userId 추출 (Authorization 헤더)

// Response 200
interface ActiveQuestsResponse {
  data: {
    quests: Quest[];
    progress: UserProgress;
  };
  timestamp: string;
}

// 호출 서비스: questService.getActiveQuests(userId)
// 캐시: 사용 안 함 (Firestore 직접 조회)
// 에러 케이스:
//   - 미인증 → 401 ApiError { code: "UNAUTHORIZED" }
```

### `PATCH /api/quest/[id]/progress`

퀘스트 개별 목표 완료 처리.

```typescript
// Request Body
interface QuestProgressRequest {
  objectiveId: string;       // 완료할 목표 id
}

// Response 200
interface QuestProgressResponse {
  data: Quest;               // 갱신된 퀘스트 상태
  timestamp: string;
}

// 호출 서비스: questService.updateProgress(questId, objectiveId, userId)
// 캐시: 사용 안 함
// 에러 케이스:
//   - 미인증 → 401
//   - 퀘스트 없음 → 404 ApiError { code: "QUEST_NOT_FOUND" }
//   - 이미 완료된 목표 → 400 ApiError { code: "OBJECTIVE_ALREADY_COMPLETED" }
//   - 본인 퀘스트 아님 → 403 ApiError { code: "FORBIDDEN" }
```

### `POST /api/quest/[id]/complete`

퀘스트 완료 처리 및 보상 지급.

```typescript
// Request: path param — id (string), 인증 필요

// Response 200
interface QuestCompleteResponse {
  data: {
    reward: QuestReward;
    leveledUp: boolean;      // 레벨업 여부
    newLevel?: number;       // 레벨업 시 새 레벨
    newXP: number;           // 보상 후 총 XP
  };
  timestamp: string;
}

// 호출 서비스:
//   1. questService.completeQuest(questId, userId)
//   2. questService.calculateXP(quest)
//   3. questService.checkLevelUp(currentXP, gainedXP)
//   4. Firestore users/{userId} 문서 xp/level/badges 갱신
// 캐시: 사용 안 함
// 에러 케이스:
//   - 미인증 → 401
//   - 퀘스트 없음 → 404
//   - 목표 미완료 상태에서 완료 시도 → 400 ApiError { code: "OBJECTIVES_INCOMPLETE" }
//   - 이미 완료된 퀘스트 → 400 ApiError { code: "QUEST_ALREADY_COMPLETED" }
```

### `GET /api/quest/badges`

획득한 뱃지 목록.

```typescript
// Request: 인증 토큰으로 userId 추출

// Response 200
interface BadgesResponse {
  data: {
    badges: Badge[];
    totalCount: number;      // 전체 뱃지 종류 수 (컬렉션 진행률 표시용)
  };
  timestamp: string;
}

// 호출 서비스: questService.getUserBadges(userId)
// 캐시: 사용 안 함 (Firestore 직접 조회)
// 에러 케이스:
//   - 미인증 → 401
```

---

## 4. Service 함수 명세 (`src/services/`)

### congestion.service.ts

```typescript
import { CongestionArea, CongestionSegment, RawCityData } from "@/types/congestion";
import { RoutePoint } from "@/types/route";

// 특정 지역 혼잡도 조회
// 1. Firestore 캐시 확인 → 2. 캐시 미스 시 서울 API 호출 → 3. 결과 캐시 저장
export async function getAreaCongestion(areaId: string): Promise<CongestionArea>;

// 전체 지역 혼잡도 조회 (히트맵용)
export async function getAllAreaCongestion(): Promise<CongestionArea[]>;

// 경로 상 구간별 혼잡도 조회
// waypoints를 순회하며 각 구간이 지나는 혼잡 지역을 매핑
export async function getRouteCongestion(
  waypoints: RoutePoint[]
): Promise<CongestionSegment[]>;

// 서울 열린데이터 citydata API 직접 호출 (캐시 미스 시에만 사용)
// 내부적으로 seoul-api.provider.ts를 통해 호출
export async function fetchFromSeoulAPI(areaId?: string): Promise<RawCityData[]>;

// 서울 API 원본 혼잡도 문자열 → CongestionLevel 숫자 변환
// "여유" → 1, "보통" → 2, "약간 붐빔" → 3, "붐빔" → 4
// 매핑 안 되는 값은 3(SLIGHT)으로 기본 처리
export function parseCongestionLevel(raw: string): CongestionLevel;
```

### route.service.ts

```typescript
import { RouteSearchRequest, RouteResult, RouteCompareResult, RoutePoint } from "@/types/route";
import { CongestionSegment } from "@/types/congestion";

// 경로 검색 — 지도 API 호출 + 혼잡도 스코어링
// avoidCongestion=true 시 혼잡 구간을 경유지에서 제외한 대안 경로도 반환
// 최대 3개 경로 반환 (기본 1 + 우회 최대 2)
export async function searchRoutes(
  request: RouteSearchRequest
): Promise<RouteResult[]>;

// 일반 vs 우회 경로 비교
// 내부적으로 searchRoutes를 두 번 호출 (avoidCongestion false/true)
export async function compareRoutes(
  origin: RoutePoint,
  destination: RoutePoint,
  mode: RouteMode
): Promise<RouteCompareResult>;

// 혼잡도 가중치 스코어링
// 공식: 각 세그먼트의 (level × 세그먼트_거리_비율)의 합
// 예: 전체 경로 10km, 혼잡구간 2km(level 4) + 나머지 8km(level 1)
//     = (4 × 0.2) + (1 × 0.8) = 1.6 → 반올림하여 2
export function scoreCongestion(
  route: RouteResult,
  segments: CongestionSegment[]
): number;
```

### poi.service.ts

```typescript
import { POI, POIDetail, POICategory } from "@/types/poi";
import { LatLng } from "@/types/common";

// 경로 주변 POI 조회
// 1. routeId로 경로 폴리라인 가져오기
// 2. 카테고리별 서울 API 데이터 캐시 조회
// 3. isWithinRouteBound로 경로 버퍼 내 POI 필터링
export async function getNearbyPOIs(
  routeId: string,
  category?: POICategory,
  radius?: number            // 기본값 500m
): Promise<POI[]>;

// POI 상세 정보 조회
export async function getPOIDetail(id: string): Promise<POIDetail>;

// 사용 가능한 카테고리 목록 + 각 카테고리별 POI 수
export async function getCategories(): Promise<Array<{
  id: POICategory;
  name: string;
  icon: string;
  count: number;
}>>;

// 특정 POI가 경로 버퍼 영역 내에 있는지 판별
// 로직: 폴리라인의 각 세그먼트와 POI 좌표 간 최단 거리를 계산,
//       radiusMeters 이내이면 true
// Haversine 공식 기반 거리 계산 (src/lib/mapUtils.ts 활용)
export function isWithinRouteBound(
  poi: LatLng,
  routePolyline: LatLng[],
  radiusMeters: number
): boolean;
```

### quest.service.ts

```typescript
import { Quest, QuestReward, Badge, UserProgress, LEVEL_THRESHOLDS } from "@/types/quest";
import { RoutePoint } from "@/types/route";

// 경로 기반 퀘스트 자동 생성
// 생성 로직:
//   1. 경로 주변 POI를 조회하여 "visit" 퀘스트 생성
//   2. 경로 거리 기반 "explore" 퀘스트 생성 (5km 이상 시)
//   3. 카테고리 다양성 기반 "collect" 퀘스트 생성
// 한 번에 2~3개 퀘스트 생성, Firestore에 저장 후 반환
export async function generateQuests(
  routeId: string,
  origin: RoutePoint,
  destination: RoutePoint
): Promise<Quest[]>;

// 유저의 활성 퀘스트 조회
// Firestore users/{userId}/quests에서 status="active" 필터
export async function getActiveQuests(userId: string): Promise<Quest[]>;

// 퀘스트 개별 목표 완료 처리
// Firestore 문서에서 해당 objective의 completed를 true로 갱신
export async function updateProgress(
  questId: string,
  objectiveId: string,
  userId: string
): Promise<Quest>;

// 퀘스트 완료 처리 + 보상 지급
// 1. 모든 objective가 completed인지 검증
// 2. 퀘스트 status를 "completed"로 변경
// 3. users/{userId} 문서에 xp 증가, 뱃지 추가
export async function completeQuest(
  questId: string,
  userId: string
): Promise<QuestReward>;

// 유저 뱃지 목록 조회
export async function getUserBadges(userId: string): Promise<Badge[]>;

// 경험치 계산 공식
// 기본 XP: visit=30, explore=50, collect=40
// 보너스: 목표 수 × 10 (목표가 많을수록 보상 증가)
export function calculateXP(quest: Quest): number;

// 레벨업 판정
// LEVEL_THRESHOLDS 테이블과 비교하여 레벨업 여부 반환
export function checkLevelUp(
  currentXP: number,
  gainedXP: number
): { leveledUp: boolean; newLevel: number };
```

---

## 5. Firebase 초기화 및 헬퍼 (`src/lib/`)

### firebase.ts

```typescript
// ──────────────────────────────
// 클라이언트용 Firebase 초기화
// ──────────────────────────────
// 브라우저에서 실행 — Auth UI, Firestore 읽기 등에 사용
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// 중복 초기화 방지 (HMR 대응)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);

// ──────────────────────────────
// 서버용 Firebase Admin SDK 초기화
// ──────────────────────────────
// Route Handlers에서만 사용 — 보안 규칙 우회, 캐시 쓰기 등
import { initializeApp as initAdmin, getApps as getAdminApps, cert } from "firebase-admin/app";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { getAuth as getAdminAuth } from "firebase-admin/auth";

const adminApp =
  getAdminApps().length === 0
    ? initAdmin({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          // JSON 키의 개행 문자 처리
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
      })
    : getAdminApps()[0];

export const adminDb = getAdminFirestore(adminApp);
export const adminAuth = getAdminAuth(adminApp);
```

> **주의**: 클라이언트용과 Admin SDK 초기화를 같은 파일에 두되, 서버 전용 코드는 `"use server"` 또는 별도 파일 분리(`firebase-admin.ts`)로 클라이언트 번들에 포함되지 않도록 한다. 실제 구현 시 Admin SDK를 `src/lib/firebase-admin.ts`로 분리하는 것을 권장.

### firestore.ts

```typescript
import { adminDb } from "./firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

// 캐시 읽기 — 만료 전 데이터 반환, 만료 시 null
export async function getCached<T>(key: string): Promise<T | null> {
  const doc = await adminDb.collection("cache").doc(key).get();

  if (!doc.exists) return null;

  const { data, expiresAt } = doc.data() as {
    data: T;
    expiresAt: Timestamp;
  };

  // 만료 확인 — Firestore Timestamp를 밀리초로 변환하여 비교
  if (expiresAt.toMillis() < Date.now()) return null;

  return data;
}

// 캐시 쓰기 — TTL 기반 만료 시각 설정
export async function setCached<T>(
  key: string,
  data: T,
  ttlSeconds: number
): Promise<void> {
  await adminDb.collection("cache").doc(key).set({
    data,
    source: key.split(":")[0],           // cacheKey 첫 세그먼트 = 데이터 출처
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + ttlSeconds * 1000),
  });
}

// 만료 캐시 읽기 — 서울 API 장애 시 fallback용
// 만료 여부와 관계없이 데이터 반환 (stale data)
export async function getCachedStale<T>(key: string): Promise<T | null> {
  const doc = await adminDb.collection("cache").doc(key).get();
  if (!doc.exists) return null;
  return (doc.data() as { data: T }).data;
}
```

---

## 6. 전역 상태 (`src/store/` — Zustand)

### mapStore.ts

```typescript
import { create } from "zustand";
import { RoutePoint, RouteResult } from "@/types/route";
import { POI, POICategory } from "@/types/poi";

interface MapState {
  // ── 상태 ──
  origin: RoutePoint | null;
  destination: RoutePoint | null;
  activeRoute: RouteResult | null;          // 현재 선택된 경로
  selectedPOI: POI | null;                  // 지도에서 클릭한 POI
  categoryFilters: Set<POICategory>;        // 활성화된 카테고리 필터

  // ── 액션 ──
  setOrigin: (point: RoutePoint | null) => void;
  setDestination: (point: RoutePoint | null) => void;
  setActiveRoute: (route: RouteResult | null) => void;
  selectPOI: (poi: POI | null) => void;
  toggleCategory: (category: POICategory) => void;  // 토글: 있으면 제거, 없으면 추가
}

export const useMapStore = create<MapState>((set) => ({
  origin: null,
  destination: null,
  activeRoute: null,
  selectedPOI: null,
  categoryFilters: new Set(["culture", "event", "nightview"]),  // 기본: 전체 활성

  setOrigin: (point) => set({ origin: point }),
  setDestination: (point) => set({ destination: point }),
  setActiveRoute: (route) => set({ activeRoute: route }),
  selectPOI: (poi) => set({ selectedPOI: poi }),
  toggleCategory: (category) =>
    set((state) => {
      const next = new Set(state.categoryFilters);
      next.has(category) ? next.delete(category) : next.add(category);
      return { categoryFilters: next };
    }),
}));
```

### questStore.ts

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Quest, UserProgress } from "@/types/quest";

interface QuestState {
  // ── 상태 ──
  activeQuests: Quest[];
  userProgress: UserProgress | null;

  // ── 액션 ──
  setActiveQuests: (quests: Quest[]) => void;
  updateQuestProgress: (questId: string, objectiveId: string) => void;
  addXP: (amount: number) => void;
}

// localStorage 영속화 — 새로고침 후에도 퀘스트 상태 유지
export const useQuestStore = create<QuestState>()(
  persist(
    (set) => ({
      activeQuests: [],
      userProgress: null,

      setActiveQuests: (quests) => set({ activeQuests: quests }),

      // 특정 퀘스트의 특정 목표를 완료 처리 (낙관적 업데이트)
      updateQuestProgress: (questId, objectiveId) =>
        set((state) => ({
          activeQuests: state.activeQuests.map((q) =>
            q.id === questId
              ? {
                  ...q,
                  objectives: q.objectives.map((o) =>
                    o.id === objectiveId ? { ...o, completed: true } : o
                  ),
                }
              : q
          ),
        })),

      addXP: (amount) =>
        set((state) => ({
          userProgress: state.userProgress
            ? { ...state.userProgress, xp: state.userProgress.xp + amount }
            : null,
        })),
    }),
    {
      name: "strangemap-quest",    // localStorage 키
    }
  )
);
```

### uiStore.ts

```typescript
import { create } from "zustand";

// 사이드 패널 종류
type PanelType = "route" | "poi" | "quest";

interface UIState {
  // ── 상태 ──
  isPanelOpen: boolean;
  activePanel: PanelType;
  isLoading: boolean;

  // ── 액션 ──
  openPanel: (panel: PanelType) => void;  // 패널 열기 + 종류 설정
  closePanel: () => void;
  setLoading: (loading: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isPanelOpen: false,
  activePanel: "route",
  isLoading: false,

  openPanel: (panel) => set({ isPanelOpen: true, activePanel: panel }),
  closePanel: () => set({ isPanelOpen: false }),
  setLoading: (loading) => set({ isLoading: loading }),
}));
```

---

## 7. 환경변수 목록 (`.env.example`)

```bash
# ──────────────────────────────
# Firebase 클라이언트 (브라우저 노출 OK — NEXT_PUBLIC_ 접두사)
# Firebase 콘솔 > 프로젝트 설정 > 일반 > 내 앱 > Firebase SDK snippet
# ──────────────────────────────
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# ──────────────────────────────
# Firebase Admin SDK (서버 전용 — 절대 클라이언트에 노출 금지)
# Firebase 콘솔 > 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성
# ──────────────────────────────
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# ──────────────────────────────
# 서울 열린데이터광장 API 인증키 (서버 전용)
# https://data.seoul.go.kr/ 에서 발급
# ──────────────────────────────
SEOUL_OPENDATA_API_KEY=

# ──────────────────────────────
# 지도 API 키 (미결 — 선택한 쪽만 사용)
# ──────────────────────────────
# 네이버 지도 — https://console.ncloud.com/naver-service/application
NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=
NAVER_MAP_CLIENT_SECRET=

# 카카오 맵 — https://developers.kakao.com/
NEXT_PUBLIC_KAKAO_MAP_APP_KEY=
KAKAO_REST_API_KEY=
```

> **Vercel 배포 시**: Vercel 대시보드 > Settings > Environment Variables에 동일 키 등록.
> `NEXT_PUBLIC_` 접두사가 없는 변수는 서버 사이드에서만 접근 가능.

---

## 8. 에러 처리 컨벤션

### API 에러 응답 공통 포맷

모든 Route Handler는 에러 시 동일한 구조로 응답한다.

```typescript
// src/types/common.ts에 정의 (섹션 1 참조)
export interface ApiError {
  code: string;              // 머신 리더블 에러 코드
  message: string;           // 사용자 친화적 메시지
  details?: unknown;         // 개발 환경에서만 포함 (스택트레이스 등)
}

// 에러 코드 정의 — 코드 전체에서 상수로 관리
export const ERROR_CODES = {
  // 공통
  INVALID_REQUEST: "INVALID_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  INTERNAL_ERROR: "INTERNAL_ERROR",

  // 혼잡도
  AREA_NOT_FOUND: "AREA_NOT_FOUND",
  SEOUL_API_ERROR: "SEOUL_API_ERROR",
  SEOUL_API_TIMEOUT: "SEOUL_API_TIMEOUT",

  // 경로
  MAP_API_ERROR: "MAP_API_ERROR",
  OUT_OF_BOUNDS: "OUT_OF_BOUNDS",
  ROUTE_NOT_FOUND: "ROUTE_NOT_FOUND",

  // POI
  POI_NOT_FOUND: "POI_NOT_FOUND",

  // 퀘스트
  QUEST_NOT_FOUND: "QUEST_NOT_FOUND",
  QUEST_LIMIT_EXCEEDED: "QUEST_LIMIT_EXCEEDED",
  QUEST_ALREADY_COMPLETED: "QUEST_ALREADY_COMPLETED",
  OBJECTIVES_INCOMPLETE: "OBJECTIVES_INCOMPLETE",
  OBJECTIVE_ALREADY_COMPLETED: "OBJECTIVE_ALREADY_COMPLETED",
} as const;
```

### Route Handler 에러 응답 헬퍼

```typescript
// src/lib/api-error.ts
import { NextResponse } from "next/server";
import { ApiError } from "@/types/common";

// HTTP 상태 코드 매핑
const STATUS_MAP: Record<string, number> = {
  INVALID_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  AREA_NOT_FOUND: 404,
  POI_NOT_FOUND: 404,
  QUEST_NOT_FOUND: 404,
  ROUTE_NOT_FOUND: 404,
  QUEST_LIMIT_EXCEEDED: 400,
  QUEST_ALREADY_COMPLETED: 400,
  OBJECTIVES_INCOMPLETE: 400,
  OBJECTIVE_ALREADY_COMPLETED: 400,
  OUT_OF_BOUNDS: 400,
  SEOUL_API_ERROR: 502,
  SEOUL_API_TIMEOUT: 504,
  MAP_API_ERROR: 502,
  INTERNAL_ERROR: 500,
};

export function apiError(code: string, message: string, details?: unknown) {
  const status = STATUS_MAP[code] ?? 500;
  const body: ApiError = { code, message };

  // 개발 환경에서만 상세 정보 포함
  if (process.env.NODE_ENV === "development" && details) {
    body.details = details;
  }

  return NextResponse.json(body, { status });
}
```

### 서울 열린데이터광장 에러 처리

서울 열린데이터광장 API는 **HTTP 200으로 에러를 반환**하는 특수한 구조를 가진다.

```typescript
// 서울 API 응답 래퍼 (성공/실패 모두 200 OK)
interface SeoulAPIResponse<T> {
  [serviceName: string]: {
    list_total_count: number;
    RESULT: {
      CODE: string;          // "INFO-000" = 성공, 그 외 = 에러
      MESSAGE: string;
    };
    row?: T[];               // 성공 시에만 존재
  };
}

// 에러 코드 매핑
// INFO-000: 정상
// ERROR-300: 필수 값 누락
// INFO-100: 인증키 오류
// INFO-200: 해당 데이터 없음 (정상 빈 결과 — 에러가 아님)
// ERROR-500: 서버 오류
// ERROR-600: DB 오류
// ERROR-601: SQL 오류

// 파싱 예시 (src/providers/seoul-api.provider.ts)
export async function fetchSeoulAPI<T>(
  serviceName: string,
  params: Record<string, string>
): Promise<T[]> {
  const url = `http://openapi.seoul.go.kr:8088/${process.env.SEOUL_OPENDATA_API_KEY}/json/${serviceName}/1/100/`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  // 8초 타임아웃 — Vercel 10초 제한에 여유 확보

  const json: SeoulAPIResponse<T> = await res.json();
  const service = json[serviceName];

  if (!service) throw new Error(`Unknown service: ${serviceName}`);

  const { CODE, MESSAGE } = service.RESULT;

  if (CODE === "INFO-200") return [];           // 데이터 없음 — 빈 배열 반환
  if (CODE !== "INFO-000") throw new Error(`Seoul API [${CODE}]: ${MESSAGE}`);

  return service.row ?? [];
}
```

### 캐시 만료 데이터 Fallback 전략

서울 API 장애 또는 타임아웃 시 **만료된 캐시 데이터를 반환**하는 전략.

```typescript
// 서비스 함수 내 캐시 + fallback 패턴 (의사 코드)
async function getDataWithFallback<T>(cacheKey: string, fetcher: () => Promise<T>): Promise<T> {
  // 1단계: 유효한 캐시 확인
  const cached = await getCached<T>(cacheKey);
  if (cached) return cached;

  try {
    // 2단계: 서울 API 호출
    const fresh = await fetcher();
    await setCached(cacheKey, fresh, TTL_SECONDS);
    return fresh;
  } catch (error) {
    // 3단계: 실패 시 만료 캐시라도 반환 (stale data)
    const stale = await getCachedStale<T>(cacheKey);
    if (stale) return stale;

    // 캐시도 없으면 에러 전파
    throw error;
  }
}
```

### Vercel 서버리스 타임아웃 대응

Vercel 무료 플랜 서버리스 함수 실행 제한: **10초**.

```
요청 처리 흐름 (시간 예산):
┌─────────────────────────────────────────────────┐
│ 0s     Firestore 캐시 조회 (~200ms)             │
│ 0.2s   캐시 히트 → 즉시 반환 (총 ~300ms)        │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│ 0.2s   캐시 미스 → 서울 API 호출 (최대 8초)     │
│ 8.2s   응답 파싱 + Firestore 캐시 저장 (~500ms) │
│ 8.7s   클라이언트 응답 반환                      │
│ 10s    Vercel 타임아웃 ← 1.3초 여유              │
└─────────────────────────────────────────────────┘
```

**핵심 원칙:**
1. **캐시 우선 조회** — 모든 외부 API 호출 전에 Firestore 캐시를 먼저 확인
2. **AbortSignal.timeout(8000)** — 서울/지도 API 호출에 8초 타임아웃 설정
3. **캐시 쓰기는 응답 반환 후 비동기 처리 불가** — Vercel 서버리스는 응답 후 함수 종료, 반드시 응답 전에 캐시 저장 완료
4. **만료 캐시 fallback** — 타임아웃 발생 시 stale 데이터라도 반환하여 UX 보장
