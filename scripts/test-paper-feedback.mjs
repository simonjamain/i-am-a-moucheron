import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(process.argv[2] || 'src/client.js', 'utf8');
const handlers = source.slice(
  source.indexOf('sig.onpointerdown ='),
  source.indexOf("$('signClear').onclick"),
);
if (process.argv[3] !== 'selection')
  for (const pointerType of ['mouse', 'touch'])
    for (const moves of [false, true]) {
      let submitted = 0;
      const c = {
        signaturePointer: null,
        signaturePoints: [],
        boardingBusy: false,
        boardingSelectionBusy: false,
        soulBusy: false,
        sig: { setPointerCapture() {} },
        signaturePoint: (e) => [e.clientX, e.clientY],
        sound: { play() {} },
        paperSource: () => ({}),
        redrawInk() {},
        inkReady: () =>
          c.signaturePoints.some(
            (p, i, a) => i && p[2] && Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 0.12,
          ),
        submitPaper: () => submitted++,
        clearSignature: () => {
          c.signaturePoints = [];
          c.signaturePointer = null;
        },
      };
      vm.createContext(c);
      vm.runInContext(handlers, c);
      for (let doc = 0; doc < 3; doc++) {
        c.clearSignature();
        const e = {
          preventDefault() {},
          pointerId: doc + 1,
          pointerType,
          clientX: 0.1,
          clientY: 0.3,
        };
        c.sig.onpointerdown(e);
        if (moves) c.sig.onpointermove({ ...e, clientX: 0.5 });
        c.sig.onpointerup({ ...e, clientX: 0.8, clientY: 0.4 });
        assert.equal(
          submitted,
          doc + 1,
          `${pointerType}: first valid stroke on document ${doc} must work without a Clear action`,
        );
      }
      c.clearSignature();
      const e = { preventDefault() {}, pointerId: 9, clientX: 0.1, clientY: 0.3 };
      c.sig.onpointerdown(e);
      c.sig.onpointermove({ ...e, clientX: 0.6 });
      c.sig.onpointercancel();
      c.sig.onpointerup({ ...e, clientX: 0.8 });
      assert.equal(submitted, 3, 'cancel cannot sign');
    }
// Exercise the real selection function while another client's seat/snapshot
// changes are delayed: no obsolete, signable sheet may appear before ACK.
for (const seat of ['pilot', 'dorsal', 'tail']) {
  let release;
  const response = new Promise((r) => (release = r)),
    c = {
      boardingBusy: false,
      boardingSelectionBusy: false,
      boardingOpen: false,
      selectedEquipment: null,
      selectedVehicle: null,
      selectedSeat: null,
      id: 'a',
      snap: {
        pilots: [{ id: 'a', mode: 'foot', state: { boarding: { vehicle: 'old', seat: 'pilot' } } }],
      },
      api: () => response,
      groundReport: () => null,
      releaseMouse() {},
      notify() {},
      renderPaper() {},
      accept(s) {
        c.snap = s;
      },
    };
  vm.createContext(c);
  const select = source.slice(
    source.indexOf('async function chooseVehicle('),
    source.indexOf('function openBoarding()'),
  );
  vm.runInContext(select, c);
  const pending = vm.runInContext(`chooseVehicle({id:'new'},'${seat}')`, c);
  assert.equal(c.boardingOpen, false, 'no signable old dossier while seat selection is pending');
  release({ pilots: [{ id: 'a', mode: 'foot', state: { boarding: { vehicle: 'new', seat } } }] });
  await pending;
  assert.equal(c.boardingOpen, true);
  assert.equal(c.boardingSelectionBusy, false);
}
const submit = source.slice(
  source.indexOf('async function submitPaper()'),
  source.indexOf("$('soulPaperButton').onclick"),
);
assert.equal(
  [
    /classList.add\('stamping'\)/,
    /paperStampUntil = performance.now\(\) \+ 5000/,
    /echo.classList.add\('show'\)/,
  ].filter((re) => re.test(submit)).length,
  1,
  'one stamp presentation per actual submit',
);
assert.ok(!source.includes('textLabel(b.name'));
assert.ok(!source.includes('textLabel(VEHICLES[v.type].name'));
console.log(
  'PASS: actual pointer handlers (mouse/touch, sparse/coalesced events, cancel, consecutive papers), ACK-gated selection for all seats, one stamp and no actor labels.',
);
