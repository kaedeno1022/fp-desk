"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSimulation } from "@/lib/simulations";
import {
  buildInputFromInterview,
  interviewSimulationName,
  type InterviewAnswers,
} from "@/lib/engine/interview";

type Step = {
  id: string;
  question: string;
  help?: string;
  type: "choice" | "number" | "text";
  choices?: { label: string; value: string }[];
  unit?: string;
  placeholder?: string;
  visible?: (a: InterviewAnswers) => boolean;
};

const STEPS: Step[] = [
  {
    id: "clientName",
    question: "お名前を教えてください",
    help: "シミュレーションの表示名に使います（例: 田中）。空欄でも進めます",
    type: "text",
    placeholder: "田中",
  },
  {
    id: "selfBirthYear",
    question: "生まれた年（西暦）は？",
    type: "number",
    unit: "年",
    placeholder: "1990",
  },
  {
    id: "hasSpouse",
    question: "配偶者はいますか？",
    type: "choice",
    choices: [
      { label: "いる", value: "yes" },
      { label: "いない", value: "no" },
    ],
  },
  {
    id: "spouseBirthYear",
    question: "配偶者の生まれた年（西暦）は？",
    type: "number",
    unit: "年",
    visible: (a) => a.hasSpouse === "yes",
  },
  {
    id: "childCount",
    question: "お子さまは何人ですか？（予定を含む）",
    type: "choice",
    choices: ["0", "1", "2", "3", "4"].map((n) => ({ label: `${n}人`, value: n })),
  },
  ...[1, 2, 3, 4].map<Step>((k) => ({
    id: `child${k}Year`,
    question: `${k}人目のお子さまの生まれた年（西暦）は？`,
    help: "これから生まれる予定なら予定年を入れてください",
    type: "number",
    unit: "年",
    visible: (a) => Number(a.childCount) >= k,
  })),
  {
    id: "selfWork",
    question: "現在の働き方は？",
    type: "choice",
    choices: [
      { label: "会社員・公務員", value: "employee" },
      { label: "自営業・フリーランス", value: "selfEmployed" },
      { label: "働いていない", value: "none" },
    ],
  },
  {
    id: "selfIncome",
    question: "年収（額面）は？",
    help: "自営業の場合は経費を引いた事業所得を入れてください",
    type: "number",
    unit: "万円",
    visible: (a) => a.selfWork !== "none" && a.selfWork !== undefined,
  },
  {
    id: "selfRetireAge",
    question: "何歳まで働く予定ですか?",
    type: "number",
    unit: "歳",
    placeholder: "65",
    visible: (a) => a.selfWork === "employee" || a.selfWork === "selfEmployed",
  },
  {
    id: "selfSeverance",
    question: "退職金の見込み額は？",
    help: "わからなければ0のままで大丈夫です（後から調整できます）",
    type: "number",
    unit: "万円",
    visible: (a) => a.selfWork === "employee",
  },
  {
    id: "spouseWork",
    question: "配偶者の働き方は？",
    type: "choice",
    choices: [
      { label: "会社員・公務員", value: "employee" },
      { label: "自営業・フリーランス", value: "selfEmployed" },
      { label: "働いていない", value: "none" },
    ],
    visible: (a) => a.hasSpouse === "yes",
  },
  {
    id: "spouseIncome",
    question: "配偶者の年収（額面）は？",
    type: "number",
    unit: "万円",
    visible: (a) => a.hasSpouse === "yes" && a.spouseWork !== "none" && a.spouseWork !== undefined,
  },
  {
    id: "housingStatus",
    question: "現在のお住まいは？",
    type: "choice",
    choices: [
      { label: "賃貸", value: "rent" },
      { label: "持ち家（ローン返済中）", value: "loan" },
      { label: "持ち家（完済済み）", value: "owned" },
      { label: "実家など（家賃負担なし）", value: "free" },
    ],
  },
  {
    id: "rentMonthly",
    question: "毎月の家賃は？",
    type: "number",
    unit: "万円/月",
    visible: (a) => a.housingStatus === "rent",
  },
  {
    id: "planPurchase",
    question: "住宅を購入する予定はありますか？",
    type: "choice",
    choices: [
      { label: "ある", value: "yes" },
      { label: "ない・未定", value: "no" },
    ],
    visible: (a) => a.housingStatus === "rent",
  },
  {
    id: "purchaseInYears",
    question: "何年後くらいに購入したいですか？",
    type: "number",
    unit: "年後",
    placeholder: "3",
    visible: (a) => a.planPurchase === "yes",
  },
  {
    id: "purchasePrice",
    question: "物件の予算は？",
    type: "number",
    unit: "万円",
    placeholder: "4000",
    visible: (a) => a.planPurchase === "yes",
  },
  {
    id: "downPayment",
    question: "頭金はいくら入れる予定ですか？",
    type: "number",
    unit: "万円",
    placeholder: "1000",
    visible: (a) => a.planPurchase === "yes",
  },
  {
    id: "loanBalance",
    question: "住宅ローンの残高は？",
    type: "number",
    unit: "万円",
    visible: (a) => a.housingStatus === "loan",
  },
  {
    id: "loanYearsLeft",
    question: "ローンの残り返済年数は？",
    type: "number",
    unit: "年",
    visible: (a) => a.housingStatus === "loan",
  },
  {
    id: "loanRate",
    question: "ローンの金利は？",
    type: "number",
    unit: "%",
    placeholder: "1.0",
    visible: (a) => a.housingStatus === "loan",
  },
  {
    id: "hasDebt1",
    question: "住宅ローン以外に返済中の借入はありますか？",
    help: "奨学金・自動車ローン・カードローンなど",
    type: "choice",
    choices: [
      { label: "ある", value: "yes" },
      { label: "ない", value: "no" },
    ],
  },
  ...[1, 2].flatMap<Step>((k) => [
    ...(k === 2
      ? [
          {
            id: "hasDebt2",
            question: "ほかにも借入はありますか？",
            help: "3件以上ある場合は、作成後の編集画面で追加できます",
            type: "choice" as const,
            choices: [
              { label: "ある", value: "yes" },
              { label: "ない", value: "no" },
            ],
            visible: (a: InterviewAnswers) => a.hasDebt1 === "yes",
          },
        ]
      : []),
    {
      id: `debt${k}Type`,
      question: `${k === 1 ? "" : "2件目の"}借入の種類は？`,
      type: "choice" as const,
      choices: [
        { label: "奨学金", value: "scholarship" },
        { label: "自動車ローン", value: "car" },
        { label: "その他", value: "other" },
      ],
      visible: (a: InterviewAnswers) => a[`hasDebt${k}`] === "yes",
    },
    {
      id: `debt${k}Balance`,
      question: `${k === 1 ? "" : "2件目の"}借入の残高は？`,
      type: "number" as const,
      unit: "万円",
      visible: (a: InterviewAnswers) => a[`hasDebt${k}`] === "yes",
    },
    {
      id: `debt${k}YearsLeft`,
      question: `${k === 1 ? "" : "2件目の"}残り返済年数は？`,
      type: "number" as const,
      unit: "年",
      visible: (a: InterviewAnswers) => a[`hasDebt${k}`] === "yes",
    },
    {
      id: `debt${k}Rate`,
      question: `${k === 1 ? "" : "2件目の"}金利は？`,
      help: "奨学金（第一種）など無利子なら0のまま進んでください",
      type: "number" as const,
      unit: "%",
      placeholder: "0",
      visible: (a: InterviewAnswers) => a[`hasDebt${k}`] === "yes",
    },
  ]),
  {
    id: "livingMonthly",
    question: "毎月の生活費はどのくらいですか？",
    help: "家賃・住宅ローン・教育費は除いた金額です（食費・光熱費・通信費・娯楽など）",
    type: "number",
    unit: "万円/月",
    placeholder: "20",
  },
  {
    id: "cashSavings",
    question: "預貯金の合計は？",
    type: "number",
    unit: "万円",
  },
  {
    id: "nisaBalance",
    question: "NISAの残高は？",
    help: "していなければ0のままで大丈夫です",
    type: "number",
    unit: "万円",
  },
  {
    id: "nisaAnnual",
    question: "NISAの積立額は年間いくらですか？",
    help: "これから始める予定の額でも構いません",
    type: "number",
    unit: "万円/年",
  },
  {
    id: "idecoBalance",
    question: "iDeCoの残高は？",
    help: "していなければ0のままで大丈夫です",
    type: "number",
    unit: "万円",
  },
  {
    id: "idecoMonthly",
    question: "iDeCoの掛金は毎月いくらですか？",
    type: "number",
    unit: "万円/月",
    visible: (a) => num(a, "idecoBalance") > 0,
  },
  {
    id: "pensionAnnual",
    question: "ねんきん定期便に記載の年金見込額（年額）は？",
    help: "手元になければ空欄のまま進んでください（概算180万円で仮置きし、後から調整できます）",
    type: "number",
    unit: "万円/年",
    placeholder: "180",
  },
  {
    id: "lifeInsurance",
    question: "生命保険料は年間いくら払っていますか？",
    type: "number",
    unit: "万円/年",
  },
];

