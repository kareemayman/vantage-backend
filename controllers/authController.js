const User = require("../models/userModel")
const jose = require("jose")
const AppError = require("../utils/appError")
const { sendResetEmail } = require("../utils/mailer")
const crypto = require("crypto")

const secret = new TextEncoder().encode(process.env.JWT_SECRET) // encode it for jose

exports.signUp = async (req, res) => {
  // Create the user using only the data we need
  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
  })

  const token = await new jose.SignJWT({ userId: newUser._id.toString() })
    .setProtectedHeader({ alg: "HS256" }) // declare the signing algo
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRES_IN)
    .sign(secret)

  res.cookie("jwt", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // Set to true in production
    maxAge: parseInt(process.env.JWT_COOKIE_EXPIRES_IN) * 60 * 60 * 1000, // Convert hours to milliseconds
  })

  res.status(201).json({
    status: "success",
    token,
    data: {
      _id: user._id,
      name: user.name,
      email: user.email,
      photo: user.photo,
      role: user.role,
    }
  })
}

exports.login = async (req, res, next) => {
  if (!req.body.email) return next(new AppError("Please enter your email", 401))
  if (!req.body.password) return next(new AppError("Please enter your password", 401))

  const user = await User.findOne({ email: req.body.email }).select("+password")
  if (!user || !(await user.comparePassword(req.body.password, user.password)))
    return next(new AppError("Invalid email or password", 401))

  const token = await new jose.SignJWT({ userId: user._id.toString() })
    .setProtectedHeader({ alg: "HS256" }) // declare the signing algo
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRES_IN)
    .sign(secret)

  res.cookie("jwt", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: parseInt(process.env.JWT_COOKIE_EXPIRES_IN) * 60 * 60 * 1000,
  })

  res.status(200).json({
    status: "success",
    token,
    data: {
      _id: user._id,
      name: user.name,
      email: user.email,
      photo: user.photo,
      role: user.role,
    }
  })
}

exports.protect = async (req, res, next) => {
  // Checking if token exists
  let token
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1]
  }
  if (!token)
    return next(new AppError("You're not logged in! Please log in to access this resource.", 401))

  // Token Verification
  let verifiedToken
  try {
    verifiedToken = await jose.jwtVerify(token, secret, {
      algorithms: ["HS256"],
    })
  } catch (err) {
    return next(new AppError("Invalid or expired token. Please log in again.", 401))
  }

  const { payload } = verifiedToken
  req.userId = payload.userId

  // Check if user still exists
  const currentUser = await User.findById(payload.userId)
  if (!currentUser) return next(new AppError("User no longer exists.", 401))

  // Check if password isn't changed
  if (currentUser.changedPasswordAfter(payload.iat))
    return next(new AppError("Password changed recently. Please log in again.", 401))

  req.user = currentUser
  next()
}

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError("You are not allowed to perform this action.", 403))
    }
    next()
  }
}

exports.forgotPassword = async (req, res, next) => {
  // Validate email exists
  if (!req.body || !req.body.email)
    return next(new AppError("Please provide an email address", 400))

  // Get user
  const user = await User.findOne({ email: req.body.email })
  if (!user) return next(new AppError("There's no user with that email address!", 404))

  // Generate random reset token
  const resetToken = user.createPasswordResetToken()
  await user.save({ validateBeforeSave: false }) // save the user with the reset token and expiration date

  // Send it to user's email
  const resetUrl = `${req.protocol}://${req.get("host")}/api/v1/users/resetPassword/${resetToken}`
  try {
    await sendResetEmail(user.email, resetUrl)
    res.status(200).json({
      status: "success",
      message: "Token sent to email!",
    })
  } catch (err) {
    user.passwordResetToken = undefined
    user.passwordResetExpires = undefined
    await user.save({ validateBeforeSave: false })
    return next(new AppError("Error sending email. Please try again later.", 500))
  }
}

exports.resetPassword = async (req, res, next) => {
  // Get token and validate it
  if (!req.params.token) return next(new AppError("Please provide a token", 400))

  // Get user based on the token
  const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex")
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  })

  if (!user) return next(new AppError("Token is invalid or has expired", 400))

  // Update password
  if (!req.body || !req.body.password || !req.body.passwordConfirm)
    return next(new AppError("Please provide a new password and confirm it", 400))

  user.password = req.body.password
  user.passwordConfirm = req.body.passwordConfirm
  user.passwordResetToken = undefined
  user.passwordResetExpires = undefined
  await user.save()

  // Log the user in, send JWT
  const token = await new jose.SignJWT({ userId: user._id.toString() })
    .setProtectedHeader({ alg: "HS256" }) // declare the signing algo
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRES_IN)
    .sign(secret)

  res.cookie("jwt", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: parseInt(process.env.JWT_COOKIE_EXPIRES_IN) * 60 * 60 * 1000,
  })

  res.status(200).json({
    status: "success",
    token,
  })
}

// Update password for logged in users
exports.updatePassword = async (req, res, next) => {
  if (!req.body || !req.body.currentPassword || !req.body.password || !req.body.passwordConfirm)
    return next(new AppError("Please provide current password, new password and confirm it", 400))

  // Get user from collection (with password)
  const user = await User.findById(req.userId).select("+password")

  if (!(await user.comparePassword(req.body.currentPassword, user.password)))
    return next(new AppError("Your current password is incorrect", 401))

  user.password = req.body.password
  user.passwordConfirm = req.body.passwordConfirm
  await user.save()

  const token = await new jose.SignJWT({ userId: user._id.toString() })
    .setProtectedHeader({ alg: "HS256" }) // declare the signing algo
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRES_IN)
    .sign(secret)

  res.cookie("jwt", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: parseInt(process.env.JWT_COOKIE_EXPIRES_IN) * 60 * 60 * 1000,
  })

  res.status(200).json({
    status: "success",
    token,
  })
}
