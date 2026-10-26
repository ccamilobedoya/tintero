// `task-board`: tasks by stage (doing / todo / done today). The first stage may "lead":
// tall rows under a black strip. Rows, cards, category headers and "+N más" follow the common
// rule of F-005 (fixed-height rows, never cut, never scrolled).
import { stageOf, type Stage, type Task } from "../config.ts";
import { dayKey, localParts, MONTHS } from "../dates.ts";
import { html, type Raw } from "../html.ts";
import { fontCss } from "../theme.ts";
import {
  groupHeader,
  innerW,
  groupTasks,
  isTooSmall,
  moreRow,
  noFit,
  shortDay,
  stripRow,
  titleRow,
} from "./common.ts";
import type { Block, BlockContext } from "./types.ts";

const LABEL: Record<Stage, string> = { doing: "EN PROGRESO", todo: "POR HACER", done: "HECHO HOY" };
const EMPTY: Record<Stage, string> = {
  doing: "Nada en progreso.",
  todo: "Nada por hacer.",
  done: "Nada hecho hoy.",
};

type Kind = "lead" | "card" | "row";

type Unit =
  | { kind: "header"; text: string; h: number }
  | { kind: "task"; task: Task; h: number; gap: number };

interface Plan {
  stage: Stage;
  kind: Kind;
  count: number;
  units: Unit[];
}

const stagesOf = (value: unknown): Stage[] => {
  if (!Array.isArray(value)) return ["doing", "todo"];
  return value.filter((s): s is Stage => s === "doing" || s === "todo" || s === "done");
};

/** D2 (ADR-0056): a big row without `due` and `category` has no detail line. */
const hasMeta = (task: Task): boolean => task.due !== undefined || task.category !== undefined;

function heights(context: BlockContext, kind: Kind, task: Task): { h: number; gap: number } {
  const m = context.metrics;
  const pad = 2 * m.focusPad;
  const meta = hasMeta(task) ? m.metaLine : 0;
  if (kind === "lead") return { h: 2 * m.leadLine + meta + pad, gap: m.focusGap };
  if (kind === "card") return { h: 2 * m.cardLine + meta + pad, gap: m.focusGap };
  return { h: m.row, gap: 0 };
}

function plansOf(context: BlockContext, tasks: Task[]): Plan[] {
  const { slot } = context;
  const stages = stagesOf(slot.options.stages);
  const lead = slot.options.lead === true;
  const byCategory = slot.options.group_by !== "none";
  const card = slot.options.density === "card";
  const today = dayKey(context.today);
  return stages.map((stage, i) => {
    const kind: Kind = lead && i === 0 ? "lead" : card ? "card" : "row";
    const mine = tasks.filter((task) => {
      if (stageOf(task) !== stage) return false;
      if (stage !== "done") return true;
      if (task.doneAt === undefined) return false;
      return dayKey(localParts(new Date(task.doneAt), context.timeZone).day) === today;
    });
    const headers = kind !== "lead" && byCategory && mine.some((t) => t.category !== undefined);
    const units: Unit[] = [];
    for (const group of groupTasks(mine, headers)) {
      if (group.header !== undefined) {
        units.push({ kind: "header", text: group.header, h: context.metrics.groupRow });
      }
      for (const task of group.items) {
        units.push({ kind: "task", task, ...heights(context, kind, task) });
      }
    }
    return { stage, kind, count: mine.length, units };
  });
}

const unitHeight = (unit: Unit): number => (unit.kind === "header" ? unit.h : unit.gap + unit.h);

/** Height of the first unit of a stage: its first row (with its header, if any) or the empty row. */
function firstUnit(context: BlockContext, plan: Plan): number {
  const [a, b] = plan.units;
  if (a === undefined) return context.metrics.row;
  return unitHeight(a) + (a.kind === "header" && b !== undefined ? unitHeight(b) : 0);
}

type Placed =
  | { kind: "strip"; plan: Plan; y: number }
  | { kind: "header"; text: string; y: number }
  | { kind: "task"; plan: Plan; task: Task; y: number; h: number }
  | { kind: "empty"; stage: Stage; y: number };

