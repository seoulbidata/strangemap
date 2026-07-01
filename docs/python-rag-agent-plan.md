# 서울로 AI — Python · LangGraph · RAG · vLLM 재설계 계획

> 상태: **구상 단계** (실 서비스 지원/예산 확보 시 진행). 현 프로덕션은 TS/Next.js API Routes + Gemini REST 직접 호출이며 이 문서를 코드로 옮기지 않는다.
> 목적: 현재 "API에 프롬프트 직접 주입" 방식의 AI 호출을, **자체 호스팅 LLM(vLLM) + 벡터DB RAG + LangGraph 오케스트레이션**으로 옮길 때의 설계 청사진.

---

## 0. 현재(AS-IS) 정리 — 무엇을 대체하는가

| 현재 | 구현 위치 | 역할 |
|---|---|---|
| `generateGeminiJsonText()` | `src/lib/gemini.ts` | Gemini 3.1 Flash Lite REST 직접 호출, responseSchema로 JSON 강제 |
| 장소소개 | `src/app/api/ai-info/route.ts` | 단일 장소 → summary/highlights/tip/best_time/crowd_tip JSON |
| 상황추천 | `src/app/api/ai-recommend/route.ts` | 동행/나이/시간/목적/지역/혼잡선호 → 활동 3개 JSON |
| 실시간 데이터 | 각 라우트에 중복 구현 | `citydata_ppltn`(혼잡도), `culturalEventInfo`(행사) → **프롬프트에 직접 주입** |
| 장소 지식 | `src/lib/seoulPlaces.ts` (71개 하드코딩) | place/category/description/좌표. **의미 메타데이터 없음** |
| 코스 | `src/data/themeCourses.ts` (15개 하드코딩) | ThemeCourse/CourseStop |

**핵심 한계 3가지** (RAG로 풀 대상):
1. 장소 지식이 71개 하드코딩 `description` 1줄뿐 → 최신·풍부한 컨텐츠를 모델이 못 본다.
2. "추측 금지" 규칙으로 모델을 묶어 둠 → 근거(grounding)가 없어서 그렇게 할 수밖에 없음. RAG가 근거를 공급하면 이 제약을 풀 수 있다.
3. 4개 기능이 병렬적 → 단일 그래프가 의도 분기 + 도구 조합으로 오케스트레이션.

> 주의: **서울 실시간 API(혼잡도·행사)는 RAG 대상이 아니다.** 초 단위로 변하는 값이라 임베딩하면 안 되고, 지금처럼 **도구 호출 → 컨텍스트 주입**이 맞다. 벡터DB에는 "잘 안 변하는 컨텐츠"(장소 서사, 역사, 동선 노하우, 큐레이션 글)만 넣는다.

---

## 1. 목표 아키텍처 (TO-BE) 한눈에

```
                    ┌─────────────────────────────────────────────┐
  Next.js (그대로)  │  FastAPI (LangServe)  ── /agent/invoke ──┐   │
   프론트/지도 UI ──┼─► POST {intent_hint, slots, user_history}│   │
                    │                                          ▼   │
                    │              ┌──────── LangGraph ────────┐   │
                    │              │ router→retrieve→realtime→ │   │
                    │              │ compose→validate→respond  │   │
                    │              └──────────┬────────────────┘   │
                    │   ┌─────────────────────┼──────────────────┐ │
                    │   ▼            ▼         ▼          ▼        ▼ │
                    │ Qdrant     vLLM LLM   vLLM 임베딩  서울API  OSRM/
                    │ (벡터DB)  (생성/툴콜) (검색용)    (실시간)  Tmap
                    └─────────────────────────────────────────────┘
                          ▲
                          │ (배치) 인제스트 파이프라인: 수집→정제→청킹→임베딩→upsert
```

- **프론트는 거의 안 바뀐다.** 현재 `/api/ai-info`, `/api/ai-recommend`가 호출하던 자리를 FastAPI 엔드포인트로 바꾸거나, Next.js 라우트를 얇은 프록시로 남긴다. 응답 JSON 스키마(AIPlaceInfo, Suggestion[])를 **그대로 유지**해야 UI 재작업이 0이다.

---

## 2. 구성 요소별 기술 선택

