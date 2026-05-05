const mongoose = require("mongoose");

const cartSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true
  },
  items: [
    {
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "product"
      },
      name: String,
      price: Number,
      quantity: Number,
      image: String
    }
  ]
});

module.exports = mongoose.model("Cart", cartSchema);