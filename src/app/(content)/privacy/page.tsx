import type { Metadata } from "next";
import { SITE_NAME, absoluteUrl, breadcrumbLd, clampDescription, jsonLd } from "@/lib/seo";

/**
 * 개인정보처리방침.
 *
 * 형식이 아니라 **실제로 도는 코드 기준**으로 적었다. 항목을 늘리거나 줄일 때는
 * 아래 출처를 같이 고쳐야 한다:
 *  - 피드백 수집 항목  → src/app/api/feedback/route.ts 의 payload
 *  - 단말 저장 항목    → useCourseCollection / useCourseQuota / LocaleContext / WelcomeModal
 *  - 분석·광고 스크립트 → components/analytics/GoogleAnalytics.tsx, components/ads/AdSenseScript.tsx
 *
 * Google Analytics 이용약관과 애드센스 정책 모두 이 문서의 게시를 요구한다.
 */

const CONTACT_EMAIL = "sdh0279@gmail.com";
/** 내용을 고칠 때마다 갱신한다 — 방침은 시행일자가 없으면 효력을 따지기 어렵다. */
const EFFECTIVE_DATE = "2026년 9월 1일";

const TITLE = "개인정보처리방침";

export const metadata: Metadata = {
  title: TITLE,
  description: clampDescription(
    `${SITE_NAME}가 수집하는 정보와 이용 목적, 보관 기간, 처리위탁 현황을 안내합니다.`
  ),
  alternates: { canonical: "/privacy" },
  // 방침 문서는 검색 유입 대상이 아니다. 색인은 막되 링크는 따라가게 둔다.
  robots: { index: false, follow: true },
  openGraph: {
    title: `${TITLE} | ${SITE_NAME}`,
    description: `${SITE_NAME}가 수집하는 정보와 이용 목적을 안내합니다.`,
    url: absoluteUrl("/privacy"),
    type: "website",
  },
};

/** 수집 항목 표 — "우리가 실제로 서버로 보내는 것"만 적는다. */
const COLLECTED: { source: string; items: string; basis: string }[] = [
  {
    source: "피드백 보내기",
    items:
      "문의 유형, 문의 내용, 이메일 주소(선택 입력), 접속 URL, 유입 경로, 언어 설정, 화면 크기, 브라우저 종류(User-Agent), IP 주소, 임시 세션 식별자, 브라우저 오류 기록",
    basis: "이용자가 직접 제출한 때에 한해 수집",
  },
  {
    source: "AI 코스 만들기",
    items:
      "이용자가 고른 조건(동행·목적·지역·일정 등)과 직접 입력한 요청 문구, 코스 생성 요청 시각",
    basis: "코스 생성 요청 시 수집",
  },
  {
    source: "Google Analytics",
    items:
      "쿠키에 저장되는 익명 식별자, 방문한 페이지와 이용한 기능, 기기·브라우저 정보, 접속 국가·도시 수준의 대략적 위치",
    basis: "서비스 이용 시 자동 수집",
  },
  {
    source: "Google AdSense",
    items: "광고 게재·측정을 위한 쿠키 및 광고 식별자",
    basis: "광고가 노출되는 화면에서 자동 수집",
  },
];

/** 브라우저에만 남고 서버로 오지 않는 것들 — 구분해서 밝히는 편이 정확하다. */
const LOCAL_ONLY = [
  "내가 만든 코스 목록",
  "하루 코스 생성 횟수",
  "선택한 언어(한국어/영어)",
  "첫 방문 안내 닫음 여부",
];

