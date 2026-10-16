const dns = require("node:dns");
const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const multer = require("multer");
const { put, del } = require("@vercel/blob");
const path = require("path");
const fs = require("fs");

// DNS settings for local MongoDB Atlas connection
if (!process.env.VERCEL) {
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
}

const app = express();
const PORT = process.env.PORT || 3000;

const mongoURI =
  process.env.MONGODB_URI || "mongodb://localhost:27017";

const client = new MongoClient(mongoURI);

let db;
let connectionPromise;

// Connect to MongoDB Atlas
async function connectDB() {
  if (db) return db;

  if (!connectionPromise) {
    connectionPromise = client.connect()
      .then(() => {
        db = client.db("restaurantDB");
        console.log("Connected to MongoDB!");
        return db;
      })
      .catch((error) => {
        connectionPromise = null;
        throw error;
      });
  }

  return connectionPromise;
}

// Ensure database connection for API requests
app.use("/api", async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    res.status(500).json({
      error: "Database connection failed"
    });
  }
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Upload images to memory instead of local disk
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 4 * 1024 * 1024
  },
  fileFilter(req, file, cb) {
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

// Handle upload errors
function handleUpload(req, res, next) {
  upload.single("image")(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        error: error.message
      });
    }

    next();
  });
}

// Validate actual image content
function validImage(file) {
  if (!file) return true;

  const buffer = file.buffer;

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
    path.extname(file.originalname).toLowerCase();

  return (
    (extension === ".png" && isPNG) ||
    ([".jpg", ".jpeg"].includes(extension) && isJPG)
  );
}

// Upload an image to Vercel Blob
async function uploadImage(file) {
  if (!file) return null;

  const extension =
    path.extname(file.originalname).toLowerCase();

  const filename =
    "restaurants/" +
    Date.now() + "-" +
    Math.round(Math.random() * 1000000) +
    extension;

  const blob = await put(filename, file.buffer, {
    access: "public",
    contentType: file.mimetype,
    addRandomSuffix: true
  });

  return blob.url;
}

// Delete an image stored in Vercel Blob
async function removeBlobImage(imageURL) {
  if (!imageURL || typeof imageURL !== "string") {
    return;
  }

  // Do not attempt to delete legacy local images
  if (!imageURL.startsWith("https://")) {
    return;
  }

  try {
    const parsedURL = new URL(imageURL);

    if (!parsedURL.hostname.endsWith(".public.blob.vercel-storage.com")) {
      return;
    }

    await del(imageURL);
  } catch (error) {
    console.error("Image cleanup failed:", error);
  }
}

// Validate restaurant fields
function validRestaurant(data) {
  const { name, cuisine, borough, rating } = data;

  const boroughs = [
    "Bronx",
    "Brooklyn",
    "Manhattan",
    "Queens",
    "Staten Island"
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

// Escape special regex characters
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// GET restaurants with search, filters, and pagination
app.get("/api/restaurants", async (req, res) => {
  try {
    const {
      name,
      borough,
      cuisine,
      grade,
      maxScore
    } = req.query;

    const page = Math.max(
      1,
      parseInt(req.query.page, 10) || 1
    );

    const limit = 20;
    const skip = (page - 1) * limit;

    const matchStage = {};

    if (name) {
      matchStage.name = {
        $regex: escapeRegex(name),
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

    if (
      grade ||
      (maxScore !== undefined && maxScore !== "")
    ) {
      const gradeMatch = {};

      if (grade) {
        gradeMatch["grades.grade"] = grade;
      }

      if (
        maxScore !== undefined &&
        maxScore !== ""
      ) {
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

    const countResult = await collection.aggregate([
      ...pipeline,
      { $count: "total" }
    ]).toArray();

    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);

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

// Group restaurants by borough
app.get(
  "/api/restaurants/grouped-by-borough",
  async (req, res) => {
    try {
      const groups = await db.collection("restaurants")
        .aggregate([
          {
            $match: {
              borough: {
                $in: [
                  "Manhattan",
                  "Brooklyn",
                  "Queens",
                  "Bronx",
                  "Staten Island"
                ]
              }
            }
          },
          { $sort: { name: 1, _id: 1 } },
          {
            $group: {
              _id: "$borough",
              count: { $sum: 1 },
              restaurants: {
                $push: {
                  _id: "$_id",
                  name: "$name",
                  rating: "$rating"
                }
              }
            }
          },
          {
            $project: {
              _id: 0,
              borough: "$_id",
              count: 1,
              restaurants: {
                $slice: ["$restaurants", 5]
              }
            }
          }
        ])
        .toArray();

      res.json(groups);

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: "Unable to group restaurants"
      });
    }
  }
);

// Top-rated restaurants based on inspection scores
app.get("/api/restaurants/top-rated", async (req, res) => {
  try {
    const restaurants = await db.collection("restaurants")
      .aggregate([
        { $unwind: "$grades" },
        {
          $match: {
            "grades.score": {
              $type: "number",
              $gte: 0
            }
          }
        },
        {
          $group: {
            _id: "$_id",
            name: { $first: "$name" },
            cuisine: { $first: "$cuisine" },
            borough: { $first: "$borough" },
            averageScore: {
              $avg: "$grades.score"
            },
            inspectionCount: { $sum: 1 }
          }
        },
        {
          $sort: {
            averageScore: 1,
            inspectionCount: -1,
            name: 1
          }
        },
        { $limit: 20 },
        {
          $project: {
            name: 1,
            cuisine: 1,
            borough: 1,
            averageScore: {
              $round: ["$averageScore", 1]
            },
            inspectionCount: 1
          }
        }
      ])
      .toArray();

    res.json(restaurants);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Unable to load inspection rankings"
    });
  }
});

// Aggregation: average inspection scores over 90
app.get(
  "/api/restaurants/scores-over-90",
  async (req, res) => {
    try {
      const restaurants = await db.collection("restaurants")
        .aggregate([
          { $unwind: "$grades" },
          {
            $match: {
              "grades.score": {
                $type: "number"
              }
            }
          },
          {
            $group: {
              _id: "$_id",
              name: { $first: "$name" },
              cuisine: { $first: "$cuisine" },
              borough: { $first: "$borough" },
              averageScore: {
                $avg: "$grades.score"
              },
              inspectionCount: { $sum: 1 }
            }
          },
          {
            $match: {
              averageScore: { $gt: 90 }
            }
          },
          {
            $sort: {
              averageScore: -1,
              name: 1
            }
          },
          { $limit: 20 },
          {
            $project: {
              name: 1,
              cuisine: 1,
              borough: 1,
              averageScore: {
                $round: ["$averageScore", 1]
              },
              inspectionCount: 1
            }
          }
        ])
        .toArray();

      res.json(restaurants);

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: "Unable to load scores-over-90 aggregation"
      });
    }
  }
);

// Get one restaurant by ID
app.get("/api/restaurants/:id", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        error: "Invalid restaurant ID"
      });
    }

    const restaurant = await db.collection("restaurants")
      .findOne({
        _id: new ObjectId(req.params.id)
      });

    if (!restaurant) {
      return res.status(404).json({
        error: "Restaurant not found"
      });
    }

    res.json(restaurant);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Unable to load restaurant"
    });
  }
});

