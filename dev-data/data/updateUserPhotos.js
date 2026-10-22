// Updates only each user's photo in the database, copied from users.json. The photos are
// Cloudinary public IDs (jonas-schmedtmann, kareem, ...), so upload the images first.
// It deletes nothing and changes no other field, so passwords, roles and your own test
// accounts stay as they are.
// Run it from the backend folder: node dev-data/data/updateUserPhotos.js
const mongoose = require("mongoose")
const dotenv = require("dotenv")
dotenv.config({ path: "./config.env" })

const fs = require("fs")
const User = require("../../models/userModel")

const DB = process.env.DATABASE_CONNECTION_STRING.replace(
  "<DB_PASSWORD>",
  process.env.MONGODB_PASSWORD,
)

const users = JSON.parse(fs.readFileSync("./dev-data/data/users.json", "utf-8"))

;(async () => {
  try {
    await mongoose.connect(DB)
    console.log("Connected to MongoDB Atlas")

    // Each user is found by email rather than _id, because the _id of your own entry in
    // users.json isn't a valid ObjectId, so it can't match your account in the database.
    const result = await User.bulkWrite(
      users.map((user) => ({
        updateOne: {
          filter: { email: user.email },
          update: { $set: { photo: user.photo } },
        },
      })),
    )
    console.log(`users: ${result.matchedCount} of ${users.length} found, ${result.modifiedCount} changed`)
  } catch (err) {
    console.log(err)
  }
  process.exit()
})()