### 2.1 vLLM (LLM 서빙)
- **모델 후보**: `Qwen2.5-7B-Instruct` (한국어·JSON·tool-calling 균형 좋음, 1차 추천) → 품질 부족 시 `Qwen2.5-14B/32B-Instruct` 또는 `EXAONE-3.5` 계열(한국어 특화). 32B 이상은 비용 대비 검토.
- **서빙 모드**: vLLM `--served-model-name`으로 **OpenAI 호환 엔드포인트**(`/v1/chat/completions`) 노출. LangChain `ChatOpenAI(base_url=...)`로 그대로 연결.
- **구조화 출력**: vLLM의 **guided decoding**(`guided_json` / outlines 백엔드)으로 JSON 스키마 강제. → 현재 Gemini `responseSchema`와 동일 효과. `extractJsonObjectText` 같은 후처리 방어 코드 불필요해짐(단, 안전망으로 일부 유지).
- **Tool calling**: vLLM `--enable-auto-tool-choice --tool-call-parser hermes`(Qwen 계열) 설정 → LangGraph `bind_tools` 사용 가능.
- **성능 옵션**: `--max-model-len`, `--gpu-memory-utilization`, prefix caching(시스템 프롬프트·장소 컨텍스트 캐시), 양자화(AWQ/GPTQ)로 GPU 메모리 절약.

### 2.2 임베딩 모델
- **후보**: `BAAI/bge-m3` (다국어·한국어 강함, 1024차원, 1차 추천) 또는 `nlpai-lab/KURE-v1`/`KoE5`(한국어 특화). 
- **서빙**: vLLM도 `--task embed`로 임베딩 서빙 가능 → LLM과 별도 vLLM 인스턴스로 임베딩 전용 띄움. (또는 TEI = Text Embeddings Inference) 
- **중요**: 인제스트 때와 쿼리 때 **동일 임베딩 모델·버전** 사용. 모델 교체 시 전체 재임베딩.

### 2.3 벡터 DB
- **후보**: **Qdrant** (1차 추천 — 메타데이터 필터링 강력, 셀프호스팅 쉬움, 하이브리드 검색 지원). 대안: pgvector(이미 Postgres 쓰면), Milvus(대규모).
- **필요 기능**: 메타데이터 필터(category/region/좌표 bbox), 하이브리드(dense+sparse BM25) 검색, payload 저장.
- 현 데이터 규모(장소 71·코스 15)는 작지만, **컨텐츠를 청킹하면 수천 청크**가 되고 최신글 계속 추가되므로 벡터DB가 정당화됨.

### 2.4 오케스트레이션
- **LangGraph** `StateGraph` (ReAct 단일 루프보다 **명시적 노드 그래프** 선호 — 의도가 3개로 뚜렷하고, 검증/폴백 흐름을 제어해야 함).
- **LangChain**: LLM/임베딩/리트리버/툴 추상화. **LangServe + FastAPI**로 배포, **LangSmith**(또는 Langfuse 셀프호스팅)로 트레이싱.

---

## 3. 벡터DB 컨텐츠 — 무엇을, 어떻게 청킹·임베딩할까

### 3.1 무엇을 넣나 (소스)
1. **장소 서사 컨텐츠** — 현 71개 place를 확장: 역사/유래, 분위기 묘사, 추천 경험, 포토스팟, 로컬 꿀팁, 베스트 타임, 계절감. (현재는 1줄 description뿐 → 장소당 문단 단위로 작성/수집)
2. **테마코스/동선 노하우** — 15개 코스의 의미적 연결(왜 이 순서인지, 감정선, 드라마/사건 연관). agent-plan의 "의미적 동선" 핵심 자산.
3. **최신 큐레이션 글** — 블로그/매거진/공식 관광 컨텐츠(저작권 확인된 것), 계절 이벤트 회고 등. **"최신 정보 반영"의 주 출처.**
4. (선택) **문화행사 정적 설명** — 상설 전시·시설 소개처럼 자주 안 변하는 것만. 날짜·혼잡도 같은 동적 값은 제외.

### 3.2 청킹 전략
- **장소/코스 컨텐츠**: 문서가 짧고 구조적 → **섹션(헤더) 기준 청킹** + 장소를 원자 단위로. 한 청크 ≈ 1개 장소의 1개 측면(예: "경복궁-역사", "경복궁-포토스팟"). 길면 300~500 토큰, 100 토큰 오버랩.
- **긴 매거진 글**: `RecursiveCharacterTextSplitter`(토큰 기반) 또는 의미 기반 청킹. 512 토큰/64 오버랩 기본값에서 평가로 튜닝.
- **핵심**: 청크마다 **풍부한 메타데이터**를 붙여 필터링·grounding에 사용.

### 3.3 청크 메타데이터 스키마 (Qdrant payload)
```jsonc
{
  "chunk_id": "gyeongbokgung::history::0",
  "place_id": "gyeongbokgung",
  "display_name": "경복궁",
  "area_name": "광화문·덕수궁",          // 서울 실시간 API 매칭 키 (citydata_ppltn)
  "category": "역사/궁궐",
  "region": "강북",                      // 현 getRegion() 로직과 일치시킴
  "lat": 37.579, "lng": 126.977,
  "aspect": "history",                   // summary|history|photo|tip|access|course
  "source": "official|magazine|curated",
  "source_url": "...",
  "valid_until": "2026-12-31",           // 시즌성 컨텐츠 만료
  "updated_at": "2026-06-30",
  "text": "원문 청크"
}
```
- `area_name`이 **결정적**: 검색된 장소를 곧장 서울 실시간 API(혼잡도)와 이름 매칭하는 다리. 현재 `fetchCongestionMessage`의 매칭 로직을 메타데이터로 흡수.
- `region`/`lat`/`lng`: 권역·반경 필터를 **벡터 검색 단계에서** 적용 → 현재 `matchesRegion`/`findNearbyPlaces` JS 로직을 DB 필터로 이전.