function num(a: InterviewAnswers, key: string): number {
  const v = Number(a[key]);
  return Number.isFinite(v) ? v : 0;
}

const inputCls =
  "w-full rounded-md border border-line bg-card px-3 py-2.5 text-lg text-ink num";

export function InterviewWizard() {
  const router = useRouter();
  const [answers, setAnswers] = useState<InterviewAnswers>({});
  const [stepIdx, setStepIdx] = useState(0);
  const [draft, setDraft] = useState("");

  const visibleSteps = STEPS.filter((s) => s.visible?.(answers) ?? true);
  const done = stepIdx >= visibleSteps.length;
  const step = done ? null : visibleSteps[stepIdx];

  const commit = (value: string | number) => {
    if (!step) return;
    setAnswers((prev) => ({ ...prev, [step.id]: value }));
    setStepIdx((i) => i + 1);
    setDraft("");
  };

  const back = () => {
    setStepIdx((i) => Math.max(0, i - 1));
    setDraft("");
  };

  if (done) {
    const finalAnswers = answers;
    const input = buildInputFromInterview(finalAnswers);
    const name = interviewSimulationName(finalAnswers);
    const answered = visibleSteps.filter((s) => finalAnswers[s.id] !== undefined && finalAnswers[s.id] !== "");
    return (
      <div className="rounded-lg border border-line bg-card p-6">
        <h2 className="mb-1 border-l-[3px] border-accent pl-3 text-base font-bold text-ink">
          ヒアリング完了
        </h2>
        <p className="mb-4 text-xs text-ink2">
          この内容でシミュレーションを作成します。教育方針・自治体料率・運用利回りなどの詳細は作成後の編集画面で調整してください。
        </p>
        <dl className="mb-6 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {answered.map((s) => (
            <div key={s.id} className="flex justify-between gap-3 border-b border-line py-1">
              <dt className="text-xs text-ink2">{s.question}</dt>
              <dd className="num text-ink">
                {s.type === "choice"
                  ? s.choices?.find((c) => c.value === finalAnswers[s.id])?.label
                  : `${finalAnswers[s.id]}${s.unit ?? ""}`}
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/simulations/edit?id=${createSimulation(name, input)}`)}
            className="rounded-md bg-accent px-6 py-2 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90"
          >
            「{name}」を作成する
          </button>
          <button type="button" onClick={back} className="text-sm text-ink2 hover:underline">
            ← 戻って修正
          </button>
        </div>
      </div>
    );
  }

  const progress = ((stepIdx + 1) / (visibleSteps.length + 1)) * 100;

  return (
    <div>
      {/* 進捗バー */}
      <div className="mb-6 h-1 w-full overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mb-2 num text-xs text-ink2">
        {stepIdx + 1} / {visibleSteps.length}
      </div>

      <div className="rounded-lg border border-line bg-card p-6">
        <h2 className="text-lg font-bold text-ink">{step!.question}</h2>
        {step!.help && <p className="mt-1 text-xs text-ink2">{step!.help}</p>}

        <div className="mt-5">
          {step!.type === "choice" ? (
            <div className="flex flex-col gap-2">
              {step!.choices!.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => commit(c.value)}
                  className={`rounded-md border px-4 py-3 text-left text-sm transition-colors ${
                    answers[step!.id] === c.value
                      ? "border-accent text-accent"
                      : "border-line text-ink hover:border-accent"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (step!.type === "number") {
                  commit(draft === "" ? Number(step!.placeholder ?? 0) : Number(draft));
                } else {
                  commit(draft);
                }
              }}
              className="flex items-end gap-3"
            >
              <input
                autoFocus
                type={step!.type === "number" ? "number" : "text"}
                step="any"
                className={inputCls}
                placeholder={step!.placeholder}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              {step!.unit && <span className="pb-2.5 text-sm text-ink2">{step!.unit}</span>}
              <button
                type="submit"
                className="rounded-md bg-accent px-6 py-2.5 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90"
              >
                次へ
              </button>
            </form>
          )}
        </div>
      </div>

      {stepIdx > 0 && (
        <button type="button" onClick={back} className="mt-3 text-sm text-ink2 hover:underline">
          ← 前の質問に戻る
        </button>
      )}
    </div>
  );
}
