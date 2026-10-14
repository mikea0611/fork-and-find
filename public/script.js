
let currentPage = 1;
let totalPages = 1;
let restaurantToDelete = null;

async function loadRestaurants() {
    const params = new URLSearchParams();

    const filters = {
        name: document.getElementById("searchName")?.value.trim() || "",
        cuisine: document.getElementById("cuisine")?.value || "",
        borough: document.getElementById("borough")?.value || "",
        grade: document.getElementById("grade")?.value || "",
        maxScore: document.getElementById("maxScore")?.value || ""
    };

    for (const key in filters) {
        if (filters[key]) {
            params.append(key, filters[key]);
        }
    }

    params.append("page", currentPage);

    const results = document.getElementById("results");
    const pagination = document.getElementById("pagination");

    results.textContent = "Loading restaurants...";
    if (pagination) pagination.hidden = true;

    try {
        const response = await fetch("/api/restaurants?" + params);

        if (!response.ok) {
            throw new Error("Unable to load restaurants");
        }

        const data = await response.json();

        // Support both the original API and paginated API
        const restaurants = Array.isArray(data)
            ? data
            : data.restaurants;

        if (!Array.isArray(restaurants)) {
            throw new Error("Invalid restaurant data");
        }

        totalPages = Array.isArray(data)
            ? 1
            : (data.totalPages || 1);

        // If the last restaurant on a page was deleted, go back one page.
        if (currentPage > totalPages) {
            currentPage = totalPages;
            return loadRestaurants();
        }

        results.innerHTML = "";

        if (restaurants.length === 0) {
            results.textContent = "No restaurants found.";
        } else {
            const table = document.createElement("table");

            table.innerHTML = `
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Cuisine</th>
                        <th>Borough</th>
                        <th>Rating</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody></tbody>
            `;

            const tbody = table.querySelector("tbody");

            restaurants.forEach(restaurant => {
                const row = document.createElement("tr");

                [
                    restaurant.name,
                    restaurant.cuisine,
                    restaurant.borough,
                    restaurant.rating ?? "—"
                ].forEach(value => {
                    const cell = document.createElement("td");
                    cell.textContent = value ?? "—";
                    row.appendChild(cell);
                });

                const actions = document.createElement("td");
                actions.className = "restaurant-actions";

                const edit = document.createElement("a");
                edit.textContent = "Edit";
                edit.href = "add-restaurant.html?id=" +
                    encodeURIComponent(restaurant._id);

                const remove = document.createElement("button");
                remove.type = "button";
                remove.textContent = "Delete";
                remove.onclick = () => {
                    confirmDelete(restaurant._id, restaurant.name);
                };

                actions.append(edit, remove);
                row.appendChild(actions);
                tbody.appendChild(row);
            });

            results.appendChild(table);
        }

        if (pagination) {
            pagination.hidden = totalPages <= 1;

            document.getElementById("pageInfo").textContent =
                `Page ${currentPage} of ${totalPages}`;

            document.getElementById("previousPage").disabled =
                currentPage === 1;

            document.getElementById("nextPage").disabled =
                currentPage >= totalPages;
        }

    } catch (error) {
        console.error(error);
        results.textContent = "Unable to load restaurants.";
    }
}

let hasSearched = false;
function searchRestaurants() {
    hasSearched = true;
    currentPage = 1;
    loadRestaurants();
}

function changePage(direction) {
    const next = currentPage + direction;

    if (next < 1 || next > totalPages) return;

    currentPage = next;
    loadRestaurants();
}

function confirmDelete(id, name) {
    restaurantToDelete = id;

    document.getElementById("deleteRestaurantName").textContent = name;
    document.getElementById("deleteModal").style.display = "flex";
}

function cancelDelete() {
    restaurantToDelete = null;
    document.getElementById("deleteModal").style.display = "none";
}

async function deleteRestaurant() {
    if (!restaurantToDelete) return;

    const button = document.getElementById("confirmDeleteButton");
    button.disabled = true;

    try {
        const response = await fetch(
            "/api/restaurants/" + restaurantToDelete,
            { method: "DELETE" }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Delete failed");
        }

        cancelDelete();
        alert("Restaurant deleted successfully!");
        loadRestaurants();

    } catch (error) {
        alert(error.message);
    } finally {
        button.disabled = false;
    }
}

// When arriving from the Borough Grouping page, apply its borough filter.
const selectedFromLink = new URLSearchParams(window.location.search).get("borough");
if (selectedFromLink) {
    const boroughFilter = document.getElementById("borough");
    if (boroughFilter && [...boroughFilter.options].some(option => option.value === selectedFromLink)) {
        boroughFilter.value = selectedFromLink;
    }
}

// Browsing lists records immediately; searching waits for a submitted query.
if (window.location.pathname.endsWith('/search.html')) {
    document.getElementById('results').textContent = 'Enter a restaurant name or choose filters, then select Search.';
    document.getElementById('pagination').hidden = true;
    if (selectedFromLink) searchRestaurants();
} else {
    loadRestaurants();
}
