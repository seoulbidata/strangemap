/**
 * 정적 큐레이션 코스 영문 콘텐츠 — themeCoursesData.ts와 병렬 파일.
 *
 * themeCoursesData.ts는 /dev/route-editor가 저장 시 통째로 재직렬화하므로
 * 인라인 En 필드는 유실된다. 그래서 영문 텍스트는 이 파일에 코스 id 키로 분리 보관한다.
 * 스탑은 index로 매칭하며 `name`(한글 원문)을 앵커로 desync를 감지한다.
 *
 * 생성: scripts/generate-course-en.mts (Gemini 일괄 번역) → 사람 검수 후 커밋.
 * 에디터에서 코스/스탑을 수정하면 스크립트를 다시 실행해 동기화할 것.
 */

export interface CourseStopEn {
  /** 한글 원문 name — index 매칭 검증용 앵커 */
  name: string;
  nameEn: string;
  preview: string;
  description: string;
  duration: string;
  tip?: string;
}

export interface CourseEn {
  title: string;
  subtitle: string;
  description: string;
  totalDuration: string;
  distance: string;
  estimatedCost: string;
  bestTime: string;
  tags: string[];
  stops: CourseStopEn[];
}

export const THEME_COURSES_EN: Record<string, CourseEn> = {
  "palace-trail": {
    "title": "Joseon Royal Palace Pilgrimage",
    "subtitle": "Walking through 600 years of history",
    "description": "A historical exploration course connecting three of Hanyang's five palaces. Follow the traces of the Joseon royal family as you wander from the palaces to Jongmyo Shrine.",
    "totalDuration": "About 3 hours",
    "distance": "4.2km",
    "estimatedCost": "Free ~ ₩10,000",
    "bestTime": "10:00 AM – 3:00 PM",
    "tags": [
      "History",
      "Palace",
      "World Heritage",
      "Walking"
    ],
    "stops": [
      {
        "name": "경복궁",
        "nameEn": "Gyeongbokgung Palace",
        "preview": "Gyeongbokgung Palace, the legal residence of Joseon kings",
        "description": "Standing in front of the Gyeonghoeru Pavilion pond, you can really feel as if you've stepped back 500 years to the very place where kings once held banquets for their subjects. The imposing presence of Geunjeongjeon Hall captures the true weight of royal authority in a way no other palace can.",
        "duration": "1 hour",
        "tip": "The Royal Guard changing ceremony takes place at 10:00 AM and 2:00 PM."
      },
      {
        "name": "창덕궁",
        "nameEn": "Changdeokgung Palace",
        "preview": "UNESCO World Heritage site with a secret garden",
        "description": "As you head deeper into the Huwon Secret Garden, you'll feel the unique sensation of being in a forest that was once reserved solely for the king. It is truly surprising to find such peace and nature right in the heart of Seoul.",
        "duration": "1 hour",
        "tip": "Admission to the Secret Garden requires a separate reservation. I recommend booking at least one week in advance."
      },
      {
        "name": "창경궁",
        "nameEn": "Changgyeonggung Palace",
        "preview": "A quiet garden palace once frequented by royal women",
        "description": "Walking through this garden, where royal women once sought comfort among the flowers, you begin to catch glimpses of their daily lives from the past. It's a place where the quiet beauty lingers in your memory longer than any grand display.",
        "duration": "40 min",
        "tip": "You can use your Changdeokgung Palace admission ticket to visit this site as well."
      },
      {
        "name": "종묘",
        "nameEn": "Jongmyo Shrine",
        "preview": "The world's longest single wooden structure housing royal ancestral tablets",
        "description": "Standing before the world's longest single wooden structure, a sense of reverence naturally washes over you. The thought that every king of Joseon was once honored here by name provides an experience that feels truly timeless.",
        "duration": "40 min",
        "tip": "Individual exploration is allowed on Saturdays, but weekday visits are only possible via guided tours."
      }
    ]
  },
  "jeongjo-procession": {
    "title": "King Jeongjo's Royal Procession Route",
    "subtitle": "The road the King walked for his mother",
    "description": "In 1795, King Jeongjo set out on an eight-day journey to visit his father's royal tomb to mark his mother Lady Hyegyeong's 60th birthday. Follow the first day of this historic route through Seoul. It is the very same course that the Seoul Metropolitan Government recreates every autumn with a procession of 1,500 people, honoring the King's deep affection for his people.",
    "totalDuration": "About 4 hours 30 min",
    "distance": "8.1km (walk + transit recommended)",
    "estimatedCost": "Free ~ ₩10,000",
    "bestTime": "Late September ~ Early October (Procession recreation season)",
    "tags": [
      "King Jeongjo",
      "Royal Tomb Procession",
      "Royal Journey",
      "Historic Trail",
      "Royal Procession"
    ],
    "stops": [
      {
        "name": "경복궁 광화문",
        "nameEn": "Gwanghwamun Gate, Gyeongbokgung",
        "preview": "Starting point of the annual procession and departure ritual",
        "description": "The starting point for the royal departure ceremony. On the last Sunday of September at 8:00 AM, a citizen dressed as King Jeongjo performs the departure ritual right here at Gwanghwamun Gate, Gyeongbokgung.",
        "duration": "40 min",
        "tip": "Visit on the day of the procession recreation to see the full 1,500-person parade. On regular days, the Royal Guard Changing Ceremony is a must-see."
      },
      {
        "name": "광화문광장",
        "nameEn": "Gwanghwamun Square",
        "preview": "Statues of King Sejong and Admiral Yi Sun-sin, a hub for the traditional parade",
        "description": "The starting point where both the traditional and citizen parades begin. The statues of King Sejong and Admiral Yi Sun-sin stand facing the path that King Jeongjo once traveled.",
        "duration": "30 min",
        "tip": "The 'Story of Sejong' and 'Story of Admiral Yi Sun-sin' exhibitions in the square's underground area are free. Fun fact: King Sejong was King Jeongjo's 5th-generation ancestor."
      },
      {
        "name": "숭례문 (남대문)",
        "nameEn": "Sungnyemun Gate (Namdaemun)",
        "preview": "The southern gate of the fortress city where the royal party exited Hanyang",
        "description": "The gateway through which King Jeongjo's party departed Hanyang. As the main southern gate of the city, the procession passed through Sungnyemun Gate (Namdaemun) on its way to the Han River.",
        "duration": "20 min",
        "tip": "It's a 25-minute walk from Gwanghwamun, or you can take the subway from City Hall Station (Line 1)."
      },
      {
        "name": "노들섬",
        "nameEn": "Nodeul Island",
        "preview": "The Han River base for the pontoon bridge and Chwita band performances",
        "description": "The site where King Jeongjo installed a temporary 'pontoon bridge' (Jugyo) to cross the Han River. It serves as a key hub for the reenactment, hosting children's marching band performances and historical concerts.",
        "duration": "60 min",
        "tip": "Nodeul Island has a lovely music library and cafes perfect for a break. The view of the Han River here is truly spectacular."
      },
      {
        "name": "용양봉저정",
        "nameEn": "Yongyangbongjeojeong Pavilion",
        "preview": "A Joseon-era pavilion where the King rested and ate lunch after crossing the river",
        "description": "A pavilion where King Jeongjo took a break for lunch after crossing the Han River. Its name means 'a pavilion where dragons leap and phoenixes rest.' It still stands on the hills of Noryangjin today.",
        "duration": "30 min",
        "tip": "A 10-minute walk from Nodeul Station (Line 9) or Noryangjin Station (Line 1). It is a hidden, peaceful historical site."
      },
      {
        "name": "시흥행궁터",
        "nameEn": "Siheung Haenggung Site",
        "preview": "The final stop of the first day, home to a marker for the temporary palace",
        "description": "The final destination of the first day's journey. This was the temporary palace where King Jeongjo stayed the night to attend to state affairs. You can still find a marker near the Siheung 5-dong Community Service Center.",
        "duration": "30 min",
        "tip": "Accessible by walking from Geumcheon-gu Office Station (Line 1). It is usually quiet, but hosting a welcoming event on the day of the royal procession recreation."
      }
    ]
  },
  "hanyang-fortress": {
    "title": "Hanyangdoseong Naksan Section",
    "subtitle": "Walking through the Montmartre of Seoul",
    "description": "A city trail that traces 600 years of Joseon Dynasty history along the fortress wall. Walk from Heunginjimun Gate to Hyehwamun Gate while comparing the two sides of Seoul from inside and outside the walls. It is a famous spot for night views and is well-known as the filming location for K-Pop Demon Hunters.",
    "totalDuration": "About 2 hours",
    "distance": "2.1km",
    "estimatedCost": "Free",
    "bestTime": "Sunset 5:00 PM – 8:00 PM (To enjoy both the sunset and the night view)",
    "tags": [
      "Hanyangdoseong",
      "Fortress Wall Trail",
      "Night View",
      "Walking",
      "Naksan"
    ],
    "stops": [
      {
        "name": "흥인지문 (동대문)",
        "nameEn": "Heunginjimun Gate (Dongdaemun)",
        "preview": "Eastern gate of the fortress, the only one with a defensive wall",
        "description": "The main eastern gate among the four great gates of Hanyangdoseong. Designated as Treasure No. 1, it features a unique defensive wall structure and serves as the starting point for this course.",
        "duration": "20 min",
        "tip": "It is right outside Exit 6 of Dongdaemun Station (Line 1). It looks best after sunset when the night lights turn on."
      },
      {
        "name": "한양도성박물관",
        "nameEn": "Seoul City Wall Museum",
        "preview": "Free exhibition on 600 years of history, rooftop observatory",
        "description": "A free museum showcasing the history of the fortress wall's construction. It is the perfect place to gain some background knowledge before walking the wall itself.",
        "duration": "30 min",
        "tip": "Closed on Mondays. You can see Heunginjimun Gate and the fortress at a glance from the rooftop observatory."
      },
      {
        "name": "이화벽화마을",
        "nameEn": "Ihwa Mural Village",
        "preview": "Artistic mural alleys, filming site for 'Architecture 101'",
        "description": "A village created by artists painting the narrow alleys at the foot of Naksan. It is also famous as a filming location for the movie 'Architecture 101'.",
        "duration": "30 min",
        "tip": "This is a residential area, so please keep quiet to respect the privacy of the locals. Some murals have been removed at the request of residents."
      },
      {
        "name": "낙산공원",
        "nameEn": "Naksan Park",
        "preview": "Fortress trail overlooking the city, K-Pop Demon Hunters filming site",
        "description": "A popular lookout spot often called the 'Montmartre of Seoul'. This is the very section of the wall where Lumi and Jin-woo from K-Pop Demon Hunters connected while watching the night view.",
        "duration": "40 min",
        "tip": "The night view of downtown Seoul from the top of the park is the highlight. If you are a K-Pop Demon Hunters fan, try to find the exact angle from the show."
      },
      {
        "name": "혜화문",
        "nameEn": "Hyehwamun Gate",
        "preview": "Northeast side gate, trail endpoint restored in 1992",
        "description": "The northeastern gate among the four small gates of Hanyangdoseong. It was demolished during the Japanese colonial period and restored in 1992, marking the end of the trail.",
        "duration": "20 min",
        "tip": "You can exit through Exit 4 of Hansung University Station (Line 4). It's also a great spot for a final night view."
      }
    ]
  },
  "hangang-night": {
    "title": "Hangang Night View Route",
    "subtitle": "Seoul’s night scenery from the water",
    "description": "A course that takes you through the best night view spots along the Han River, from Yeouido to Ttukseom. You will experience a completely different vibe at each park.",
    "totalDuration": "About 2 hours 30 min",
    "distance": "6km",
    "estimatedCost": "Free (Seoul Bike 'Ddareungi' costs 1,000 KRW/hour)",
    "bestTime": "7 PM – 10 PM, after sunset",
    "tags": [
      "Night view",
      "Hangang River",
      "Cycling",
      "Evening"
    ],
    "stops": [
      {
        "name": "여의도한강공원",
        "nameEn": "Yeouido Hangang Park",
        "preview": "The premier spot for city skyline reflections",
        "description": "You have to see the sight of city lights dancing on the surface of the Han River with your own eyes, as it’s far better than any photo. This is the first moment you’ll find yourself thinking, 'I never realized this city I live in was so beautiful.'",
        "duration": "40 min",
        "tip": "It's convenient to reserve a bike in advance using the Ddareungi app."
      },
      {
        "name": "이촌한강공원",
        "nameEn": "Ichon Hangang Park",
        "preview": "A quiet hideout for relaxing by the water",
        "description": "Instead of the crowded vibes of Yeouido or Banpo, this place welcomes you with calm river waters and serene poplar-lined paths. Watching the orange sunset near the Turtle Ship ferry dock while trains cross the Han River Railway Bridge offers one of the most peaceful moments in Seoul.",
        "duration": "50 min",
        "tip": "If your goal is sunset and photography, it's best to plan your route toward the north end of the Han River Railway Bridge or the Turtle Ship ferry dock."
      },
      {
        "name": "잠수교",
        "nameEn": "Jamsu Bridge",
        "preview": "A bridge offering views of Moonlight Rainbow Fountain and Namsan Tower",
        "description": "Located right under Banpo Bridge, this path lets you feel the cool river breeze and fully enjoy the iconic Seoul nightscape as close to the water as possible. The fountain show pouring down above you mixed with the distant glow of Namsan Tower makes every photo you take an instant masterpiece.",
        "duration": "40 min",
        "tip": "Be sure to check the operating hours of the Moonlight Rainbow Fountain before you visit."
      }
    ]
  },
  "namsan-downtown": {
    "title": "Namsan & Downtown Exploration",
    "subtitle": "Seoul’s heart, from top to bottom",
    "description": "An immersive journey through Seoul's urban layers, connecting the panoramic views of Namsan Seoul Tower, the bustling streets of Myeongdong, and the tranquil Cheonggyecheon Stream.",
    "totalDuration": "About 3 hours and 30 minutes",
    "distance": "5.5km",
    "estimatedCost": "10,000 ~ 20,000 KRW (including N Seoul Tower observatory)",
    "bestTime": "5:00 PM ~ 9:00 PM (Sunset & Night View)",
    "tags": [
      "Panoramic View",
      "Night View",
      "Shopping",
      "City Center"
    ],
    "stops": [
      {
        "name": "남산서울타워",
        "nameEn": "Namsan Seoul Tower",
        "preview": "360-degree city views and the golden hour",
        "description": "Looking out at the 360-degree panorama, you really feel how much life is flowing through this city. Seeing the lights of the city flicker on just after sunset is the highlight of this entire course.",
        "duration": "60 min",
        "tip": "The Namsan Sunhwan Bus No. 02 has shorter wait times than the cable car."
      },
      {
        "name": "명동",
        "nameEn": "Myeongdong",
        "preview": "Vibrant night markets and shopping",
        "description": "The lights you saw from the tower now wrap around you right here. It’s a section where you can feel the true energy of Seoul, especially when paired with some delicious night market snacks.",
        "duration": "60 min",
        "tip": "Myeongdong Kyoja is always busy, so I recommend visiting right when it opens."
      },
      {
        "name": "청계천",
        "nameEn": "Cheonggyecheon Stream",
        "preview": "Streamside walking path and Gwangtonggyo night scenery",
        "description": "This stream flowing between skyscrapers feels like a breath of fresh air for the city. Sitting by the water under Gwangtonggyo bridge makes the urban noise feel miles away.",
        "duration": "40 min",
        "tip": "The stretch between Cheonggye Plaza and Gwangtonggyo is the best spot for night views."
      },
      {
        "name": "광화문",
        "nameEn": "Gwanghwamun",
        "preview": "Illuminated palace gate to end your day",
        "description": "Ending your day by watching the night lights glow on Gwanghwamun, you get a sense of the deep history this city is built upon.",
        "duration": "30 min",
        "tip": "It's perfect for photos once the night lights come on after 7:00 PM."
      }
    ]
  },
  "kpop-demon-hunters": {
    "title": "K-Pop Demon Hunters Pilgrimage",
    "subtitle": "Racing through Gangnam, crossing the Han River, and finishing on Namsan",
    "description": "A course that follows in the footsteps of the Huntrix (Lumi, Mira, and Joy) from the Netflix hit 'K-Pop Demon Hunters'.",
    "totalDuration": "About 5 hours",
    "distance": "About 24km including subway travel",
    "estimatedCost": "30,000 ~ 60,000 KRW (including observatory and meals)",
    "bestTime": "Start at 2 PM and continue until night (the Namsan ending is key)",
    "tags": [
      "K-Pop Demon Hunters",
      "Huntrix",
      "Animation",
      "Netflix",
      "K-Pop",
      "Pilgrimage"
    ],
    "stops": [
      {
        "name": "K-POP SQUARE (코엑스 3D 전광판)",
        "nameEn": "K-POP SQUARE (COEX 3D Billboard)",
        "preview": "K-POP SQUARE (COEX 3D Billboard)",
        "description": "The massive curved screen where the music video for the Huntrix hit 'Golden' was first revealed. This is the stage for the scene where the Saja Boys appeared in 3D across multiple screens. It’s the perfect high-impact start to your journey.",
        "duration": "30 min",
        "tip": "Exit 6 of Samseong Station. Media art plays on the hour, so time your visit accordingly."
      },
      {
        "name": "서울올림픽주경기장 (잠실종합운동장)",
        "nameEn": "Seoul Olympic Stadium (Jamsil Sports Complex)",
        "preview": "Seoul Olympic Stadium (Jamsil Sports Complex)",
        "description": "A place where you can feel the true scale of the stadium performances from the show. Standing in front of the stage where countless real-world K-Pop concerts have been held, you'll see the scenes from the series come to life.",
        "duration": "30 min",
        "tip": "Exits 6 and 7 of Sports Complex Station. If there's a concert scheduled, just enjoy the atmosphere from outside."
      },
      {
        "name": "롯데월드타워 (서울스카이)",
        "nameEn": "Lotte World Tower (Seoul Sky)",
        "preview": "Lotte World Tower (Seoul Sky)",
        "description": "The real-life model for the Huntrix dorm. The Seoul Sky Observatory is located above the 117th floor, right where the skyscraper appears in the show. You get a stunning view of the Han River and Gangnam in one sweep.",
        "duration": "60 min",
        "tip": "Exits 1 and 2 of Jamsil Station. Pre-booking your ticket saves money, and sunset is the most popular time to visit."
      },
      {
        "name": "잠실한강공원 (한강 야경)",
        "nameEn": "Jamsil Hangang Park (river night view)",
        "preview": "Jamsil Hangang Park (river night view)",
        "description": "The spot where the hunters, having run through Gangnam and Jamsil, stand by the riverbank to gaze across to the north. As the sun sets, the city lights reflecting on the water set the emotional stage for the next chapter.",
        "duration": "30 min",
        "tip": "Enter near Jamsilnaru Station. The view is best from sunset into the night."
      },
      {
        "name": "청담대교 지하철 구간 (7호선)",
        "nameEn": "Cheongdam Bridge Subway Section (Line 7)",
        "preview": "Cheongdam Bridge Subway Section (Line 7)",
        "description": "The subway crossing the Han River represents the hunters' dash across the city, marking the climax of the Gangnam-to-Gangbuk transition. Watching the river and city skyline through the window feels just like watching the hunters race through the urban landscape.",
        "duration": "15 min",
        "tip": "Take Line 7 from Cheongdam Station, cross the river, and get off at Jayang Station (Ttukseom Resort). Sit on the right side for the river view."
      },
      {
        "name": "자양역 (구 뚝섬유원지역)",
        "nameEn": "Jayang Station (formerly Ttukseom Resort)",
        "preview": "Jayang Station (formerly Ttukseom Resort)",
        "description": "The first station on the north side of the river. From here, the pace slows down as the story shifts toward more emotional themes. It's the spot where the hunters catch their breath and grab a bite to eat.",
        "duration": "15 min",
        "tip": "Near the Gangbyeonbuk-ro and Ttukseom Hangang Park. After this, we head into the city center."
      },
      {
        "name": "OO설렁탕",
        "nameEn": "OO Seolleongtang",
        "preview": "OO Seolleongtang",
        "description": "A staple of the K-Pop Demon Hunters course, serving rich, 24-hour slow-cooked ox bone soup. It’s where the hunters fuel up before heading deeper into the north side of the city.",
        "duration": "40 min",
        "tip": "A 3-minute walk from Exit 1 of Jayang Station."
      },
      {
        "name": "낙산공원 성곽",
        "nameEn": "Naksan Park Fortress Wall",
        "preview": "Naksan Park Fortress Wall",
        "description": "The stage for the critical scene where Lumi and Jin-woo exchange confessions after receiving Duffy's note. The fortress wall and the city night view are almost identical to the series, opening the emotional chapter of the journey.",
        "duration": "50 min",
        "tip": "Follow the fortress trail up from Hyehwa Station. The sunset scenery looks exactly like the show."
      },
      {
        "name": "북촌한옥마을",
        "nameEn": "Bukchon Hanok Village",
        "preview": "Bukchon Hanok Village",
        "description": "The backdrop for the emotional scenes between Lumi and Jin-woo. The view of the city skyline over the traditional hanok roofs is captured just as it appears in the story.",
        "duration": "50 min",
        "tip": "Bukchon-ro 11-gil is open to visitors Mon–Sat, 10 AM to 5 PM (closed Sundays). Please keep quiet as it is a residential area."
      },
      {
        "name": "명동 거리",
        "nameEn": "Myeongdong Street",
        "preview": "Myeongdong Street",
        "description": "The inspiration for the scene where Jin-woo serves a potato corn dog to a fan. The street food stalls here perfectly capture the lively atmosphere of Myeongdong seen in the show.",
        "duration": "40 min",
        "tip": "Try the Myeongdong Gyoja or classic street toast to soak in the show’s vibe."
      },
      {
        "name": "N서울타워 (남산서울타워)",
        "nameEn": "N Seoul Tower (Namsan Seoul Tower)",
        "preview": "N Seoul Tower (Namsan Seoul Tower)",
        "description": "The model for the final battle stage. While the tower in the show features a massive pentagonal stadium, closing your journey at the real tower plaza with the Namsan night view will leave you with the same lingering emotional resonance as finishing a great film.",
        "duration": "60 min",
        "tip": "If the cable car line is too long, take the Namsan Circulation Bus 02. The night view is the perfect way to end your journey."
      }
    ]
  },
  "omniscient-reader": {
    "title": "Omniscient Reader's Viewpoint: The 'Ways of Survival' Route",
    "subtitle": "Journey to the subway where the paywall began",
    "description": "Retrace the steps of Kim Dokja and Yoo Joonghyuk as they navigate scenarios across Seoul, just like in the 2025 film 'Omniscient Reader's Viewpoint.' Experience the stages of 'Ways of Survival' starting from an ordinary commute on the subway.",
    "totalDuration": "About 3 hours and 30 minutes",
    "distance": "Approx. 14km (including subway travel)",
    "estimatedCost": "10,000 ~ 20,000 KRW (Subway + Museum)",
    "bestTime": "1:00 PM ~ 7:00 PM (for the evening city views)",
    "tags": [
      "Omniscient Reader",
      "Kim Dokja",
      "Yoo Joonghyuk",
      "Webnovel",
      "Film",
      "Pilgrimage"
    ],
    "stops": [
      {
        "name": "금호역 (3호선)",
        "nameEn": "Geumho Station (Line 3)",
        "preview": "Geumho Station (Line 3)",
        "description": "This is one of the actual locations of the subway where Kim Dokja was commuting while reading the final episode of 'Ways of Survival.' The Line 3 route serves as the starting point for the first scenario in the story.",
        "duration": "20 min",
        "tip": "The segment from here to the next stop, Oksu, is the exact view just before the sea serpent appears in the story."
      },
      {
        "name": "동호대교",
        "nameEn": "Dongho Bridge",
        "preview": "Dongho Bridge",
        "description": "The bridge where the giant sea serpent emerges to swallow Kim Dokja. It’s the backdrop for the most intense visual scene among the 1,500 cuts of the film.",
        "duration": "30 min",
        "tip": "You can see a great view of the bridge by walking down to the Han River Park from Oksu Station. The bridge itself is for vehicles only."
      },
      {
        "name": "장충단공원",
        "nameEn": "Jangchungdan Park",
        "preview": "Jangchungdan Park",
        "description": "A park where Kim Dokja’s group stayed to regroup. It’s a perfect place to feel the silence of a world just after annihilation, tucked away in the city.",
        "duration": "30 min",
        "tip": "A 5-minute walk from Dongguk University Station (Line 3). You can also see late Joseon Dynasty relics like the Supyogyo Bridge and the Jangchungdan Monument."
      },
      {
        "name": "충무로역 (3·4호선)",
        "nameEn": "Chungmuro Station (Lines 3·4)",
        "preview": "Chungmuro Station (Lines 3·4)",
        "description": "The climax of this course. It is where the final battle against the fire dragon occurs in the latter half of the film, and the base for the 'Landlord Alliance' in 'Ways of Survival.'",
        "duration": "40 min",
        "tip": "Take a slow look around the station interior. You'll find that an ordinary transfer station can suddenly look like a battlefield from the movie."
      },
      {
        "name": "광화문 / 국립고궁박물관",
        "nameEn": "Gwanghwamun / National Palace Museum",
        "preview": "Gwanghwamun / National Palace Museum",
        "description": "The Gwanghwamun area serves as a setting for the later scenarios. The plaza in front of the National Palace Museum is portrayed as the gathering spot for Kim Dokja's group.",
        "duration": "50 min",
        "tip": "Admission to the museum is free. Visiting right after watching the movie makes the plaza feel truly like a 'scenario stage'."
      },
      {
        "name": "노들섬",
        "nameEn": "Nodeul Island",
        "preview": "Nodeul Island",
        "description": "A hub for the later scenarios. The geographical uniqueness of being an island on the Han River holds significant meaning within the story.",
        "duration": "40 min",
        "tip": "Accessible by walking from Nodeul Station (Line 9). Catching the Han River sunset here provides an atmosphere just like the film's ending."
      }
    ]
  },
  "itaewon-class": {
    "title": "Itaewon Class Filming Locations",
    "subtitle": "The street where Danbam first began",
    "description": "Follow the journey of Park Saeroyi’s startup success from the JTBC drama 'Itaewon Class' through the heart of Seoul. Discover the actual site of the Danbam pub, the bridge where Saeroyi and Yi-seo had their deep conversations, and the iconic spot for the finale's romantic kiss scene.",
    "totalDuration": "About 3 hours and 30 minutes",
    "distance": "About 6km (walking + subway)",
    "estimatedCost": "₩20,000 ~ ₩50,000 (including meals and cafe)",
    "bestTime": "4:00 PM ~ 9:00 PM (sunset + Itaewon night views)",
    "tags": [
      "Itaewon Class",
      "Park Seo-jun",
      "Kim Da-mi",
      "Danbam",
      "JTBC",
      "Filming Location"
    ],
    "stops": [
      {
        "name": "이태원세계음식거리",
        "nameEn": "Itaewon Global Food Street",
        "preview": "Itaewon Global Food Street",
        "description": "The overpass where Park Saeroyi and Jo Yi-seo often shared their thoughts. This is the drama's signature angle that captures both the Itaewon streetscape and Namsan Tower in one single frame.",
        "duration": "30 min",
        "tip": "A 3-minute walk from Exit 2 of Noksapyeong Station (Line 6). Best visited right after sunset for the city lights."
      },
      {
        "name": "녹사평육교",
        "nameEn": "Noksapyeong Overpass",
        "preview": "Noksapyeong Overpass",
        "description": "The actual setting of the Itaewon street where Danbam was established. In the neighborhood where the original Danbam stood, you can still find traces of the sign on the building next to the 'GS25 Itaewon Hill branch'.",
        "duration": "1 hour",
        "tip": "A 5-minute walk from Exit 1 of Itaewon Station. The small street stalls and global restaurants perfectly preserve the drama’s unique atmosphere."
      },
      {
        "name": "후암동 단밤 포차 (오리올 카페)",
        "nameEn": "Huam-dong Danbam Pocha (Oriole Cafe)",
        "preview": "Huam-dong Danbam Pocha (Oriole Cafe)",
        "description": "The actual filming location for the Danbam pub. While depicted as Gyeongnidan-gil in the show, the scenes were actually filmed at 'Oriole', a brunch cafe at the foot of Namsan in Huam-dong, owned by singer Jung Yup.",
        "duration": "1 hour",
        "tip": "Accessible by walking or bus toward Namsan. If the cafe is open, feel free to step inside and experience the vibe of the filming site yourself."
      },
      {
        "name": "남산공원 백범광장",
        "nameEn": "Baekbeom Square, Namsan Park",
        "preview": "Baekbeom Square, Namsan Park",
        "description": "The backdrop for the emotional kiss scene in the final episode. This is a iconic spot where you can see the Namsan Tower and the ancient Hanyangdoseong Fortress wall illuminated at night.",
        "duration": "40 min",
        "tip": "Located at the entrance to the Namsan trail from Hoehyeon Station or Namdaemun Market. Go during the evening hours to fully capture the romantic atmosphere of the scene."
      },
      {
        "name": "남산서울타워",
        "nameEn": "Namsan Seoul Tower",
        "preview": "Namsan Seoul Tower",
        "description": "The final stop of the course. Hike from Baekbeom Square to the peak of Namsan to look out over Seoul, just as the characters did in the series.",
        "duration": "30 min",
        "tip": "You can reach the top from Baekbeom Square via the Namsan Cable Car or a 25-minute walk."
      }
    ]
  },
  "moving-bongseok-flight": {
    "title": "Moving: Bong-seok's Namsan Flight Diary",
    "subtitle": "Hey Hui-soo, want to go have some Namsan Donkatsu with me?",
    "description": "This tour is guided by the perspective of Kim Bong-seok, the cute superpowered student from the Disney+ series 'Moving'. From the real-life locations of Jeongwon High School to the Namsan Donkatsu spots where his parents shared their heartfelt romance, this course is packed with the kind of excitement that makes you feel like you're floating. Recite your pi(π) and follow me!",
    "totalDuration": "About 4 hours",
    "distance": "About 7km (mix of public transit and walking)",
    "estimatedCost": "₩15,000 ~ ₩30,000 (a massive pork cutlet is a must!)",
    "bestTime": "Start at lunchtime and finish by the sunset at 5 PM",
    "tags": [
      "Moving",
      "Kim Bong-seok",
      "Namsan Donkatsu",
      "Drama Filming Location",
      "Date Course",
      "Disney Plus"
    ],
    "stops": [
      {
        "name": "동호대교",
        "nameEn": "Dongho Bridge",
        "preview": "Motif of Bong-seok's father's night flight, Han River view",
        "description": "If you walk down from the school toward the Han River, you'll see a vast open view of the river and Dongho Bridge. This is the spot where my dad (Kim Doo-sik) would soar through the night sky to carry out his missions! I used to grip my yellow umbrella, look out the bus window at this very scenery, and dream that maybe one day I could fly freely too.",
        "duration": "30 min",
        "tip": "It's great to go down from Oksu Station toward the Han River Park and watch the river from under the bridge. I highly recommend renting a bike and riding along, too!"
      },
      {
        "name": "101번지 남산돈까스 (본점 일대)",
        "nameEn": "101beonji Namsan Donkatsu (main branch area)",
        "preview": "Where Bong-seok's parents had their first date, a must-visit drama spot",
        "description": "We've finally arrived! This is the legendary romantic spot where my mom and dad went on their first date: the Namsan Donkatsu street! You know it's the real 'Moving' style to slice through a massive, plate-sized donkatsu and then bite into a green chili dipped in ssamjang when it gets a little greasy, right? I love donkatsu so, so much!",
        "duration": "70 min",
        "tip": "The donkatsu street is formed near the Namsan Cable Car station. It gets pretty busy on weekend afternoons, so go early before you get so hungry you start floating into the sky!"
      },
      {
        "name": "남산서울타워",
        "nameEn": "Namsan Seoul Tower",
        "preview": "The romantic spot where Dad hugged Mom and took off into the sky",
        "description": "Now that we're full, we have to hike up to help with digestion! This is the romantic place where my dad wanted to show my mom the sparkling Seoul nightscape, so he hugged her and flew up into the sky. I can't fly as well as my dad yet, so I walked up, but looking down at Seoul from here really clears your head. I hope to fly up here with Hui-soo one day!",
        "duration": "60 min",
        "tip": "You can slowly walk up along the 'Namsan Park Trail' to digest your donkatsu. The view is most beautiful when the sun starts to set."
      }
    ]
  },
  "seongsu-vibe": {
    "title": "Seongsu-dong Tour",
    "subtitle": "Where all the cool kids in Seoul hang out!",
    "description": "From Seoul Forest to the bustling Seongsu-dong Cafe Street. Explore the ultimate Seongsu experience, packed with industrial-turned-cafes and independent designer showrooms.",
    "totalDuration": "About 3 hours",
    "distance": "3.5km",
    "estimatedCost": "₩10,000 ~ ₩30,000 (based on 2-3 cafes)",
    "bestTime": "11:00 AM ~ 5:00 PM (long wait times on weekend mornings)",
    "tags": [
      "Vibe",
      "Cafe",
      "Brunch",
      "Photography"
    ],
    "stops": [
      {
        "name": "서울숲",
        "nameEn": "Seoul Forest",
        "preview": "Urban eco-park in an industrial zone, deer feeding",
        "description": "Meeting deer in the middle of Seongsu, once a factory district, really makes you realize the diverse layers of this city. It is the first unexpected moment of your Seongsu vibe tour.",
        "duration": "50 min",
        "tip": "Deer feeding sessions take place at 11:00 AM, 2:00 PM, and 4:00 PM."
      },
      {
        "name": "성수동 카페거리",
        "nameEn": "Seongsu-dong Cafe Street",
        "preview": "Industrial-style cafes and showrooms, Seoul's hippest street",
        "description": "Just one block is all it takes to understand why this street, with its rusted iron doors and concrete walls turned into galleries and cafes, is the hippest spot in Seoul. The space itself is the content.",
        "duration": "80 min",
        "tip": "A 5-minute walk from Seongsu Station Exit 2. Parking is basically impossible."
      },
      {
        "name": "뚝섬유원지",
        "nameEn": "Ttukseom Resort",
        "preview": "Han River riverside, perfect sunset spot",
        "description": "Watching the sunset by the Han River as you wrap up your time in Seongsu will help you reflect on the many faces of Seoul you experienced throughout the day.",
        "duration": "30 min",
        "tip": "We recommend grabbing some fried chicken and beer at a table by the Han River!"
      }
    ]
  },
  "bukchon-walk": {
    "title": "Exploring Bukchon Hanok Village",
    "subtitle": "Traditional alleys of the Joseon Dynasty in the heart of Seoul",
    "description": "Start your journey at Gyeongbokgung Palace, wander through the hidden alleys of Bukchon, and finish in the artistic streets of Insa-dong. A perfect course where traditional hanoks, modern galleries, and cozy teahouses coexist.",
    "totalDuration": "About 2 hours 30 minutes",
    "distance": "3.8km",
    "estimatedCost": "Free to ~₩20,000 (if visiting teahouses)",
    "bestTime": "Weekday mornings (weekends can get crowded)",
    "tags": [
      "Hanok",
      "Culture",
      "Photography",
      "Tradition"
    ],
    "stops": [
      {
        "name": "경복궁",
        "nameEn": "Gyeongbokgung Palace",
        "preview": "Free entry in hanbok, the historical starting point",
        "description": "Walking through this palace in a hanbok makes you feel like you've completely stepped out of your daily life. It’s the perfect place to open the first chapter of this historical journey.",
        "duration": "30 min",
        "tip": "Admission is free if you wear a hanbok. There are plenty of rental shops nearby."
      },
      {
        "name": "북촌한옥마을",
        "nameEn": "Bukchon Hanok Village",
        "preview": "The tile-roofed alleys of 31 Gahoe-dong, the best traditional view in Seoul",
        "description": "With layered tile roofs framed by narrow alleys, this view offers the most authentic Korean experience in Seoul. The overlook from the top of the hill at 31 Gahoe-dong is truly breathtaking.",
        "duration": "60 min",
        "tip": "This is a quiet residential area, so please keep your voice low."
      },
      {
        "name": "인사동",
        "nameEn": "Insa-dong",
        "preview": "Street of traditional crafts and tea culture, Ssamzigil craft workshops",
        "description": "This street shows you exactly how tradition and modernity can live together. The craft works inside Ssamzigil really help you feel the living spirit of tradition.",
        "duration": "50 min",
        "tip": "There are many workshops in Ssamzigil where you can try crafting; walk-ins are often welcome."
      },
      {
        "name": "광화문광장",
        "nameEn": "Gwanghwamun Square",
        "preview": "Wrapping up the Bukchon alleys by returning to the grand scale of Seoul",
        "description": "Coming out from the quiet, narrow alleys of Bukchon to this expansive square makes you realize the true scale of Seoul all over again. It’s the final 'wow' moment of the course.",
        "duration": "20 min",
        "tip": "The Sejong Story and Chungmugong Story exhibitions in the underground area are free to visit."
      }
    ]
  },
  "seoul-market-food": {
    "title": "Seoul’s Flavors: A Gourmet Tour of 3 Traditional Markets",
    "subtitle": "The perfect way to explore authentic Korean food and culture",
    "description": "A foodie package course where you can taste signature snacks, feel the vibrant local daily life, and experience the warm hospitality of Seoul’s iconic traditional markets. We recommend using the subway to get around.",
    "totalDuration": "About 5 hours",
    "distance": "About 13.4km",
    "estimatedCost": "₩30,000 ~ ₩50,000",
    "bestTime": "11:00 AM ~ 5:00 PM (Lunch to early dinner)",
    "tags": [
      "Gourmet",
      "Traditional Market",
      "Food Tour",
      "K-Food"
    ],
    "stops": [
      {
        "name": "경동시장",
        "nameEn": "경동시장",
        "preview": "A hidden traditional market beloved by locals",
        "description": "Gyeongdong Market is the largest traditional market in Seoul, offering everything from herbal medicines to fresh produce. Recently, it has transformed into a spot popular with young people and international tourists thanks to a trendy Starbucks and experiential space set in an old theater. (We recommend taking Line 1 and transferring at Dongdaemun Station to reach the next stop.)",
        "duration": "60 min",
        "tip": "It's safer to browse stores that have price tags clearly displayed."
      },
      {
        "name": "남대문 시장",
        "nameEn": "남대문 시장",
        "preview": "The nation's largest market next to Sungnyemun Gate",
        "description": "Located right next to Sungnyemun Gate, Namdaemun Market is Korea's largest general market where you can find clothing, everyday goods, and street food all in one place.",
        "duration": "90 min",
        "tip": "It connects directly to Exit 8 of Jongno 5-ga Station on Line 1. Popular eateries can have long lines, so visiting a bit earlier is recommended."
      },
      {
        "name": "서울로7017",
        "nameEn": "서울로7017",
        "preview": "A scenic stroll for a full stomach",
        "description": "For those who have been busy traveling from Gyeongdong Market to Namdaemun Market, we introduce one of the most beautiful walking paths in Seoul. You can take in the entire view of the city from here.",
        "duration": "30 min",
        "tip": "Enjoy a leisurely walk along Seoullo 7017."
      },
      {
        "name": "통인시장",
        "nameEn": "Tongin Market",
        "preview": "An alleyway lunch box experience using old coins",
        "description": "Tongin Market is famous for its 'Yeopjeon Lunch Box,' where you buy brass coins at the customer service center and exchange them for side dishes at participating vendors. Each coin is worth 500 won, so you can fill your tray without worrying about haggling.",
        "duration": "80 min",
        "tip": "The lunch box cafe operates from 11:00 to 16:00 (17:00 on weekends), Tuesday through Sunday, and is closed on Mondays and every third Sunday, so plan accordingly."
      }
    ]
  },
  "jensen-huang-seoul-2026": {
    "title": "Jensen Huang’s Seoul Visit",
    "subtitle": "The 2026 5-Day Seoul Itinerary of Jensen Huang",
    "description": "The complete 5-day tour guide of NVIDIA CEO Jensen Huang’s visit to Seoul in June 2026. Follow in the footsteps of the 'AI Emperor' on this K-Food and K-Tech pilgrimage through the heart of modern Seoul.",
    "totalDuration": "3 days",
    "distance": "Approx. 50km (mixed car + walking)",
    "estimatedCost": "₩70,000 ~ ₩150,000 (Samgyeopsal + BBQ + Kalguksu + Samgyetang + Naengmyeon + PC Bang + Baseball game)",
    "bestTime": "D1 Afternoon~Late night (Hongdae) → D2 Lunch~Dinner (Namdaemun·Seochon) → D3 Lunch~Dinner (Euljiro·Gangnam·Jamsil)",
    "tags": [
      "Jensen Huang",
      "NVIDIA",
      "T1",
      "Faker",
      "Samso Meetup",
      "Hongdae",
      "Euljiro",
      "Seochon",
      "Jamsil",
      "Kkanbu Chicken",
      "AI",
      "K-Food"
    ],
    "stops": [
      {
        "name": "T1 베이스캠프 홍대점",
        "nameEn": "T1 Base Camp Hongdae",
        "preview": "Jensen Huang × Faker first meeting — RTX 5090 giveaway event",
        "description": "For his first stop, he visited the official T1 PC cafe located on the basement level of the Ilex building in Hongdae. He met Faker and the entire T1 team, personally awarding a signed RTX 5090 to a lucky fan.",
        "duration": "2 hours",
        "tip": "50m from Hongik Univ. Station Exit 1, Ilex B1. 147, Yanghwa-ro, Mapo-gu. Open 24 hours."
      },
      {
        "name": "형님저요 (삼소 회동)",
        "nameEn": "Hyeongnim Jeoyo (Samso meetup)",
        "preview": "Pork belly + Soju-beer meetup — The meal of tech titans",
        "description": "At 7:10 PM, he held a 'Samso (pork belly & soju-beer) meetup' with SK Chairman Chey Tae-won, LG Chairman Koo Kwang-mo, and Naver Chairman Lee Hae-jin at this veteran restaurant in Seogyo-dong. Naver Chairman Lee Hae-jin covered the bill using Naver Pay.",
        "duration": "2 hours",
        "tip": "136, Eoulmadang-ro, Mapo-gu. 5-min walk from Hongik Univ. Station. Reservations required."
      },
      {
        "name": "BBQ 홍대입구점 (삼소 2차)",
        "nameEn": "BBQ Hongdae Branch (Samso round 2)",
        "preview": "Round 2 of the Samso meetup at a chicken joint",
        "description": "The group moved on foot to their second venue. They continued the night with fried chicken and draft beer, during which SK Chairman Chey Tae-won treated everyone in the restaurant to a 'golden bell' round. Jensen Huang also left his autograph here.",
        "duration": "1 hour",
        "tip": "3-min walk from Hyeongnim Jeoyo."
      },
      {
        "name": "토속촌 삼계탕 (서촌)",
        "nameEn": "Tosokchon Samgyetang (Seochon)",
        "preview": "Family outing — K-Food feast with Samgyetang, whole chicken, and Pajeon",
        "description": "On the evening of the 6th, he visited this famous Seochon Samgyetang spot with his eldest daughter Madison Huang and family. They ordered Samgyetang, whole roasted chicken, and scallion pancakes, waving warmly to citizens outside the shop.",
        "duration": "1 hour 30 min",
        "tip": "5-min walk from Gyeongbokgung Station Exit 2. 5, Jahamun-ro 5-gil, Jongno-gu."
      },
      {
        "name": "CJ ENM 스튜디오 (유퀴즈 녹화)",
        "nameEn": "CJ ENM Studio (You Quiz filming)",
        "preview": "His first-ever variety show appearance — Aired June 10, 2026",
        "description": "The filming location for tvN’s 'You Quiz on the Block,' where Jensen Huang made his first-ever TV entertainment appearance. They discussed NVIDIA’s founding, insights into the AI era, and future talent. He notably revealed himself as a fan of Hwasa, enjoying her songs 'Good Goodbye' and 'So Cute'.",
        "duration": "1 hour (exterior view)",
        "tip": "Near Sangam DMC. The episode is available on tvN starting June 10, 2026."
      },
      {
        "name": "우래옥 (을지로)",
        "nameEn": "Woo Lae Oak (Euljiro)",
        "preview": "Pyongyang Naengmyeon lunch with Hyundai Motor Group Chairman Euisun Chung — Discussing robotics and autonomous driving",
        "description": "At 11:50 AM on the 7th, he had a surprise lunch meeting with Hyundai Motor Group Chairman Euisun Chung. They enjoyed lunch at Woo Lae Oak, a representative Seoul veteran restaurant specializing in Pyongyang Naengmyeon since 1946, while discussing cooperation in robotics and autonomous driving.",
        "duration": "1 hour 30 min",
        "tip": "5-min walk from Euljiro 3-ga Station. 62-29, Changgyeonggung-ro, Jung-gu."
      },
      {
        "name": "신논현 PC방 벨트 (옵티멈존 → Portal)",
        "nameEn": "Sinnonhyeon PC Cafe Belt (Optimum Zone → Portal)",
        "preview": "Surprise guest for PUBG and AION 2 — Meeting with Krafton and NCSoft",
        "description": "At 1 PM, he made a surprise appearance at an event for PUBG: Battlegrounds at Optimum Zone in Sinnonhyeon with Krafton Chairman Chang Byung-gyu and YouTuber KimBlue. 30 minutes later, he visited the adjacent Portal PC cafe to guest on a surprise live broadcast for AION 2, later meeting NCSoft CEO Kim Taek-jin to discuss AI games and digital humans.",
        "duration": "1 hour 30 min",
        "tip": "Near Sinnonhyeon Station Exit 6. Both locations have photos of his visit posted on social media."
      },
      {
        "name": "잠실야구장",
        "nameEn": "Jamsil Baseball Stadium",
        "preview": "Wearing a Doosan Bears jersey and throwing the first pitch — 113 BBQ chickens in the group suite",
        "description": "At 5 PM, he took the mound as the ceremonial first pitcher for the Doosan Bears vs. Kiwoom Heroes game. Entering with Doosan Group Chairman Park Jeong-won, Jensen Huang wore a Doosan Bears jersey to throw the pitch.",
        "duration": "3 hours (including game watching)",
        "tip": "5-min walk from Jamsil Station Exit 5, Line 2."
      },
      {
        "name": "깐부치킨 삼성점 (2차 깐부 회동)",
        "nameEn": "Kkanbu Chicken Samseong Branch (round 2)",
        "preview": "High-fives and draft beer with Chairman Chey Tae-won — Reuniting at the site of the 2025 Kkanbu meetup",
        "description": "At 6:50 PM, immediately after the pitch, he moved to Kkanbu Chicken Samseong Branch to reunite with SK Chairman Chey Tae-won, sharing high-fives and draft beer. This is the very same venue where Jensen Huang had his historic 'Kkanbu meetup' with Samsung Chairman Lee Jae-yong and Hyundai Chairman Euisun Chung in October 2025.",
        "duration": "2 hours",
        "tip": "5-min walk from Samseong Station, Lines 2 & 9. Samseong-dong, Gangnam-gu. You can still see traces of his previous visits including autographs."
      }
    ]
  },
  "mz-gacha-tour": {
    "title": "Mastering the Seoul Gacha Scene",
    "subtitle": "The ultimate gaming route trending with Gen Z",
    "description": "Explore the hottest spots for gacha shops, capsule toys, and photo booths connecting Hongdae, Sinchon, and Hapjeong. From idol merchandise in vending machines to limited-edition figures, this journey is all about capturing memories for your social media feed.",
    "totalDuration": "About 3 hours",
    "distance": "4.5km",
    "estimatedCost": "₩10,000 ~ ₩50,000 (varies by how much you play)",
    "bestTime": "2:00 PM ~ 9:00 PM (weekends are the most vibrant)",
    "tags": [
      "Gacha",
      "Capsule Toys",
      "MZ Generation",
      "In their 20s",
      "Goods",
      "Photo Booth"
    ],
    "stops": [
      {
        "name": "홍대 피카소거리 (가챠샵 밀집)",
        "nameEn": "Hongdae Picasso Street (gacha shops)",
        "preview": "Hongdae Picasso Street (gacha shops)",
        "description": "The excitement of pulling the lever fills this entire alleyway. It is the perfect place in Seoul to experience the thrill of not knowing which figure you will get next.",
        "duration": "70 min",
        "tip": "Specialized shops like Toy Uhreun and Garage Shop are clustered in the alleys near Hongik Univ. Station Exit 9."
      },
      {
        "name": "홍대 포토부스 거리",
        "nameEn": "Hongdae Photo Booth Street",
        "preview": "Hongdae Photo Booth Street",
        "description": "Striking silly poses with friends for four-frame photos is the most honest way to document your day. It is the ultimate way to capture the moment in true MZ style.",
        "duration": "30 min",
        "tip": "Expect 20-30 minute waits on weekend afternoons. Try booking via an app or visiting on a weekday to skip the line."
      },
      {
        "name": "신촌 아이돌 굿즈샵 거리",
        "nameEn": "Sinchon K-pop Goods Shop Street",
        "preview": "Sinchon K-pop Goods Shop Street",
        "description": "The joy of holding your favorite idol's merchandise is something only a true fan can understand. This street is where you can physically feel the passion for your fandom.",
        "duration": "50 min",
        "tip": "There are many shops in the underground shopping mall near Sinchon Station Exit 2. Don't miss the photo card giveaway events when pre-ordering albums."
      },
      {
        "name": "합정 피규어 & 굿즈 전문점",
        "nameEn": "Hapjeong Figure & Goods Shop",
        "preview": "Hapjeong Figure & Goods Shop",
        "description": "The rush of discovering a rare, limited-edition figure is a feeling only those who have experienced it truly know. This is the perfect grand finale for your course.",
        "duration": "70 min",
        "tip": "Some shops announce pre-sales on social media. Follow their accounts so you don't miss out on limited items."
      }
    ]
  },
  "seongbuk-date-couese": {
    "title": "Seongbuk-dong Date Course",
    "subtitle": "The ultimate guide to a perfect date in Seongbuk-dong!",
    "description": "A charming neighborhood getaway filled with quiet vibes and hidden gems perfect for a cozy afternoon.",
    "totalDuration": "6 hours",
    "distance": "About 5.9km",
    "estimatedCost": "~₩50,000",
    "bestTime": "From 2:00 PM onwards",
    "tags": [
      "Date",
      "Seongbuk-dong"
    ],
    "stops": [
      {
        "name": "바게트 빌리지",
        "nameEn": "Baguette Village",
        "preview": "A light pre-date snack at Baguette Village",
        "description": "Start your afternoon with some freshly baked treats at Baguette Village to fuel up before your walk.",
        "duration": "30 min"
      },
      {
        "name": "북악 팔각정",
        "nameEn": "Bugak Palgakjeong Pavilion",
        "preview": "Scenic views at Bugak Palgakjeong Pavilion",
        "description": "Head over to Bugak Palgakjeong Pavilion, where you can catch one of the most breathtaking panoramic views of Seoul.",
        "duration": "30 min"
      }
    ]
  },
  "seoul-train-view": {
    "title": "Seoul Train Spotting for Rail Enthusiasts",
    "subtitle": "Where train lovers go to capture the perfect shot",
    "description": "Discover some of the most iconic spots in Seoul where urban transit meets the Han River, perfect for those who love trains and photography.",
    "totalDuration": "3 hours",
    "distance": "About 4.9 km",
    "estimatedCost": "Free",
    "bestTime": "5:00 PM",
    "tags": [
      "Train",
      "Railway",
      "Photo Spot"
    ],
    "stops": [
      {
        "name": "영동대교남단",
        "nameEn": "Yeongdong Bridge South End",
        "preview": "Line 7 crossing at Cheongdam Bridge",
        "description": "Standing at Yeongdong Bridge South End, you can watch Line 7 subway trains pass right by on the adjacent Cheongdam Bridge. It is a fantastic spot for rail photography because you can capture the Han River, the bridge, and the train all in one frame.",
        "duration": "30 min",
        "tip": "Since it is next to a busy road, please stay behind the safety line while taking photos."
      },
      {
        "name": "뚝섬한강공원",
        "nameEn": "Ttukseom Hangang Park",
        "preview": "Hangang Park with Cheongdam Bridge running through",
        "description": "At Ttukseom Hangang Park, the bridge crosses directly over the park, allowing you to see Line 7 trains up close from below. If you head up to the J-Bug observatory, you can capture a beautiful view of the trains gliding over the Han River.",
        "duration": "40 min",
        "tip": "It is directly connected to exits 2 and 3 of Jayang Station (Ttukseom Hangang Park Station)."
      },
      {
        "name": "살곶이공원",
        "nameEn": "Salgoji Park",
        "preview": "Line 2 railway section next to Salgoji Bridge",
        "description": "At Salgoji Park, the Line 2 subway bridge and Seongdong Bridge run side-by-side next to the historic Salgoji Bridge. It is an impressive sight where the contrast between the modern train crossing the Jungnangcheon Stream and the ancient stone bridge creates a unique composition.",
        "duration": "30 min",
        "tip": "It is easiest to reach by walking from Hanyang University Station."
      }
    ]
  },
  "cheonggyecheon-running": {
    "title": "Cheonggyecheon City Run Course",
    "subtitle": "A loop around Seoul for seasoned runners",
    "description": "Take a loop through Seoul's iconic landmarks, from Gwanghwamun to Cheonggyecheon, passing by Jongmyo Shrine and the Songhyeon Green Plaza. Because of the length, this course is recommended for experienced runners.",
    "totalDuration": "2 hours",
    "distance": "5.1km",
    "estimatedCost": "Free",
    "bestTime": "8:00 PM",
    "tags": [
      "Exercise",
      "Running",
      "Jongno"
    ],
    "stops": [
      {
        "name": "광화문광장",
        "nameEn": "Gwanghwamun Square",
        "preview": "Gwanghwamun Square starting point",
        "description": "Start at Gwanghwamun Square, where the wide boulevards and the view of Gyeongbokgung Palace unfold before your eyes. It’s early in the day and quiet, making it a great place to warm up before you set off.",
        "duration": "10 min",
        "tip": "There is a restroom and a convenience store near Exit 2 of Gwanghwamun Station."
      },
      {
        "name": "청계광장",
        "nameEn": "Cheonggye Plaza",
        "preview": "Entrance to the Cheonggyecheon stream",
        "description": "Once you reach Cheonggye Plaza, you’ve hit the official start of Cheonggyecheon, where you can listen to the water as you enter the streamside course. You'll naturally flow into the walking path as you pass the Candle Fountain and the spiral tower.",
        "duration": "30 min"
      },
      {
        "name": "청계2가사거리",
        "nameEn": "Cheonggye 2-ga Intersection",
        "preview": "Streamside path near Samilgyo Bridge",
        "description": "Around the Cheonggye 2-ga Intersection, you'll see a beautiful contrast between the towering skyscrapers above and the tranquil stream path below. On weekday afternoons, you'll often see local office workers taking a stroll.",
        "duration": "30 min",
        "tip": "You can use the entrance near Samilgyo Bridge to exit quickly to the surface."
      },
      {
        "name": "청계4가사거리",
        "nameEn": "Cheonggye 4-ga Intersection",
        "preview": "Streamside section near Bangsan and Pyeonghwa Markets",
        "description": "Near the Cheonggye 4-ga Intersection, you are so close to Bangsan and Pyeonghwa Markets that you can easily pop off the stream path and into the busy market alleys. During the day, watch out for the occasional cargo cart passing through.",
        "duration": "30 min"
      },
      {
        "name": "원남동사거리",
        "nameEn": "Wonnam-dong Intersection",
        "preview": "Intersection where Changgyeonggung-ro and Yulgok-ro meet",
        "description": "Wonnam-dong Intersection is a junction where you leave the stream course to head toward the royal palaces in the heart of the city. You'll feel the atmosphere shift as the stone walls of Changgyeonggung Palace draw near.",
        "duration": "30 min",
        "tip": "The lights here are quite long, so be sure to plan your crossing time carefully."
      },
      {
        "name": "율곡터널",
        "nameEn": "Yulgok Tunnel",
        "preview": "Underground road section in front of Changdeokgung Palace",
        "description": "The Yulgok Tunnel is an underground stretch leading from in front of the Donhwamun Gate of Changdeokgung Palace toward Wonnam-dong Intersection. Above ground, there is a restored wall path between Changdeokgung Palace and Jongmyo Shrine.",
        "duration": "30 min",
        "tip": "The sidewalk can be narrow here, so please watch out for people coming from the opposite direction."
      },
      {
        "name": "안국역",
        "nameEn": "Anguk Station",
        "preview": "Anguk Station and the entrance to Bukchon",
        "description": "As you pass Anguk Station, you'll find yourself near Bukchon Hanok Village and the alleys of Insadong, serving as a key landmark in the middle of our palace course. From here, set your course back toward Gwanghwamun for the final stretch.",
        "duration": "30 min",
        "tip": "Before heading to Gwanghwamun Square, take a look around the Songhyeon Green Plaza."
      },
      {
        "name": "광화문",
        "nameEn": "Gwanghwamun",
        "preview": "Gwanghwamun Square arrival point",
        "description": "Returning to Gwanghwamun Square, you can finish your run facing Gyeongbokgung Palace. There's a real sense of accomplishment knowing you’ve completed a full circuit back to where you started.",
        "duration": "30 min"
      }
    ]
  },
  "aespa-recommend": {
    "title": "aespa's Pick: Seongsu Foodie Tour",
    "subtitle": "Where mood meets flavor — an aespa-approved food tour through Seongsu",
    "description": "A foodie course tracing the trendy restaurants of Seongsu that pair perfectly with aespa's vibe. Wander through stylish cafés and distinctive eateries while soaking up Seongsu's uniquely hip atmosphere. With delicious food and photogenic spaces to capture, it's the perfect course for anyone who wants a day as special as aespa.",
    "totalDuration": "6 hours",
    "distance": "About 2.5km",
    "estimatedCost": "Around ₩50,000",
    "bestTime": "From 12:00 PM",
    "tags": [
      "Restaurants",
      "Aesthetic",
      "Healing"
    ],
    "stops": [
      {
        "name": "꾸아",
        "nameEn": "Quá (Main Branch)",
        "preview": "The birthplace of the life-changing pho brand praised by aespa's Karina — the Seongsu flagship of Quá, where you can savor a rich, authentic broth and bánh xèo full of local flavor!",
        "description": "Quá's Seongsu flagship feels like it has transplanted the taste and atmosphere of Vietnam straight to Korea, making it a must-visit landmark restaurant whenever you're in Seongsu.",
        "duration": "1 hour"
      },
      {
        "name": "천상가옥",
        "nameEn": "Cheonsangaok",
        "preview": "The coffee spot that even Karina fell for",
        "description": "Located on the 3rd floor of the 'Seongsu Yeonbang' complex in Seongsu, Cheonsangaok lives up to its name — 'a house built above the sky' — as one of Seongsu's signature large rooftop greenhouse cafés, filled with an open, airy feel and lush greenery.",
        "duration": "2 hours"
      },
      {
        "name": "디올성수",
        "nameEn": "Dior Seongsu",
        "preview": "As if 30 Avenue Montaigne in Paris were transplanted to Seongsu — Seongsu's finest landmark, beautiful by both day and night!",
        "description": "Located in the heart of Seongsu's Yeonmujang-gil, Dior Seongsu is a special concept store opened by the French luxury house Dior to capture the vibrant energy of Seongsu, one of the world's hottest destinations.",
        "duration": "2 hours"
      },
      {
        "name": "실비옥",
        "nameEn": "Silbiok",
        "preview": "The warming seaweed hot pot spot that won over both Giselle and Karina",
        "description": "Unlike ordinary hot pots, Seongsu's Silbiok serves a distinctive seaweed hot pot brimming with the scent of the sea, along with thin, wonderfully chewy hand-torn noodles (sujebi) — a clean, well-crafted meal that soothes you from the inside out.",
        "duration": "1 hour"
      }
    ]
  },
  "squid-game": {
    "title": "Squid Game 2 Filming Location Course",
    "subtitle": "Before the game begins, the story has already started in Seoul.",
    "description": "A course that walks you through the downtown Seoul filming locations where the tense scenes of 'Squid Game' were born. From Detective Hwang Jun-ho's investigation to the Salesman's first appearance and its iconic moments, follow the flow of the show and experience the real spaces where drama and reality meet.",
    "totalDuration": "3 hr 30 min",
    "distance": "About 4.3km",
    "estimatedCost": "Around ₩20,000",
    "bestTime": "From 2:00 PM",
    "tags": [
      "Squid Game",
      "Filming Location",
      "Walking"
    ],
    "stops": [
      {
        "name": "필운대로",
        "nameEn": "Pirundae-ro",
        "preview": "Filming spot of Detective Hwang Jun-ho's traffic-stop scene, a Seochon alley",
        "description": "Standing before the narrow Seochon alley, the scene of Detective Hwang Jun-ho pulling over a motorcycle comes naturally to mind. It's striking how an ordinary street suddenly transforms into a scene of nail-biting drama.",
        "duration": "30 min"
      },
      {
        "name": "종각역",
        "nameEn": "Jonggak Station",
        "preview": "The Salesman's first appearance, a subway station",
        "description": "Standing in the passageway toward the platform, the tension of Seong Gi-hun's first encounter with the Salesman comes rushing back. It feels all the more special to realize that this everyday subway space was the very starting point of Squid Game.",
        "duration": "1 hour"
      },
      {
        "name": "탑골공원",
        "nameEn": "Tapgol Park",
        "preview": "Filming spot of the Salesman's bread-and-lottery scene",
        "description": "In the plaza before the octagonal pavilion, you can picture the scene of the Salesman tossing out bread and lottery tickets. The contrast is striking — a peaceful park turned into a symbolic space that tests human choices.",
        "duration": "1 hour"
      },
      {
        "name": "금성루",
        "nameEn": "Geumseongru",
        "preview": "Filming spot of the meal scene with Hwang Jun-ho and his fellow officers",
        "description": "Stepping inside the restaurant, the scene of Detective Hwang Jun-ho and his fellow officers chatting over jjajangmyeon naturally comes to mind. Wrap up the course with a bowl of jjajangmyeon.",
        "duration": "1 hour"
      }
    ]
  },
  "man-course": {
    "title": "A Course for Guys in Their 20s Hanging Out with Friends",
    "subtitle": "From a round of games to a hearty dinner — the most down-to-earth day with friends",
    "description": "A course to casually enjoy some games at a PC bang, compete at screen baseball, and share non-stop laughter at a board game café. Right through to a hearty dinner to cap off the day, experience the everyday Seoul that so many guys in their 20s spend with their friends.",
    "totalDuration": "6 hours",
    "distance": "About 0.3km",
    "estimatedCost": "Around ₩70,000",
    "bestTime": "From 12:00 PM",
    "tags": [
      "Gaming",
      "Culture",
      "Sports"
    ],
    "stops": [
      {
        "name": "PC방",
        "nameEn": "PC Bang (Internet Café)",
        "preview": "The go-to indoor hangout for having fun with friends",
        "description": "The moment you grab the keyboard and mouse, your competitive spirit comes alive. Laughing and chatting while gaming together is the space that best captures everyday life in your 20s.",
        "duration": "2 hours"
      },
      {
        "name": "보드게임카페",
        "nameEn": "Board Game Café",
        "preview": "A variety of board games, an indoor gathering space",
        "description": "Once you gather around the table and start a game, conversation and laughter flow naturally. Building strategies, bluffing, and teaming up all add another layer of fun.",
        "duration": "2 hours"
      },
      {
        "name": "스크린야구",
        "nameEn": "Screen Baseball",
        "preview": "Indoor baseball experience, team matchups",
        "description": "Step up to the plate and it feels as tense as a real game. Competing for points, cheering each other on, and getting moving with friends, you'll lose track of time.",
        "duration": "1 hour"
      },
      {
        "name": "저녁식사",
        "nameEn": "Dinner",
        "preview": "Grilled samgyeopsal, a quintessential Korean dining-out dish",
        "description": "With sizzling, golden-brown samgyeopsal in front of you, the day's fatigue naturally melts away. It's the perfect place to wrap up after games and activities, chatting away with friends.",
        "duration": "1 hour"
      }
    ]
  },
  "girl-course": {
    "title": "A Course for Women in Their 20s Hanging Out with Friends",
    "subtitle": "A special day with friends that captures both the mood and the memories",
    "description": "A course to unwind at an aesthetic café, make memories at a sticker photo booth, then browse a pop-up store to discover new brands and goods. End the day with a walk along the Hangang River, wrapping up precious time amid Seoul's beautiful scenery.",
    "totalDuration": "5 hr 30 min",
    "distance": "About 3.7km",
    "estimatedCost": "Around ₩50,000",
    "bestTime": "From 2:00 PM",
    "tags": [
      "Healing",
      "Aesthetic",
      "Memories"
    ],
    "stops": [
      {
        "name": "카페",
        "nameEn": "Café",
        "preview": "A relaxing break with a view of Seokchon Lake",
        "description": "Chatting over fragrant coffee and desserts, time flies by in no time. Taking photos and sharing everyday life is a hallmark of café culture enjoyed by so many women in their 20s.",
        "duration": "2 hours"
      },
      {
        "name": "스티커사진",
        "nameEn": "Sticker Photo Booth",
        "preview": "A self-photo space for making memories",
        "description": "The fun begins the moment you pick out props and strike poses together. The sticker photos you take together become a special keepsake that keeps the day memorable for a long time.",
        "duration": "30 min"
      },
      {
        "name": "팝업스토어",
        "nameEn": "Pop-up Store",
        "preview": "A space for limited-edition goods and brand experiences",
        "description": "Browsing the pop-up stores that open anew each season, you can encounter a variety of brands and content all in one place. It's a space full of fun — checking out limited-edition goods, taking photos, and experiencing new trends.",
        "duration": "2 hours"
      },
      {
        "name": "한강 산책",
        "nameEn": "Hangang River Walk",
        "preview": "One of Seoul's signature night-view and walking spots",
        "description": "Strolling slowly along the sunset-tinted Hangang River, the day's ease comes naturally. Gazing at the scenery and chatting with a friend makes for a special finale you can only feel in Seoul.",
        "duration": "1 hour"
      }
    ]
  }
};