// Add restaurant
app.post(
  "/api/restaurants",
  handleUpload,
  async (req, res) => {
    let uploadedImage = null;

    try {
      if (!validRestaurant(req.body)) {
        return res.status(400).json({
          error: "Please enter valid restaurant details."
        });
      }

      if (!validImage(req.file)) {
        return res.status(400).json({
          error: "Please upload a valid PNG or JPG image."
        });
      }

      if (req.file) {
        uploadedImage = await uploadImage(req.file);
      }

      const restaurant = {
        name: req.body.name.trim(),
        cuisine: req.body.cuisine.trim(),
        borough: req.body.borough,
        rating: Number(req.body.rating),
        grades: [],
        image: uploadedImage
      };

      await db.collection("restaurants")
        .insertOne(restaurant);

      res.status(201).json({
        message: "Restaurant added successfully!"
      });

    } catch (error) {
      console.error(error);

      if (uploadedImage) {
        await removeBlobImage(uploadedImage);
      }

      res.status(500).json({
        error: "Unable to save restaurant"
      });
    }
  }
);

// Edit restaurant
app.put(
  "/api/restaurants/:id",
  handleUpload,
  async (req, res) => {
    let uploadedImage = null;

    try {
      if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          error: "Invalid restaurant ID"
        });
      }

      if (!validRestaurant(req.body)) {
        return res.status(400).json({
          error: "Please enter valid restaurant details."
        });
      }

      if (!validImage(req.file)) {
        return res.status(400).json({
          error: "Please upload a valid PNG or JPG image."
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

      const updatedData = {
        name: req.body.name.trim(),
        cuisine: req.body.cuisine.trim(),
        borough: req.body.borough,
        rating: Number(req.body.rating)
      };

      if (req.file) {
        uploadedImage = await uploadImage(req.file);
        updatedData.image = uploadedImage;
      }

      await collection.updateOne(
        { _id: restaurant._id },
        { $set: updatedData }
      );

      // Remove old image after successful update
      if (uploadedImage && restaurant.image) {
        const otherRestaurant = await collection.findOne({
          image: restaurant.image
        });

        if (!otherRestaurant) {
          await removeBlobImage(restaurant.image);
        }
      }

      res.json({
        message: "Restaurant updated successfully!"
      });

    } catch (error) {
      console.error(error);

      if (uploadedImage) {
        await removeBlobImage(uploadedImage);
      }

      res.status(500).json({
        error: "Unable to update restaurant"
      });
    }
  }
);

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

    await collection.deleteOne({
      _id: restaurant._id
    });

    // Remove image only when no other restaurant uses it
    if (restaurant.image) {
      const otherRestaurant = await collection.findOne({
        image: restaurant.image
      });

      if (!otherRestaurant) {
        await removeBlobImage(restaurant.image);
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

// Start locally, export Express app for Vercel
if (!process.env.VERCEL) {
  connectDB()
    .then(() => {
      app.listen(PORT, () => {
        console.log(
          `Server running at http://localhost:${PORT}`
        );
      });
    })
    .catch((error) => {
      console.error("MongoDB connection failed:", error);
      process.exitCode = 1;
    });
}

module.exports = app;
module.exports.default = app;
