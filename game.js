/* ============================================================
   동물 마을 키우기 — Phase 1
   클릭 → 돈 획득 → 클릭 업그레이드 → 메인 캐릭터 Stage 발전

   이후 Phase(직원/테마/저장/방치/배속)를 쉽게 얹을 수 있도록
   데이터(CONFIG)와 로직(state, 함수)을 분리해서 관리한다.
   ============================================================ */

/* ---------------------------------------------------------
   1. 게임 설정 데이터 (밸런스는 여기서만 수정)
   --------------------------------------------------------- */
const CONFIG = {
  // 최종 목표 금액
  // ※ 밸런스 8차 재조정 (피버타임 추가): 피버타임 도입으로 클릭/직원 수익이 평균적으로
  //   최대 약 60~70% 더 빨라져서, 기존 목표금액(1000억)을 그대로 두면 전체 플레이 시간이
  //   눈에 띄게 짧아진다 — 실제로 그리디(최적 ROI) 구매 시뮬레이션을 돌려보니 기존
  //   1000억 기준 목표 달성 시간이 피버타임 도입만으로 약 2/3로 줄어드는 것을 확인했다.
  //   목표금액을 3.6배(1000억→3600억)로 올려서 같은 시뮬레이션으로 재검증한 결과, 피버타임을
  //   포함해도 전체 플레이 시간이 기존과 거의 같은 수준으로 돌아오는 것을 확인했다(클릭
  //   레벨상한/직원 만렙도 함께 소폭 올려서, 그 늘어난 목표금액을 채우는 동안 레벨업 거리가
  //   너무 일찍 바닥나 "더 강화할 게 없는" 지루한 구간이 생기지 않게 했다 — click.maxLevel,
  //   villagerMaxLevelBase/ByIndex 주석 참고).
  goalMoney: 360000000000,

  // "인생한방": 캐릭터2 모드 + Stage 5(최종 단계)일 때만 나타나는 도박성 이벤트.
  // 참가비를 내고 70% 확률로 (성공) 지금 가진 돈이 3배로 불어나거나, 30% 확률로 (실패) 목표
  // 금액이 2배로 불어난다. 실패할 때마다 다음 참가비도 함께 2배로 뛰어서 점점 더 위험해지는 구조.
  // ※ 밸런스 8차 재조정: 목표금액을 3.6배로 올린 것과 같은 비율로 참가비도 3.6배 올려서,
  //   "참가비가 목표금액의 약 1%" 비율을 그대로 유지했다.
  fightChallenge: {
    baseCost: 3600000000, // 첫 참가비 36억원
    costMultiplierOnFail: 2, // 실패할 때마다 다음 참가비도 2배
    successChance: 0.7, // 성공 확률 70%
    successMoneyMultiplier: 3, // 성공 시 지금 가진 돈이 이 배수만큼 불어난다
    failGoalMultiplier: 2, // 실패 시 목표 금액이 이 배수만큼 불어난다
  },

  // 클릭 업그레이드: 레벨별 클릭 수익과 다음 레벨 비용을 공식으로 계산
  // ※ 재조정 (기존 22% 성장률은 레벨150(Stage5)에서 클릭당 7조원까지 폭주하는 심각한 밸런스
  //   붕괴가 있었다 — 실제 시뮬레이션으로 레벨별 클릭수익을 전수 검증해서 발견/수정했다.
  //   성장률을 10%로 낮추고, 그 대신 레벨 자체가 훨씬 많이 필요하도록(문턱값 재계산) 바꿔서
  //   "레벨은 많이 올라가지만 각 레벨의 수익 폭증은 완만한" 구조로 다시 잡았다.
  //   Lv100 클릭수익 약 1.3만원, Lv150 약 150만원 수준으로 확인.)
  // ※ 밸런스 4차 재조정 (버그: 저레벨 구간에서 수익이 "level" 하한선 덕분에 사실상 레벨만큼
  //   강제로 붙는데, 비용(getUpgradeCost)에는 그런 하한선이 없어서 순수 지수값 그대로였다 —
  //   예: Lv10에서 수익은 하한선(10원) 적용인데 다음 비용은 24원으로, 초반 수익 대비 비용이
  //   지나치게 저렴해 "버는 건 느는데 비용은 찔끔"으로 체감되는 원인이었다. 비용에도 동일한
  //   방식의 레벨 하한선(costMinPerLevel)을 추가해서, 하한선이 걸리는 구간이든 아니든 항상
  //   "비용 ≈ 수익의 8~10배" 비율이 유지되도록 고쳤다.)
  // ※ 밸런스 5차 재조정 (버그: 클릭/직원/도박을 최적 순서로 플레이하는 시뮬레이션을 실제로 끝까지
  //   돌려보니, "목표금액 도달 ≈ 68분" 설계 의도와 다르게 클릭 업그레이드만으로 5분 만에 최종
  //   스테이지(Lv150)까지 뚫려버리고, 게임 전체도 15분 만에 끝나버렸다. 4차 조정에서 클릭 비용에
  //   하한선을 추가하며 "비용/수익 비율"만 맞추고 "레벨업 절대 속도"는 재검증하지 못했던 게 원인 —
  //   costGrowth(1.10)가 여전히 낮아서 레벨이 순식간에 수백까지 올라가며 수익이 지수적으로 폭주했다.
  //   → click.costGrowth를 1.115로 올려서(레벨당 비용 상승폭을 키움), 같은 시뮬레이션(초당 5클릭
  //     가정)으로 재검증한 결과 "목표금액 도달 ≈ 66분"으로 원래 설계 의도에 다시 맞춘 것을 확인했다.
  // ※ 밸런스 6차 재조정 (버그: 직원 강화에는 만렙(villagerMaxLevelByIndex)이 있는데 클릭 레벨에는
  //   상한이 없어서, 오래 플레이하거나 방치할수록 클릭당 수익이 조·경 단위를 넘어 이론상 무한대로
  //   커질 수 있었다 — 화면 표시 단위(만/억/조/경)로는 도저히 감당이 안 되는 규모. 직원과 똑같이
  //   "만렙" 개념을 클릭에도 도입해서 maxLevel(150 = 최종 스테이지 진입 레벨)에서 더 이상 못
  //   올라가게 막았다. maxLevel 150으로 캡을 걸고도 최적 플레이 시뮬레이션으로 재검증한 결과
  //   79분 만에 목표금액 도달에 성공해서, 엔딩을 보는 데는 지장이 없는 것도 확인했다.)
  click: {
    baseIncome: 1,        // Lv.1 클릭당 수익
    incomeGrowth: 1.10,    // 레벨당 수익 증가 배율
    baseCost: 10,          // Lv.1 → Lv.2 업그레이드 비용
    costGrowth: 1.115,     // 레벨당 비용 증가 배율 (밸런스 5차: 1.10 -> 1.115로 상향, 레벨업 폭주 방지)
    costMinPerLevel: 8,    // 비용도 레벨당 최소 이만큼씩은 오르도록 하는 하한선 기울기 (수익 하한선과 짝을 맞춤)
    // ※ 밸런스 8차 재조정 (피버타임 추가로 목표금액이 3.6배로 늘어난 것과 짝을 맞춤): 150(=Stage5
    //   진입 레벨) 그대로면 Stage5에 들어가자마자 클릭 강화가 바로 만렙이 되어 버려서, 늘어난
    //   목표금액을 채우는 나머지 시간 동안 클릭 강화로는 더 할 게 없어진다. 160으로 10레벨
    //   늘려서 Stage5 안에서도 당분간 강화를 계속할 수 있게 했다(Stage 전환 문턱값 자체는
    //   그대로 — 최종 스테이지 진입 시점을 바꾸는 게 아니라 그 안에서의 여유만 늘리는 것).
    maxLevel: 160,
  },

  // 메인 캐릭터 Stage 전환 레벨 (클릭 레벨이 이 값에 도달하면 배경/캐릭터 변화)
  // 새 클릭 성장률(1.10) 기준으로 재계산: 첫 직원(500원)을 살 수 있는 시점이 약 213클릭(레벨43)이라,
  // Stage2 전환이 그보다 확실히 늦게 오도록 재조정했다.
  stageThresholds: [1, 50, 80, 110, 150], // Stage 1~5 시작 레벨

  // 배속 설정: ×1은 기본, ×2/×3은 해금 조건을 만족해야 선택 가능
  // 해금 조건은 checkUnlocked(state)가 매번 계산 — 저장값이 아니라 항상 현재 상태 기준으로 판단한다.
  // 화면 우측 최상단 배속 버튼(#speed-toggle-btn)을 누를 때마다 ×1→×2→×3→×1 순으로 순환하고,
  // 다음 배속이 잠겨 있으면 lockHint를 안내 팝업(#speed-lock-modal)에 그대로 띄운다(handleSpeedToggle 참고).
  speeds: [
    { value: 1, label: "×1", checkUnlocked: () => true },
    { value: 2, label: "×2", checkUnlocked: (s) => CONFIG.villagers.every((v) => s.villagers[v.id]?.hired),
      lockHint: "모든 직원을 고용하면 열려요." },
    { value: 3, label: "×3", checkUnlocked: (s) => CONFIG.villagers.every((v) => (s.villagers[v.id]?.level ?? 1) >= 15),
      lockHint: "모든 직원을 Lv.15까지 강화하면 열려요." },
  ],

  // 저장 슬롯 개수 (기획서: 정확히 3개)
  saveSlotCount: 3,

  // 피버타임: 클릭을 일정 횟수 모으면 일정 시간 동안 클릭/직원 수익이 전부 n배가 되는 이벤트.
  // "메인 캐릭터 강화" 탭에서 별도로 강화할 수 있고(강화할수록 배수·지속시간이 함께 늘어남),
  // 실제 배수 계산은 getFeverMultiplier/getFeverDuration이 레벨 사이를 선형보간한다.
  // - clicksRequired(200클릭)는 "초당 5클릭" 기준 약 40초에 한 번 발동하는 빈도로 잡았다 —
  //   너무 자주 터지면 상시 배수처럼 느껴져서 "특별한 이벤트" 느낌이 사라지고, 너무 뜸하면
  //   존재감이 없어서 실제 여러 배수/지속시간 조합으로 시뮬레이션해보고 고른 값이다.
  // - 배수는 최소 1.5배(Lv.1) ~ 최대 3배(Lv.5 만렙), 지속시간은 8초 ~ 30초로 늘어난다.
  //   지속시간·배수 둘 다 상한이 뚜렷한 값이라, 만렙을 굳이 10단계 이상 잘게 쪼갤 필요가
  //   없다고 판단해 5단계로 줄였다 — 대신 한 레벨의 체감 상승폭은 더 커진다.
  // - 처음엔 Lv.0(피버타임 자체가 없는 상태)에서 시작하고, 강화를 한 번도 안 하면 클릭을
  //   아무리 모아도 피버타임이 아예 발동하지 않는다 — "강화해야만 존재하는 기능"으로 설계했다
  //   (state.feverLevel 참고). Lv.0→Lv.1(해금)에 baseUpgradeCost가 그대로 들어간다.
  // - 만렙(Lv.5)까지 다 강화하면 피버타임 중엔 평균 실효 수익이 상시 약 2배 안팎까지
  //   올라가는 걸 확인했다(피버타임 유지 비율 × (배수-1)) — 그만큼을 goalMoney 상향(위 참고)으로
  //   상쇄했다.
  fever: {
    clicksRequired: 200,      // 피버타임 발동에 필요한 누적 클릭 수 (피버타임 중엔 카운트 정지, Lv.0이면 아예 안 쌓임)
    maxLevel: 5,              // 피버타임 강화 만렙
    baseDuration: 8,          // Lv.1 지속시간(초)
    maxDuration: 30,          // 만렙 지속시간(초)
    baseMultiplier: 1.5,      // Lv.1 배수
    maxMultiplier: 3,         // 만렙 배수
    baseUpgradeCost: 500000,  // Lv.0→1(해금) 강화 비용
    upgradeCostGrowth: 2.2,   // 레벨당 강화 비용 증가 배율
    helperCount: 4,           // 피버타임 중 메인 캐릭터 옆에 나타나는 직원 수 (좌우 2명씩)
  },

  // 도박(돌림판) 설정
  // ※ 밸런스 5차 재조정 (버그: 기존 weight 조합의 배수 기댓값을 실제로 계산해보니 1.134
  //   (=113.4% 회수율)로, 스핀할 때마다 평균적으로 참가비의 13.4%를 순수 이득으로 얻는 구조였다.
  //   이러면 "그냥 도박만 계속 돌리는 게 클릭/직원 관리보다 압도적으로 유리"해져 버려서, 다른
  //   모든 밸런스 조정이 무의미해지는 심각한 문제였다. 실제 슬롯머신류 확률형 게임의 회수율
  //   (통상 90~97%, 기댓값<1)을 참고해서, 배수 라인업(×0.2~×5)은 그대로 두고 저배수(0.7/0.5/0.4)
  //   weight를 늘리고 고배수(2/3) weight를 줄여 기댓값을 0.959(회수율 95.9%)로 낮췄다 — "가끔 크게
  //   따는 손맛"은 남기되, 장기적으로는 하는 만큼 손해가 나서 다른 수익 수단을 대체하지 못하게 했다.
  gamble: {
    // 베팅 금액 선택지 — 도박 탭에서 화살표(또는 스크롤)로 한 단계씩 오르내리며 고른다
    // (getGambleBetAmount/handleGambleBetStep 참고). 아래 배수(segments)는 베팅 금액과 무관하게
    // 항상 같은 비율로 적용되므로(reward = bet * multiplier), 베팅을 올려도 확률/기대수익률
    // 자체는 그대로 유지되고 액수만 커진다 — 위에서 검증한 회수율 95.9%가 모든 베팅 단계에 동일하게 적용된다.
    betOptions: [10000, 100000, 1000000, 10000000, 100000000, 1000000000], // 1만/10만/100만/1000만/1억/10억
    defaultBetIndex: 0, // 처음엔 가장 작은 금액(1만원)부터 시작

    // 돌림판 배수 구간 (×0.2 ~ ×5). weight가 클수록 잘 나옴. (총합 1000 기준으로
    // "캐릭터2" 확률을 0.5%까지 정밀하게 표현한다.)
    // 1배 / 0.7배를 가장 두텁게, 최저 확률(0.5%, "캐릭터2")에 특수 이벤트를 건다.
    // 캐릭터2는 돈을 잃거나 얻지 않고(배수 적용 없이 참가비 그대로 돌려줌), 캐릭터만 전환된다.
    segments: [
      { multiplier: 1,    weight: 280, label: "×1" },
      { multiplier: 0.7,  weight: 260, label: "×0.7" },
      { multiplier: 1.5,  weight: 110, label: "×1.5" },
      { multiplier: 0.5,  weight: 180, label: "×0.5" },
      { multiplier: 2,    weight: 60,  label: "×2" },
      { multiplier: 0.4,  weight: 80,  label: "×0.4" },
      { multiplier: 3,    weight: 20,  label: "×3" },
      { multiplier: 5,    weight: 5,   label: "×5" },
      { multiplier: 1,    weight: 5,   label: "???", isJackpotBad: true }, // 최저 확률(0.5%): 당첨 시 캐릭터가 "캐릭터2 모드"로 전환, 돈은 그대로(원금 반환)
    ],
  },

  // 직원 확인 화면의 5개 테마 (Phase 4에서 각 테마에 직원 3명씩 채울 예정)
  themes: [
    { id: "forest", icon: "🌳", name: "테마1" },
    { id: "farm",   icon: "🥕", name: "테마2" },
    { id: "sea",    icon: "🐟", name: "테마3" },
    { id: "mine",   icon: "⛏️", name: "테마4" },
    { id: "star",   icon: "⭐", name: "테마5" },
  ],

  // 직원 데이터 (Phase 4: 5개 테마 × 3명 = 15명 전체)
  // 테마 안에서 3단계(입문/중급/고급)로, 테마 사이에서도 점점 비싸지도록 설계했다.
  //
  // ※ 밸런스 재설계 2차 (핵심 문제: 유니콘 만렙까지 총비용이 596억원으로 목표금액 178억원의
  //   3.3배를 넘어서, 사실상 유니콘을 만렙까지 강화하는 게 불가능한 설계였다 — 실제로
  //   getVillagerUpgradeCost를 레벨1~30까지 전부 합산해서 검증하다가 발견했다.)
  //   → 고용비/수익 성장률을 2.0배로 낮추고(이전 2.4배/2.38배), 강화 초기비용도 고용비의
  //     0.9배로 낮춰서, 유니콘 혼자 만렙까지 가는 총비용이 목표금액의 약 10.7%(19억원대)로
  //     충분히 감당 가능한 수준이 되도록 다시 계산했다. 15명 전체 총비용도 목표금액의
  //     21.5%뿐이라, 강화/고용에 다 쓰고도 자동생산만으로 목표금액을 채울 시간이 충분하다.
  //   - 고용비/수익 모두 티어당 2.0배 상승 (첫 직원 500원 → 마지막 유니콘 819만원대)
  //   - 강화(레벨)는 최대 30까지, 레벨당 수익/비용이 13%씩 상승
  //   - "15명 전원 고용+만렙 도달 ≈ 61분, 목표금액 도달 ≈ 68분"이 되도록 시뮬레이션으로 재검증했다.
  //   - 표시 끝자리가 지저분해지지 않도록 고용비/강화비는 10원~1만원 단위로 반올림했다
  //     (10,000원 미만: 10원 단위 / 100만원 미만: 100원 단위 / 1억원 미만: 1000원 단위 / 그 이상: 1만원 단위)
  //
  // ※ 밸런스 3차 재조정: 쿠키클리커의 실제 공개 수치(첫 건물 "커서"는 초당 0.1개, 클릭 1회가
  //   1개인 것과 비교하면 첫 건물 생산량이 클릭 수익보다도 작다 — 그리고 건물 등급마다 기본
  //   생산량이 대략 5~10배씩 뛴다)를 다시 참고해서 확인해보니, 이전 버전은 토끼(첫 직원)가
  //   초당 5원으로 클릭 레벨1 수익(1원)보다 더 컸다. 첫 직원은 "클릭 수익과 비슷하거나 낮게"
  //   시작해야 한다는 원칙에 맞게 초당 1원으로 낮추고, 티어당 배율도 수익 2.5배/고용비 2.2배로
  //   재조정했다. 유니콘 만렙까지 총비용도 목표금액의 5.65%로 넉넉하게 유지된다.
  //
  // ※ 밸런스 4차 재조정 (버그: "다람쥐를 왜 사니" 문제 — 토끼를 고용 후 딱 1레벨만 강화해도
  //   (500원+450원=950원) 다람쥐 생고용(1100원)과 똑같이 초당 2원이 나와서, 새 직원을 사는
  //   의미가 사라졌었다. 원인은 baseUpgradeCost가 hireCost의 0.9배로 너무 싸고, upgradeCostGrowth(1.13)도
  //   낮아서 "강화 1회의 비용 대비 수익증가 효율"이 "다음 티어 고용의 효율"보다 항상 더 좋았기 때문.
  //   → baseUpgradeCost를 hireCost의 2.0배로, upgradeCostGrowth를 1.15로 올려서, 강화를 시작하는
  //     순간부터는 항상 다음 티어를 고용하는 쪽이 돈 대비 효율이 더 좋도록 재계산했다(단, 강화 자체가
  //     쓸모없어지진 않게 — 새 직원을 살 돈이 모이기 전까지 쓰는 "보조 수단"으로는 여전히 매력적이다).
  //   15명 전체 총비용도 다시 검증해서 목표금액의 30.6%로, 자동생산 시간을 충분히 남기는 수준을 유지했다.
  //
  // ※ 밸런스 5차 재조정 (버그: 클릭/직원/도박을 최적 순서로 플레이하는 시뮬레이션을 실제로 끝까지
  //   돌려보니, "목표금액 도달 ≈ 68분" 설계 의도와 다르게 클릭 업그레이드만으로 5분 만에 최종
  //   스테이지(Lv150)까지 뚫려버리고, 게임 전체도 15분 만에 끝나버렸다. 4차 조정에서 클릭 비용에
  //   하한선을 추가하며 "비용/수익 비율"만 맞추고 "레벨업 절대 속도"는 재검증하지 못했던 게 원인 —
  //   costGrowth(1.10)가 여전히 낮아서 레벨이 순식간에 수백까지 올라가며 수익이 지수적으로 폭주했다.
  //   → click.costGrowth를 1.115로 올려서(레벨당 비용 상승폭을 키움), 같은 시뮬레이션(초당 5클릭
  //     가정)으로 재검증한 결과 "목표금액 도달 ≈ 66분"으로 원래 설계 의도에 다시 맞춘 것을 확인했다.
  // 이름/이모지는 임시로 붙여둔 것이라 나중에 쉽게 바꿀 수 있다.
  // 이미지 경로도 데이터로만 들고 있고, 실제 에셋이 준비되면 이 값만 교체하면 된다.
  // ※ 밸런스 8차 재조정 (피버타임 추가로 목표금액이 3.6배로 늘어난 것과 짝을 맞춤): 기존
  //   값에서 소폭 늘리되, 만렙 숫자 자체가 "35, 30, 25, 20"처럼 5 단위로 딱 떨어지도록
  //   4단계 티어로 다시 묶었다(villagerMaxLevelByIndex 참고) — 숫자가 깔끔해야 화면에서
  //   봤을 때도 "이 직원은 이 정도가 만렙이구나"가 한눈에 들어온다.
  villagerMaxLevelBase: 35, // 직원 강화 최대 레벨의 "기준값"(첫 직원 토끼 기준). 인생한방 도전 실패로 목표 금액이 늘어날 때마다 이 값도 함께 늘어난다(getVillagerMaxLevel 참고)
  villagerMaxLevelPerFail: 10, // 인생한방 도전 실패 1회당 상한이 늘어나는 레벨 수

  // ※ 밸런스 7차 재조정: "모든 직원이 꼭 1초당 얻는 방식이어야 하는 건 아니다"는 요청에 따라,
  //   AdVenture Capitalist 같은 실제 방치형 게임을 참고해서 도입한 생산 주기 시스템. baseIncome
  //   (1회 지급액)은 그대로 유지하고, 대신 "몇 초에 한 번 지급되는지"를 직원별 baseInterval로
  //   따로 관리한다(getVillagerInterval 참고) — 즉 초반 직원(토끼)은 "8초당 1원"처럼 느리게
  //   시작해서 레벨이 오를수록 주기가 villagerIntervalDecay 배율로 점점 짧아지고,
  //   villagerMinInterval(1초) 밑으로는 아무리 강화해도 더 짧아지지 않는다. 후반 직원(여우,
  //   유니콘)은 티어 자체가 높아서 baseInterval을 처음부터 1초로 잡아, 이미 "매초 지급"으로
  //   시작한다. 소수점 지급액(0.2원 등)은 쓰지 않고 항상 정수만 지급한다.
  //   전체 최적 플레이 시뮬레이션으로 재검증한 결과 66.9분으로, 도입 전(65.9분)과 거의
  //   동일한 진행 속도가 유지되는 것을 확인했다(초반 방치 체감은 확실히 달라지지만, 클릭과
  //   강화를 병행하는 정상 플레이에서는 주기가 금방 짧아져 전체 소요 시간에 큰 영향이 없다).
  villagerIntervalDecay: 0.90, // 레벨업 1회당 주기가 줄어드는 배율 (10%씩 단축)
  villagerMinInterval: 1, // 주기가 아무리 짧아져도 이 값(초) 밑으로는 내려가지 않는다

  // 직원마다 기본 레벨 상한이 다르다 — 후반 직원일수록 상한이 낮아져서(첫 토끼 30 → 마지막
  // 유니콘 15) 만렙까지 강화하는 부담이 점점 줄어드는 구조. villagers 배열 순서와 1:1로 대응한다.
  // (인생한방 도전 실패 시 늘어나는 보너스는 모든 직원에게 동일하게 +10씩 적용된다.)
  // 5단계씩 딱 떨어지는 4개 티어(35 → 30 → 25 → 20)로 묶었다: 첫 직원(35) → 다음 5명(30)
  // → 다음 4명(25) → 마지막 5명(20). 인생한방 도전 실패 보너스(villagerMaxLevelPerFail)도
  // 이미 5의 배수(10)라 실패해서 상한이 늘어나도 항상 5의 배수로 유지된다.
  villagerMaxLevelByIndex: [35, 30, 30, 30, 30, 30, 25, 25, 25, 25, 20, 20, 20, 20, 20],

  // 직원별 캐릭터 모션(아직 미정이라 비워두고, 나중에 정해지면 여기만 채우면 된다).
  // 값은 CSS 클래스 이름(예: "motion-bounce", "motion-sway", "motion-float")을 넣으면
  // buildVillagerDom()이 자동으로 .villager-emoji / .villager-character-img에 붙여준다.
  // 지정 안 된 직원은 모션 없이 정지 상태로 표시된다.
  villagerMotions: {
    // forest_01: "motion-bounce",
    // sea_01: "motion-sway",
  },

  // 업적(도전과제) 15개. 순서는 실제 플레이 진행 순서를 대략 따른다.
  // check(state)가 true를 반환하면 달성. 한 번 달성되면 다시 잠기지 않는다(state.achievements에 기록).
  // gambleWinInfo, debtorEncountered 등은 도박 결과가 나올 때마다 state에 기록해두는 값이다(아래 참고).
  achievements: [
    { id: "first_money", name: "첫 발걸음", desc: "처음으로 돈을 벌었어요", icon: "🐣",
      // s.lifetimeMoneyEarned는 실제로 어디서도 정의/갱신되지 않는 필드였다(참조만 하고 항상
      // undefined) — money > 0 조건만으로 이미 정확히 판정되니 죽은 조건을 정리했다.
      check: (s) => s.money > 0 },
    { id: "click_lv10", name: "손가락 워밍업", desc: "클릭 레벨 10 달성", icon: "👆",
      check: (s) => s.clickLevel >= 10 },
    { id: "first_hire", name: "첫 동료", desc: "첫 직원을 고용했어요", icon: "🏘️",
      check: (s) => CONFIG.villagers.some((v) => s.villagers[v.id]?.hired) },
    { id: "first_gamble", name: "한 번 해볼까?", desc: "도박을 처음 해봤어요", icon: "🎰",
      check: (s) => s.gambleSpinCount > 0 },
    { id: "forest_complete", name: "숲의 주인", desc: "나무 테마 직원 3명 모두 고용", icon: "🌳",
      check: (s) => isThemeFullyHired("forest") },
    { id: "gamble_win_x3", name: "대박!", desc: "도박에서 ×3 이상 배수 당첨", icon: "💰",
      check: (s) => s.bestGambleMultiplier >= 3 },
    { id: "farm_complete", name: "농장 경영자", desc: "당근 테마 직원 3명 모두 고용", icon: "🥕",
      check: (s) => isThemeFullyHired("farm") },
    { id: "debtor_encounter", name: "캐릭터2와의 조우", desc: "도박에서 최저확률에 당첨됐어요", icon: "👻",
      check: (s) => s.debtorEncountered },
    { id: "villager_lv30", name: "전문가", desc: "직원 1명을 만렙까지 강화", icon: "⭐",
      // ※ 버그 수정: 원래는 level >= villagerMaxLevelBase(고정값 30)로 체크했는데, 실제로는
      // 직원마다 만렙이 다 다르다(토끼 30 ~ 유니콘 15, villagerMaxLevelByIndex 참고) — 그래서
      // 토끼를 제외한 14명은 만렙을 찍어도 이 업적을 절대 딸 수 없는 상태였다. "직원 1명을
      // 만렙까지 강화"라는 설명 그대로, 각 직원의 실제 만렙(getVillagerMaxLevel)에 도달했는지로
      // 체크하도록 고쳤다.
      check: (s) => CONFIG.villagers.some((v) => (s.villagers[v.id]?.level ?? 1) >= getVillagerMaxLevel(v.id)) },
    { id: "sea_complete", name: "바다 탐험가", desc: "물고기 테마 직원 3명 모두 고용", icon: "🐟",
      check: (s) => isThemeFullyHired("sea") },
    { id: "speed_x2", name: "가속 개시", desc: "배속 ×2를 해금했어요", icon: "⚡",
      check: (s) => getUnlockedSpeeds().includes(2) },
    { id: "mine_complete", name: "광부의 자부심", desc: "광산 테마 직원 3명 모두 고용", icon: "⛏️",
      check: (s) => isThemeFullyHired("mine") },
    { id: "speed_x3", name: "초가속", desc: "배속 ×3을 해금했어요", icon: "🚀",
      check: (s) => getUnlockedSpeeds().includes(3) },
    { id: "all_hired", name: "마을 완성", desc: "15명 직원을 모두 고용했어요", icon: "🏆",
      check: (s) => CONFIG.villagers.every((v) => s.villagers[v.id]?.hired) },
    { id: "goal_complete", name: "목표 달성", desc: "목표 금액을 모두 모았어요", icon: "👑",
      check: (s) => s.money >= s.goalMoney },
  ],

  villagers: [
    // 🌳 나무 테마
    { id: "forest_01", name: "직원1",   emoji: "🐰",  theme: "forest",
      hireCost: 500,      baseIncome: 1,      incomeGrowth: 1.13, baseUpgradeCost: 1000,      upgradeCostGrowth: 1.15, baseInterval: 8 },
    { id: "forest_02", name: "직원2", emoji: "🐿️", theme: "forest",
      hireCost: 1100,     baseIncome: 2,      incomeGrowth: 1.13, baseUpgradeCost: 2200,      upgradeCostGrowth: 1.15, baseInterval: 7 },
    { id: "forest_03", name: "직원3",   emoji: "🦌",  theme: "forest",
      hireCost: 2420,     baseIncome: 6,      incomeGrowth: 1.13, baseUpgradeCost: 4840,      upgradeCostGrowth: 1.15, baseInterval: 6 },

    // 🥕 당근 테마
    { id: "farm_01", name: "직원4", emoji: "🐤", theme: "farm",
      hireCost: 5320,     baseIncome: 16,     incomeGrowth: 1.13, baseUpgradeCost: 10640,     upgradeCostGrowth: 1.15, baseInterval: 6 },
    { id: "farm_02", name: "직원5",   emoji: "🐷", theme: "farm",
      hireCost: 11700,    baseIncome: 39,     incomeGrowth: 1.13, baseUpgradeCost: 23400,     upgradeCostGrowth: 1.15, baseInterval: 5 },
    { id: "farm_03", name: "직원6",     emoji: "🐑", theme: "farm",
      hireCost: 25800,    baseIncome: 98,     incomeGrowth: 1.13, baseUpgradeCost: 51600,     upgradeCostGrowth: 1.15, baseInterval: 5 },

    // 🐟 물고기 테마
    { id: "sea_01", name: "직원7", emoji: "🐟", theme: "sea",
      hireCost: 56700,    baseIncome: 244,    incomeGrowth: 1.13, baseUpgradeCost: 113400,    upgradeCostGrowth: 1.15, baseInterval: 4 },
    { id: "sea_02", name: "직원8",   emoji: "🐙", theme: "sea",
      hireCost: 124700,   baseIncome: 610,    incomeGrowth: 1.13, baseUpgradeCost: 249400,    upgradeCostGrowth: 1.15, baseInterval: 4 },
    { id: "sea_03", name: "직원9", emoji: "🐢", theme: "sea",
      hireCost: 274400,   baseIncome: 1526,   incomeGrowth: 1.13, baseUpgradeCost: 548800,    upgradeCostGrowth: 1.15, baseInterval: 3 },

    // ⛏️ 광산 테마
    { id: "mine_01", name: "직원10", emoji: "🐹", theme: "mine", // 🦫(비버)는 비교적 최신 이모지라 기기별로 깨져 보여서 오래되고 지원 잘 되는 이모지로 교체
      hireCost: 603600,   baseIncome: 3815,   incomeGrowth: 1.13, baseUpgradeCost: 1207200,   upgradeCostGrowth: 1.15, baseInterval: 3 },
    { id: "mine_02", name: "직원11",     emoji: "🐻", theme: "mine",
      hireCost: 1328000,  baseIncome: 9537,   incomeGrowth: 1.13, baseUpgradeCost: 2656000,   upgradeCostGrowth: 1.15, baseInterval: 2 },
    { id: "mine_03", name: "직원12", emoji: "👺", theme: "mine",
      hireCost: 2922000,  baseIncome: 23842,  incomeGrowth: 1.13, baseUpgradeCost: 5844000,   upgradeCostGrowth: 1.15, baseInterval: 2 },

    // ⭐ 별 테마
    { id: "star_01", name: "직원13",  emoji: "🦉", theme: "star",
      hireCost: 6428000,  baseIncome: 59605,  incomeGrowth: 1.13, baseUpgradeCost: 12856000,  upgradeCostGrowth: 1.15, baseInterval: 2 },
    { id: "star_02", name: "직원14",    emoji: "🦊", theme: "star",
      hireCost: 14141000, baseIncome: 149012, incomeGrowth: 1.13, baseUpgradeCost: 28282000,  upgradeCostGrowth: 1.15, baseInterval: 1 },
    { id: "star_03", name: "직원15",  emoji: "🦄", theme: "star",
      hireCost: 31109000, baseIncome: 372529, incomeGrowth: 1.13, baseUpgradeCost: 62218000,  upgradeCostGrowth: 1.15, baseInterval: 1 },
  ],
};