export default function PrivacyPage() {
  const structuredData = breadcrumbLd([
    { name: "홈", path: "/" },
    { name: TITLE, path: "/privacy" },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />

      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-[#1B3A6B]">{TITLE}</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#78716C]">
          {SITE_NAME}(이하 &ldquo;서비스&rdquo;)는 이용자의 개인정보를 소중히 다루며,
          「개인정보 보호법」 등 관련 법령을 준수합니다. 이 방침은 서비스가 어떤 정보를 어떤 목적으로
          수집·이용하고, 얼마나 보관하며, 누구에게 맡기는지를 안내합니다.
        </p>
        <p className="mt-2 text-sm text-[#A8A29E]">시행일: {EFFECTIVE_DATE}</p>

        <Section title="1. 회원가입 없이 이용하는 서비스입니다">
          <p>
            서비스는 별도의 회원가입이나 로그인 절차를 두고 있지 않으며, 이름·연락처·생년월일 등
            이용자를 직접 식별하는 정보를 회원 정보로 수집하지 않습니다. 다만 아래와 같이 서비스 이용
            과정에서 자동으로 생성되거나 이용자가 직접 입력하는 정보가 수집됩니다.
          </p>
        </Section>

        <Section title="2. 수집하는 정보와 수집 방법">
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[560px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b-2 border-[#FDECC8]">
                  <th className="py-2.5 pr-4 font-bold text-[#1B3A6B]">구분</th>
                  <th className="py-2.5 pr-4 font-bold text-[#1B3A6B]">수집 항목</th>
                  <th className="py-2.5 font-bold text-[#1B3A6B]">수집 시점</th>
                </tr>
              </thead>
              <tbody>
                {COLLECTED.map((row) => (
                  <tr key={row.source} className="border-b border-[#FDECC8] align-top">
                    <td className="py-3 pr-4 font-semibold text-[#57534E]">{row.source}</td>
                    <td className="py-3 pr-4 leading-relaxed text-[#57534E]">{row.items}</td>
                    <td className="py-3 leading-relaxed text-[#78716C]">{row.basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-5">
            피드백의 이메일 주소는 <strong>선택 입력</strong>이며, 적지 않아도 문의를 보내실 수 있습니다.
            답변을 받고 싶은 경우에만 입력해 주세요.
          </p>
          <p className="mt-3">
            아래 정보는 이용자의 브라우저에만 저장되며 <strong>서비스 서버로 전송되지 않습니다.</strong>{" "}
            브라우저의 사이트 데이터를 삭제하면 함께 지워집니다.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {LOCAL_ONLY.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Section>

        <Section title="3. 이용 목적">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>문의·오류 신고에 대한 확인과 답변</li>
            <li>서비스 오류 원인 파악 및 개선</li>
            <li>이용자가 요청한 AI 여행 코스의 생성 및 제공</li>
            <li>이용 현황 통계 분석을 통한 기능 개선</li>
            <li>부정 이용(도배·자동화 요청) 방지 및 이용량 제한</li>
            <li>광고 게재 및 광고 성과 측정</li>
          </ul>
        </Section>

        <Section title="4. 보유 및 파기">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              피드백으로 접수된 정보: 접수일로부터 <strong>1년</strong> 보관 후 파기합니다. 처리 목적이
              먼저 달성된 경우에는 그 시점에 지체 없이 파기합니다.
            </li>
            <li>
              Google Analytics 수집 정보: Google 의 데이터 보관 설정에 따라{" "}
              <strong>최대 14개월</strong> 보관된 뒤 자동 삭제됩니다.
            </li>
            <li>AI 코스 생성 요청 내용: 코스를 만들어 응답하는 데 사용되며 별도로 보관하지 않습니다.</li>
          </ul>
          <p className="mt-3">
            법령에 따라 보존 의무가 있는 경우에는 해당 기간 동안 보관한 뒤 파기합니다. 전자적 파일은
            복구할 수 없는 방법으로 삭제합니다.
          </p>
        </Section>

        <Section title="5. 처리위탁 및 국외 이전">
          <p>
            서비스는 아래와 같이 개인정보 처리 업무를 위탁하고 있으며, 위탁받은 사업자의 서버는 국외에
            있습니다. 서비스를 이용하시면 아래 이전에 동의하신 것으로 봅니다.
          </p>
          <div className="-mx-4 mt-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[560px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b-2 border-[#FDECC8]">
                  <th className="py-2.5 pr-4 font-bold text-[#1B3A6B]">받는 자</th>
                  <th className="py-2.5 pr-4 font-bold text-[#1B3A6B]">위탁 업무</th>
                  <th className="py-2.5 font-bold text-[#1B3A6B]">이전 국가</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Google LLC", "이용 현황 분석(Google Analytics), 광고 게재(AdSense)", "미국"],
                  ["Google LLC", "피드백 내용 보관·알림(Google Sheets, Apps Script)", "미국"],
                  ["Vercel Inc.", "웹사이트 호스팅 및 접속 기록 보관", "미국"],
                ].map(([who, what, where]) => (
                  <tr key={`${who}-${what}`} className="border-b border-[#FDECC8] align-top">
                    <td className="py-3 pr-4 font-semibold text-[#57534E]">{who}</td>
                    <td className="py-3 pr-4 leading-relaxed text-[#57534E]">{what}</td>
                    <td className="py-3 text-[#78716C]">{where}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4">
            이전되는 항목과 시점은 2항의 표와 같으며, 위탁 목적 달성에 필요한 기간 동안 보유합니다.
          </p>
        </Section>

        <Section title="6. 쿠키 사용과 거부 방법">
          <p>
            서비스는 이용 현황 분석과 광고 게재를 위해 쿠키를 사용합니다. 쿠키 수집을 원하지 않으시면
            아래 방법으로 거부하실 수 있으며, 거부하셔도 지도·코스 등 서비스의 주요 기능은 그대로
            이용하실 수 있습니다.
          </p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            <li>브라우저 설정에서 쿠키 차단 또는 삭제</li>
            <li>
              Google Analytics 차단:{" "}
              <ExternalLink href="https://tools.google.com/dlpage/gaoptout">
                브라우저 부가기능 설치
              </ExternalLink>
            </li>
            <li>
              맞춤 광고 거부:{" "}
              <ExternalLink href="https://adssettings.google.com">Google 광고 설정</ExternalLink>
            </li>
          </ul>
        </Section>

        <Section title="7. 이용자의 권리">
          <p>
            이용자는 자신의 개인정보에 대해 열람·정정·삭제·처리정지를 요청하실 수 있습니다. 아래 연락처로
            요청하시면 지체 없이 조치하고 결과를 알려드립니다. 회원 정보를 보관하지 않으므로, 피드백을
            보내신 경우에는 확인을 위해 보내신 내용이나 이메일 주소를 함께 알려주시면 처리가 빠릅니다.
          </p>
        </Section>

        <Section title="8. 안전성 확보 조치">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>모든 통신 구간에 HTTPS 암호화를 적용합니다.</li>
            <li>피드백 저장소는 접근 권한이 있는 운영자만 열람할 수 있습니다.</li>
            <li>수집 항목을 서비스 운영에 필요한 최소한으로 제한합니다.</li>
          </ul>
        </Section>

        <Section title="9. 개인정보 보호책임자">
          <p>
            개인정보 처리에 관한 문의·불만·피해구제는 아래로 연락해 주세요.
          </p>
          <p className="mt-3">
            개인정보 보호책임자: {SITE_NAME} 운영자
            <br />
            이메일:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#B45309] underline">
              {CONTACT_EMAIL}
            </a>
          </p>
          <p className="mt-4 text-[#78716C]">
            그 밖에 개인정보 침해로 인한 상담이 필요하시면 개인정보침해신고센터(privacy.kisa.or.kr,
            국번 없이 118), 개인정보 분쟁조정위원회(kopico.go.kr, 1833-6972)에 문의하실 수 있습니다.
          </p>
        </Section>

        <Section title="10. 방침의 변경">
          <p>
            법령이나 서비스 내용의 변경에 따라 이 방침이 수정될 수 있습니다. 변경되는 경우 시행일과
            변경 내용을 이 페이지에 게시합니다.
          </p>
        </Section>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-extrabold tracking-tight text-[#1B3A6B]">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-[#57534E]">{children}</div>
    </section>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-[#B45309] underline"
    >
      {children}
    </a>
  );
}
