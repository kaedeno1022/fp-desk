"use client";

import { useActionState, useMemo, useState } from "react";
import { saveSimulationAction, type SaveState } from "@/app/simulations/actions";
import type { ChildInput, MunicipalRates, PersonInput, SimulationInput } from "@/lib/engine/input";
import type { NhiCategory } from "@/lib/engine/tables";
import { createDefaultPerson } from "@/lib/engine/input";
import { simulate } from "@/lib/engine/simulate";
import { loadTaxTables } from "@/lib/engine/tables";
import { MonteCarloPanel } from "./montecarlo-panel";
import { SimulationResults } from "./results";

type OtherSim = { id: string; name: string; input: SimulationInput };

const inputCls =
  "w-full rounded-md border border-line bg-card px-2 py-1.5 text-sm text-ink";

function fmtMoneyShort(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 100_000_000) return `${(v / 100_000_000).toFixed(2)}億円`;
  return `${Math.round(v / 10_000).toLocaleString("ja-JP")}万円`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink2">
      {label}
      {children}
    </label>
  );
}

/**
 * 数値入力の共通実装。
 * 編集中はローカルの下書き文字列を表示し、空欄を許す（0の強制挿入で「0100」に
 * なる問題を避ける）。有効な数値のときだけ親へ反映し、空のままフォーカスを
 * 外したら0として確定する
 */
function NumberInput({
  value,
  onChange,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="number"
      step={step}
      className={`${inputCls} num`}
      value={draft ?? String(value)}
      onFocus={() => setDraft(String(value))}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== "" && Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => {
        if (draft === "") onChange(0);
        setDraft(null);
      }}
    />
  );
}

/** 万円単位で入出力する金額フィールド */
function Money({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={`${label}（万円）`}>
      <NumberInput
        value={value / 10000}
        onChange={(v) => onChange(Math.round(v * 10000))}
      />
    </Field>
  );
}

/** %単位で入出力する率フィールド */
function Pct({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={`${label}（%）`}>
      <NumberInput
        step="0.1"
        value={Math.round(value * 1000) / 10}
        onChange={(v) => onChange(v / 100)}
      />
    </Field>
  );
}

function Num({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={label}>
      <NumberInput value={value} onChange={onChange} />
    </Field>
  );
}

/** 円単位の金額フィールド（均等割など万円だと桁が細かすぎるもの用） */
function Yen({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={`${label}（円）`}>
      <NumberInput value={value} onChange={onChange} />
    </Field>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-card p-5">
      <div className="mb-4 border-l-[3px] border-accent pl-3">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-ink2">{description}</p>}
      </div>
      {children}
    </section>
  );
}

const initialSaveState: SaveState = { message: null, error: null };