### 3.4 인제스트 파이프라인 (배치, 별도 스크립트/잡)
```
수집(크롤/수기/CMS) → 정제(HTML 제거·중복제거·PII 점검) → 청킹
→ 메타데이터 부착 → 임베딩(bge-m3) → Qdrant upsert(멱등: chunk_id 기준)
```
- **증분 갱신**: `updated_at`/해시 비교로 변경분만 재임베딩. `valid_until` 지난 청크 정리(시즌 행사).
- 운영: cron/배치(주1회 + 수동 트리거). 데이터 늘면 Airflow/Prefect 검토.
- **평가셋**: 인제스트와 함께 (질문→정답 장소/청크) 골든셋 20~50개 구축 → retrieval recall, 답변 grounding 회귀 테스트.

---

## 4. LangGraph 설계 — 그래프·상태·노드

### 4.1 그래프 상태 (`AgentState`)
```python
class AgentState(TypedDict):
    # 입력
    raw_query: str                 # 자유서술 (CourseCollection의 note)
    slots: dict                    # 칩 입력: companion/ageGroup/time/purpose/region/congestion
    user_history: list[str]        # localStorage visitedPlaceIds[] (익명, agent-plan 결정)
    intent: Literal["place_intro","travel_package","personalized_rec","chitchat"]
    # 중간 산출
    retrieved: list[Document]      # RAG 결과 (청크 + 메타)
    candidate_places: list[dict]   # 권역/혼잡 필터 통과 후보
    realtime: dict                 # {congestion: {...}, events: [...]}
    routes: list[dict]             # OSRM walk 폴리라인 (travel_package 전용)
    draft: dict                    # LLM 생성 JSON
    # 출력/제어
    result: dict                   # 프론트 호환 최종 JSON
    errors: list[str]
    source: Literal["ai","mock"]
```

### 4.2 노드(흐름)
```
        ┌─────────┐
        │ router  │  (의도 분류 + 슬롯 정규화)
        └────┬────┘
   place_intro │ personalized_rec │ travel_package
        ▼            ▼                  ▼
   ┌──────────────────────────────────────────┐
   │ retrieve (RAG, 메타필터 적용)              │
   └────┬─────────────────────────────────────┘
        ▼
   ┌──────────────────────────────────────────┐
   │ realtime_fetch (병렬: 혼잡도 + 행사)        │   ← travel_package면 + route_fetch
   └────┬─────────────────────────────────────┘
        ▼
   ┌──────────────────────────────────────────┐
   │ compose (의도별 프롬프트 + guided_json)     │
   └────┬─────────────────────────────────────┘
        ▼
   ┌──────────────────────────────────────────┐
   │ validate (스키마·화이트리스트·grounding)    │ ──fail──► repair(1회 재시도) ──fail──► fallback(mock)
   └────┬─────────────────────────────────────┘
        ▼  respond (프론트 호환 JSON)
```

- **router**: LLM 분류(또는 슬롯 존재 여부로 룰 기반 빠른 분기). 현재는 엔드포인트가 의도를 결정했지만, 통합 에이전트에선 `raw_query`+`slots`로 분기.
- **retrieve**: 의도별 검색 전략. place_intro=특정 place_id 청크 모음, personalized_rec=권역/목적 필터 + 다양성(MMR), travel_package=의미적 연결 청크 검색. **하이브리드(dense+BM25) + 메타필터**.
- **realtime_fetch**: 검색된 후보의 `area_name`으로 `citydata_ppltn` 병렬 호출(현 `Promise.allSettled` 패턴 = `asyncio.gather`), `culturalEventInfo` 호출. 타임아웃·캐시(5분 TTL) 현 로직 이식. **여기 결과는 임베딩 안 하고 프롬프트에 직접 주입.**
- **compose**: 의도별 시스템 프롬프트 + (RAG 컨텍스트 + 실시간 컨텍스트) → vLLM guided_json. 현재 `buildPrompt`들의 톤/규칙/출력스키마를 거의 그대로 이식(프론트 호환).
- **validate**: 
  - 스키마: guided decoding이 보장하지만 2차 확인.
  - 화이트리스트: 현 ai-recommend의 "응답 place가 후보 목록에 있나" 검증을 노드화.
  - **grounding 체크**(신규): 생성 문장이 retrieved 청크에 근거하는가(간이 NLI 또는 키워드/소스 attribution). RAG의 핵심 가치.
