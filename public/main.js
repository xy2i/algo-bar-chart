let n;
const k = 10; // Interpolation.
const formatNumber = d3.format(",d"); // Num format used in the bars.
const duration = 150;

const margin = {
  left: 140,
  top: 20,
  right: 10,
  bottom: 20,
};
const width = window.innerWidth - 20;

const colorFn = (data) => {
  const scale = d3.scaleOrdinal(["lightgrey", "#ffcc00", "green", "#002060"]);
  scale.domain([1, 2, 3, 4]);
  return (d) => scale(d.value[0]);
};

function parseData(rawData) {
  const parseTime = d3.timeParse("%y_%m_%d");
  const data = [];

  for (const [rawDate, testList] of Object.entries(rawData)) {
    const date = parseTime(rawDate);

    // Aggregate data.
    // test = listof [team, time, commit]
    const teamsAndCommits = testList[0].map((record) => [record[0], record[2]]);

    // Check if they're in the other tests as well.
    teamsAndCommits.map(([team, commit], i) => {
      let passedTests = 0;
      let totalTime = 0;
      for (const test of Object.values(testList)) {
        const teams = test.map((record) => record[0]);
        if (teams.includes(team)) {
          const time = test.find((e) => e[0] === team)[1];
          passedTests += 1;
          totalTime += time;
        }
      }

      const performanceAtDate = {
        team: team,
        date: date,
        commit: commit,
        value: [passedTests, totalTime],
      };

      data.push(performanceAtDate);
    });
  }

  return data;
}

async function processData() {
  // Load data.
  const rawData = await d3.json("data.json");
  const data = parseData(rawData);

  // Processing.
  const teams = new Set(data.map((d) => d.team));
  const datevalues = Array.from(
    d3.rollup(
      data,
      ([d]) => d.value,
      (d) => +d.date,
      (d) => d.team
    )
  )
    .map(([date, data]) => [new Date(date), data])
    .sort(([a], [b]) => d3.ascending(a, b));

  n = datevalues[datevalues.length - 1][1].size;
  function rank(value) {
    const data = Array.from(teams, (team) => ({
      name: team,
      value: value(team),
    }));
    // Maxmium number of tests passed, followed by minimal time.
    data.sort((a, b) => {
      if (a.value === undefined) {
        return 1;
      }
      if (b.value === undefined) {
        return -1;
      }
      return (
        d3.descending(a.value[0], b.value[0]) ||
        d3.ascending(a.value[1], b.value[1])
      );
    });
    for (let i = 0; i < data.length; ++i) data[i].rank = Math.min(n, i);
    return data;
  }

  const keyframes = [];
  let ka, a, kb, b;
  // We only want to interpolate the second value: total time.
  for ([[ka, a], [kb, b]] of d3.pairs(datevalues)) {
    for (let i = 0; i < k; ++i) {
      const t = i / k;
      keyframes.push([
        new Date(ka * (1 - t) + kb * t),
        rank((team) => [
          b.get(team) ? b.get(team)[0] : 0,
          (a.get(team) ? a.get(team)[1] : 0) * (1 - t) +
            (b.get(team) ? b.get(team)[1] : 0) * t,
        ]),
      ]);
    }
  }
  keyframes.push([
    new Date(kb),
    rank((team) => [
      b.get(team) ? b.get(team)[0] : 0,
      b.get(team) ? b.get(team)[1] : 0,
    ]),
  ]);

  const nameframes = d3.groups(
    keyframes.flatMap(([, data]) => data),
    (d) => d.name
  );
  const prev = new Map(
    nameframes.flatMap(([, data]) => d3.pairs(data, (a, b) => [b, a]))
  );
  const next = new Map(nameframes.flatMap(([, data]) => d3.pairs(data)));
  return {
    data: data,
    keyframes: keyframes,
    teams: teams,
    datevalues: datevalues,
    nameframes: nameframes,
    prev: prev,
    next: next,
  };
}

