const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);
require("./server.js");

const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;

// Set MONGODB_URI to your MongoDB Atlas connection string when ready.
const client = new MongoClient(process.env.MONGODB_URI || "mongodb://localhost:27017");

let db;

// MongoDB connection

async function connectDB() {
    await client.connect();
    db = client.db("restaurantDB");
    console.log("Connected to MongoDB!");
}

// Image upload folder

const uploadFolder = path.join(__dirname, "public", "uploads");

fs.mkdirSync(uploadFolder, { recursive: true });

// Image upload settings

const storage = multer.diskStorage({

    destination: function(req, file, cb) {
        cb(null, uploadFolder);
    },

    filename: function(req, file, cb) {

        const extension =
            path.extname(file.originalname).toLowerCase();

        const filename =
            Date.now() + "-" +
            Math.round(Math.random() * 1000000) +
            extension;

        cb(null, filename);
    }
});

const upload = multer({

    storage: storage,

    limits: {
        fileSize: 5 * 1024 * 1024
    },

    fileFilter: function(req, file, cb) {

        const extension =
            path.extname(file.originalname).toLowerCase();

        const allowedExtensions = [".png", ".jpg", ".jpeg"];
        const allowedTypes = ["image/png", "image/jpeg"];

        if (
            allowedExtensions.includes(extension) &&
            allowedTypes.includes(file.mimetype)
        ) {
            cb(null, true);
        } else {
            cb(new Error("Only PNG and JPG images are allowed."));
        }
    }
});

app.use(express.json());
app.use(express.static("public"));

// Remove an uploaded file when needed

function removeImage(file) {

    if (file && fs.existsSync(file)) {
        fs.unlinkSync(file);
    }
}

// Validate image content

function validImage(file) {

    if (!file) return true;

    const buffer = fs.readFileSync(file.path);

    const isPNG =
        buffer.length >= 8 &&
        buffer.subarray(0, 8).equals(
            Buffer.from("89504e470d0a1a0a", "hex")
        );

    const isJPG =
        buffer.length >= 3 &&
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff;

    const extension =
        path.extname(file.filename).toLowerCase();

    return (
        (extension === ".png" && isPNG) ||
        ([".jpg", ".jpeg"].includes(extension) && isJPG)
    );
}

// Validate restaurant fields

function validRestaurant(data) {

    const { name, cuisine, borough, rating } = data;

    const cuisines = [
        "American", "Chinese", "Italian",
        "Japanese", "Mexican", "Other"
    ];

    const boroughs = [
        "Bronx", "Brooklyn", "Manhattan",
        "Queens", "Staten Island"
    ];

    const ratingNumber = Number(rating);

    return (
        typeof name === "string" &&
        name.trim().length > 0 &&
        typeof cuisine === "string" &&
        cuisine.trim().length > 0 &&
        cuisine.length <= 100 &&
        boroughs.includes(borough) &&
        rating !== undefined &&
        rating !== "" &&
        Number.isFinite(ratingNumber) &&
        ratingNumber >= 0 &&
        ratingNumber <= 5 &&
        Number.isInteger(ratingNumber * 10)
    );
}

// Handle uploads and errors

function handleUpload(req, res, next) {

    upload.single("image")(req, res, function(error) {

        if (error) {
            return res.status(400).json({
                error: error.message
            });
        }

        next();
    });
}

// Get restaurant list with filters and pagination