function place(
  context: BlockContext,
  plans: Plan[],
  available: number,
): { placed: Placed[]; hidden: number; moreY: number | undefined } {
  const m = context.metrics;
  const total = plans.reduce(
    (sum, plan, i) =>
      sum +
      (i > 0 ? m.sectionGap : 0) +
      m.strip +
      (plan.units.length === 0 ? m.row : plan.units.reduce((s, u) => s + unitHeight(u), 0)),
    0,
  );
  const all = total <= available;
  const limit = all ? available : available - m.moreRow;
  const placed: Placed[] = [];
  let y = 0;
  let shown = 0;
  plans.forEach((plan, i) => {
    if (i > 0) y += m.sectionGap;
    placed.push({ kind: "strip", plan, y });
    y += m.strip;
    if (plan.units.length === 0) {
      placed.push({ kind: "empty", stage: plan.stage, y });
      y += m.row;
      return;
    }
    const later = plans
      .slice(i + 1)
      .reduce((sum, p) => sum + m.sectionGap + m.strip + firstUnit(context, p), 0);
    const room = all ? limit : limit - later;
    for (const [k, unit] of plan.units.entries()) {
      if (unit.kind === "header") {
        const next = plan.units[k + 1];
        if (y + unit.h + (next === undefined ? 0 : unitHeight(next)) > room) break;
        placed.push({ kind: "header", text: unit.text, y });
        y += unit.h;
        continue;
      }
      if (y + unitHeight(unit) > room) break;
      placed.push({ kind: "task", plan, task: unit.task, y: y + unit.gap, h: unit.h });
      y += unitHeight(unit);
      shown++;
    }
  });
  // "+N más" sits right after the last thing drawn; but a stage that stopped early leaves
  // later stages below it, so it goes after the last placed element.
  const last = placed.at(-1);
  const end = last === undefined ? 0 : bottomOf(context, last);
  const hidden = plans.reduce((sum, plan) => sum + plan.count, 0) - shown;
  return { placed, hidden, moreY: hidden > 0 ? end : undefined };
}

function bottomOf(context: BlockContext, item: Placed): number {
  const m = context.metrics;
  if (item.kind === "strip") return item.y + m.strip;
  if (item.kind === "header") return item.y + m.groupRow;
  if (item.kind === "empty") return item.y + m.row;
  return item.y + item.h;
}

// ---- drawing ----

function stripHtml(context: BlockContext, plan: Plan, y: number): Raw {
  const lead = plan.kind === "lead";
  const right = lead && context.stale !== undefined ? context.stale : String(plan.count);
  return stripRow(context, LABEL[plan.stage], right, y, { lead });
}

/** `top` is the offset of the box inside the zone, `focusPad` included. */
function checkbox(context: BlockContext, task: Task, top: number): Raw {
  const m = context.metrics;
  const stage = stageOf(task);
  const half =
    stage === "doing"
      ? html`<span
          class="a"
          style="left:${-m.boxBorder}px;top:${-m.boxBorder}px;width:${Math.floor(m.box / 2)}px;height:${m.box}px;background:#000"
        ></span>`
      : html``;
  return html`<span
    class="a"
    style="left:${m.focusPad}px;top:${top}px;width:${m.box}px;height:${m.box}px;border:${m.boxBorder}px solid #000;background:${stage === "done" ? "#000" : "#fff"}"
    >${half}</span
  >`;
}

/** Done tasks are struck through with a stroke as thick as the rules (ADR-0049). */
const strike = (context: BlockContext, task: Task): string =>
  stageOf(task) === "done"
    ? `text-decoration:line-through;text-decoration-thickness:${context.metrics.line}px;`
    : "";

const overdue = (context: BlockContext, task: Task): boolean =>
  task.due !== undefined && task.due < dayKey(context.today);

/** `25 oct`; before today: bold, white on black, 3 px before the text and 2 px inside the line. */
function dueHtml(
  context: BlockContext,
  task: Task,
  line: number,
  extra: string,
  marginTop = 2,
): Raw {
  if (task.due === undefined) return html``;
  const text = shortDay(task.due, MONTHS);
  if (!overdue(context, task)) return html`<span style="${extra}">${text}</span>`;
  return html`<span
    style="${extra}display:inline-block;vertical-align:top;margin-top:${marginTop}px;height:${line - 4}px;line-height:${line - 4}px;padding-left:3px;background:#000;color:#fff;font-weight:700"
    >${text}</span
  >`;
}

