const seasons = ["Winter", "Spring", "Summer", "Fall"];
const tooltip = d3.select("#tooltip");
const chart = d3.select("#india-chart");
const legend = d3.select("#india-legend");
const cityFilter = d3.select("#india-city-filter");

const margin = { top: 24, right: 20, bottom: 70, left: 70 };
let width = 1000;
let height = 460;
let innerWidth = width - margin.left - margin.right;
let innerHeight = height - margin.top - margin.bottom;

const normalizeSeason = (value) => {
  const key = String(value || "").trim().toLowerCase();
  if (key === "autumn" || key === "fall") return "Fall";
  if (key === "winter") return "Winter";
  if (key === "spring") return "Spring";
  if (key === "summer") return "Summer";
  return null;
};

const root = chart.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
const gridGroup = root.append("g").attr("class", "grid");
const xAxisGroup = root.append("g").attr("class", "axis").attr("transform", `translate(0,${innerHeight})`);
const yAxisGroup = root.append("g").attr("class", "axis");
const barsGroup = root.append("g");
const labelsGroup = root.append("g").attr("class", "labels");
const missingDataGroup = root.append("g").attr("class", "missing-data-labels");

const xAxisLabel = root
  .append("text")
  .attr("x", innerWidth / 2)
  .attr("y", innerHeight + 52)
  .attr("fill", "#f0f0f0")
  .attr("text-anchor", "middle")
  .text("Season");

const yAxisLabel = root
  .append("text")
  .attr("transform", "rotate(-90)")
  .attr("x", -innerHeight / 2)
  .attr("y", -50)
  .attr("fill", "#f0f0f0")
  .attr("text-anchor", "middle")
  .text("PM2.5 Concentration");

const updateDimensions = () => {
  const shell = chart.node().closest(".chart-shell");
  const shellWidth = Math.max(340, shell.clientWidth - 28);
  width = shellWidth;
  height = width < 520 ? 320 : width < 860 ? 380 : 460;
  innerWidth = width - margin.left - margin.right;
  innerHeight = height - margin.top - margin.bottom;

  chart.attr("viewBox", `0 0 ${width} ${height}`);
  root.attr("transform", `translate(${margin.left},${margin.top})`);
  xAxisGroup.attr("transform", `translate(0,${innerHeight})`);
  xAxisLabel.attr("x", innerWidth / 2).attr("y", innerHeight + 52);
  yAxisLabel.attr("x", -innerHeight / 2);
};