async function getVisObject() {
  const locale = await d3.json("fr-FR.json");
  d3.timeFormatDefaultLocale(locale);
  const formatDate = d3.utcFormat("%B %d, %Y");
  const {
    data,
    keyframes,
    teams,
    datevalues,
    nameframes,
    prev,
    next,
  } = await processData();

  const svg = d3.select("svg");
  console.log("data", data);
  const barSize = 48;
  const height = margin.top + barSize * n + margin.bottom;

  const color = colorFn(data);
  const x = d3.scaleLinear([0, 1], [margin.left, width - margin.right]);
  const y = d3
    .scaleBand()
    .domain(d3.range(n + 1))
    .rangeRound([margin.top, margin.top + barSize * (n + 1 + 0.1)])
    .padding(0.1);

  svg.attr("width", width).attr("height", height);

  function bars(svg) {
    let bar = svg.append("g").attr("fill-opacity", 0.6).selectAll("rect");

    return ([date, data], transition) =>
      (bar = bar
        .data(data.slice(0, n), (d) => d.name)
        .join(
          (enter) =>
            enter
              .append("rect")
              .attr("fill", (d) => color(d))
              .attr("height", y.bandwidth())
              .attr("x", x(0))
              .attr("y", (d) => y((prev.get(d) || d).rank))
              .attr("width", (d) => x((prev.get(d) || d).value[1]) - x(0)),
          (update) => update.attr("fill", (d) => color(d)),
          (exit) =>
            exit
              .transition(transition)
              .remove()
              .attr("y", (d) => y((next.get(d) || d).rank))
              .attr("width", (d) => x((next.get(d) || d).value[1]) - x(0))
        )
        .call((bar) =>
          bar
            .transition(transition)
            .attr("y", (d) => y(d.rank))
            .attr("width", (d) => x(d.value[1]) - x(0))
        ));
  }
  function labels(svg) {
    let label = svg
      .append("g")
      .style("font", "bold 12px var(--sans-serif)")
      .style("font-variant-numeric", "tabular-nums")
      .attr("text-anchor", "end")
      .selectAll("text");

    return ([date, data], transition) =>
      (label = label
        .data(data.slice(0, n), (d) => d.name)
        .join(
          (enter) =>
            enter
              .append("text")
              .attr("transform", (d) => {
                return `translate(${x((prev.get(d) || d).value[1])},${y(
                  (prev.get(d) || d).rank
                )})`;
              })
              .attr("y", y.bandwidth() / 2)
              .attr("x", -6)
              .attr("dy", "-0.25em")
              .text((d) => d.name)
              .call((text) =>
                text
                  .append("tspan")
                  .attr("fill-opacity", 0.7)
                  .attr("font-weight", "normal")
                  .attr("x", -6)
                  .attr("dy", "1.15em")
              ),
          (update) => update,
          (exit) =>
            exit
              .transition(transition)
              .remove()
              .attr(
                "transform",
                (d) =>
                  `translate(${x((next.get(d) || d).value[1])},${y(
                    (next.get(d) || d).rank
                  )})`
              )
              .call((g) =>
                g
                  .select("tspan")
                  .tween("text", (d) =>
                    textTween(d.value[1], (next.get(d) || d).value[1])
                  )
              )
        )
        .call((bar) =>
          bar
            .transition(transition)
            .attr(
              "transform",
              (d) => `translate(${x(d.value[1])},${y(d.rank)})`
            )
            .call((g) =>
              g
                .select("tspan")
                .tween("text", (d) =>
                  textTween((prev.get(d) || d).value, d.value)
                )
            )
        ));
  }
  function textTween(a, b) {
    const i = d3.interpolateNumber(a[1], b[1]);
    return function (t) {
      this.textContent = `${formatNumber(i(t))}ms ${d3
        .range(b[0])
        .map((_) => "⭐")
        .join("")}`;
    };
  }
  function axis(svg) {
    const g = svg.append("g").attr("transform", `translate(0,${margin.top})`);

    const axis = d3
      .axisTop(x)
      .ticks(width / 160)
      .tickSizeOuter(0)
      .tickSizeInner(-barSize * (n + y.padding()));

    return (_, transition) => {
      g.transition(transition).call(axis);
      g.select(".tick:first-of-type text").remove();
      g.selectAll(".tick:not(:first-of-type) line").attr("stroke", "white");
      g.select(".domain").remove();
      g.select("text").attr("font-family", "Inter");
    };
  }
  function ticker(svg) {
    const now = svg
      .append("text")
      .attr("class", "date")
      .style("font-size", `${barSize}px`)
      .attr("text-anchor", "end")
      .attr("x", width - margin.right)
      .attr("y", margin.top + barSize * 0.5)
      .attr("dy", "0.32em")
      .text(formatDate(keyframes[0][0]));

    return ([date], transition) => {
      transition.end().then(() => now.text(formatDate(date)));
    };
  }

  const updateBars = bars(svg);
  const updateAxis = axis(svg);
  const updateTicker = ticker(svg);
  const updateLabels = labels(svg);

  return [
    keyframes,
    formatDate,
    Object.assign(svg.node(), {
      update(keyframe) {
        const transition = svg
          .transition()
          .duration(duration)
          .ease(d3.easeLinear);

        // Extract the max value from all bars.
        x.domain([0, d3.max(keyframe[1].map((d) => d.value[1]))]);

        updateAxis(keyframe, transition);
        updateBars(keyframe, transition);
        updateLabels(keyframe, transition);
        updateTicker(keyframe, transition);
      },
    }),
  ];
  for (const keyframe of keyframes) {
    await transition.end();
  }
}
function Scrubber(
  values,
  {
    format = (value) => value,
    initial = 0,
    delay = null,
    autoplay = true,
    loop = true,
    loopDelay = null,
    alternate = false,
  } = {}
) {
  values = Array.from(values);
  document.querySelector(".control").innerHTML = `<form
    style="font: 12px var(--sans-serif); font-variant-numeric: tabular-nums; display: flex; height: 33px; align-items: center;"
  >
    <button
      name="b"
      type="button"
      style="margin-right: 0.4em; width: 5em;"
    ></button>
    <label style="display: flex; align-items: center;">
      <input
        name="i"
        type="range"
        min="0"
        max=${values.length - 1}
        value=${initial}
        step="1"
        style="width: 600px;"
      />
      <output name="o" style="margin-left: 0.4em;"></output>
    </label>
  </form>`;
  const form = document.querySelector(".control form");
  let frame = null;
  let timer = null;
  let interval = null;
  let direction = 1;
  console.log("form", form);
  function start() {
    form.b.textContent = "⏸️";
    if (delay === null) frame = requestAnimationFrame(tick);
    else interval = setInterval(tick, delay);
  }
  function stop() {
    form.b.textContent = "▶️";
    if (frame !== null) cancelAnimationFrame(frame), (frame = null);
    if (timer !== null) clearTimeout(timer), (timer = null);
    if (interval !== null) clearInterval(interval), (interval = null);
  }
  function running() {
    return frame !== null || timer !== null || interval !== null;
  }
  function tick() {
    if (
      form.i.valueAsNumber ===
      (direction > 0 ? values.length - 1 : direction < 0 ? 0 : NaN)
    ) {
      if (!loop) return stop();
      if (alternate) direction = -direction;
      if (loopDelay !== null) {
        if (frame !== null) cancelAnimationFrame(frame), (frame = null);
        if (interval !== null) clearInterval(interval), (interval = null);
        timer = setTimeout(() => (step(), start()), loopDelay);
        return;
      }
    }
    if (delay === null) frame = requestAnimationFrame(tick);
    step();
  }
  function step() {
    form.i.valueAsNumber =
      (form.i.valueAsNumber + direction + values.length) % values.length;
    form.i.dispatchEvent(new CustomEvent("input", { bubbles: true }));
  }
  form.i.oninput = (event) => {
    if (event && event.isTrusted && running()) stop();
    form.value = values[form.i.valueAsNumber];
    form.o.value = format(form.value, form.i.valueAsNumber, values);
  };
  form.b.onclick = () => {
    if (running()) return stop();
    direction =
      alternate && form.i.valueAsNumber === values.length - 1 ? -1 : 1;
    form.i.valueAsNumber = (form.i.valueAsNumber + direction) % values.length;
    form.i.dispatchEvent(new CustomEvent("input", { bubbles: true }));
    start();
  };
  form.i.oninput();
  if (autoplay) start();
  else stop();
  return form;
}

async function main() {
  const [keyframes, formatDate, viz] = await getVisObject();
  let currentKeyframe;
  console.log("keyframes", keyframes);
  const form = Scrubber(keyframes, {
    format: ([date]) => formatDate(date),
    delay: duration,
    loop: false,
  });
  d3.select(form).on("input", (e) => {
    const keyframeIndex = e.target.value;
    currentKeyframe = keyframes[keyframeIndex];
    viz.update(currentKeyframe);
  });
}

window.addEventListener("DOMContentLoaded", main);

//