/* ---------------------------------------------------------
   2. 게임 상태 (저장/불러오기 대상이 될 데이터)
   --------------------------------------------------------- */
const state = {
  money: 0,
  clickLevel: 1,
  isDebtorMode: false, // true면 메인 캐릭터가 "캐릭터2" 모습, 목표 라벨도 전환됨
  isSpinning: false,
  gambleBetIndex: CONFIG.gamble.defaultBetIndex, // 도박 베팅 금액 단계 (CONFIG.gamble.betOptions의 인덱스)
  currentTheme: "forest", // 직원 확인 화면에 처음 진입 시 자동 선택되는 테마
  speedLevel: 1, // 현재 선택된 배속 (1/2/3)
  hasSeenVictory: false, // 목표 금액 달성 축하 모달을 한 번 봤는지 (계속하기 후 매번 다시 뜨지 않도록)

  // 업적 판정에 쓰이는 값들
  achievements: {}, // achievementId → true (달성된 것만 기록)
  gambleSpinCount: 0, // 도박 총 스핀 횟수
  bestGambleMultiplier: 0, // 도박에서 뽑은 배수 중 최댓값
  debtorEncountered: false, // 캐릭터2 모드에 한 번이라도 진입한 적 있는지 (관리자 모드로 진입해도 인정)

  // "인생한방" 관련 상태. goalMoney는 CONFIG의 고정값이 아니라 여기서 관리하는 가변값이다
  // (실패해서 목표 금액이 2배가 되면 이 값 자체가 늘어난다). fightChallengeFailCount만큼 다음 참가비도 커진다.
  goalMoney: CONFIG.goalMoney,
  fightChallengeFailCount: 0, // 인생한방 도전 실패 횟수 (참가비 계산에 쓰임)

  // 피버타임 관련 상태. feverLevel/feverSelectedHelpers는 저장 대상(serializeState 참고),
  // 나머지(feverClickCount/feverActive/feverRemainingSec/feverHelperIds)는 villagerIncomeTimers와
  // 같은 이유로 런타임 전용이다 — 게임을 다시 켰을 때 0부터 다시 모으는 게 자연스럽다.
  feverLevel: 0, // 피버타임 강화 레벨 (배수·지속시간 결정). 0이면 아직 해금 전이라 피버타임 자체가 없다
  feverSelectedHelpers: [], // 설정에서 직접 고른 "피버타임 도우미" 직원 id들 (최대 CONFIG.fever.helperCount명)
  feverClickCount: 0, // 피버타임 발동까지 모은 클릭 수 (피버타임 중엔 멈춤)
  feverActive: false, // 지금 피버타임이 진행 중인지
  feverRemainingSec: 0, // 피버타임 남은 시간(초)
  feverHelperIds: [], // 지금 메인 캐릭터 옆에 나와 있는 도우미 직원 id들 (최대 4명)

  // 직원별 진행 상태. villagerId → { hired, level }
  // CONFIG.villagers를 기준으로 자동 생성 → 직원을 추가/삭제해도 여기를 따로 손볼 필요 없다.
  villagers: Object.fromEntries(
    CONFIG.villagers.map((v) => [v.id, { hired: false, level: 1 }])
  ),
};

// 직원별 "다음 지급까지 남은 초"를 추적하는 런타임 전용 타이머. 저장/불러오기 대상이 아니다
// (게임을 다시 켰을 때 0부터 다시 세도 방치형 게임에서는 자연스럽고, 저장 파일 구조도 단순하게 유지된다).
const villagerIncomeTimers = Object.fromEntries(CONFIG.villagers.map((v) => [v.id, 0]));

/* ---------------------------------------------------------
   2-1. 커스텀 이미지/이름/애니메이션/말풍선 (게임 진행 저장과는 별개로 관리)
   --------------------------------------------------------- */
// 유저가 직접 설정하는 커스텀 데이터. 게임 진행(state)과는 독립적으로 localStorage에
// 별도 저장한다 — 저장 슬롯을 초기화하거나 바꿔도 커스텀 이미지/이름은 유지되는 게 자연스럽다.
// key: 직원 id 또는 "main"(메인 캐릭터) → { name, emoji, characterImage(dataURL), backgroundImage(dataURL),
//      debtorName/debtorEmoji/debtorImage(캐릭터2 전용, main 엔트리에 함께 저장), motion, bubbleText }
// 설정 화면의 그리드에서는 "main"(캐릭터1)과 "main-debtor"(캐릭터2)를 별도 항목으로 보여주지만,
// 실제 저장은 둘 다 customData["main"]에 들어간다 — getCustomEntry/setCustomField의 "main-debtor" 분기 참고.
const CUSTOM_STORAGE_KEY = "village-clicker-custom-v1";

// 캐릭터1/캐릭터2 기본(커스텀 없을 때) 이모지. 이미지도 없고 커스텀 이모지도 없을 때 최종 폴백으로 쓰인다.
const DEFAULT_MAIN_EMOJI = "🐰";
const DEFAULT_DEBTOR_EMOJI = "👻";

// getDisplayName/getDisplayEmoji/getDisplayCharacterImage 등 직원용 범용 함수를 메인 캐릭터에도
// 그대로 재사용하기 위한 가짜 "villagerData" 객체. id만 있으면 되므로 실제 CONFIG.villagers에는 없다.
const MAIN_CHARACTER = { id: "main", name: "캐릭터1", emoji: DEFAULT_MAIN_EMOJI };
const MAIN_DEBTOR_CHARACTER = { id: "main-debtor", name: "캐릭터2", emoji: DEFAULT_DEBTOR_EMOJI };

// 상단 탭/강화 카드 아이콘의 기본값 — 캐릭터 스프라이트 기본 이모지(🐰/👻)와는 별개로, 원래부터
// "성장 중(🌱)"/"도박 결과(🐟)"를 상징하는 용도라 기본값을 다르게 둔다. 커스텀 이모지를 설정하면
// 이 기본값 대신 그 이모지가 탭/카드에도 그대로 쓰인다(버그 수정: 예전엔 항상 이 기본값 고정이었음).
const TAB_ICON_DEFAULT_NORMAL = "🌱";
const TAB_ICON_DEFAULT_DEBTOR = "🐟";

// Stage 개수(현재 5) — 캐릭터1/캐릭터2의 "레벨(Stage)마다 다른 이미지" 기능이 이 개수만큼
// 업로드 슬롯을 만든다. CONFIG.stageThresholds가 늘어나면 슬롯 수도 자동으로 함께 늘어난다.
const MAIN_STAGE_COUNT = CONFIG.stageThresholds.length;

// "main-debtor"(캐릭터2)는 커스텀 대상 목록에는 "main"(캐릭터1)과 별개 항목으로 보이지만,
// 실제로는 같은 메인 캐릭터의 다른 모습이라 저장은 customData.main 안에 debtor 접두사 필드로 같이 들어간다.
// characterImageStage1~N도 같은 방식으로 debtorImageStage1~N에 매핑한다.
const MAIN_DEBTOR_FIELD_MAP = {
  name: "debtorName",
  emoji: "debtorEmoji",
  characterImage: "debtorImage",
  characterImageStaged: "debtorImageStaged",
};
for (let i = 1; i <= MAIN_STAGE_COUNT; i++) {
  MAIN_DEBTOR_FIELD_MAP[`characterImageStage${i}`] = `debtorImageStage${i}`;
}

const CUSTOM_MOTIONS = [
  { id: "", label: "없음 (정지)" },
  { id: "motion-bounce", label: "통통 튀기" },
  { id: "motion-sway", label: "좌우 흔들기" },
  { id: "motion-float", label: "천천히 떠다니기" },
  { id: "motion-walk", label: "좌우로 걸어다니기" },
  { id: "motion-spin", label: "제자리 회전" },
  { id: "motion-flip", label: "제자리에서 뒤집기" },
  { id: "motion-pulse", label: "커졌다 작아지기" },
  { id: "motion-shake", label: "빠르게 흔들기" },
  { id: "motion-wiggle", label: "꿈틀거리기" },
];

let customData = loadCustomData();