function bigRow(context: BlockContext, plan: Plan, task: Task, y: number, h: number): Raw {
  const m = context.metrics;
  const readonly = context.source.readonly;
  const line = plan.kind === "lead" ? m.leadLine : m.cardLine;
  const zone = context.focus(task.id, readonly ? "open" : "toggle", context.w, h);
  const pad = m.focusPad;
  const first = pad + (readonly ? 0 : m.box + m.gap);
  const textW = Math.max(1, context.w - pad - first);
  const deco = strike(context, task);
  const bits = [task.category, task.due].filter((x) => x !== undefined);
  const meta =
    bits.length === 0
      ? html``
      : html`${task.category ?? ""}${task.category !== undefined && task.due !== undefined ? "  " : ""}${dueHtml(context, task, m.metaLine, "")}`;
  return html`<div
    class="a"
    data-fit="${context.area}"
    ${zone === undefined ? html`` : html` data-zone="${zone}"`}
    style="left:0;top:${y}px;width:${context.w}px;height:${h}px"
  >
    ${readonly ? html`` : checkbox(context, task, pad + Math.floor((line - m.box) / 2))}
    <span
      class="a"
      style="left:${first}px;top:${pad}px;width:${textW}px;height:${2 * line}px;line-height:${line}px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;overflow-wrap:anywhere;${deco}${fontCss(plan.kind === "lead" ? m.font.title : m.font.text)}"
      >${task.title}</span
    >
    ${
      bits.length === 0
        ? html``
        : html`<span
            class="a t"
            style="left:${first}px;top:${pad + 2 * line}px;width:${textW}px;height:${m.metaLine}px;line-height:${m.metaLine}px;white-space:pre;${fontCss(m.font.detail)}"
            >${meta}</span
          >`
    }
  </div>`;
}

function smallRow(context: BlockContext, task: Task, y: number): Raw {
  const m = context.metrics;
  const h = m.row;
  const readonly = context.source.readonly;
  const zone = context.focus(task.id, readonly ? "open" : "toggle", context.w, h);
  const pad = m.focusPad;
  const ih = h - 2 * pad;
  const first = readonly ? 0 : m.box + m.gap;
  const deco = strike(context, task);
  const due = dueHtml(
    context,
    task,
    ih,
    `grid-column:3;margin-left:${m.gap}px;white-space:nowrap;line-height:${ih}px;align-self:start;${fontCss(m.font.detail, overdue(context, task))};`,
    3,
  );
  return html`<div
    class="a"
    data-fit="${context.area}"
    ${zone === undefined ? html`` : html` data-zone="${zone}"`}
    style="left:0;top:${y}px;width:${context.w}px;height:${h}px;padding:${pad}px;display:grid;grid-template-columns:${first}px minmax(0,1fr) max-content;align-items:center"
  >
    ${readonly ? html`` : checkbox(context, task, pad + Math.floor((ih - m.box) / 2))}<span
      class="t"
      style="grid-column:2;line-height:${ih}px;${deco}${fontCss(m.font.text)}"
      >${task.title}</span
    >${due}
  </div>`;
}

function emptyRow(context: BlockContext, stage: Stage, y: number): Raw {
  const m = context.metrics;
  return html`<div
    class="a t"
    data-fit="${context.area}"
    style="left:${m.focusPad}px;top:${y}px;width:${innerW(context)}px;height:${m.row}px;line-height:${m.row}px;${fontCss(m.font.text)}"
  >
    ${stage === "doing" ? EMPTY.doing : stage === "todo" ? EMPTY.todo : EMPTY.done}
  </div>`;
}

export const taskBoard: Block = (context) => {
  const { metrics, source } = context;
  if (source.type !== "tasks") return noFit(context);
  const plans = plansOf(context, source.items);
  const first = plans[0];
  const title = titleRow(context);
  if (first === undefined) return noFit(context);
  const minH =
    2 * metrics.margin + title.height + metrics.strip + firstUnit(context, first) + metrics.moreRow;
  if (isTooSmall(context, 30, minH)) return noFit(context);
  const fitted = place(context, plans, context.h - title.height);
  const parts = fitted.placed.map((item) => {
    const y = title.height + item.y;
    switch (item.kind) {
      case "strip":
        return stripHtml(context, item.plan, y);
      case "header":
        return groupHeader(context, item.text, y);
      case "empty":
        return emptyRow(context, item.stage, y);
      case "task":
        return item.plan.kind === "row"
          ? smallRow(context, item.task, y)
          : bigRow(context, item.plan, item.task, y, item.h);
    }
  });
  const more =
    fitted.moreY === undefined
      ? html``
      : moreRow(context, title.height + fitted.moreY, fitted.hidden);
  return { html: html`${title.html}${parts}${more}`, hidden: fitted.hidden, tooSmall: false };
};
