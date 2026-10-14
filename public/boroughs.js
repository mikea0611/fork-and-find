// Step 15: display groups returned by the MongoDB $group endpoint.
const boroughOrder = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];
let boroughGroups = [];
let selectedBorough = "All";

function renderBoroughs() {
    const container = document.getElementById("boroughGroups");
    container.replaceChildren();

    const visible = boroughGroups.filter(group =>
        selectedBorough === "All" || group.borough === selectedBorough
    );

    visible.forEach(group => {
        const card = document.createElement("section");
        card.className = "borough-card";

        const heading = document.createElement("div");
        heading.className = "borough-card-heading";
        const title = document.createElement("h2");
        title.textContent = group.borough;
        const count = document.createElement("span");
        count.textContent = group.count.toLocaleString() + " restaurants";
        heading.append(title, count);
        card.appendChild(heading);

        if (group.restaurants.length) {
            const list = document.createElement("ul");
            group.restaurants.forEach(restaurant => {
                const item = document.createElement("li");
                const name = document.createElement("span");
                name.textContent = restaurant.name || "Unnamed restaurant";
                const rating = document.createElement("span");
                rating.className = "borough-rating";
                rating.textContent = restaurant.rating == null ? "—" : Number(restaurant.rating).toFixed(1);
                item.append(name, rating);
                list.appendChild(item);
            });
            card.appendChild(list);
        } else {
            const empty = document.createElement("p");
            empty.textContent = "No restaurants found.";
            card.appendChild(empty);
        }

        const link = document.createElement("a");
        link.className = "borough-view-all";
        link.href = "search.html?borough=" + encodeURIComponent(group.borough);
        link.textContent = "View all in " + group.borough + " →";
        card.appendChild(link);
        container.appendChild(card);
    });
}

async function loadBoroughs() {
    const status = document.getElementById("boroughStatus");
    try {
        const response = await fetch("/api/restaurants/grouped-by-borough");
        if (!response.ok) throw new Error("Unable to load borough groups");
        const data = await response.json();
        boroughGroups = boroughOrder.map(borough =>
            data.find(group => group.borough === borough) || { borough, count: 0, restaurants: [] }
        );
        status.textContent = "";
        renderBoroughs();
    } catch (error) {
        console.error(error);
        status.textContent = "Unable to load boroughs. Check that the server is running.";
    }
}

document.querySelectorAll("[data-borough]").forEach(button => {
    button.addEventListener("click", () => {
        selectedBorough = button.dataset.borough;
        document.querySelectorAll("[data-borough]").forEach(tab => {
            const active = tab === button;
            tab.classList.toggle("active", active);
            tab.setAttribute("aria-pressed", String(active));
        });
        renderBoroughs();
    });
});

loadBoroughs();