function loadCustomData() {
  try {
    const raw = window.localStorage.getItem(CUSTOM_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveCustomData() {
  try {
    window.localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(customData));
    return true;
  } catch (e) {
    // 용량 초과(이미지가 너무 많거나 큼) 등으로 저장 실패 시 조용히 실패 처리 — 호출부에서 알림 처리
    return false;
  }
}

function getCustomEntry(id) {
  if (id === "main-debtor") {
    const main = customData.main || {};
    const entry = {};
    Object.entries(MAIN_DEBTOR_FIELD_MAP).forEach(([genericField, storedField]) => {
      if (main[storedField] !== undefined) entry[genericField] = main[storedField];
    });
    return entry;
  }
  return customData[id] || {};
}

function setCustomField(id, field, value) {
  const storageId = id === "main-debtor" ? "main" : id;
  const storageField = id === "main-debtor" ? (MAIN_DEBTOR_FIELD_MAP[field] || field) : field;
  if (!customData[storageId]) customData[storageId] = {};
  if (value === "" || value === null || value === undefined) {
    delete customData[storageId][storageField];
    if (Object.keys(customData[storageId]).length === 0) delete customData[storageId];
  } else {
    customData[storageId][storageField] = value;
  }
  return saveCustomData();
}

// 표시용 이름: 커스텀 이름이 있으면 그걸, 없으면 기본 이름
function getDisplayName(villagerData) {
  return getCustomEntry(villagerData.id).name || villagerData.name;
}

// 표시용 캐릭터 이미지: 커스텀 이미지가 있으면 그걸(dataURL), 없으면 기본 경로
function getDisplayCharacterImage(villagerData) {
  return getCustomEntry(villagerData.id).characterImage || villagerData.characterImage;
}

// 표시용 이모지: 커스텀 이모지가 있으면 그걸, 없으면 기본 이모지.
// 캐릭터 이미지를 등록해도 이름표(.villager-name-badge) 등에는 여전히 "동물 이모지"가 남기 쉬우므로,
// 이모지 자체도 별도로 바꿀 수 있게 한다.
function getDisplayEmoji(villagerData) {
  return getCustomEntry(villagerData.id).emoji || villagerData.emoji;
}

// 표시용 배경 이미지
function getDisplayBackgroundImage(villagerData) {
  return getCustomEntry(villagerData.id).backgroundImage || villagerData.backgroundImage;
}

// 표시용 모션 클래스: 커스텀 설정이 있으면(빈 문자열 포함) 그걸, 없으면 CONFIG 기본값
function getDisplayMotion(id) {
  const custom = getCustomEntry(id);
  if (custom.motion !== undefined) return custom.motion;
  return CONFIG.villagerMotions[id] || "";
}

// 커스텀 말풍선 문구 목록 (한 줄에 하나씩 입력) — showVillagerSpeechBubble에서 랜덤으로 하나 골라 쓴다.
function getCustomBubbleLines(id) {
  const custom = getCustomEntry(id);
  if (!custom.bubbleText) return [];
  return custom.bubbleText.split("\n").map((s) => s.trim()).filter(Boolean);
}

// 테마(나무/당근/물고기/광산/별)를 분류하는 아이콘도 커스텀 가능하다.
// 커스텀 데이터의 key는 "theme-<themeId>"로 관리해서 직원/메인 캐릭터 id와 겹치지 않게 한다.
// (편집 모달의 이모지 입력란은 직원과 동일하게 "emoji" 필드를 쓴다 — 필드명을 통일해서 헷갈리지 않게.)
function getDisplayThemeIcon(theme) {
  return getCustomEntry(`theme-${theme.id}`).emoji || theme.icon;
}

/* ---------------------------------------------------------
   3. 계산 유틸
   --------------------------------------------------------- */

// 클릭 레벨 → 클릭당 수익
// ceil만으로는 저레벨 구간(성장률이 낮을 때)에서 값이 여러 레벨째 정체될 수 있어,
// "레벨 하한선(최소 level원)"을 같이 둬서 모든 레벨에서 항상 최소 1씩은 늘어나도록 보장한다.
function getClickIncome(level) {
  const { baseIncome, incomeGrowth } = CONFIG.click;
  return Math.max(Math.ceil(baseIncome * Math.pow(incomeGrowth, level - 1)), level);
}

// 클릭 레벨 → 다음 레벨 업그레이드 비용
// getClickIncome과 동일한 이유로 "레벨당 최소 costMinPerLevel원씩 증가" 하한선을 둔다.
// (수익에만 하한선이 있고 비용엔 없으면, 하한선이 걸리는 저레벨 구간에서 비용이 수익 대비
// 지나치게 싸지는 문제가 생긴다 — 두 하한선을 항상 짝지어 걸어줘야 비용/수익 비율이 일정하게 유지된다.)
function getUpgradeCost(level) {
  const { baseCost, costGrowth, costMinPerLevel } = CONFIG.click;
  const raw = Math.round(baseCost * Math.pow(costGrowth, level - 1));
  const floor = baseCost + (level - 1) * costMinPerLevel;
  return Math.max(raw, floor);
}

// 클릭 레벨 → 현재 Stage (1~5)
function getStage(level) {
  let stage = 1;
  CONFIG.stageThresholds.forEach((threshold, i) => {
    if (level >= threshold) stage = i + 1;
  });
  return stage;
}

// 직원 강화 최대 레벨. 직원마다 기본 상한이 다르고(villagerMaxLevelByIndex), 인생한방 도전에
// 실패해서 목표 금액이 불어날수록(state.fightChallengeFailCount만큼) 모든 직원에게 동일하게 보너스가 더해진다.
function getVillagerMaxLevel(villagerId) {
  const index = CONFIG.villagers.findIndex((v) => v.id === villagerId);
  const base = index >= 0 ? CONFIG.villagerMaxLevelByIndex[index] : CONFIG.villagerMaxLevelBase;
  return base + state.fightChallengeFailCount * CONFIG.villagerMaxLevelPerFail;
}

// 직원 레벨 → 1회 지급액(더 이상 "초당"이 아니다 — 몇 초에 한 번 지급되는지는 getVillagerInterval이 따로 계산한다)
// 클릭 수익과 동일한 이유로 "레벨당 최소 1씩 증가" 하한선을 둔다.
function getVillagerIncome(villagerData, level) {
  const raw = Math.round(villagerData.baseIncome * Math.pow(villagerData.incomeGrowth, level - 1));
  return Math.max(raw, villagerData.baseIncome + (level - 1));
}

// 직원이 baseIncome을 "몇 초에 한 번" 지급하는지 계산한다. 레벨이 오를수록 villagerIntervalDecay
// 배율로 점점 짧아지고, villagerMinInterval(1초) 아래로는 더 줄어들지 않는다. 정수 초 단위로만
// 표시/계산한다(반올림) — 화면에 "6.5초"처럼 어정쩡한 소수점이 보이지 않도록.
function getVillagerInterval(villagerData, level) {
  const raw = villagerData.baseInterval * Math.pow(CONFIG.villagerIntervalDecay, level - 1);
  return Math.max(CONFIG.villagerMinInterval, Math.round(raw));
}

// 직원의 생산성을 화면에 표시할 문자열로 만든다. 주기가 1초면 기존과 같은 "X원/초"로,
// 1초보다 길면 "N초당 X원"으로 표시한다 — "1초당 1원"처럼 어색한 표현 대신 자연스러운 쪽을 쓴다.
function formatVillagerIncomeText(villagerData, level) {
  const income = getVillagerIncome(villagerData, level);
  const interval = getVillagerInterval(villagerData, level);
  if (interval <= 1) return `${formatMoneyCompact(income)}/초`;
  return `${interval}초당 ${formatMoneyCompact(income)}`;
}

// 금액을 보기 좋은 끝자리로 반올림한다 (10,000원 미만: 10원 단위 / 100만원 미만: 100원 단위
// / 1억원 미만: 1,000원 단위 / 그 이상: 10,000원 단위). 강화비는 레벨마다 계산되는 값이라
// 반올림 전 값이 애매한 끝자리를 갖기 쉬워, 표시/실제 값 모두 이 단위로 맞춘다.
function roundToPrettyUnit(amount) {
  if (amount < 10000) return Math.round(amount / 10) * 10;
  if (amount < 1000000) return Math.round(amount / 100) * 100;
  if (amount < 100000000) return Math.round(amount / 1000) * 1000;
  return Math.round(amount / 10000) * 10000;
}

// 직원 레벨 → 다음 레벨 강화 비용
function getVillagerUpgradeCost(villagerData, level) {
  const raw = Math.round(villagerData.baseUpgradeCost * Math.pow(villagerData.upgradeCostGrowth, level - 1));
  const withFloor = Math.max(raw, villagerData.baseUpgradeCost + (level - 1));
  return roundToPrettyUnit(withFloor);
}

// 고용된 모든 직원의 "초당 실효 생산량" 합계. 직원마다 지급 주기(getVillagerInterval)가
// 다르므로, 단순히 1회 지급액을 더하면 안 되고 지급액을 주기(초)로 나눈 값을 더해야 한다
// (예: 8초에 1원이면 초당 실효 수익은 0.125원). 화면 표시용으로만 쓰이며, 실제 지급 자체는
// startPassiveIncomeLoop의 개별 타이머가 정수 단위로 처리한다.
function getTotalPassiveIncome() {
  return CONFIG.villagers.reduce((sum, v) => {
    const s = state.villagers[v.id];
    if (!s || !s.hired) return sum;
    return sum + getVillagerIncome(v, s.level) / getVillagerInterval(v, s.level);
  }, 0);
}

// 피버타임 레벨 → 배수/지속시간. Lv.1(baseMultiplier/baseDuration)과 만렙(maxMultiplier/maxDuration)
// 사이를 선형보간한다 — 클릭/직원처럼 지수 성장을 쓰지 않는 이유는, 배수·지속시간은 "얼마나
// 자주 큰 값이 뛰는지"가 아니라 "한도 안에서 조금씩 좋아지는" 감각이 더 어울리는 값이기 때문.
function getFeverMultiplier(level) {
  const { baseMultiplier, maxMultiplier, maxLevel } = CONFIG.fever;
  if (maxLevel <= 1) return baseMultiplier;
  const t = (level - 1) / (maxLevel - 1);
  return Math.round((baseMultiplier + (maxMultiplier - baseMultiplier) * t) * 100) / 100;
}
function getFeverDuration(level) {
  const { baseDuration, maxDuration, maxLevel } = CONFIG.fever;
  if (maxLevel <= 1) return baseDuration;
  const t = (level - 1) / (maxLevel - 1);
  return Math.round(baseDuration + (maxDuration - baseDuration) * t);
}

// 피버타임 레벨 → 다음 레벨 강화 비용. level=0(미해금)이면 해금 비용(baseUpgradeCost 그대로)을
// 반환한다. 직원 강화비와 동일하게 끝자리를 예쁜 단위로 반올림한다.
function getFeverUpgradeCost(level) {
  const { baseUpgradeCost, upgradeCostGrowth } = CONFIG.fever;
  const raw = Math.round(baseUpgradeCost * Math.pow(upgradeCostGrowth, level));
  return roundToPrettyUnit(raw);
}

// 지금 이 순간 적용해야 할 피버타임 배수 (피버타임이 아니면 1배 = 평소와 동일)
function getCurrentFeverMultiplier() {
  return state.feverActive ? getFeverMultiplier(state.feverLevel) : 1;
}

// 특정 테마의 직원 3명이 전부 고용됐는지
function isThemeFullyHired(themeId) {
  return CONFIG.villagers
    .filter((v) => v.theme === themeId)
    .every((v) => state.villagers[v.id]?.hired);
}

// 테마가 해금됐는지: 첫 테마(나무)는 항상 열려 있고, 그 뒤 테마는
// 바로 이전 테마 3명을 전부 고용해야 열린다(강화 레벨은 무관).
function isThemeUnlocked(themeId) {
  const idx = CONFIG.themes.findIndex((t) => t.id === themeId);
  if (idx <= 0) return true;
  const prevTheme = CONFIG.themes[idx - 1];
  return isThemeFullyHired(prevTheme.id);
}

// 금액을 축약형(1.2만원, 1.2억원, 1.2조원, 1.2경원, 1.2해원)으로 표시한다. 화면에 보이는 모든
// 금액 표시는 전부 이 함수 하나로 통일해서 쓴다("178억 2,579만원"처럼 두 단위를 같이 붙이는
// 방식은 쓰지 않는다 — 만원 이상이면 "00만원"만, 억 이상이면 "00억원"만 소수점 첫째 자리까지).
// 소수점 반올림으로 값이 10000을 넘어버리면(예: 9999.96억 → "10000.0억") 자동으로 한 단계
// 위 단위(조)로 다시 계산해서 항상 자연스러운 자릿수로 보이게 한다.
//
// ※ 밸런스 6차 재조정 (버그: 예전에는 "경(10^16)"이 가장 큰 단위라, 그보다 커지면 뒤 숫자가
//   "10,000경원", "1,000,000,000경원"처럼 끝없이 길어지는 문제가 있었다 — 클릭 레벨 상한(maxLevel)을
//   도입해서 정상 플레이로는 이제 이 구간에 도달하지 않지만, 혹시 모를 예외 상황(저장 데이터 조작,
//   인생한방 연속 실패로 목표금액이 과도하게 커지는 경우 등)에도 화면이 깨지지 않도록 "해(10^20)"
//   단위를 추가하고, 그마저 넘는 값은 "해" 단위로나마 안전하게 표시되도록 안전장치를 마련했다.)
function formatMoneyCompact(amount) {
  amount = Math.floor(amount);
  if (amount === 0) return "0원";
  if (amount < 10000) return `${amount.toLocaleString()}원`;

  const units = [
    { divisor: 10 ** 20, label: "해" },
    { divisor: 10 ** 16, label: "경" },
    { divisor: 10 ** 12, label: "조" },
    { divisor: 10 ** 8, label: "억" },
    { divisor: 10 ** 4, label: "만" },
  ];

  for (let i = 0; i < units.length; i++) {
    const { divisor, label } = units[i];
    if (amount < divisor) continue;

    let value = Math.round((amount / divisor) * 10) / 10;
    if (value >= 10000) {
      if (i > 0) {
        // 반올림 때문에 상위 단위로 넘어가야 하는 경계 케이스 (예: 9999.96억 → 1조)
        const upper = units[i - 1];
        value = Math.round((amount / upper.divisor) * 10) / 10;
        return `${formatOneDecimal(value)}${upper.label}원`;
      }
      // "해"(가장 큰 단위)조차 10000을 넘는 극단적인 값은 정상 플레이로는 절대 나올 수 없지만
      // (클릭 레벨 상한 등으로 막혀 있음), 혹시 모를 예외 상황에서도 화면이 무한정 길어지지
      // 않도록 지수 표기로 안전하게 폴백한다.
      return `${amount.toExponential(1)}원`;
    }
    return `${formatOneDecimal(value)}${label}원`;
  }
  return `${amount.toLocaleString()}원`;
}

// 정수면 소수점 없이, 아니면 소수 첫째 자리까지만 보여주는 헬퍼
function formatOneDecimal(value) {
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
}

/* ---------------------------------------------------------
   4. DOM 참조
   --------------------------------------------------------- */
const el = {
  mainStage: document.getElementById("main-stage"),
  mainStageBgImg: document.getElementById("main-stage-bg-img"),
  mainCharacter: document.getElementById("main-character"),
  charGroupNormal: document.getElementById("char-group-normal"), // 평소 캐릭터 그룹(이미지+이모지 폴백) 전체
  charGroupDebtor: document.getElementById("char-group-debtor"), // 도박 캐릭터 그룹(이미지+이모지 폴백) 전체
  charNormal: document.getElementById("char-svg-normal"), // 그룹 내부의 <img> (src만 갱신할 때 사용)
  charImgDebtor: document.getElementById("char-img-debtor"), // 그룹 내부의 <img> (src만 갱신할 때 사용)
  charFallbackNormal: document.getElementById("char-fallback-normal"), // 이미지 없을 때 보이는 이모지
  charFallbackDebtor: document.getElementById("char-fallback-debtor"), // 이미지 없을 때 보이는 이모지
  popupLayer: document.getElementById("popup-layer"),
  contentArea: document.getElementById("content-area"),
  currentMoney: document.getElementById("current-money"),
  goalLabel: document.getElementById("goal-label"),
  clickTabIcon: document.getElementById("click-tab-icon"),
  clickTabLabel: document.getElementById("click-tab-label"),
  upgradeCardIcon: document.getElementById("upgrade-card-icon"),
  upgradeCardTitle: document.getElementById("upgrade-card-title"),
  upgradeCardSub: document.getElementById("upgrade-card-sub"),
  goalRemainingText: document.getElementById("goal-remaining-text"),
  progressFill: document.getElementById("progress-fill"),
  clickLevel: document.getElementById("click-level"),
  clickIncome: document.getElementById("click-income"),
  clickNextIncome: document.getElementById("click-next-income"),
  upgradeBtn: document.getElementById("upgrade-btn"),
  upgradeCost: document.getElementById("upgrade-cost"),

  feverLevel: document.getElementById("fever-level"),
  feverCurrentStat: document.getElementById("fever-current-stat"),
  feverNextStat: document.getElementById("fever-next-stat"),
  feverMeterPanel: document.getElementById("fever-meter-panel"),
  feverMeterFill: document.getElementById("fever-meter-fill"),
  feverUpgradeBtn: document.getElementById("fever-upgrade-btn"),
  feverUpgradeCost: document.getElementById("fever-upgrade-cost"),
  feverBanner: document.getElementById("fever-banner"),
  feverBannerMultiplier: document.getElementById("fever-banner-multiplier"),
  feverBannerTimer: document.getElementById("fever-banner-timer"),
  feverHelpersLeft: document.getElementById("fever-helpers-left"),
  feverHelpersRight: document.getElementById("fever-helpers-right"),
  feverHelperOpenBtn: document.getElementById("fever-helper-open-btn"),
  feverHelperModal: document.getElementById("fever-helper-modal"),
  feverHelperCloseBtn: document.getElementById("fever-helper-close-btn"),
  feverHelperOptions: document.getElementById("fever-helper-options"),
  feverHelperHint: document.getElementById("fever-helper-hint"),

  tabButtons: document.querySelectorAll(".tab-btn"),
  tabPanels: document.querySelectorAll(".tab-panel"),

  themeButtons: document.querySelectorAll(".theme-btn"),
  themePanels: document.querySelectorAll(".theme-panel"),

  hireThemeTabs: document.getElementById("hire-theme-tabs"),
  hireThemeContent: document.getElementById("hire-theme-content"),

  gambleBetStepper: document.getElementById("gamble-bet-stepper"),
  gambleBetPrevBtn: document.getElementById("gamble-bet-prev"),
  gambleBetNextBtn: document.getElementById("gamble-bet-next"),
  gambleBetAmount: document.getElementById("gamble-bet-amount"),

  wheel: document.getElementById("wheel"),
  wheelWrap: document.getElementById("wheel-wrap"),
  spinBtn: document.getElementById("spin-btn"),
  payoutTableBtn: document.getElementById("payout-table-btn"),
  payoutModal: document.getElementById("payout-modal"),
  payoutList: document.getElementById("payout-list"),
  payoutCloseBtn: document.getElementById("payout-close-btn"),

  speedToggleBtn: document.getElementById("speed-toggle-btn"),
  speedLockModal: document.getElementById("speed-lock-modal"),
  speedLockTitle: document.getElementById("speed-lock-title"),
  speedLockDesc: document.getElementById("speed-lock-desc"),
  speedLockCloseBtn: document.getElementById("speed-lock-close-btn"),
  themeColorOptions: document.getElementById("theme-color-options"),
  saveSlots: document.getElementById("save-slots"),
  resetBtn: document.getElementById("reset-btn"),
  resetModal: document.getElementById("reset-modal"),
  resetCancelBtn: document.getElementById("reset-cancel-btn"),
  resetConfirmBtn: document.getElementById("reset-confirm-btn"),

  victoryModal: document.getElementById("victory-modal"),
  victoryDesc: document.getElementById("victory-desc"),
  victoryContinueBtn: document.getElementById("victory-continue-btn"),
  victoryResetBtn: document.getElementById("victory-reset-btn"),

  achievementBtn: document.getElementById("achievement-btn"),
  achievementModal: document.getElementById("achievement-modal"),
  achievementCloseBtn: document.getElementById("achievement-close-btn"),
  achievementList: document.getElementById("achievement-list"),
  achievementProgressText: document.getElementById("achievement-progress-text"),
  achievementToast: document.getElementById("achievement-toast"),
  achievementToastIcon: document.getElementById("achievement-toast-icon"),
  achievementToastName: document.getElementById("achievement-toast-name"),

  customGalleryBtn: document.getElementById("custom-gallery-btn"),
  customGalleryModal: document.getElementById("custom-gallery-modal"),
  customGalleryCloseBtn: document.getElementById("custom-gallery-close-btn"),
  customTargetList: document.getElementById("custom-target-list"),
  customExportBtn: document.getElementById("custom-export-btn"),
  customImportBtn: document.getElementById("custom-import-btn"),
  customImportFile: document.getElementById("custom-import-file"),
  customEditModal: document.getElementById("custom-edit-modal"),
  customEditTitle: document.getElementById("custom-edit-title"),
  customEditEmojiField: document.getElementById("custom-edit-emoji-field"),
  customEditEmoji: document.getElementById("custom-edit-emoji"),
  customEditNameField: document.getElementById("custom-edit-name-field"),
  customEditName: document.getElementById("custom-edit-name"),
  customEditCharField: document.getElementById("custom-edit-char-field"),
  customEditCharStagedLabel: document.getElementById("custom-edit-char-staged-label"),
  customEditCharStaged: document.getElementById("custom-edit-char-staged"),
  customEditCharBody: document.getElementById("custom-edit-char-body"),
  customEditBgField: document.getElementById("custom-edit-bg-field"),
  customEditBgStagedLabel: document.getElementById("custom-edit-bg-staged-label"),
  customEditBgStaged: document.getElementById("custom-edit-bg-staged"),
  customEditBgBody: document.getElementById("custom-edit-bg-body"),
  customEditMotionField: document.getElementById("custom-edit-motion-field"),
  customEditMotion: document.getElementById("custom-edit-motion"),
  customEditBubbleField: document.getElementById("custom-edit-bubble-field"),
  customEditBubble: document.getElementById("custom-edit-bubble"),
  customEditError: document.getElementById("custom-edit-error"),
  customEditResetBtn: document.getElementById("custom-edit-reset-btn"),
  customEditCloseBtn: document.getElementById("custom-edit-close-btn"),

  fightChallengeBtn: document.getElementById("fight-challenge-btn"),
  fightChallengeModal: document.getElementById("fight-challenge-modal"),
  fightChallengeTitle: document.getElementById("fight-challenge-title"),
  fightChallengeCost: document.getElementById("fight-challenge-cost"),
  fightChallengeOdds: document.getElementById("fight-challenge-odds"),
  fightChallengeCancelBtn: document.getElementById("fight-challenge-cancel-btn"),
  fightChallengeConfirmBtn: document.getElementById("fight-challenge-confirm-btn"),
  fightResultModal: document.getElementById("fight-result-modal"),
  fightResultModalBox: document.querySelector("#fight-result-modal .modal-box"),
  fightResultEmoji: document.getElementById("fight-result-emoji"),
  fightResultTitle: document.getElementById("fight-result-title"),
  fightResultDesc: document.getElementById("fight-result-desc"),
  fightResultCloseBtn: document.getElementById("fight-result-close-btn"),
};

/* ---------------------------------------------------------
   5. 화면 갱신
   --------------------------------------------------------- */
function renderMoney() {
  el.currentMoney.textContent = formatMoneyCompact(state.money);

  const progress = Math.min(100, (state.money / state.goalMoney) * 100);
  el.progressFill.style.width = `${progress}%`;

  const remaining = Math.max(0, state.goalMoney - state.money);
  if (el.goalRemainingText) {
    el.goalRemainingText.textContent = remaining <= 0 ? "다 갚았어요!" : `${formatMoneyCompact(remaining)} 남음`;
  }

  // 목표 금액을 처음 달성한 순간에만 축하 모달을 띄운다.
  if (state.money >= state.goalMoney && !state.hasSeenVictory) {
    state.hasSeenVictory = true;
    openVictoryModal();
  }
}

function renderClickPanel() {
  const isMaxLevel = state.clickLevel >= CONFIG.click.maxLevel;
  const income = getClickIncome(state.clickLevel);
  const nextIncome = isMaxLevel ? income : getClickIncome(state.clickLevel + 1);
  const cost = isMaxLevel ? 0 : getUpgradeCost(state.clickLevel);

  el.clickLevel.textContent = `Lv.${state.clickLevel}${isMaxLevel ? " (MAX)" : ""}`;
  el.clickIncome.textContent = `+${formatMoneyCompact(income)} / 클릭`;
  el.clickNextIncome.textContent = isMaxLevel ? "-" : `+${formatMoneyCompact(nextIncome)} / 클릭`;
  el.upgradeCost.textContent = isMaxLevel ? "만렙 달성" : formatMoneyCompact(cost);

  el.upgradeBtn.disabled = isMaxLevel || state.money < cost;
}

// 피버타임 강화 카드(레벨/배수/지속시간/강화비용)를 갱신. 발동까지 남은 충전/피버타임 진행
// 상태는 항상 화면에 보이는 게이지(renderFeverMeter, #goal-panel 아래)가 대신 보여준다.
// Lv.0(미해금) 상태에서는 배수/지속시간이 아예 없다(handleClick 참고).
function renderFeverPanel() {
  if (!el.feverLevel) return;
  const isLocked = state.feverLevel <= 0;
  const isMaxLevel = state.feverLevel >= CONFIG.fever.maxLevel;
  const nextLevel = state.feverLevel + 1;
  const nextMult = isMaxLevel ? getFeverMultiplier(state.feverLevel) : getFeverMultiplier(nextLevel);
  const nextDuration = isMaxLevel ? getFeverDuration(state.feverLevel) : getFeverDuration(nextLevel);
  const cost = isMaxLevel ? 0 : getFeverUpgradeCost(state.feverLevel);

  el.feverLevel.textContent = isLocked ? "미해금" : `Lv.${state.feverLevel}${isMaxLevel ? " (MAX)" : ""}`;
  el.feverCurrentStat.textContent = isLocked ? "-" : `×${getFeverMultiplier(state.feverLevel)} · ${getFeverDuration(state.feverLevel)}초`;
  el.feverNextStat.textContent = isMaxLevel ? "-" : `×${nextMult} · ${nextDuration}초`;
  el.feverUpgradeCost.textContent = isMaxLevel ? "만렙 달성" : formatMoneyCompact(cost);
  el.feverUpgradeBtn.disabled = isMaxLevel || state.money < cost;
}

// 화면에 항상 보이는 피버타임 게이지(#goal-panel 바로 아래). Lv.0(미해금)이면 아예 숨긴다.
// 평소엔 클릭이 쌓이는 만큼 차오르고(0 → 100%), 피버타임 중엔 반대로 남은 시간 비율만큼
// 줄어든다 — 숫자/라벨 없이 "차오르다가 터지고, 줄어드는" 움직임 자체로 의미가 전달되게 한다.
function renderFeverMeter() {
  if (!el.feverMeterPanel) return;
  const isLocked = state.feverLevel <= 0;
  el.feverMeterPanel.hidden = isLocked;
  if (isLocked) return;

  el.feverMeterPanel.classList.toggle("fever-meter-active", state.feverActive);
  if (state.feverActive) {
    const total = getFeverDuration(state.feverLevel);
    const pct = total > 0 ? Math.max(0, Math.min(100, (state.feverRemainingSec / total) * 100)) : 0;
    el.feverMeterFill.style.width = `${pct}%`;
  } else {
    const pct = Math.min(100, (state.feverClickCount / CONFIG.fever.clicksRequired) * 100);
    el.feverMeterFill.style.width = `${pct}%`;
  }
}

// 화면 상단의 "피버타임!" 배너: 활성 중일 때만 보이고, 배수/남은시간을 매초 갱신한다.
function renderFeverBanner() {
  if (!el.feverBanner) return;
  el.feverBanner.hidden = !state.feverActive;
  if (state.feverActive) {
    el.feverBannerMultiplier.textContent = `×${getFeverMultiplier(state.feverLevel)}`;
    const sec = Math.max(0, Math.ceil(state.feverRemainingSec));
    el.feverBannerTimer.textContent = `0:${String(sec).padStart(2, "0")}`;
  }
  if (el.mainStage) el.mainStage.classList.toggle("fever-active", state.feverActive);
}

// 도우미 직원 1명의 캐릭터(이미지 또는 이모지) HTML. fever-helper-img에는 캐릭터1/2와 같은
// 방식(얇은 흰 테두리)을 적용해서 통일감을 준다(style.css 참고).
function feverHelperVisualHtml(villagerId, delayIndex) {
  const v = CONFIG.villagers.find((x) => x.id === villagerId);
  if (!v) return "";
  const displayName = getDisplayName(v);
  const displayEmoji = getDisplayEmoji(v);
  const charImage = getDisplayCharacterImage(v);
  const delay = (delayIndex * 0.15).toFixed(2);
  const imgTag = charImage
    ? `<img class="fever-helper-img" style="animation-delay:${delay}s" src="${charImage}" alt="${displayName}" onerror="this.hidden=true; this.nextElementSibling.hidden=false;" />`
    : "";
  return `
    <div class="fever-helper">
      ${imgTag}
      <span class="fever-helper-emoji" style="animation-delay:${delay}s" ${imgTag ? "hidden" : ""}>${displayEmoji}</span>
    </div>
  `;
}

// 메인 캐릭터 좌우에 도우미 직원(최대 4명, 좌 2명/우 2명)을 그린다.
function renderFeverHelpers() {
  if (!el.feverHelpersLeft || !el.feverHelpersRight) return;
  const ids = state.feverActive ? state.feverHelperIds : [];
  // 좌/우에 번갈아 배치한다(0,2번째 → 좌, 1,3번째 → 우) — 4명이 다 나오면 2:2로 딱 맞고,
  // 그보다 적게 나올 때도 한쪽에 몰리지 않고 양쪽에 고르게 나뉜다.
  const left = ids.filter((_, i) => i % 2 === 0);
  const right = ids.filter((_, i) => i % 2 === 1);
  el.feverHelpersLeft.innerHTML = left.map((id, i) => feverHelperVisualHtml(id, i * 2)).join("");
  el.feverHelpersRight.innerHTML = right.map((id, i) => feverHelperVisualHtml(id, i * 2 + 1)).join("");
  el.feverHelpersLeft.hidden = left.length === 0;
  el.feverHelpersRight.hidden = right.length === 0;
}

function renderStage() {
  const stage = getStage(state.clickLevel);
  el.mainStage.className = `stage-bg stage-${stage}`;
  state.currentStage = stage; // "인생한방"이 Stage5 여부를 판단하는 데 쓰인다 (handleFightChallenge 근처 참고)
  applyStageAssets();
  renderFightChallengeButton();
}

// 캐릭터2 모드(도박 최저확률 당첨) 여부에 따라 캐릭터 모습 + 관련 텍스트를 전환
// "평소 캐릭터 그룹"과 "도박 캐릭터 그룹"을 통째로 켜고 끈다. 그룹 안에서 이미지/이모지 폴백 중
// 뭐가 실제로 보일지는 applyStageAssets/onerror가 독립적으로 관리하므로 여기서는 건드리지 않는다.
function renderDebtorMode() {
  el.charGroupNormal.hidden = state.isDebtorMode;
  el.charGroupDebtor.hidden = !state.isDebtorMode;
  el.goalLabel.textContent = "목표 금액"; // 캐릭터 이름과 무관하게 항상 고정 라벨
  applyStageAssets(); // 배경은 캐릭터2 모드여도 캐릭터1과 동일한 배경(커스텀 배경 공유)을 그대로 쓴다
  renderFightChallengeButton();

  // 상단 탭 메뉴 "캐릭터1"/카드 제목 "캐릭터1 강화"도 캐릭터2 모드에선 "캐릭터2"/"캐릭터2 강화"로,
  // 아이콘도 🌱(캐릭터1) <-> 🐟(캐릭터2)로 함께 전환한다. 커스텀 이름/이모지가 있으면 그걸 우선 쓴다.
  const label = state.isDebtorMode ? getDisplayName(MAIN_DEBTOR_CHARACTER) : getDisplayName(MAIN_CHARACTER);
  const icon = state.isDebtorMode
    ? (getCustomEntry("main-debtor").emoji || TAB_ICON_DEFAULT_DEBTOR)
    : (getCustomEntry("main").emoji || TAB_ICON_DEFAULT_NORMAL);
  if (el.clickTabIcon) el.clickTabIcon.textContent = icon;
  if (el.clickTabLabel) el.clickTabLabel.textContent = label;
  if (el.upgradeCardIcon) el.upgradeCardIcon.textContent = icon;
  if (el.upgradeCardTitle) el.upgradeCardTitle.textContent = `${label} 강화`;
  if (el.upgradeCardSub) el.upgradeCardSub.textContent = `${label}를 클릭할 때마다 얻는 돈을 늘려요`;
  if (el.mainCharacter) el.mainCharacter.setAttribute("aria-label", `${label}를 클릭해서 돈 벌기`);
}

// 이미지가 있으면 로드를 시도하고(성공/실패는 onload/onerror가 마무리), 없으면 명시적으로
// 숨기고 src를 지운다 — "커스텀 이미지를 지웠을 때 예전 이미지가 화면에 남는" 문제를 막으려면
// 값이 없는 경우도 "지금 상태"로 취급해서 매번 갱신해야 한다.
function applyCharacterImageOrEmoji(imgEl, fallbackEl, src, emoji) {
  if (fallbackEl) fallbackEl.textContent = emoji;
  if (imgEl.dataset.stageSrc === (src || "")) return; // 이미 같은 상태면 다시 손대지 않는다
  imgEl.dataset.stageSrc = src || "";
  if (src) {
    imgEl.hidden = false;
    imgEl.src = src;
  } else {
    imgEl.hidden = true;
    imgEl.removeAttribute("src");
    if (fallbackEl) fallbackEl.hidden = false;
  }
}

// 배경 이미지는 이모지 폴백이 없다 — 없으면 #main-stage 자체의 그라디언트(.stage-bg.stage-N)가 보인다.
// 커스텀 배경 이미지가 있을 때는 #main-stage에 has-bg-image 클래스를 붙여서, 그 이미지 위에
// 어색하게 겹쳐 보일 수 있는 기본 배경 꾸밈요소(#village-deco의 좌우 흰색 언덕 장식)를 숨긴다.
function applyBackgroundImageOrFallback(imgEl, src) {
  if (el.mainStage) el.mainStage.classList.toggle("has-bg-image", !!src);
  if (imgEl.dataset.stageSrc === (src || "")) return;
  imgEl.dataset.stageSrc = src || "";
  if (src) {
    imgEl.hidden = false;
    imgEl.src = src;
  } else {
    imgEl.hidden = true;
    imgEl.removeAttribute("src");
  }
}

// 메인 캐릭터/배경은 기본 이미지 자산을 두지 않는다 — 커스텀 업로드가 있으면 그 이미지,
// 없으면 이모지(캐릭터)/그라디언트(배경)만 보인다(설정 > 이미지 커스텀 참고).
// customEntry의 field(예: "characterImage")가 "레벨(Stage)마다 다르게" 켜져 있으면(${field}Staged)
// 지금 Stage에 해당하는 이미지(${field}Stage${stage})를, 꺼져 있으면 항상 쓰는 단일 이미지를 반환한다.
function resolveStagedField(customEntry, field, stage) {
  if (customEntry[`${field}Staged`]) {
    return customEntry[`${field}Stage${stage}`] || "";
  }
  return customEntry[field] || "";
}

function applyStageAssets() {
  const stage = state.currentStage ?? getStage(state.clickLevel);
  const customMain = getCustomEntry("main");
  const customDebtor = getCustomEntry("main-debtor");
  applyCharacterImageOrEmoji(el.charNormal, el.charFallbackNormal, resolveStagedField(customMain, "characterImage", stage), getDisplayEmoji(MAIN_CHARACTER));
  applyCharacterImageOrEmoji(el.charImgDebtor, el.charFallbackDebtor, resolveStagedField(customDebtor, "characterImage", stage), getDisplayEmoji(MAIN_DEBTOR_CHARACTER));
  applyBackgroundImageOrFallback(el.mainStageBgImg, resolveStagedField(customMain, "backgroundImage", stage));
}

// 돈이 바뀔 때마다 항상 함께 갱신돼야 하는 화면들 (금액 표시 + 클릭 패널 + 직원 고용/강화 버튼 상태 + 배속 해금 여부)
// 이걸 개별 호출로 흩어두면 한 곳에서 빠뜨리기 쉬워 하나로 묶어 둔다.
function renderEconomy() {
  renderMoney();
  renderClickPanel();
  renderFeverPanel(); // 피버타임 강화 카드도 돈이 바뀔 때마다 버튼 활성화 여부를 함께 갱신
  renderFeverMeter(); // 클릭마다 충전 게이지가 움직이므로 항상 같이 갱신
  refreshHireButtonStates(); // 돈만 바뀐 경우 카드를 통째로 다시 그리지 않고 버튼 상태만 갱신(깜빡임 방지)
  renderSpeedToggle(); // 직원 고용/레벨이 배속 해금 조건이라 돈이 바뀔 때마다 같이 확인
  renderGambleBet(); // 베팅 금액 대비 잔액이 부족해지면 스핀 버튼도 함께 잠가야 하므로
  checkAchievements(); // 상태가 바뀔 때마다 새로 달성된 업적이 있는지 확인
}

function renderAll() {
  renderEconomy();
  renderStage();
  renderDebtorMode();
  renderSaveSlots();
  renderFeverBanner();
  renderFeverHelpers();
  renderFeverHelperOptions();
}

/* ---------------------------------------------------------
   6. +금액 팝업 애니메이션
   --------------------------------------------------------- */
// 🪙 이모지 대신 쓰는 동전 아이콘. 이모지 폰트 유무에 좌우되지 않도록 SVG로 직접 그린다 —
// 안의 "₩"는 이모지가 아니라 아주 오래된 기본 문자라 어떤 환경에서도 항상 똑같이 보인다.
const MONEY_POPUP_COIN_SVG = `
  <svg class="money-popup-coin" viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="16" cy="16" r="14" fill="#F0B93E" stroke="#C97B1E" stroke-width="2"/>
    <circle cx="16" cy="16" r="10" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.5"/>
    <text x="16" y="21" font-size="13" font-weight="bold" fill="#8A5A12" text-anchor="middle">₩</text>
  </svg>
`;

// containerEl 내부(자신의 좌표계)에 +금액 팝업을 띄운다.
// containerEl은 CSS에서 position: relative/absolute로 기준점 역할을 해야 한다.
// 피버타임 중이면 금색 강조 스타일(money-popup-fever)을 추가로 붙여서 평소 수익과 구분되게 한다.
function spawnMoneyPopup(amount, containerEl, isFever = false) {
  const popup = document.createElement("div");
  popup.className = isFever ? "money-popup money-popup-fever" : "money-popup";
  popup.innerHTML = `${MONEY_POPUP_COIN_SVG}<span>+${formatMoneyCompact(amount).replace("원", "")}</span>`;

  const offsetX = (Math.random() - 0.5) * 60;
  popup.style.left = `calc(50% + ${offsetX}px)`;
  popup.style.top = "25%";

  containerEl.appendChild(popup);
  popup.addEventListener("animationend", () => popup.remove());
}

/* ---------------------------------------------------------
   7. 이벤트 처리
   --------------------------------------------------------- */
function handleClick() {
  const baseIncome = getClickIncome(state.clickLevel);
  const income = Math.round(baseIncome * getCurrentFeverMultiplier()); // 항상 정수 지급(프로젝트 컨벤션)
  state.money += income;

  spawnMoneyPopup(income, el.popupLayer, state.feverActive);

  // 캐릭터 바운스 모션
  el.mainCharacter.classList.remove("bounce");
  void el.mainCharacter.offsetWidth; // 리플로우로 애니메이션 재시작
  el.mainCharacter.classList.add("bounce");

  // 피버타임 레벨이 0(아직 강화한 적 없음)이면 피버타임 자체가 없는 상태라 클릭이 충전에
  // 들어가지 않는다. 진행 중일 때도 마찬가지로 멈춘다(끝나자마자 바로 재발동하면 "특별한
  // 이벤트" 느낌이 사라진다).
  if (state.feverLevel >= 1 && !state.feverActive) {
    state.feverClickCount++;
    if (state.feverClickCount >= CONFIG.fever.clicksRequired) {
      startFeverTime();
    }
  }

  renderEconomy(); // 돈이 늘어날 때마다 고용/강화 버튼 활성화 여부도 함께 갱신
}

/* ---------------------------------------------------------
   7-1. 피버타임
   --------------------------------------------------------- */

// 피버타임 도우미로 나올 직원을 고른다.
// - 설정 > 🔥 피버 직원 팝업에서 "피버타임 출연"을 켜둔 직원 중 지금 고용 중인 직원만 후보가 된다
//   (미고용 직원은 켜놨어도 나오지 않는다).
// - 후보가 하나도 없으면(아무도 안 켰거나, 켠 직원이 전부 미고용) 지금 고용 중인 직원 전체를
//   후보로 대신 쓴다("선택하지 않으면 고용된 직원 중 무작위로 나온다").
// - 후보가 helperCount(4)명보다 많으면 그중 무작위로 4명만, 4명 이하면 그 인원 그대로 나온다.
function pickFeverHelpers() {
  const hiredIds = CONFIG.villagers.filter((v) => state.villagers[v.id]?.hired).map((v) => v.id);
  if (hiredIds.length === 0) return [];

  const selectedHired = state.feverSelectedHelpers.filter((id) => hiredIds.includes(id));
  const pool = selectedHired.length > 0 ? selectedHired.slice() : hiredIds.slice();

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, CONFIG.fever.helperCount);
}

function startFeverTime() {
  state.feverActive = true;
  state.feverClickCount = 0;
  state.feverRemainingSec = getFeverDuration(state.feverLevel);
  state.feverHelperIds = pickFeverHelpers();
  renderFeverBanner();
  renderFeverHelpers();
  renderFeverPanel();
  renderFeverMeter();
}

function endFeverTime() {
  state.feverActive = false;
  state.feverRemainingSec = 0;
  state.feverHelperIds = [];
  renderFeverBanner();
  renderFeverHelpers();
  renderFeverPanel();
  renderFeverMeter();
}

// 피버타임 진행 상태(발동 전 카운트/활성화/헬퍼 목록)를 전부 초기값으로 되돌린다.
// (게임 초기화·다른 슬롯 불러오기처럼 "지금 진행 중이던 피버타임"이 의미 없어지는 시점에 사용)
function resetFeverRuntimeState() {
  state.feverClickCount = 0;
  state.feverActive = false;
  state.feverRemainingSec = 0;
  state.feverHelperIds = [];
}

function handleFeverUpgrade() {
  if (state.feverLevel >= CONFIG.fever.maxLevel) return; // 만렙이면 더 이상 강화 불가

  const cost = getFeverUpgradeCost(state.feverLevel);

  if (state.money < cost) {
    el.feverUpgradeBtn.classList.remove("shake");
    void el.feverUpgradeBtn.offsetWidth;
    el.feverUpgradeBtn.classList.add("shake");
    return;
  }

  state.money -= cost;
  state.feverLevel += 1;

  renderEconomy();
}

function handleUpgrade() {
  if (state.clickLevel >= CONFIG.click.maxLevel) return; // 만렙이면 더 이상 강화 불가

  const cost = getUpgradeCost(state.clickLevel);

  if (state.money < cost) {
    el.upgradeBtn.classList.remove("shake");
    void el.upgradeBtn.offsetWidth;
    el.upgradeBtn.classList.add("shake");
    return;
  }

  state.money -= cost;
  state.clickLevel += 1;

  renderAll();
}

/* ---------------------------------------------------------
   8. 상단 3+1 탭 전환
   --------------------------------------------------------- */
function switchTab(tabName) {
  el.tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  el.tabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tabName}`);
  });

  trackAdminSequence(tabName);
}

/* ---------------------------------------------------------
   8-0. 관리자 전용 히든 커맨드 (캐릭터2 모드 테스트용 스위칭)
   설정 탭 5번 → 직원 탭 3번 → 고용 탭 2번, 총 10번을 이 순서대로 연속으로 눌러야 발동한다.
   중간에 다른 탭이 끼거나 순서/횟수가 어긋나면 그 시점부터 다시 처음부터 세기 시작한다.
   --------------------------------------------------------- */
const ADMIN_SEQUENCE = ["settings", "settings", "settings", "settings", "settings", "villagers", "villagers", "villagers", "hire", "hire"];
let adminSequenceProgress = [];

function trackAdminSequence(tabName) {
  adminSequenceProgress.push(tabName);
  // 최근 입력이 시퀀스와 계속 맞아떨어지는지 뒤에서부터 검사 — 안 맞으면 그 지점부터 새로 시작
  if (adminSequenceProgress.length > ADMIN_SEQUENCE.length) {
    adminSequenceProgress = adminSequenceProgress.slice(-ADMIN_SEQUENCE.length);
  }
  const matches = adminSequenceProgress.length === ADMIN_SEQUENCE.length &&
    adminSequenceProgress.every((t, i) => t === ADMIN_SEQUENCE[i]);

  if (matches) {
    adminSequenceProgress = [];
    toggleAdminDebtorMode();
    return;
  }

  // 지금까지 입력이 시퀀스의 접두사(prefix)와 안 맞으면, 마지막 탭 하나만 남기고 리셋
  // (예: 설정 5번을 눌렀는데 그 다음 "고용"을 눌러버리면, 처음부터 다시 세되 방금 누른 "고용"부터 카운트)
  const isValidPrefix = adminSequenceProgress.every((t, i) => t === ADMIN_SEQUENCE[i]);
  if (!isValidPrefix) {
    adminSequenceProgress = [tabName];
  }
}

// 관리자 모드로 캐릭터2/캐릭터1 상태를 강제로 전환한다. 실제 도박에서 최저확률(???)에 당첨된 것과
// 동일하게 처리해서, 이후 다음 스핀에서 정상적으로 원래 상태로 복귀하는지도 테스트할 수 있게 한다.
function toggleAdminDebtorMode() {
  state.isDebtorMode = !state.isDebtorMode;
  if (state.isDebtorMode) state.debtorEncountered = true; // 업적도 함께 인정
  renderDebtorMode();

  // 어느 탭에 있든 항상 보이는 메인 캐릭터 영역(#popup-layer)에 안내를 띄운다.
  spawnAdminNotice(state.isDebtorMode ? "🛠️ 관리자: 캐릭터2 모드 ON" : "🛠️ 관리자: 캐릭터2 모드 OFF");
}

// 관리자 전용 안내를 메인 캐릭터 영역 위에 잠깐 띄운다.
function spawnAdminNotice(message) {
  if (!el.popupLayer) return;
  const notice = document.createElement("div");
  notice.className = "admin-notice";
  notice.textContent = message;
  el.popupLayer.appendChild(notice);
  notice.addEventListener("animationend", () => notice.remove());
}

/* ---------------------------------------------------------
   8-1. 직원 확인 화면의 5개 테마 서브탭
   --------------------------------------------------------- */
function switchTheme(themeId) {
  state.currentTheme = themeId;

  el.themeButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.theme === themeId);
  });
  el.themePanels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === `theme-${themeId}`);
  });
}

// 직원 확인 화면의 테마 서브탭 아이콘을 커스텀 값(getDisplayThemeIcon)으로 갱신한다.
// 초기 HTML에는 기본 이모지가 하드코딩돼 있으므로, 커스텀이 설정된 경우에만 텍스트를 덮어쓴다.
function renderThemeButtons() {
  el.themeButtons.forEach((btn) => {
    const theme = CONFIG.themes.find((t) => t.id === btn.dataset.theme);
    if (theme) btn.textContent = getDisplayThemeIcon(theme);
  });
}

/* ---------------------------------------------------------
   8-1-2. 직원 고용 화면의 5개 테마 서브탭 (한 테마를 모두 고용해야 다음이 열림)
   --------------------------------------------------------- */
let currentHireTheme = "forest";

function switchHireTheme(themeId) {
  if (!isThemeUnlocked(themeId)) return; // 잠긴 테마는 선택 자체가 안 됨
  currentHireTheme = themeId;
  renderHireThemeTabs();
  renderHireThemeContent();
}

function renderHireThemeTabs() {
  if (!el.hireThemeTabs) return;
  el.hireThemeTabs.innerHTML = CONFIG.themes
    .map((t) => {
      const unlocked = isThemeUnlocked(t.id);
      const active = t.id === currentHireTheme;
      return `<button class="theme-btn${active ? " active" : ""}${unlocked ? "" : " locked"}"
        data-hire-theme="${t.id}" ${unlocked ? "" : "disabled"}>${getDisplayThemeIcon(t)}${unlocked ? "" : '<span class="theme-lock-badge">🔒</span>'}</button>`;
    })
    .join("");

  el.hireThemeTabs.querySelectorAll("[data-hire-theme]").forEach((btn) => {
    btn.addEventListener("click", () => switchHireTheme(btn.dataset.hireTheme));
  });
}

/* ---------------------------------------------------------
   8-2. 직원 시스템 (고용 / 강화 / 자동 생산)
   --------------------------------------------------------- */

// "직원 확인" 화면 슬롯(이미지+잠금 표시만)의 DOM을 최초 1회 생성한다.
// 실제 고용/강화 조작은 "직원 고용" 화면(테마별로 매번 다시 그림)에서만 한다.
// (이미 생성된 슬롯이 있으면 건너뛰어 중복 생성을 막는다 — 재호출해도 안전하다.)
function buildVillagerDom() {
  CONFIG.villagers.forEach((v) => {
    if (document.getElementById(`slot-${v.id}`)) return; // 이미 만들어져 있으면 스킵
    const themePanel = document.getElementById(`theme-${v.theme}`);
    const slot = document.createElement("div");
    slot.className = "villager-slot";
    slot.id = `slot-${v.id}`;
    slot.innerHTML = buildVillagerVisualHtml(v);
    if (themePanel) themePanel.appendChild(slot);
  });
}

// 직원 슬롯 내부(.villager-visual)의 HTML을 커스텀 데이터를 반영해서 만든다.
// buildVillagerDom(최초 생성)과 refreshVillagerSlot(커스텀 변경 후 갱신) 둘 다 이 함수를 공유한다.
function buildVillagerVisualHtml(v) {
  const motionClass = getDisplayMotion(v.id);
  const displayName = getDisplayName(v);
  const displayEmoji = getDisplayEmoji(v);
  const charImage = getDisplayCharacterImage(v);
  const bgImage = getDisplayBackgroundImage(v);
  // 배경/캐릭터 이미지는 있으면 <img>가 보이고, 없거나 로드 실패하면 onerror로 스스로 숨어서
  // 기존 단색 그라디언트 배경(.villager-visual)과 이모지(.villager-emoji)가 그대로 보인다.
  const bgImgTag = bgImage
    ? `<img class="villager-bg-img" src="${bgImage}" alt="" onerror="this.hidden=true;" />`
    : "";
  const charImgTag = charImage
    ? `<img class="villager-character-img ${motionClass}" src="${charImage}" alt="${displayName}" onerror="this.hidden=true; this.nextElementSibling.hidden=false;" />`
    : "";
  return `
      <div class="villager-visual">
        ${bgImgTag}
        <div class="bg-decor" id="bg-decor-${v.id}"></div>
        ${charImgTag}
        <span class="villager-emoji ${motionClass}" ${charImgTag ? "hidden" : ""}>${displayEmoji}</span>
        <div class="villager-speech-bubble" id="bubble-${v.id}" hidden></div>
        <div class="villager-name-badge">${displayEmoji} ${displayName}</div>
        <div class="villager-lock-overlay" id="lock-${v.id}">
          <span class="lock-icon">🔒</span>
          <span class="lock-text">아직 고용되지 않음</span>
        </div>
      </div>
    `;
}

// 커스텀 설정(이름/이미지/모션)이 바뀐 뒤, 이미 만들어져 있는 직원 슬롯의 내용을 다시 그린다.
// buildVillagerDom은 "최초 1회만" 생성하므로, 커스텀 변경을 화면에 반영하려면 이 함수가 필요하다.
function refreshVillagerSlot(villagerId) {
  const v = CONFIG.villagers.find((x) => x.id === villagerId);
  const slot = document.getElementById(`slot-${villagerId}`);
  if (!v || !slot) return;
  slot.innerHTML = buildVillagerVisualHtml(v);
  // 슬롯을 다시 그렸으니 잠금 상태(고용 여부)도 즉시 반영해야 한다.
  renderVillagers();
}

// 특정 직원의 캐릭터 위에 말풍선을 잠깐 띄운다. (예: 강화했을 때 "고마워요!" 같은 반응)
// durationMs 이후 자동으로 사라진다. content는 텍스트 또는 이모지 문자열.
function showVillagerSpeechBubble(villagerId, content, durationMs = 2000) {
  const bubble = document.getElementById(`bubble-${villagerId}`);
  if (!bubble) return;
  bubble.textContent = content;
  bubble.hidden = false;
  window.clearTimeout(bubble._hideTimer);
  bubble._hideTimer = window.setTimeout(() => {
    bubble.hidden = true;
  }, durationMs);
}

// 특정 직원의 배경 장식 레이어에 소품(나비, 반짝임 등)을 채운다.
// items는 [{ emoji, className, style }] 형태 — className으로 CSS 애니메이션(위치·움직임)을 지정하고,
// style로 각 소품의 시작 위치(top/left 등)를 개별 지정할 수 있다.
function setVillagerBackgroundDecor(villagerId, items) {
  const container = document.getElementById(`bg-decor-${villagerId}`);
  if (!container) return;
  container.innerHTML = items
    .map((item) => `<span class="bg-decor-item ${item.className || ""}" style="${item.style || ""}">${item.emoji || ""}</span>`)
    .join("");
}

// 메인 캐릭터 영역 배경에도 같은 방식으로 소품(구름, 반딧불이 등)을 채울 수 있다.
// #village-deco가 그 컨테이너 — Stage가 바뀌어도(초록→노랑→...) 그대로 유지된다.
function setMainBackgroundDecor(items) {
  const container = document.getElementById("village-deco");
  if (!container) return;
  container.innerHTML = items
    .map((item) => `<span class="bg-decor-item ${item.className || ""}" style="${item.style || ""}">${item.emoji || ""}</span>`)
    .join("");
}

// "직원 고용" 화면: 현재 선택된 테마의 직원 3명 카드를 새로 그린다.
// 고용 전에는 고용 정보(비용/자동수익)만, 고용 후에는 레벨/강화 정보로 바뀐다.
// (스펙: 고용 탭은 배경 이미지 없이 단색 배경 + 캐릭터만 — 배경은 여기서 다루지 않는다.)
function hireVisualCharacterHtml(v) {
  // 이미지가 있으면 <img>가 우선 보이고, 없거나 로드 실패하면 onerror로 스스로 숨어서
  // 옆의 이모지(.hire-emoji)가 그대로 보인다.
  const charImage = getDisplayCharacterImage(v);
  const displayName = getDisplayName(v);
  const displayEmoji = getDisplayEmoji(v);
  if (!charImage) return `<span class="hire-emoji">${displayEmoji}</span>`;
  return `
    <img class="hire-character-img" src="${charImage}" alt="${displayName}"
         onerror="this.hidden=true; this.nextElementSibling.hidden=false;" />
    <span class="hire-emoji" hidden>${displayEmoji}</span>
  `;
}

function renderHireThemeContent() {
  if (!el.hireThemeContent) return;
  const unlocked = isThemeUnlocked(currentHireTheme);

  if (!unlocked) {
    const idx = CONFIG.themes.findIndex((t) => t.id === currentHireTheme);
    const prevTheme = CONFIG.themes[idx - 1];
    el.hireThemeContent.innerHTML = `
      <div class="theme-locked-card">
        <span class="theme-locked-icon">🔒</span>
        <p class="theme-locked-title">아직 열리지 않은 지역이에요</p>
        <p class="theme-locked-desc">${getDisplayThemeIcon(prevTheme)} ${prevTheme.name} 직원 3명을 모두 고용하면 열려요.</p>
      </div>
    `;
    return;
  }

  const villagersInTheme = CONFIG.villagers.filter((v) => v.theme === currentHireTheme);

  el.hireThemeContent.innerHTML = villagersInTheme
    .map((v) => {
      const s = state.villagers[v.id];
      const isMaxLevel = s.level >= getVillagerMaxLevel(v.id);

      if (!s.hired) {
        // 고용 전: 이름/캐릭터 + 고용 비용 + 자동수익 + 고용 버튼만
        return `
          <div class="hire-card" id="hire-${v.id}">
            <div class="hire-visual">${hireVisualCharacterHtml(v)}</div>
            <div class="hire-info">
              <h2 class="hire-name">${getDisplayName(v)}</h2>
              <div class="hire-stat-row"><span>고용 비용</span><strong>${formatMoneyCompact(v.hireCost)}</strong></div>
              <div class="hire-stat-row"><span>자동 수익</span><strong>${formatVillagerIncomeText(v, 1)}</strong></div>
            </div>
            <button class="hire-btn" data-villager="${v.id}" ${state.money < v.hireCost ? "disabled" : ""}>고용하기</button>
          </div>
        `;
      }

      // 고용 후: 레벨 / 현재수익 / 다음레벨 / 강화 버튼으로 전환
      const incomeText = formatVillagerIncomeText(v, s.level);
      const nextIncomeText = isMaxLevel ? "-" : formatVillagerIncomeText(v, s.level + 1);
      const upgradeCost = isMaxLevel ? 0 : getVillagerUpgradeCost(v, s.level);
      const upgradeDisabled = isMaxLevel || state.money < upgradeCost;

      return `
        <div class="hire-card hire-card-hired" id="hire-${v.id}">
          <div class="hire-visual">${hireVisualCharacterHtml(v)}</div>
          <div class="hire-info">
            <h2 class="hire-name">${getDisplayName(v)}</h2>
            <div class="upgrade-stats">
              <div class="stat-box">
                <span class="stat-label">레벨</span>
                <span class="stat-value">Lv.${s.level}${isMaxLevel ? " (MAX)" : ""}</span>
              </div>
              <div class="stat-box">
                <span class="stat-label">현재 수익</span>
                <span class="stat-value">${incomeText}</span>
              </div>
              <div class="stat-box">
                <span class="stat-label">다음 레벨</span>
                <span class="stat-value">${nextIncomeText}</span>
              </div>
            </div>
          </div>
          <button class="upgrade-btn villager-upgrade-btn" data-villager="${v.id}" ${upgradeDisabled ? "disabled" : ""}>
            <span class="upgrade-btn-label">강화</span>
            <span class="upgrade-btn-cost">${isMaxLevel ? "만렙 달성" : formatMoneyCompact(upgradeCost)}</span>
          </button>
        </div>
      `;
    })
    .join("");

  // 카드가 매번 새로 그려지므로 이벤트도 그때마다 다시 연결
  el.hireThemeContent.querySelectorAll("[data-villager]").forEach((btn) => {
    const villagerId = btn.dataset.villager;
    if (btn.classList.contains("hire-btn")) {
      btn.addEventListener("click", () => handleHire(villagerId));
    } else if (btn.classList.contains("villager-upgrade-btn")) {
      btn.addEventListener("click", () => handleVillagerUpgrade(villagerId));
    }
  });
}

// 돈이 바뀔 때마다(클릭 등) 고용/강화 카드를 통째로 다시 그리면, 카드 안의 이미지가 매번
// 재생성되면서 화면이 깜빡이는 문제가 있었다 — 실제로는 버튼이 눌릴 수 있는지(disabled)만
// 바뀌는 것이므로, 카드 구조는 그대로 두고 버튼 상태만 가볍게 갱신한다.
function refreshHireButtonStates() {
  if (!el.hireThemeContent) return;
  el.hireThemeContent.querySelectorAll(".hire-btn[data-villager]").forEach((btn) => {
    const v = CONFIG.villagers.find((x) => x.id === btn.dataset.villager);
    if (v) btn.disabled = state.money < v.hireCost;
  });
  el.hireThemeContent.querySelectorAll(".villager-upgrade-btn[data-villager]").forEach((btn) => {
    const v = CONFIG.villagers.find((x) => x.id === btn.dataset.villager);
    const s = v && state.villagers[v.id];
    if (!v || !s) return;
    const isMaxLevel = s.level >= getVillagerMaxLevel(v.id);
    const upgradeCost = isMaxLevel ? 0 : getVillagerUpgradeCost(v, s.level);
    btn.disabled = isMaxLevel || state.money < upgradeCost;
  });
}

// 직원 확인 화면(슬롯 잠금 상태)과 직원 고용 화면(테마탭 잠금/카드)을 함께 갱신
function renderVillagers() {
  CONFIG.villagers.forEach((v) => {
    const s = state.villagers[v.id];
    const slot = document.getElementById(`slot-${v.id}`);
    if (slot) slot.classList.toggle("unlocked", s.hired);
  });

  renderHireThemeTabs();
  renderHireThemeContent();
}

function handleHire(villagerId) {
  const v = CONFIG.villagers.find((v) => v.id === villagerId);
  const s = state.villagers[villagerId];
  if (!v || !s || s.hired) return;

  // 카드가 매번 새로 그려지므로, 고정 id 대신 방금 클릭된 버튼(현재 DOM에 실제로 존재하는 요소)을 찾는다.
  const hireBtn = el.hireThemeContent.querySelector(`.hire-btn[data-villager="${villagerId}"]`);

  if (state.money < v.hireCost) {
    if (hireBtn) {
      hireBtn.classList.remove("shake");
      void hireBtn.offsetWidth;
      hireBtn.classList.add("shake");
    }
    return;
  }

  state.money -= v.hireCost;
  s.hired = true;

  renderEconomy();
  renderHireThemeContent(); // 고용 성공 시 카드가 "고용하기" -> "레벨/강화" 구조로 바뀌어야 하므로 전체 재생성
  renderVillagers(); // 직원 확인 화면 슬롯의 잠금 표시도 함께 갱신
  renderFeverHelperOptions(); // 새로 고용한 직원이 설정 > 피버타임 도우미 선택지에도 바로 나타나야 함
}

function handleVillagerUpgrade(villagerId) {
  const v = CONFIG.villagers.find((v) => v.id === villagerId);
  const s = state.villagers[villagerId];
  if (!v || !s || !s.hired) return;
  if (s.level >= getVillagerMaxLevel(villagerId)) return; // 만렙이면 더 이상 강화 불가

  const cost = getVillagerUpgradeCost(v, s.level);
  const upgradeBtn = el.hireThemeContent.querySelector(`.villager-upgrade-btn[data-villager="${villagerId}"]`);

  if (state.money < cost) {
    if (upgradeBtn) {
      upgradeBtn.classList.remove("shake");
      void upgradeBtn.offsetWidth;
      upgradeBtn.classList.add("shake");
    }
    return;
  }

  state.money -= cost;
  s.level += 1;

  renderEconomy();
  renderHireThemeContent(); // 레벨/수익 숫자가 바뀌므로 카드 내용을 다시 그림

  // 커스텀 말풍선 문구가 등록돼 있으면, 강화할 때마다 그중 하나를 랜덤으로 잠깐 띄운다.
  // (직원 확인 화면을 보고 있지 않으면 슬롯 자체가 안 보이니 티가 안 나지만, 데이터는 항상 갱신해둔다.)
  const bubbleLines = getCustomBubbleLines(villagerId);
  if (bubbleLines.length > 0) {
    const line = bubbleLines[Math.floor(Math.random() * bubbleLines.length)];
    showVillagerSpeechBubble(villagerId, line);
  }
}

// 1초마다 모든 고용 직원의 생산 타이머를 진행시키고, 각자의 주기(getVillagerInterval)가
// 다 찬 직원만 그 시점에 baseIncome을 지급한다 — 더 이상 "모든 직원이 매초 얻는" 방식이
// 아니라, 직원마다 "몇 초에 한 번" 지급되는지가 다르다(밸런스 7차 재조정 참고).
// 배속(state.speedLevel)은 "타이머가 매초 그만큼 더 빨리 흐르는 것"으로 반영한다 — 배속 3배면
// 실제 1초마다 타이머가 3초치 진행되어, 주기가 사실상 1/3로 단축되는 효과를 낸다.
// +금액 팝업은 "지금 실제로 직원 확인 화면을 보고 있을 때"만 띄운다 — 다른 탭에 있다가
// 돌아왔을 때 그동안 밀린 팝업이 한꺼번에 쏟아지지 않도록, 안 보는 동안은 애니메이션 없이
// 총 금액에만 조용히 더해지고 돌아오면 그 시점부터 다시 팝업이 보인다.
function startPassiveIncomeLoop() {
  window.setInterval(() => {
    let totalIncome = 0;
    const speed = state.speedLevel;
    const feverMult = getCurrentFeverMultiplier();
    const isViewingVillagers = document.getElementById("tab-villagers")?.classList.contains("active");

    CONFIG.villagers.forEach((v) => {
      const s = state.villagers[v.id];
      if (!s || !s.hired) return;

      const interval = getVillagerInterval(v, s.level);
      villagerIncomeTimers[v.id] += speed;

      // 배속이 커서 한 틱에 주기를 여러 번 채울 수도 있으므로 while로 처리한다
      // (예: 주기 1초에 배속 3배면 한 틱에 3번 지급).
      let villagerIncome = 0;
      while (villagerIncomeTimers[v.id] >= interval) {
        villagerIncomeTimers[v.id] -= interval;
        villagerIncome += getVillagerIncome(v, s.level);
      }
      if (villagerIncome === 0) return;

      villagerIncome = Math.round(villagerIncome * feverMult); // 피버타임 중이면 직원 수익도 함께 n배
      totalIncome += villagerIncome;

      if (isViewingVillagers) {
        const visual = document.getElementById(`slot-${v.id}`);
        if (visual) spawnMoneyPopup(villagerIncome, visual, state.feverActive);
      }
    });

    if (totalIncome > 0) {
      state.money += totalIncome;
      renderEconomy();
    }

    // 피버타임 진행 중이면 매초 실시간으로 카운트다운한다 — 배속(state.speedLevel)의 영향을
    // 받지 않는다: 배속은 "돈이 쌓이는 속도"를 위한 장치이지, 짧고 화려한 이벤트인 피버타임의
    // 지속시간까지 3배속으로 순삭시키면 연출이 거의 안 보이고 끝나버려서 일부러 뺐다.
    if (state.feverActive) {
      state.feverRemainingSec -= 1;
      if (state.feverRemainingSec <= 0) {
        endFeverTime();
      } else {
        renderFeverBanner();
        renderFeverMeter();
      }
    }

    // 직원 확인 화면을 보고 있을 때, 말풍선 문구가 등록된 고용 직원 중 하나를 가끔 랜덤으로
    // 골라 말풍선을 띄운다. 강화할 때만 뜨면 놓치기 쉬우므로, 화면을 보는 동안 자연스럽게
    // 계속 확인할 수 있게 한다(매초 8% 확률 = 평균 12.5초에 한 번 정도).
    if (isViewingVillagers && Math.random() < 0.08) {
      const candidates = CONFIG.villagers.filter((v) => {
        const s = state.villagers[v.id];
        return s?.hired && getCustomBubbleLines(v.id).length > 0;
      });
      if (candidates.length > 0) {
        const picked = candidates[Math.floor(Math.random() * candidates.length)];
        const lines = getCustomBubbleLines(picked.id);
        const line = lines[Math.floor(Math.random() * lines.length)];
        showVillagerSpeechBubble(picked.id, line);
      }
    }
  }, 1000);
}

/* ---------------------------------------------------------
   9. 도박(돌림판)
   --------------------------------------------------------- */

// 지금 선택된 베팅 금액 (CONFIG.gamble.betOptions에서 state.gambleBetIndex번째 값)
function getGambleBetAmount() {
  return CONFIG.gamble.betOptions[state.gambleBetIndex];
}

// 베팅 금액 표시 + 화살표 버튼의 양 끝 잠금 상태 갱신. 스핀 중에는 화살표를 눌러도 바뀌지
// 않도록 handleGambleBetStep에서 막지만, 시각적으로도 비활성 처리해 헷갈리지 않게 한다.
function renderGambleBet() {
  if (el.gambleBetAmount) el.gambleBetAmount.textContent = formatMoneyCompact(getGambleBetAmount());
  if (el.gambleBetPrevBtn) el.gambleBetPrevBtn.disabled = state.isSpinning || state.gambleBetIndex <= 0;
  if (el.gambleBetNextBtn) {
    el.gambleBetNextBtn.disabled = state.isSpinning || state.gambleBetIndex >= CONFIG.gamble.betOptions.length - 1;
  }
  if (el.spinBtn) el.spinBtn.disabled = state.isSpinning || state.money < getGambleBetAmount();
}

// direction: -1(낮추기) 또는 +1(높이기). 화살표 클릭/휠 스크롤/좌우 드래그가 모두 공유한다.
function handleGambleBetStep(direction) {
  if (state.isSpinning) return; // 스핀 중엔 베팅 금액을 바꿀 수 없다
  const nextIndex = state.gambleBetIndex + direction;
  if (nextIndex < 0 || nextIndex >= CONFIG.gamble.betOptions.length) return; // 양 끝에서는 더 안 움직임
  state.gambleBetIndex = nextIndex;
  renderGambleBet();
}

// 베팅 금액을 좌우로 드래그(모바일 스와이프 포함)해서 바꾼다 — Pointer Events라 마우스 드래그도
// 똑같이 동작한다. DRAG_STEP_PX만큼 가로로 움직일 때마다 한 단계씩 바뀌고, 그만큼씩 기준점을
// 다시 잡아서 계속 끄는 동안 여러 단계를 연달아 넘길 수 있다(오른쪽으로 끌면 금액이 커진다).
function setupGambleBetDrag() {
  if (!el.gambleBetStepper) return;
  const DRAG_STEP_PX = 32;
  let dragging = false;
  let lastX = 0;

  el.gambleBetStepper.addEventListener("pointerdown", (e) => {
    if (state.isSpinning) return;
    // 화살표 버튼 위에서 시작한 포인터는 드래그로 가로채지 않는다 — 여기서 포인터를
    // 캡처해버리면 버튼의 클릭 이벤트가 씹혀서 화살표 탭이 안 먹는 문제가 생긴다.
    if (e.target.closest(".gamble-bet-arrow")) return;
    dragging = true;
    lastX = e.clientX;
    el.gambleBetStepper.setPointerCapture(e.pointerId);
  });
  el.gambleBetStepper.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    // while로 처리: 빠르게 휙 끌어서 한 이벤트에 여러 단계 폭을 한 번에 넘는 경우에도
    // 전부 반영한다. 양 끝(index가 안 바뀜)에 닿으면 즉시 멈춰서 무한루프를 막는다.
    let deltaX = e.clientX - lastX;
    while (Math.abs(deltaX) >= DRAG_STEP_PX) {
      const dir = deltaX > 0 ? 1 : -1;
      const prevIndex = state.gambleBetIndex;
      handleGambleBetStep(dir);
      lastX += dir * DRAG_STEP_PX;
      if (state.gambleBetIndex === prevIndex) break;
      deltaX = e.clientX - lastX;
    }
  });
  const endDrag = () => { dragging = false; };
  el.gambleBetStepper.addEventListener("pointerup", endDrag);
  el.gambleBetStepper.addEventListener("pointercancel", endDrag);
}

const gambleSegments = CONFIG.gamble.segments;
const totalWeight = gambleSegments.reduce((sum, seg) => sum + seg.weight, 0);

// 돌림판 배경(conic-gradient)과 각 구간의 라벨을 미리 계산해둔다.
const wheelLayout = (() => {
  // 조각이 서로 잘 구분되도록 8가지 색을 순환시키고, 캐릭터2(최저확률)만 어두운 회색으로 고정
  const colors = ["#F6C6CE", "#B9DE9E", "#A3D0EA", "#F3C98C", "#C7ACE6", "#F3AEB9", "#EFD9A8", "#9FC9E6"];
  let acc = 0;
  return gambleSegments.map((seg, i) => {
    const startDeg = (acc / totalWeight) * 360;
    acc += seg.weight;
    const endDeg = (acc / totalWeight) * 360;
    return {
      ...seg,
      startDeg,
      endDeg,
      midDeg: (startDeg + endDeg) / 2,
      color: seg.isJackpotBad ? "#8A7A68" : colors[i % colors.length],
    };
  });
})();

function buildWheelBackground() {
  const stops = wheelLayout
    .map((seg) => `${seg.color} ${seg.startDeg}deg ${seg.endDeg}deg`)
    .join(", ");
  el.wheel.style.background = `conic-gradient(${stops})`;
}

// 룰렛은 색상 조각만 표시하고, 각 색상이 어떤 배수인지는 옆의 "확률표" 버튼을 눌렀을 때
// 뜨는 모달에서 색상 원 + 배수 + 확률로 보여준다 (조각이 좁아 글자를 넣기 어려워 바꾼 방식).
function renderPayoutTable() {
  if (!el.payoutList) return;
  el.payoutList.innerHTML = wheelLayout
    .map((seg) => {
      const chanceValue = (seg.weight / totalWeight) * 100;
      // 정수 %는 그대로, 소수점이 있는 값(예: 0.5%)은 소수 첫째 자리까지 보여준다.
      const chance = Number.isInteger(chanceValue) ? chanceValue : chanceValue.toFixed(1);
      return `
        <div class="payout-row${seg.isJackpotBad ? " jackpot-bad" : ""}">
          <span class="payout-swatch" style="background:${seg.color}"></span>
          <span class="payout-label">${seg.label}</span>
          <span class="payout-chance">${chance}%</span>
        </div>
      `;
    })
    .join("");
}

function openPayoutModal() {
  renderPayoutTable();
  el.payoutModal.hidden = false;
}
function closePayoutModal() {
  el.payoutModal.hidden = true;
}

// 가중치 기반 랜덤 선택
function pickGambleSegment() {
  let roll = Math.random() * totalWeight;
  for (const seg of wheelLayout) {
    if (roll < seg.weight) return seg;
    roll -= seg.weight;
  }
  return wheelLayout[wheelLayout.length - 1];
}

let wheelSpinTotal = 0; // 돌림판이 누적으로 회전한 각도 (계속 같은 방향으로 더 돌게)

function handleSpin() {
  const cost = getGambleBetAmount();

  if (state.isSpinning) return;

  if (state.money < cost) {
    el.spinBtn.classList.remove("shake");
    void el.spinBtn.offsetWidth;
    el.spinBtn.classList.add("shake");
    return;
  }

  state.money -= cost;
  renderEconomy();

  state.isSpinning = true;
  renderGambleBet(); // 스핀 버튼 + 베팅 금액 화살표를 함께 잠근다

  const target = pickGambleSegment();

  // 포인터는 12시 방향 고정 → 목표 구간 중앙이 12시에 오도록 회전각을 계산한다.
  // wheelSpinTotal은 매 스핀마다 누적되므로(계속 같은 방향으로 더 돔), 목표 각도는 항상
  // "0deg에서부터"가 아니라 "현재 wheelSpinTotal이 실제로 가리키고 있는 위치에서부터" 계산해야 한다.
  // 이걸 무시하고 매번 절대각(360*extraSpins + (360-midDeg))을 그대로 더하면, 두 번째 스핀부터는
  // 이전 스핀이 남긴 회전 잔여값이 반영되지 않아 화면에 멈추는 조각과 실제 당첨 결과가 어긋난다.
  const currentAngle = wheelSpinTotal % 360;
  const desiredAngle = 360 - target.midDeg; // 이 각도만큼 돌면 목표 조각 중앙이 12시(포인터)에 옴
  let deltaToTarget = desiredAngle - currentAngle;
  if (deltaToTarget <= 0) deltaToTarget += 360; // 항상 양의 방향(시계방향)으로 더 돌도록 보정

  const extraSpins = 5 + Math.floor(Math.random() * 3);
  const targetRotation = 360 * extraSpins + deltaToTarget;
  wheelSpinTotal += targetRotation;

  el.wheel.style.transform = `rotate(${wheelSpinTotal}deg)`;

  window.setTimeout(() => {
    resolveGambleResult(target, cost);
    state.isSpinning = false;
    renderGambleBet(); // 화살표 잠금 해제 + 새 잔액 기준으로 스핀 버튼 상태 갱신
  }, 4300);
}

function resolveGambleResult(segment, cost) {
  const reward = Math.round(cost * segment.multiplier);
  state.money += reward;

  // 업적 판정용 통계 기록
  state.gambleSpinCount += 1;
  if (!segment.isJackpotBad) {
    state.bestGambleMultiplier = Math.max(state.bestGambleMultiplier, segment.multiplier);
  }
  if (segment.isJackpotBad) {
    state.debtorEncountered = true;
  }

  // 캐릭터2 상태는 "그 상태를 만든 최저확률(0.5%, ???)이 다시 나오기 전까지" 유지된다.
  // 즉 일반 배수가 나온다고 원래대로 돌아가는 게 아니라, 오직 ???가 다시 당첨됐을 때만 토글된다
  // (캐릭터2 상태에서 ??? 당첨 → 원래대로 복귀 / 원래 상태에서 ??? 당첨 → 캐릭터2로 전환).
  const wasDebtor = state.isDebtorMode;
  if (segment.isJackpotBad) {
    state.isDebtorMode = !state.isDebtorMode;
  }
  // isJackpotBad가 아니면 state.isDebtorMode는 그대로 둔다(건드리지 않음).

  renderEconomy();
  renderDebtorMode();

  let message, resultClass;
  if (segment.isJackpotBad) {
    // 배수를 적용하지 않고(위 reward가 이미 cost와 동일) 캐릭터만 전환한다 — 돈은 잃지 않는다.
    // wasDebtor 기준으로 "방금 캐릭터2가 됐는지" "방금 원래대로 돌아왔는지"를 구분해서 안내한다.
    message = wasDebtor ? "??? 원래대로 돌아왔어요!" : "??? 무언가 나타났습니다...";
    resultClass = "jackpot-bad";
  } else if (wasDebtor) {
    // 캐릭터2 상태는 그대로 유지된 채 일반 배수만 당첨된 경우
    message = `${segment.label}... +${formatMoneyCompact(reward)} (캐릭터2 모드 유지 중)`;
    resultClass = segment.multiplier >= 1 ? "win" : "lose";
  } else if (segment.multiplier >= 1) {
    message = `${segment.label} 당첨! +${formatMoneyCompact(reward)}`;
    resultClass = "win";
  } else {
    message = `${segment.label}... +${formatMoneyCompact(reward)}`;
    resultClass = "lose";
  }

  spawnGambleResultPopup(message, resultClass);
}

// 도박 결과를 룰렛 위에 잠깐 떠올랐다 사라지는 팝업으로 보여준다.
function spawnGambleResultPopup(message, resultClass) {
  if (!el.wheelWrap) return;
  const popup = document.createElement("div");
  popup.className = `gamble-result-popup ${resultClass}`;
  popup.textContent = message;
  el.wheelWrap.appendChild(popup);
  popup.addEventListener("animationend", () => popup.remove());
}

/* ---------------------------------------------------------
   10. 배속 시스템
   --------------------------------------------------------- */

// 현재 상태 기준으로 해금된 배속 값 목록 (항상 1은 포함)
function getUnlockedSpeeds() {
  return CONFIG.speeds.filter((s) => s.checkUnlocked(state)).map((s) => s.value);
}

// 화면 우측 최상단 배속 버튼 표시 갱신. 버튼 자체는 항상 지금 배속(×1/×2/×3)만 보여주고,
// 해금 상태/조건 설명은 눌렀을 때만(안 열렸을 경우) #speed-lock-modal로 보여준다.
function renderSpeedToggle() {
  if (!el.speedToggleBtn) return;
  const unlocked = getUnlockedSpeeds();

  // 지금 선택된 배속이 더 이상 해금 조건을 만족 못 하면(이론상 발생 안 하지만 방어적으로) ×1로 되돌림
  if (!unlocked.includes(state.speedLevel)) {
    state.speedLevel = 1;
  }

  el.speedToggleBtn.textContent = `×${state.speedLevel}`;
}

// 버튼을 누를 때마다 배속이 ×1→×2→×3→×1 순으로 한 칸씩 순환한다. 다음 배속이 아직 잠겨
// 있으면 배속은 그대로 두고, 그 배속의 해금 조건을 안내 팝업으로 띄운다.
function handleSpeedToggle() {
  const values = CONFIG.speeds.map((s) => s.value); // [1, 2, 3]
  const currentIndex = values.indexOf(state.speedLevel);
  const nextConfig = CONFIG.speeds[(currentIndex + 1) % values.length];

  if (nextConfig.checkUnlocked(state)) {
    state.speedLevel = nextConfig.value;
    renderSpeedToggle();
  } else {
    openSpeedLockModal(nextConfig);
  }
}

function openSpeedLockModal(speedConfig) {
  if (el.speedLockTitle) el.speedLockTitle.textContent = `${speedConfig.label} 배속이 아직 잠겨있어요`;
  if (el.speedLockDesc) el.speedLockDesc.textContent = speedConfig.lockHint || "";
  if (el.speedLockModal) el.speedLockModal.hidden = false;
}
function closeSpeedLockModal() {
  if (el.speedLockModal) el.speedLockModal.hidden = true;
}

/* ---------------------------------------------------------
   10-1. 테마 색상 (설정 > 테마 색상) — 게임 진행과는 무관한 순수 표시 설정이라 localStorage에
   따로 저장한다. "green"은 기본값이라 <html data-theme>를 아예 지워서 :root 기본값을 그대로 쓴다.
   --------------------------------------------------------- */
const THEME_COLOR_STORAGE_KEY = "village-clicker-theme-v1";
const THEME_COLORS = ["green", "sky", "navy", "purple", "red", "pink", "orange", "mono"];
const DEFAULT_THEME_COLOR = "green";

function loadThemeColor() {
  try {
    const saved = window.localStorage.getItem(THEME_COLOR_STORAGE_KEY);
    return THEME_COLORS.includes(saved) ? saved : DEFAULT_THEME_COLOR;
  } catch (e) {
    return DEFAULT_THEME_COLOR;
  }
}

function applyThemeColor(themeId) {
  if (themeId === DEFAULT_THEME_COLOR) {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", themeId);
  }
  if (el.themeColorOptions) {
    el.themeColorOptions.querySelectorAll(".theme-color-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.theme === themeId);
    });
  }
}

function handleThemeColorSelect(themeId) {
  if (!THEME_COLORS.includes(themeId)) return;
  applyThemeColor(themeId);
  try {
    window.localStorage.setItem(THEME_COLOR_STORAGE_KEY, themeId);
  } catch (e) {
    // 저장 실패해도(용량 초과 등) 화면 반영은 이미 됐으니 조용히 무시 — 새로고침하면 기본값으로 돌아갈 뿐
  }
}

/* ---------------------------------------------------------
   10-2. 피버타임 출연 직원 설정 (설정 > 🔥 피버 직원 카드 → "직원 선택하기" 팝업)
   15명 전원을 대상으로 "피버타임에 나올지" 여부를 미리 켜둘 수 있다(고용 여부와 무관하게
   미리 선택해둘 수 있고, 실제로 나오려면 그 시점에 고용까지 돼 있어야 한다 — pickFeverHelpers 참고).
   4명 넘게 켜두면 피버타임이 시작될 때마다 그중 무작위 4명만 나오고, 하나도 안 켜두면 고용된
   직원 전체 중 무작위로 나온다. 선택 개수에는 상한이 없다.
   --------------------------------------------------------- */
function renderFeverHelperOptions() {
  if (!el.feverHelperOptions) return;

  const selected = state.feverSelectedHelpers;
  el.feverHelperOptions.innerHTML = CONFIG.villagers
    .map((v) => {
      const isHired = !!state.villagers[v.id]?.hired;
      const isSelected = selected.includes(v.id);
      return `
        <button class="fever-helper-option${isSelected ? " active" : ""}${isHired ? "" : " not-hired"}" data-villager="${v.id}">
          <span class="fever-helper-option-emoji">${getDisplayEmoji(v)}</span>
          <span class="fever-helper-option-name">${getDisplayName(v)}</span>
          ${isHired ? "" : '<span class="fever-helper-option-tag">미고용</span>'}
        </button>
      `;
    })
    .join("");

  el.feverHelperOptions.querySelectorAll("[data-villager]").forEach((btn) => {
    btn.addEventListener("click", () => toggleFeverHelperSelection(btn.dataset.villager));
  });

  if (el.feverHelperHint) {
    el.feverHelperHint.textContent =
      `${selected.length}명 선택됨 · 선택한 직원이 고용 중일 때만 나와요. 4명보다 많이 선택하면 그때마다 무작위 4명만, ` +
      `하나도 선택하지 않으면 고용된 직원 중 무작위로 나와요.`;
  }
}

function toggleFeverHelperSelection(villagerId) {
  const selected = state.feverSelectedHelpers;
  const idx = selected.indexOf(villagerId);
  if (idx >= 0) {
    selected.splice(idx, 1);
  } else {
    selected.push(villagerId); // 선택 개수 상한 없음 — 4명 초과분은 발동 시점에 무작위로 추려진다
  }
  renderFeverHelperOptions();
}

function openFeverHelperModal() {
  renderFeverHelperOptions();
  if (el.feverHelperModal) el.feverHelperModal.hidden = false;
}
function closeFeverHelperModal() {
  if (el.feverHelperModal) el.feverHelperModal.hidden = true;
}

/* ---------------------------------------------------------
   11. 저장 (슬롯 3개, localStorage)
   --------------------------------------------------------- */
const SAVE_KEY_PREFIX = "village-clicker-save-";

// 저장 대상은 state 전체가 아니라, 다시 게임을 복원하는 데 필요한 필드만 골라 담는다.
function serializeState() {
  return {
    money: state.money,
    clickLevel: state.clickLevel,
    isDebtorMode: state.isDebtorMode,
    speedLevel: state.speedLevel,
    hasSeenVictory: state.hasSeenVictory,
    villagers: state.villagers,

    achievements: state.achievements,
    gambleSpinCount: state.gambleSpinCount,
    bestGambleMultiplier: state.bestGambleMultiplier,
    debtorEncountered: state.debtorEncountered,
    gambleBetIndex: state.gambleBetIndex,

    goalMoney: state.goalMoney,
    fightChallengeFailCount: state.fightChallengeFailCount,

    feverLevel: state.feverLevel,
    feverSelectedHelpers: state.feverSelectedHelpers,

    savedAt: Date.now(),
  };
}

function applySavedState(saved) {
  state.money = saved.money ?? 0;
  // 클릭 레벨 상한(maxLevel)이 나중에 추가된 값이라, 그 이전에 저장된 세이브에는 상한을 넘는
  // clickLevel이 들어있을 수 있다 — 그대로 복원하면 밸런스 상한이 무력화되므로 항상 클램프한다.
  state.clickLevel = Math.min(saved.clickLevel ?? 1, CONFIG.click.maxLevel);
  state.isDebtorMode = !!saved.isDebtorMode;
  state.speedLevel = saved.speedLevel ?? 1;
  state.hasSeenVictory = !!saved.hasSeenVictory;

  state.achievements = saved.achievements ?? {};
  state.gambleSpinCount = saved.gambleSpinCount ?? 0;
  state.bestGambleMultiplier = saved.bestGambleMultiplier ?? 0;
  state.debtorEncountered = !!saved.debtorEncountered;
  // 베팅 단계 개수가 나중에 바뀌었을 수도 있으니 항상 유효 범위로 클램프한다.
  state.gambleBetIndex = Math.min(
    Math.max(saved.gambleBetIndex ?? CONFIG.gamble.defaultBetIndex, 0),
    CONFIG.gamble.betOptions.length - 1
  );

  // goalMoney가 저장 안 된 옛날 세이브 파일이면 기본 목표금액으로 되돌린다.
  state.goalMoney = saved.goalMoney ?? CONFIG.goalMoney;
  state.fightChallengeFailCount = saved.fightChallengeFailCount ?? 0;

  // 피버타임 레벨도 클릭 레벨과 같은 이유로 항상 현재 만렙 기준으로 클램프한다.
  // (저장 안 된 옛날 세이브는 0 = 아직 해금 전으로 취급)
  state.feverLevel = Math.min(saved.feverLevel ?? 0, CONFIG.fever.maxLevel);
  state.feverSelectedHelpers = Array.isArray(saved.feverSelectedHelpers)
    ? saved.feverSelectedHelpers.slice(0, CONFIG.fever.helperCount)
    : [];
  resetFeverRuntimeState(); // 진행 중이던 피버타임 발동/카운트는 항상 0부터 다시 시작(villagerIncomeTimers와 동일한 이유)

  // 저장 시점 이후 CONFIG에 직원이 추가됐을 수 있으니, 저장된 값이 있는 직원만 덮어쓰고 나머지는 기본값 유지
  CONFIG.villagers.forEach((v) => {
    if (saved.villagers && saved.villagers[v.id]) {
      state.villagers[v.id] = {
        hired: !!saved.villagers[v.id].hired,
        level: saved.villagers[v.id].level ?? 1,
      };
    } else {
      state.villagers[v.id] = { hired: false, level: 1 };
    }
  });
}

function readSlot(slotIndex) {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY_PREFIX + slotIndex);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeSlot(slotIndex, data) {
  try {
    window.localStorage.setItem(SAVE_KEY_PREFIX + slotIndex, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

function clearSlot(slotIndex) {
  try {
    window.localStorage.removeItem(SAVE_KEY_PREFIX + slotIndex);
    return true;
  } catch (e) {
    return false;
  }
}

function formatSlotDesc(saved) {
  if (!saved) return "빈 슬롯";
  const date = new Date(saved.savedAt);
  const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${formatMoneyCompact(saved.money)} · ${dateStr}`;
}

