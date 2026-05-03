export type Verification =
  | { type: "gps"; radiusMeters: number }
  | { type: "gps+quiz"; radiusMeters: number; quiz: Quiz }
  | { type: "gps+photo"; radiusMeters: number; hint: string };

export interface Quiz {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export interface StoryFragment {
  text: string;
  image?: string;
}

export interface Objective {
  id: string;
  order: number;
  poiId: string;
  poiName: string;
  lat: number;
  lng: number;
  title: string;
  hint: string;
  verification: Verification;
  storyFragment: StoryFragment;
}

export interface Badge {
  id: string;
  name: string;
  icon: string;
}

export interface StoryQuest {
  id: string;
  chapterId: string;
  title: string;
  synopsis: string;
  difficulty: 1 | 2 | 3;
  estimatedMinutes: number;
  objectives: Objective[];
  reward: {
    xp: number;
    badge?: Badge;
  };
}

export interface RegionChapter {
  id: string;
  regionName: string;
  description: string;
  cover: string;
  color: string;
  quests: StoryQuest[];
}

export interface AIPlaceInfo {
  placeName: string;
  summary: string;
  highlights: string[];
  tip: string;
  era?: string;
  tags: string[];
}
