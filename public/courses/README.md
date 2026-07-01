# 코스 히어로 이미지

테마(카테고리)별로 이미지를 **하나씩** 이 폴더에 넣으면 코스 카드·디테일 패널 히어로에 자동 반영됩니다.
파일이 없으면 테마 색 그라데이션이 대신 보입니다.

## 파일명 (테마 → 파일)

| 카테고리 | 파일 경로 |
|---|---|
| 역사 | `public/courses/history.jpg` |
| 야경/자연 | `public/courses/nightview.jpg` |
| 서울배경 컨텐츠 | `public/courses/drama.jpg` |
| Hot플레이스 | `public/courses/hotplace.jpg` |
| 문화 | `public/courses/culture.jpg` |

- 권장 비율: 가로형(예: 1200×800), object-fit: cover 로 잘립니다.
- 매핑은 `src/lib/courseImage.ts`의 `CATEGORY_IMAGE`에서 관리합니다.

## 코스별 개별 이미지

특정 코스에만 다른 사진을 쓰려면 `src/data/themeCourses.ts`의 해당 코스에
`image: "/courses/내파일.jpg"` 를 추가하세요. (카테고리 기본보다 우선합니다.)
