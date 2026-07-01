# 코스 히어로 이미지

코스 id와 동일한 파일명으로 이미지를 저장하면 자동으로 각 코스에 적용됩니다.

## 파일 목록 (코스 id 기준)

| 파일명 | 코스 제목 | 카테고리 |
|--------|-----------|----------|
| `palace-trail.jpg` | 조선 왕궁 순례 | 역사 |
| `jeongjo-procession.jpg` | 정조대왕 행행길 | 역사 |
| `hanyang-fortress.jpg` | 한양도성 낙산구간 | 역사 |
| `hangang-night.jpg` | 한강 야경 루트 | 야경/자연 |
| `namsan-downtown.jpg` | 남산 & 도심 탐험 | 야경/자연 |
| `kpop-demon-hunters.jpg` | 케이팝 데몬 헌터스 성지순례 | 서울배경 컨텐츠 |
| `omniscient-reader.jpg` | 전지적 독자 시점 멸살법 루트 | 서울배경 컨텐츠 |
| `itaewon-class.jpg` | 이태원 클라쓰 박새로이의 길 | 서울배경 컨텐츠 |
| `moving-bongseok-flight.jpg` | 무빙: 봉석이의 남산 비행 일지 | 서울배경 컨텐츠 |
| `seongsu-vibe.jpg` | 성수 감성 투어 | Hot플레이스 |
| `seoul-market-food.jpg` | 서울의 맛, 4대 전통시장 미식 투어 | Hot플레이스 |
| `jensen-huang-seoul-2026.jpg` | 젠슨 황의 서울 방한 | Hot플레이스 |
| `mz-gacha-tour.jpg` | MZ 가챠샵 완전 정복 | Hot플레이스 |
| `bukchon-walk.jpg` | 북촌 한옥마을 탐방 | 문화 |

## 우선순위

1. `ThemeCourse.image` 필드 (개별 지정, 외부 URL 포함)
2. 이 폴더의 `<course-id>.jpg` (자동 매핑)
3. `public/courses/<category>.jpg` (카테고리 기본 이미지)
4. 테마 그라데이션 폴백

## 이미지 규격

- 권장 크기: 1200×630px 이상 (16:9 또는 2:1 비율)
- 포맷: jpg (용량 최적화), 1MB 이하 권장