function renderSaveSlots() {
  if (!el.saveSlots) return;
  el.saveSlots.innerHTML = "";

  for (let i = 1; i <= CONFIG.saveSlotCount; i++) {
    const saved = readSlot(i);
    const row = document.createElement("div");
    row.className = "save-slot";
    row.innerHTML = `
      <div class="save-slot-info">
        <p class="save-slot-title">슬롯 ${i}</p>
        <p class="save-slot-desc">${formatSlotDesc(saved)}</p>
      </div>
      <div class="save-slot-actions">
        <button class="slot-btn slot-btn-save" data-action="save" data-slot="${i}">저장</button>
        <button class="slot-btn slot-btn-load" data-action="load" data-slot="${i}" ${saved ? "" : "disabled"}>불러오기</button>
      </div>
    `;
    el.saveSlots.appendChild(row);
  }
}

function handleSaveSlot(slotIndex) {
  const ok = writeSlot(slotIndex, serializeState());
  renderSaveSlots();
  if (!ok) {
    // 저장 실패(저장공간 부족 등) 시에도 조용히 무시하지 않고 슬롯 설명에 안내
    const row = el.saveSlots.children[slotIndex - 1];
    if (row) {
      const desc = row.querySelector(".save-slot-desc");
      if (desc) desc.textContent = "저장 실패 (저장 공간을 확인해주세요)";
    }
  }
}