app.get("/api/restaurants", async (req, res) => {
    try {
        const {
            name,
            borough,
            cuisine,
            grade,
            maxScore
        } = req.query;

        // Show 20 restaurants per page
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = 20;
        const skip = (page - 1) * limit;

        const matchStage = {};

        if (name) {
            const safeName = name.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
            );

            matchStage.name = {
                $regex: safeName,
                $options: "i"
            };
        }

        if (borough) {
            matchStage.borough = borough;
        }

        if (cuisine) {
            matchStage.cuisine = cuisine;
        }

        const pipeline = [];

        if (Object.keys(matchStage).length > 0) {
            pipeline.push({ $match: matchStage });
        }

        pipeline.push({
            $unwind: {
                path: "$grades",
                preserveNullAndEmptyArrays: true
            }
        });

        if (grade || (maxScore !== undefined && maxScore !== "")) {
            const gradeMatch = {};

            if (grade) {
                gradeMatch["grades.grade"] = grade;
            }

            if (maxScore !== undefined && maxScore !== "") {
                const score = Number(maxScore);

                if (!Number.isFinite(score)) {
                    return res.status(400).json({
                        error: "Invalid maximum score"
                    });
                }

                gradeMatch["grades.score"] = {
                    $lte: score
                };
            }

            pipeline.push({ $match: gradeMatch });
        }

        pipeline.push({
            $project: {
                name: 1,
                borough: 1,
                cuisine: 1,
                rating: 1,
                image: 1,
                grade: "$grades.grade",
                score: "$grades.score"
            }
        });

        pipeline.push({
            $sort: {
                name: 1,
                _id: 1
            }
        });

        const collection = db.collection("restaurants");

        // Count all matching records before pagination
        const countPipeline = [
            ...pipeline,
            { $count: "total" }
        ];

        const countResult = await collection
            .aggregate(countPipeline)
            .toArray();

        const total = countResult[0]?.total || 0;
        const totalPages = Math.ceil(total / limit);

        // Retrieve only the current page
        pipeline.push({ $skip: skip });
        pipeline.push({ $limit: limit });

        const restaurants = await collection
            .aggregate(pipeline)
            .toArray();

        res.json({
            restaurants,
            page,
            totalPages,
            total
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Unable to retrieve restaurants"
        });
    }
});

// Step 15: Borough grouping using MongoDB aggregation.
// One group per borough, with a count and a short preview of restaurants.
app.get("/api/restaurants/grouped-by-borough", async (req, res) => {
    try {
        const groups = await db.collection("restaurants").aggregate([
            { $match: { borough: { $in: ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"] } } },
            { $sort: { name: 1, _id: 1 } },
            { $group: {
                _id: "$borough",
                count: { $sum: 1 },
                restaurants: { $push: { _id: "$_id", name: "$name", rating: "$rating" } }
            } },
            { $project: {
                _id: 0,
                borough: "$_id",
                count: 1,
                restaurants: { $slice: ["$restaurants", 5] }
            } }
        ]).toArray();

        res.json(groups);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Unable to group restaurants" });
    }
});

// Best inspection performance: lower violation-based inspection scores are better.
// Group numeric inspection records by restaurant and sort by average ascending.
app.get("/api/restaurants/top-rated", async (req, res) => {
    try {
        const restaurants = await db.collection("restaurants").aggregate([
            { $unwind: "$grades" },
            { $match: { "grades.score": { $type: "number", $gte: 0 } } },
            { $group: {
                _id: "$_id",
                name: { $first: "$name" },
                cuisine: { $first: "$cuisine" },
                borough: { $first: "$borough" },
                averageScore: { $avg: "$grades.score" },
                inspectionCount: { $sum: 1 }
            } },
            { $sort: { averageScore: 1, inspectionCount: -1, name: 1 } },
            { $limit: 20 },
            { $project: {
                name: 1, cuisine: 1, borough: 1,
                averageScore: { $round: ["$averageScore", 1] },
                inspectionCount: 1
            } }
        ]).toArray();
        res.json(restaurants);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Unable to load inspection rankings" });
    }
});

// Explicit final-project demonstration: aggregated inspection averages strictly > 90.
// This is a numeric aggregation exercise, NOT a list of best-quality restaurants.
app.get("/api/restaurants/scores-over-90", async (req, res) => {
    try {
        const restaurants = await db.collection("restaurants").aggregate([
            { $unwind: "$grades" },
            { $match: { "grades.score": { $type: "number" } } },
            { $group: {
                _id: "$_id",
                name: { $first: "$name" },
                cuisine: { $first: "$cuisine" },
                borough: { $first: "$borough" },
                averageScore: { $avg: "$grades.score" },
                inspectionCount: { $sum: 1 }
            } },
            { $match: { averageScore: { $gt: 90 } } },
            { $sort: { averageScore: -1, name: 1 } },
            { $limit: 20 },
            { $project: {
                name: 1, cuisine: 1, borough: 1,
                averageScore: { $round: ["$averageScore", 1] },
                inspectionCount: 1
            } }
        ]).toArray();
        res.json(restaurants);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Unable to load scores-over-90 aggregation" });
    }
});

// Get one restaurant by ID (used by Edit)
app.get("/api/restaurants/:id", async (req, res) => {
    try {
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: "Invalid restaurant ID" });
        }

        const restaurant = await db.collection("restaurants").findOne({
            _id: new ObjectId(req.params.id)
        });

        if (!restaurant) {
            return res.status(404).json({ error: "Restaurant not found" });
        }

        res.json(restaurant);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Unable to load restaurant" });
    }
});

