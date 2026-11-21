const FLOW_HIGH = 256 * 1024;
const FLOW_LOW = 64 * 1024;

function pipeData(p, term, after) {
  let pending = 0;
  let paused = false;
  return p.onData((d) => {
    pending += d.length;
    if (!paused && pending > FLOW_HIGH) {
      paused = true;
      p.pause();
    }
    term.write(d, () => {
      pending -= d.length;
      if (paused && pending < FLOW_LOW) {
        paused = false;
        p.resume();
      }
    });
    if (after) after(d);
  });
}

module.exports = { pipeData, FLOW_HIGH, FLOW_LOW };