function handleLoadSlot(slotIndex) {
  const saved = readSlot(slotIndex);
  if (!saved) return;
  applySavedState(saved);
  renderAll();
  // 불러온 직원 고용/레벨 상태를 "고용" 탭 카드 구조와 "직원" 탭 슬롯 잠금 표시에 함께 강제 반영
  // (renderHireThemeContent()만 부르면 "직원" 탭의 slot-${id} unlocked 클래스가 갱신되지 않아,
  // 고용해서 저장한 직원도 불러오기 후 "직원" 탭에서는 계속 미고용으로 보이는 문제가 있었다)
  renderVillagers();
}

/* ---------------------------------------------------------
   12. 게임 초기화 (처음부터 다시 시작)
   --------------------------------------------------------- */
function resetGame() {
  state.money = 0;
  state.clickLevel = 1;
  state.isDebtorMode = false;
  state.speedLevel = 1;
  state.currentTheme = "forest";
  state.hasSeenVictory = false;

  state.achievements = {};
  state.gambleSpinCount = 0;
  state.bestGambleMultiplier = 0;
  state.debtorEncountered = false;
  state.gambleBetIndex = CONFIG.gamble.defaultBetIndex;

  state.goalMoney = CONFIG.goalMoney;
  state.fightChallengeFailCount = 0;

  state.feverLevel = 0;
  state.feverSelectedHelpers = [];
  resetFeverRuntimeState();

  currentHireTheme = "forest"; // 고용 탭도 첫 테마로 되돌림
  CONFIG.villagers.forEach((v) => {
    state.villagers[v.id] = { hired: false, level: 1 };
  });
  renderAll();
  renderVillagers(); // 초기화로 고용 상태가 전부 리셋됐으니 "고용"/"직원" 탭 카드·슬롯 표시도 강제로 다시 그림
  switchTab("click");
  switchTheme("forest");
}