- **fallback**: 현 `MOCK_FALLBACK` 그대로 — 모델·검색 실패 시 안전 응답.

### 4.3 도구(Tools) — LangGraph 노드 또는 LLM bind_tools
| 도구 | 입력 | 출력 | 현재 대응 |
|---|---|---|---|
| `search_places` | query, filters(region/category/bbox), k | 청크+메타 | (신규) RAG 리트리버 |
| `get_congestion` | area_name[] | 레벨/메시지 | `fetchCongestion*` |
| `get_events` | lat,lng,radius | 행사[] | `fetchSeoulEvents`/`fetchRealEvents` |
| `get_walking_route` | stops[] | 폴리라인/거리/시간 | `/api/transit/walk` (OSRM) |
| `get_nearby_places` | lat,lng,k | 장소명[] | `findNearbyPlaces` (→ 벡터 bbox 필터로 대체 가능) |

- place_intro·personalized_rec는 **그래프가 도구 순서를 고정**(retrieve→realtime→compose)하는 게 안정적.
- travel_package(의미적 동선)만 **에이전트 자율 tool-calling** 여지 — 후보를 늘렸다 줄이고 경로를 짜는 멀티스텝이라 ReAct 루프가 어울림. 단, 무한루프 방지 위해 max step 제한.

---

## 5. 서빙·배포

- **FastAPI + LangServe**: `/agent/place_intro`, `/agent/recommend`, `/agent/course` (또는 단일 `/agent/invoke` + intent). 스트리밍 필요하면 SSE.
- **vLLM 인스턴스 2개**: ① LLM 생성(tool-call/guided-json), ② 임베딩(bge-m3). GPU 분리 또는 같은 GPU 멀티프로세스.
- **컨테이너**: docker-compose(개발) → k8s(운영). 구성: `fastapi-agent`, `vllm-llm`, `vllm-embed`(or TEI), `qdrant`, (선택)`langfuse`+`postgres`+`redis`(캐시·레이트리밋).
- **레이트리밋**: 현재 `ai-usage.json`(서버리스에서 휘발, 미동작)을 **Redis 카운터**로 교체 — agent-plan의 남은 과제 ④ 해결.
- **하드웨어 가늠**: 7B(AWQ 4bit) ≈ 단일 24GB GPU(L4/4090급)에서 LLM+임베딩 동시 가능. 14B↑면 A100 40GB 또는 다중 GPU. → 실 트래픽 측정 후 결정.

---

## 6. 관측·평가·안전

- **트레이싱**: LangSmith 또는 Langfuse(셀프호스팅) — 노드별 지연, 토큰, 검색 품질, 실패율.
- **평가(오프라인)**: retrieval(recall@k, MRR) + 생성(grounding/faithfulness, 화이트리스트 위반율, JSON 유효율). RAGAS류 또는 자체 골든셋.
- **안전망**: grounding 실패·환각 시 fallback. 컨텐츠 저작권/출처 명시(`source_url`). PII 없음(익명 이력만).
- **A/B 비교 기준**: 현 Gemini 응답 대비 (지연, 품질, 비용). 자체호스팅이 Gemini 대비 품질·지연·비용에서 이겨야 전환 정당화.

---

## 7. 단계별 로드맵

1. **PoC**: vLLM(Qwen 7B) + Qdrant 띄우고, **장소소개(place_intro) 1개 의도만** RAG로 재현. 현 `/api/ai-info` 응답과 품질·지연 비교.
2. **인제스트 확립**: 71개 장소 컨텐츠 확장·청킹·메타데이터 + 골든셋 + 증분 갱신 잡.
3. **그래프 완성**: router + 3개 의도 + validate/fallback. FastAPI/LangServe 배포, Redis 레이트리밋.
4. **travel_package 고도화**: 의미적 동선 tool-calling + OSRM 경로. (agent-plan의 진짜 핵심 자산)
5. **운영화**: 관측/평가 대시보드, k8s, 비용·품질 회귀 게이트.

---

## 8. 열린 질문 (진행 전 결정 필요)
- 컨텐츠 저작권: 매거진/블로그 임베딩 가능 범위? (자체 작성 vs 라이선스 vs 공공데이터만)
- GPU 예산/조달: 클라우드 vLLM(서버리스 GPU) vs 자체 호스팅.
- 한국어 모델 최종 선택: Qwen 계열 vs EXAONE vs 기타 — 골든셋으로 블라인드 평가.
- 통합 vs 분리: 단일 `/agent/invoke`(LangGraph 라우팅) vs 의도별 엔드포인트 유지.
- 프론트 계약: 응답 스키마 100% 동결(현 AIPlaceInfo/Suggestion[]) 가정이 맞는지.
```
