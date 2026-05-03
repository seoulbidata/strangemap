export interface CourseStop {
  name: string;
  lat: number;
  lng: number;
  description: string;
  duration: string;
}

export interface ThemeCourse {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  totalDuration: string;
  distance: string;
  difficulty: "쉬움" | "보통" | "어려움";
  tags: string[];
  color: string;
  stops: CourseStop[];
}

export const THEME_COURSES: ThemeCourse[] = [
  {
    id: "palace-trail",
    title: "조선 왕궁 순례",
    subtitle: "600년 역사를 두 발로 걷다",
    description: "한양의 다섯 궁궐 중 세 곳을 연결하는 역사 탐방 코스. 궁궐과 종묘를 이어 조선 왕실의 흔적을 따라갑니다.",
    totalDuration: "약 3시간",
    distance: "4.2km",
    difficulty: "쉬움",
    tags: ["역사", "궁궐", "세계유산", "도보"],
    color: "#92400E",
    stops: [
      { name: "경복궁", lat: 37.5796, lng: 126.9770, description: "조선 왕조의 정궁. 근정전과 경회루가 핵심.", duration: "60분" },
      { name: "창덕궁", lat: 37.5797, lng: 126.9910, description: "자연과 조화를 이룬 유네스코 세계유산. 후원 필수.", duration: "60분" },
      { name: "창경궁", lat: 37.5793, lng: 126.9952, description: "조선 왕실 여인들의 궁. 봄 매화로 유명.", duration: "40분" },
      { name: "종묘", lat: 37.5752, lng: 126.9942, description: "조선 역대 왕과 왕비의 신위를 모신 사당.", duration: "40분" },
    ],
  },
  {
    id: "hangang-night",
    title: "한강 야경 루트",
    subtitle: "서울의 밤을 물 위에서",
    description: "여의도에서 뚝섬까지 한강을 따라 이어지는 야경 명소 코스. 각 공원마다 전혀 다른 분위기를 경험합니다.",
    totalDuration: "약 2시간 30분",
    distance: "12km (자전거 권장)",
    difficulty: "보통",
    tags: ["야경", "한강", "자전거", "저녁"],
    color: "#1D4ED8",
    stops: [
      { name: "여의도한강공원", lat: 37.5283, lng: 126.9336, description: "벚꽃과 넓은 잔디. 서울 도심 스카이라인이 보임.", duration: "40분" },
      { name: "반포한강공원", lat: 37.5102, lng: 126.9995, description: "달빛무지개분수와 세빛섬 야경이 하이라이트.", duration: "50분" },
      { name: "뚝섬한강공원", lat: 37.5296, lng: 127.0686, description: "성수동과 인접. 카페와 공원을 함께 즐길 수 있음.", duration: "40분" },
    ],
  },
  {
    id: "seongsu-vibe",
    title: "성수 감성 투어",
    subtitle: "서울의 힙한 동쪽을 탐험하다",
    description: "서울숲부터 성수동 카페거리까지. 공장을 개조한 카페와 독립 브랜드 쇼룸이 가득한 성수동 완전 정복.",
    totalDuration: "약 3시간",
    distance: "3.5km",
    difficulty: "쉬움",
    tags: ["감성", "카페", "브런치", "사진"],
    color: "#065F46",
    stops: [
      { name: "서울숲", lat: 37.5444, lng: 127.0374, description: "도심 속 숲. 사슴 방사장과 곤충식물원이 있음.", duration: "50분" },
      { name: "성수동 카페거리", lat: 37.5444, lng: 127.0564, description: "공장 개조 카페들이 밀집. 독립 브랜드 쇼룸 다수.", duration: "80분" },
      { name: "뚝섬유원지", lat: 37.5301, lng: 127.0673, description: "한강변 마무리. 노을 감상 최적 포인트.", duration: "30분" },
    ],
  },
  {
    id: "bukchon-walk",
    title: "북촌 한옥마을 탐방",
    subtitle: "서울 도심 속 조선의 골목",
    description: "경복궁에서 시작해 북촌 골목을 지나 인사동까지. 한옥과 현대 갤러리, 전통 찻집이 공존하는 코스.",
    totalDuration: "약 2시간 30분",
    distance: "3.8km",
    difficulty: "보통",
    tags: ["한옥", "문화", "사진", "전통"],
    color: "#7C3AED",
    stops: [
      { name: "경복궁", lat: 37.5796, lng: 126.9770, description: "코스 시작점. 수문장 교대식을 먼저 확인하세요.", duration: "30분" },
      { name: "북촌한옥마을", lat: 37.5822, lng: 126.9853, description: "가회동 31번지 뷰포인트에서 사진 필수.", duration: "60분" },
      { name: "인사동", lat: 37.5744, lng: 126.9855, description: "전통 공예품과 갤러리. 쌈지길 볼거리 풍성.", duration: "50분" },
      { name: "광화문광장", lat: 37.5720, lng: 126.9769, description: "세종대왕 동상과 함께 코스 마무리.", duration: "20분" },
    ],
  },
  {
    id: "namsan-downtown",
    title: "남산 & 도심 탐험",
    subtitle: "서울 한복판을 위에서 아래로",
    description: "남산타워에서 내려다본 서울, 명동 거리, 청계천 수변을 이어 도심의 층위를 경험하는 입체적 코스.",
    totalDuration: "약 3시간 30분",
    distance: "5.5km",
    difficulty: "보통",
    tags: ["전망", "야경", "쇼핑", "도심"],
    color: "#DC2626",
    stops: [
      { name: "남산서울타워", lat: 37.5512, lng: 126.9882, description: "서울 360도 전망. 일몰 30분 전 입장 추천.", duration: "60분" },
      { name: "명동", lat: 37.5635, lng: 126.9858, description: "먹거리와 쇼핑의 중심지. 야시장 분위기 활기참.", duration: "60분" },
      { name: "청계천", lat: 37.5697, lng: 126.9786, description: "도심을 흐르는 물길 산책. 광통교 근처 포토스팟.", duration: "40분" },
      { name: "광화문", lat: 37.5760, lng: 126.9769, description: "경복궁 정문. 수문장 교대식 시간 확인 필수.", duration: "30분" },
    ],
  },
];