function openResetModal() {
  el.resetModal.hidden = false;
}
function closeResetModal() {
  el.resetModal.hidden = true;
}

/* ---------------------------------------------------------
   12-1. 목표 금액 달성 축하 모달
   --------------------------------------------------------- */
function openVictoryModal() {
  if (el.victoryDesc) {
    // 인생한방 도전 실패로 목표 금액(state.goalMoney)이 커진 상태로 달성했을 수도 있으니,
    // 항상 그 순간의 실제 목표 금액을 반영해서 보여준다(고정 텍스트로 두면 실제 달성 금액과 어긋난다).
    el.victoryDesc.textContent = `${formatMoneyCompact(state.goalMoney)}을 전부 모았어요. 정말 대단해요!`;
  }
  if (el.victoryModal) el.victoryModal.hidden = false;
}
function closeVictoryModal() {
  if (el.victoryModal) el.victoryModal.hidden = true;
}

/* ---------------------------------------------------------
   12-2. 업적(도전과제)
   --------------------------------------------------------- */

// 상태가 바뀔 때마다 호출 — 아직 안 딴 업적 중 조건을 만족하는 게 있으면 달성 처리하고 토스트를 띄운다.
// 한 프레임(한 번의 renderEconomy 호출)에 여러 개가 동시에 달성될 수 있으니, 새로 딴 것들을 모아뒀다가
// 토스트는 순서대로 하나씩 보여준다(동시에 여러 개 뜨면 안 보이니까).
let achievementToastQueue = [];
let achievementToastPlaying = false;

