const Tour = require("../models/tourModel")
const factory = require("./handlerFactory")

exports.getAllTours = factory.getAll(Tour)
exports.getSingleTour = factory.getOne(Tour)
exports.createTour = factory.createOne(Tour)
exports.updateTour = factory.updateOne(Tour)
exports.deleteTour = factory.deleteOne(Tour)

exports.getToursWithin = async (req, res, next) => {
  const { distance, latlng, unit } = req.params
  const [lat, lng] = latlng.split(",")

  const radius = unit === "mi" ? distance / 3963.2 : distance / 6378.1

  if (!lat || !lng) {
    return next(new AppError("Please provide latitude and longitude in the format lat,lng.", 400))
  }

  const tours = await Tour.find({
    startLocation: { $geoWithin: { $centerSphere: [[lng, lat], radius] } },
  })

  res.status(200).json({
    status: "success",
    results: tours.length,
    data: {
      tours,
    },
  })
}

exports.getDistances = async (req, res, next) => {
  const { latlng, unit } = req.params
  const [lat, lng] = latlng.split(",")

  const multiplier = unit === "mi" ? 0.000621371 : 0.001

  if (!lat || !lng) {
    return next(new AppError("Please provide latitude and longitude in the format lat,lng.", 400))
  }

  const distances = await Tour.aggregate([
    {
      $geoNear: {
        near: {
          type: "Point",
          coordinates: [parseFloat(lng), parseFloat(lat)],
        },
        distanceField: "distance",
        distanceMultiplier: multiplier,
      },
    },
    { $project: { distance: 1, name: 1 } },
  ])

  res.status(200).json({
    status: "success",
    data: {
      distances,
    },
  })
}

// Data aggregation
exports.getTourStats = async (req, res, next) => {
  const stats = await Tour.aggregate([
    {
      $group: {
        // _id: { $toUpper: "$difficulty" },
        _id: null,
        minPrice: { $min: "$price" },
        maxPrice: { $max: "$price" },
        toursCount: { $sum: 1 },
        totalRatings: { $sum: "$ratingsQuantity" },
        ratingsSum: { $sum: { $multiply: ["$ratingsAverage", "$ratingsQuantity"] } },
        avgPrice: { $avg: "$price" },
      },
    },
    {
      $addFields: {
        avgRating: { $divide: ["$ratingsSum", "$totalRatings"] },
      }
    },
    {
      $sort: { avgPrice: 1 },
    },
  ])

  res.status(200).json({
    status: "success",
    data: {
      stats,
    },
  })
}