// Add restaurant

app.post("/api/restaurants", handleUpload, async (req, res) => {

    try {

        if (!validRestaurant(req.body)) {

            removeImage(req.file?.path);

            return res.status(400).json({
                error: "Please enter valid restaurant details."
            });
        }

        if (!validImage(req.file)) {

            removeImage(req.file.path);

            return res.status(400).json({
                error: "Please upload a valid PNG or JPG image."
            });
        }

        const restaurant = {
            name: req.body.name.trim(),
            cuisine: req.body.cuisine.trim(),
            borough: req.body.borough,
            rating: Number(req.body.rating),
            grades: [],
            image: req.file
                ? "/uploads/" + req.file.filename
                : null
        };

        await db.collection("restaurants").insertOne(restaurant);

        res.status(201).json({
            message: "Restaurant added successfully!"
        });

    } catch (error) {

        console.error(error);
        removeImage(req.file?.path);

        res.status(500).json({
            error: "Unable to save restaurant"
        });
    }
});

// Edit restaurant

app.put("/api/restaurants/:id", handleUpload, async (req, res) => {

    try {

        if (!ObjectId.isValid(req.params.id)) {

            removeImage(req.file?.path);

            return res.status(400).json({
                error: "Invalid restaurant ID"
            });
        }

        if (!validRestaurant(req.body)) {

            removeImage(req.file?.path);

            return res.status(400).json({
                error: "Please enter valid restaurant details."
            });
        }

        if (!validImage(req.file)) {

            removeImage(req.file.path);

            return res.status(400).json({
                error: "Please upload a valid PNG or JPG image."
            });
        }

        const collection = db.collection("restaurants");

        const restaurant = await collection.findOne({
            _id: new ObjectId(req.params.id)
        });

        if (!restaurant) {

            removeImage(req.file?.path);

            return res.status(404).json({
                error: "Restaurant not found"
            });
        }

        const updatedData = {
            name: req.body.name.trim(),
            cuisine: req.body.cuisine.trim(),
            borough: req.body.borough,
            rating: Number(req.body.rating)
        };

        // Only update image if a new one was uploaded

        if (req.file) {
            updatedData.image = "/uploads/" + req.file.filename;
        }

        await collection.updateOne(
            { _id: restaurant._id },
            { $set: updatedData }
        );

        // Remove old local image after successful replacement

        if (req.file && restaurant.image) {

            const oldFilename = path.basename(restaurant.image);

            const oldPath = path.join(uploadFolder, oldFilename);

            if (oldPath !== req.file.path) {
                removeImage(oldPath);
            }
        }

        res.json({
            message: "Restaurant updated successfully!"
        });

    } catch (error) {

        console.error(error);
        removeImage(req.file?.path);

        res.status(500).json({
            error: "Unable to update restaurant"
        });
    }
});


 // Delete restaurant

app.delete("/api/restaurants/:id", async (req, res) => {

    try {

        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                error: "Invalid restaurant ID"
            });
        }

        const collection = db.collection("restaurants");

        const restaurant = await collection.findOne({
            _id: new ObjectId(req.params.id)
        });

        if (!restaurant) {
            return res.status(404).json({
                error: "Restaurant not found"
            });
        }

        // Delete the restaurant from MongoDB
        await collection.deleteOne({
            _id: restaurant._id
        });

        // Delete its uploaded image if no other record uses it
        if (restaurant.image &&
            restaurant.image.startsWith("/uploads/")) {

            const otherRestaurant = await collection.findOne({
                image: restaurant.image
            });

            if (!otherRestaurant) {

                const imagePath = path.join(
                    uploadFolder,
                    path.basename(restaurant.image)
                );

                try {
                    removeImage(imagePath);
                } catch (imageError) {
                    console.error("Image cleanup failed:", imageError);
                }
            }
        }

        res.json({
            message: "Restaurant deleted successfully!"
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Unable to delete restaurant"
        });
    }
});


// Start server

connectDB()
    .then(() => {

        app.listen(PORT, () => {
            console.log(
                `Server running at http://localhost:${PORT}`
            );
        });

    })
    .catch(error => {
        console.error("MongoDB connection failed:", error);
    });