function checkAchievements() {
  let newlyUnlocked = [];
  CONFIG.achievements.forEach((a) => {
    if (state.achievements[a.id]) return; // 이미 달성됨
    if (a.check(state)) {
      state.achievements[a.id] = true;
      newlyUnlocked.push(a);
    }
  });

  if (newlyUnlocked.length > 0) {
    achievementToastQueue.push(...newlyUnlocked);
    playNextAchievementToast();
  }
}

function playNextAchievementToast() {
  if (achievementToastPlaying || achievementToastQueue.length === 0) return;
  const a = achievementToastQueue.shift();
  achievementToastPlaying = true;

  el.achievementToastIcon.textContent = a.icon;
  el.achievementToastName.textContent = a.name;
  el.achievementToast.hidden = false;

  // CSS 애니메이션(achievement-toast-anim)이 3.2s로 잡혀있으니 그와 맞춰서 다음 큐로 넘어간다.
  // 애니메이션을 처음부터 다시 재생하려면 DOM에서 껐다 켜야 하므로 reflow를 강제한다.
  el.achievementToast.style.animation = "none";
  void el.achievementToast.offsetWidth;
  el.achievementToast.style.animation = "";

  window.setTimeout(() => {
    el.achievementToast.hidden = true;
    achievementToastPlaying = false;
    playNextAchievementToast();
  }, 3200);
}

