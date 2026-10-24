// Block registry: the name used in the views file → its design.
import type { BlockName } from "../config.ts";
import { agenda } from "./agenda.ts";
import { issueList } from "./issue-list.ts";
import { monthCalendar } from "./month-calendar.ts";
import { taskBoard } from "./task-board.ts";
import { taskList } from "./task-list.ts";
import type { Block } from "./types.ts";

export const BLOCKS: Record<BlockName, Block> = {
  "task-list": taskList,
  "task-board": taskBoard,
  "issue-list": issueList,
  agenda,
  "month-calendar": monthCalendar,
};

export { detailBody } from "./detail.ts";
export type { Block, BlockContext } from "./types.ts";
