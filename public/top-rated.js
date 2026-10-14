// Display inspection rankings using MongoDB aggregation from the existing backend.
const statusEl = document.getElementById("topRatedStatus");
const resultsEl = document.getElementById("topRatedResults");

async function loadRankings() {
    statusEl.textContent = "Loading inspection results...";
    resultsEl.replaceChildren();
    try {
        const response = await fetch("/api/restaurants/top-rated");
        if (!response.ok) throw new Error("Server error");
        const restaurants = await response.json();
        if (!Array.isArray(restaurants)) throw new Error("Invalid response");
        if (!restaurants.length) {
            statusEl.textContent = "No restaurants with numeric inspection records were found in the connected database.";
            return;
        }
        const table = document.createElement("table");
        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");
        ["Rank", "Name", "Cuisine", "Borough", "Average Inspection Score", "Inspections"].forEach(label => {
            const th = document.createElement("th");
            th.textContent = label;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        const tbody = document.createElement("tbody");
        restaurants.forEach((restaurant, index) => {
            const tr = document.createElement("tr");
            [index + 1, restaurant.name, restaurant.cuisine, restaurant.borough,
                Number(restaurant.averageScore).toFixed(1), restaurant.inspectionCount].forEach(value => {
                const td = document.createElement("td");
                td.textContent = value ?? "—";
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        table.append(thead, tbody);
        resultsEl.appendChild(table);
        statusEl.textContent = `Showing ${restaurants.length} restaurant${restaurants.length === 1 ? "" : "s"}.`;
    } catch (error) {
        statusEl.textContent = "Unable to load results. Check the server and MongoDB connection.";
        console.error(error);
    }
}
loadRankings();
