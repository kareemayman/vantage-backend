// Updates only the text in the database: each tour's description and each review's text,
// copied from tours.json and reviews.json. It deletes nothing and changes no other field,
// so the Cloudinary images, ratings, users and your own test data stay as they are.
// Run it from the backend folder: node dev-data/data/importData2.js
const mongoose = require("mongoose")
const dotenv = require("dotenv")
dotenv.config({ path: "./config.env" })

const fs = require("fs")
const Tour = require("../../models/tourModel")
const Review = require("../../models/reviewModel")

const DB = process.env.DATABASE_CONNECTION_STRING.replace(
  "<DB_PASSWORD>",
  process.env.MONGODB_PASSWORD,
)

const tours = JSON.parse(fs.readFileSync("./dev-data/data/tours.json", "utf-8"))
const reviews = JSON.parse(fs.readFileSync("./dev-data/data/reviews.json", "utf-8"))

;(async () => {
  try {
    await mongoose.connect(DB)
    console.log("Connected to MongoDB Atlas")

    // bulkWrite sends many small updates in one trip to the database. Each one finds a
    // document by its _id, and $set changes only the field named inside it.
    const tourResult = await Tour.bulkWrite(
      tours.map((tour) => ({
        updateOne: {
          filter: { _id: tour._id },
          update: { $set: { description: tour.description } },
        },
      })),
    )
    console.log(`tours: ${tourResult.matchedCount} found, ${tourResult.modifiedCount} changed`)

    const reviewResult = await Review.bulkWrite(
      reviews.map((review) => ({
        updateOne: {
          filter: { _id: review._id },
          update: { $set: { review: review.review } },
        },
      })),
    )
    console.log(`reviews: ${reviewResult.matchedCount} found, ${reviewResult.modifiedCount} changed`)
  } catch (err) {
    console.log(err)
  }
  process.exit()
})()
