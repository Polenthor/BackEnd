const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    Username: String,
    Password: String,
    Re_enterpassword: String
});

module.exports = mongoose.model("User", userSchema);