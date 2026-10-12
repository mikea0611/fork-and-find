
const form = document.getElementById("restaurantForm");
const saveButton = form.querySelector('button[type="submit"]');

// Check if we are editing an existing restaurant
const params = new URLSearchParams(window.location.search);
const restaurantId = params.get("id");

// Load existing restaurant details
async function loadRestaurant() {

    if (!restaurantId) return;

    // Change the page heading
    const heading = document.querySelector(".form-heading h2");

    if (heading) {
        heading.textContent = "Edit Restaurant";
    }

    document.title = "Edit Restaurant | Fork & Find";

    saveButton.disabled = true;

    try {

        const response = await fetch(
            `/api/restaurants/${restaurantId}`
        );

        if (!response.ok) {
            throw new Error("Unable to load restaurant.");
        }

        const restaurant = await response.json();

        // Fill in the existing information
        document.getElementById("restaurantName").value =
            restaurant.name || "";

        const cuisineSelect =
            document.getElementById("restaurantCuisine");

        // Support cuisines from the original database
        if (restaurant.cuisine &&
            !Array.from(cuisineSelect.options).some(
                option => option.value === restaurant.cuisine
            )) {

            const option = new Option(
                restaurant.cuisine,
                restaurant.cuisine
            );

            cuisineSelect.add(option);
        }

        cuisineSelect.value = restaurant.cuisine || "";

        document.getElementById("restaurantBorough").value =
            restaurant.borough || "";

        document.getElementById("restaurantRating").value =
            restaurant.rating ?? "";

        // Show the current restaurant image
        if (restaurant.image) {

            let imageContainer =
                document.getElementById("currentImage");

            // Create a container if it does not exist yet
            if (!imageContainer) {

                imageContainer = document.createElement("div");
                imageContainer.id = "currentImage";

                const uploadSection =
                    document.querySelector(".image-upload");

                const fileInput =
                    document.getElementById("restaurantImage");

                uploadSection.insertBefore(
                    imageContainer,
                    fileInput
                );
            }

            const preview = document.createElement("img");

            preview.src = restaurant.image;
            preview.alt = "Current restaurant image";

            preview.style.maxWidth = "100%";
            preview.style.maxHeight = "150px";
            preview.style.objectFit = "contain";
            preview.style.marginBottom = "15px";

            imageContainer.appendChild(preview);
        }

    } catch (error) {

        console.error(error);
        alert("Unable to load restaurant details.");

    } finally {

        saveButton.disabled = false;
    }
}

// Save restaurant
form.addEventListener("submit", async function(event) {

    event.preventDefault();

    const formData = new FormData();

    formData.append(
        "name",
        document.getElementById("restaurantName").value.trim()
    );

    formData.append(
        "cuisine",
        document.getElementById("restaurantCuisine").value
    );

    formData.append(
        "borough",
        document.getElementById("restaurantBorough").value
    );

    formData.append(
        "rating",
        document.getElementById("restaurantRating").value
    );

    const image =
        document.getElementById("restaurantImage").files[0];

    if (image) {
        formData.append("image", image);
    }

    // Choose POST for Add, PUT for Edit
    const url = restaurantId
        ? `/api/restaurants/${restaurantId}`
        : "/api/restaurants";

    const method = restaurantId ? "PUT" : "POST";

    saveButton.disabled = true;

    try {

        const response = await fetch(url, {
            method: method,
            body: formData
        });

        const result = await response.json();

        if (response.ok) {

            if (restaurantId) {
                alert("Restaurant updated successfully!");
            } else {
                alert("Restaurant added successfully!");
            }

            window.location.href = "index.html";

        } else {

            alert(result.error || "Unable to save restaurant.");

        }

    } catch (error) {

        console.error(error);
        alert("Could not connect to the server.");

    } finally {

        saveButton.disabled = false;
    }
});

// Automatically load details when editing
loadRestaurant();
