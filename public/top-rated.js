// Step 16: show the results of the top-rated aggregation.
async function loadTopRated() {
    const status = document.getElementById("topRatedStatus");
    const results = document.getElementById("topRatedResults");

    try {
        const response = await fetch("/api/restaurants/top-rated");
        if (!response.ok) throw new Error("Unable to load inspection rankings");
        const restaurants = await response.json();
        if (!Array.isArray(restaurants)) throw new Error("Invalid restaurant data");

        if (restaurants.length === 0) {
            status.textContent = "No restaurants with inspection scores were found.";
            return;
        }

        const table = document.createElement("table");
        table.innerHTML = `<thead><tr><th>Rank</th><th>Name</th><th>Cuisine</th><th>Borough</th><th>Average Inspection Score</th></tr></thead><tbody></tbody>`;
        const tbody = table.querySelector("tbody");

        restaurants.forEach((restaurant, index) => {
            const row = document.createElement("tr");
            [index + 1, restaurant.name, restaurant.cuisine, restaurant.borough,
                Number(restaurant.averageScore).toFixed(1)].forEach(value => {
                const cell = document.createElement("td");
                cell.textContent = value ?? "—";
                row.appendChild(cell);
            });
            tbody.appendChild(row);
        });

        results.appendChild(table);
        status.textContent = `Showing ${restaurants.length} restaurant${restaurants.length === 1 ? "" : "s"} ranked by inspection score.`;
    } catch (error) {
        console.error(error);
        status.textContent = "Unable to load inspection rankings. Check that the server is running.";
    }
}

loadTopRated();