d3.csv("./india_air_quality_datapreprocessing_final.csv", d3.autoType).then((rows) => {
  const cleaned = rows
    .map((d) => ({
      city: String(d.city || "").trim(),
      season: normalizeSeason(d.season),
      pm25: +d.pm25,
      year: +d.year,
    }))
    .filter((d) => d.city && d.season && Number.isFinite(d.pm25) && Number.isFinite(d.year));

  const allCities = Array.from(new Set(cleaned.map((d) => d.city))).sort(d3.ascending);
  const gradientPalette = d3.range(Math.max(allCities.length, 1)).map((_, i) =>
    d3.interpolateRgb("#ff9933", "#2e8b57")(allCities.length <= 1 ? 0.5 : i / (allCities.length - 1))
  );
  const color = d3.scaleOrdinal().domain(allCities).range(gradientPalette);

  cityFilter
    .selectAll("option")
    .data(["All Cities", ...allCities])
    .join("option")
    .attr("value", (d) => d)
    .text((d) => d);

  let currentSelection = "All Cities";
  let selectedGroup = null;

  d3.select("body").on("click", (event) => {
    if (event.target.tagName !== "rect" && selectedGroup !== null) {
      selectedGroup = null;
      barsGroup.selectAll("rect").transition().duration(200).style("opacity", 1);
    }
  });

  const render = (selectedCity, isResize = false) => {
    currentSelection = selectedCity;
    updateDimensions();

    const activeCities = selectedCity === "All Cities" ? allCities : [selectedCity];
    let activeRows = cleaned;
    if (selectedCity !== "All Cities") activeRows = activeRows.filter((d) => d.city === selectedCity);

    const seasonCityValue = new Map(
      d3
        .rollups(
          activeRows,
          (group) => d3.mean(group, (d) => d.pm25),
          (d) => d.season,
          (d) => d.city
        )
        .flatMap(([season, cityValues]) =>
          cityValues.map(([city, value]) => [`${season}|||${city}`, value])
        )
    );

    const data = seasons.flatMap((season) =>
      activeCities.map((city) => ({
        key: `${season}-${city}`,
        season,
        city,
        value: seasonCityValue.has(`${season}|||${city}`) ? seasonCityValue.get(`${season}|||${city}`) : null,
      }))
    );
    const plottedData = data.filter((d) => d.value !== null);
    const seasonsWithNoData = seasons.filter((season) =>
      activeCities.every((city) => !seasonCityValue.has(`${season}|||${city}`))
    );

    const x0 = d3.scaleBand().domain(seasons).range([0, innerWidth]).padding(0.2);
    const x1 = d3.scaleBand().domain(activeCities).range([0, x0.bandwidth()]).padding(0.1);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(plottedData, (d) => d.value) * 1.1 || 1])
      .nice()
      .range([innerHeight, 0]);

    const axisDuration = isResize ? 0 : 450;
    const updateDuration = isResize ? 0 : 700;
    const enterDuration = isResize ? 0 : 1500;

    gridGroup
      .transition()
      .duration(axisDuration)
      .call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(""))
      .selection()
      .call((g) => g.select(".domain").remove());

    xAxisGroup.transition().duration(axisDuration).call(d3.axisBottom(x0));
    yAxisGroup.transition().duration(axisDuration).call(d3.axisLeft(y));

    barsGroup
      .selectAll("rect")
      .data(plottedData, (d) => d.key)
      .join(
        (enter) =>
          enter
            .append("rect")
            .attr("x", (d) => x0(d.season) + x1(d.city))
            .attr("y", y(0))
            .attr("width", x1.bandwidth())
            .attr("height", 0)
            .attr("fill", (d) => color(d.city))
            .on("mousemove", (event, d) => {
              tooltip
                .style("opacity", 1)
                .html(`City: ${d.city}<br/>Season: ${d.season}<br/>PM2.5: ${d.value.toFixed(2)}`)
                .style("left", `${event.clientX}px`)
                .style("top", `${event.clientY}px`);
            })
            .on("mouseleave", () => {
              tooltip.style("opacity", 0);
            })
            .on("click", (event, d) => {
              selectedGroup = selectedGroup === d.city ? null : d.city;
              barsGroup.selectAll("rect")
                .transition()
                .duration(200)
                .style("opacity", (b) => (selectedGroup === null || selectedGroup === b.city ? 1 : 0.3));
            })
            .call((enterBars) =>
              enterBars
                .transition()
                .duration(enterDuration)
                .ease(d3.easeCubicOut)
                .attr("y", (d) => y(d.value))
                .attr("height", (d) => innerHeight - y(d.value))
                .style("opacity", (d) => (selectedGroup === null || selectedGroup === d.city ? 1 : 0.3))
            ),
        (update) =>
          update.call((updateBars) =>
            updateBars
              .transition()
              .duration(updateDuration)
              .attr("x", (d) => x0(d.season) + x1(d.city))
              .attr("width", x1.bandwidth())
              .attr("y", (d) => y(d.value))
              .attr("height", (d) => innerHeight - y(d.value))
              .style("opacity", (d) => (selectedGroup === null || selectedGroup === d.city ? 1 : 0.3))
          ),
        (exit) =>
          exit.call((exitBars) =>
            exitBars
              .transition()
              .duration(400)
              .attr("y", y(0))
              .attr("height", 0)
              .style("opacity", 0)
              .remove()
          )
      );

    labelsGroup
      .selectAll("text")
      .data(plottedData, (d) => d.key)
      .join(
        (enter) =>
          enter
            .append("text")
            .attr("x", (d) => x0(d.season) + x1(d.city) + x1.bandwidth() / 2)
            .attr("y", y(0))
            .attr("fill", "#ffffff")
            .attr("stroke", "#111111")
            .attr("stroke-width", 0.8)
            .attr("paint-order", "stroke")
            .attr("text-anchor", "middle")
            .attr("font-size", "12px")
            .attr("font-weight", "700")
            .style("pointer-events", "none")
            .style("opacity", 0)
            .text((d) => (d.value > 0 ? d.value.toFixed(1) : ""))
            .call((enterText) =>
              enterText
                .transition()
                .duration(enterDuration)
                .ease(d3.easeCubicOut)
                .attr("y", (d) => y(d.value) - 6)
                .style("opacity", 1)
            ),
        (update) =>
          update.call((updateText) =>
            updateText
              .transition()
              .duration(updateDuration)
              .attr("x", (d) => x0(d.season) + x1(d.city) + x1.bandwidth() / 2)
              .attr("y", (d) => y(d.value) - 6)
              .attr("fill", "#ffffff")
              .attr("stroke", "#111111")
              .attr("stroke-width", 0.8)
              .attr("paint-order", "stroke")
              .style("opacity", 1)
              .text((d) => (d.value > 0 ? d.value.toFixed(1) : ""))
          ),
        (exit) =>
          exit.call((exitText) =>
            exitText
              .transition()
              .duration(400)
              .attr("y", y(0))
              .style("opacity", 0)
              .remove()
          )
      );

    missingDataGroup
      .selectAll("text")
      .data(seasonsWithNoData, (d) => d)
      .join(
        (enter) =>
          enter
            .append("text")
            .attr("x", (d) => x0(d) + x0.bandwidth() / 2)
            .attr("y", innerHeight * 0.45)
            .attr("text-anchor", "middle")
            .attr("fill", "#f5f5f5")
            .attr("stroke", "#111111")
            .attr("stroke-width", 0.5)
            .attr("paint-order", "stroke")
            .attr("font-size", "12px")
            .attr("font-weight", "700")
            .style("opacity", 0)
            .text("Not Available")
            .call((enterText) => enterText.transition().duration(350).style("opacity", 1)),
        (update) =>
          update
            .transition()
            .duration(updateDuration)
            .attr("x", (d) => x0(d) + x0.bandwidth() / 2)
            .attr("y", innerHeight * 0.45)
            .style("opacity", 1),
        (exit) => exit.transition().duration(250).style("opacity", 0).remove()
      );

    legend.html("");
    const legendItems = legend
      .selectAll("div")
      .data(activeCities)
      .enter()
      .append("div")
      .attr("class", "legend-item");

    legendItems
      .append("span")
      .attr("class", "legend-swatch")
      .style("background", (d) => color(d));

    legendItems.append("span").text((d) => d);
  };

  cityFilter.on("change", (event) => {
    selectedGroup = null;
    render(event.target.value);
  });

  window.addEventListener("resize", () => {
    render(currentSelection, true);
  });

  render("All Cities");
});