export function SimulationEditor({
  id,
  initialName,
  initialInput,
  others,
}: {
  id: string;
  initialName: string;
  initialInput: SimulationInput;
  others: OtherSim[];
}) {
  const [name, setName] = useState(initialName);
  const [input, setInput] = useState<SimulationInput>(initialInput);
  const [compareId, setCompareId] = useState("");
  const [saveState, saveAction, saving] = useActionState(saveSimulationAction, initialSaveState);

  const t = useMemo(() => loadTaxTables(), []);
  const result = useMemo(() => simulate(input, t), [input, t]);
  const compare = useMemo(() => {
    const other = others.find((o) => o.id === compareId);
    if (!other) return null;
    return { name: other.name, result: simulate(other.input, t) };
  }, [compareId, others, t]);

  const patch = (p: Partial<SimulationInput>) => setInput((prev) => ({ ...prev, ...p }));
  const patchAdult = (i: number, p: Partial<PersonInput>) =>
    setInput((prev) => ({
      ...prev,
      adults: prev.adults.map((a, ai) => (ai === i ? { ...a, ...p } : a)),
    }));
  const patchChild = (i: number, p: Partial<ChildInput>) =>
    setInput((prev) => ({
      ...prev,
      children: prev.children.map((c, ci) => (ci === i ? { ...c, ...p } : c)),
    }));
  const patchAccounts = (p: Partial<SimulationInput["accounts"]>) =>
    setInput((prev) => ({ ...prev, accounts: { ...prev.accounts, ...p } }));
  const patchMunicipal = (p: Partial<MunicipalRates>) =>
    setInput((prev) => ({ ...prev, municipal: { ...prev.municipal, ...p } }));
  const patchNhi = (cat: "medical" | "support" | "care", p: Partial<NhiCategory>) =>
    setInput((prev) => ({
      ...prev,
      municipal: {
        ...prev.municipal,
        nhi: { ...prev.municipal.nhi, [cat]: { ...prev.municipal.nhi[cat], ...p } },
      },
    }));

  const final = result.years[result.years.length - 1];
  const minCash = result.years.reduce(
    (min, y) => (y.assets.cash < min.assets.cash ? y : min),
    result.years[0]
  );

  return (
    <div className="flex flex-col gap-4">
      {/* 計器バー: 入力の変更が即座に数字へ反映される。下地を紙色で塗り、透過を防ぐ */}
      <div className="sticky top-0 z-10 -mx-6 -mt-5 bg-paper px-6 pb-2 pt-3">
      <form
        action={saveAction}
        className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-line bg-card px-4 py-2.5 shadow-sm"
      >
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="inputJson" value={JSON.stringify(input)} />
        <input
          type="text"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${inputCls} max-w-56 font-medium`}
          aria-label="シミュレーション名"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-accent px-5 py-1.5 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          保存
        </button>
        {saveState.message && <span className="text-xs text-ink2">{saveState.message}</span>}
        {saveState.error && <span className="text-xs text-critical">{saveState.error}</span>}

        <div className="ml-auto flex items-center gap-5">
          <div className="text-right">
            <div className="text-[10px] leading-tight text-ink2">最終資産</div>
            <div className="num text-sm font-bold text-ink">
              {final ? fmtMoneyShort(final.assets.total) : "—"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] leading-tight text-ink2">現金の最小</div>
            <div
              className={`num text-sm font-bold ${minCash && minCash.assets.cash < 0 ? "text-critical" : "text-ink"}`}
            >
              {minCash ? fmtMoneyShort(minCash.assets.cash) : "—"}
            </div>
          </div>
          <label className="flex items-center gap-2 whitespace-nowrap text-xs text-ink2">
            比較
            <select
              className={inputCls}
              value={compareId}
              onChange={(e) => setCompareId(e.target.value)}
            >
              <option value="">なし</option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </form>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="前提条件" description="シミュレーションの期間・物価・保険料率の地域">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Num label="開始年" value={input.startYear} onChange={(v) => patch({ startYear: v })} />
            <Num
              label="期間（年）"
              value={input.years}
              onChange={(v) => patch({ years: v })}
            />
            <div className="flex flex-col gap-1">
              <Pct
                label="インフレ率"
                value={input.inflationRate}
                onChange={(v) => patch({ inflationRate: v })}
              />
              <div className="flex gap-1 text-[10px]">
                {[
                  { label: "2%(日銀目標)", v: 0.02 },
                  { label: "1%", v: 0.01 },
                  { label: "0.5%", v: 0.005 },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => patch({ inflationRate: p.v })}
                    className={`rounded border px-1.5 py-0.5 ${
                      input.inflationRate === p.v
                        ? "border-accent text-accent"
                        : "border-line text-ink2 hover:border-accent"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <Field label="都道府県">
              <select
                className={inputCls}
                value={input.prefecture}
                onChange={(e) => patch({ prefecture: e.target.value })}
              >
                <option value="tokyo">東京</option>
                <option value="osaka">大阪</option>
                <option value="aichi">愛知</option>
              </select>
            </Field>
          </div>
          <p className="mt-2 text-xs text-ink2">
            都道府県は健康保険料率（協会けんぽ）の算定に使う。
          </p>
        </Section>

        <Section
          title="毎年の生活費"
          description="教育費・住宅費は別セクションで自動計算されるので含めない"
        >
          <div className="grid grid-cols-2 gap-3">
            <Money
              label="基礎生活費/年"
              value={input.livingExpenseAnnual}
              onChange={(v) => patch({ livingExpenseAnnual: v })}
            />
            <Money
              label="家賃/年"
              value={input.rentAnnual}
              onChange={(v) => patch({ rentAnnual: v })}
            />
          </div>
          <p className="mt-2 text-xs text-ink2">
            家賃は住宅を購入するまでの間だけ計上される。生活費・家賃はインフレ率で毎年増える。
          </p>
          <div className="mt-3 border-t border-line pt-3">
            <div className="mb-2 text-xs font-bold text-ink">生活費の変更（子の独立・老後など）</div>
            {input.livingExpenseChanges.map((c, i) => (
              <div key={i} className="mb-2 grid grid-cols-[6rem_1fr_2rem] items-end gap-2">
                <Num
                  label="年以降"
                  value={c.fromYear}
                  onChange={(v) =>
                    patch({
                      livingExpenseChanges: input.livingExpenseChanges.map((x, ci) =>
                        ci === i ? { ...x, fromYear: v } : x
                      ),
                    })
                  }
                />
                <Money
                  label="基礎生活費/年"
                  value={c.annual}
                  onChange={(v) =>
                    patch({
                      livingExpenseChanges: input.livingExpenseChanges.map((x, ci) =>
                        ci === i ? { ...x, annual: v } : x
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="pb-1.5 text-xs text-critical hover:underline"
                  onClick={() =>
                    patch({
                      livingExpenseChanges: input.livingExpenseChanges.filter((_, ci) => ci !== i),
                    })
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-xs text-accent hover:underline"
              onClick={() =>
                patch({
                  livingExpenseChanges: [
                    ...input.livingExpenseChanges,
                    { fromYear: input.startYear + 10, annual: input.livingExpenseAnnual },
                  ],
                })
              }
            >
              + 変更を追加
            </button>
          </div>
        </Section>
      </div>

      {/* 世帯 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {input.adults.map((a, i) => (
          <Section
            key={i}
            title={i === 0 ? "本人" : "配偶者"}
            description={
              i === 0
                ? "世帯主。国民健康保険は本人がまとめて納付する扱い"
                : "税・社会保険は本人とは別に個人単位で計算される"
            }
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="表示名">
                <input
                  type="text"
                  className={inputCls}
                  value={a.name}
                  onChange={(e) => patchAdult(i, { name: e.target.value })}
                />
              </Field>
              <Num
                label="生まれ年"
                value={a.birthYear}
                onChange={(v) => patchAdult(i, { birthYear: v })}
              />
              <Field label="働き方">
                <select
                  className={inputCls}
                  value={a.employment}
                  onChange={(e) =>
                    patchAdult(i, { employment: e.target.value as PersonInput["employment"] })
                  }
                >
                  <option value="employee">会社員</option>
                  <option value="selfEmployed">自営業</option>
                  <option value="none">無職・専業</option>
                </select>
              </Field>
              <Money
                label={a.employment === "selfEmployed" ? "事業所得/年" : "額面年収"}
                value={a.grossAnnual}
                onChange={(v) => patchAdult(i, { grossAnnual: v })}
              />
              <Pct
                label="収入成長率"
                value={a.incomeGrowthRate}
                onChange={(v) => patchAdult(i, { incomeGrowthRate: v })}
              />
              <Num
                label="退職年齢"
                value={a.retirementAge}
                onChange={(v) => patchAdult(i, { retirementAge: v })}
              />
              <Money
                label="退職金"
                value={a.severancePay}
                onChange={(v) => patchAdult(i, { severancePay: v })}
              />
              <Num
                label="退職時の勤続年数"
                value={a.serviceYearsAtRetirement}
                onChange={(v) => patchAdult(i, { serviceYearsAtRetirement: v })}
              />
              <Num
                label="年金の受給開始年齢"
                value={a.pensionStartAge}
                onChange={(v) => patchAdult(i, { pensionStartAge: v })}
              />
              <Money
                label="年金見込額/年"
                value={a.pensionAnnual}
                onChange={(v) => patchAdult(i, { pensionAnnual: v })}
              />
              <Money
                label="iDeCo拠出/年"
                value={a.idecoAnnualContribution}
                onChange={(v) => patchAdult(i, { idecoAnnualContribution: v })}
              />
              <Money
                label="iDeCoの現在残高"
                value={a.idecoInitialBalance}
                onChange={(v) => patchAdult(i, { idecoInitialBalance: v })}
              />
              <Money
                label="生命保険料/年"
                value={a.lifeInsurancePremiums.general}
                onChange={(v) =>
                  patchAdult(i, {
                    lifeInsurancePremiums: { ...a.lifeInsurancePremiums, general: v },
                  })
                }
              />
              <Money
                label="地震保険料/年"
                value={a.earthquakePremium}
                onChange={(v) => patchAdult(i, { earthquakePremium: v })}
              />
            </div>
            <p className="mt-2 text-xs text-ink2">
              年金見込額はねんきん定期便の記載額を入れる。繰上げ・繰下げ受給の増減（繰上げ
              -0.4%/月・繰下げ +0.7%/月）は自動計算しないので、調整後の額を入れること。
              iDeCo拠出は限度額（会社員: 企業年金なしで年27.6万円、自営業: 年81.6万円）の
              チェックをしないので範囲内で入力する。
            </p>
            <div className="mt-3 border-t border-line pt-3">
              <div className="mb-2 text-xs font-bold text-ink">
                年収の変更（役職定年・転職・再雇用など）
              </div>
              {a.incomeChanges.map((c, ci) => (
                <div key={ci} className="mb-2 grid grid-cols-[6rem_1fr_2rem] items-end gap-2">
                  <Num
                    label="歳から"
                    value={c.fromAge}
                    onChange={(v) =>
                      patchAdult(i, {
                        incomeChanges: a.incomeChanges.map((x, xi) =>
                          xi === ci ? { ...x, fromAge: v } : x
                        ),
                      })
                    }
                  />
                  <Money
                    label={a.employment === "selfEmployed" ? "事業所得/年" : "額面年収"}
                    value={c.annual}
                    onChange={(v) =>
                      patchAdult(i, {
                        incomeChanges: a.incomeChanges.map((x, xi) =>
                          xi === ci ? { ...x, annual: v } : x
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="pb-1.5 text-xs text-critical hover:underline"
                    onClick={() =>
                      patchAdult(i, {
                        incomeChanges: a.incomeChanges.filter((_, xi) => xi !== ci),
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="text-xs text-accent hover:underline"
                onClick={() =>
                  patchAdult(i, {
                    incomeChanges: [
                      ...a.incomeChanges,
                      { fromAge: 55, annual: a.grossAnnual },
                    ],
                  })
                }
              >
                + 変更を追加
              </button>
              <p className="mt-1 text-[10px] text-ink2">
                指定年齢以降は成長率を適用せず、この額をそのまま使う。
              </p>
            </div>
            {i === 1 && (
              <button
                type="button"
                className="mt-3 text-xs text-critical hover:underline"
                onClick={() => patch({ adults: [input.adults[0]] })}
              >
                配偶者を削除
              </button>
            )}
          </Section>
        ))}
        {input.adults.length === 1 && (
          <button
            type="button"
            className="self-start rounded-lg border border-dashed border-line bg-card px-5 py-4 text-sm text-ink2 transition-colors hover:border-accent hover:text-ink"
            onClick={() =>
              patch({
                adults: [
                  input.adults[0],
                  {
                    ...createDefaultPerson("配偶者", input.adults[0].birthYear),
                    grossAnnual: 0,
                    employment: "none",
                    severancePay: 0,
                  },
                ],
              })
            }
          >
            + 配偶者を追加
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="子ども" description="教育費は進路の統計値から年齢に応じて自動計上">
          {input.children.map((c, i) => (
            <div
              key={i}
              className="mb-3 grid grid-cols-3 gap-2 border-b border-line pb-3 last:border-b-0"
            >
              <Num
                label="生まれ年"
                value={c.birthYear}
                onChange={(v) => patchChild(i, { birthYear: v })}
              />
              <Field label="小学校">
                <select
                  className={inputCls}
                  value={c.educationPlan.elementary}
                  onChange={(e) =>
                    patchChild(i, {
                      educationPlan: {
                        ...c.educationPlan,
                        elementary: e.target.value as ChildInput["educationPlan"]["elementary"],
                      },
                    })
                  }
                >
                  <option value="public">公立</option>
                  <option value="private">私立</option>
                </select>
              </Field>
              <Field label="中学校">
                <select
                  className={inputCls}
                  value={c.educationPlan.juniorHigh}
                  onChange={(e) =>
                    patchChild(i, {
                      educationPlan: {
                        ...c.educationPlan,
                        juniorHigh: e.target.value as ChildInput["educationPlan"]["juniorHigh"],
                      },
                    })
                  }
                >
                  <option value="public">公立</option>
                  <option value="private">私立</option>
                </select>
              </Field>
              <Field label="高校">
                <select
                  className={inputCls}
                  value={c.educationPlan.highSchool}
                  onChange={(e) =>
                    patchChild(i, {
                      educationPlan: {
                        ...c.educationPlan,
                        highSchool: e.target.value as ChildInput["educationPlan"]["highSchool"],
                      },
                    })
                  }
                >
                  <option value="public">公立</option>
                  <option value="private">私立</option>
                  <option value="none">通わない</option>
                </select>
              </Field>
              <Field label="大学">
                <select
                  className={inputCls}
                  value={c.educationPlan.university}
                  onChange={(e) =>
                    patchChild(i, {
                      educationPlan: {
                        ...c.educationPlan,
                        university: e.target.value as ChildInput["educationPlan"]["university"],
                      },
                    })
                  }
                >
                  <option value="national">国公立</option>
                  <option value="privateLiberal">私立文系</option>
                  <option value="privateScience">私立理系</option>
                  <option value="none">進学しない</option>
                </select>
              </Field>
              <button
                type="button"
                className="self-end pb-1.5 text-left text-xs text-critical hover:underline"
                onClick={() => patch({ children: input.children.filter((_, ci) => ci !== i) })}
              >
                削除
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-xs text-accent hover:underline"
            onClick={() =>
              patch({
                children: [
                  ...input.children,
                  {
                    name: `子${input.children.length + 1}`,
                    birthYear: input.startYear,
                    educationPlan: {
                      kindergarten: "public",
                      elementary: "public",
                      juniorHigh: "public",
                      highSchool: "public",
                      university: "national",
                    },
                  },
                ],
              })
            }
          >
            + 子どもを追加
          </button>
        </Section>

        <Section
          title="借入（住宅ローン以外）"
          description="奨学金・自動車ローンなど。元利均等で完済まで自動返済する"
        >
          {input.debts.map((d, i) => (
            <div key={i} className="mb-2 grid grid-cols-[1fr_6rem_5rem_5rem_2rem] items-end gap-2">
              <Field label="内容">
                <input
                  type="text"
                  className={inputCls}
                  value={d.label}
                  onChange={(e) =>
                    patch({
                      debts: input.debts.map((x, di) =>
                        di === i ? { ...x, label: e.target.value } : x
                      ),
                    })
                  }
                />
              </Field>
              <Money
                label="残高"
                value={d.balance}
                onChange={(v) =>
                  patch({
                    debts: input.debts.map((x, di) => (di === i ? { ...x, balance: v } : x)),
                  })
                }
              />
              <Pct
                label="年利"
                value={d.annualRate}
                onChange={(v) =>
                  patch({
                    debts: input.debts.map((x, di) => (di === i ? { ...x, annualRate: v } : x)),
                  })
                }
              />
              <Num
                label="残り年数"
                value={d.remainingYears}
                onChange={(v) =>
                  patch({
                    debts: input.debts.map((x, di) =>
                      di === i ? { ...x, remainingYears: v } : x
                    ),
                  })
                }
              />
              <button
                type="button"
                className="pb-1.5 text-xs text-critical hover:underline"
                onClick={() => patch({ debts: input.debts.filter((_, di) => di !== i) })}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-xs text-accent hover:underline"
            onClick={() =>
              patch({
                debts: [
                  ...input.debts,
                  { label: "奨学金", balance: 2_400_000, annualRate: 0, remainingYears: 10 },
                ],
              })
            }
          >
            + 借入を追加
          </button>
        </Section>

        <Section title="ライフイベント" description="一度きりの大きな支出・収入（車・結婚・相続など）">
          {input.events.map((e, i) => (
            <div key={i} className="mb-2 grid grid-cols-[4.5rem_1fr_5rem_6rem_2rem] items-end gap-2">
              <Num
                label="年"
                value={e.year}
                onChange={(v) =>
                  patch({
                    events: input.events.map((ev, ei) => (ei === i ? { ...ev, year: v } : ev)),
                  })
                }
              />
              <Field label="内容">
                <input
                  type="text"
                  className={inputCls}
                  value={e.label}
                  onChange={(ev) =>
                    patch({
                      events: input.events.map((x, ei) =>
                        ei === i ? { ...x, label: ev.target.value } : x
                      ),
                    })
                  }
                />
              </Field>
              <Field label="種別">
                <select
                  className={inputCls}
                  value={e.amount >= 0 ? "expense" : "income"}
                  onChange={(ev) =>
                    patch({
                      events: input.events.map((x, ei) =>
                        ei === i
                          ? {
                              ...x,
                              amount:
                                ev.target.value === "expense"
                                  ? Math.abs(x.amount)
                                  : -Math.abs(x.amount),
                            }
                          : x
                      ),
                    })
                  }
                >
                  <option value="expense">支出</option>
                  <option value="income">収入</option>
                </select>
              </Field>
              <Money
                label="金額"
                value={Math.abs(e.amount)}
                onChange={(v) =>
                  patch({
                    events: input.events.map((ev, ei) =>
                      ei === i ? { ...ev, amount: ev.amount >= 0 ? v : -v } : ev
                    ),
                  })
                }
              />
              <button
                type="button"
                className="pb-1.5 text-xs text-critical hover:underline"
                onClick={() => patch({ events: input.events.filter((_, ei) => ei !== i) })}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-xs text-accent hover:underline"
            onClick={() =>
              patch({
                events: [
                  ...input.events,
                  { year: input.startYear + 5, label: "イベント", amount: 1_000_000 },
                ],
              })
            }
          >
            + イベントを追加
          </button>
        </Section>

        <Section title="住宅購入" description="頭金・ローン返済・住宅ローン控除を自動計算">
          <label className="mb-3 flex items-center gap-2 text-sm text-ink2">
            <input
              type="checkbox"
              checked={input.housing !== null}
              onChange={(e) =>
                patch({
                  housing: e.target.checked
                    ? {
                        purchaseYear: input.startYear + 3,
                        price: 40_000_000,
                        loanPrincipal: 30_000_000,
                        loanAnnualRate: 0.015,
                        loanYears: 35,
                        loanMethod: "annuity",
                        creditPresetKey: "newEnergySaving",
                      }
                    : null,
                })
              }
            />
            住宅を購入する
          </label>
          {input.housing && (
            <div className="grid grid-cols-2 gap-3">
              <Num
                label="購入年"
                value={input.housing.purchaseYear}
                onChange={(v) => patch({ housing: { ...input.housing!, purchaseYear: v } })}
              />
              <Money
                label="物件価格"
                value={input.housing.price}
                onChange={(v) => patch({ housing: { ...input.housing!, price: v } })}
              />
              <Money
                label="借入額"
                value={input.housing.loanPrincipal}
                onChange={(v) => patch({ housing: { ...input.housing!, loanPrincipal: v } })}
              />
              <Pct
                label="金利（固定）"
                value={input.housing.loanAnnualRate}
                onChange={(v) => patch({ housing: { ...input.housing!, loanAnnualRate: v } })}
              />
              <Num
                label="返済年数"
                value={input.housing.loanYears}
                onChange={(v) => patch({ housing: { ...input.housing!, loanYears: v } })}
              />
              <Field label="返済方式">
                <select
                  className={inputCls}
                  value={input.housing.loanMethod}
                  onChange={(e) =>
                    patch({
                      housing: {
                        ...input.housing!,
                        loanMethod: e.target.value as "annuity" | "equalPrincipal",
                      },
                    })
                  }
                >
                  <option value="annuity">元利均等</option>
                  <option value="equalPrincipal">元金均等</option>
                </select>
              </Field>
              <div className="col-span-2">
                <Field label="ローン控除の区分">
                  <select
                    className={inputCls}
                    value={input.housing.creditPresetKey}
                    onChange={(e) =>
                      patch({ housing: { ...input.housing!, creditPresetKey: e.target.value } })
                    }
                  >
                    {t.housingLoanCredit.presets.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                    <option value="none">控除なし</option>
                  </select>
                </Field>
              </div>
              <p className="col-span-2 text-xs text-ink2">
                頭金 = 物件価格 − 借入額（購入年に一括支出）
              </p>
            </div>
          )}
        </Section>
      </div>

      <Section
        title="資産と積立"
        description="期首残高に利回りを適用し、年末に積立を加算する。NISAの積立は年間360万・生涯1,800万の枠に達すると自動で止まる"
      >
        <div className="mb-4 grid max-w-2xl grid-cols-3 gap-3">
          <Pct
            label="取り崩し率/年"
            value={input.accounts.drawdownRate}
            onChange={(v) => patchAccounts({ drawdownRate: v })}
          />
          <Field label="取り崩し開始">
            <select
              className={inputCls}
              value={input.accounts.drawdownStartYear === null ? "auto" : "manual"}
              onChange={(e) =>
                patchAccounts({
                  drawdownStartYear:
                    e.target.value === "auto" ? null : input.startYear + 30,
                })
              }
            >
              <option value="auto">自動（収入がなくなった年）</option>
              <option value="manual">年を指定する</option>
            </select>
          </Field>
          {input.accounts.drawdownStartYear !== null && (
            <Num
              label="開始年"
              value={input.accounts.drawdownStartYear}
              onChange={(v) => patchAccounts({ drawdownStartYear: v })}
            />
          )}
        </div>
        <p className="mb-4 text-xs text-ink2">
          取り崩し期に入ると積立をやめ、課税口座+NISAの残高に対して毎年この割合を課税口座→NISAの順に現金化する。現金が不足した年は時期を問わず不足分を自動で取り崩す。
        </p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <div className="flex flex-col gap-3">
            <div className="text-xs font-bold text-ink">現金・預金</div>
            <Money
              label="現在残高"
              value={input.accounts.cashInitial}
              onChange={(v) => patchAccounts({ cashInitial: v })}
            />
          </div>
          <div className="flex flex-col gap-3">
            <div className="text-xs font-bold text-ink">課税口座（特定口座など）</div>
            <Money
              label="現在残高"
              value={input.accounts.taxableInitial}
              onChange={(v) => patchAccounts({ taxableInitial: v })}
            />
            <Pct
              label="想定利回り"
              value={input.accounts.taxableRate}
              onChange={(v) => patchAccounts({ taxableRate: v })}
            />
            <Money
              label="積立/年"
              value={input.accounts.taxableAnnualContribution}
              onChange={(v) => patchAccounts({ taxableAnnualContribution: v })}
            />
          </div>
          <div className="flex flex-col gap-3">
            <div className="text-xs font-bold text-ink">NISA</div>
            <Money
              label="現在残高"
              value={input.accounts.nisaInitial}
              onChange={(v) => patchAccounts({ nisaInitial: v })}
            />
            <Pct
              label="想定利回り"
              value={input.accounts.nisaRate}
              onChange={(v) => patchAccounts({ nisaRate: v })}
            />
            <Money
              label="積立/年"
              value={input.accounts.nisaAnnualContribution}
              onChange={(v) => patchAccounts({ nisaAnnualContribution: v })}
            />
            <Money
              label="生涯枠の消化済額"
              value={input.accounts.nisaInitialContributed}
              onChange={(v) => patchAccounts({ nisaInitialContributed: v })}
            />
          </div>
          <div className="flex flex-col gap-3">
            <div className="text-xs font-bold text-ink">iDeCo</div>
            <Pct
              label="想定利回り"
              value={input.accounts.idecoRate}
              onChange={(v) => patchAccounts({ idecoRate: v })}
            />
            <p className="text-xs text-ink2">
              拠出額と現在残高は本人・配偶者のセクションで設定する。60歳で一時金として受け取る。
            </p>
          </div>
        </div>
      </Section>

      <Section
        title="自治体料率（国保・介護1号・後期高齢者）"
        description="退職後の保険料計算に使う。既定値は概算プレースホルダなので、実務利用前に必ず居住自治体の公表値で上書きする"
      >
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[14rem_1fr_auto]">
          <Field label="自治体名（メモ）">
            <input
              type="text"
              className={inputCls}
              placeholder="例: 東京都新宿区"
              value={input.municipal.name}
              onChange={(e) => patchMunicipal({ name: e.target.value })}
            />
          </Field>
          <Field label="料率の出典ページURL">
            <input
              type="url"
              className={inputCls}
              placeholder="自治体の国保・介護保険料ページのURLを貼る"
              value={input.municipal.referenceUrl}
              onChange={(e) => patchMunicipal({ referenceUrl: e.target.value })}
            />
          </Field>
          {input.municipal.referenceUrl && (
            <a
              href={input.municipal.referenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="self-end pb-1.5 text-sm text-accent hover:underline"
            >
              開く ↗
            </a>
          )}
        </div>
        <p className="mb-4 text-xs text-ink2">
          「（自治体名） 国民健康保険料 料率」「（自治体名） 介護保険料 基準額」で検索すると公表ページが見つかる。
        </p>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {(
            [
              { cat: "medical", label: "国保・医療分" },
              { cat: "support", label: "国保・後期支援分" },
              { cat: "care", label: "国保・介護分（40〜64歳）" },
            ] as const
          ).map(({ cat, label }) => (
            <div key={cat} className="flex flex-col gap-3">
              <div className="text-xs font-bold text-ink">{label}</div>
              <Pct
                label="所得割"
                value={input.municipal.nhi[cat].incomeRate}
                onChange={(v) => patchNhi(cat, { incomeRate: v })}
              />
              <Yen
                label="均等割/人"
                value={input.municipal.nhi[cat].perCapita}
                onChange={(v) => patchNhi(cat, { perCapita: v })}
              />
              <Yen
                label="平等割/世帯"
                value={input.municipal.nhi[cat].perHousehold}
                onChange={(v) => patchNhi(cat, { perHousehold: v })}
              />
              <Money
                label="賦課限度額"
                value={input.municipal.nhi[cat].cap}
                onChange={(v) => patchNhi(cat, { cap: v })}
              />
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 lg:grid-cols-4">
          <Yen
            label="介護1号 基準額/年（65歳〜）"
            value={input.municipal.care1.baseAnnual}
            onChange={(v) =>
              patchMunicipal({ care1: { ...input.municipal.care1, baseAnnual: v } })
            }
          />
          <Yen
            label="後期高齢者 均等割/年（75歳〜）"
            value={input.municipal.latterElderly.perCapita}
            onChange={(v) =>
              patchMunicipal({
                latterElderly: { ...input.municipal.latterElderly, perCapita: v },
              })
            }
          />
          <Pct
            label="後期高齢者 所得割"
            value={input.municipal.latterElderly.incomeRate}
            onChange={(v) =>
              patchMunicipal({
                latterElderly: { ...input.municipal.latterElderly, incomeRate: v },
              })
            }
          />
          <Money
            label="後期高齢者 賦課限度額"
            value={input.municipal.latterElderly.cap}
            onChange={(v) =>
              patchMunicipal({
                latterElderly: { ...input.municipal.latterElderly, cap: v },
              })
            }
          />
        </div>
        <p className="mt-2 text-xs text-ink2">
          介護1号の所得段階別乗率・後期高齢者の均等割軽減の判定基準は既定値のまま使う（自治体差の主因である基準額・料率のみ上書きする簡易方式）。
        </p>
      </Section>

      {/* 結果 */}
      <SimulationResults
        name={name}
        result={result}
        compare={compare}
        municipalityName={input.municipal.name}
      />

      <MonteCarloPanel
        input={input}
        onChangeVolatility={(v) => patchAccounts({ returnVolatility: v })}
      />
    </div>
  );
}
