export interface InteractionRecord {
  kind: string;
  start: number;
  stages: Record<string, number>;
  status?: string;
}
export interface InteractionHandle {
  mark(name: string): void;
  finish(status: string): void;
}
type Schedule = (callback: () => void) => unknown;

export class InteractionTiming {
  clock: () => number;
  schedule: Schedule;
  records: InteractionRecord[];
  constructor(
    clock: () => number = () => performance.now(),
    schedule: Schedule = (f) => requestAnimationFrame(f),
  ) {
    this.clock = clock;
    this.schedule = schedule;
    this.records = [];
  }
  begin(kind: string): InteractionHandle {
    const start = this.clock(),
      record: InteractionRecord = { kind, start, stages: { input: 0 } };
    this.records.push(record);
    if (this.records.length > 32) this.records.shift();
    const mark = (name: string): void => {
      record.stages[name] = this.clock() - start;
    };
    this.schedule(() => this.schedule(() => mark('feedbackPaint')));
    return {
      mark,
      finish: (status: string) => {
        record.status = status;
        mark('document');
        this.schedule(() => this.schedule(() => mark('documentPaint')));
      },
    };
  }
}
