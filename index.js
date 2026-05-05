// ================= IMPORTS =================
const express = require("express");
require("dotenv").config();
require("./connection");

const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Razorpay = require("razorpay");
const crypto = require("crypto");

const Cart = require("./model/cart");
const Order = require("./model/order");
const userModel = require("./model/user");
const productModel = require("./model/product");

const app = express();

// ================= CORS FIX =================
app.use(cors({
  origin: true, // allow all (safe for now)
  credentials: true
}));

// ❌ REMOVE THIS (causes crash)
// app.options("*", cors());

// ================= MIDDLEWARE =================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ================= STATIC =================
const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

app.use("/uploads", express.static(uploadDir));

// ================= MULTER =================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});

const upload = multer({ storage });

// ================= RAZORPAY =================
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ================= ROUTES =================

// test
app.get("/", (req, res) => {
  res.send("Backend Running ✅");
});

// ================= USER =================
app.post("/signup", async (req, res) => {
  try {
    const user = new userModel(req.body);
    await user.save();
    res.json({ message: "User created" });
  } catch {
    res.status(500).json({ message: "Signup failed" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { Username, Password } = req.body;

    const user = await userModel.findOne({ Username });

    if (!user) {
      return res.status(404).json({ message: "Invalid username" });
    }

    if (user.Password !== Password) {
      return res.status(401).json({ message: "Invalid password" });
    }

    res.json(user);

  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

// ================= PRODUCTS =================
app.post("/addm", upload.array("images", 10), async (req, res) => {
  try {
    const BASE_URL = process.env.BASE_URL;

    const prices = req.body.prices;
    const stocks = req.body.stocks;

    const imageData = req.files.map((file, i) => ({
      url: `${BASE_URL}/uploads/${file.filename}`,
      price: Number(prices[i]) || 0,
      stock: Number(stocks[i]) || 0
    }));

    const product = new productModel({
      name: req.body.name,
      image: imageData
    });

    await product.save();

    res.json(product);

  } catch {
    res.status(500).json({ message: "Product error" });
  }
});

app.get("/products", async (req, res) => {
  try {
    const data = await productModel.find();
    res.json(data);
  } catch {
    res.status(500).json({ message: "Fetch error" });
  }
});

// ================= CART =================
app.post("/cart/add", async (req, res) => {
  try {
    const { userId, product } = req.body;

    let cart = await Cart.findOne({ userId });

    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    const existing = cart.items.find(
      i => i.productId.toString() === product.productId
    );

    if (existing) {
      existing.quantity += 1;
    } else {
      cart.items.push({ ...product, quantity: 1 });
    }

    await cart.save();
    res.json(cart);

  } catch {
    res.status(500).json({ message: "Cart error" });
  }
});

app.get("/cart/:userId", async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.params.userId });
    res.json(cart || { items: [] });
  } catch {
    res.status(500).json({ message: "Cart fetch error" });
  }
});

app.delete("/cart/remove/:userId/:productId", async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.params.userId });

    cart.items = cart.items.filter(
      i => i.productId.toString() !== req.params.productId
    );

    await cart.save();
    res.json(cart);

  } catch {
    res.status(500).json({ message: "Remove error" });
  }
});

// ================= PAYMENT =================
app.post("/payment/create-order", async (req, res) => {
  try {
    const { amount } = req.body;

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR"
    });

    res.json(order);

  } catch {
    res.status(500).json({ message: "Order creation failed" });
  }
});

app.post("/payment/verify", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      userId,
      products,
      amount
    } = req.body;

    const sign = razorpay_order_id + "|" + razorpay_payment_id;

    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign)
      .digest("hex");

    if (expected !== razorpay_signature) {
      return res.status(400).json({ success: false });
    }

    const order = new Order({
      userId,
      products,
      amount,
      razorpay_order_id,
      razorpay_payment_id,
      status: "Paid"
    });

    await order.save();

    res.json({ success: true });

  } catch {
    res.status(500).json({ message: "Verification failed" });
  }
});

// ================= SERVER =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});