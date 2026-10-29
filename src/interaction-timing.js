export class InteractionTiming {
  constructor(clock = () => performance.now(), schedule = (f) => requestAnimationFrame(f)) {
    this.clock = clock;
    this.schedule = schedule;
    this.records = [];
  }
  begin(kind) {
    const start = this.clock(),
      record = { kind, start, stages: { input: 0 } };
    this.records.push(record);
    if (this.records.length > 32) this.records.shift();
    const mark = (name) => {
      record.stages[name] = this.clock() - start;
    };
    this.schedule(() => this.schedule(() => mark('feedbackPaint')));
    return {
      mark,
      finish: (status) => {
        record.status = status;
        mark('document');
        this.schedule(() => this.schedule(() => mark('documentPaint')));
      },
    };
  }
}
