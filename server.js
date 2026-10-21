const mongoose = require("mongoose")
const dotenv = require("dotenv")

// handle uncaught exceptions (sync code bugs)
process.on("uncaughtException", (err) => {
  console.log(err.name, err.message)
  process.exit(1) // code 1 for uncalled exception
})

dotenv.config({ path: "./config.env" })
const app = require("./app")

const DB = process.env.DATABASE_CONNECTION_STRING.replace(
  "<DB_PASSWORD>",
  process.env.MONGODB_PASSWORD,
)

mongoose.connect(DB).then((con) => console.log("Connected to MongoDB Atlas"))

const server = app.listen(process.env.PORT || 3001, () => {
  console.log("Backend server is running on port 3001")
})

process.on("unhandledRejection", (err) => {
  console.log(err.name, err.message)
  // shut the server gracefully first then end the application
  server.close(() => {
    process.exit(1) // code 1 for uncalled exception
  })
})