function renderAchievementModal() {
  if (!el.achievementList) return;
  const unlockedCount = CONFIG.achievements.filter((a) => state.achievements[a.id]).length;
  el.achievementProgressText.textContent = `${unlockedCount} / ${CONFIG.achievements.length} 달성`;

  el.achievementList.innerHTML = CONFIG.achievements
    .map((a) => {
      const unlocked = !!state.achievements[a.id];
      return `
        <div class="achievement-row${unlocked ? "" : " locked"}">
          <span class="achievement-row-icon">${unlocked ? a.icon : "🔒"}</span>
          <div class="achievement-row-text">
            <span class="achievement-row-name">${unlocked ? a.name : "???"}</span>
            <span class="achievement-row-desc">${unlocked ? a.desc : "아직 잠긴 도전과제예요"}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function openAchievementModal() {
  renderAchievementModal();
  if (el.achievementModal) el.achievementModal.hidden = false;
}
function closeAchievementModal() {
  if (el.achievementModal) el.achievementModal.hidden = true;
}

/* ---------------------------------------------------------
   12-3. "인생한방" (캐릭터2 모드 + Stage 5 전용 하이리스크 이벤트)
   --------------------------------------------------------- */

// 지금 참가비 계산: 실패할 때마다 baseCost가 2배씩 뛴다.
function getFightChallengeCost() {
  return CONFIG.fightChallenge.baseCost * Math.pow(CONFIG.fightChallenge.costMultiplierOnFail, state.fightChallengeFailCount);
}

// 버튼은 "캐릭터2 모드 + Stage 5"일 때만 보인다.
function renderFightChallengeButton() {
  if (!el.fightChallengeBtn) return;
  const isStage5 = (state.currentStage ?? getStage(state.clickLevel)) === 5;
  const shouldShow = state.isDebtorMode && isStage5;
  el.fightChallengeBtn.hidden = !shouldShow;
}

function openFightChallengeModal() {
  const cost = getFightChallengeCost();
  const debtorName = getCustomEntry("main").debtorName || "캐릭터2";
  if (el.fightChallengeTitle) el.fightChallengeTitle.textContent = "인생한방에 도전할까요?";
  el.fightChallengeCost.textContent = formatMoneyCompact(cost);
  // 확률/배수는 CONFIG.fightChallenge 값 그대로 보여준다 — 밸런스를 바꿔도 이 문구가 따로 안 맞을 일이 없게.
  if (el.fightChallengeOdds) {
    const successPct = Math.round(CONFIG.fightChallenge.successChance * 100);
    const failPct = 100 - successPct;
    el.fightChallengeOdds.textContent =
      `성공(${successPct}%)하면 가진 돈이 ${CONFIG.fightChallenge.successMoneyMultiplier}배가 되고, ` +
      `실패(${failPct}%)하면 목표 금액이 ${CONFIG.fightChallenge.failGoalMultiplier}배가 돼요.`;
  }
  el.fightChallengeModal.hidden = false;
}
function closeFightChallengeModal() {
  el.fightChallengeModal.hidden = true;
}

function handleFightChallengeConfirm() {
  const cost = getFightChallengeCost();
  closeFightChallengeModal();

  if (state.money < cost) {
    // 참가비가 부족하면 조용히 취소 — 버튼 자체가 애초에 돈 있을 때만 눌리게 해도 되지만,
    // 안전하게 한 번 더 확인한다.
    return;
  }

  state.money -= cost;

  const success = Math.random() < CONFIG.fightChallenge.successChance;
  if (success) {
    // 성공: 지금 가진 돈이 그대로 배수만큼 불어난다 (목표 금액은 그대로 — 더 이상 한 번에 청산하는 방식이 아니다)
    state.money *= CONFIG.fightChallenge.successMoneyMultiplier;
    state.fightChallengeFailCount = 0; // 성공했으니 다음에 다시 하려면 원래 비용부터 시작
  } else {
    // 실패: 목표 금액이 배수만큼 불어나고, 다음 참가비도 2배로 뛴다.
    // 레벨 상한도 늘어난 목표 금액에 맞춰 함께 늘어난다(getVillagerMaxLevel이 state.goalMoney를 참조).
    state.goalMoney *= CONFIG.fightChallenge.failGoalMultiplier;
    state.fightChallengeFailCount += 1;
  }

  renderAll();
  renderHireThemeContent(); // 목표 금액 변화로 직원 만렙 상한도 바뀌므로 "MAX" 표시를 다시 계산
  showFightResultModal(success);
}

function showFightResultModal(success) {
  el.fightResultModalBox.classList.toggle("result-fail", !success);
  if (success) {
    el.fightResultEmoji.textContent = "🎉";
    el.fightResultTitle.textContent = "성공했어요!";
    el.fightResultDesc.textContent = `인생한방으로 가진 돈이 ${CONFIG.fightChallenge.successMoneyMultiplier}배가 됐어요! 지금 ${formatMoneyCompact(state.money)}`;
  } else {
    el.fightResultEmoji.textContent = "💥";
    el.fightResultTitle.textContent = "실패했어요...";
    el.fightResultDesc.textContent = `목표 금액이 ${CONFIG.fightChallenge.failGoalMultiplier}배로 늘어났어요. 남은 금액: ${formatMoneyCompact(Math.max(0, state.goalMoney - state.money))}`;
  }
  el.fightResultModal.hidden = false;
}
function closeFightResultModal() {
  el.fightResultModal.hidden = true;
}

/* ---------------------------------------------------------
   12-1. 캐릭터 커스텀 (이름/이미지/모션/말풍선)
   --------------------------------------------------------- */
let currentCustomEditId = null; // 지금 편집 모달에서 다루고 있는 대상 id ("main" 또는 직원 id)

// 이미지 파일을 base64 dataURL로 변환한다. 너무 큰 파일은 localStorage 용량(보통 5~10MB)을
// 금방 채우므로, 일정 크기 이상이면 캔버스로 리사이즈해서 용량을 줄인다.
const CUSTOM_IMAGE_MAX_DIMENSION = 512; // 리사이즈 기준 최대 가로/세로(px) — 캐릭터/배경 모두 이 정도면 충분히 선명하다

function fileToResizedDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("이미지 파일만 선택할 수 있어요."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("파일을 읽는 데 실패했어요."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("이미지를 불러오는 데 실패했어요."));
      img.onload = () => {
        let { width, height } = img;
        if (width > CUSTOM_IMAGE_MAX_DIMENSION || height > CUSTOM_IMAGE_MAX_DIMENSION) {
          const scale = CUSTOM_IMAGE_MAX_DIMENSION / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        // PNG는 투명 배경을 지원해서 기본값으로 쓰되, 캐릭터 이미지는 투명 배경이 중요하므로
        // 용량이 좀 커지더라도 PNG를 유지한다.
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// 설정 > "이미지 커스텀" 그리드에 표시할 대상을 그룹으로 묶는다 — 캐릭터 / 직원(테마별 소제목) /
// 테마 아이콘 순서로, 뒤섞여 있던 예전과 달리 한눈에 구분되게 한다. 캐릭터1/캐릭터2는 겉보기엔
// 별개 항목이지만 실제 저장은 둘 다 customData.main에 들어간다(getCustomEntry/setCustomField 참고).
function getCustomGalleryGroups() {
  return [
    {
      label: "캐릭터",
      targets: [
        { id: "main", icon: getDisplayEmoji(MAIN_CHARACTER), name: getDisplayName(MAIN_CHARACTER) },
        { id: "main-debtor", icon: getDisplayEmoji(MAIN_DEBTOR_CHARACTER), name: getDisplayName(MAIN_DEBTOR_CHARACTER) },
      ],
    },
    ...CONFIG.themes.map((theme) => ({
      label: `${getDisplayThemeIcon(theme)} ${theme.name} 직원`,
      targets: CONFIG.villagers
        .filter((v) => v.theme === theme.id)
        .map((v) => ({ id: v.id, icon: getDisplayEmoji(v), name: getDisplayName(v) })),
    })),
    {
      label: "테마 아이콘",
      targets: CONFIG.themes.map((t) => ({ id: `theme-${t.id}`, icon: getDisplayThemeIcon(t), name: t.name })),
    },
  ];
}

function renderCustomTargetList() {
  if (!el.customTargetList) return;
  el.customTargetList.innerHTML = getCustomGalleryGroups()
    .map((group) => {
      const buttons = group.targets
        .map((t) => {
          const hasCustom = Object.keys(getCustomEntry(t.id)).length > 0;
          return `
            <button class="custom-target-btn ${hasCustom ? "has-custom" : ""}" data-custom-id="${t.id}">
              ${hasCustom ? '<span class="custom-target-check">✓</span>' : ""}
              <span class="custom-target-icon">${t.icon}</span>
              <span class="custom-target-name">${t.name}</span>
            </button>`;
        })
        .join("");
      return `<div class="custom-target-group-label">${group.label}</div>${buttons}`;
    })
    .join("");
  el.customTargetList.querySelectorAll("[data-custom-id]").forEach((btn) => {
    btn.addEventListener("click", () => openCustomEditModal(btn.dataset.customId));
  });
}

// 커스텀 편집 모달을 연다. 대상은 세 종류다:
// - "main"/"main-debtor": 캐릭터1/캐릭터2 (이름/이모지/캐릭터 이미지 보임, "main"만 배경 이미지도 보임)
// - "theme-<themeId>": 테마 분류 아이콘 (이모지 필드만 보이고 나머지는 전부 숨김)
// - 그 외(직원 id): 이름/이모지/캐릭터·배경 이미지/모션/말풍선 전부 보임
function openCustomEditModal(id) {
  currentCustomEditId = id;
  const isMain = id === "main";
  const isMainDebtor = id === "main-debtor";
  const isTheme = id.startsWith("theme-");
  const custom = getCustomEntry(id);

  el.customEditError.hidden = true;

  if (isTheme) {
    const themeId = id.replace("theme-", "");
    const theme = CONFIG.themes.find((t) => t.id === themeId);
    el.customEditTitle.textContent = `${theme?.name ?? ""} 아이콘 커스텀`;
  } else if (isMain || isMainDebtor) {
    el.customEditTitle.textContent = isMain ? "캐릭터1 커스텀" : "캐릭터2 커스텀";
  } else {
    el.customEditTitle.textContent = `${CONFIG.villagers.find((v) => v.id === id)?.name ?? ""} 커스텀`;
  }

  // 이모지 필드: 모든 대상에 공통(테마 포함 전부 이모지를 가질 수 있음)
  el.customEditEmojiField.hidden = false;
  el.customEditEmoji.value = custom.emoji || "";
  el.customEditEmoji.placeholder = isMain ? "기본 이모지(🐰) 사용" : isMainDebtor ? "기본 이모지(👻) 사용" : "기본 이모지 사용";

  // 이름 필드: 테마에는 이름이 없음
  el.customEditNameField.hidden = isTheme;
  el.customEditName.value = custom.name || "";
  el.customEditName.placeholder = isMain ? "캐릭터1 (기본 이름 사용)" : isMainDebtor ? "캐릭터2 (기본 이름 사용)" : "기본 이름 사용";

  // 캐릭터 이미지: 테마는 이미지가 아니라 이모지만 다루므로 숨김. "레벨마다 다르게" 토글은
  // 캐릭터1/캐릭터2만(Stage 개념이 있는 대상만) 보여준다.
  el.customEditCharField.hidden = isTheme;
  if (el.customEditCharStagedLabel) el.customEditCharStagedLabel.hidden = !(isMain || isMainDebtor);
  if (el.customEditCharStaged) el.customEditCharStaged.checked = !!custom.characterImageStaged;
  renderStagedImageField(el.customEditCharBody, "characterImage", id);

  // 배경 이미지: 테마와 캐릭터2는 대상 아님(캐릭터2는 캐릭터1과 배경을 공유한다). "레벨마다
  // 다르게" 토글은 캐릭터1(main)만.
  el.customEditBgField.hidden = isTheme || isMainDebtor;
  if (el.customEditBgStagedLabel) el.customEditBgStagedLabel.hidden = !isMain;
  if (el.customEditBgStaged) el.customEditBgStaged.checked = !!custom.backgroundImageStaged;
  renderStagedImageField(el.customEditBgBody, "backgroundImage", id);

  el.customEditMotion.innerHTML = CUSTOM_MOTIONS.map(
    (m) => `<option value="${m.id}">${m.label}</option>`
  ).join("");
  el.customEditMotion.value = custom.motion || "";
  el.customEditMotionField.hidden = isMain || isMainDebtor || isTheme; // 메인/테마는 모션 커스텀 대상 아님

  el.customEditBubble.value = custom.bubbleText || "";
  el.customEditBubbleField.hidden = isMain || isMainDebtor || isTheme; // 말풍선은 직원 전용 기능

  if (el.customGalleryModal) el.customGalleryModal.hidden = true; // 그리드 위로 편집 모달만 보이게
  el.customEditModal.hidden = false;
}

function closeCustomEditModal() {
  el.customEditModal.hidden = true;
  currentCustomEditId = null;
  renderCustomTargetList(); // 방금 편집한 내용이 그리드의 아이콘/"✓" 표시에 반영되도록
  if (el.customGalleryModal) el.customGalleryModal.hidden = false; // 그리드 모달로 복귀
}

function openCustomGalleryModal() {
  renderCustomTargetList();
  if (el.customGalleryModal) el.customGalleryModal.hidden = false;
}

function closeCustomGalleryModal() {
  if (el.customGalleryModal) el.customGalleryModal.hidden = true;
}

// 편집 모달의 각 입력이 바뀔 때마다 즉시 저장 + 화면 반영한다 (별도의 "저장" 버튼 없이 바로 적용).
function applyCustomEditChange(field, value) {
  if (!currentCustomEditId) return;
  const ok = setCustomField(currentCustomEditId, field, value);
  if (!ok) {
    el.customEditError.textContent = "저장 공간이 부족해요. 다른 이미지를 지우고 다시 시도해보세요.";
    el.customEditError.hidden = false;
    return;
  }
  el.customEditError.hidden = true;
  if (currentCustomEditId === "main" || currentCustomEditId === "main-debtor") {
    renderDebtorMode(); // 캐릭터1/캐릭터2 이름/이모지/이미지 갱신
  } else if (currentCustomEditId.startsWith("theme-")) {
    // 테마 아이콘은 직원 고용 화면의 테마탭과 직원 확인 화면의 테마탭 둘 다에 쓰인다
    renderHireThemeTabs();
    renderHireThemeContent(); // "아직 열리지 않은 지역" 안내 문구에도 테마 아이콘이 들어가므로 함께 갱신
    renderThemeButtons(); // 직원 확인 화면의 테마 서브탭 아이콘 갱신
  } else {
    refreshVillagerSlot(currentCustomEditId); // 직원 확인 화면 슬롯 갱신
    renderHireThemeContent(); // 직원 고용 화면 카드도 이름/이미지가 바뀌었을 수 있으니 갱신
  }
}

// 업로드 슬롯 하나(단일 모드 1개, 또는 스테이지 모드의 Stage 1~N 칸 중 하나)의 HTML.
// stage가 있으면 그 슬롯이 담당하는 필드는 "${field}Stage${stage}"(예: characterImageStage3),
// 없으면 항상 쓰는 단일 필드("${field}")를 담당한다 — data-stage로 표시해서 이벤트에서 구분한다.
function buildUploadSlotHtml(value, stage) {
  const hasImage = !!value;
  const stageAttr = stage ? ` data-stage="${stage}"` : "";
  return `
    <div class="custom-upload-slot">
      ${stage ? `<span class="custom-edit-stage-label">Stage ${stage}</span>` : ""}
      <label class="custom-upload-dropzone ${hasImage ? "has-image" : ""}" data-role="dropzone"${stageAttr}>
        ${hasImage
          ? `<img class="custom-upload-preview" src="${value}" alt="" />`
          : `<span class="custom-upload-icon">📷</span><span class="custom-upload-hint">클릭 또는 드래그</span>`}
        <input type="file" class="custom-upload-input" data-role="file" accept="image/*"${stageAttr} />
      </label>
      ${hasImage ? `<button type="button" class="custom-upload-clear" data-role="clear"${stageAttr}>삭제</button>` : ""}
    </div>`;
}

// 캐릭터/배경 이미지 필드 컨테이너(bodyEl) 하나를 그린다. field는 "characterImage" 또는
// "backgroundImage" — id의 "${field}Staged"가 켜져 있으면 Stage 1~N 업로드 슬롯을, 꺼져 있으면
// 단일 업로드 슬롯 하나를 보여준다. 업로드/삭제할 때마다 이 함수를 다시 불러 미리보기를 갱신한다
// (모달 전체가 아니라 이 컨테이너만 다시 그리므로 다른 필드 입력 포커스에 영향 없음).
function renderStagedImageField(bodyEl, field, id) {
  if (!bodyEl) return;
  const custom = getCustomEntry(id);
  const staged = !!custom[`${field}Staged`];

  bodyEl.innerHTML = staged
    ? `<div class="custom-edit-stage-grid">${Array.from({ length: MAIN_STAGE_COUNT }, (_, i) => i + 1)
        .map((stage) => buildUploadSlotHtml(custom[`${field}Stage${stage}`] || "", stage))
        .join("")}</div>`
    : `<div class="custom-edit-image-row">${buildUploadSlotHtml(custom[field] || "", null)}</div>`;

  const targetFieldOf = (node) => (node.dataset.stage ? `${field}Stage${node.dataset.stage}` : field);

  bodyEl.querySelectorAll('[data-role="dropzone"]').forEach((zone) => {
    const fileInput = zone.querySelector('[data-role="file"]');
    const handleFile = async (file) => {
      if (!file) return;
      try {
        const dataUrl = await fileToResizedDataUrl(file);
        applyCustomEditChange(targetFieldOf(zone), dataUrl);
        renderStagedImageField(bodyEl, field, id);
      } catch (e) {
        el.customEditError.textContent = e.message || "이미지를 불러오지 못했어요.";
        el.customEditError.hidden = false;
      }
    };
    fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));
    // 드래그 앤 드롭 업로드 — 기본 파일 선택 버튼 없이 영역째로 드래그해서 올릴 수 있게.
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("dragover");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("dragover");
      handleFile(e.dataTransfer.files[0]);
    });
  });

  bodyEl.querySelectorAll('[data-role="clear"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      applyCustomEditChange(targetFieldOf(btn), "");
      renderStagedImageField(bodyEl, field, id);
    });
  });
}

// "레벨(Stage)마다 다르게" 토글이 바뀌었을 때: 플래그를 저장하고 해당 필드 컨테이너를 다시 그린다.
function handleStagedToggle(field, bodyEl, checked) {
  applyCustomEditChange(`${field}Staged`, checked ? "1" : "");
  renderStagedImageField(bodyEl, field, currentCustomEditId);
}

// 커스텀 설정 전체를 파일로 내보낸다 (이미지 포함 — dataURL 형태 그대로라 파일 하나로 완결됨).
function exportCustomData() {
  const blob = new Blob([JSON.stringify(customData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "village-clicker-custom.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 내보낸 파일을 다시 불러온다. 형식이 이상하면 조용히 무시하지 않고 에러를 알려준다.
function importCustomData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("올바른 커스텀 설정 파일이 아니에요.");
      }
      customData = parsed;
      const ok = saveCustomData();
      if (!ok) {
        window.alert("저장 공간이 부족해서 가져오기에 실패했어요.");
        return;
      }
      // 이미 만들어진 직원 슬롯들을 전부 새로 그려서 가져온 커스텀이 즉시 반영되게 한다.
      CONFIG.villagers.forEach((v) => refreshVillagerSlot(v.id));
      renderDebtorMode();
      renderHireThemeContent();
      renderCustomTargetList();
      window.alert("커스텀 설정을 가져왔어요!");
    } catch (e) {
      window.alert("파일을 읽는 데 실패했어요: " + (e.message || "형식이 올바르지 않아요."));
    }
  };
  reader.readAsText(file);
}

// 커스텀 설정 전체를 초기화한다 (게임 진행 상황과는 무관 — 이름/이미지/모션/말풍선만 지운다).
function resetAllCustomData() {
  customData = {};
  saveCustomData();
  CONFIG.villagers.forEach((v) => refreshVillagerSlot(v.id));
  renderDebtorMode();
  renderHireThemeContent();
  closeCustomEditModal();
}

// 모달 바깥(반투명 배경) 클릭 시 닫히게 한다. 모달 박스 안쪽 클릭은 e.target이 overlayEl 자신이
// 아니므로(자식 요소) 무시된다 — 그래서 굳이 stopPropagation 없이도 안전하게 동작한다.
function setupOverlayClickToClose(overlayEl, closeFn) {
  if (!overlayEl) return;
  overlayEl.addEventListener("click", (e) => {
    if (e.target === overlayEl) closeFn();
  });
}

/* ---------------------------------------------------------
   13. 초기화
   --------------------------------------------------------- */
function init() {
  renderGambleBet();

  el.mainCharacter.addEventListener("click", handleClick);
  el.upgradeBtn.addEventListener("click", handleUpgrade);
  if (el.feverUpgradeBtn) el.feverUpgradeBtn.addEventListener("click", handleFeverUpgrade);
  el.spinBtn.addEventListener("click", handleSpin);

  el.tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  el.themeButtons.forEach((btn) => {
    btn.addEventListener("click", () => switchTheme(btn.dataset.theme));
  });

  // 배속 버튼 (화면 우측 최상단 고정) + 해금 안내 팝업
  if (el.speedToggleBtn) el.speedToggleBtn.addEventListener("click", handleSpeedToggle);
  if (el.speedLockCloseBtn) el.speedLockCloseBtn.addEventListener("click", closeSpeedLockModal);

  // 테마 색상 스와치
  if (el.themeColorOptions) {
    el.themeColorOptions.querySelectorAll(".theme-color-btn").forEach((btn) => {
      btn.addEventListener("click", () => handleThemeColorSelect(btn.dataset.theme));
    });
  }
  applyThemeColor(loadThemeColor()); // 저장된 테마(없으면 기본 초록)를 페이지 로드 시 바로 적용

  // 저장/불러오기 버튼 (슬롯이 동적으로 재생성되므로 컨테이너에 위임)
  if (el.saveSlots) {
    el.saveSlots.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const slot = Number(btn.dataset.slot);
      if (btn.dataset.action === "save") handleSaveSlot(slot);
      else if (btn.dataset.action === "load") handleLoadSlot(slot);
    });
  }

  // 게임 초기화 모달
  if (el.resetBtn) el.resetBtn.addEventListener("click", openResetModal);
  if (el.resetCancelBtn) el.resetCancelBtn.addEventListener("click", closeResetModal);
  if (el.resetConfirmBtn) {
    el.resetConfirmBtn.addEventListener("click", () => {
      resetGame();
      closeResetModal();
    });
  }

  // 베팅 금액: 화살표 클릭 + 휠 스크롤 + 좌우 드래그(모바일 스와이프 포함, setupGambleBetDrag)로 조절
  if (el.gambleBetPrevBtn) el.gambleBetPrevBtn.addEventListener("click", () => handleGambleBetStep(-1));
  if (el.gambleBetNextBtn) el.gambleBetNextBtn.addEventListener("click", () => handleGambleBetStep(1));
  if (el.gambleBetStepper) {
    el.gambleBetStepper.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault(); // 스크롤이 뒤의 콘텐츠 영역까지 흘러가지 않게 막는다
        handleGambleBetStep(e.deltaY > 0 ? 1 : -1);
      },
      { passive: false }
    );
  }
  setupGambleBetDrag();

  // 룰렛 확률표 모달
  if (el.payoutTableBtn) el.payoutTableBtn.addEventListener("click", openPayoutModal);
  if (el.payoutCloseBtn) el.payoutCloseBtn.addEventListener("click", closePayoutModal);

  // 목표 달성 축하 모달: 계속하기는 그냥 닫고, 초기화하기는 기존 초기화 확인 모달로 넘긴다
  if (el.victoryContinueBtn) el.victoryContinueBtn.addEventListener("click", closeVictoryModal);
  if (el.victoryResetBtn) {
    el.victoryResetBtn.addEventListener("click", () => {
      closeVictoryModal();
      openResetModal();
    });
  }

  // 업적(도전과제) 모달
  if (el.achievementBtn) el.achievementBtn.addEventListener("click", openAchievementModal);
  if (el.achievementCloseBtn) el.achievementCloseBtn.addEventListener("click", closeAchievementModal);

  // 피버타임 도우미 선택 모달 (설정 > 🔥 피버 직원)
  if (el.feverHelperOpenBtn) el.feverHelperOpenBtn.addEventListener("click", openFeverHelperModal);
  if (el.feverHelperCloseBtn) el.feverHelperCloseBtn.addEventListener("click", closeFeverHelperModal);

  // "인생한방" 버튼/모달
  if (el.fightChallengeBtn) el.fightChallengeBtn.addEventListener("click", openFightChallengeModal);
  if (el.fightChallengeCancelBtn) el.fightChallengeCancelBtn.addEventListener("click", closeFightChallengeModal);
  if (el.fightChallengeConfirmBtn) el.fightChallengeConfirmBtn.addEventListener("click", handleFightChallengeConfirm);
  if (el.fightResultCloseBtn) el.fightResultCloseBtn.addEventListener("click", closeFightResultModal);

  // 캐릭터 커스텀 (이름/이미지/모션/말풍선)
  if (el.customGalleryBtn) el.customGalleryBtn.addEventListener("click", openCustomGalleryModal);
  if (el.customGalleryCloseBtn) el.customGalleryCloseBtn.addEventListener("click", closeCustomGalleryModal);
  if (el.customExportBtn) el.customExportBtn.addEventListener("click", exportCustomData);
  if (el.customImportBtn) el.customImportBtn.addEventListener("click", () => el.customImportFile.click());
  if (el.customImportFile) {
    el.customImportFile.addEventListener("change", () => {
      const file = el.customImportFile.files[0];
      if (file) importCustomData(file);
      el.customImportFile.value = "";
    });
  }
  if (el.customEditEmoji) {
    el.customEditEmoji.addEventListener("input", () => applyCustomEditChange("emoji", el.customEditEmoji.value.trim()));
  }
  if (el.customEditName) {
    el.customEditName.addEventListener("input", () => applyCustomEditChange("name", el.customEditName.value.trim()));
  }
  if (el.customEditCharStaged) {
    el.customEditCharStaged.addEventListener("change", () =>
      handleStagedToggle("characterImage", el.customEditCharBody, el.customEditCharStaged.checked)
    );
  }
  if (el.customEditBgStaged) {
    el.customEditBgStaged.addEventListener("change", () =>
      handleStagedToggle("backgroundImage", el.customEditBgBody, el.customEditBgStaged.checked)
    );
  }
  if (el.customEditMotion) {
    el.customEditMotion.addEventListener("change", () => applyCustomEditChange("motion", el.customEditMotion.value));
  }
  if (el.customEditBubble) {
    el.customEditBubble.addEventListener("input", () => applyCustomEditChange("bubbleText", el.customEditBubble.value));
  }
  if (el.customEditResetBtn) {
    el.customEditResetBtn.addEventListener("click", () => {
      if (window.confirm("모든 캐릭터의 커스텀 이름/이미지/모션/말풍선을 전부 초기화할까요?")) {
        resetAllCustomData();
      }
    });
  }
  if (el.customEditCloseBtn) el.customEditCloseBtn.addEventListener("click", closeCustomEditModal);

  // 모달 바깥 클릭 시 닫기 (전부 공통 동작)
  setupOverlayClickToClose(el.resetModal, closeResetModal);
  setupOverlayClickToClose(el.payoutModal, closePayoutModal);
  setupOverlayClickToClose(el.victoryModal, closeVictoryModal);
  setupOverlayClickToClose(el.achievementModal, closeAchievementModal);
  setupOverlayClickToClose(el.speedLockModal, closeSpeedLockModal);
  setupOverlayClickToClose(el.feverHelperModal, closeFeverHelperModal);
  setupOverlayClickToClose(el.customGalleryModal, closeCustomGalleryModal);
  setupOverlayClickToClose(el.customEditModal, closeCustomEditModal);
  setupOverlayClickToClose(el.fightChallengeModal, closeFightChallengeModal);
  setupOverlayClickToClose(el.fightResultModal, closeFightResultModal);

  buildVillagerDom(); // "직원 확인" 화면의 15명 슬롯(이미지+잠금표시) DOM 생성

  buildWheelBackground();
  renderHireThemeTabs(); // "직원 고용" 화면 초기 테마탭 렌더
  renderThemeButtons(); // "직원 확인" 화면 테마 서브탭 아이콘 커스텀 반영
  renderCustomTargetList(); // "설정 > 🎨 커스텀 이미지" 팝업 목록 초기 렌더
  renderAll();
  renderHireThemeContent(); // 고용 화면 카드는 renderEconomy의 가벼운 갱신 대상이 아니므로 최초 1회 명시적으로 그림
  startPassiveIncomeLoop();
  setupBasicDeterrents();
}

// 우클릭 메뉴/개발자도구 단축키를 막는다 — 소스나 업로드한 이미지를 그냥 긁어가는 걸 "귀찮게"
// 만드는 수준의 장치일 뿐이다. 브라우저 메뉴로 개발자도구를 열거나 다른 브라우저를 쓰면 전부
// 우회되므로, 마음먹고 코드를 보려는 사람을 실제로 막지는 못한다(클라이언트 코드는 원천적으로
// 완전히 숨길 방법이 없다) — 그 점을 이해한 상태에서 쓰는 가벼운 저지선으로만 남겨둔다.
function setupBasicDeterrents() {
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("keydown", (e) => {
    const key = e.key.toUpperCase();
    const isDevToolsCombo =
      key === "F12" ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey && ["I", "J", "C"].includes(key)) || // 개발자도구/콘솔/요소선택
      ((e.ctrlKey || e.metaKey) && key === "U"); // 페이지 소스 보기
    if (isDevToolsCombo) e.preventDefault();
  });
  // 흔한 "자기 자신 XSS" 사기(콘솔에 코드를 붙여넣게 유도) 예방 겸, 소스를 그냥 열어보는 사람에게
  // 남기는 안내 문구.
  console.log("%c잠깐!", "color:#C93A5F; font-size:32px; font-weight:bold;");
  console.log(
    "%c이 콘솔은 개발자용입니다. 누군가 여기에 코드를 붙여넣으라고 시켰다면 대부분 사기예요.",
    "font-size:14px;"
  );
}

init();
