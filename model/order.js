// model/order.js
const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  userId: String,
  products: Array,
  amount: Number,
  razorpay_order_id: String,
  razorpay_payment_id: String,
  status: String
});

module.exports = mongoose.model("Order", orderSchema);